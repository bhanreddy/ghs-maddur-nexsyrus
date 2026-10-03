import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  StatusBar,
  TouchableOpacity,
  Platform,
  TextInput,
  LayoutAnimation,
  UIManager,
  ViewStyle,
  Modal,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import StaffHeader from '../../src/components/StaffHeader';
import SwipeableStudentCard from '../../src/components/SwipeableStudentCard';
import { staffTabBarReserve } from '../../src/components/StaffFooter';
import { useAuth } from '../../src/hooks/useAuth';
import { AttendanceService, currentSession, localAttendanceDate, MarkAttendanceRequest } from '../../src/services/attendanceService';
import { AttendanceStatus, AttendanceSession } from '../../src/types/schema';
import { useTheme } from '../../src/hooks/useTheme';
import type { SchoolTheme } from '../../src/theme/types';
import LogoLoader from '../../src/components/LogoLoader';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import AppDatePicker, { parseYMD } from '../../src/components/AppDatePicker';
import AbsenceInsightBottomSheet, { InsightStudentData } from '../../src/components/attendance/AbsenceInsightBottomSheet';
import { persistentQueryCache } from '../../src/services/persistentQueryCache';
import { attendanceOfflineQueue } from '../../src/services/attendanceOfflineQueue';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type SessionStatus = 'present' | 'absent' | 'unmarked';

interface StudentUI {
  id: string;
  enrollmentId?: string;
  name: string;
  rollNo: string;
  photoUrl: string | null;
  morningStatus: SessionStatus;
  afternoonStatus: SessionStatus;
  consecutiveAbsenceDays?: number;
  absenceStreakStartDate?: string | null;
  absenceStreakEndDate?: string | null;
  absenceStreakDates?: Array<{ date: string; status: string }>;
  monthlyAttendancePercentage?: number | null;
  absenceRiskLevel?: string | null;
  isIrregular?: boolean;
  monthlyAbsentCount?: number;
}

const toSessionStatus = (raw: string | null | undefined): SessionStatus =>
  raw === 'present' || raw === 'late' ? 'present' : raw === 'absent' ? 'absent' : 'unmarked';

const ACCENT = {
  emerald: '#059669',
  emeraldDeep: '#047857',
  rose: '#E11D48',
  roseDeep: '#BE123C',
  amber: '#D97706',
  amberDeep: '#B45309',
  indigo: '#4F46E5',
  violet: '#4F46E5',
  sky: '#0EA5E9',
};

/** Soft tint + border for a semantic accent color (used by overview chips). */
function tintFor(color: string, isDark: boolean): { bg: string; border: string } {
  const map: Record<string, { bg: string; border: string; darkBg: string; darkBorder: string }> = {
    [ACCENT.emerald]: { bg: '#ECFDF5', border: '#A7F3D0', darkBg: 'rgba(5,150,105,0.14)', darkBorder: 'rgba(5,150,105,0.3)' },
    [ACCENT.rose]: { bg: '#FFF1F2', border: '#FECDD3', darkBg: 'rgba(225,29,72,0.14)', darkBorder: 'rgba(225,29,72,0.3)' },
    [ACCENT.amber]: { bg: '#FFFBEB', border: '#FDE68A', darkBg: 'rgba(217,119,6,0.16)', darkBorder: 'rgba(217,119,6,0.32)' },
  };
  const t = map[color] ?? { bg: '#F1F5F9', border: '#E2E8F0', darkBg: 'rgba(255,255,255,0.05)', darkBorder: 'rgba(255,255,255,0.08)' };
  return isDark ? { bg: t.darkBg, border: t.darkBorder } : { bg: t.bg, border: t.border };
}

const IS_WEB = Platform.OS === 'web';

const sortByRollNo = (a: StudentUI, b: StudentUI) => {
  const ra = parseInt(a.rollNo, 10);
  const rb = parseInt(b.rollNo, 10);
  if (!Number.isNaN(ra) && !Number.isNaN(rb)) return ra - rb;
  return a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true });
};

// Clean, production surfaces: white cards with a hairline border and a soft
// neutral drop shadow (no neumorphism). `inset` is a subtle recessed panel.
function claySurface(isDark: boolean, depth: 'card' | 'inset' = 'card'): ViewStyle {
  if (depth === 'inset') {
    return {
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2F6',
    };
  }
  return {
    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.07)' : '#E7EBF0',
    ...(Platform.select({
      ios: { shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 6 }, shadowOpacity: isDark ? 0.4 : 0.08, shadowRadius: 16 },
      android: { elevation: 3 },
      web: { boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 6px 20px rgba(100,116,139,0.12)' } as object,
      default: {},
    })),
  };
}

type ClayTone = 'green' | 'neutral' | 'violet' | 'amber';

function clayButton(isDark: boolean, tone: ClayTone): ViewStyle {
  const palette: Record<ClayTone, { bg: string; border: string; shadow: string | null }> = {
    // Solid primary actions get a matching soft shadow; neutral/amber stay flat.
    green: {
      bg: isDark ? '#065F46' : '#059669',
      border: isDark ? 'rgba(16,185,129,0.4)' : 'transparent',
      shadow: isDark ? null : '#059669',
    },
    neutral: {
      bg: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
      border: isDark ? 'rgba(255,255,255,0.12)' : '#E2E8F0',
      shadow: null,
    },
    violet: {
      bg: ACCENT.indigo,
      border: 'transparent',
      shadow: ACCENT.indigo,
    },
    amber: {
      bg: isDark ? 'rgba(217,119,6,0.16)' : '#FFFBEB',
      border: isDark ? 'rgba(217,119,6,0.35)' : '#FDE68A',
      shadow: null,
    },
  };
  const t = palette[tone];
  return {
    backgroundColor: t.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.border,
    ...(t.shadow
      ? (Platform.select({
          ios: { shadowColor: t.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: isDark ? 0.4 : 0.32, shadowRadius: 12 },
          android: { elevation: 5 },
          web: { boxShadow: `0 8px 18px ${t.shadow}44` } as object,
          default: {},
        }))
      : {}),
  };
}

// ─── Utility: Haptics ────────────────────────────────────────────────────────
const triggerHaptic = (type: 'light' | 'medium' | 'success' | 'warning' = 'light') => {
  if (IS_WEB) return;
  switch (type) {
    case 'success':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
    case 'warning':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      break;
    case 'medium':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    default:
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      break;
  }
};

// ─── Compact overview stat chip ──────────────────────────────────────────────
function OverviewChip({
  label, value, color, icon, isDark,
}: {
  label: string; value: number; color: string;
  icon: React.ComponentProps<typeof Ionicons>['name']; isDark: boolean;
}) {
  const tint = tintFor(color, isDark);
  return (
    <View style={[overviewChip.wrap, { backgroundColor: tint.bg, borderColor: tint.border }]}>
      <View style={overviewChip.topRow}>
        <Ionicons name={icon} size={13} color={color} />
        <Text style={[overviewChip.value, { color }]}>{value}</Text>
      </View>
      <Text style={[overviewChip.label, { color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }]}>{label}</Text>
    </View>
  );
}

const overviewChip = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderRadius: 14, borderWidth: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  value: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 3 },
});

// ─── Main ────────────────────────────────────────────────────────────────────
export default function ManageStudents() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const routeParams = useLocalSearchParams<{ session?: string; date?: string }>();
  const { user } = useAuth();
  const { staffId, isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
  const requestedSession: AttendanceSession | null =
    routeParams.session === 'morning' || routeParams.session === 'afternoon'
      ? routeParams.session
      : null;

  const [students, setStudents] = useState<StudentUI[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clearingDay, setClearingDay] = useState(false);
  const [dayMenuOpen, setDayMenuOpen] = useState(false);
  const [detectedClassId, setDetectedClassId] = useState<string | null>(null);
  const [detectedClassLabel, setDetectedClassLabel] = useState<string | null>(null);
  const [session, setSession] = useState<AttendanceSession>(requestedSession || currentSession());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterChronicAbsent, setFilterChronicAbsent] = useState(false);
  const [selectedInsightStudent, setSelectedInsightStudent] = useState<InsightStudentData | null>(null);
  const [isOfflineCached, setIsOfflineCached] = useState(false);

  // Defaults to today — same as production. Past dates are opt-in via the picker.
  const todayYMD = useMemo(() => localAttendanceDate(), []);
  const [selectedDate, setSelectedDate] = useState(() => {
    const requestedDate = String(routeParams.date || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate <= todayYMD
      ? requestedDate
      : todayYMD;
  });

  const tabBarReserve = staffTabBarReserve(theme.spacing);
  const isToday = selectedDate === todayYMD;
  const selectedDateLabel = useMemo(
    () =>
      parseYMD(selectedDate).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    [selectedDate]
  );

  const statusOf = useCallback(
    (s: StudentUI): SessionStatus => (session === 'morning' ? s.morningStatus : s.afternoonStatus),
    [session]
  );

  const present = students.filter((s) => statusOf(s) === 'present').length;
  const absent = students.filter((s) => statusOf(s) === 'absent').length;
  const unmarked = students.filter((s) => statusOf(s) === 'unmarked').length;
  const marked = present + absent;
  const total = students.length;
  const completionPct = total > 0 ? Math.round((marked / total) * 100) : 0;
  const canSubmit = total > 0 && marked > 0;
  const dayHasRecords = students.some(
    (s) => s.morningStatus !== 'unmarked' || s.afternoonStatus !== 'unmarked'
  );

  const chronicAbsentStudents = useMemo(
    () => students.filter((s) => (s.consecutiveAbsenceDays || 0) >= 3),
    [students]
  );
  const chronicAbsentCount = chronicAbsentStudents.length;

  const toggleChronicFilter = useCallback(() => {
    triggerHaptic('light');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilterChronicAbsent((prev) => !prev);
  }, []);

  const otherSessionMarked = students.filter((s) =>
    (session === 'morning' ? s.afternoonStatus : s.morningStatus) !== 'unmarked'
  ).length;

  const filteredStudents = useMemo(() => {
    let base = students;
    if (filterChronicAbsent) {
      base = base.filter((s) => (s.consecutiveAbsenceDays || 0) >= 3);
    }
    if (searchQuery.trim()) {
      const lowerQ = searchQuery.toLowerCase();
      base = base.filter((s) => {
        return s.name.toLowerCase().includes(lowerQ) || s.rollNo.toLowerCase().includes(lowerQ);
      });
    }
    return [...base].sort(sortByRollNo);
  }, [students, searchQuery, filterChronicAbsent]);

  const cacheKey = `${selectedDate}_${session}_${staffId || 'self'}`;
  const effectiveUserId = staffId || user?.id || 'staff';

  const loadStudents = useCallback(async () => {
    if (!user) return;
    setLoadError(null);

    // 1. Instant render from disk cache
    try {
      const cached = await persistentQueryCache.read<{
        class_section_id: string;
        class_name: string;
        section_name: string;
        students: any[];
      }>(effectiveUserId, 'my_class', cacheKey);

      if (cached?.data) {
        setDetectedClassId(cached.data.class_section_id);
        setDetectedClassLabel(
          [cached.data.class_name, cached.data.section_name].filter(Boolean).join(' - ') || null
        );
        const formatted = (cached.data.students || [])
          .map((s) => ({
            id: s.student_id,
            enrollmentId: s.enrollment_id,
            name: s.student_name,
            rollNo: s.roll_number != null ? String(s.roll_number) : (s.admission_no ?? '—'),
            photoUrl: s.photo_url ?? null,
            morningStatus: toSessionStatus(s.morning_status),
            afternoonStatus: toSessionStatus(s.afternoon_status),
            consecutiveAbsenceDays: s.consecutive_absence_days ?? 0,
            absenceStreakStartDate: s.absence_streak_start_date ?? null,
            absenceStreakEndDate: s.absence_streak_end_date ?? null,
            absenceStreakDates: s.absence_streak_dates ?? [],
            monthlyAttendancePercentage: s.monthly_attendance_percentage ?? null,
            absenceRiskLevel: s.absence_risk_level ?? null,
            isIrregular: Boolean(s.is_irregular),
            monthlyAbsentCount: s.monthly_absent_count ?? 0,
          }))
          .sort(sortByRollNo);
        setStudents(formatted);
        setLoading(false);
        setIsOfflineCached(true);
      } else {
        setLoading(true);
      }
    } catch {
      setLoading(true);
    }

    // 2. Fetch fresh data from network & flush offline queue
    try {
      attendanceOfflineQueue.flush(effectiveUserId).catch(() => {});

      const myClass = await AttendanceService.getMyClass(selectedDate, staffId, session);
      if (!myClass) {
        setStudents([]);
        setDetectedClassId(null);
        setDetectedClassLabel(null);
        setIsOfflineCached(false);
        return;
      }
      setDetectedClassId(myClass.class_section_id);
      setDetectedClassLabel([myClass.class_name, myClass.section_name].filter(Boolean).join(' - ') || null);
      
      const formatted = myClass.students
        .map((s) => ({
          id: s.student_id,
          enrollmentId: s.enrollment_id,
          name: s.student_name,
          rollNo: s.roll_number != null ? String(s.roll_number) : (s.admission_no ?? '—'),
          photoUrl: s.photo_url ?? null,
          morningStatus: toSessionStatus(s.morning_status),
          afternoonStatus: toSessionStatus(s.afternoon_status),
          consecutiveAbsenceDays: s.consecutive_absence_days ?? 0,
          absenceStreakStartDate: s.absence_streak_start_date ?? null,
          absenceStreakEndDate: s.absence_streak_end_date ?? null,
          absenceStreakDates: s.absence_streak_dates ?? [],
          monthlyAttendancePercentage: s.monthly_attendance_percentage ?? null,
          absenceRiskLevel: s.absence_risk_level ?? null,
          isIrregular: Boolean(s.is_irregular),
          monthlyAbsentCount: s.monthly_absent_count ?? 0,
        }))
        .sort(sortByRollNo);
      setStudents(formatted);
      setIsOfflineCached(false);
      persistentQueryCache.write(effectiveUserId, 'my_class', myClass, Date.now(), cacheKey);
    } catch (err) {
      console.warn('Failed to load fresh class students:', err);
      // If we don't already have cached data, show error state
      setStudents((prev) => {
        if (prev.length === 0) {
          setDetectedClassId(null);
          setDetectedClassLabel(null);
          setLoadError('Could not reach the server. Make sure the backend is running, then pull to refresh.');
        }
        return prev;
      });
    } finally {
      setLoading(false);
    }
  }, [user, staffId, session, selectedDate, cacheKey, effectiveUserId]);

  const handleDateChange = useCallback((next: string) => {
    if (!next || next === selectedDate) return;
    // Guard against future dates even if the native picker misbehaves.
    const capped = next > todayYMD ? todayYMD : next;
    triggerHaptic('light');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSearchQuery('');
    setSelectedDate(capped);
  }, [selectedDate, todayYMD]);

  useFocusEffect(
    useCallback(() => {
      loadStudents();
    }, [loadStudents])
  );

  const handleStatusChange = useCallback((id: string, newStatus: SessionStatus) => {
    triggerHaptic('light');
    setStudents((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, [session === 'morning' ? 'morningStatus' : 'afternoonStatus']: newStatus } : s
      )
    );
  }, [session]);

  const setAllForSession = useCallback((value: SessionStatus) => {
    triggerHaptic(value === 'present' ? 'success' : 'medium');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSearchQuery(''); // Clear search when bulk actioning
    setStudents((prev) =>
      prev.map((s) => ({ ...s, [session === 'morning' ? 'morningStatus' : 'afternoonStatus']: value }))
    );
  }, [session]);

  const submitMarkedAttendance = async () => {
    const markedStudents = students.filter(
      (student) => student.enrollmentId && statusOf(student) !== 'unmarked'
    );
    if (markedStudents.length === 0) {
      triggerHaptic('warning');
      alertCompat('Nothing to submit', 'Mark at least one student present or absent.');
      return;
    }
    if (!detectedClassId) {
      alertCompat('Error', 'No class assigned.');
      return;
    }

    const payload: MarkAttendanceRequest = {
      class_section_id: detectedClassId,
      date: selectedDate,
      session,
      records: markedStudents.map((s) => ({
        student_id: s.id,
        status: statusOf(s) as AttendanceStatus,
      })),
    };

    try {
      setSubmitting(true);
      await AttendanceService.markAttendance(payload);
      triggerHaptic('success');
      const dayNote = isToday ? '' : ` for ${selectedDateLabel}`;
      const pendingNote = unmarked > 0
        ? ` ${unmarked} student${unmarked === 1 ? '' : 's'} left unmarked.`
        : '';
      alertCompat(
        'Success',
        `${markedStudents.length} ${session} attendance record${markedStudents.length === 1 ? '' : 's'} submitted${dayNote}.${pendingNote}`
      );
      router.back();
    } catch (error: any) {
      const isNetwork =
        !error?.status ||
        error.status >= 500 ||
        error.message?.includes('Network') ||
        error.message?.includes('connect') ||
        error.message?.includes('fetch');

      if (isNetwork) {
        await attendanceOfflineQueue.enqueue(effectiveUserId, payload);
        triggerHaptic('success');
        alertCompat(
          'Saved Offline',
          `${markedStudents.length} ${session} attendance records saved locally. They will automatically sync when network connection returns.`
        );
        router.back();
      } else {
        triggerHaptic('warning');
        alertCompat('Error', error?.message || 'Failed to submit attendance.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) {
      triggerHaptic('warning');
      alertCompat('Nothing to submit', 'Mark at least one student present or absent.');
      return;
    }

    if (unmarked > 0) {
      triggerHaptic('warning');
      const pendingNames = students
        .filter((student) => statusOf(student) === 'unmarked')
        .slice(0, 3)
        .map((student) => student.name);
      const extraPending = unmarked - pendingNames.length;
      const pendingList = `${pendingNames.join(', ')}${extraPending > 0 ? ` and ${extraPending} more` : ''}`;
      alertCompat(
        'Submit partial attendance?',
        `${pendingList} ${unmarked === 1 ? 'is' : 'are'} still unmarked and will be skipped. Submit the ${marked} marked student${marked === 1 ? '' : 's'}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Submit Marked', onPress: () => void submitMarkedAttendance() },
        ]
      );
      return;
    }

    void submitMarkedAttendance();
  };

  const clearDayAttendance = async () => {
    if (!detectedClassId || clearingDay) return;
    setClearingDay(true);
    try {
      const result = await AttendanceService.clearDayAttendance(detectedClassId, selectedDate);
      triggerHaptic('success');
      alertCompat(
        'Attendance cleared',
        result.count > 0
          ? `Removed ${result.count} record${result.count === 1 ? '' : 's'} for ${selectedDateLabel}. You can mark this day again if needed.`
          : `No saved attendance was found for ${selectedDateLabel}.`
      );
      await loadStudents();
    } catch (error: any) {
      alertCompat('Could not clear attendance', error?.message || 'Try again in a moment.');
    } finally {
      setClearingDay(false);
    }
  };

  const confirmClearDay = () => {
    setDayMenuOpen(false);
    alertCompat(
      'Clear this day?',
      `This removes morning and afternoon attendance for every student on ${selectedDateLabel}. Use this when the day was marked by mistake, such as a general holiday.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear day', style: 'destructive', onPress: () => void clearDayAttendance() },
      ]
    );
  };

  const SessionTab = ({ value, label, icon }: { value: AttendanceSession; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }) => {
    const active = session === value;
    const marked = students.filter((s) => (value === 'morning' ? s.morningStatus : s.afternoonStatus) !== 'unmarked').length;
    const done = total > 0 && marked === total;
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          if (!active) {
            triggerHaptic('light');
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setSession(value);
          }
        }}
        style={[styles.sessionTab, active && styles.sessionTabActive]}
      >
        <Ionicons name={icon} size={16} color={active ? '#fff' : theme.colors.textSecondary} />
        <Text style={[styles.sessionTabText, { color: active ? '#fff' : theme.colors.textSecondary }]}>{label}</Text>
        {done && <Ionicons name="checkmark-circle" size={14} color={active ? '#fff' : ACCENT.emerald} style={{ marginLeft: 4 }} />}
      </TouchableOpacity>
    );
  };

  const renderDatePicker = () => (
    <View style={[styles.datePickerCard, claySurface(isDark)]}>
      <View style={styles.datePickerTop}>
        <View style={styles.datePickerLabelRow}>
          <Ionicons name="calendar-outline" size={16} color={ACCENT.indigo} />
          <Text style={styles.datePickerLabel}>Attendance date</Text>
        </View>
        <View style={styles.datePickerActions}>
          {!isToday && (
            <TouchableOpacity
              onPress={() => handleDateChange(todayYMD)}
              hitSlop={8}
              style={styles.todayChip}
              accessibilityRole="button"
              accessibilityLabel="Jump back to today"
            >
              <Text style={styles.todayChipText}>Today</Text>
            </TouchableOpacity>
          )}
          {dayHasRecords && (
            <TouchableOpacity
              onPress={() => setDayMenuOpen(true)}
              hitSlop={8}
              style={styles.moreBtn}
              accessibilityRole="button"
              accessibilityLabel="More attendance actions"
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <AppDatePicker
        value={selectedDate}
        onChange={handleDateChange}
        maximumDate={todayYMD}
        variant="compact"
        isDark={isDark}
        accentColor={ACCENT.indigo}
        placeholder="Select date"
        containerStyle={styles.datePickerField}
      />
      {!isToday && (
        <View style={styles.backdateHint}>
          <Ionicons name="time-outline" size={13} color={ACCENT.amber} />
          <Text style={styles.backdateHintText}>Marking a previous day · {selectedDateLabel}</Text>
        </View>
      )}
    </View>
  );

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {renderDatePicker()}

      {/* Session Switcher */}
      <View style={styles.sessionSwitch}>
        <SessionTab value="morning" label="Morning" icon="sunny-outline" />
        <SessionTab value="afternoon" label="Afternoon" icon="partly-sunny-outline" />
      </View>

      {otherSessionMarked > 0 && (
        <View style={styles.sessionHint}>
          <Ionicons name="information-circle-outline" size={14} color={theme.colors.textSecondary} />
          <Text style={styles.sessionHintText}>
            {otherSessionMarked}/{total} marked for {session === 'morning' ? 'afternoon' : 'morning'} · Half + Half = Full Day
          </Text>
        </View>
      )}

      {/* Stats — minimal clay card */}
      <View style={[styles.statsOuter, claySurface(isDark)]}>
        <View style={styles.statsCardHeader}>
          <Text style={styles.statsCardTitle}>Overview</Text>
          <View style={[styles.completionChip, completionPct === 100 ? styles.chipComplete : styles.chipPending]}>
            <Text style={[styles.completionChipText, { color: completionPct === 100 ? ACCENT.emerald : ACCENT.amber }]}>
              {completionPct}%
            </Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <OverviewChip label="Present" value={present} color={ACCENT.emerald} icon="checkmark-circle" isDark={isDark} />
          <OverviewChip label="Absent" value={absent} color={ACCENT.rose} icon="close-circle" isDark={isDark} />
          <OverviewChip label="Pending" value={unmarked} color={ACCENT.amber} icon="time" isDark={isDark} />
        </View>
      </View>

      {/* Offline Cached Indicator */}
      {isOfflineCached && (
        <View style={styles.offlineCachedBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color={ACCENT.amber} />
          <Text style={styles.offlineCachedText}>Showing cached data · Will refresh when online</Text>
        </View>
      )}

      {/* Class Intelligence: Chronic Absence Alert Banner */}
      {chronicAbsentStudents.length > 0 && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={toggleChronicFilter}
          style={[
            styles.chronicAlertBanner,
            filterChronicAbsent && styles.chronicAlertBannerActive,
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            filterChronicAbsent
              ? 'Show all students'
              : `Filter ${chronicAbsentStudents.length} students absent 3 or more consecutive days`
          }
        >
          <View style={styles.chronicAlertLeft}>
            <View style={styles.chronicAlertIconWrap}>
              <Ionicons name="warning" size={15} color="#EF4444" />
            </View>
            <Text style={styles.chronicAlertText} numberOfLines={1}>
              <Text style={{ fontWeight: '800', color: isDark ? '#FCA5A5' : '#DC2626' }}>
                {chronicAbsentStudents.length} student{chronicAbsentStudents.length === 1 ? '' : 's'}
              </Text>{' '}
              absent for 3+ consecutive days
            </Text>
          </View>
          <View style={[styles.chronicFilterChip, filterChronicAbsent && styles.chronicFilterChipActive]}>
            <Text style={[styles.chronicFilterChipText, filterChronicAbsent && styles.chronicFilterChipTextActive]}>
              {filterChronicAbsent ? 'Show All' : 'Filter'}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Search Bar */}
      {total > 0 && (
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={theme.colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search students..."
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>
      )}

      {/* List Meta */}
      <View style={styles.listMeta}>
        <View style={styles.listMetaLeft}>
          <LinearGradient colors={[ACCENT.violet, ACCENT.emerald]} style={styles.sectionAccent} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
          <Text style={styles.listMetaText}>Student List</Text>
        </View>
        <Text style={styles.studentCountLabel}>{filteredStudents.length} Students</Text>
      </View>
    </View>
  );

  const attendanceRows = useMemo(
    () => filteredStudents.map((student) => ({ ...student, status: statusOf(student) })),
    [filteredStudents, statusOf],
  );

  const renderFooter = () => (
    <View style={[styles.actionFooter, claySurface(isDark), { marginBottom: tabBarReserve + insets.bottom }]}>
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={[styles.quickBtn, clayButton(isDark, 'green')]}
          activeOpacity={0.85}
          onPress={() => setAllForSession('present')}
          accessibilityRole="button"
          accessibilityLabel="Mark all students present"
        >
          <Ionicons name="checkmark-done" size={18} color={isDark ? '#6EE7B7' : '#fff'} />
          <Text style={[styles.quickBtnText, { color: isDark ? '#6EE7B7' : '#fff' }]}>Mark All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.quickBtn, clayButton(isDark, 'neutral')]}
          activeOpacity={0.85}
          onPress={() => setAllForSession('unmarked')}
          accessibilityRole="button"
          accessibilityLabel="Reset attendance for this session"
        >
          <Ionicons name="refresh" size={18} color={isDark ? '#C7D2FE' : ACCENT.indigo} />
          <Text style={[styles.quickBtnText, { color: isDark ? '#C7D2FE' : ACCENT.indigo }]}>Reset</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleSubmit}
        disabled={submitting || !canSubmit}
        accessibilityRole="button"
        accessibilityState={{ disabled: submitting || !canSubmit }}
        accessibilityLabel={canSubmit
          ? `Submit ${marked} marked ${session} attendance record${marked === 1 ? '' : 's'}`
          : 'Mark at least one student to submit attendance'}
        style={[styles.submitBtn, clayButton(isDark, canSubmit ? 'violet' : 'amber')]}
      >
        {submitting ? (
          <LogoLoader color="#fff" />
        ) : (
          <>
            <Text style={[styles.submitText, { color: canSubmit ? '#fff' : (isDark ? '#FDE68A' : ACCENT.amberDeep) }]}>
              {canSubmit
                ? (unmarked > 0 ? `Submit ${marked} Marked · ${unmarked} Pending` : `Submit ${session} Attendance`)
                : `${unmarked} Pending Student${unmarked !== 1 ? 's' : ''}`}
            </Text>
            {canSubmit && <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />}
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        <StaffHeader
          title="Attendance"
          subtitle={selectedDateLabel}
          showBackButton={true}
          showMenuButton={false}
        />
        {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}

        {loading ? (
          <View style={styles.emptyWithPicker}>
            <View style={styles.headerContainer}>{renderDatePicker()}</View>
            <View style={styles.emptyState}>
              <LogoLoader size={60} color={ACCENT.violet} />
              <Text style={styles.loadingText}>Syncing class data...</Text>
            </View>
          </View>
        ) : students.length === 0 ? (
          <View style={styles.emptyWithPicker}>
            {/* Keep date picker reachable even when the class list is empty */}
            {renderHeader()}
            <View style={styles.emptyState}>
              <LinearGradient
                colors={isDark ? ['rgba(108,99,255,0.25)', 'rgba(61,142,255,0.12)'] : ['rgba(108,99,255,0.15)', 'rgba(61,142,255,0.08)']}
                style={styles.emptyIconRing}
              >
                <Ionicons
                  name={loadError ? 'cloud-offline-outline' : detectedClassId ? 'people-outline' : 'link-outline'}
                  size={48}
                  color={loadError ? ACCENT.amber : ACCENT.violet}
                />
              </LinearGradient>
              <Text style={styles.emptyTitle}>
                {loadError ? 'Connection failed' : detectedClassId ? 'No students yet' : 'No class assigned'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {loadError
                  ? loadError
                  : detectedClassId
                    ? `There are no students enrolled in ${detectedClassLabel || 'this class'} for the ${session} session.`
                    : `You don't have a class assigned for the ${session} session${isToday ? ' today' : ' on this date'}. Try another date/session or contact admin.`}
              </Text>
              {loadError && (
                <TouchableOpacity style={styles.retryBtn} onPress={loadStudents} activeOpacity={0.85}>
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <FlatList
            data={attendanceRows}
            keyExtractor={(item) => item.id}
            style={styles.scrollFlex}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={7}
            ListHeaderComponent={renderHeader()}
            ListFooterComponent={renderFooter()}
            renderScrollComponent={Platform.OS === 'web' ? undefined : (props) => (
              <KeyboardAwareScrollView {...props} bottomOffset={24} />
            )}
            renderItem={({ item }) => (
              <SwipeableStudentCard
                student={item}
                onStatusChange={handleStatusChange}
                onPressStreak={setSelectedInsightStudent}
                isDark={isDark}
              />
            )}
          />
        )}

        <Modal
          visible={dayMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setDayMenuOpen(false)}
        >
          <TouchableOpacity
            style={styles.menuBackdrop}
            activeOpacity={1}
            onPress={() => setDayMenuOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          >
            <View style={[styles.dayMenu, { marginTop: insets.top + 108 }]}>
              <Text style={styles.dayMenuLabel}>This day</Text>
              <TouchableOpacity
                style={styles.dayMenuItem}
                onPress={confirmClearDay}
                disabled={clearingDay}
                accessibilityRole="button"
                accessibilityLabel="Clear attendance for this day"
              >
                <Ionicons name="trash-outline" size={18} color={ACCENT.rose} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dayMenuTitle}>Clear this day&apos;s attendance</Text>
                  <Text style={styles.dayMenuHint}>Removes every mark for {selectedDateLabel}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        <AbsenceInsightBottomSheet
          visible={!!selectedInsightStudent}
          student={selectedInsightStudent}
          onClose={() => setSelectedInsightStudent(null)}
          onViewHistory={(studentId) => {
            setSelectedInsightStudent(null);
            router.push({
              pathname: '/staff/student-details',
              params: { id: studentId },
            });
          }}
        />
      </View>
    </GestureHandlerRootView>
  );
}

const getStyles = (theme: SchoolTheme, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? theme.colors.background : '#F1F5F9' },
  loadingText: { marginTop: 16, fontSize: 16, color: theme.colors.textSecondary, fontWeight: '600' },
  emptyWithPicker: { flex: 1 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyIconRing: { width: 110, height: 110, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.textPrimary, marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: ACCENT.indigo },
  retryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  
  headerContainer: { paddingBottom: 8 },

  datePickerCard: { marginHorizontal: 16, marginTop: 16, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, gap: 10 },
  datePickerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  datePickerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
  },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', alignItems: 'flex-end' },
  dayMenu: {
    marginRight: 16,
    width: 280,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
  },
  dayMenuLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
  },
  dayMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12 },
  dayMenuTitle: { fontSize: 14, fontWeight: '700', color: ACCENT.rose },
  dayMenuHint: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  datePickerLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  datePickerLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.textPrimary, letterSpacing: -0.1 },
  datePickerField: { flex: 0 },
  todayChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: isDark ? 'rgba(79,70,229,0.22)' : 'rgba(79,70,229,0.12)',
  },
  todayChipText: { fontSize: 12, fontWeight: '800', color: ACCENT.indigo },
  backdateHint: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backdateHintText: { flex: 1, fontSize: 12, fontWeight: '600', color: isDark ? '#FBBF24' : ACCENT.amberDeep },
  
  sessionSwitch: { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, padding: 4, borderRadius: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0', gap: 4 },
  sessionTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, gap: 6 },
  sessionTabActive: { backgroundColor: ACCENT.indigo, ...(Platform.select({
    ios: { shadowColor: ACCENT.indigo, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
    android: { elevation: 4 },
    web: { boxShadow: '0 6px 16px rgba(79,70,229,0.4)' } as object,
    default: {},
  })) },
  sessionTabText: { fontSize: 14, fontWeight: '700' },
  
  sessionHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 20, marginTop: 12 },
  sessionHintText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },

  statsOuter: { marginHorizontal: 16, marginTop: 14, marginBottom: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, gap: 8 },
  statsCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statsCardTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.textPrimary, letterSpacing: -0.2 },
  completionChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  chipComplete: { backgroundColor: isDark ? 'rgba(16,185,129,0.2)' : '#D1FAE5' },
  chipPending: { backgroundColor: isDark ? 'rgba(245,158,11,0.2)' : '#FEF3C7' },
  completionChipText: { fontSize: 11, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 8 },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', marginHorizontal: 16, marginTop: 10, paddingHorizontal: 14, borderRadius: 16, height: 48, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.textPrimary, fontWeight: '500' },

  listMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 20, marginBottom: 8 },
  listMetaLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionAccent: { width: 4, height: 18, borderRadius: 2 },
  listMetaText: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5 },
  studentCountLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  scrollFlex: { flex: 1 },
  listContent: { paddingTop: 4, flexGrow: 1, paddingBottom: 8 },

  actionFooter: { marginHorizontal: 16, marginTop: 20, gap: 10, padding: 14 },
  quickActions: { flexDirection: 'row', gap: 10 },
  quickBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  quickBtnText: { fontSize: 14, fontWeight: '800' },
  submitBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16, minHeight: 56 },
  submitText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },

  chronicAlertBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FECACA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chronicAlertBannerActive: {
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.22)' : '#FEE2E2',
    borderColor: isDark ? '#EF4444' : '#F87171',
  },
  chronicAlertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  chronicAlertIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chronicAlertText: {
    fontSize: 12,
    fontWeight: '600',
    color: isDark ? '#FCA5A5' : '#B91C1C',
    flex: 1,
  },
  chronicFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FEE2E2',
  },
  chronicFilterChipActive: {
    backgroundColor: '#EF4444',
  },
  chronicFilterChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: isDark ? '#FCA5A5' : '#B91C1C',
  },
  chronicFilterChipTextActive: {
    color: '#FFFFFF',
  },

  offlineCachedBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FEF3C7',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FDE68A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offlineCachedText: {
    fontSize: 11,
    fontWeight: '600',
    color: isDark ? '#FBBF24' : '#B45309',
  },
});
