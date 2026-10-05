import { TourTarget } from '@/src/features/app-tour';
// OPT: Student attendance — profile + records via useStudentQuery (replaces useEffect + SyncService sync path for this screen).
import React, { useState, useCallback, useMemo, memo } from 'react'; // OPT: No data-fetch useEffect; memo + useMemo for stable subtrees.
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native'; // OPT: Same layout primitives.
import { LinearGradient } from 'expo-linear-gradient'; // OPT: Summary hero gradient.
import { Ionicons } from '@expo/vector-icons'; // OPT: Status icons.
import { useTranslation } from 'react-i18next'; // OPT: i18n for labels.
import Animated, { FadeInDown } from 'react-native-reanimated'; // OPT: Row entrance.
import * as Haptics from '@/src/utils/haptics'; // OPT: Pull feedback.
import ScreenLayout from '../../src/components/ScreenLayout'; // OPT: Page chrome.
import StudentHeader from '../../src/components/StudentHeader'; // OPT: Nav header.
import { useAuth } from '../../src/hooks/useAuth'; // OPT: Student gate + cache user key.
import type { AttendanceRecord, AttendanceSummary, AttendanceResponse } from '../../src/types/models'; // OPT: API typing.
import { useTheme } from '../../src/hooks/useTheme'; // OPT: Theme hook.
import { Theme } from '../../src/theme/themes'; // OPT: Style typing.
import LogoLoader from '../../src/components/LogoLoader'; // OPT: Loading spinner.
import { useStudentQuery } from '../../src/hooks/useStudentQuery'; // OPT: TTL cache + focus refetch.
import type { Student } from '../../src/types/models'; // OPT: Profile typing.
import { ErrorBoundary } from '../../src/components/ErrorBoundary'; // OPT: Isolate runtime errors (same component as Screen/_layout).
import { isTelugu } from '../../src/utils/lang'; // OPT: Locale for date formatting.

const getStatusColor = (status: string) => { // OPT: Pure palette helper (unchanged behavior).
  switch (status.toLowerCase()) { // OPT:
    case 'present': // OPT:
      return '#16a34a'; // OPT:
    case 'absent': // OPT:
      return '#dc2626'; // OPT:
    case 'holiday': // OPT:
      return '#9333ea'; // OPT:
    case 'half_day': // OPT:
    case 'leave': // OPT:
      return '#f59e0b'; // OPT:
    case 'late': // OPT:
      return '#ca8a04'; // OPT:
    default: // OPT:
      return '#6b7280'; // OPT:
  } // OPT:
}; // OPT:

const getStatusIcon = (status: string): keyof typeof Ionicons.glyphMap => { // OPT: Icon map (unchanged).
  switch (status.toLowerCase()) { // OPT:
    case 'present': // OPT:
      return 'checkmark-circle'; // OPT:
    case 'absent': // OPT:
      return 'close-circle'; // OPT:
    case 'holiday': // OPT:
      return 'calendar'; // OPT:
    case 'half_day': // OPT:
    case 'leave': // OPT:
      return 'time'; // OPT:
    case 'late': // OPT:
      return 'alert-circle'; // OPT:
    default: // OPT:
      return 'help-circle'; // OPT:
  } // OPT:
}; // OPT:

const AttendanceStatsBanner = memo(function AttendanceStatsBanner({ // OPT: Pure summary header — memoized.
  percentage, // OPT: Computed attendance %.
  stats, // OPT: Present/absent/late totals.
  styles, // OPT: Themed styles.
  t, // OPT: i18n function from parent useCallback/stable ref.
}: {
  percentage: number; // OPT:
  stats: AttendanceSummary; // OPT:
  styles: ReturnType<typeof getStyles>; // OPT:
  t: (k: string, d?: string) => any; // OPT: Narrow i18n signature for this subtree.
}) {
  return (
    <View style={styles.summaryContainer}>
      <LinearGradient colors={['#10b981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
          <Text style={styles.summaryTitle}>{t('attendance_screen.stats', 'Statistics')}</Text>
          <View style={styles.percentBadge}>
            <Text style={styles.percentText}>{percentage}%</Text>
          </View>
        </View>
        <View style={styles.statRow}>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{stats.present}</Text>
            <Text style={styles.statLabel}>{t('attendance_screen.present', 'Present')}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{stats.absent}</Text>
            <Text style={styles.statLabel}>{t('attendance_screen.absent', 'Absent')}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{stats.late}</Text>
            <Text style={styles.statLabel}>{t('attendance_screen.late', 'Late')}</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
});

const STATUS_FALLBACKS: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  leave: 'On Leave',
  holiday: 'Holiday',
  late: 'Late',
  half_day: 'Half Day',
};

const AttendanceRecordRow = memo(function AttendanceRecordRow({ // OPT: Pure row — memoized for FlatList perf.
  item, // OPT: One attendance day.
  index, // OPT: Stagger index.
  styles, // OPT: Themed styles.
  t, // OPT: i18n for status labels.
  dateLocale, // OPT: Active language locale for dates.
}: {
  item: AttendanceRecord; // OPT:
  index: number; // OPT:
  styles: ReturnType<typeof getStyles>; // OPT:
  t: (k: string, d?: string) => any; // OPT:
  dateLocale: string; // OPT:
}) {
  const color = getStatusColor(item.status); // OPT: Row accent from status.
  const statusKey = item.status.toLowerCase(); // OPT: Normalize API status for i18n key.
  const statusLabel = t(`attendance_screen.${statusKey}`, STATUS_FALLBACKS[statusKey] ?? item.status); // OPT: Localized status.
  const dateObj = new Date(item.attendance_date); // OPT: Parse server date.
  const day = dateObj.toLocaleDateString(dateLocale, { weekday: 'short' }); // OPT: Short weekday in active locale.
  const dayNum = dateObj.getDate(); // OPT: Day of month.
  const fullDate = dateObj.toLocaleDateString(dateLocale, { // OPT: Full date in active locale.
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(500)} style={styles.card}>
      <View style={[styles.dateBox, { backgroundColor: color + '15' }]}>
        <Text style={[styles.dayText, { color }]}>{day}</Text>
        <Text style={[styles.dateText, { color }]}>{dayNum}</Text>
      </View>
      <View style={styles.cardContent}>
        <View>
          <Text style={styles.fullDate}>{fullDate}</Text>
          <Text style={[styles.statusMain, { color }]}>{statusLabel}</Text>
        </View>
        <Ionicons name={getStatusIcon(item.status)} size={28} color={color} />
      </View>
    </Animated.View>
  );
});

function AttendanceScreenInner() { // OPT: Inner tree wrapped by ErrorBoundary below.
  const { theme } = useTheme(); // OPT: Theme for styles.
  const styles = React.useMemo(() => getStyles(theme), [theme]); // OPT: Memoized stylesheet.
  const { t, i18n } = useTranslation(); // OPT: i18n.
  const dateLocale = isTelugu(i18n.language) ? 'te-IN' : 'en-IN'; // OPT: Date formatting locale.
  const { user } = useAuth(); // OPT: Auth.
  const roleCode = typeof user?.role === 'object' && user?.role !== null ? (user.role as { code: string }).code : user?.role; // OPT: Role code.
  const isStudent = roleCode === 'student'; // OPT: Student-only.
  const [refreshing, setRefreshing] = useState(false); // OPT: Pull-to-refresh flag.

  const { data: profile, loading: profileLoading } = useStudentQuery<Student>( // OPT: Cached student profile for UUID.
    '/students/profile/me', // OPT: Profile endpoint.
    'profile', // OPT: Shared cache key with other student screens.
    3 * 60 * 1000, // OPT: TTL.
    user?.userId, // OPT: Partition.
    { enabled: !!user?.userId && isStudent } // OPT: Gated fetch.
  );

  const pid = profile?.id; // OPT: Student id for attendance route.
  const attendanceEndpoint = pid ? `/students/${pid}/attendance` : '/notices'; // OPT: Placeholder when disabled.
  const { data: attendance, loading: attLoading, refetch } = useStudentQuery<AttendanceResponse>( // OPT: Summary + records in one GET.
    attendanceEndpoint, // OPT: Dynamic path includes student id.
    `attendance:${pid}`, // OPT: Per-student cache suffix.
    90 * 1000, // OPT: TTL for history list.
    user?.userId, // OPT: Partition.
    { enabled: Boolean(pid) && isStudent, query: { limit: 120 } } // OPT: Bounded page size for mobile list.
  );

  const records = attendance?.records ?? []; // OPT: Default to empty list.
  const stats: AttendanceSummary = attendance?.summary ?? { present: 0, absent: 0, late: 0, total: 0 }; // OPT: Default stats object.
  const loading = profileLoading || attLoading; // OPT: Single loading gate.

  const effectivePresent = Number( // OPT: Late is attended; two half-days equal one full present day.
    stats.effective_present
      ?? (Number(stats.present || 0) + Number(stats.late || 0) + Number(stats.half_day || 0) * 0.5)
  );
  const percentage = stats.total > 0 // OPT: Prefer the backend's authoritative weighted percentage.
    ? Math.round(Number(stats.attendance_percentage ?? ((effectivePresent / stats.total) * 100)))
    : 0;

  const tStable = useCallback((k: string, d?: string) => t(k, d as any), [t]); // OPT: Stable function ref for memo child props.

  const onRefresh = useCallback(async () => { // OPT: Pull forces network via hook refetch(true).
    setRefreshing(true); // OPT: Show refresh control.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); // OPT: Haptic.
    try {
      await refetch(); // OPT: Bypass TTL for fresh attendance payload.
    } finally {
      setRefreshing(false); // OPT: End refresh UI.
    }
  }, [refetch]); // OPT: refetch identity from useStudentQuery.

  const renderItem = useCallback( // OPT: Stable FlatList renderItem reference.
    ({ item, index }: { item: AttendanceRecord; index: number }) => (
      <AttendanceRecordRow item={item} index={index} styles={styles} t={tStable} dateLocale={dateLocale} />
    ), // OPT: Delegate to memo row.
    [styles, tStable, dateLocale] // OPT: Recreate when theme, language, or locale changes.
  );

  const keyExtractor = useCallback((item: AttendanceRecord) => item.attendance_date, []); // OPT: Stable keys by date string.

  const listEmpty = useCallback( // OPT: Stable empty component factory for FlatList.
    () => (
      <Text style={{ textAlign: 'center', marginTop: 20, color: '#999' }}>
        {t('attendance_screen.no_records', 'No attendance records found.')}
      </Text> // OPT: Localized empty copy.
    ),
    [t] // OPT: Recreate when language changes.
  );

  const refreshCtl = useMemo( // OPT: Memo RefreshControl to avoid re-instantiating each render.
    () => <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />, // OPT: Wired to onRefresh useCallback.
    [refreshing, onRefresh] // OPT: Recreate when refresh state toggles.
  );

  return (
    <ScreenLayout>
      <StudentHeader showBackButton={true} title={t('attendance_screen.title', 'Attendance')} />
      <View style={styles.container}>
        <AttendanceStatsBanner percentage={percentage} stats={stats} styles={styles} t={tStable} />
        {loading ? (
          <LogoLoader size={60} color="#10B981" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={records}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={refreshCtl}
            ListEmptyComponent={listEmpty}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews
          />
        )}
      </View>
    </ScreenLayout>
  );
}

export default function AttendanceScreen() { // OPT: Default export wraps with ErrorBoundary per request.
  return (
    <TourTarget id="screen.screen-attendance.overview" style={{ flex: 1 }}><TourTarget id="screen.screen-attendance.workspace" style={{ flex: 1 }}><ErrorBoundary>
      <AttendanceScreenInner />
    </ErrorBoundary></TourTarget></TourTarget>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent'},
    summaryContainer: { padding: 20, paddingBottom: 10 },
    summaryCard: {
      borderRadius: 20,
      padding: 20,
      shadowColor: '#10b981',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    summaryTitle: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
    percentBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    percentText: { color: theme.colors.background, fontWeight: 'bold', fontSize: 16 },
    statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statItem: { alignItems: 'center', flex: 1 },
    statVal: { fontSize: 24, fontWeight: 'bold', color: theme.colors.background },
    statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
    divider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.3)' },
    list: { padding: 20, paddingBottom: 80 },
    card: {
      backgroundColor: theme.colors.background,
      borderRadius: 16,
      padding: 12,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: theme.colors.text,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    dateBox: { width: 60, height: 60, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    dayText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
    dateText: { fontSize: 20, fontWeight: 'bold' },
    cardContent: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 8 },
    fullDate: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
    statusMain: { fontSize: 16, fontWeight: 'bold' },
  });
