import { AppTourQuickAction, TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Platform,
  StatusBar, BackHandler, Pressable, AppState,
  useWindowDimensions, RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withTiming, interpolate } from 'react-native-reanimated';
import { clayTokens } from '@/src/styles/clayTokens';
import { useAuth } from '@/src/hooks/useAuth';
import { AttendanceService, currentSession, localAttendanceDate } from '@/src/services/attendanceService';
import { LeaveService } from '@/src/services/commonServices';
import { useTheme } from '@/src/hooks/useTheme';
import * as Haptics from '@/src/utils/haptics';
import StaffHeader from '@/src/components/StaffHeader';
import StaffHero from '@/src/components/staff-hero/StaffHero';
import ViewAsBanner from '@/src/components/ViewAsBanner';
import { SCHOOL_CONFIG } from '@/src/constants/schoolConfig';
import { useEffectiveStaffId } from '@/src/hooks/useEffectiveStaffId';
import { usePersistedSWR } from '@/src/hooks/usePersistedSWR';
import { STAFF_QUICK_ACTIONS, type StaffDestination } from '@/src/config/staffNavigation';
import StaffToolsDrawer from '@/src/components/StaffToolsDrawer';
import { Staff, StaffService } from '@/src/services/staffService';
import { schoolHeroSlidesService, type HeroSlideItem } from '@/src/services/schoolHeroSlidesService';
import { schoolStoriesService, type SchoolStoryAuthor } from '@/src/services/schoolStoriesService';
import StaffAttendanceQuickCard from '@/src/components/StaffAttendanceQuickCard';
import AcademicTodayCard from '@/src/components/AcademicTodayCard';
import { UpcomingEventsWidget } from '@/src/components/calendar/UpcomingEventsWidget';
import { DailySparkWidget } from '@/src/components/content/DailySparkWidget';
import { usePopupUnreadCount } from '@/src/features/popups/popupUnreadStore';

const MENU_GAP = 16;
const IS_WEB = Platform.OS === 'web';
interface DashboardMetrics {
  totalStudents: number;
  presentToday: number;
  absentToday: number;
  pendingLeaves: number;
  classId?: string;
  className?: string;
  sectionName?: string;
  date: string;
  session: 'morning' | 'afternoon';
}

// Counts reflect the last server response, never local edits or queued submissions.
const AttendanceHero = React.memo(function AttendanceHero({ data, onPress, loading, error, refreshing, onRetry }: {
  data: DashboardMetrics | null; onPress: () => void; loading: boolean;
  error: Error | null; refreshing: boolean; onRetry: () => void;
}) {
  const { theme, isDark } = useTheme();
  const total = data?.totalStudents ?? 0;
  const marked = (data?.presentToday ?? 0) + (data?.absentToday ?? 0);
  const unmarked = Math.max(0, total - marked);
  const classLabel = [data?.className, data?.sectionName].filter(Boolean).join(' · ');
  const label = !data ? (loading ? 'Loading your class…' : 'Class status unavailable')
    : !data.classId ? 'No class assigned for this session'
    : !total ? 'No enrolled students in this class'
    : unmarked ? `${unmarked} student${unmarked === 1 ? '' : 's'} still unmarked` : 'All students marked on the server';
  const sessionLabel = data?.session === 'afternoon' ? 'Afternoon' : data?.session === 'morning' ? 'Morning' : 'Current session';
  const present = data?.presentToday ?? 0;
  const absent = data?.absentToday ?? 0;
  const pct = total > 0 ? Math.round((marked / total) * 100) : 0;
  const ink = isDark ? '#F4F7FF' : '#1B2437';
  const muted = isDark ? 'rgba(244,247,255,0.62)' : '#7B8499';
  const glass = (extra?: object) => ({
    backgroundColor: isDark ? 'rgba(18, 24, 42, 0.55)' : 'rgba(255,255,255,0.42)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.78)',
    ...(IS_WEB ? { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as object : null),
    ...extra,
  });
  const chips = [
    { key: 'present', label: 'Present', value: present, ink: isDark ? '#9DCFB8' : '#3F8F6C', wash: isDark ? 'rgba(63,143,108,0.16)' : 'rgba(63,143,108,0.07)' },
    { key: 'absent', label: 'Absent', value: absent, ink: isDark ? '#E4B0B0' : '#C27070', wash: isDark ? 'rgba(194,112,112,0.16)' : 'rgba(194,112,112,0.07)' },
    { key: 'unmarked', label: 'Not marked', value: unmarked, ink: isDark ? '#E2C892' : '#A88842', wash: isDark ? 'rgba(168,136,66,0.16)' : 'rgba(168,136,66,0.07)' },
  ];
  const note = error
    ? 'Could not refresh. Any counts shown are from the last response.'
    : refreshing
      ? 'Refreshing class status…'
      : data
        ? 'Last server records. Open attendance to review drafts.'
        : 'Open attendance to choose a date and session.';
  const statusLead = Boolean(data && data.classId && total);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open student attendance for today's session"
      onPress={onPress}
      style={({ pressed }) => ({
      marginBottom: theme.spacing.md,
      borderRadius: 28,
      padding: 8,
      overflow: 'hidden',
      opacity: pressed ? 0.92 : 1,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.95)',
      ...(IS_WEB
        ? { boxShadow: isDark
          ? '0 16px 36px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.18)'
          : '0 16px 36px rgba(120, 140, 180, 0.16), inset 0 1px 0 rgba(255,255,255,1)' }
        : { shadowColor: '#8AA0C8', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 4 }),
    })}>
      <LinearGradient
        colors={isDark ? ['#1A2030', '#222838'] : ['#F7FBFF', '#EEF3FA', '#F4F7FC']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 16, right: 16, height: 42, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 }}
        pointerEvents="none"
      />

      <View style={{ ...glass({ backgroundColor: isDark ? 'rgba(15,23,42,0.4)' : 'rgba(255,255,255,0.46)' }), borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(108,99,255,0.16)' : 'rgba(108,99,255,0.08)', borderWidth: 1, borderColor: isDark ? 'rgba(108,99,255,0.28)' : 'rgba(108,99,255,0.12)' }}>
          <Ionicons name="people" size={18} color={isDark ? '#C4BEF8' : '#6A62C9'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: ink, fontSize: 15, fontWeight: '800', letterSpacing: -0.3 }}>Student attendance</Text>
          <Text style={{ color: muted, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
            {classLabel ? `Class ${classLabel} · ` : ''}{sessionLabel}
          </Text>
        </View>
        {!!total && (
          <View style={{ ...glass({ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)' }), width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: pct === 100 ? (isDark ? '#9DCFB8' : '#3F8F6C') : ink, fontSize: 13, fontWeight: '800' }}>{pct}%</Text>
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 4, paddingTop: 8, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text accessibilityLiveRegion="polite" style={{ color: ink, fontSize: 14, fontWeight: '800', flex: 1 }} numberOfLines={1}>
            {statusLead && unmarked ? <Text style={{ color: ink }}>{unmarked} </Text> : null}
            {statusLead && unmarked ? `${unmarked === 1 ? 'student' : 'students'} still unmarked` : label}
          </Text>
          {!!total && <Text style={{ color: muted, fontSize: 12, fontWeight: '700' }}>{marked}/{total} marked</Text>}
        </View>

        {!!total && (
          <>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {chips.map(chip => (
                <View key={chip.key} style={{
                  ...glass({ backgroundColor: chip.wash, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)' }),
                  flex: 1,
                  borderRadius: 12,
                  minHeight: 34,
                  paddingVertical: 6,
                  paddingHorizontal: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}>
                  <Text style={{ color: chip.ink, fontSize: 14, fontWeight: '800' }}>{chip.value}</Text>
                  <Text style={{ color: muted, fontSize: 11, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>{chip.label}</Text>
                </View>
              ))}
            </View>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: marked, text: `${marked} of ${total} marked` }} style={{ height: 6, borderRadius: 6, overflow: 'hidden', backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' }}>
              <View style={{ height: 6, width: `${pct}%`, borderRadius: 6, backgroundColor: pct === 100 ? (isDark ? '#7EBF9E' : '#6AAB88') : (isDark ? '#A8B0E8' : '#8E97D4') }} />
            </View>
          </>
        )}

        <Text style={{ color: error ? theme.colors.alertText : muted, fontSize: 11, lineHeight: 15 }} numberOfLines={1}>{note}</Text>
        {error && <Pressable accessibilityRole="button" onPress={(event) => { event?.stopPropagation?.(); onRetry(); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: '#5B4BDB', fontWeight: '700' }}>Retry class status</Text></Pressable>}

        <View style={{ borderRadius: 16, overflow: 'hidden', ...(IS_WEB ? { boxShadow: '0 8px 16px rgba(90, 110, 150, 0.22)' } : null) }}>
          <LinearGradient colors={isDark ? ['#3A465C', '#2C3548'] : ['#6E7C96', '#556378']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ minHeight: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <LinearGradient colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']} style={{ position: 'absolute', top: 0, left: 14, right: 14, height: 14, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }} pointerEvents="none" />
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700', flex: 1 }}>{total && !unmarked ? 'Review attendance' : 'Mark student attendance'}</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </LinearGradient>
        </View>
      </View>
    </Pressable>
  );
});

// ─── Section Label ────────────────────────────────────────────────────────────
const SectionLabel = React.memo(function SectionLabel({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.sectionLabel}>
      <LinearGradient colors={['#6C63FF', '#10B981']} style={styles.sectionAccent} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
      <Text style={[styles.sectionLabelText, { color: theme.colors.textSecondary }]}>{label}</Text>
    </View>
  );
});

type TileName = keyof typeof clayTokens.colors.tiles;

const MENU_ICON = { color: '#FFFFFF', size: 26 } as const;

const MENU_CONFIGS: Record<string, { icon: React.ReactNode; category: string; tile: TileName }> = {
  notices: { icon: <Ionicons name="megaphone" size={MENU_ICON.size} color={MENU_ICON.color} />, category: 'UPDATES', tile: 'indigo' },
  updates: { icon: <Ionicons name="notifications" size={MENU_ICON.size} color={MENU_ICON.color} />, category: 'ALERTS', tile: 'bronze' },
  messages: { icon: <Ionicons name="chatbubbles" size={MENU_ICON.size} color={MENU_ICON.color} />, category: 'COMMS', tile: 'burgundy' },
  diary: { icon: <FontAwesome5 name="book" size={22} color={MENU_ICON.color} />, category: 'RECORDS', tile: 'copper' },
  anecdotes: { icon: <Ionicons name="journal" size={MENU_ICON.size} color={MENU_ICON.color} />, category: 'NOTES', tile: 'plum' },
  timetable: { icon: <Ionicons name="calendar" size={MENU_ICON.size} color={MENU_ICON.color} />, category: 'SCHEDULE', tile: 'rosewood' },
  portfolio: { icon: <Ionicons name="id-card" size={MENU_ICON.size} color={MENU_ICON.color} />, category: 'STUDENTS', tile: 'navy' },
  leaves: { icon: <FontAwesome5 name="calendar-check" size={20} color={MENU_ICON.color} />, category: 'APPROVALS', tile: 'copper' },
  results: { icon: <MaterialIcons name="assessment" size={26} color={MENU_ICON.color} />, category: 'MARKS', tile: 'forest' },
  lms: { icon: <MaterialIcons name="cloud-upload" size={26} color={MENU_ICON.color} />, category: 'CONTENT', tile: 'sapphire' },
};

function getStaffClayColors(configKey: string, isDark: boolean) {
  const tileName = MENU_CONFIGS[configKey]?.tile ?? 'indigo';
  const tile = clayTokens.colors.tiles[tileName];
  return { bg: isDark ? tile.dark : tile.bg, shadowColor: tile.shadow };
}

const MenuCard = React.memo(function MenuCard({ item, badge, onPress, index }: {
  item: StaffDestination;
  badge?: string;
  onPress: () => void;
  index: number;
}) {
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = width < 380 ? width - 40 : width < 760 ? (Math.min(width, 1120) - 40 - MENU_GAP) / 2 : 220;
  const borderRadius = IS_WEB ? 28 : 24;
  const pressScale = useSharedValue(1);
  const hoverLift = useSharedValue(0);
  const cfg = MENU_CONFIGS[item.key] ?? MENU_CONFIGS.diary;

  const wrapperStyle = useAnimatedStyle(() => {
    const hoverScale = IS_WEB ? interpolate(hoverLift.value, [0, 1], [1, 1.02]) : 1;
    const y = IS_WEB ? interpolate(hoverLift.value, [0, 1], [0, -3]) : 0;
    return { transform: [{ translateY: y }, { scale: pressScale.value * hoverScale }] };
  });

  const clayStyle = useMemo(() => {
    const { bg, shadowColor } = getStaffClayColors(item.key, isDark);
    if (Platform.OS === 'web') {
      return {
        backgroundColor: bg,
        borderRadius,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.45)',
        boxShadow:
          `0px 8px 18px ${shadowColor}33, ` +
          `-5px -5px 12px ${isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.85)'}, ` +
          `inset 2px 2px 4px rgba(255, 255, 255, 0.45), ` +
          `inset -2.5px -2.5px 5px rgba(0, 0, 0, 0.16)`,
      };
    }
    return {
      backgroundColor: bg,
      borderRadius,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.45)',
      shadowColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.45 : 0.28,
      shadowRadius: 12,
      elevation: 6,
    };
  }, [item.key, isDark, borderRadius]);

  return (
    <Animated.View
      entering={FadeInUp.delay(160 + Math.min(index, 9) * 40).duration(320)}
      style={[wrapperStyle, clayStyle, { width: cardWidth, height: IS_WEB ? 144 : 132, overflow: 'hidden' }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.subtitle}${badge ? `. ${badge} pending` : ''}`}
        onPress={onPress}
        onHoverIn={() => { if (IS_WEB) hoverLift.value = withTiming(1, { duration: 180 }); }}
        onHoverOut={() => { if (IS_WEB) hoverLift.value = withTiming(0, { duration: 220 }); }}
        onPressIn={() => { pressScale.value = withTiming(0.97, { duration: 90 }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
        onPressOut={() => { pressScale.value = withTiming(1, { duration: 110 }); }}
        style={StyleSheet.absoluteFill}
      >
        <LinearGradient
          colors={isDark ? ['rgba(255, 255, 255, 0.05)', 'rgba(0, 0, 0, 0.15)'] : ['rgba(255, 255, 255, 0.26)', 'rgba(0, 0, 0, 0.06)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          pointerEvents="none"
        />
        <View pointerEvents="none" style={{ position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', bottom: -15, right: -15 }} />
        <View style={{ position: 'absolute', top: 12, left: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.32)', borderWidth: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ transform: [{ scale: 0.68 }] }}>{cfg.icon}</View>
          </View>
          {badge ? (
            <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#FF3D5C', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1.5, borderColor: '#FFFFFF' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 8.5, fontWeight: '900' }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.15)', borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#FFFFFF' }} />
          <Text style={{ color: '#FFFFFF', fontSize: 8, fontWeight: '900' }}>{cfg.category}</Text>
        </View>
        <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
          <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#FFFFFF' }} numberOfLines={1}>{item.title}</Text>
          <Text style={{ fontSize: 9.5, fontWeight: '600', color: 'rgba(255,255,255,0.78)', marginTop: 2 }} numberOfLines={1}>{item.subtitle}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
});

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function StaffDashboard() {
  // The staff area is a single MaterialTopTabs (pager) navigator; this returns
  // that navigator so we can switch tabs the same way StaffFooter does.
  const navigation = useNavigation();
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const [todayContext, setTodayContext] = useState(() => ({ date: localAttendanceDate(), session: currentSession() }));
  useFocusEffect(useCallback(() => {
    const updateContext = () => setTodayContext({ date: localAttendanceDate(), session: currentSession() });
    updateContext();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') updateContext(); });
    return () => subscription.remove();
  }, []));
  const { staffId, isViewingAsAdmin, viewAsName, userId: viewAsUserId, actorUserId } = useEffectiveStaffId();
  const [toolsOpen, setToolsOpen] = useState(false);
  const popupUnread = usePopupUnreadCount();
  const [viewedStaff, setViewedStaff] = useState<Staff | null>(null);

  useEffect(() => {
    if (!isViewingAsAdmin || !staffId) { setViewedStaff(null); return; }
    let cancelled = false;
    StaffService.getById(staffId).then(staff => { if (!cancelled) setViewedStaff(staff); }).catch(() => { if (!cancelled) setViewedStaff(null); });
    return () => { cancelled = true; };
  }, [isViewingAsAdmin, staffId]);

  const { data, loading: metricsLoading, error: metricsError, isRefreshing: metricsRefreshing, refetch } = usePersistedSWR<DashboardMetrics>({
    cacheKey: `staff-dashboard-${staffId ?? 'self'}-${todayContext.date}-${todayContext.session}`,
    userId: user?.userId,
    ttlMs: 120_000,
    persist: !isViewingAsAdmin,
    enabled: !!user,
    revalidateOnMount: true,
    fetcher: async () => {
      const { session, date } = todayContext;
      const [pendingLeaves, myClass] = await Promise.all([
        LeaveService.getAll({ status: 'pending' }).catch(() => []),
        AttendanceService.getMyClass(date, staffId, session),
      ]);
      let studentCount = 0, presentCount = 0, absentCount = 0;
      let detectedClassId: string | undefined;
      let className: string | undefined;
      let sectionName: string | undefined;
      if (myClass) {
        detectedClassId = myClass.class_section_id;
        className = myClass.class_name || undefined;
        sectionName = myClass.section_name || undefined;
        studentCount = myClass.total_students;
        const sessionKey = myClass.session === 'afternoon' ? 'afternoon_status' : 'morning_status';
        presentCount = myClass.students.filter((student: any) =>
          ['present', 'late'].includes(student[sessionKey])
        ).length;
        absentCount = myClass.students.filter((student: any) => student[sessionKey] === 'absent').length;
      }
      return {
        totalStudents: studentCount,
        presentToday: presentCount,
        absentToday: absentCount,
        pendingLeaves: pendingLeaves.length,
        classId: detectedClassId,
        className,
        sectionName,
        session,
        date,
      };
    },
  });

  const { data: heroSlides, refetch: refetchSlides } = usePersistedSWR<HeroSlideItem[]>({
    cacheKey: 'staff-hero-slides',
    userId: user?.userId,
    ttlMs: 120_000,
    persist: !isViewingAsAdmin,
    enabled: !!user,
    revalidateOnMount: true,
    fetcher: () => schoolHeroSlidesService.listActive(),
  });

  const { data: schoolStories, refetch: refetchStories } = usePersistedSWR<SchoolStoryAuthor[]>({
    cacheKey: 'staff-school-stories',
    userId: user?.userId,
    ttlMs: 60_000,
    persist: !isViewingAsAdmin,
    enabled: !!user,
    revalidateOnMount: true,
    fetcher: () => schoolStoriesService.list(),
  });

  useFocusEffect(useCallback(() => {
    // Only the teacher's own home screen should treat hardware back as "exit app".
    // When an admin is viewing this as another staff member's portal, this screen
    // sits on top of Manage Staff in the stack — hardware back must pop to it
    // normally instead of quitting the app.
    if (isViewingAsAdmin) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { BackHandler.exitApp(); return true; });
    return () => sub.remove();
  }, [isViewingAsAdmin]));

  const menuItems = STAFF_QUICK_ACTIONS;

  const navigateToStaffRoute = useCallback((route: string, context?: Record<string, string>) => {
    // Route name = last path segment (e.g. '/staff/manage-students' -> 'manage-students'),
    // which is the screen name registered in app/staff/_layout.tsx.
    const screen = route.replace(/^\/staff\//, '').split('?')[0];
    const params = isViewingAsAdmin
      ? { ...context, staffId: staffId || '', viewAsName: viewAsName || '', viewAsUserId: viewAsUserId || '', viewAsActorId: actorUserId || '' }
      : context;

    // Switch tabs via the tab navigator's own navigation object — the same call
    // StaffFooter uses. Expo Router's global router.push('/staff/..') resolves
    // sibling tabs to the wrong pager index on web; a full document reload was the
    // old band-aid, but it hard-404s on hosts without SPA fallback. jumpTo-style
    // navigation stays client-side and lands on the exact screen on every platform.
    (navigation as any).navigate(screen, params);
  }, [isViewingAsAdmin, navigation, staffId, viewAsName, viewAsUserId, actorUserId]);


  const handleLeavesPress = useCallback(() => {
    navigateToStaffRoute('/staff/leaves');
  }, [navigateToStaffRoute]);

  const handleUpdatesPress = useCallback(() => {
    navigateToStaffRoute('/staff/updates');
  }, [navigateToStaffRoute]);

  const handleNotificationsPress = useCallback(() => {
    navigateToStaffRoute('/staff/notices');
  }, [navigateToStaffRoute]);

  const handleManageStudentsPress = useCallback(() => {
    navigateToStaffRoute('/staff/manage-students', { date: todayContext.date, session: todayContext.session, contextRequest: String(Date.now()) });
  }, [navigateToStaffRoute, todayContext]);

  const handleRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await Promise.all([refetch(), refetchSlides(), refetchStories()]);
  }, [refetch, refetchSlides, refetchStories]);

  const firstName = (isViewingAsAdmin ? viewAsName : user?.displayName)?.split(' ')[0] || 'Teacher';
  const roleLine = (() => {
    const classLabel = [data?.className, data?.sectionName].filter(Boolean).join(' ');
    if (classLabel) return `Class ${classLabel}`;
    if (isViewingAsAdmin) return viewedStaff?.designation_name || viewedStaff?.designation || 'Staff';
    return user?.role?.name || 'Staff';
  })();
  const photoUrl = isViewingAsAdmin ? viewedStaff?.photo_url : user?.photoUrl;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      <TourTarget id="screen.staff-dashboard.overview"><StaffHeader
        title="Staff Portal"
        subtitle={(isViewingAsAdmin ? viewAsName : user?.displayName) || 'Teacher'}
        onMenuPress={() => setToolsOpen(true)}
      /></TourTarget>
      <TourTarget id="screen.staff-dashboard.workspace" style={{ flex: 1 }}><TourScrollView
        scrollEventThrottle={16}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={metricsRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={isDark ? '#111827' : '#FFFFFF'}
          />
        )}
      >
        <View style={styles.body}>
          {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}
          <View style={styles.heroBand}>
            <StaffHero
              firstName={firstName}
              roleLine={roleLine}
              chipLabel={SCHOOL_CONFIG.name}
              photoUrl={photoUrl}
              pendingLeaves={data?.pendingLeaves || 0}
              unreadUpdates={popupUnread || 0}
              slides={heroSlides ?? []}
              stories={schoolStories ?? []}
              canAddStories={!isViewingAsAdmin}
              addPhotoUrl={photoUrl}
              disableAccountSwitch={isViewingAsAdmin}
              onReviewLeaves={handleLeavesPress}
              onViewUpdates={handleUpdatesPress}
              onViewNotifications={handleNotificationsPress}
              onPublished={() => { void refetchStories(); }}
            />
          </View>
          <SectionLabel label="TODAY’S WORK" />
          <AttendanceHero
            data={data}
            onPress={handleManageStudentsPress}
            loading={metricsLoading}
            error={metricsError}
            refreshing={metricsRefreshing}
            onRetry={() => void refetch()}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 16, marginBottom: 12 }}>
            <SectionLabel label="EVERYDAY TOOLS" />
            <Pressable accessibilityRole="button" accessibilityLabel="Open all staff tools" onPress={() => setToolsOpen(true)} style={{ minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="menu-outline" size={20} color={theme.colors.textStrong} />
              <Text style={{ color: theme.colors.textStrong, fontSize: 14, fontWeight: '600' }}>All tools</Text>
            </Pressable>
          </View>
          {(['Teaching', 'Communication', 'My employment'] as const).map(group => (
            <View key={group} style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
              <Text style={{ color: theme.colors.textSecondary, fontSize: theme.typography.fontSizeMD, fontWeight: '600' }}>{group}</Text>
              <View style={styles.menuGrid}>
                {menuItems.filter(item => item.group === group).map((item, index) => (
                  <MenuCard key={item.key} item={item} index={index}
                    badge={item.key === 'updates' && popupUnread ? `${popupUnread}` : undefined}
                    onPress={() => navigateToStaffRoute(item.route)} />
                ))}
              </View>
            </View>
          ))}
          <AppTourQuickAction portal="staff" />
          <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 12, marginBottom: 24 }}>
            Find assessments, admissions, school operations and employment tools in the menu.
          </Text>
          {!isViewingAsAdmin && <StaffAttendanceQuickCard isDark={isDark} />}
          <AcademicTodayCard
            isDark={isDark}
            onPress={() => navigateToStaffRoute('/staff/academic-today')}
          />
          <UpcomingEventsWidget role="staff" />
          <DailySparkWidget />
          <View style={{ height: 90 }} />
        </View>
      </TourScrollView></TourTarget>
      {toolsOpen && <StaffToolsDrawer onClose={() => setToolsOpen(false)} photoUrl={photoUrl} />}
    </View>
  );
}

// ─── Shared Styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 40 },
  heroBand: { backgroundColor: '#15245C', borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  body: { paddingHorizontal: 20, paddingTop: 12, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 8 },
  sectionAccent: { width: 3, height: 16, borderRadius: 2, marginRight: 9 },
  sectionLabelText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },

  // ── Menu Grid ────────────────────────────────────────────────────────────
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: MENU_GAP, marginBottom: 4 },
});
