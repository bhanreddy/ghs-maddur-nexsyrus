import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import { styles as ds } from '@/src/theme/styles';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Pressable,
  Platform,
  Modal,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AdminHeader from '../../src/components/AdminHeader';
import { useAuth } from '../../src/hooks/useAuth';
import { StudentService } from '../../src/services/studentService';
import { StaffService } from '../../src/services/staffService';
import { ClassService, ClassInfo, Section } from '../../src/services/classService';
import { APIError } from '../../src/services/apiClient';
import { useTheme } from '../../src/hooks/useTheme';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import { Theme, Radii, Spacing, Elevation } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
import Avatar from '../../src/components/Avatar';
import HardDeleteStudentModal from '../../src/components/accounts/HardDeleteStudentModal';
import {
  personListDisplayName,
  safeField,
  staffRoleCodeLine,
} from '../../src/utils/displayHelpers';

const SEARCH_DEBOUNCE_MS = 400;
const IS_WEB = Platform.OS === 'web';

type FilterOption = { id: string; name: string };

function FilterDropdown({
  label,
  value,
  options,
  allLabel,
  onChange,
  primary,
  isDark,
}: {
  label: string;
  value: string | null;
  options: FilterOption[];
  allLabel: string;
  onChange: (id: string | null) => void;
  primary: string;
  isDark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? options.find((o) => o.id === value) : null;
  const display = selected?.name ?? allLabel;

  return (
    <View style={ddStyles.wrap}>
      <Text style={ddStyles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display}`}
        style={({ hovered, pressed }) => [
          ddStyles.trigger,
          value ? { borderColor: primary, backgroundColor: isDark ? 'rgba(79,70,229,0.12)' : '#EEF2FF' } : null,
          (hovered || pressed) && { borderColor: primary },
        ]}
      >
        <Text style={[ddStyles.triggerText, value && { color: primary }]} numberOfLines={1}>
          {display}
        </Text>
        <Ionicons name="chevron-down" size={16} color={value ? primary : '#94A3B8'} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={ddStyles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={ddStyles.sheet} onPress={() => {}}>
            <View style={ddStyles.sheetHeader}>
              <Text style={ddStyles.sheetTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityLabel="Close">
                <Ionicons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>
            <ScrollView style={ddStyles.optionList} keyboardShouldPersistTaps="handled">
              <Pressable
                style={[ddStyles.option, !value && { backgroundColor: '#EEF2FF' }]}
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Text style={[ddStyles.optionText, !value && { color: primary, fontWeight: '700' }]}>
                  {allLabel}
                </Text>
                {!value ? <Ionicons name="checkmark" size={18} color={primary} /> : null}
              </Pressable>
              {options.map((opt) => {
                const active = value === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    style={[ddStyles.option, active && { backgroundColor: '#EEF2FF' }]}
                    onPress={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                  >
                    <Text style={[ddStyles.optionText, active && { color: primary, fontWeight: '700' }]}>
                      {opt.name}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={18} color={primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const ddStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingLeft: 2,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  triggerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderRadius: Radii.lg,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 16px 40px rgba(15,23,42,0.18)' } as object,
      default: Elevation.level3,
    }),
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  optionList: {
    maxHeight: 320,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#334155',
  },
});

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={metaStyles.pill}>
      <Text style={metaStyles.label}>{label}</Text>
      <Text style={metaStyles.value} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const metaStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radii.sm,
    backgroundColor: '#F1F5F9',
    maxWidth: 160,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.2,
  },
  value: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    flexShrink: 1,
  },
});

function enrollmentMeta(enrollment: unknown): { classLabel: string; section: string; roll: string } {
  if (!enrollment || typeof enrollment !== 'object') {
    return { classLabel: 'N/A', section: 'N/A', roll: 'N/A' };
  }
  const e = enrollment as Record<string, unknown>;
  return {
    classLabel: safeField(
      e.class_name ?? e.class_code ?? (e.class as Record<string, unknown> | undefined)?.name ?? e.class_id
    ),
    section: safeField(e.section_name ?? e.section),
    roll: safeField(e.roll_number ?? e.roll_no ?? e.roll),
  };
}

function resolvePhotoUrl(row: Record<string, unknown>): string | null {
  if (typeof row.photo_url === 'string' && row.photo_url.trim()) return row.photo_url;
  const person = row.person;
  if (person && typeof person === 'object' && !Array.isArray(person)) {
    const url = (person as Record<string, unknown>).photo_url;
    if (typeof url === 'string' && url.trim()) return url;
  }
  return null;
}

export default function ManageUsersScreen() {
  const { theme, isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isNarrow = windowWidth < 768;
  const styles = useMemo(() => getStyles(theme, isDark, isNarrow), [theme, isDark, isNarrow]);
  const { shellActive, openMobileNav } = useAccountsWebChrome();
  const router = useRouter();
  const { user } = useAuth();
  const primary = theme.colors.primary;

  const [activeTab, setActiveTab] = useState<'student' | 'staff'>('student');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; subtitle: string } | null>(null);

  const requestSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cls, sec] = await Promise.all([
          ClassService.getClasses(),
          ClassService.getSections(),
        ]);
        if (!cancelled) {
          setClasses(cls);
          setSections(sec);
        }
      } catch {
        if (!cancelled) {
          setClasses([]);
          setSections([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadUsers = useCallback(
    async (
      tab: 'student' | 'staff',
      search: string,
      {
        isSearch,
        classId,
        sectionId,
      }: {
        isSearch?: boolean;
        classId?: string | null;
        sectionId?: string | null;
      } = {}
    ) => {
      if (!user?.userId) {
        setLoading(false);
        setSearching(false);
        return;
      }
      const seq = ++requestSeq.current;
      if (isSearch) setSearching(true);
      else setLoading(true);
      try {
        const trimmed = search.trim();
        let list: any[] = [];
        if (tab === 'student') {
          const resolvedClassId = classId !== undefined ? classId : selectedClassId;
          const resolvedSectionId = sectionId !== undefined ? sectionId : selectedSectionId;
          list = await StudentService.getAllPages({
            search: trimmed || undefined,
            lifecycle: 'active',
            class_id: resolvedClassId || undefined,
            section_id: resolvedSectionId || undefined,
          });
        } else {
          list = await StaffService.getAllPages({
            search: trimmed || undefined,
          });
        }
        if (seq !== requestSeq.current) return;
        setUsers(list);
      } catch {
        if (seq !== requestSeq.current) return;
        setUsers([]);
        alertCompat('Error', 'Failed to load users');
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setSearching(false);
        }
      }
    },
    [user?.userId, selectedClassId, selectedSectionId]
  );

  useEffect(() => {
    setSearchQuery('');
    setSelectedClassId(null);
    setSelectedSectionId(null);
    loadUsers(activeTab, '', { classId: null, sectionId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on tab/user; loadUsers identity changes with filters
  }, [activeTab, user?.userId]);

  const filtersMountedRef = useRef(false);
  useEffect(() => {
    if (!filtersMountedRef.current) {
      filtersMountedRef.current = true;
      return;
    }
    if (activeTab !== 'student') return;
    loadUsers('student', searchQuery, {
      classId: selectedClassId,
      sectionId: selectedSectionId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on filter ids only
  }, [selectedClassId, selectedSectionId]);

  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      loadUsers(activeTab, searchQuery, { isSearch: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const hasActiveFilters = !!(selectedClassId || selectedSectionId || searchQuery.trim());
  const selectedClassName = classes.find((c) => c.id === selectedClassId)?.name;
  const selectedSectionName = sections.find((s) => s.id === selectedSectionId)?.name;

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedClassId(null);
    setSelectedSectionId(null);
  };

  const handleEdit = (target: any) => {
    if (activeTab === 'student') {
      router.push({
        pathname: '/accounts/addStudent',
        params: { id: target.id },
      });
    } else {
      router.push({
        pathname: '/accounts/addStaff',
        params: { id: target.id },
      });
    }
  };

  const handleDelete = (targetUser: any) => {
    const nm = personListDisplayName(targetUser as Record<string, unknown>);

    if (activeTab === 'student') {
      const meta = enrollmentMeta(targetUser.current_enrollment);
      setDeleteTarget({
        id: targetUser.id,
        name: nm,
        subtitle: `Class: ${meta.classLabel} - ${meta.section} • Roll: ${meta.roll}`,
      });
      return;
    }

    alertCompat('Confirm Delete', `Are you sure you want to delete ${nm}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await StaffService.delete(targetUser.id);
            loadUsers(activeTab, searchQuery);
            alertCompat('Success', 'User deleted.');
          } catch (e) {
            const message = e instanceof APIError ? e.message : 'Failed to delete user';
            alertCompat('Error', message);
          }
        },
      },
    ]);
  };

  const handleAdd = () => {
    if (activeTab === 'student') router.push('/accounts/addStudent');
    else router.push('/accounts/addStaff');
  };

  const resultLabel = useMemo(() => {
    const n = users.length;
    const noun = activeTab === 'student' ? (n === 1 ? 'student' : 'students') : n === 1 ? 'staff member' : 'staff members';
    return `${n} ${noun}`;
  }, [users.length, activeTab]);

  const renderItem = ({ item }: { item: any }) => {
    const row = item as Record<string, unknown>;
    const displayName = personListDisplayName(row);
    const photoUrl = resolvePhotoUrl(row);
    const admission =
      typeof row.admission_no === 'string' && row.admission_no.trim()
        ? row.admission_no.trim()
        : null;
    const meta = activeTab === 'student' ? enrollmentMeta(row.current_enrollment) : null;

    return (
      <Pressable
        onPress={() => handleEdit(item)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${displayName}`}
        style={({ hovered, pressed }) => [
          styles.userCard,
          (hovered || pressed) && styles.userCardHover,
        ]}
      >
        <Avatar
          photoUrl={photoUrl}
          name={displayName}
          size={42}
          ringColor={theme.colors.border}
          ringWidth={1}
          style={styles.avatar}
        />
        <View style={styles.userInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.userName} numberOfLines={1}>
              {displayName}
            </Text>
            {admission ? (
              <Text style={styles.admissionBadge} numberOfLines={1}>
                {admission}
              </Text>
            ) : null}
          </View>
          {activeTab === 'student' && meta ? (
            <View style={styles.metaRow}>
              <MetaPill label="Class" value={meta.classLabel} />
              <MetaPill label="Sec" value={meta.section} />
              <MetaPill label="Roll" value={meta.roll} />
            </View>
          ) : (
            <Text style={styles.userSub} numberOfLines={1}>
              {staffRoleCodeLine(row)}
            </Text>
          )}
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={(e) => {
              // Prevent the row's edit navigation from double-firing on web.
              (e as unknown as { stopPropagation?: () => void })?.stopPropagation?.();
              handleEdit(item);
            }}
            style={[styles.actionBtn, styles.editBtn]}
            accessibilityLabel={`Edit ${displayName}`}
            hitSlop={6}
          >
            <Ionicons name="create-outline" size={18} color={primary} />
          </Pressable>
          <Pressable
            onPress={(e) => {
              (e as unknown as { stopPropagation?: () => void })?.stopPropagation?.();
              handleDelete(item);
            }}
            style={[styles.actionBtn, styles.deleteBtn]}
            accessibilityLabel={`Delete ${displayName}`}
            hitSlop={6}
          >
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  const emptyCopy = hasActiveFilters
    ? {
        title: 'No matches found',
        subtitle: 'Try a different search or clear the class / section filters.',
      }
    : {
        title: activeTab === 'student' ? 'No students yet' : 'No staff yet',
        subtitle:
          activeTab === 'student'
            ? 'Add your first student to start building the directory.'
            : 'Add a staff member to get started.',
      };

  return (
    <TourTarget id="screen.accounts-manage-users.overview" native><View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
      {!shellActive && (
        <AdminHeader
          title="Users & Clients"
          showBackButton
          showMenuButton
          onMenuPress={openMobileNav}
        />
      )}

      <View style={styles.pagePad}>
        {/* Segmented tabs */}
        <TourTarget id="screen.accounts-manage-users.workspace" native><View style={styles.tabs}>
          {(
            [
              { key: 'student' as const, label: 'Students', icon: 'school-outline' as const },
              { key: 'staff' as const, label: 'Staff', icon: 'briefcase-outline' as const },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.tab, active && styles.activeTab]}
                onPress={() => setActiveTab(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={active ? '#fff' : theme.colors.textSecondary}
                />
                <Text style={[styles.tabText, active && styles.activeTabText]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View></TourTarget>

        {/* Search + primary action */}
        <View style={styles.toolbar}>
          <View style={[styles.searchContainer, ds.searchBarWrapper]}>
            <Ionicons name="search" size={18} color={theme.colors.textTertiary} />
            <AppTextInput
              style={[ds.inputInChrome, styles.searchInput]}
              placeholder={
                isNarrow
                  ? 'Search…'
                  : `Search ${activeTab === 'student' ? 'by name or admission no' : 'by name or staff code'}…`
              }
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && !searching ? (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
              </Pressable>
            ) : null}
            {searching ? <ActivityIndicator size="small" color={primary} /> : null}
          </View>
          {IS_WEB ? (
            <Pressable
              style={({ hovered, pressed }) => [
                styles.addBtn,
                { backgroundColor: primary },
                (hovered || pressed) && { opacity: 0.92 },
              ]}
              onPress={handleAdd}
              accessibilityLabel={activeTab === 'student' ? 'Add student' : 'Add staff'}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>
                {isNarrow
                  ? 'Add'
                  : activeTab === 'student'
                    ? 'Add student'
                    : 'Add staff'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Class / section filters */}
        {activeTab === 'student' ? (
          <View style={styles.filterBlock}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterHeading}>Filters</Text>
              {(selectedClassId || selectedSectionId) ? (
                <Pressable onPress={clearFilters} hitSlop={8} style={styles.clearFiltersBtn}>
                  <Ionicons name="close-circle-outline" size={14} color={primary} />
                  <Text style={[styles.clearFiltersText, { color: primary }]}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.filterDropdownRow}>
              <FilterDropdown
                label="Class"
                value={selectedClassId}
                options={classes.map((c) => ({ id: c.id, name: c.name }))}
                allLabel="All classes"
                onChange={setSelectedClassId}
                primary={primary}
                isDark={isDark}
              />
              <FilterDropdown
                label="Section"
                value={selectedSectionId}
                options={sections.map((s) => ({ id: s.id, name: s.name }))}
                allLabel="All sections"
                onChange={setSelectedSectionId}
                primary={primary}
                isDark={isDark}
              />
            </View>
            {(selectedClassName || selectedSectionName) ? (
              <Text style={styles.filterSummary}>
                Showing
                {selectedClassName ? ` class ${selectedClassName}` : ''}
                {selectedSectionName ? ` · section ${selectedSectionName}` : ''}
              </Text>
            ) : null}
          </View>
        ) : null}

        {!loading ? (
          <View style={styles.listMeta}>
            <Text style={styles.listMetaText}>{resultLabel}</Text>
            {hasActiveFilters ? (
              <Text style={styles.listMetaHint}>Filtered results</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {loading ? (
        <LogoLoader size={60} color={primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          style={styles.listFlex}
          data={users}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.colors.navPill }]}>
                <Ionicons
                  name={hasActiveFilters ? 'search-outline' : 'people-outline'}
                  size={28}
                  color={primary}
                />
              </View>
              <Text style={styles.emptyTitle}>{emptyCopy.title}</Text>
              <Text style={styles.emptySubtitle}>{emptyCopy.subtitle}</Text>
              {hasActiveFilters ? (
                <Pressable style={[styles.emptyAction, { borderColor: primary }]} onPress={clearFilters}>
                  <Text style={[styles.emptyActionText, { color: primary }]}>Clear filters</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.emptyActionFilled, { backgroundColor: primary }]}
                  onPress={handleAdd}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.emptyActionFilledText}>
                    {activeTab === 'student' ? 'Add student' : 'Add staff'}
                  </Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}

      {!IS_WEB && !shellActive ? (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: primary }]}
          onPress={handleAdd}
          accessibilityLabel={activeTab === 'student' ? 'Add student' : 'Add staff'}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      ) : null}

      <HardDeleteStudentModal
        visible={!!deleteTarget}
        studentId={deleteTarget?.id ?? null}
        studentName={deleteTarget?.name ?? ''}
        studentSubtitle={deleteTarget?.subtitle}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          const nm = deleteTarget?.name;
          setDeleteTarget(null);
          loadUsers(activeTab, searchQuery);
          alertCompat(
            'Deleted',
            `${nm ?? 'Student'} and all associated data were permanently deleted.`
          );
        }}
      />
    </View></TourTarget>
  );
}

const getStyles = (theme: Theme, isDark: boolean, isNarrow: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    pagePad: {
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
      flexShrink: 0,
    },
    tabs: {
      flexDirection: 'row',
      backgroundColor: isDark ? theme.colors.card : '#E8EDF5',
      padding: 4,
      borderRadius: Radii.md,
      marginBottom: Spacing.sm,
      gap: 4,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      gap: 6,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radii.sm,
    },
    activeTab: {
      backgroundColor: theme.colors.primary,
      ...Platform.select({
        web: { boxShadow: '0 4px 12px rgba(79,70,229,0.28)' } as object,
        default: Elevation.level1,
      }),
    },
    tabText: {
      color: theme.colors.textSecondary,
      fontWeight: '600',
      fontSize: 14,
    },
    activeTabText: {
      color: '#fff',
      fontWeight: '700',
    },
    toolbar: {
      flexDirection: isNarrow ? 'column' : 'row',
      alignItems: isNarrow ? 'stretch' : 'center',
      gap: 10,
      marginBottom: Spacing.sm,
    },
    searchContainer: {
      flex: isNarrow ? undefined : 1,
      width: isNarrow ? '100%' : undefined,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      paddingHorizontal: 12,
      borderRadius: Radii.md,
      height: 46,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 8,
      minWidth: 0,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: theme.colors.textStrong,
    },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 14,
      height: 46,
      borderRadius: Radii.md,
      flexShrink: 0,
      alignSelf: isNarrow ? 'stretch' : 'auto',
    },
    addBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14,
    },
    filterBlock: {
      backgroundColor: theme.colors.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: Spacing.xs,
      gap: 8,
    },
    filterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    filterHeading: {
      fontSize: 12,
      fontWeight: '800',
      color: theme.colors.textSecondary,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    clearFiltersBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    clearFiltersText: {
      fontSize: 12,
      fontWeight: '700',
    },
    filterDropdownRow: {
      flexDirection: isNarrow ? 'column' : 'row',
      gap: 10,
      alignItems: 'stretch',
    },
    filterSummary: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    listMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 6,
      paddingBottom: 4,
      paddingHorizontal: 2,
    },
    listMetaText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    listMetaHint: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.primary,
    },
    listFlex: {
      flex: 1,
      minHeight: 0,
    },
    list: {
      paddingHorizontal: Spacing.md,
      paddingBottom: 96,
      paddingTop: 4,
      flexGrow: 1,
    },
    userCard: {
      backgroundColor: theme.colors.card,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: Radii.md,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...Platform.select({
        web: { cursor: 'pointer' } as object,
        default: {},
      }),
    },
    userCardHover: {
      borderColor: theme.colors.primaryLight,
      backgroundColor: isDark ? theme.colors.card : '#F8FAFF',
    },
    avatar: {
      marginRight: 12,
    },
    userInfo: {
      flex: 1,
      minWidth: 0,
      gap: 6,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
    },
    userName: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.textStrong,
      flexShrink: 1,
    },
    admissionBadge: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.primary,
      backgroundColor: theme.colors.navPill,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: Radii.xs,
      overflow: 'hidden',
      flexShrink: 0,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    userSub: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.colors.textSecondary,
    },
    actions: {
      flexDirection: 'row',
      gap: 6,
      marginLeft: 8,
      flexShrink: 0,
    },
    actionBtn: {
      width: 36,
      height: 36,
      borderRadius: Radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editBtn: {
      backgroundColor: theme.colors.navPill,
    },
    deleteBtn: {
      backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2',
    },
    empty: {
      alignItems: 'center',
      paddingTop: 56,
      paddingHorizontal: 28,
      gap: 8,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.colors.textStrong,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      maxWidth: 320,
    },
    emptyAction: {
      marginTop: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: Radii.sm,
      borderWidth: 1.5,
    },
    emptyActionText: {
      fontWeight: '700',
      fontSize: 14,
    },
    emptyActionFilled: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: Radii.sm,
    },
    emptyActionFilledText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14,
    },
    fab: {
      position: 'absolute',
      bottom: 25,
      right: 25,
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
      ...Elevation.level2,
    },
  });
