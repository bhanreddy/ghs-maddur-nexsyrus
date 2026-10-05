import { AppTourQuickAction, TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet,
  StatusBar, BackHandler, Pressable, AppState,
  useWindowDimensions, RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
const parseHomeDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

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
  const { theme } = useTheme();
  const total = data?.totalStudents ?? 0;
  const marked = (data?.presentToday ?? 0) + (data?.absentToday ?? 0);
  const unmarked = Math.max(0, total - marked);
  const classLabel = [data?.className, data?.sectionName].filter(Boolean).join(' · ');
  const label = !data ? (loading ? 'Loading your class…' : 'Class status unavailable')
    : !data.classId ? 'No class assigned for this session'
    : !total ? 'No enrolled students in this class'
    : unmarked ? `${unmarked} student${unmarked === 1 ? '' : 's'} still unmarked` : 'All students marked on the server';
  return (
    <View style={{ padding: theme.spacing.lg, marginBottom: theme.spacing.lg, gap: theme.spacing.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.shape.borderRadiusLG }}>
      <Text style={{ color: theme.colors.textStrong, fontSize: theme.typography.fontSizeLG, fontWeight: '700' }}>Student attendance</Text>
      <Text style={{ color: theme.colors.textSecondary, fontSize: theme.typography.fontSizeMD }}>
        {classLabel ? `Class ${classLabel} · ` : ''}{data?.session === 'afternoon' ? 'Afternoon' : data?.session === 'morning' ? 'Morning' : 'Current session'}
      </Text>
      <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textStrong, fontSize: theme.typography.fontSizeMD }}>{label}</Text>
      {!!total && <>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: marked, text: `${marked} of ${total} marked` }} style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.border, overflow: 'hidden' }}>
          <View style={{ height: 6, width: `${Math.min(100, marked / total * 100)}%`, backgroundColor: theme.colors.primary }} />
        </View>
        <Text style={{ color: theme.colors.textSecondary, fontSize: theme.typography.fontSizeSM }}>{marked}/{total} marked · {data?.presentToday} present · {data?.absentToday} absent</Text>
      </>}
      <Text style={{ color: error ? theme.colors.alertText : theme.colors.textSecondary, fontSize: theme.typography.fontSizeSM }}>
        {error ? 'Could not refresh. Any counts shown are from the last response.' : refreshing ? 'Refreshing class status…' : data ? 'Last loaded server records. Open attendance to review drafts and queued submissions.' : 'Open attendance to choose a date and session.'}
      </Text>
      {error && <Pressable accessibilityRole="button" onPress={onRetry} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: theme.colors.primary, fontWeight: '600' }}>Retry class status</Text></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Open student attendance for today's session" onPress={onPress} style={({ pressed }) => ({ minHeight: 48, padding: theme.spacing.md, borderRadius: theme.shape.borderRadiusMD, backgroundColor: theme.colors.primaryDark, opacity: pressed ? 0.85 : 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 })}>
        <Text style={{ color: '#fff', fontSize: theme.typography.fontSizeMD, fontWeight: '700', flex: 1 }}>{total && !unmarked ? 'Review attendance' : 'Mark student attendance'}</Text>
        <Ionicons name="arrow-forward" size={20} color="#fff" />
      </Pressable>
    </View>
  );
});

// ─── Section Label ────────────────────────────────────────────────────────────
const SectionLabel = React.memo(function SectionLabel({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.sectionLabel}>
      <LinearGradient colors={[theme.colors.primary, theme.colors.primary]} style={styles.sectionAccent} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
      <Text style={[styles.sectionLabelText, { color: theme.colors.textSecondary }]}>{label}</Text>
    </View>
  );
});

// Shared theme surfaces keep everyday shortcuts readable in both color modes.
const MenuCard = React.memo(function MenuCard({ item, badge, onPress }: {
  item: StaffDestination;
  badge?: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.subtitle}${badge ? `. ${badge} pending` : ''}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexBasis: width < 380 ? '100%' : width < 760 ? '47%' : '23%',
        flexGrow: 1,
        minHeight: 132,
        padding: theme.spacing.md,
        borderRadius: theme.shape.borderRadiusLG,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: pressed ? theme.colors.background : theme.colors.surface,
        gap: 8,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Ionicons name={item.icon} size={24} color={theme.colors.primary} />
        {badge ? <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 13 }}>{badge}</Text>
          : <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />}
      </View>
      <Text style={{ color: theme.colors.textStrong, fontSize: 16, fontWeight: '700' }}>{item.title}</Text>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{item.subtitle}</Text>
    </Pressable>
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
          <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
            <Text style={{ color: theme.colors.textStrong, fontSize: theme.typography.fontSizeXXL, fontWeight: '700' }}>Hello, {firstName}</Text>
            <Text style={{ color: theme.colors.textSecondary, fontSize: theme.typography.fontSizeMD }}>{parseHomeDate(todayContext.date)} · {roleLine}</Text>
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
          {!isViewingAsAdmin && <StaffAttendanceQuickCard isDark={isDark} />}
          <AcademicTodayCard
            isDark={isDark}
            onPress={() => navigateToStaffRoute('/staff/academic-today')}
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
                {menuItems.filter(item => item.group === group).map(item => (
                  <MenuCard key={item.key} item={item}
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
          <SectionLabel label="AROUND SCHOOL" />
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
  body: { paddingHorizontal: 20, paddingTop: 20, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 8 },
  sectionAccent: { width: 3, height: 16, borderRadius: 2, marginRight: 9 },
  sectionLabelText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },

  // ── Menu Grid ────────────────────────────────────────────────────────────
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: MENU_GAP, marginBottom: 4 },
});
