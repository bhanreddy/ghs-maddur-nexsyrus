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
  KeyboardAvoidingView,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import StaffHeader from '../../src/components/StaffHeader';
import SwipeableStudentCard from '../../src/components/SwipeableStudentCard';
import { staffTabBarReserve } from '../../src/components/StaffFooter';
import { useAuth } from '../../src/hooks/useAuth';
import { AttendanceService, currentSession } from '../../src/services/attendanceService';
import { AttendanceStatus, AttendanceSession } from '../../src/types/schema';
import { useTheme } from '../../src/hooks/useTheme';
import type { SchoolTheme } from '../../src/theme/types';
import LogoLoader from '../../src/components/LogoLoader';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';

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
  const { user } = useAuth();
  const { staffId, isViewingAsAdmin, viewAsName } = useEffectiveStaffId();

  const [students, setStudents] = useState<StudentUI[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [detectedClassId, setDetectedClassId] = useState<string | null>(null);
  const [detectedClassLabel, setDetectedClassLabel] = useState<string | null>(null);
  const [session, setSession] = useState<AttendanceSession>(currentSession());
  const [loadError, setLoadError] = useState<string | null>(null);

  const tabBarReserve = staffTabBarReserve(theme.spacing);

  const statusOf = useCallback(
    (s: StudentUI): SessionStatus => (session === 'morning' ? s.morningStatus : s.afternoonStatus),
    [session]
  );

  const present = students.filter((s) => statusOf(s) === 'present').length;
  const absent = students.filter((s) => statusOf(s) === 'absent').length;
  const unmarked = students.filter((s) => statusOf(s) === 'unmarked').length;
  const total = students.length;
  const completionPct = total > 0 ? Math.round(((present + absent) / total) * 100) : 0;
  const canSubmit = total > 0 && unmarked === 0;

  const otherSessionMarked = students.filter((s) =>
    (session === 'morning' ? s.afternoonStatus : s.morningStatus) !== 'unmarked'
  ).length;

  const filteredStudents = useMemo(() => {
    const base = !searchQuery.trim()
      ? students
      : students.filter((s) => {
          const lowerQ = searchQuery.toLowerCase();
          return s.name.toLowerCase().includes(lowerQ) || s.rollNo.toLowerCase().includes(lowerQ);
        });
    return [...base].sort(sortByRollNo);
  }, [students, searchQuery]);

  const loadStudents = useCallback(async () => {
    if (!user) return;
    setLoadError(null);
    setLoading(true);
    try {
      const myClass = await AttendanceService.getMyClass(undefined, staffId, session);
      if (!myClass) {
        setStudents([]);
        setDetectedClassId(null);
        setDetectedClassLabel(null);
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
        }))
        .sort(sortByRollNo);
      setStudents(formatted);
    } catch (err) {
      console.error('Failed to load class students:', err);
      setStudents([]);
      setDetectedClassId(null);
      setDetectedClassLabel(null);
      setLoadError('Could not reach the server. Make sure the backend is running, then pull to refresh.');
    } finally {
      setLoading(false);
    }
  }, [user, staffId, session]);

  useFocusEffect(
    useCallback(() => {
      loadStudents();
    }, [loadStudents])
  );

  const handleStatusChange = useCallback((id: string, newStatus: SessionStatus) => {
    triggerHaptic('light');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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

  const handleSubmit = async () => {
    if (students.length === 0 || unmarked > 0) {
      triggerHaptic('warning');
      alertCompat('Incomplete', `${unmarked} student${unmarked > 1 ? 's' : ''} still unmarked.`);
      return;
    }
    try {
      setSubmitting(true);
      if (!detectedClassId) throw new Error('No class assigned.');
      
      const date = new Date().toISOString().split('T')[0];
      await AttendanceService.markAttendance({
        class_section_id: detectedClassId,
        date,
        session,
        records: students
          .filter((s) => s.enrollmentId)
          .map((s) => ({ student_id: s.id, status: statusOf(s) as AttendanceStatus })),
      });
      triggerHaptic('success');
      alertCompat(`Success`, `${session === 'morning' ? 'Morning' : 'Afternoon'} attendance submitted.`);
      router.back();
    } catch (error: any) {
      triggerHaptic('warning');
      alertCompat('Error', 'Failed to submit attendance.');
    } finally {
      setSubmitting(false);
    }
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

  const renderHeader = () => (
    <View style={styles.headerContainer}>
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
        accessibilityLabel={canSubmit ? `Submit ${session} attendance` : `${unmarked} students still pending`}
        style={[styles.submitBtn, clayButton(isDark, canSubmit ? 'violet' : 'amber')]}
      >
        {submitting ? (
          <LogoLoader color="#fff" />
        ) : (
          <>
            <Text style={[styles.submitText, { color: canSubmit ? '#fff' : (isDark ? '#FDE68A' : ACCENT.amberDeep) }]}>
              {canSubmit ? `Submit ${session} Attendance` : `${unmarked} Pending Student${unmarked !== 1 ? 's' : ''}`}
            </Text>
            {canSubmit && <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />}
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        <StaffHeader
          title="Attendance"
          subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
          showBackButton={true}
          showMenuButton={false}
        />
        {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}

        {loading ? (
          <View style={styles.emptyState}>
            <LogoLoader size={60} color={ACCENT.violet} />
            <Text style={styles.loadingText}>Syncing class data...</Text>
          </View>
        ) : students.length === 0 ? (
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
                  : `You don't have a class assigned for the ${session} session today. Switch sessions or contact admin.`}
            </Text>
            {loadError && (
              <TouchableOpacity style={styles.retryBtn} onPress={loadStudents} activeOpacity={0.85}>
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredStudents}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={renderHeader}
            ListFooterComponent={renderFooter}
            renderItem={({ item }) => (
              <SwipeableStudentCard
                student={{ id: item.id, name: item.name, rollNo: item.rollNo, status: statusOf(item), photoUrl: item.photoUrl }}
                onStatusChange={handleStatusChange}
                isDark={isDark}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

const getStyles = (theme: SchoolTheme, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? theme.colors.background : '#F1F5F9' },
  loadingText: { marginTop: 16, fontSize: 16, color: theme.colors.textSecondary, fontWeight: '600' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyIconRing: { width: 110, height: 110, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.textPrimary, marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: ACCENT.indigo },
  retryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  
  headerContainer: { paddingBottom: 8 },
  
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
  listContent: { paddingTop: 4, flexGrow: 1 },

  actionFooter: { marginHorizontal: 16, marginTop: 20, gap: 10, padding: 14 },
  quickActions: { flexDirection: 'row', gap: 10 },
  quickBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  quickBtnText: { fontSize: 14, fontWeight: '800' },
  submitBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16, minHeight: 56 },
  submitText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
});