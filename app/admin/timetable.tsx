import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import AppTextInput from '@/src/components/AppTextInput';
import { styles as ds } from '@/src/theme/styles';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  StatusBar,
  ScrollView,
  Modal,
  Animated,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons } from '@expo/vector-icons';
import { ADMIN_THEME } from '../../src/constants/adminTheme';
import AdminHeader from '../../src/components/AdminHeader';
import { ClassService, ClassInfo, Section, AcademicYear, ClassSection } from '../../src/services/classService';
import { ResultService, Subject } from '../../src/services/commonServices';
import {
  TimetableService,
  TimetableSlot,
  Period,
  TimetableTeacher,
  TimetableMode,
  DayOfWeek,
  TIMETABLE_DAYS,
  TIMETABLE_DAY_LABELS,
} from '../../src/services/timetableService';
import { useTheme } from '../../src/hooks/useTheme';
import LogoLoader from '../../src/components/LogoLoader';

// ─── Raw Palette (private — never referenced directly in JSX/styles) ───────────
// Consumed ONLY by makeColors() / subject palette below. Everything downstream
// reads semantic tokens so the same code path themes correctly in both modes.
const PALETTE = {
  indigo: {
    50: '#EEF2FF', 100: '#E0E7FF', 200: '#C7D2FE', 300: '#A5B4FC',
    400: '#818CF8', 500: '#6366F1', 600: '#4F46E5', 700: '#4338CA', 900: '#1E1B4B',
  },
  amber: {
    50: '#FFFBEB', 100: '#FEF3C7', 200: '#FDE68A', 300: '#FCD34D', 400: '#FBBF24',
    500: '#F59E0B', 600: '#D97706', 700: '#B45309', 800: '#92400E', 900: '#78350F',
  },
  emerald: {
    50: '#ECFDF5', 100: '#D1FAE5', 400: '#34D399', 500: '#10B981', 600: '#059669', 700: '#047857',
  },
  slate: {
    50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0', 300: '#CBD5E1', 400: '#94A3B8',
    500: '#64748B', 600: '#475569', 700: '#334155', 800: '#1E293B', 900: '#0F172A',
  },
  red: { 50: '#FEF2F2', 100: '#FEE2E2', 400: '#F87171', 500: '#EF4444', 600: '#DC2626' },
};

// ─── Semantic Theme Tokens ─────────────────────────────────────────────────────
type Tokens = ReturnType<typeof makeColors>;

const makeColors = (isDark: boolean) => ({
  dark: isDark,

  // Surfaces — dark lifts each layer slightly instead of inverting
  surface: isDark ? '#161C2E' : '#FFFFFF',
  surfaceAlt: isDark ? '#1B2236' : PALETTE.indigo[50],
  surfaceSunken: isDark ? '#10162A' : PALETTE.slate[50],
  inputBg: isDark ? '#1B2236' : '#FFFFFF',
  trackBg: isDark ? '#222A41' : PALETTE.slate[100],
  badgeIdleBg: isDark ? '#333D5C' : PALETTE.slate[300],

  // Borders / dividers
  border: isDark ? '#27304A' : PALETTE.slate[200],
  borderSoft: isDark ? '#212940' : PALETTE.slate[100],
  borderAccent: isDark ? '#2E3354' : PALETTE.indigo[100],
  inputBorder: isDark ? '#333D5C' : '#CBD5E1',

  // Text
  textPrimary: isDark ? '#E8ECF6' : PALETTE.slate[800],
  textSecondary: isDark ? '#A9B3CC' : PALETTE.slate[600],
  textMuted: isDark ? '#6B7793' : PALETTE.slate[400],
  textFaint: isDark ? '#4C566F' : PALETTE.slate[300],

  // Accent (indigo) — lighter on dark so it reads on a dark surface
  accent: isDark ? PALETTE.indigo[500] : PALETTE.indigo[600],
  accentText: isDark ? PALETTE.indigo[300] : PALETTE.indigo[600],
  accentMutedIcon: isDark ? PALETTE.indigo[400] : PALETTE.indigo[300],
  accentSoft: isDark ? 'rgba(99,102,241,0.16)' : PALETTE.indigo[50],
  accentSoftBorder: isDark ? 'rgba(129,140,248,0.30)' : PALETTE.indigo[100],
  onAccent: '#FFFFFF',

  // Success (emerald)
  success: isDark ? PALETTE.emerald[400] : PALETTE.emerald[600],
  successText: isDark ? PALETTE.emerald[400] : PALETTE.emerald[700],
  successSoft: isDark ? 'rgba(16,185,129,0.14)' : PALETTE.emerald[50],
  successSoftBorder: isDark ? 'rgba(52,211,153,0.30)' : PALETTE.emerald[100],
  successAvatar: isDark ? 'rgba(16,185,129,0.22)' : PALETTE.emerald[100],

  // Warning (amber)
  warning: isDark ? PALETTE.amber[400] : PALETTE.amber[600],
  warningText: isDark ? PALETTE.amber[200] : PALETTE.amber[800],
  warningSoft: isDark ? 'rgba(245,158,11,0.12)' : PALETTE.amber[50],
  warningSoftBorder: isDark ? 'rgba(251,191,36,0.32)' : PALETTE.amber[200],
  warningAvatar: isDark ? 'rgba(245,158,11,0.22)' : PALETTE.amber[100],

  // Danger (red)
  danger: isDark ? PALETTE.red[400] : PALETTE.red[500],
  dangerSoft: isDark ? 'rgba(239,68,68,0.14)' : PALETTE.red[50],
  dangerSoftBorder: isDark ? 'rgba(248,113,113,0.30)' : PALETTE.red[100],

  // Controls
  chipBg: isDark ? '#222A41' : PALETTE.slate[100],
  chipBorder: isDark ? '#2C3550' : PALETTE.slate[200],
  stepperBg: isDark ? '#222A41' : '#FFFFFF',
  stepperBorder: isDark ? '#333D5C' : PALETTE.slate[200],

  // Chrome
  statusBarBg: isDark ? '#0B1020' : PALETTE.indigo[700],
  overlay: isDark ? 'rgba(2,4,10,0.66)' : 'rgba(10,14,30,0.45)',
});

// ─── Subject color-coding ───────────────────────────────────────────────────────
// Deterministic hue per subject so the grid is scannable at a glance instead of
// a single-color wall. Each hue ships a light + dark variant so it reads on both
// themes. Structure (period badge, buttons) stays indigo — only subject *content*
// is hued, keeping brand and content as two distinct color languages.
const SUBJECT_HUES = [
  { l: '#4F46E5', d: '#818CF8' }, // indigo
  { l: '#0284C7', d: '#38BDF8' }, // sky
  { l: '#7C3AED', d: '#A78BFA' }, // violet
  { l: '#059669', d: '#34D399' }, // emerald
  { l: '#D97706', d: '#FBBF24' }, // amber
  { l: '#E11D48', d: '#FB7185' }, // rose
  { l: '#0D9488', d: '#2DD4BF' }, // teal
  { l: '#C026D3', d: '#E879F9' }, // fuchsia
  { l: '#EA580C', d: '#FB923C' }, // orange
  { l: '#65A30D', d: '#A3E635' }, // lime
];

const hashKey = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const hexToRgba = (hex: string, a: number) => {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map(x => x + x).join('') : v;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const subjectPalette = (key: string, isDark: boolean) => {
  const hue = SUBJECT_HUES[hashKey(key || 'subject') % SUBJECT_HUES.length];
  const solid = isDark ? hue.d : hue.l;
  return {
    solid,
    soft: hexToRgba(solid, isDark ? 0.18 : 0.12),
    border: hexToRgba(solid, isDark ? 0.34 : 0.22),
  };
};

// ─── Time helpers ─────────────────────────────────────────────────────────────
const fmt = (t: string) => {
  if (!t) return '--:--';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
};

/** Compact clock for dense period columns (no AM/PM). */
const fmtCompact = (t: string) => {
  if (!t) return '--:--';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  const h12 = hour % 12 || 12;
  return `${h12}:${m}`;
};

const firstRouteParam = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;

const getMins = (t: string) => {
  if (!t || !t.includes(':')) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const minsLabel = (d: number) => {
  if (d <= 0) return '0m';
  const h = Math.floor(d / 60);
  const m = d % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const getDurationLabel = (s: string, e: string) => {
  const d = getMins(e) - getMins(s);
  if (d <= 0) return null;
  return minsLabel(d);
};

const minsToTime = (totalMins: number): string => {
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
};

const isBreakPeriod = (name: string) => /break|lunch|recess|interval/i.test(name || '');

/** Teaching period index (1-based), excluding breaks — used for display labels only. */
const getTeachingPeriodNumber = (periods: Period[], index: number): number => {
  let n = 0;
  for (let i = 0; i <= index; i++) {
    const p = periods[i];
    if (!p) continue;
    if (p.is_break || isBreakPeriod(p.name)) continue;
    n++;
  }
  return n;
};

const countTeachingPeriods = (periods: Period[]) =>
  periods.filter((p) => !p.is_break && !isBreakPeriod(p.name)).length;

const nextDefaultPeriodName = (periods: Period[]) => `Period ${countTeachingPeriods(periods) + 1}`;

const personInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

// ─── Animated Row ──────────────────────────────────────────────────────────────
function AnimatedRow({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ─── Animated Progress Bar ────────────────────────────────────────────────────
function AnimatedProgress({ pct, isDone, c }: { pct: number; isDone: boolean; c: Tokens }) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: pct, duration: 600, delay: 200, useNativeDriver: false }).start();
  }, [pct]);
  return (
    <Animated.View
      style={{
        height: '100%',
        borderRadius: 99,
        backgroundColor: isDone ? c.success : c.accent,
        width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
      }}
    />
  );
}

type PremiumOption = { id: string; label: string; hint?: string; accent?: boolean };

function PremiumSelect({
  label,
  icon,
  value,
  options,
  onChange,
  c,
  styles,
  disabled,
  wide,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  options: PremiumOption[];
  onChange: (id: string) => void;
  c: Tokens;
  styles: any;
  disabled?: boolean;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value);
  const valueLabel = selected?.label || 'Select';

  return (
    <>
      <TouchableOpacity
        style={[styles.ddTrigger, wide && styles.ddTriggerWide, disabled && styles.ddTriggerDisabled]}
        onPress={() => !disabled && setOpen(true)}
        activeOpacity={0.75}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${valueLabel}`}
      >
        <View style={styles.ddIconWrap}>
          <Ionicons name={icon} size={13} color={c.accent} />
        </View>
        <View style={styles.ddTextCol}>
          <Text style={styles.ddEyebrow}>{label}</Text>
          <Text style={styles.ddValue} numberOfLines={1}>{valueLabel}</Text>
        </View>
        <Ionicons name="chevron-down" size={13} color={c.textMuted} />
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.ddOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.ddMenu}>
            <View style={styles.ddMenuHeader}>
              <View style={styles.ddMenuHeaderLeft}>
                <View style={styles.ddMenuIcon}>
                  <Ionicons name={icon} size={15} color={c.accent} />
                </View>
                <View>
                  <Text style={styles.ddMenuTitle}>{label}</Text>
                  <Text style={styles.ddMenuSub}>{options.length} options</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.ddMenuClose} onPress={() => setOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={16} color={c.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.ddMenuScroll} bounces={false} showsVerticalScrollIndicator={false}>
              {options.map((opt) => {
                const active = opt.id === value;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.ddOption, active && styles.ddOptionActive]}
                    onPress={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    {active ? <View style={styles.ddOptionRail} /> : <View style={styles.ddOptionRailSpacer} />}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.ddOptionLabel, active && styles.ddOptionLabelActive]} numberOfLines={1}>
                        {opt.label}
                      </Text>
                      {opt.hint ? (
                        <Text style={styles.ddOptionHint} numberOfLines={1}>{opt.hint}</Text>
                      ) : null}
                    </View>
                    {opt.accent ? <View style={styles.ddOptionDot} /> : null}
                    {active ? (
                      <View style={styles.ddOptionCheck}>
                        <Ionicons name="checkmark" size={12} color={c.onAccent} />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TimetableManagement() {
  const routeParams = useLocalSearchParams<{
    classId?: string;
    sectionId?: string;
    subjectId?: string;
    academicYearId?: string;
    focusAssignment?: string;
    focusToken?: string;
  }>();
  const { isDark } = useTheme();
  const c = React.useMemo(() => makeColors(isDark), [isDark]);
  const styles = React.useMemo(() => getStyles(c), [c]);

  // Class / section / year are auto-selected on load; premium dropdowns stay on one toolbar.

  const [metaLoading, setMetaLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Current-time ticker (drives the live-period highlight). Pure client-side.
  const [nowMins, setNowMins] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNowMins(d.getHours() * 60 + d.getMinutes());
    }, 60000);
    return () => clearInterval(id);
  }, []);

  const loadSeqRef = useRef(0);
  const mappingsByYearRef = useRef<Map<string, ClassSection[]>>(new Map());
  const focusCountRef = useRef(0);
  const handledAssignmentFocusRef = useRef('');

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [staff, setStaff] = useState<TimetableTeacher[]>([]);
  const [academicYears, setAcademicYears] = useState<(AcademicYear & { is_current?: boolean })[]>([]);

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [classSectionId, setClassSectionId] = useState<string | null>(null);
  const [yearId, setYearId] = useState<string>('');
  const [classTeacherName, setClassTeacherName] = useState<string>('');

  // Scheduling mode (per school) + the weekday currently being edited (per_day mode).
  const [timetableMode, setTimetableMode] = useState<TimetableMode>('uniform');
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(() => {
    const idx = new Date().getDay(); // 0=Sun..6=Sat
    return idx >= 1 && idx <= 6 ? TIMETABLE_DAYS[idx - 1] : 'monday';
  });
  const [modeSwitching, setModeSwitching] = useState(false);
  const [collapseDialogVisible, setCollapseDialogVisible] = useState(false);
  const [collapseSourceDay, setCollapseSourceDay] = useState<DayOfWeek>('monday');

  // Always-current day filter for slot fetches: a weekday in per_day mode,
  // undefined in uniform mode (server returns the single template).
  const viewDayRef = useRef<DayOfWeek | undefined>(undefined);
  useEffect(() => {
    viewDayRef.current = timetableMode === 'per_day' ? selectedDay : undefined;
  }, [timetableMode, selectedDay]);

  const [modalVisible, setModalVisible] = useState(false);
  const [activeSlotData, setActiveSlotData] = useState<{ period: number } | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [subjectQuery, setSubjectQuery] = useState('');
  const [teacherQuery, setTeacherQuery] = useState('');
  const [slotSaving, setSlotSaving] = useState(false);
  const [assignTab, setAssignTab] = useState<'subject' | 'teacher'>('subject');
  const { width: windowWidth } = useWindowDimensions();
  const assignSplit = windowWidth >= 640;
  const compactPeriodCol = windowWidth < 480;

  const [managePeriodsVisible, setManagePeriodsVisible] = useState(false);
  const [editedPeriods, setEditedPeriods] = useState<Period[]>([]);

  const [editPeriodModalVisible, setEditPeriodModalVisible] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<Period | null>(null);

  const [createPeriodVisible, setCreatePeriodVisible] = useState(false);
  const [newPeriodName, setNewPeriodName] = useState('');
  const [newPeriodStart, setNewPeriodStart] = useState('');
  const [newPeriodEnd, setNewPeriodEnd] = useState('');
  const [newPeriodIsBreak, setNewPeriodIsBreak] = useState(false);

  const clearTimetableView = useCallback(() => {
    setClassSectionId(null);
    setClassTeacherName('');
    setSlots([]);
    setLoadError(null);
  }, []);

  useEffect(() => { loadInitialData(); }, []);

  // Refetch only when returning to this screen from another route (not on modal close / re-focus)
  useFocusEffect(
    useCallback(() => {
      focusCountRef.current += 1;
      if (focusCountRef.current <= 1) return;
      mappingsByYearRef.current.clear();
      if (selectedClassId && selectedSectionId && yearId) {
        loadSeqRef.current += 1;
        const seq = loadSeqRef.current;
        clearTimetableView();
        setSlotsLoading(true);
        (async () => {
          try {
            const mappings = await ClassService.getClassSections(yearId);
            mappingsByYearRef.current.set(yearId, mappings);
            if (seq !== loadSeqRef.current) return;
            const match = mappings.find(
              (m) => m.class_id === selectedClassId && m.section_id === selectedSectionId
            );
            if (!match) return;
            setClassSectionId(match.id);
            setClassTeacherName(match.class_teacher_name || '');
            const data = await TimetableService.getClassSlots(match.id, yearId, { fresh: true, dayOfWeek: viewDayRef.current });
            if (seq !== loadSeqRef.current) return;
            setSlots(data);
          } catch (error: any) {
            if (seq !== loadSeqRef.current) return;
            setLoadError(error?.message || 'Failed to load timetable slots');
          } finally {
            if (seq === loadSeqRef.current) setSlotsLoading(false);
          }
        })();
      }
    }, [selectedClassId, selectedSectionId, yearId, clearTimetableView])
  );

  const loadInitialData = async () => {
    setMetaLoading(true);
    try {
      const [cls, sec, sub, st, allYears, pds, cfg] = await Promise.all([
        ClassService.getClasses(),
        ClassService.getSections(),
        ResultService.getSubjects(),
        TimetableService.getTeacherOptions(),
        ClassService.getAcademicYears() as Promise<(AcademicYear & { is_current?: boolean })[]>,
        TimetableService.getPeriods(),
        TimetableService.getConfig().catch(() => ({ timetable_mode: 'uniform' as TimetableMode })),
      ]);
      setClasses(cls); setSections(sec); setSubjects(sub);
      setStaff(st); setPeriods(pds);
      setTimetableMode(cfg.timetable_mode === 'per_day' ? 'per_day' : 'uniform');
      viewDayRef.current = cfg.timetable_mode === 'per_day' ? selectedDay : undefined;
      setAcademicYears(allYears);
      const requestedClassId = firstRouteParam(routeParams.classId);
      const requestedSectionId = firstRouteParam(routeParams.sectionId);
      const requestedYearId = firstRouteParam(routeParams.academicYearId);
      if (cls.length > 0) {
        setSelectedClassId(
          requestedClassId && cls.some(item => item.id === requestedClassId)
            ? requestedClassId
            : cls[0].id
        );
      }
      if (sec.length > 0) {
        setSelectedSectionId(
          requestedSectionId && sec.some(item => item.id === requestedSectionId)
            ? requestedSectionId
            : sec[0].id
        );
      }
      // Honour an exam deep-link year; otherwise auto-select the current year.
      const current = allYears.find(y => y.is_current);
      if (requestedYearId && allYears.some(y => y.id === requestedYearId)) {
        setYearId(requestedYearId);
      } else if (current) {
        setYearId(current.id);
      } else if (allYears.length > 0) {
        setYearId(allYears[0].id); // fallback to most recent
      }
    } catch (error: any) {
      alertCompat('Error', error?.message || 'Failed to load metadata');
    } finally {
      setMetaLoading(false);
      setPeriodsLoading(false);
    }
  };

  // Also apply a new assignment link when this route instance is reused with
  // different params instead of being remounted by the navigator.
  useEffect(() => {
    if (metaLoading || firstRouteParam(routeParams.focusAssignment) !== '1') return;
    const requestedClassId = firstRouteParam(routeParams.classId);
    const requestedSectionId = firstRouteParam(routeParams.sectionId);
    const requestedYearId = firstRouteParam(routeParams.academicYearId);
    if (requestedClassId && classes.some(item => item.id === requestedClassId)) {
      setSelectedClassId(requestedClassId);
    }
    if (requestedSectionId && sections.some(item => item.id === requestedSectionId)) {
      setSelectedSectionId(requestedSectionId);
    }
    if (requestedYearId && academicYears.some(item => item.id === requestedYearId)) {
      setYearId(requestedYearId);
    }
  }, [
    routeParams.focusAssignment,
    routeParams.classId,
    routeParams.sectionId,
    routeParams.academicYearId,
    metaLoading,
    classes,
    sections,
    academicYears,
  ]);

  // Close assign modal when filters change so stale period/subject state is not edited
  useEffect(() => {
    setModalVisible(false);
    setActiveSlotData(null);
  }, [selectedClassId, selectedSectionId, yearId]);

  // Load timetable for the active class + section + year (ignore stale in-flight responses)
  useEffect(() => {
    if (!selectedClassId || !selectedSectionId || !yearId) {
      clearTimetableView();
      setSlotsLoading(false);
      return;
    }

    const seq = ++loadSeqRef.current;
    clearTimetableView();
    setSlotsLoading(true);

    (async () => {
      try {
        let mappings = mappingsByYearRef.current.get(yearId);
        if (!mappings) {
          mappings = await ClassService.getClassSections(yearId);
          mappingsByYearRef.current.set(yearId, mappings);
        }
        if (seq !== loadSeqRef.current) return;

        const match = mappings.find(
          (m) => m.class_id === selectedClassId && m.section_id === selectedSectionId
        );

        if (!match) {
          if (seq !== loadSeqRef.current) return;
          return;
        }

        if (seq !== loadSeqRef.current) return;

        setClassSectionId(match.id);
        setClassTeacherName(match.class_teacher_name || '');

        const data = await TimetableService.getClassSlots(match.id, yearId, { fresh: true, dayOfWeek: viewDayRef.current });
        if (seq !== loadSeqRef.current) return;

        setSlots(data);
      } catch (error: any) {
        if (seq !== loadSeqRef.current) return;
        const msg = error?.message || 'Failed to load timetable slots';
        setLoadError(msg);
        alertCompat('Error', msg);
      } finally {
        if (seq === loadSeqRef.current) {
          setSlotsLoading(false);
        }
      }
    })();
  }, [selectedClassId, selectedSectionId, yearId, clearTimetableView, academicYears]);

  const reloadSlotsForCurrentSelection = useCallback(async (csId?: string, yId?: string) => {
    const sectionId = csId ?? classSectionId;
    const academicYear = yId ?? yearId;
    if (!sectionId || !academicYear) return;
    setLoadError(null);
    try {
      const data = await TimetableService.getClassSlots(sectionId, academicYear, { fresh: true, dayOfWeek: viewDayRef.current });
      setSlots(data);
    } catch (error: any) {
      const msg = error?.message || 'Failed to load timetable slots';
      setLoadError(msg);
      alertCompat('Error', msg);
      throw error;
    }
  }, [classSectionId, yearId]);

  // Per-day mode: reload the grid when the admin switches the weekday tab.
  useEffect(() => {
    if (timetableMode !== 'per_day') return;
    if (!classSectionId || !yearId) return;
    reloadSlotsForCurrentSelection(classSectionId, yearId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay]);

  // Apply a scheduling-mode change via the backend, then refresh the grid.
  const applyModeChange = useCallback(
    async (nextMode: TimetableMode, opts?: { confirm?: boolean; sourceDay?: DayOfWeek }) => {
      setModeSwitching(true);
      try {
        const res = await TimetableService.setConfig(nextMode, opts);
        const resolved = res.timetable_mode === 'per_day' ? 'per_day' : 'uniform';
        setTimetableMode(resolved);
        viewDayRef.current = resolved === 'per_day' ? selectedDay : undefined;
        if (classSectionId && yearId) {
          await reloadSlotsForCurrentSelection(classSectionId, yearId);
        }
        alertCompat(
          'Saved',
          resolved === 'per_day'
            ? 'Switched to per-day scheduling. Each weekday can now be edited independently.'
            : 'Switched to uniform scheduling. One schedule now applies to all days.'
        );
      } catch (e: any) {
        alertCompat('Error', e?.message || 'Failed to change scheduling mode');
      } finally {
        setModeSwitching(false);
      }
    },
    [classSectionId, yearId, selectedDay, reloadSlotsForCurrentSelection]
  );

  // uniform→per_day is non-destructive; per_day→uniform opens a confirm dialog.
  const handleToggleMode = useCallback(
    (nextMode: TimetableMode) => {
      if (nextMode === timetableMode || modeSwitching) return;
      if (nextMode === 'uniform') {
        setCollapseSourceDay('monday');
        setCollapseDialogVisible(true);
      } else {
        applyModeChange('per_day');
      }
    },
    [timetableMode, modeSwitching, applyModeChange]
  );

  const confirmCollapseToUniform = useCallback(() => {
    setCollapseDialogVisible(false);
    applyModeChange('uniform', { confirm: true, sourceDay: collapseSourceDay });
  }, [applyModeChange, collapseSourceDay]);

  const handlePeriodPressForSlot = useCallback((
    periodNumber: number,
    options?: { slot?: TimetableSlot; subjectId?: string; openTeacher?: boolean },
  ) => {
    if (!classSectionId) {
      alertCompat(
        'Class-section mapping required',
        'Create a mapping for this class and section in Academic Structure before assigning subjects.'
      );
      return;
    }
    const existing = options?.slot ?? slots.find(s => s.period_number === periodNumber);
    const periodDef = periods.find(p => p.sort_order === periodNumber);
    setActiveSlotData({ period: periodNumber });
    setStartTime(existing?.start_time || periodDef?.start_time || '09:00:00');
    setEndTime(existing?.end_time || periodDef?.end_time || '10:00:00');
    setSelectedSubjectId(existing?.subject_id || options?.subjectId || '');
    if (periodNumber === 1 && !existing && classTeacherName && !options?.openTeacher) {
      const ct = staff.find(s => (s.display_name || s.first_name || '') === classTeacherName);
      setSelectedTeacherId(ct?.id || '');
    } else { setSelectedTeacherId(existing?.teacher_id || ''); }
    setSubjectQuery('');
    setTeacherQuery('');
    setAssignTab(options?.openTeacher ? 'teacher' : 'subject');
    setModalVisible(true);
  }, [classSectionId, slots, periods, classTeacherName, staff]);

  // Exam readiness links arrive with a class, section and subject. Once that
  // timetable is loaded, prefer the matching subject slot when it has no
  // teacher; otherwise open the first empty teaching period with the exam
  // subject preselected. In per-day mode, search all weekdays first.
  useEffect(() => {
    const shouldFocus = firstRouteParam(routeParams.focusAssignment) === '1';
    const routeClassId = firstRouteParam(routeParams.classId);
    const routeSectionId = firstRouteParam(routeParams.sectionId);
    const routeSubjectId = firstRouteParam(routeParams.subjectId);
    const routeYearId = firstRouteParam(routeParams.academicYearId);
    if (!shouldFocus || !routeClassId || !routeSectionId || !routeSubjectId || !routeYearId) return;
    if (metaLoading || periodsLoading || slotsLoading || !classSectionId || periods.length === 0) return;
    if (
      selectedClassId !== routeClassId ||
      selectedSectionId !== routeSectionId ||
      yearId !== routeYearId
    ) return;

    const focusToken = firstRouteParam(routeParams.focusToken) || '';
    const focusKey = `${routeClassId}:${routeSectionId}:${routeSubjectId}:${routeYearId}:${focusToken}`;
    if (handledAssignmentFocusRef.current === focusKey) return;
    handledAssignmentFocusRef.current = focusKey;

    let cancelled = false;
    const teachingPeriods = [...periods]
      .filter(period => !period.is_break && !isBreakPeriod(period.name))
      .sort((a, b) => a.sort_order - b.sort_order);

    const findTarget = (candidateSlots: TimetableSlot[]) => {
      const subjectSlot = candidateSlots.find(
        slot => slot.subject_id === routeSubjectId && !slot.teacher_id
      );
      if (subjectSlot) return { period: subjectSlot.period_number, slot: subjectSlot };
      const emptyPeriod = teachingPeriods.find(
        period => !candidateSlots.some(slot => slot.period_number === period.sort_order)
      );
      return emptyPeriod ? { period: emptyPeriod.sort_order, slot: undefined } : null;
    };

    (async () => {
      try {
        let targetSlots = slots;
        let targetDay = selectedDay;
        let target = timetableMode === 'uniform' ? findTarget(targetSlots) : null;

        if (timetableMode === 'per_day') {
          const slotsByDay = await Promise.all(
            TIMETABLE_DAYS.map(async day => ({
              day,
              slots: await TimetableService.getClassSlots(classSectionId, yearId, {
                fresh: true,
                dayOfWeek: day,
              }),
            }))
          );
          if (cancelled) return;

          // An existing subject without a teacher is more useful than an empty
          // slot, even when it lives on a different weekday.
          let match = slotsByDay
            .map(item => ({ ...item, target: item.slots.find(
              slot => slot.subject_id === routeSubjectId && !slot.teacher_id
            ) }))
            .find(item => !!item.target);

          if (!match) {
            match = slotsByDay
              .map(item => {
                const found = findTarget(item.slots);
                return { ...item, target: found?.slot, emptyPeriod: found?.period };
              })
              .find(item => !!item.emptyPeriod) as typeof match;
          }

          if (match) {
            targetDay = match.day;
            targetSlots = match.slots;
            const matchingSubjectSlot = match.slots.find(
              slot => slot.subject_id === routeSubjectId && !slot.teacher_id
            );
            target = matchingSubjectSlot
              ? { period: matchingSubjectSlot.period_number, slot: matchingSubjectSlot }
              : findTarget(match.slots);
          }
        }

        if (cancelled) return;
        if (!target) {
          alertCompat(
            'No available timetable slot',
            'Every teaching period is already assigned. Clear a period or add another period before assigning this subject.'
          );
          return;
        }

        if (timetableMode === 'per_day') {
          viewDayRef.current = targetDay;
          setSelectedDay(targetDay);
          setSlots(targetSlots);
        }
        handlePeriodPressForSlot(target.period, {
          slot: target.slot,
          subjectId: routeSubjectId,
          openTeacher: true,
        });
      } catch (error: any) {
        handledAssignmentFocusRef.current = '';
        if (!cancelled) {
          alertCompat('Could not open assignment', error?.message || 'Failed to load the selected timetable.');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [
    routeParams.focusAssignment,
    routeParams.classId,
    routeParams.sectionId,
    routeParams.subjectId,
    routeParams.academicYearId,
    routeParams.focusToken,
    metaLoading,
    periodsLoading,
    slotsLoading,
    classSectionId,
    periods,
    selectedClassId,
    selectedSectionId,
    yearId,
    slots,
    selectedDay,
    timetableMode,
    handlePeriodPressForSlot,
  ]);

  const handleSaveSlot = async () => {
    if (!classSectionId || !activeSlotData || !selectedSubjectId) {
      alertCompat('Error', 'Please select a subject'); return;
    }
    try {
      setSlotSaving(true);
      const csId = classSectionId;
      const yId = yearId;
      await TimetableService.createSlot({
        academic_year_id: yId,
        class_section_id: csId,
        period_number: activeSlotData.period,
        subject_id: selectedSubjectId,
        teacher_id: selectedTeacherId || undefined,
        start_time: startTime,
        end_time: endTime,
        // per_day mode targets the selected weekday; uniform ignores it (stored on Monday).
        day_of_week: timetableMode === 'per_day' ? selectedDay : undefined,
      });
      setModalVisible(false);
      // Mirror the backend rule (Monday Period-1 teacher = class teacher) so the
      // Class Teacher banner reflects the edit immediately.
      const isClassTeacherSlot =
        activeSlotData.period === 1 && (timetableMode !== 'per_day' || selectedDay === 'monday');
      if (isClassTeacherSlot) {
        const t = staff.find(s => s.id === selectedTeacherId);
        setClassTeacherName(t ? (t.display_name || t.first_name || '') : '');
      }
      await reloadSlotsForCurrentSelection(csId, yId);
    } catch (error: any) {
      alertCompat('Error', error?.message || 'Failed to save slot');
    } finally {
      setSlotSaving(false);
    }
  };

  const handleDeleteSlot = async () => {
    if (!classSectionId || !activeSlotData) return;
    const periodNum = activeSlotData.period;
    const previousSlots = slots;
    try {
      let existing = slots.find(s => s.period_number === periodNum);
      if (!existing) {
        const fresh = await TimetableService.getClassSlots(classSectionId, yearId, { fresh: true, dayOfWeek: viewDayRef.current });
        setSlots(fresh);
        existing = fresh.find(s => s.period_number === periodNum);
      }
      if (!existing) {
        alertCompat('Notice', 'No assignment to clear for this period');
        return;
      }
      // Optimistic: clear this period immediately so stale cache cannot flash old UI
      setSlots((prev) => prev.filter((s) => s.period_number !== periodNum));
      setModalVisible(false);
      await TimetableService.deleteSlot(existing.id);
      // Mirror the backend: removing the Monday Period-1 slot vacates the class teacher.
      if (periodNum === 1 && (timetableMode !== 'per_day' || selectedDay === 'monday')) {
        setClassTeacherName('');
      }
      await reloadSlotsForCurrentSelection(classSectionId, yearId);
    } catch (error: any) {
      setSlots(previousSlots);
      alertCompat('Error', error?.message || 'Failed to delete');
    }
  };

  const getSlotForPeriod = (periodNumber: number) => slots.find(s => s.period_number === periodNumber);

  const openManagePeriods = async () => {
    try {
      setActionLoading(true);
      const fresh = await TimetableService.getPeriods();
      setPeriods(fresh);
      setEditedPeriods(JSON.parse(JSON.stringify(fresh)));
      setManagePeriodsVisible(true);
    } catch (error: any) {
      alertCompat('Error', error?.message || 'Failed to load timings');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSavePeriods = async () => {
    if (actionLoading) return;
    try {
      setActionLoading(true);
      const payload: Period[] = editedPeriods.map((p, index) => ({
        ...p,
        name: p.name?.trim(),
        sort_order: index + 1,
        is_break: p.is_break === true || isBreakPeriod(p.name),
      }));

      for (const p of payload) {
        if (!p.name?.trim()) {
          alertCompat('Validation', 'Every period and break needs a name before saving.');
          return;
        }
      }
      await TimetableService.updatePeriods(payload);
      const fresh = await TimetableService.getPeriods();
      setPeriods(fresh);
      setManagePeriodsVisible(false);
      alertCompat('Success', 'Timings updated');
      if (classSectionId && yearId) {
        await reloadSlotsForCurrentSelection(classSectionId, yearId);
      }
    } catch (error: any) {
      if (String(error?.message || '').includes('no longer exist')) {
        const fresh = await TimetableService.getPeriods().catch(() => null);
        if (fresh) {
          setPeriods(fresh);
          setEditedPeriods(JSON.parse(JSON.stringify(fresh)));
          alertCompat('Timings Refreshed', 'The timing structure changed in the database. Please review the refreshed timings and save again.');
          return;
        }
      }
      alertCompat('Error', error?.message || 'Failed to update periods');
    } finally { setActionLoading(false); }
  };

  const updatePeriodTime = (index: number, field: 'start_time' | 'end_time', value: string) => {
    const updated = [...editedPeriods];
    updated[index] = { ...updated[index], [field]: value };
    setEditedPeriods(updated);
  };

  // Adjust duration of period at `index` by `delta` minutes, then cascade all downstream
  const adjustDuration = (index: number, delta: number) => {
    const updated = [...editedPeriods];
    const current = updated[index];
    const startM = getMins(current.start_time);
    const endM = getMins(current.end_time);
    const newEnd = Math.max(startM + 5, endM + delta); // minimum 5-minute period
    updated[index] = { ...current, end_time: minsToTime(newEnd) };

    // cascade: each following period starts where the previous one ended
    for (let i = index + 1; i < updated.length; i++) {
      const prevEnd = getMins(updated[i - 1].end_time);
      const dur = getMins(updated[i].end_time) - getMins(updated[i].start_time);
      const safeDur = dur > 0 ? dur : 45; // fallback to 45 min if invalid
      updated[i] = {
        ...updated[i],
        start_time: minsToTime(prevEnd),
        end_time: minsToTime(prevEnd + safeDur),
      };
    }
    setEditedPeriods(updated);
  };

  // Insert a teaching period after the given index (or as the first period when the list is empty)
  const insertPeriodAfter = (afterIndex: number) => {
    const updated = [...editedPeriods];
    const periodDuration = 40;
    const hasPrev = afterIndex >= 0 && afterIndex < updated.length;
    // Empty list (or invalid index): start a default first period at 09:00
    const prevEnd = hasPrev ? getMins(updated[afterIndex].end_time) : getMins('09:00:00');
    const insertAt = hasPrev ? afterIndex + 1 : 0;
    const newPeriod: Period = {
      id: `temp_period_${Date.now()}`,
      name: nextDefaultPeriodName(updated),
      start_time: minsToTime(prevEnd),
      end_time: minsToTime(prevEnd + periodDuration),
      sort_order: insertAt + 1,
      is_break: false,
    } as Period;
    updated.splice(insertAt, 0, newPeriod);
    for (let i = insertAt + 1; i < updated.length; i++) {
      const pEnd = getMins(updated[i - 1].end_time);
      const d = getMins(updated[i].end_time) - getMins(updated[i].start_time);
      const sd = d > 0 ? d : 40;
      updated[i] = { ...updated[i], start_time: minsToTime(pEnd), end_time: minsToTime(pEnd + sd) };
    }
    updated.forEach((p, i) => { p.sort_order = i + 1; });
    setEditedPeriods(updated);
  };

  const updatePeriodName = (index: number, name: string) => {
    const updated = [...editedPeriods];
    const isBreak = isBreakPeriod(name);
    updated[index] = {
      ...updated[index],
      name,
      is_break: isBreak ? true : false,
    };
    setEditedPeriods(updated);
  };

  // Insert a break/lunch after the given index
  const insertBreakAfter = (afterIndex: number) => {
    const updated = [...editedPeriods];
    if (afterIndex < 0 || afterIndex >= updated.length) return;
    const prevEnd = getMins(updated[afterIndex].end_time);
    const breakDuration = 15;
    const newBreak: Period = {
      id: `temp_break_${Date.now()}`,
      name: 'Break',
      start_time: minsToTime(prevEnd),
      end_time: minsToTime(prevEnd + breakDuration),
      sort_order: afterIndex + 2,
      is_break: true,
    } as Period;
    updated.splice(afterIndex + 1, 0, newBreak);
    // re-cascade from the inserted break onward
    for (let i = afterIndex + 2; i < updated.length; i++) {
      const pEnd = getMins(updated[i - 1].end_time);
      const d = getMins(updated[i].end_time) - getMins(updated[i].start_time);
      const sd = d > 0 ? d : 45;
      updated[i] = { ...updated[i], start_time: minsToTime(pEnd), end_time: minsToTime(pEnd + sd) };
    }
    // fix sort_order
    updated.forEach((p, i) => { p.sort_order = i + 1; });
    setEditedPeriods(updated);
  };

  // Remove break at given index
  const removeBreak = (index: number) => {
    const updated = [...editedPeriods];
    updated.splice(index, 1);
    // cascade from the removed position onward
    for (let i = index; i < updated.length; i++) {
      if (i === 0) continue;
      const pEnd = getMins(updated[i - 1].end_time);
      const d = getMins(updated[i].end_time) - getMins(updated[i].start_time);
      const sd = d > 0 ? d : 45;
      updated[i] = { ...updated[i], start_time: minsToTime(pEnd), end_time: minsToTime(pEnd + sd) };
    }
    updated.forEach((p, i) => { p.sort_order = i + 1; });
    setEditedPeriods(updated);
  };

  const removePeriodAt = (index: number) => {
    const period = editedPeriods[index];
    if (!period || period.is_break || isBreakPeriod(period.name)) return;
    alertCompat(
      'Remove Period',
      `Remove "${period.name}"? Timetable slots for this slot will be cleared when you save.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeBreak(index),
        },
      ],
    );
  };

  // Adjust the start time of the first period, then cascade everything
  const adjustStartTime = (delta: number) => {
    const updated = [...editedPeriods];
    if (updated.length === 0) return;
    const first = updated[0];
    const newStart = Math.max(0, getMins(first.start_time) + delta);
    const dur = getMins(first.end_time) - getMins(first.start_time);
    const safeDur = dur > 0 ? dur : 45;
    updated[0] = { ...first, start_time: minsToTime(newStart), end_time: minsToTime(newStart + safeDur) };

    for (let i = 1; i < updated.length; i++) {
      const prevEnd = getMins(updated[i - 1].end_time);
      const d = getMins(updated[i].end_time) - getMins(updated[i].start_time);
      const sd = d > 0 ? d : 45;
      updated[i] = {
        ...updated[i],
        start_time: minsToTime(prevEnd),
        end_time: minsToTime(prevEnd + sd),
      };
    }
    setEditedPeriods(updated);
  };

  const handlePeriodPress = (period: Period) => {
    setEditingPeriod({ ...period });
    setEditPeriodModalVisible(true);
  };

  const handleSaveSinglePeriod = async () => {
    if (!editingPeriod) return;
    try {
      setActionLoading(true);
      const payload = periods.map((p, index) => {
        const next = p.id === editingPeriod.id ? editingPeriod : p;
        return {
          ...next,
          name: next.name?.trim(),
          sort_order: index + 1,
          is_break: next.is_break === true || isBreakPeriod(next.name),
        };
      });
      await TimetableService.updatePeriods(payload);
      const fresh = await TimetableService.getPeriods();
      setPeriods(fresh);
      setEditPeriodModalVisible(false);
      alertCompat('Success', 'Period updated');
      await reloadSlotsForCurrentSelection();
    } catch { alertCompat('Error', 'Failed to update period'); }
    finally { setActionLoading(false); }
  };

  const handleDeletePeriod = () => {
    if (!editingPeriod) return;
    alertCompat(
      'Delete Period',
      `Delete "${editingPeriod.name}"? This will remove all timetable slots for this period across all classes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              setActionLoading(true);
              await TimetableService.deletePeriod(editingPeriod.id);
              setPeriods(periods.filter(p => p.id !== editingPeriod.id));
              setEditPeriodModalVisible(false);
              await reloadSlotsForCurrentSelection();
              alertCompat('Success', 'Period deleted');
            } catch { alertCompat('Error', 'Failed to delete period'); }
            finally { setActionLoading(false); }
          },
        },
      ]
    );
  };

  // Which period (by id) contains the current time — drives the live highlight.
  const livePeriodId = React.useMemo(() => {
    const hit = periods.find(p => {
      const s = getMins(p.start_time);
      const e = getMins(p.end_time);
      return e > s && nowMins >= s && nowMins < e;
    });
    return hit?.id ?? null;
  }, [periods, nowMins]);

  // School-day summary (span + instructional time, breaks excluded).
  const daySpan = React.useMemo(() => {
    if (periods.length === 0) return null;
    const sorted = [...periods].sort((a, b) => a.start_time.localeCompare(b.start_time));
    const teachingMins = sorted.reduce((sum, p) => {
      if (isBreakPeriod(p.name)) return sum;
      const d = getMins(p.end_time) - getMins(p.start_time);
      return sum + (d > 0 ? d : 0);
    }, 0);
    const teachingCount = sorted.filter(p => !isBreakPeriod(p.name)).length;
    return {
      start: sorted[0].start_time,
      end: sorted[sorted.length - 1].end_time,
      teachingMins,
      teachingCount,
    };
  }, [periods]);

  // ─── Slot Row ─────────────────────────────────────────────────────────────────
  const renderSlotRow = (period: Period, slot: TimetableSlot | undefined, index: number, sortedPeriods: Period[]) => {
    const isFilled = !!slot;
    const isLive = livePeriodId === period.id;
    const isBreak = period.is_break || isBreakPeriod(period.name);
    const isBlocked = !classSectionId;
    const teachingNum = isBreak ? null : getTeachingPeriodNumber(sortedPeriods, index);
    const subj = isFilled ? subjectPalette(slot!.subject_id || slot!.subject_name || '', isDark) : null;
    const duration = getDurationLabel(period.start_time, period.end_time);

    return (
      <AnimatedRow key={period.id} delay={index * 28}>
        <View style={[
          styles.rowCard,
          isLive && styles.rowCardLive,
          isBlocked && styles.rowCardBlocked,
        ]}>
          {/* Subject-colored accent rail (neutral when empty) */}
          <View style={[styles.rowAccent, isFilled && { backgroundColor: subj!.solid }]} />

          {/* Period tap zone — compact horizontal time */}
          <TouchableOpacity
            style={[styles.periodCell, compactPeriodCol && styles.periodCellCompact]}
            onPress={() => handlePeriodPress(period)}
            activeOpacity={0.65}
            accessibilityLabel={`Edit period ${teachingNum ?? period.sort_order} timing`}
          >
            <View style={[
              styles.periodBadge,
              isFilled && styles.periodBadgeFilled,
              isBlocked && !isFilled && styles.periodBadgeBlocked,
            ]}>
              <Text style={styles.periodBadgeText}>{teachingNum ?? period.sort_order}</Text>
            </View>
            <View style={styles.periodTimeBlock}>
              <Text style={styles.periodTimeRange} numberOfLines={1}>
                {compactPeriodCol
                  ? `${fmtCompact(period.start_time)}–${fmtCompact(period.end_time)}`
                  : `${fmt(period.start_time)} – ${fmt(period.end_time)}`}
              </Text>
              {duration ? <Text style={styles.periodDuration}>{duration}</Text> : null}
            </View>
          </TouchableOpacity>

          {/* Slot tap zone */}
          <TouchableOpacity
            style={styles.slotCell}
            onPress={() => handlePeriodPressForSlot(period.sort_order)}
            activeOpacity={0.6}
            accessibilityLabel={
              isFilled
                ? `Edit ${slot!.subject_name}`
                : isBlocked
                  ? 'Mapping required before assigning'
                  : 'Assign subject'
            }
          >
            {isFilled ? (
              <View style={styles.slotFilledContent}>
                <View style={styles.subjectRow}>
                  <View style={[styles.subjectDot, { backgroundColor: subj!.solid }]} />
                  <Text style={styles.slotSubjectText} numberOfLines={1}>{slot!.subject_name}</Text>
                </View>
                <View style={styles.teacherRow}>
                  <Ionicons
                    name={slot!.teacher_name ? 'person-circle-outline' : 'person-outline'}
                    size={12}
                    color={slot!.teacher_name ? c.accentMutedIcon : c.textFaint}
                  />
                  <Text style={[styles.slotTeacherText, !slot!.teacher_name && styles.slotTeacherEmpty]} numberOfLines={1}>
                    {slot!.teacher_name || 'No teacher assigned'}
                  </Text>
                </View>
              </View>
            ) : isBlocked ? (
              <View style={styles.slotEmptyContent}>
                <View style={styles.lockIconWrap}>
                  <Ionicons name="lock-closed-outline" size={13} color={c.textMuted} />
                </View>
                <Text style={styles.slotBlockedText}>Awaiting mapping</Text>
              </View>
            ) : (
              <View style={styles.slotEmptyContent}>
                <View style={styles.addIconWrap}>
                  <Ionicons name="add" size={15} color={c.accent} />
                </View>
                <Text style={styles.slotEmptyText}>Tap to assign subject</Text>
              </View>
            )}

            <View style={styles.slotTrailing}>
              {isLive && (
                <View style={styles.nowPill}>
                  <View style={styles.nowDot} />
                  <Text style={styles.nowPillText}>NOW</Text>
                </View>
              )}
              {!isBlocked && (
                <Ionicons
                  name={isFilled ? 'create-outline' : 'chevron-forward'}
                  size={14}
                  color={isFilled ? c.accentMutedIcon : c.textFaint}
                />
              )}
            </View>
          </TouchableOpacity>
        </View>
      </AnimatedRow>
    );
  };

  // ─── Break Row ────────────────────────────────────────────────────────────────
  const renderBreakRow = (startT: string, endT: string, key: string) => {
    const mins = getMins(endT) - getMins(startT);
    return (
      <View key={key} style={styles.breakRow}>
        <View style={styles.breakLine} />
        <View style={styles.breakPill}>
          <Ionicons name="cafe-outline" size={11} color={c.warning} />
          <Text style={styles.breakLabel}>
            {mins >= 30 ? 'LUNCH' : 'BREAK'} · {mins}m
          </Text>
        </View>
        <View style={styles.breakLine} />
      </View>
    );
  };

  // ─── Day Summary Strip ──────────────────────────────────────────────────────
  const renderDaySummary = () => {
    if (!daySpan) return null;
    return (
      <View style={styles.daySummary}>
        <View style={styles.daySummaryItem}>
          <Ionicons name="time-outline" size={13} color={c.accent} />
          <Text style={styles.daySummaryStrong}>{fmt(daySpan.start)} – {fmt(daySpan.end)}</Text>
        </View>
        <View style={styles.daySummaryDivider} />
        <View style={styles.daySummaryItem}>
          <Ionicons name="layers-outline" size={12} color={c.textMuted} />
          <Text style={styles.daySummaryMuted}>
            {daySpan.teachingCount} {daySpan.teachingCount === 1 ? 'period' : 'periods'} · {minsLabel(daySpan.teachingMins)} teaching
          </Text>
        </View>
      </View>
    );
  };

  // ─── Table Rows ───────────────────────────────────────────────────────────────
  const renderTableRows = () => {
    const sorted = [...periods].sort((a, b) => a.start_time.localeCompare(b.start_time));
    const rows: React.ReactNode[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const period = sorted[i];
      if (period.is_break || isBreakPeriod(period.name)) {
        rows.push(renderBreakRow(period.start_time, period.end_time, `break-${period.id}`));
      } else {
        rows.push(renderSlotRow(period, getSlotForPeriod(period.sort_order), i, sorted));
      }
      if (i < sorted.length - 1 && getMins(sorted[i + 1].start_time) > getMins(period.end_time)) {
        rows.push(renderBreakRow(period.end_time, sorted[i + 1].start_time, `gap-${i}`));
      }
    }
    return rows;
  };

  const filledCount = slots.length;
  const totalCount = periods.length;
  const fillPct = totalCount > 0 ? (filledCount / totalCount) * 100 : 0;
  const isDone = fillPct === 100;

  const selectedClassObj = classes.find(cl => cl.id === selectedClassId);
  const selectedSectionObj = sections.find(s => s.id === selectedSectionId);
  const selectedYearObj = academicYears.find(y => y.id === yearId);
  const contextLabel = selectedClassObj && selectedSectionObj
    ? `Class ${selectedClassObj.name} · Sec ${selectedSectionObj.name}`
    : 'Select class & section';
  const contextSub = `${selectedYearObj?.code ?? '—'} · ${timetableMode === 'per_day' ? TIMETABLE_DAY_LABELS[selectedDay] : 'All 6 days'}`;

  const yearOptions: PremiumOption[] = academicYears.map(y => ({
    id: y.id,
    label: y.code,
    hint: y.is_current ? 'Current year' : undefined,
    accent: !!y.is_current,
  }));
  const classOptions: PremiumOption[] = classes.map(cl => ({
    id: cl.id,
    label: cl.name,
  }));
  const sectionOptions: PremiumOption[] = sections.map(s => ({
    id: s.id,
    label: s.name,
    hint: `Section ${s.name}`,
  }));
  const modeOptions: PremiumOption[] = [
    { id: 'uniform', label: 'Uniform', hint: 'Same schedule Mon–Sat' },
    { id: 'per_day', label: 'Per-day', hint: 'Different schedule each weekday' },
  ];
  const dayOptions: PremiumOption[] = TIMETABLE_DAYS.map(d => ({
    id: d,
    label: TIMETABLE_DAY_LABELS[d],
  }));

  const activePeriodDef = activeSlotData
    ? periods.find(p => p.sort_order === activeSlotData.period)
    : undefined;
  const existingActiveSlot = activeSlotData
    ? slots.find(s => s.period_number === activeSlotData.period)
    : undefined;
  const selectedSubject = subjects.find(s => s.id === selectedSubjectId);
  const selectedTeacher = staff.find(s => s.id === selectedTeacherId);
  const selectedTeacherName = selectedTeacher
    ? (selectedTeacher.display_name || selectedTeacher.first_name || selectedTeacher.staff_code || '')
    : '';
  const isPeriod1ClassTeacherSlot =
    activeSlotData?.period === 1 && (timetableMode !== 'per_day' || selectedDay === 'monday');
  const canSaveSlot = !!selectedSubjectId && !slotSaving;

  const filteredSubjects = useMemo(() => {
    const q = subjectQuery.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter(s =>
      (s.name || '').toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q)
    );
  }, [subjects, subjectQuery]);

  const filteredStaff = useMemo(() => {
    const q = teacherQuery.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(st => {
      const name = (st.display_name || st.first_name || st.staff_code || '').toLowerCase();
      return name.includes(q);
    });
  }, [staff, teacherQuery]);

  const closeAssignModal = () => {
    if (slotSaving) return;
    setModalVisible(false);
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={c.statusBarBg} />

      <AdminHeader
        title="Timetable"
        showBackButton
        rightAction={{ icon: 'time-outline', onPress: openManagePeriods }}
      />

      {/* ── Premium single-line filter toolbar ── */}
      <View style={styles.contextBarOuter}>
        <View style={styles.filterToolbar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterToolbarRow}
            style={styles.filterToolbarScroll}
          >
            {academicYears.length > 0 && (
              <PremiumSelect
                label="Year"
                icon="calendar-outline"
                value={yearId}
                options={yearOptions}
                onChange={(id) => { if (id !== yearId) setYearId(id); }}
                c={c}
                styles={styles}
              />
            )}

            <PremiumSelect
              label="Class"
              icon="school-outline"
              value={selectedClassId}
              options={classOptions}
              onChange={setSelectedClassId}
              c={c}
              styles={styles}
              wide
            />

            <PremiumSelect
              label="Section"
              icon="grid-outline"
              value={selectedSectionId}
              options={sectionOptions}
              onChange={setSelectedSectionId}
              c={c}
              styles={styles}
            />

            <PremiumSelect
              label="Schedule"
              icon="repeat-outline"
              value={timetableMode}
              options={modeOptions}
              onChange={(id) => handleToggleMode(id as TimetableMode)}
              c={c}
              styles={styles}
              disabled={modeSwitching}
            />

            {timetableMode === 'per_day' && (
              <PremiumSelect
                label="Day"
                icon="today-outline"
                value={selectedDay}
                options={dayOptions}
                onChange={(id) => setSelectedDay(id as DayOfWeek)}
                c={c}
                styles={styles}
                disabled={modeSwitching}
              />
            )}
          </ScrollView>

          {classSectionId && totalCount > 0 ? (
            <View style={styles.contextProgress}>
              <View style={styles.contextProgressRing}>
                <Text style={[styles.contextPct, isDone && { color: c.successText }]}>
                  {Math.round(fillPct)}%
                </Text>
              </View>
              <Text style={styles.contextProgressHint}>
                {isDone ? 'Done' : 'filled'}
              </Text>
            </View>
          ) : (
            <View style={styles.filterToolbarMeta}>
              <Text style={styles.filterToolbarMetaText} numberOfLines={1}>
                {contextSub}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Grid (single scroll region — teacher banner + progress now scroll too) ── */}
      <ScrollView style={styles.gridContainer} contentContainerStyle={styles.gridScrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.gridInner}>
          {metaLoading || periodsLoading ? (
            <View style={{ paddingVertical: 56, alignItems: 'center' }}>
              <LogoLoader size={48} color={c.accent} />
              <Text style={styles.loaderText}>Loading schedule…</Text>
            </View>
          ) : slotsLoading ? (
            <View style={{ paddingVertical: 56, alignItems: 'center' }}>
              <LogoLoader size={48} color={c.accent} />
              <Text style={styles.loaderText}>Loading class timetable…</Text>
            </View>
          ) : loadError ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, styles.emptyIconWrapError]}>
                <Ionicons name="alert-circle-outline" size={28} color={c.danger} />
              </View>
              <Text style={styles.emptyTitle}>Could not load timetable</Text>
              <Text style={styles.emptySubtitle}>{loadError}</Text>
            </View>
          ) : periods.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="calendar-outline" size={28} color={c.accentMutedIcon} />
              </View>
              <Text style={styles.emptyTitle}>No periods yet</Text>
              <Text style={styles.emptySubtitle}>
                {yearId && selectedClassId && selectedSectionId && !classSectionId
                  ? 'Use the clock icon to set school timings, then create a class–section mapping in Academic Structure so you can assign subjects.'
                  : 'Add your first period below, or open the clock icon to set the full school day at once.'}
              </Text>
            </View>
          ) : (
            <>
              {/* ── Mapping callout (one place — rows stay quiet when blocked) ── */}
              {!classSectionId && yearId && selectedClassId && selectedSectionId ? (
                <View style={styles.mappingBanner}>
                  <View style={styles.mappingBannerIcon}>
                    <Ionicons name="git-branch-outline" size={16} color={c.warning} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.mappingBannerTitle}>Link this class to assign subjects</Text>
                    <Text style={styles.mappingBannerSub}>
                      Period timings below apply school-wide. Open Academic Structure and create a class–section mapping for {contextLabel} to unlock subject assignment.
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* ── Class Teacher Banner ── */}
              {classTeacherName && classSectionId ? (
                <View style={styles.teacherBanner}>
                  <View style={styles.teacherAvatar}>
                    <Ionicons name="person" size={13} color={c.success} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.teacherBannerName} numberOfLines={1}>{classTeacherName}</Text>
                    <Text style={styles.teacherBannerSub}>Class teacher · Period 1</Text>
                  </View>
                  <View style={styles.ctBadge}>
                    <Text style={styles.ctBadgeText}>CT</Text>
                  </View>
                </View>
              ) : null}

              {/* ── Progress Strip ── */}
              {classSectionId ? (
                <View style={styles.progressStrip}>
                  <View style={styles.progressMeta}>
                    <Text style={styles.progressLabel}>
                      {filledCount === 0
                        ? 'Tap a period to assign the first subject'
                        : isDone
                          ? 'All periods assigned'
                          : `${filledCount} of ${totalCount} assigned`}
                    </Text>
                    <Text style={[styles.progressPct, isDone && styles.progressPctDone]}>
                      {Math.round(fillPct)}%
                    </Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <AnimatedProgress pct={fillPct} isDone={isDone} c={c} />
                  </View>
                </View>
              ) : null}

              {renderDaySummary()}
              {renderTableRows()}
            </>
          )}

          <TouchableOpacity
            style={styles.addPeriodBtn}
            activeOpacity={0.7}
            onPress={() => { setNewPeriodName(''); setNewPeriodStart(''); setNewPeriodEnd(''); setNewPeriodIsBreak(false); setCreatePeriodVisible(true); }}
          >
            <Ionicons name="add-circle" size={18} color={c.accent} />
            <View>
              <Text style={styles.addPeriodBtnTitle}>Add period or break</Text>
              <Text style={styles.addPeriodBtnHint}>Insert another slot into the school day</Text>
            </View>
          </TouchableOpacity>

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* ════════════════ MODAL: Switch to Uniform (destructive) ════════════════ */}
      <Modal transparent visible={collapseDialogVisible} onRequestClose={() => setCollapseDialogVisible(false)} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <View style={[styles.emptyIconWrap, styles.emptyIconWrapError, { alignSelf: 'center', marginBottom: 12 }]}>
              <Ionicons name="warning-outline" size={26} color={c.danger} />
            </View>
            <Text style={styles.confirmTitle}>Switch to Uniform?</Text>
            <Text style={styles.confirmBody}>
              Switching to Uniform will overwrite Tue–Sat with the chosen source day. Up to 5 days of
              edits will be lost. This affects every section in this school for the current academic year.
            </Text>

            <Text style={[styles.modeHint, { marginTop: 14, marginBottom: 6 }]}>Source day (kept):</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
              {TIMETABLE_DAYS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.chip, collapseSourceDay === d && styles.activeChip]}
                  onPress={() => setCollapseSourceDay(d)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, collapseSourceDay === d && styles.activeChipText]}>
                    {TIMETABLE_DAY_LABELS[d]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmBtnGhost]}
                onPress={() => setCollapseDialogVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmBtnDanger]}
                onPress={confirmCollapseToUniform}
                disabled={modeSwitching}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmBtnDangerText}>
                  {modeSwitching ? 'Switching…' : 'Overwrite & Switch'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════════════════════ MODAL: Assign Slot ════════════════════ */}
      <Modal transparent visible={modalVisible} onRequestClose={closeAssignModal} animationType="slide">
        <View style={[styles.modalOverlay, assignSplit && styles.modalOverlayCenter]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAssignModal} accessibilityRole="button" accessibilityLabel="Dismiss" />
          <View style={[styles.assignSheet, assignSplit && styles.assignSheetWide]}>
            {!assignSplit && <View style={styles.sheetHandle} />}

            <View style={[styles.modalHeaderRow, assignSplit && { marginTop: 4 }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={styles.modalTitleGroup}>
                  <Text style={styles.modalTitle}>
                    {existingActiveSlot ? 'Edit assignment' : 'Assign slot'}
                  </Text>
                  <View style={styles.modalBadge}>
                    <Text style={styles.modalBadgeText}>P{activeSlotData?.period}</Text>
                  </View>
                </View>
                <Text style={styles.assignMeta} numberOfLines={1}>
                  {activePeriodDef
                    ? `${fmt(activePeriodDef.start_time)} – ${fmt(activePeriodDef.end_time)}${getDurationLabel(activePeriodDef.start_time, activePeriodDef.end_time) ? ` · ${getDurationLabel(activePeriodDef.start_time, activePeriodDef.end_time)}` : ''}`
                    : 'Select subject & teacher'}
                  {selectedClassObj && selectedSectionObj
                    ? ` · ${selectedClassObj.name}-${selectedSectionObj.name}`
                    : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={closeAssignModal} style={styles.modalCloseBtn} hitSlop={8}>
                <Ionicons name="close" size={16} color={c.textMuted} />
              </TouchableOpacity>
            </View>

            {isPeriod1ClassTeacherSlot && (
              <View style={styles.ctHintSlim}>
                <Ionicons name="shield-checkmark" size={13} color={c.warning} />
                <Text style={styles.ctHintSlimText} numberOfLines={1}>
                  Period 1 teacher becomes Class Teacher
                  {classTeacherName ? ` · now ${classTeacherName}` : ''}
                </Text>
              </View>
            )}

            {!assignSplit && (
              <View style={styles.assignTabs}>
                <TouchableOpacity
                  style={[styles.assignTab, assignTab === 'subject' && styles.assignTabActive]}
                  onPress={() => setAssignTab('subject')}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.assignTabLabel, assignTab === 'subject' && styles.assignTabLabelActive]} numberOfLines={1}>
                    {selectedSubject?.name || 'Subject'}
                  </Text>
                  {selectedSubjectId ? (
                    <Ionicons name="checkmark-circle" size={14} color={assignTab === 'subject' ? c.accent : c.success} />
                  ) : null}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.assignTab, assignTab === 'teacher' && styles.assignTabActive]}
                  onPress={() => setAssignTab('teacher')}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.assignTabLabel, assignTab === 'teacher' && styles.assignTabLabelActive]} numberOfLines={1}>
                    {selectedTeacherName || 'Teacher'}
                  </Text>
                  {selectedTeacherId ? (
                    <Ionicons name="checkmark-circle" size={14} color={assignTab === 'teacher' ? c.accent : c.success} />
                  ) : (
                    <Text style={styles.assignTabOptional}>opt</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.assignPanels, assignSplit && styles.assignPanelsSplit]}>
              {(assignSplit || assignTab === 'subject') && (
                <View style={[styles.assignPanel, assignSplit && styles.assignPanelSplit]}>
                  <View style={styles.assignSectionHead}>
                    <Text style={styles.assignSectionTitle}>Subject</Text>
                    <Text style={styles.assignSectionCount}>{filteredSubjects.length}</Text>
                  </View>
                  {subjects.length > 8 && (
                    <View style={styles.searchField}>
                      <Ionicons name="search" size={14} color={c.textMuted} />
                      <AppTextInput
                        style={[ds.inputInChrome, styles.searchInput]}
                        value={subjectQuery}
                        onChangeText={setSubjectQuery}
                        placeholder="Search subjects…"
                        placeholderTextColor={c.textMuted}
                        autoCorrect={false}
                        autoCapitalize="none"
                      />
                      {subjectQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSubjectQuery('')} hitSlop={8}>
                          <Ionicons name="close-circle" size={15} color={c.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                  <ScrollView
                    style={styles.assignPanelScroll}
                    contentContainerStyle={styles.assignPanelScrollContent}
                    showsVerticalScrollIndicator={Platform.OS === 'web'}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                  >
                    <View style={styles.selectGroup}>
                      {filteredSubjects.length === 0 ? (
                        <Text style={styles.selectEmpty}>No subjects match “{subjectQuery}”</Text>
                      ) : (
                        filteredSubjects.map(sub => {
                          const sp = subjectPalette(sub.id || sub.name || '', isDark);
                          const active = selectedSubjectId === sub.id;
                          return (
                            <TouchableOpacity
                              key={sub.id}
                              style={[styles.selectItem, active && styles.selectItemActive]}
                              onPress={() => {
                                setSelectedSubjectId(sub.id);
                                if (!assignSplit) setAssignTab('teacher');
                              }}
                              activeOpacity={0.7}
                            >
                              <View style={[styles.subjectSwatchLg, { backgroundColor: sp.solid }]} />
                              <Text style={[styles.selectItemText, active && styles.selectItemTextActive]} numberOfLines={1}>
                                {sub.name}
                              </Text>
                              <View style={[styles.selectCheck, active && styles.selectCheckOn]}>
                                {active ? <Ionicons name="checkmark" size={12} color={c.onAccent} /> : null}
                              </View>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  </ScrollView>
                </View>
              )}

              {(assignSplit || assignTab === 'teacher') && (
                <View style={[styles.assignPanel, assignSplit && styles.assignPanelSplit]}>
                  <View style={styles.assignSectionHead}>
                    <Text style={styles.assignSectionTitle}>
                      Teacher <Text style={styles.optionalLabel}>optional</Text>
                    </Text>
                    <Text style={styles.assignSectionCount}>{filteredStaff.length}</Text>
                  </View>
                  {staff.length > 8 && (
                    <View style={styles.searchField}>
                      <Ionicons name="search" size={14} color={c.textMuted} />
                      <AppTextInput
                        style={[ds.inputInChrome, styles.searchInput]}
                        value={teacherQuery}
                        onChangeText={setTeacherQuery}
                        placeholder="Search teachers…"
                        placeholderTextColor={c.textMuted}
                        autoCorrect={false}
                        autoCapitalize="none"
                      />
                      {teacherQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setTeacherQuery('')} hitSlop={8}>
                          <Ionicons name="close-circle" size={15} color={c.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                  <ScrollView
                    style={styles.assignPanelScroll}
                    contentContainerStyle={styles.assignPanelScrollContent}
                    showsVerticalScrollIndicator={Platform.OS === 'web'}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                  >
                    <View style={styles.selectGroup}>
                      <TouchableOpacity
                        onPress={() => setSelectedTeacherId('')}
                        style={[styles.selectItem, selectedTeacherId === '' && styles.selectItemActive]}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.pickerAvatar, styles.pickerAvatarEmpty]}>
                          <Ionicons name="person-outline" size={14} color={c.textMuted} />
                        </View>
                        <Text style={[styles.selectItemText, selectedTeacherId === '' && styles.selectItemTextActive]}>
                          No teacher
                        </Text>
                        <View style={[styles.selectCheck, selectedTeacherId === '' && styles.selectCheckOn]}>
                          {selectedTeacherId === '' ? <Ionicons name="checkmark" size={12} color={c.onAccent} /> : null}
                        </View>
                      </TouchableOpacity>
                      {filteredStaff.length === 0 ? (
                        <Text style={styles.selectEmpty}>No teachers match “{teacherQuery}”</Text>
                      ) : (
                        filteredStaff.map(st => {
                          const name = st.display_name || st.first_name || st.staff_code || 'Staff';
                          const active = selectedTeacherId === st.id;
                          const isCT = !!(classTeacherName && name === classTeacherName);
                          return (
                            <TouchableOpacity
                              key={st.id}
                              style={[styles.selectItem, active && styles.selectItemActive]}
                              onPress={() => setSelectedTeacherId(st.id)}
                              activeOpacity={0.7}
                            >
                              <View style={[styles.pickerAvatar, active && styles.pickerAvatarActive]}>
                                <Text style={[styles.pickerAvatarText, active && styles.pickerAvatarTextActive]}>
                                  {personInitials(name)}
                                </Text>
                              </View>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={[styles.selectItemText, active && styles.selectItemTextActive]} numberOfLines={1}>
                                  {name}
                                </Text>
                                {isCT ? <Text style={styles.selectItemSub}>Current class teacher</Text> : null}
                              </View>
                              {isPeriod1ClassTeacherSlot && active ? (
                                <View style={styles.ctMiniBadge}>
                                  <Text style={styles.ctMiniBadgeText}>CT</Text>
                                </View>
                              ) : null}
                              <View style={[styles.selectCheck, active && styles.selectCheckOn]}>
                                {active ? <Ionicons name="checkmark" size={12} color={c.onAccent} /> : null}
                              </View>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  </ScrollView>
                </View>
              )}
            </View>

            <View style={styles.assignFooter}>
              {existingActiveSlot ? (
                <TouchableOpacity
                  style={styles.actionBtnDangerIcon}
                  onPress={handleDeleteSlot}
                  disabled={slotSaving}
                  activeOpacity={0.7}
                  accessibilityLabel="Clear assignment"
                >
                  <Ionicons name="trash-outline" size={16} color={c.danger} />
                </TouchableOpacity>
              ) : (
                <View style={styles.actionBtnDangerIconPlaceholder} />
              )}
              <TouchableOpacity
                style={styles.actionBtnGhost}
                onPress={closeAssignModal}
                disabled={slotSaving}
                activeOpacity={0.7}
              >
                <Text style={styles.actionBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnPrimary, !canSaveSlot && styles.actionBtnPrimaryDisabled]}
                onPress={handleSaveSlot}
                disabled={!canSaveSlot}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark" size={15} color={c.onAccent} />
                <Text style={styles.actionBtnPrimaryText}>
                  {slotSaving ? 'Saving…' : existingActiveSlot ? 'Update' : 'Assign'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════════════════════ MODAL: Edit Single Period ════════════════════ */}
      <Modal transparent visible={editPeriodModalVisible} onRequestClose={() => setEditPeriodModalVisible(false)} animationType="fade">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalTitleGroup}>
                <Text style={styles.modalTitle}>Edit Period</Text>
                {editingPeriod && (
                  <View style={styles.modalBadge}>
                    <Text style={styles.modalBadgeText}>{editingPeriod.name}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => setEditPeriodModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={16} color={c.textMuted} />
              </TouchableOpacity>
            </View>

            {editingPeriod && (
              <>
                <Text style={styles.inputLabel}>Period Name</Text>
                <AppTextInput
                  style={styles.inputField}
                  value={editingPeriod.name}
                  onChangeText={t => setEditingPeriod({ ...editingPeriod, name: t })}
                  placeholder="e.g. Period 1"
                  placeholderTextColor={c.textMuted}
                />

                <Text style={styles.inputLabel}>Time Range <Text style={styles.inputHint}>(HH:MM:SS)</Text></Text>
                <View style={styles.timeRangeRow}>
                  <View style={[styles.timeInputWrap, { flex: 1 }]}>
                    <Ionicons name="play-outline" size={11} color={c.textMuted} style={{ marginRight: 6 }} />
                    <AppTextInput
                      style={[ds.inputInChrome, styles.timeInput, { flex: 1 }]}
                      value={editingPeriod.start_time}
                      onChangeText={t => setEditingPeriod({ ...editingPeriod, start_time: t })}
                      placeholder="09:00:00"
                      placeholderTextColor={c.textMuted}
                    />
                  </View>
                  <Text style={styles.timeArrow}>→</Text>
                  <View style={[styles.timeInputWrap, { flex: 1 }]}>
                    <Ionicons name="stop-outline" size={11} color={c.textMuted} style={{ marginRight: 6 }} />
                    <AppTextInput
                      style={[ds.inputInChrome, styles.timeInput, { flex: 1 }]}
                      value={editingPeriod.end_time}
                      onChangeText={t => setEditingPeriod({ ...editingPeriod, end_time: t })}
                      placeholder="10:00:00"
                      placeholderTextColor={c.textMuted}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.breakToggleRow}
                  onPress={() => setEditingPeriod({ ...editingPeriod, is_break: !editingPeriod.is_break })}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={editingPeriod.is_break ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={editingPeriod.is_break ? c.accent : c.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.breakToggleLabel}>Break / Lunch period</Text>
                    <Text style={styles.breakToggleHint}>No subject or teacher is assigned to break slots.</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.actionBtnDanger} onPress={handleDeletePeriod}>
                    <Ionicons name="trash-outline" size={15} color={c.danger} />
                    <Text style={styles.actionBtnDangerText}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtnGhost} onPress={() => setEditPeriodModalVisible(false)}>
                    <Text style={styles.actionBtnGhostText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtnPrimary} onPress={handleSaveSinglePeriod}>
                    <Ionicons name="checkmark" size={15} color={c.onAccent} />
                    <Text style={styles.actionBtnPrimaryText}>Update</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════ MODAL: Manage All Periods ════════════════════ */}
      <Modal transparent visible={managePeriodsVisible} onRequestClose={() => !actionLoading && setManagePeriodsVisible(false)} animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalSheet, { maxHeight: '90%' }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalTitleGroup}>
                <Text style={styles.modalTitle}>Manage Timings</Text>
                <View style={styles.modalBadge}>
                  <Text style={styles.modalBadgeText}>{countTeachingPeriods(editedPeriods)} periods</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setManagePeriodsVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={16} color={c.textMuted} />
              </TouchableOpacity>
            </View>

            {/* School Start Time Adjuster */}
            {editedPeriods.length > 0 && (
              <View style={styles.startTimeAdjuster}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="time-outline" size={14} color={c.accent} />
                  <Text style={styles.startTimeLabel}>School starts at</Text>
                </View>
                <View style={styles.stepperRow}>
                  <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustStartTime(-5)}>
                    <Ionicons name="remove" size={16} color={c.accentText} />
                  </TouchableOpacity>
                  <Text style={styles.stepperValue}>{fmt(editedPeriods[0].start_time)}</Text>
                  <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustStartTime(5)}>
                    <Ionicons name="add" size={16} color={c.accentText} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false}>
              {editedPeriods.map((period, index) => {
                const durationMins = getMins(period.end_time) - getMins(period.start_time);
                const duration = getDurationLabel(period.start_time, period.end_time);
                const isBreak = period.is_break || isBreakPeriod(period.name);
                const teachingNum = isBreak ? null : getTeachingPeriodNumber(editedPeriods, index);

                return (
                  <React.Fragment key={period.id}>
                    <View style={[styles.bulkPeriodRow, isBreak && styles.bulkPeriodRowBreak]}>
                      <View style={[styles.bulkPeriodNumBadge, isBreak && styles.bulkPeriodNumBadgeBreak]}>
                        {isBreak ? (
                          <Ionicons name="cafe-outline" size={12} color={c.onAccent} />
                        ) : (
                          <Text style={styles.bulkPeriodNum}>{teachingNum}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.bulkHeaderRow}>
                          <AppTextInput
                            style={[styles.bulkPeriodNameInput, isBreak && styles.bulkPeriodNameBreak]}
                            value={period.name}
                            onChangeText={(text) => updatePeriodName(index, text)}
                            placeholder={isBreak ? 'Break' : `Period ${teachingNum}`}
                            placeholderTextColor={c.textMuted}
                          />
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <Text style={[styles.timeRangeLabel, isBreak && styles.timeRangeLabelBreak]}>
                              {fmt(period.start_time)} – {fmt(period.end_time)}
                            </Text>
                            <TouchableOpacity
                              onPress={() => (isBreak ? removeBreak(index) : removePeriodAt(index))}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="trash-outline" size={14} color={c.danger} />
                            </TouchableOpacity>
                          </View>
                        </View>

                        <View style={styles.durationStepperRow}>
                          <TouchableOpacity
                            style={[styles.stepperBtn, durationMins <= 5 && styles.stepperBtnDisabled]}
                            onPress={() => adjustDuration(index, -5)}
                            disabled={durationMins <= 5}
                          >
                            <Ionicons name="remove" size={16} color={durationMins <= 5 ? c.textFaint : c.accentText} />
                          </TouchableOpacity>

                          <View style={[styles.durationBadgeLarge, isBreak && styles.durationBadgeBreak]}>
                            <Text style={[styles.durationTextLarge, isBreak && styles.durationTextBreak]}>
                              {duration || `${durationMins}m`}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={styles.stepperBtn}
                            onPress={() => adjustDuration(index, 5)}
                          >
                            <Ionicons name="add" size={16} color={c.accentText} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>

                    {index < editedPeriods.length - 1 && (
                      <View style={styles.addSlotActions}>
                        <TouchableOpacity style={styles.addSlotBtn} onPress={() => insertPeriodAfter(index)}>
                          <View style={styles.addBreakLine} />
                          <View style={[styles.addBreakPill, styles.addPeriodPill]}>
                            <Ionicons name="add-circle-outline" size={10} color={c.accent} />
                            <Text style={[styles.addBreakText, styles.addPeriodText]}>Add Period</Text>
                          </View>
                          <View style={styles.addBreakLine} />
                        </TouchableOpacity>
                        {!isBreak && !isBreakPeriod(editedPeriods[index + 1]?.name) && (
                          <TouchableOpacity style={styles.addSlotBtn} onPress={() => insertBreakAfter(index)}>
                            <View style={styles.addBreakLine} />
                            <View style={styles.addBreakPill}>
                              <Ionicons name="cafe-outline" size={10} color={c.warning} />
                              <Text style={styles.addBreakText}>Add Break</Text>
                            </View>
                            <View style={styles.addBreakLine} />
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </React.Fragment>
                );
              })}

              <TouchableOpacity style={styles.addPeriodFooterBtn} onPress={() => insertPeriodAfter(editedPeriods.length - 1)}>
                <Ionicons name="add-circle-outline" size={16} color={c.accent} />
                <Text style={styles.addPeriodFooterText}>Add Period at End</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.actionBtnGhost}
                onPress={() => setManagePeriodsVisible(false)}
                disabled={actionLoading}
              >
                <Text style={styles.actionBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnPrimary, { flex: 2 }, actionLoading && styles.actionBtnPrimaryDisabled]}
                onPress={handleSavePeriods}
                disabled={actionLoading}
                activeOpacity={0.7}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color={c.onAccent} />
                ) : (
                  <Ionicons name="save-outline" size={15} color={c.onAccent} />
                )}
                <Text style={styles.actionBtnPrimaryText}>
                  {actionLoading ? 'Saving…' : 'Save All'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════ MODAL: Create Period ════════════════════ */}
      <Modal transparent visible={createPeriodVisible} onRequestClose={() => setCreatePeriodVisible(false)} animationType="fade">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalTitleGroup}>
                <Text style={styles.modalTitle}>New Period</Text>
                <View style={styles.modalBadge}>
                  <Text style={styles.modalBadgeText}>#{periods.length + 1}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setCreatePeriodVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={16} color={c.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Period Name</Text>
            <AppTextInput
              style={styles.inputField}
              value={newPeriodName}
              onChangeText={setNewPeriodName}
              placeholder={`e.g. Period ${periods.length + 1}`}
              placeholderTextColor={c.textMuted}
            />

            <View style={styles.bulkHeaderRow}>
              <Text style={styles.inputLabel}>Time Range <Text style={styles.inputHint}>(HH:MM:SS)</Text></Text>
              {getDurationLabel(newPeriodStart, newPeriodEnd) && (
                <View style={[styles.durationBadge, { marginTop: 14 }]}>
                  <Text style={styles.durationText}>{getDurationLabel(newPeriodStart, newPeriodEnd)}</Text>
                </View>
              )}
            </View>
            <View style={styles.timeRangeRow}>
              <View style={[styles.timeInputWrap, { flex: 1 }]}>
                <Ionicons name="play-outline" size={11} color={c.textMuted} style={{ marginRight: 6 }} />
                <AppTextInput
                  style={[ds.inputInChrome, styles.timeInput, { flex: 1 }]}
                  value={newPeriodStart}
                  onChangeText={setNewPeriodStart}
                  placeholder="14:15:00"
                  placeholderTextColor={c.textMuted}
                />
              </View>
              <Text style={styles.timeArrow}>→</Text>
              <View style={[styles.timeInputWrap, { flex: 1 }]}>
                <Ionicons name="stop-outline" size={11} color={c.textMuted} style={{ marginRight: 6 }} />
                <AppTextInput
                  style={[ds.inputInChrome, styles.timeInput, { flex: 1 }]}
                  value={newPeriodEnd}
                  onChangeText={setNewPeriodEnd}
                  placeholder="15:00:00"
                  placeholderTextColor={c.textMuted}
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.breakToggleRow}
              onPress={() => setNewPeriodIsBreak(v => !v)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={newPeriodIsBreak ? 'checkbox' : 'square-outline'}
                size={20}
                color={newPeriodIsBreak ? c.accent : c.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.breakToggleLabel}>Break / Lunch period</Text>
                <Text style={styles.breakToggleHint}>No subject or teacher is assigned to break slots.</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.actionBtnGhost} onPress={() => setCreatePeriodVisible(false)}>
                <Text style={styles.actionBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnPrimary, { flex: 2 }]}
                onPress={async () => {
                  if (!newPeriodName || !newPeriodStart || !newPeriodEnd) {
                    alertCompat('Missing fields', 'Please fill in name and both times');
                    return;
                  }
                  try {
                    setActionLoading(true);
                    const created = await TimetableService.createPeriod({
                      name: newPeriodName,
                      start_time: newPeriodStart,
                      end_time: newPeriodEnd,
                      is_break: newPeriodIsBreak,
                    });
                    setPeriods([...periods, created]);
                    setCreatePeriodVisible(false);
                    alertCompat('Created', `"${created.name}" added to schedule`);
                  } catch (error: any) {
                    alertCompat('Error', error.response?.data?.error || 'Failed to create period');
                  } finally { setActionLoading(false); }
                }}
              >
                <Ionicons name="add-circle-outline" size={15} color={c.onAccent} />
                <Text style={styles.actionBtnPrimaryText}>Create Period</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Shadows are light-mode only — on dark we rely on surface elevation + borders,
// because drop shadows are invisible on a dark base and just add muddy halos.
const softShadow = (c: Tokens) =>
  c.dark
    ? { elevation: 0 }
    : Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
        android: { elevation: 3 },
      });

const cardShadow = (c: Tokens) =>
  c.dark
    ? { elevation: 0 }
    : Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
        android: { elevation: 1 },
      });

const getStyles = (c: Tokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },

    // ── Sticky premium filter toolbar ──
    contextBarOuter: {
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.borderSoft,
      zIndex: 5,
      ...softShadow(c),
    },
    contextBarInner: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    filterToolbar: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    filterToolbarScroll: {
      flex: 1,
      minWidth: 0,
    },
    filterToolbarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingRight: 4,
    },
    filterToolbarMeta: {
      maxWidth: 120,
      paddingLeft: 8,
      borderLeftWidth: 1,
      borderLeftColor: c.borderSoft,
    },
    filterToolbarMetaText: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textMuted,
      textAlign: 'right',
    },

    // Premium dropdown trigger + menu
    ddTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 118,
      maxWidth: 168,
      paddingVertical: 7,
      paddingLeft: 8,
      paddingRight: 10,
      borderRadius: 12,
      backgroundColor: c.surfaceSunken,
      borderWidth: 1,
      borderColor: c.border,
    },
    ddTriggerWide: {
      minWidth: 132,
      maxWidth: 190,
    },
    ddTriggerDisabled: {
      opacity: 0.55,
    },
    ddIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 9,
      backgroundColor: c.accentSoft,
      borderWidth: 1,
      borderColor: c.accentSoftBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ddTextCol: {
      flex: 1,
      minWidth: 0,
    },
    ddEyebrow: {
      fontSize: 9,
      fontWeight: '800',
      color: c.textMuted,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginBottom: 1,
    },
    ddValue: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textPrimary,
      letterSpacing: -0.2,
    },
    ddOverlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 40,
    },
    ddMenu: {
      width: '100%',
      maxWidth: 360,
      maxHeight: '72%',
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
      ...softShadow(c),
    },
    ddMenuHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.borderSoft,
      backgroundColor: c.surfaceAlt,
    },
    ddMenuHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      minWidth: 0,
    },
    ddMenuIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor: c.accentSoft,
      borderWidth: 1,
      borderColor: c.accentSoftBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ddMenuTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: c.textPrimary,
      letterSpacing: -0.2,
    },
    ddMenuSub: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textMuted,
      marginTop: 1,
    },
    ddMenuClose: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.chipBg,
      borderWidth: 1,
      borderColor: c.chipBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ddMenuScroll: {
      maxHeight: 360,
      paddingVertical: 6,
    },
    ddOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
      paddingRight: 14,
      marginHorizontal: 8,
      marginVertical: 2,
      borderRadius: 12,
    },
    ddOptionActive: {
      backgroundColor: c.accentSoft,
    },
    ddOptionRail: {
      width: 3,
      alignSelf: 'stretch',
      borderRadius: 99,
      backgroundColor: c.accent,
      marginVertical: 2,
    },
    ddOptionRailSpacer: {
      width: 3,
    },
    ddOptionLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textSecondary,
    },
    ddOptionLabelActive: {
      color: c.accentText,
      fontWeight: '800',
    },
    ddOptionHint: {
      fontSize: 11,
      fontWeight: '500',
      color: c.textMuted,
      marginTop: 1,
    },
    ddOptionDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.success,
    },
    ddOptionCheck: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },

    contextMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
    },
    contextIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor: c.accentSoft,
      borderWidth: 1,
      borderColor: c.accentSoftBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contextTitle: {
      fontSize: 14.5,
      fontWeight: '800',
      color: c.textPrimary,
      letterSpacing: -0.2,
    },
    contextSub: {
      fontSize: 11,
      fontWeight: '600',
      color: c.textMuted,
      marginTop: 1,
    },
    contextChevWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.chipBg,
      borderWidth: 1,
      borderColor: c.chipBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contextChevWrapOpen: {
      backgroundColor: c.accentSoft,
      borderColor: c.accentSoftBorder,
    },
    contextProgress: {
      alignItems: 'flex-end',
      paddingLeft: 12,
      marginLeft: 2,
      borderLeftWidth: 1,
      borderLeftColor: c.borderSoft,
      gap: 1,
      flexShrink: 0,
    },
    contextProgressRing: {
      minWidth: 36,
      alignItems: 'flex-end',
    },
    contextPct: {
      fontSize: 15,
      fontWeight: '800',
      color: c.accentText,
      textAlign: 'right',
    },
    contextProgressHint: {
      fontSize: 9,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    // ── Legacy filter helpers (chips still used in dialogs) ──
    filtersOuter: {
      backgroundColor: c.surfaceSunken,
      borderBottomWidth: 1,
      borderBottomColor: c.borderSoft,
    },
    filtersInner: {
      width: '100%',
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 10,
      gap: 8,
    },
    filtersDivider: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.borderSoft,
    },

    filterRibbon: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
    },
    filterCard: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    filterRibbonLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      width: 52,
      flexShrink: 0,
    },
    filterRibbonLabelText: {
      fontSize: 11,
      fontWeight: '800',
      color: c.textMuted,
      letterSpacing: 0.2,
    },
    filterPair: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 0,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    filterPairStack: {
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: 8,
    },
    filterPairCol: {
      flex: 1,
      minWidth: 0,
    },
    filterPairColSec: {
      flex: 0,
      flexGrow: 0,
      paddingLeft: 4,
    },
    filterPairRule: {
      width: 1,
      alignSelf: 'stretch',
      backgroundColor: c.borderSoft,
      marginHorizontal: 10,
    },
    sectionChipWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      flexWrap: 'wrap',
    },
    sectionChip: {
      minWidth: 32,
      height: 30,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: c.chipBg,
      borderWidth: 1,
      borderColor: c.chipBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionChipText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: c.textSecondary,
    },

    selectorStack: { gap: 12 },
    selectorBlock: { width: '100%', minWidth: 0 },
    chipScroller: Platform.select({
      web: { width: '100%', overflowX: 'auto', flexGrow: 0, flexShrink: 1 } as const,
      default: { flexGrow: 0, flexShrink: 1 },
    }),
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: 4,
      gap: 5,
    },
    selectorRow: { flexDirection: 'row' },
    selectorGroup: { flex: 1, minWidth: 0 },
    selectorDivider: {
      width: 1,
      backgroundColor: c.borderSoft,
      marginHorizontal: 12,
      marginVertical: 2,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      marginRight: 6,
      backgroundColor: c.chipBg,
      borderWidth: 1,
      borderColor: c.chipBorder,
      flexShrink: 0,
    },
    chipSm: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: c.chipBg,
      borderWidth: 1,
      borderColor: c.chipBorder,
      flexShrink: 0,
    },
    chipSmText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: c.textSecondary,
    },
    chipDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.success,
    },
    chipDotOnActive: {
      backgroundColor: c.onAccent,
    },
    chipCurrentYear: {
      borderColor: c.success,
      borderWidth: 1,
    },
    activeChip: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    activeChipText: { color: c.onAccent },

    // Scheduling mode controls
    scheduleStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 7,
      paddingHorizontal: 10,
    },
    scheduleStripLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      minWidth: 0,
    },
    scheduleStripTitle: {
      fontSize: 12.5,
      fontWeight: '700',
      color: c.textPrimary,
    },
    scheduleStripHint: {
      fontSize: 10.5,
      fontWeight: '500',
      color: c.textMuted,
      marginTop: 1,
    },
    dayTabsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      flexWrap: 'wrap',
    },
    dayTab: {
      flexGrow: 1,
      flexBasis: 40,
      minWidth: 40,
      maxWidth: 64,
      height: 30,
      borderRadius: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.chipBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayTabText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: c.textSecondary,
    },
    filtersDoneBtn: {
      alignSelf: 'flex-end',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: c.accentSoft,
      borderWidth: 1,
      borderColor: c.accentSoftBorder,
    },
    filtersDoneBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.accentText,
    },
    modeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    modeToggle: {
      flexDirection: 'row',
      backgroundColor: c.chipBg,
      borderRadius: 8,
      padding: 2,
      borderWidth: 1,
      borderColor: c.chipBorder,
      flexShrink: 0,
    },
    modeBtn: {
      paddingHorizontal: 11,
      paddingVertical: 5,
      borderRadius: 6,
    },
    modeBtnActive: { backgroundColor: c.accent },
    modeBtnText: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    modeBtnTextActive: { color: c.onAccent },
    modeHint: { fontSize: 12, color: c.textMuted, marginTop: 6 },

    // Destructive confirm card
    confirmCard: {
      width: '86%',
      maxWidth: 460,
      alignSelf: 'center',
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: c.borderSoft,
    },
    confirmTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: c.textPrimary,
      textAlign: 'center',
      marginBottom: 8,
    },
    confirmBody: {
      fontSize: 13,
      lineHeight: 19,
      color: c.textSecondary,
      textAlign: 'center',
    },
    confirmActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 20,
    },
    confirmBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    confirmBtnGhost: {
      backgroundColor: c.chipBg,
      borderWidth: 1,
      borderColor: c.chipBorder,
    },
    confirmBtnGhostText: { fontSize: 14, fontWeight: '700', color: c.textSecondary },
    confirmBtnDanger: { backgroundColor: c.danger },
    confirmBtnDangerText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

    // Break-period toggle (period editor)
    breakToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 14,
      paddingVertical: 4,
    },
    breakToggleLabel: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    breakToggleHint: { fontSize: 11, color: c.textMuted, marginTop: 1 },

    // Mapping Banner (periods visible, but class-section not linked)
    mappingBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginTop: 4,
      marginBottom: 8,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: c.warningSoft,
      borderWidth: 1,
      borderColor: c.warningSoftBorder,
      borderLeftWidth: 3,
      borderLeftColor: c.warning,
    },
    mappingBannerIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: c.warningAvatar,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 0,
    },
    mappingBannerTitle: {
      fontSize: 13.5,
      fontWeight: '800',
      color: c.warningText,
      letterSpacing: -0.2,
    },
    mappingBannerSub: {
      fontSize: 12,
      color: c.warningText,
      opacity: 0.85,
      marginTop: 4,
      lineHeight: 17,
    },

    // Teacher Banner
    teacherBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 4,
      marginBottom: 2,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: c.successSoft,
      borderWidth: 1,
      borderColor: c.successSoftBorder,
    },
    teacherAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.successAvatar,
      alignItems: 'center',
      justifyContent: 'center',
    },
    teacherBannerName: {
      fontSize: 13,
      fontWeight: '700',
      color: c.successText,
    },
    teacherBannerSub: {
      fontSize: 11,
      color: c.success,
      marginTop: 1,
    },
    ctBadge: {
      backgroundColor: c.success,
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    ctBadgeText: {
      fontSize: 11,
      fontWeight: '800',
      color: c.dark ? '#0B1020' : '#fff',
      letterSpacing: 0.5,
    },

    // Progress Strip
    progressStrip: {
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    progressMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 7,
    },
    progressLabel: {
      fontSize: 12,
      color: c.textMuted,
      fontWeight: '500',
      flex: 1,
      marginRight: 8,
    },
    progressPct: {
      fontSize: 13,
      color: c.accentText,
      fontWeight: '800',
    },
    progressPctDone: { color: c.successText },
    progressTrack: {
      height: 5,
      borderRadius: 99,
      backgroundColor: c.trackBg,
      overflow: 'hidden',
    },

    // Grid
    gridContainer: {
      flex: 1,
    },
    gridScrollContent: {
      paddingTop: 8,
    },
    gridInner: {
      width: '100%',
      paddingHorizontal: 12,
    },

    // Day Summary Strip
    daySummary: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginTop: 6,
      marginBottom: 8,
      borderRadius: 10,
      backgroundColor: c.surfaceSunken,
      borderWidth: 1,
      borderColor: c.borderSoft,
    },
    daySummaryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    daySummaryStrong: {
      fontSize: 12.5,
      fontWeight: '800',
      color: c.textPrimary,
      letterSpacing: -0.2,
    },
    daySummaryMuted: {
      fontSize: 11.5,
      fontWeight: '600',
      color: c.textMuted,
    },
    daySummaryDivider: {
      width: 1,
      height: 12,
      backgroundColor: c.border,
    },

    loaderText: { marginTop: 12, fontSize: 13, color: c.textMuted },

    // Row Card
    rowCard: {
      flexDirection: 'row',
      marginBottom: 5,
      borderRadius: 11,
      overflow: 'hidden',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      minHeight: 52,
      ...cardShadow(c),
    },
    rowCardLive: {
      borderColor: c.accent,
      borderWidth: 1.5,
    },
    rowCardBlocked: {
      opacity: 0.72,
      backgroundColor: c.surfaceSunken,
    },
    rowAccent: {
      width: 3,
      backgroundColor: c.border,
    },

    // Period column — horizontal compact time
    periodCell: {
      width: 118,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingVertical: 8,
      paddingHorizontal: 8,
      gap: 7,
      backgroundColor: c.surfaceAlt,
      borderRightWidth: 1,
      borderRightColor: c.borderAccent,
    },
    periodCellCompact: {
      width: 92,
      paddingHorizontal: 6,
      gap: 5,
    },
    periodBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.badgeIdleBg,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    periodBadgeFilled: {
      backgroundColor: c.accent,
    },
    periodBadgeBlocked: {
      backgroundColor: c.textFaint,
    },
    periodBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#ffffff',
    },
    periodTimeBlock: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    periodTimeRange: {
      fontSize: 10.5,
      fontWeight: '700',
      color: c.accentText,
      letterSpacing: -0.2,
    },
    periodTime: {
      fontSize: 10,
      fontWeight: '600',
      color: c.accentText,
      textAlign: 'center',
    },
    periodTimeEnd: { color: c.textMuted },
    periodTimeDivider: {
      width: 14,
      height: 1,
      backgroundColor: c.borderAccent,
      marginVertical: 1,
    },
    periodDuration: {
      fontSize: 9,
      fontWeight: '700',
      color: c.textMuted,
      letterSpacing: 0.2,
    },

    // Slot column
    slotCell: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 8,
      minWidth: 0,
    },
    slotFilledContent: { flex: 1, gap: 2, minWidth: 0 },
    subjectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    subjectDot: {
      width: 7,
      height: 7,
      borderRadius: 3,
    },
    slotSubjectText: {
      flex: 1,
      fontSize: 13.5,
      fontWeight: '700',
      color: c.textPrimary,
      letterSpacing: -0.2,
    },
    teacherRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginLeft: 14,
    },
    slotTeacherText: {
      fontSize: 11.5,
      color: c.textSecondary,
      fontWeight: '500',
      flexShrink: 1,
    },
    slotTeacherEmpty: {
      color: c.textFaint,
      fontStyle: 'italic',
    },
    slotEmptyContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
    },
    addIconWrap: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: c.accentSoftBorder,
      borderStyle: 'dashed',
      flexShrink: 0,
    },
    lockIconWrap: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.chipBorder,
      flexShrink: 0,
    },
    slotEmptyText: {
      fontSize: 12.5,
      color: c.accentText,
      fontWeight: '600',
    },
    slotBlockedText: {
      fontSize: 12,
      color: c.textMuted,
      fontWeight: '500',
    },
    slotTrailing: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginLeft: 'auto',
      paddingLeft: 6,
      flexShrink: 0,
    },
    nowPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.accent,
      borderRadius: 99,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    nowDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.onAccent,
    },
    nowPillText: {
      fontSize: 9,
      fontWeight: '800',
      color: c.onAccent,
      letterSpacing: 0.8,
    },

    // Break Row
    breakRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 1,
      marginBottom: 6,
      paddingHorizontal: 4,
    },
    breakLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.warningSoftBorder,
    },
    breakPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 99,
      backgroundColor: c.warningSoft,
      borderWidth: 1,
      borderColor: c.warningSoftBorder,
      marginHorizontal: 8,
    },
    breakLabel: {
      fontSize: 9.5,
      fontWeight: '800',
      color: c.warning,
      letterSpacing: 0.6,
    },

    // Empty State
    emptyState: {
      alignItems: 'center',
      paddingVertical: 52,
    },
    emptyIconWrap: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emptyIconWrapError: { backgroundColor: c.dangerSoft },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 5,
    },
    emptySubtitle: {
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
    },

    // Add Period Button
    addPeriodBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginTop: 8,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.accentSoftBorder,
      borderStyle: 'dashed',
      backgroundColor: c.accentSoft,
    },
    addPeriodBtnTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: c.accentText,
    },
    addPeriodBtnHint: {
      fontSize: 11,
      fontWeight: '500',
      color: c.textMuted,
      marginTop: 1,
    },
    // NOTE: addPeriodText is defined later in this sheet (the later duplicate
    // won at runtime, so only that definition is kept).

    // Modal Base
    modalOverlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'flex-end',
    },
    modalOverlayCenter: {
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 24,
    },
    modalSheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: Platform.OS === 'ios' ? 36 : 20,
      maxHeight: '85%',
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      borderWidth: c.dark ? 1 : 0,
      borderColor: c.border,
    },
    modalCard: {
      backgroundColor: c.surface,
      borderRadius: 20,
      padding: 20,
      margin: 16,
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
      borderWidth: c.dark ? 1 : 0,
      borderColor: c.border,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 99,
      backgroundColor: c.border,
      alignSelf: 'center',
      marginBottom: 18,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    modalTitleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: c.textPrimary,
      letterSpacing: -0.3,
    },
    modalBadge: {
      backgroundColor: c.accentSoft,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: c.accentSoftBorder,
    },
    modalBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: c.accentText,
    },
    modalCloseBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionalLabel: {
      fontWeight: '500',
      color: c.textMuted,
      textTransform: 'none',
      letterSpacing: 0,
      fontSize: 11,
    },

    // Select List (shared by assign modal)
    selectGroup: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: c.surfaceSunken,
    },
    selectItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 9,
      gap: 9,
      minHeight: 42,
      borderBottomWidth: 1,
      borderBottomColor: c.borderSoft,
    },
    selectItemActive: {
      backgroundColor: c.accentSoft,
    },
    subjectSwatch: {
      width: 12,
      height: 12,
      borderRadius: 4,
    },
    subjectSwatchLg: {
      width: 14,
      height: 14,
      borderRadius: 4,
    },
    selectCheck: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectCheckOn: {
      borderColor: c.accent,
      backgroundColor: c.accent,
    },
    selectItemText: {
      fontSize: 13.5,
      color: c.textSecondary,
      flex: 1,
      fontWeight: '500',
    },
    selectItemTextActive: {
      color: c.accentText,
      fontWeight: '700',
    },
    selectItemSub: {
      fontSize: 10.5,
      color: c.textMuted,
      marginTop: 1,
    },
    selectEmpty: {
      paddingHorizontal: 14,
      paddingVertical: 16,
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
    },

    // Assign Slot sheet
    assignSheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 10,
      paddingHorizontal: 16,
      paddingBottom: Platform.OS === 'ios' ? 28 : 16,
      maxHeight: '92%',
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      borderWidth: c.dark ? 1 : 0,
      borderColor: c.border,
    },
    assignSheetWide: {
      maxWidth: 720,
      borderRadius: 20,
      marginBottom: Platform.OS === 'web' ? 24 : 0,
      maxHeight: Platform.OS === 'web' ? '88%' : '92%',
    },
    assignMeta: {
      marginTop: 4,
      fontSize: 12,
      fontWeight: '500',
      color: c.textMuted,
    },
    ctHintSlim: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 10,
      paddingVertical: 7,
      marginBottom: 10,
      borderRadius: 8,
      backgroundColor: c.warningSoft,
      borderWidth: 1,
      borderColor: c.warningSoftBorder,
    },
    ctHintSlimText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
      color: c.warningText,
    },
    assignTabs: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 10,
      padding: 3,
      borderRadius: 12,
      backgroundColor: c.chipBg,
      borderWidth: 1,
      borderColor: c.chipBorder,
    },
    assignTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      minHeight: 38,
      paddingHorizontal: 10,
      borderRadius: 9,
    },
    assignTabActive: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    assignTabLabel: {
      flexShrink: 1,
      fontSize: 13,
      fontWeight: '600',
      color: c.textMuted,
    },
    assignTabLabelActive: {
      color: c.textPrimary,
      fontWeight: '700',
    },
    assignTabOptional: {
      fontSize: 10,
      fontWeight: '700',
      color: c.textFaint,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    assignPanels: {
      flexGrow: 0,
      flexShrink: 1,
      minHeight: 220,
      maxHeight: Platform.OS === 'web' ? 380 : 340,
    },
    assignPanelsSplit: {
      flexDirection: 'row',
      gap: 12,
      maxHeight: 400,
    },
    assignPanel: {
      flex: 1,
      minHeight: 0,
    },
    assignPanelSplit: {
      flex: 1,
      minWidth: 0,
    },
    assignPanelScroll: {
      flexGrow: 1,
      flexShrink: 1,
    },
    assignPanelScrollContent: {
      paddingBottom: 4,
    },
    assignSectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    assignSectionTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: c.textSecondary,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    assignSectionCount: {
      fontSize: 11,
      fontWeight: '700',
      color: c.textMuted,
      backgroundColor: c.chipBg,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 99,
      overflow: 'hidden',
    },
    searchField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 38,
      paddingHorizontal: 10,
      marginBottom: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.inputBorder,
      backgroundColor: c.inputBg,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: c.textPrimary,
      paddingVertical: Platform.OS === 'web' ? 8 : 6,
      outlineStyle: 'none' as any,
    },
    pickerAvatar: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.chipBg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    pickerAvatarEmpty: {
      backgroundColor: c.surface,
    },
    pickerAvatarActive: {
      backgroundColor: c.accentSoft,
      borderColor: c.accentSoftBorder,
    },
    pickerAvatarText: {
      fontSize: 9,
      fontWeight: '800',
      color: c.textMuted,
    },
    pickerAvatarTextActive: {
      color: c.accentText,
    },
    ctMiniBadge: {
      backgroundColor: c.successSoft,
      borderRadius: 5,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderWidth: 1,
      borderColor: c.successSoftBorder,
    },
    ctMiniBadgeText: {
      fontSize: 9,
      fontWeight: '800',
      color: c.successText,
      letterSpacing: 0.4,
    },
    assignFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.borderSoft,
    },
    actionBtnDangerIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.dangerSoftBorder,
    },
    actionBtnDangerIconPlaceholder: {
      width: 44,
      height: 44,
    },
    actionBtnPrimaryDisabled: {
      opacity: 0.45,
    },

    // Input
    inputLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textSecondary,
      marginBottom: 6,
      marginTop: 14,
    },
    inputHint: {
      fontWeight: '400',
      color: c.textMuted,
    },
    inputField: {
      borderWidth: 1,
      borderColor: c.inputBorder,
      borderRadius: 10,
      padding: 12,
      fontSize: 14,
      color: c.textPrimary,
      backgroundColor: c.inputBg,
    },
    timeRangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    timeInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 10,
      backgroundColor: c.inputBg,
    },
    timeInput: {
      fontSize: 13,
      color: c.textPrimary,
      padding: 0,
    },
    timeArrow: {
      fontSize: 14,
      color: c.textMuted,
      fontWeight: '700',
      marginHorizontal: 8,
    },

    // Bulk Period Edit
    bulkPeriodRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 14,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.borderSoft,
    },
    bulkPeriodNumBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    bulkPeriodNumBadgeBreak: { backgroundColor: c.warning },
    bulkPeriodNum: {
      fontSize: 11,
      fontWeight: '800',
      color: '#ffffff',
    },
    bulkPeriodName: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textSecondary,
      marginBottom: 8,
    },
    bulkPeriodNameInput: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 8,
      marginRight: 8,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.borderSoft,
      backgroundColor: c.chipBg,
      minWidth: 0,
    },
    bulkPeriodNameBreak: { color: c.warningText },
    bulkPeriodRowBreak: {
      backgroundColor: c.warningSoft,
      borderBottomColor: c.warningSoftBorder,
    },
    bulkHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    durationBadge: {
      backgroundColor: c.trackBg,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    durationBadgeBreak: {
      backgroundColor: c.warningSoftBorder,
    },
    durationText: {
      fontSize: 10,
      fontWeight: '700',
      color: c.textMuted,
    },

    // Start Time Adjuster
    startTimeAdjuster: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: c.accentSoft,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: c.accentSoftBorder,
    },
    startTimeLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    stepperBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: c.stepperBg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.stepperBorder,
    },
    stepperBtnDisabled: {
      opacity: 0.4,
    },
    stepperValue: {
      fontSize: 14,
      fontWeight: '800',
      color: c.accentText,
      minWidth: 70,
      textAlign: 'center',
    },
    timeRangeLabel: {
      fontSize: 11,
      fontWeight: '500',
      color: c.textMuted,
    },
    timeRangeLabelBreak: { color: c.warning },
    durationStepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    durationBadgeLarge: {
      flex: 1,
      backgroundColor: c.trackBg,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: 'center',
    },
    durationTextLarge: {
      fontSize: 14,
      fontWeight: '800',
      color: c.accentText,
    },
    durationTextBreak: { color: c.warningText },

    // Add Break Button (inline)
    addBreakBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      marginTop: -6,
      paddingHorizontal: 4,
    },
    addBreakLine: {
      flex: 1,
      height: 1,
      backgroundColor: c.warningSoftBorder,
    },
    addBreakPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 99,
      backgroundColor: c.warningSoft,
      borderWidth: 1,
      borderColor: c.warningSoftBorder,
    },
    addBreakText: {
      fontSize: 10,
      fontWeight: '700',
      color: c.warning,
    },
    addSlotActions: {
      gap: 6,
      marginBottom: 10,
      marginTop: -4,
    },
    addSlotBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 4,
    },
    addPeriodPill: {
      backgroundColor: c.accentSoft,
      borderColor: c.accentSoftBorder,
    },
    addPeriodText: {
      color: c.accentText,
    },
    addPeriodFooterBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 4,
      marginBottom: 8,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.accentSoftBorder,
      backgroundColor: c.accentSoft,
    },
    addPeriodFooterText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.accentText,
    },

    // Action Buttons
    modalActions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 20,
    },
    actionBtnGhost: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      paddingVertical: 13,
      minHeight: 44,
      backgroundColor: c.chipBg,
      borderWidth: 1,
      borderColor: c.chipBorder,
    },
    actionBtnGhostText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textSecondary,
    },
    actionBtnPrimary: {
      flex: 1.35,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: c.accent,
      borderRadius: 12,
      paddingVertical: 13,
      minHeight: 44,
    },
    actionBtnPrimaryText: {
      fontSize: 14,
      fontWeight: '700',
      color: c.onAccent,
    },
    actionBtnDanger: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderRadius: 12,
      paddingVertical: 13,
      minHeight: 44,
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.dangerSoftBorder,
    },
    actionBtnDangerText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.danger,
    },
  });
