import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import AppTextInput from './AppTextInput';
import ClayIconButton from './ClayIconButton';
import { ADMIN_THEME } from '../constants/adminTheme';
import {
  ADMIN_SEARCH_SUGGESTIONS,
  buildAdminSearchIndex,
  scoreAdminSearchEntry,
  type AdminSearchEntry,
} from '../constants/adminSearchIndex';
import { usePermissions } from '../hooks/usePermissions';
import { useTheme } from '../hooks/useTheme';
import { StudentService } from '../services/studentService';
import { StaffService, type Staff } from '../services/staffService';
import type { Student } from '../types/models';
import * as Haptics from '../utils/haptics';

const isWeb = Platform.OS === 'web';
const RECENT_KEY = 'admin_app_search_recent_v1';
const MAX_RECENTS = 6;
const DEBOUNCE_MS = 280;

type LiveStudentHit = {
  kind: 'student';
  id: string;
  title: string;
  subtitle: string;
  route: string;
  params: Record<string, string>;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

type LiveStaffHit = {
  kind: 'staff';
  id: string;
  title: string;
  subtitle: string;
  route: string;
  params: Record<string, string>;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

type SearchHit =
  | (AdminSearchEntry & { kind: 'page' | 'action'; score?: number })
  | LiveStudentHit
  | LiveStaffHit;

type AdminAppSearchContextValue = {
  enabled: boolean;
  open: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
};

const AdminAppSearchContext = createContext<AdminAppSearchContextValue>({
  enabled: false,
  open: false,
  openSearch: () => {},
  closeSearch: () => {},
  toggleSearch: () => {},
});

export function useAdminAppSearch() {
  return useContext(AdminAppSearchContext);
}

function readRecents(): string[] {
  if (!isWeb || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

function writeRecents(items: string[]) {
  if (!isWeb || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENTS)));
  } catch {
    /* ignore quota */
  }
}

function studentLabel(s: Student): string {
  return (
    s.display_name?.trim() ||
    [s.first_name, s.last_name].filter(Boolean).join(' ').trim() ||
    s.admission_no ||
    'Student'
  );
}

function staffLabel(s: Staff): string {
  return (
    s.display_name?.trim() ||
    [s.first_name, s.last_name].filter(Boolean).join(' ').trim() ||
    s.staff_code ||
    'Staff'
  );
}

/**
 * In-app search for the admin portal on web and mobile.
 * Mount once under the admin layout; open via header or Cmd/Ctrl+K.
 */
export function AdminAppSearchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const openSearch = useCallback(() => {
    setOpen(true);
  }, []);
  const closeSearch = useCallback(() => setOpen(false), []);
  const toggleSearch = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  const value = useMemo(
    () => ({ enabled: true as const, open, openSearch, closeSearch, toggleSearch }),
    [open, openSearch, closeSearch, toggleSearch],
  );

  // Global keyboard shortcut — web only
  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key?.toLowerCase();
      const meta = e.metaKey || e.ctrlKey;
      if (meta && key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (key === 'escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <AdminAppSearchContext.Provider value={value}>
      {children}
      <AdminAppSearchModal />
    </AdminAppSearchContext.Provider>
  );
}

function AdminAppSearchModal() {
  const { open, closeSearch } = useAdminAppSearch();
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const { hasPermission } = usePermissions();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const inputRef = useRef<any>(null);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<string[]>(() => readRecents());
  const [liveStudents, setLiveStudents] = useState<LiveStudentHit[]>([]);
  const [liveStaff, setLiveStaff] = useState<LiveStaffHit[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);

  const catalogue = useMemo(() => {
    return buildAdminSearchIndex(t).filter(
      (item) => !item.permission || hasPermission(item.permission),
    );
  }, [t, hasPermission]);

  const pageHits = useMemo(() => {
    const q = query.trim();
    if (!q) return [] as (AdminSearchEntry & { score: number })[];
    return catalogue
      .map((entry) => ({ ...entry, score: scoreAdminSearchEntry(entry, q) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, 10);
  }, [catalogue, query]);

  // Debounced live student + staff lookup
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setLiveStudents([]);
      setLiveStaff([]);
      setLiveLoading(false);
      return;
    }

    let cancelled = false;
    setLiveLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [students, staff] = await Promise.all([
          StudentService.search(q, 5).catch(() => [] as Student[]),
          StaffService.getAll({ search: q, limit: 5 }).catch(() => [] as Staff[]),
        ]);
        if (cancelled) return;

        setLiveStudents(
          students.slice(0, 5).map((s) => {
            const enrollment = s.current_enrollment;
            const classLabel = enrollment
              ? [enrollment.class_name || enrollment.class_code, enrollment.section_name]
                  .filter(Boolean)
                  .join(' ')
              : '';
            return {
              kind: 'student' as const,
              id: `student-${s.id}`,
              title: studentLabel(s),
              subtitle: [s.admission_no, classLabel].filter(Boolean).join(' · ') || 'Student',
              route: '/admin/addStudent',
              params: { id: String(s.id) },
              icon: 'school-outline' as const,
            };
          }),
        );

        setLiveStaff(
          staff.slice(0, 5).map((s) => ({
            kind: 'staff' as const,
            id: `staff-${s.id}`,
            title: staffLabel(s),
            subtitle:
              [s.staff_code, s.designation || s.designation_name].filter(Boolean).join(' · ') ||
              'Staff',
            route: '/admin/addStaff',
            params: { id: String(s.id) },
            icon: 'person-outline' as const,
          })),
        );
      } finally {
        if (!cancelled) setLiveLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const hits: SearchHit[] = useMemo(() => {
    if (!query.trim()) return [];
    return [...pageHits, ...liveStudents, ...liveStaff];
  }, [pageHits, liveStudents, liveStaff, query]);

  // Reset when closed / opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setLiveStudents([]);
      setLiveStaff([]);
      setRecents(readRecents());
      const t = setTimeout(() => inputRef.current?.focus?.(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, hits.length]);

  const remember = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecents((prev) => {
      const next = [trimmed, ...prev.filter((x) => x.toLowerCase() !== trimmed.toLowerCase())].slice(
        0,
        MAX_RECENTS,
      );
      writeRecents(next);
      return next;
    });
  }, []);

  const navigateTo = useCallback(
    (hit: SearchHit) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      remember(query.trim() || hit.title);
      closeSearch();
      const params = 'params' in hit ? hit.params : undefined;
      if (params && Object.keys(params).length) {
        router.push({ pathname: hit.route as any, params } as any);
      } else {
        router.push(hit.route as any);
      }
    },
    [closeSearch, query, remember, router],
  );

  const applySuggestion = useCallback((term: string) => {
    setQuery(term);
  }, []);

  // Arrow / Enter while modal open
  useEffect(() => {
    if (!open || !isWeb || typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        if (hits[activeIndex]) {
          e.preventDefault();
          navigateTo(hits[activeIndex]);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, hits, activeIndex, navigateTo]);

  const surface = isDark ? '#151A24' : '#FFFFFF';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  const muted = isDark ? '#94A3B8' : '#64748B';
  const text = isDark ? '#F8FAFC' : '#0F172A';
  const soft = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(102,89,144,0.06)';
  const activeBg = isDark ? 'rgba(102,89,144,0.28)' : 'rgba(102,89,144,0.12)';
  const accent = ADMIN_THEME.colors.primary;
  const panelWidth = Math.min(560, Math.max(0, windowWidth - 32));

  const showEmptyState = !query.trim();
  const showNoResults = !!query.trim() && !liveLoading && hits.length === 0;

  const modKey = Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl';

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={closeSearch}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={closeSearch}>
        <Animated.View entering={FadeIn.duration(120)} style={StyleSheet.absoluteFill} />
      </Pressable>

      <KeyboardAvoidingView
        style={styles.centerWrap}
        behavior={isWeb ? undefined : Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
      >
        <Animated.View
          entering={FadeInDown.duration(180).springify().damping(20)}
          style={[
            styles.panel,
            {
              width: panelWidth,
              backgroundColor: surface,
              borderColor: border,
              shadowColor: isDark ? '#000' : accent,
            },
          ]}
        >
          <View style={[styles.inputRow, { borderBottomColor: border }]}>
            <Ionicons name="search" size={20} color={accent} />
            <AppTextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Search pages, students, staff…"
              placeholderTextColor={muted}
              style={[styles.input, { color: text }]}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              autoFocus
            />
            {liveLoading ? <ActivityIndicator size="small" color={accent} /> : null}
            {query.length > 0 ? (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={10}
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={18} color={muted} />
              </Pressable>
            ) : isWeb ? (
              <View style={[styles.kbdHint, { backgroundColor: soft, borderColor: border }]}>
                <Text style={[styles.kbdText, { color: muted }]}>esc</Text>
              </View>
            ) : null}
            {!isWeb ? (
              <Pressable onPress={closeSearch} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close search">
                <Ionicons name="close" size={20} color={muted} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            style={styles.results}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {showEmptyState ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: muted }]}>Suggestions</Text>
                <View style={styles.chipRow}>
                  {ADMIN_SEARCH_SUGGESTIONS.map((s) => (
                    <Pressable
                      key={s.query}
                      onPress={() => applySuggestion(s.query)}
                      style={[styles.chip, { backgroundColor: soft, borderColor: border }]}
                    >
                      <Ionicons name={s.icon} size={14} color={accent} />
                      <Text style={[styles.chipText, { color: text }]}>{s.title}</Text>
                    </Pressable>
                  ))}
                </View>

                {recents.length > 0 ? (
                  <>
                    <Text style={[styles.sectionLabel, { color: muted, marginTop: 18 }]}>Recent</Text>
                    {recents.map((term) => (
                      <Pressable
                        key={term}
                        onPress={() => applySuggestion(term)}
                        style={[styles.row, { backgroundColor: 'transparent' }]}
                      >
                        <View style={[styles.iconWrap, { backgroundColor: soft }]}>
                          <Ionicons name="time-outline" size={16} color={muted} />
                        </View>
                        <Text style={[styles.rowTitle, { color: text }]} numberOfLines={1}>
                          {term}
                        </Text>
                        <Ionicons name="arrow-forward" size={14} color={muted} />
                      </Pressable>
                    ))}
                  </>
                ) : null}

                <Text style={[styles.sectionLabel, { color: muted, marginTop: 18 }]}>Jump to</Text>
                {catalogue.slice(0, 8).map((entry, idx) => (
                  <ResultRow
                    key={entry.id}
                    title={entry.title}
                    subtitle={entry.subtitle || entry.category}
                    icon={entry.icon}
                    active={false}
                    text={text}
                    muted={muted}
                    soft={soft}
                    activeBg={activeBg}
                    accent={accent}
                    onPress={() => navigateTo(entry)}
                    onHover={() => setActiveIndex(idx)}
                  />
                ))}
              </View>
            ) : null}

            {!showEmptyState && hits.length > 0 ? (
              <View style={styles.section}>
                {pageHits.length > 0 ? (
                  <>
                    <Text style={[styles.sectionLabel, { color: muted }]}>Pages</Text>
                    {pageHits.map((entry, idx) => (
                      <ResultRow
                        key={entry.id}
                        title={entry.title}
                        subtitle={entry.subtitle || entry.category}
                        icon={entry.icon}
                        active={activeIndex === idx}
                        text={text}
                        muted={muted}
                        soft={soft}
                        activeBg={activeBg}
                        accent={accent}
                        onPress={() => navigateTo(entry)}
                        onHover={() => setActiveIndex(idx)}
                      />
                    ))}
                  </>
                ) : null}

                {liveStudents.length > 0 ? (
                  <>
                    <Text style={[styles.sectionLabel, { color: muted, marginTop: pageHits.length ? 12 : 0 }]}>
                      Students
                    </Text>
                    {liveStudents.map((entry, i) => {
                      const idx = pageHits.length + i;
                      return (
                        <ResultRow
                          key={entry.id}
                          title={entry.title}
                          subtitle={entry.subtitle}
                          icon={entry.icon}
                          active={activeIndex === idx}
                          text={text}
                          muted={muted}
                          soft={soft}
                          activeBg={activeBg}
                          accent={accent}
                          onPress={() => navigateTo(entry)}
                          onHover={() => setActiveIndex(idx)}
                        />
                      );
                    })}
                  </>
                ) : null}

                {liveStaff.length > 0 ? (
                  <>
                    <Text
                      style={[
                        styles.sectionLabel,
                        {
                          color: muted,
                          marginTop: pageHits.length || liveStudents.length ? 12 : 0,
                        },
                      ]}
                    >
                      Staff
                    </Text>
                    {liveStaff.map((entry, i) => {
                      const idx = pageHits.length + liveStudents.length + i;
                      return (
                        <ResultRow
                          key={entry.id}
                          title={entry.title}
                          subtitle={entry.subtitle}
                          icon={entry.icon}
                          active={activeIndex === idx}
                          text={text}
                          muted={muted}
                          soft={soft}
                          activeBg={activeBg}
                          accent={accent}
                          onPress={() => navigateTo(entry)}
                          onHover={() => setActiveIndex(idx)}
                        />
                      );
                    })}
                  </>
                ) : null}
              </View>
            ) : null}

            {showNoResults ? (
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={28} color={muted} />
                <Text style={[styles.emptyTitle, { color: text }]}>No matches</Text>
                <Text style={[styles.emptySub, { color: muted }]}>
                  Try a page name, student name, or admission number
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: border }]}>
            <Text style={[styles.footerText, { color: muted }]}>
              {isWeb ? (
                <>
                  <Text style={styles.footerKbd}>↑↓</Text> navigate{'  '}
                  <Text style={styles.footerKbd}>↵</Text> open{'  '}
                  <Text style={styles.footerKbd}>{modKey}K</Text> toggle
                </>
              ) : 'Tap a result to open'}
            </Text>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ResultRow({
  title,
  subtitle,
  icon,
  active,
  text,
  muted,
  soft,
  activeBg,
  accent,
  onPress,
  onHover,
}: {
  title: string;
  subtitle?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  active: boolean;
  text: string;
  muted: string;
  soft: string;
  activeBg: string;
  accent: string;
  onPress: () => void;
  onHover: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={onHover}
      style={[styles.row, { backgroundColor: active ? activeBg : 'transparent' }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={16} color={accent} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.rowSub, { color: muted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {active ? <Ionicons name="return-down-back" size={14} color={muted} /> : null}
    </Pressable>
  );
}

/** Compact header trigger — wide web only. */
export function AdminAppSearchTrigger() {
  const { enabled, openSearch } = useAdminAppSearch();
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  if (!isWeb || !enabled || width < 768) return null;

  const muted = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)';
  const bg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(102,89,144,0.06)';
  const modKey =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        openSearch();
      }}
      accessibilityRole="search"
      accessibilityLabel="Search the admin app"
      style={[styles.trigger, { backgroundColor: bg, borderColor: border }]}
    >
      <Ionicons name="search" size={15} color={ADMIN_THEME.colors.primary} />
      <Text style={[styles.triggerText, { color: muted }]} numberOfLines={1}>
        Search…
      </Text>
      <View style={[styles.triggerKbd, { borderColor: border }]}>
        <Text style={[styles.triggerKbdText, { color: muted }]}>{modKey}K</Text>
      </View>
    </Pressable>
  );
}

/** Header search button for web and mobile. */
export function AdminAppSearchIconButton({
  isDark,
  accent,
}: {
  isDark: boolean;
  accent: string;
}) {
  const { enabled, openSearch } = useAdminAppSearch();
  if (!enabled) return null;

  return (
    <ClayIconButton
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        openSearch();
      }}
      isDark={isDark}
      accent={accent}
      accessibilityLabel="Search the admin app"
      style={{ marginRight: 8 }}
    >
      <Ionicons name="search-outline" size={19} color={accent} />
    </ClayIconButton>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    paddingTop: '12%',
    paddingHorizontal: 16,
  },
  panel: {
    maxHeight: '72%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 36,
    elevation: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  kbdHint: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  kbdText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  results: {
    maxHeight: 420,
  },
  section: {
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  rowSub: {
    fontSize: 12,
    marginTop: 1,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '500',
  },
  footerKbd: {
    fontWeight: '700',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 180,
    maxWidth: 260,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  triggerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  triggerKbd: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  triggerKbdText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
