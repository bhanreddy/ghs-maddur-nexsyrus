import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  Modal,
  ScrollView,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useIsFocused } from '@react-navigation/native';
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
  absenceStreakDates?: { date: string; status: string }[];
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
  wrap: { flex: 1, minWidth: 96, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderRadius: 14, borderWidth: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  value: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  label: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 3 },
});

// ─── Main ────────────────────────────────────────────────────────────────────
export default function ManageStudents() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const routeParams = useLocalSearchParams<{ session?: string; date?: string; contextRequest?: string }>();
  const { user } = useAuth();
  const { staffId, isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
  const requestedSession: AttendanceSession | null =
    routeParams.session === 'morning' || routeParams.session === 'afternoon'
      ? routeParams.session
      : null;

  const [students, setStudents] = useState<StudentUI[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SessionStatus | 'all'>('all');
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
  const [refreshing, setRefreshing] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const [offline, setOffline] = useState(false);
  const [queued, setQueued] = useState(false);
  const [dayQueued, setDayQueued] = useState(false);
  const submissionInFlight = useRef(false);
  const [draftCount, setDraftCount] = useState(0);
  const [submissionConfirmed, setSubmissionConfirmed] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const rosters = useRef<Record<string, NonNullable<Awaited<ReturnType<typeof AttendanceService.getMyClass>>>>>({});
  const activeDraftKey = useRef('');
  // Keep unsubmitted edits isolated by staff, date, session and class across tab visits.
  // These are in-memory edits; only explicit offline submissions are persisted.
  const drafts = useRef<Record<string, Record<string, SessionStatus>>>({});
  const { width, fontScale } = useWindowDimensions();
  const studentListRef = useRef<FlatList>(null);
  const isFocused = useIsFocused();
  const busy = submitting || clearingDay || refreshing;
  const editingDisabled = submitting || clearingDay || queued;


  // Defaults to today — same as production. Past dates are opt-in via the picker.
  const todayYMD = localAttendanceDate();
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
  const canSubmit = total > 0 && marked > 0 && !queued && !submissionConfirmed;
  const dayHasRecords = students.some(
    (s) => s.morningStatus !== 'unmarked' || s.afternoonStatus !== 'unmarked'
  );

  const chronicAbsentStudents = useMemo(
    () => students.filter((s) => (s.consecutiveAbsenceDays || 0) >= 3),
    [students]
  );

  const toggleChronicFilter = useCallback(() => {
    triggerHaptic('light');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilterChronicAbsent((prev) => !prev);
  }, []);

  const otherSessionMarked = students.filter((s) =>
    (session === 'morning' ? s.afternoonStatus : s.morningStatus) !== 'unmarked'
  ).length;

  const filteredStudents = useMemo(() => {
    let base = statusFilter === 'all' ? students : students.filter(student => statusOf(student) === statusFilter);
    if (filterChronicAbsent) {
      base = base.filter((s) => (s.consecutiveAbsenceDays || 0) >= 3);
    }
    if (searchQuery.trim()) {
      const lowerQ = searchQuery.trim().toLowerCase();
      base = base.filter((s) => {
        return s.name.toLowerCase().includes(lowerQ) || s.rollNo.toLowerCase().includes(lowerQ);
      });
    }
    return [...base].sort(sortByRollNo);
  }, [students, searchQuery, filterChronicAbsent, statusFilter, statusOf]);

  const cacheKey = `${selectedDate}_${session}_${staffId || 'self'}`;
  const effectiveUserId = staffId || user?.id || 'staff';
  const draftOwnerId = staffId || user?.userId || effectiveUserId;

  const draftKey = `${draftOwnerId}_${selectedDate}_${session}_${detectedClassId || ''}`;
  activeDraftKey.current = draftKey;

  const loadStudents = useCallback(async () => {
    if (!user) return;
    const generation = ++requestGeneration.current;
    const current = () => generation === requestGeneration.current;
    let hasCachedData = false;
    setLoadError(null);
    setSubmissionMessage(null);
    setSubmissionConfirmed(false);
    setRefreshing(true);
    setLoading(true);
    setStudents([]);
    setDetectedClassId(null);
    setDetectedClassLabel(null);
    setQueued(false);
    setDayQueued(false);
    setDraftCount(0);
    setIsOfflineCached(false);

    const applyClass = (myClass: NonNullable<Awaited<ReturnType<typeof AttendanceService.getMyClass>>>, pending: Awaited<ReturnType<typeof attendanceOfflineQueue.readQueue>>) => {
      if (!current()) return;
      const matchingQueue = pending.find(item => item.payload.class_section_id === myClass.class_section_id && item.payload.date === selectedDate && item.payload.session === session);
      const queuedMarks = new Map(matchingQueue?.payload.records.map(record => [record.student_id, toSessionStatus(record.status)]));
      const edits = drafts.current[`${draftOwnerId}_${selectedDate}_${session}_${myClass.class_section_id}`] || {};
      setDetectedClassId(myClass.class_section_id);
      setDetectedClassLabel([myClass.class_name, myClass.section_name].filter(Boolean).join(' · ') || null);
      setQueued(!!matchingQueue);
      setDayQueued(pending.some(item => item.payload.class_section_id === myClass.class_section_id && item.payload.date === selectedDate));
      setDraftCount(Object.keys(edits).length);
      setStudents(myClass.students.map(student => {
        const override = edits[student.student_id] ?? queuedMarks.get(student.student_id);
        return {
          id: student.student_id, enrollmentId: student.enrollment_id,
          name: student.student_name,
          rollNo: student.roll_number != null ? String(student.roll_number) : (student.admission_no ?? '—'),
          photoUrl: student.photo_url ?? null,
          morningStatus: session === 'morning' && override ? override : toSessionStatus(student.morning_status),
          afternoonStatus: session === 'afternoon' && override ? override : toSessionStatus(student.afternoon_status),
          consecutiveAbsenceDays: student.consecutive_absence_days ?? 0,
          absenceStreakStartDate: student.absence_streak_start_date ?? null,
          absenceStreakEndDate: student.absence_streak_end_date ?? null,
          absenceStreakDates: student.absence_streak_dates ?? [],
          monthlyAttendancePercentage: student.monthly_attendance_percentage ?? null,
          absenceRiskLevel: student.absence_risk_level ?? null,
          isIrregular: Boolean(student.is_irregular), monthlyAbsentCount: student.monthly_absent_count ?? 0,
        };
      }).sort(sortByRollNo));
    };

    try {
      const cached = await persistentQueryCache.read<NonNullable<Awaited<ReturnType<typeof AttendanceService.getMyClass>>>>(effectiveUserId, 'my_class', cacheKey);
      const pending = await attendanceOfflineQueue.readQueue(effectiveUserId);
      if (!current()) return;
      const available = rosters.current[cacheKey] || cached?.data;
      if (available) {
        hasCachedData = true;
        applyClass(available, pending);
        setLoading(false);
        setIsOfflineCached(true);
      }
      const sync = await attendanceOfflineQueue.flush(effectiveUserId);
      const remaining = await attendanceOfflineQueue.readQueue(effectiveUserId);
      if (current() && available) {
        setQueued(remaining.some(item => item.payload.class_section_id === available.class_section_id && item.payload.date === selectedDate && item.payload.session === session));
        setDayQueued(remaining.some(item => item.payload.class_section_id === available.class_section_id && item.payload.date === selectedDate));
      }
      const myClass = await AttendanceService.getMyClass(selectedDate, staffId, session);
      if (!current()) return;
      if (myClass) {
        rosters.current[cacheKey] = myClass;
        applyClass(myClass, remaining);
        void persistentQueryCache.write(effectiveUserId, 'my_class', myClass, Date.now(), cacheKey);
      } else {
        delete rosters.current[cacheKey];
        setStudents([]);
        setDetectedClassId(null);
        setDetectedClassLabel(null);
        setQueued(false);
      }
      setIsOfflineCached(false);
      if (sync.rejected) setLoadError('A queued submission was rejected by the server. Review the loaded records and submit corrections.');
    } catch (error) {
      if (!current()) return;
      console.warn('Failed to refresh class attendance:', error);
      setLoadError(hasCachedData
        ? 'Could not refresh server records. Review cached attendance before submitting.'
        : 'Could not load class data or the device queue. Retry when your connection and device storage are available.');
    } finally {
      if (current()) { setLoading(false); setRefreshing(false); }
    }
  }, [user, staffId, session, selectedDate, cacheKey, effectiveUserId, draftOwnerId]);

  useEffect(() => {
    let wasOffline = false;
    return NetInfo.addEventListener(state => {
      const isOffline = state.isConnected === false || state.isInternetReachable === false;
      setOffline(isOffline);
      if (wasOffline && !isOffline && isFocused && !submitting && !clearingDay) void loadStudents();
      wasOffline = isOffline;
    });
  }, [isFocused, loadStudents, submitting, clearingDay]);

  // Home shortcuts can target a session/date even when this pager screen is mounted.
  useEffect(() => {
    if (requestedSession) setSession(requestedSession);
    const date = String(routeParams.date || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayYMD) setSelectedDate(date);
  }, [requestedSession, routeParams.date, routeParams.contextRequest, todayYMD]);

  const handleDateChange = useCallback((next: string) => {
    if (!next || next === selectedDate || submitting || clearingDay) return;
    // Guard against future dates even if the native picker misbehaves.
    const capped = next > todayYMD ? todayYMD : next;
    triggerHaptic('light');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSearchQuery('');
    setStatusFilter('all');
    setFilterChronicAbsent(false);
    setLoading(true);
    setSelectedDate(capped);
  }, [selectedDate, todayYMD, submitting, clearingDay]);

  useFocusEffect(
    useCallback(() => {
      void loadStudents();
      return () => { requestGeneration.current++; };
    }, [loadStudents])
  );

  const handleStatusChange = useCallback((id: string, newStatus: SessionStatus) => {
    if (editingDisabled) return;
    setSubmissionMessage(null);
    setSubmissionConfirmed(false);
    drafts.current[draftKey] = { ...drafts.current[draftKey], [id]: newStatus };
    setDraftCount(Object.keys(drafts.current[draftKey]).length);
    triggerHaptic('light');
    setStudents((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, [session === 'morning' ? 'morningStatus' : 'afternoonStatus']: newStatus } : s
      )
    );
  }, [session, editingDisabled, draftKey]);

  const setAllForSession = useCallback((value: SessionStatus) => {
    if (editingDisabled) return;
    setSubmissionMessage(null);
    setSubmissionConfirmed(false);
    drafts.current[draftKey] = Object.fromEntries(students.map(student => [student.id, value]));
    setDraftCount(students.length);
    triggerHaptic('medium');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSearchQuery(''); // Clear search when bulk actioning
    setStudents((prev) =>
      prev.map((s) => ({ ...s, [session === 'morning' ? 'morningStatus' : 'afternoonStatus']: value }))
    );
  }, [session, editingDisabled, draftKey, students]);

  const submitMarkedAttendance = async () => {
    if (busy || queued || submissionInFlight.current) return;
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
      submissionInFlight.current = true;
      setSubmitting(true);
      const result = await AttendanceService.markAttendance(payload);
      if (result.success === false || !Number.isFinite(result.count)) throw Object.assign(new Error('The server did not confirm submission. Review and retry.'), { status: 422 });
      if (result.count !== markedStudents.length) throw Object.assign(new Error(`The server confirmed ${result.count} of ${markedStudents.length} records. Your edits are still open. Refresh and review before retrying.`), { status: 422 });
      triggerHaptic('success');
      const dayNote = isToday ? '' : ` for ${selectedDateLabel}`;
      const pendingNote = unmarked > 0
        ? ` ${unmarked} student${unmarked === 1 ? '' : 's'} left unmarked.`
        : '';
      delete drafts.current[draftKey];
      if (activeDraftKey.current !== draftKey) return;
      setDraftCount(0);
      setSubmissionConfirmed(true);
      setSubmissionMessage(`Server confirmed ${result.count} ${session} record${result.count === 1 ? '' : 's'} submitted${dayNote}.${pendingNote}`);
    } catch (error: any) {
      const isNetwork =
        !error?.status ||
        error.status >= 500 ||
        error.message?.includes('Network') ||
        error.message?.includes('connect') ||
        error.message?.includes('fetch');

      if (isNetwork) {
        try {
          await attendanceOfflineQueue.enqueue(effectiveUserId, payload);
          delete drafts.current[draftKey];
          if (activeDraftKey.current !== draftKey) return;
          setDraftCount(0);
          setQueued(true);
          setDayQueued(true);
          setSubmissionMessage(`${markedStudents.length} records stored on this device. Waiting to sync; the server has not confirmed them.`);
        } catch (storageError) {
          const reason = storageError instanceof Error ? storageError.message : 'Device storage is unavailable.';
          setSubmissionMessage(`Could not store attendance on this device. ${reason} Your edits remain open; retry submission.`);
          triggerHaptic('warning');
        }
      } else {
        triggerHaptic('warning');
        setSubmissionMessage(error?.message || 'Failed to submit attendance. Your edits remain open.');
        alertCompat('Could not submit', error?.message || 'Your edits remain open. Retry submission.');
      }
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (busy || queued) return;
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
        `${pendingList} ${unmarked === 1 ? 'is' : 'are'} still unmarked and will be skipped. Submit the ${marked} marked student${marked === 1 ? '' : 's'}? Previously saved records for skipped students will be kept.`,
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
    if (!detectedClassId || busy || dayQueued) return;
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
      delete drafts.current[`${draftOwnerId}_${selectedDate}_morning_${detectedClassId}`];
      delete drafts.current[`${draftOwnerId}_${selectedDate}_afternoon_${detectedClassId}`];
      setDraftCount(0);
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
        disabled={submitting || clearingDay}
        accessibilityRole="tab"
        accessibilityState={{ selected: active, disabled: submitting || clearingDay }}
        accessibilityLabel={`${label} attendance session`}
        onPress={() => {
          if (!active) {
            triggerHaptic('light');
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setLoading(true);
            setSession(value);
            setStatusFilter('all');
            setSearchQuery('');
            setFilterChronicAbsent(false);
          }
        }}
        style={[styles.sessionTab, active && styles.sessionTabActive]}
      >
        <Ionicons name={icon} size={16} color={active ? '#fff' : theme.colors.textSecondary} />
        <Text style={[styles.sessionTabText, { color: active ? '#fff' : theme.colors.textSecondary }]}>{label}</Text>
        {done && <Ionicons name="ellipse-outline" size={14} color={active ? '#fff' : ACCENT.emerald} style={{ marginLeft: 4 }} />}
      </TouchableOpacity>
    );
  };

  const renderDatePicker = () => (
    <TourTarget id="staff.attendance.class" native><View pointerEvents={submitting || clearingDay ? "none" : "auto"} style={[styles.datePickerCard, styles.surface]}>
      <View style={styles.datePickerTop}>
        <View style={styles.datePickerLabelRow}>
          <Ionicons name="calendar-outline" size={16} color={theme.colors.primary} />
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
        accentColor={theme.colors.primary}
        placeholder="Select date"
        containerStyle={styles.datePickerField}
      />
      {!isToday && (
        <View style={styles.backdateHint}>
          <Ionicons name="time-outline" size={13} color={ACCENT.amber} />
          <Text style={styles.backdateHintText}>Marking a previous day · {selectedDateLabel}</Text>
        </View>
      )}
    </View></TourTarget>
  );

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {renderDatePicker()}

      {/* Session Switcher */}
      <View accessibilityRole="tablist" style={styles.sessionSwitch}>
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

      {/* Stats — marking progress is separate from submission confirmation. */}
      {total > 0 && <View style={[styles.statsOuter, styles.surface]}>
        <View style={styles.statsCardHeader}>
          <Text style={styles.statsCardTitle}>{marked} of {total} marked</Text>
          <View style={[styles.completionChip, completionPct === 100 ? styles.chipComplete : styles.chipPending]}>
            <Text style={[styles.completionChipText, { color: completionPct === 100 ? ACCENT.emerald : ACCENT.amber }]}>
              {completionPct}%
            </Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <OverviewChip label="Present" value={present} color={ACCENT.emerald} icon="checkmark-circle" isDark={isDark} />
          <OverviewChip label="Absent" value={absent} color={ACCENT.rose} icon="close-circle" isDark={isDark} />
          <OverviewChip label="Unmarked" value={unmarked} color={ACCENT.amber} icon="time" isDark={isDark} />
        </View>
      </View>}

      <View accessibilityLiveRegion="polite" style={[styles.statusPanel, styles.surface]}>
        <Text style={styles.contextTitle}>{detectedClassLabel ? `Class ${detectedClassLabel}` : 'Class assignment'} · {session === 'morning' ? 'Morning' : 'Afternoon'}</Text>
        <Text style={styles.statusText}>{!detectedClassId ? (loadError ? 'Attendance unavailable' : 'No class assigned for this session') : !total ? 'No enrolled students' : submitting ? 'Submitting to the server…' : queued ? 'Waiting to sync · saved on this device' : draftCount ? 'Unsubmitted changes' : submissionConfirmed ? 'Submitted to the server' : marked ? 'Loaded attendance records' : 'Ready to mark attendance'}</Text>
        <Text style={styles.statusHint}>{submissionMessage || (draftCount ? 'Edits are kept while this portal is open. Submit to save them to the server.' : queued ? 'Reconnect and retry sync to confirm these records on the server.' : 'Marking a student does not submit attendance.')}</Text>
        {!!loadError && <Text style={[styles.statusHint, { color: theme.colors.alertText }]}>{loadError}</Text>}
        <TouchableOpacity accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }} onPress={() => void loadStudents()} style={styles.statusAction}>
          <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>{refreshing ? 'Refreshing and checking queue…' : queued ? 'Retry sync and refresh' : 'Refresh server records'}</Text>
        </TouchableOpacity>
      </View>

      {/* Offline Cached Indicator */}
      {(isOfflineCached || offline) && (
        <View style={styles.offlineCachedBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color={ACCENT.amber} />
          <Text style={styles.offlineCachedText}>{offline ? 'Offline · submissions can be queued on this device' : refreshing ? 'Cached records · checking the server' : 'Cached records · server refresh unavailable'}</Text>
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
            <Text style={styles.chronicAlertText}>
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

      {total > 0 && (
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {(['all', 'unmarked', 'present', 'absent'] as const).map(filter => (
            <TouchableOpacity
              key={filter}
              onPress={() => { setStatusFilter(filter); setFilterChronicAbsent(false); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: statusFilter === filter }}
              style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: statusFilter === filter ? theme.colors.primary : theme.colors.border, backgroundColor: theme.colors.surface }}
            >
              <Text style={{ color: statusFilter === filter ? theme.colors.primary : theme.colors.textSecondary, fontSize: 14, fontWeight: '600' }}>
                {filter === 'all' ? `All (${total})` : filter === 'unmarked' ? `Unmarked (${unmarked})` : filter === 'present' ? `Present (${present})` : `Absent (${absent})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {total > 0 && <View style={{ marginHorizontal: 16, marginTop: 12 }}>{renderBulkActions()}</View>}

      {/* Search Bar */}
      {total > 0 && (
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={theme.colors.textSecondary} style={styles.searchIcon} />
          <TourTarget id="staff.attendance.search" native event="staff.attendance.search"><TextInput
            style={styles.searchInput}
            placeholder="Search name or roll number"
            accessibilityLabel="Search students by name or roll number"
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
            clearButtonMode="while-editing"
          /></TourTarget>
        </View>
      )}

      {/* List Meta */}
      <Text style={[styles.statusHint, { marginHorizontal: 16, marginTop: 12 }]}>Use Present or Absent. Tap the selected button to unmark. You can also swipe right for present or left for absent.</Text>
      <TourTarget id="staff.attendance.review" native><View style={styles.listMeta}>
        <View style={styles.listMetaLeft}>
          <LinearGradient colors={[ACCENT.violet, ACCENT.emerald]} style={styles.sectionAccent} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
          <Text style={styles.listMetaText}>Student List</Text>
        </View>
        <Text style={styles.studentCountLabel}>{filteredStudents.length} Students</Text>
      </View></TourTarget>
    </View>
  );

  const attendanceRows = useMemo(
    () => filteredStudents.map((student) => ({ ...student, status: statusOf(student) })),
    [filteredStudents, statusOf],
  );

  const renderBulkActions = () => (
<View style={styles.quickActions}>
        <TouchableOpacity
          disabled={editingDisabled || refreshing}
          accessibilityState={{ disabled: editingDisabled || refreshing }}
          style={[styles.quickBtn, { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.shape.borderRadiusMD, opacity: editingDisabled ? 0.5 : 1 }]}
          activeOpacity={0.85}
          onPress={() => setAllForSession('present')}
          accessibilityRole="button"
          accessibilityLabel="Mark all students present"
        >
          <Ionicons name="checkmark-done" size={18} color={theme.colors.primary} />
          <Text style={[styles.quickBtnText, { color: theme.colors.primary }]}>All Present</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={editingDisabled || refreshing}
          accessibilityState={{ disabled: editingDisabled || refreshing }}
          style={[styles.quickBtn, { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.shape.borderRadiusMD, opacity: editingDisabled ? 0.5 : 1 }]}
          activeOpacity={0.85}
          onPress={() => alertCompat('Reset local marks?', 'This unmarks the current session on this screen. It does not remove records already on the server. Use the day menu to clear saved attendance.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset local marks', onPress: () => setAllForSession('unmarked') }])}
          accessibilityRole="button"
          accessibilityLabel="Reset attendance for this session"
        >
          <Ionicons name="refresh" size={18} color={isDark ? '#C7D2FE' : ACCENT.indigo} />
          <Text style={[styles.quickBtnText, { color: isDark ? '#C7D2FE' : ACCENT.indigo }]}>Reset</Text>
        </TouchableOpacity>
      </View>
  );

  const renderFooter = () => (
    <View style={[styles.actionFooter, styles.surface]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleSubmit}
        disabled={busy || !canSubmit}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !canSubmit }}
        accessibilityLabel={canSubmit
          ? `Submit ${marked} marked ${session} attendance record${marked === 1 ? '' : 's'}`
          : 'Mark at least one student to submit attendance'}
        style={[styles.submitBtn, { backgroundColor: theme.colors.primaryDark, borderRadius: theme.shape.borderRadiusMD, opacity: busy || !canSubmit ? 0.5 : 1 }]}
      >
        {submitting ? (
          <LogoLoader color="#fff" />
        ) : (
          <>
            <Text style={[styles.submitText, { color: '#fff' }]}>
              {canSubmit
                ? `Submit ${marked} marked`
                : queued ? 'Waiting for sync' : submissionConfirmed ? 'Submitted to server' : 'Mark students to submit'}
            </Text>
            {canSubmit && <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />}
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <TourTarget id="screen.staff-manage-students.workspace" style={{ flex: 1 }}><GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        <TourTarget id="screen.staff-manage-students.overview"><StaffHeader
          title="Student Attendance"
          subtitle={selectedDateLabel}
          showBackButton={true}
          showMenuButton={false}
        /></TourTarget>
        {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}
        <View style={{ width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Text style={{ color: theme.colors.textStrong, fontSize: theme.typography.fontSizeMD, fontWeight: '600' }}>{detectedClassLabel ? `Class ${detectedClassLabel}` : loading ? 'Loading class…' : loadError ? 'Class unavailable' : 'No class assigned'}</Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.typography.fontSizeMD }}>{session === 'morning' ? 'Morning session' : 'Afternoon session'}</Text>
        </View>

        {loading ? (
          <TourScrollView contentContainerStyle={[styles.emptyWithPicker, { paddingBottom: tabBarReserve + insets.bottom }]} keyboardShouldPersistTaps="handled">
<View style={styles.headerContainer}>{renderDatePicker()}<View accessibilityRole="tablist" style={styles.sessionSwitch}><SessionTab value="morning" label="Morning" icon="sunny-outline" /><SessionTab value="afternoon" label="Afternoon" icon="partly-sunny-outline" /></View></View>
            <View style={styles.emptyState}>
              <LogoLoader size={60} color={theme.colors.primary} />
              <Text style={styles.loadingText}>Loading class and checking queued attendance…</Text>
            </View>
          </TourScrollView>
        ) : students.length === 0 ? (
          <TourScrollView contentContainerStyle={[styles.emptyWithPicker, { paddingBottom: tabBarReserve + insets.bottom }]} keyboardShouldPersistTaps="handled">
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
                {loadError ? 'Could not load attendance' : detectedClassId ? 'No students yet' : 'No class assigned'}
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
          </TourScrollView>
        ) : (
          <FlatList
            ref={studentListRef}
            data={attendanceRows}
            keyExtractor={(item) => item.id}
            style={styles.scrollFlex}
            contentContainerStyle={[styles.listContent, { paddingBottom: 24 }]}
            refreshing={refreshing}
            onRefresh={() => { if (!busy) void loadStudents(); }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={7}
            ListHeaderComponent={renderHeader()}
            ListFooterComponent={<View style={{ height: 24 }} />}
            ListEmptyComponent={(
              <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
                <Text style={{ color: theme.colors.textStrong, fontSize: 16, fontWeight: '600' }}>
                  {statusFilter === 'unmarked' && unmarked === 0 ? 'Every student is marked' : 'No matching students'}
                </Text>
                <Text style={{ color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
                  {statusFilter === 'unmarked' && unmarked === 0 ? 'Review your marks, then submit attendance below.' : 'Try another name or clear the filters to see your class.'}
                </Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => { setSearchQuery(''); setStatusFilter('all'); setFilterChronicAbsent(false); }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }}>
                  <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>Show all students</Text>
                </TouchableOpacity>
              </View>
            )}
            renderScrollComponent={Platform.OS === 'web' ? undefined : (props) => (
              <KeyboardAwareScrollView {...props} bottomOffset={24} />
            )}
            renderItem={({ item }) => (
              <SwipeableStudentCard
                student={item}
                onStatusChange={handleStatusChange}
                onPressStreak={setSelectedInsightStudent}
                disabled={editingDisabled}
                isDark={isDark}
              />
            )}
          />
        )}

        {!loading && total > 0 && !keyboardVisible && (
          <View style={{ marginBottom: tabBarReserve, paddingBottom: Math.max(insets.bottom, 8), backgroundColor: theme.colors.surface }}>
            <TouchableOpacity accessibilityRole="button" onPress={() => { setStatusFilter('unmarked'); setSearchQuery(''); setFilterChronicAbsent(false); studentListRef.current?.scrollToOffset({ offset: 0, animated: true }); }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, width: '100%', maxWidth: 900, alignSelf: 'center' }}>
              <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>{marked}/{total} marked · {unmarked} unmarked · Show unmarked</Text>
            </TouchableOpacity>
            {submissionMessage && <Text accessibilityLiveRegion="polite" style={[styles.statusHint, { paddingHorizontal: 16, width: '100%', maxWidth: 900, alignSelf: 'center' }]}>{submissionMessage}</Text>}
            {width >= 600 || fontScale <= 1.3 ? renderFooter() : (
              <TouchableOpacity accessibilityRole="button" disabled={busy || !canSubmit} onPress={handleSubmit} style={[styles.submitBtn, { backgroundColor: theme.colors.primaryDark, opacity: busy || !canSubmit ? 0.5 : 1 }]}>
                <Text style={[styles.submitText, { color: '#fff' }]}>{submitting ? 'Submitting…' : queued ? 'Waiting for sync' : submissionConfirmed ? 'Submitted to server' : `Submit ${marked} marked`}</Text>
              </TouchableOpacity>
            )}
          </View>
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
                disabled={busy || dayQueued}
                accessibilityState={{ disabled: busy || dayQueued }}
                accessibilityRole="button"
                accessibilityLabel="Clear attendance for this day"
              >
                <Ionicons name="trash-outline" size={18} color={ACCENT.rose} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dayMenuTitle}>Clear this day&apos;s attendance</Text>
                  <Text style={styles.dayMenuHint}>{dayQueued ? 'Sync queued attendance for this day before clearing it.' : `Removes every mark for ${selectedDateLabel}`}</Text>
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
    </GestureHandlerRootView></TourTarget>
  );
}

const getStyles = (theme: SchoolTheme, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  surface: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.shape.borderRadiusLG },
  statusPanel: { marginHorizontal: 16, marginTop: 12, padding: theme.spacing.md, gap: theme.spacing.sm },
  contextTitle: { color: theme.colors.textStrong, fontSize: theme.typography.fontSizeLG, fontWeight: '700' },
  statusText: { color: theme.colors.textStrong, fontSize: theme.typography.fontSizeMD, fontWeight: '600' },
  statusHint: { color: theme.colors.textSecondary, fontSize: theme.typography.fontSizeSM, lineHeight: 20 },
  statusAction: { minHeight: 44, justifyContent: 'center' },
  loadingText: { marginTop: 16, fontSize: 16, color: theme.colors.textSecondary, fontWeight: '600' },
  emptyWithPicker: { flexGrow: 1, width: '100%', maxWidth: 900, alignSelf: 'center' },
  emptyState: { minHeight: 240, paddingVertical: 24, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyIconRing: { width: 110, height: 110, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.textPrimary, marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: theme.colors.primaryDark },
  retryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  
  headerContainer: { paddingBottom: 8 },

  datePickerCard: { marginHorizontal: 16, marginTop: 16, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, gap: 10 },
  datePickerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  datePickerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  moreBtn: {
    width: 44,
    height: 44,
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
    fontSize: 13,
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
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: isDark ? 'rgba(79,70,229,0.22)' : 'rgba(79,70,229,0.12)',
  },
  todayChipText: { fontSize: 12, fontWeight: '800', color: ACCENT.indigo },
  backdateHint: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backdateHintText: { flex: 1, fontSize: 12, fontWeight: '600', color: isDark ? '#FBBF24' : ACCENT.amberDeep },
  
  sessionSwitch: { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, padding: 4, borderRadius: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0', gap: 4 },
  sessionTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, gap: 6 },
  sessionTabActive: { backgroundColor: theme.colors.primaryDark },
  sessionTabText: { fontSize: 14, fontWeight: '700' },
  
  sessionHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 20, marginTop: 12 },
  sessionHintText: { flex: 1, fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },

  statsOuter: { marginHorizontal: 16, marginTop: 14, marginBottom: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, gap: 8 },
  statsCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statsCardTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.textPrimary, letterSpacing: -0.2 },
  completionChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  chipComplete: { backgroundColor: isDark ? 'rgba(16,185,129,0.2)' : '#D1FAE5' },
  chipPending: { backgroundColor: isDark ? 'rgba(245,158,11,0.2)' : '#FEF3C7' },
  completionChipText: { fontSize: 13, fontWeight: '800' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', marginHorizontal: 16, marginTop: 10, paddingHorizontal: 14, borderRadius: 16, minHeight: 48, paddingVertical: 8, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.textPrimary, fontWeight: '500' },

  listMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 20, marginBottom: 8 },
  listMetaLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionAccent: { width: 4, height: 18, borderRadius: 2 },
  listMetaText: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5 },
  studentCountLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  scrollFlex: { flex: 1, width: '100%', maxWidth: 900, alignSelf: 'center' },
  listContent: { paddingTop: 4, flexGrow: 1, paddingBottom: 8 },

  actionFooter: { width: '100%', maxWidth: 900, alignSelf: 'center', gap: 8, padding: 12 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickBtn: { flex: 1, minWidth: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  quickBtnText: { fontSize: 14, fontWeight: '800' },
  submitBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16, minHeight: 56 },
  submitText: { flexShrink: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },

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
    fontSize: 13,
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
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: isDark ? '#FBBF24' : '#B45309',
  },
});
