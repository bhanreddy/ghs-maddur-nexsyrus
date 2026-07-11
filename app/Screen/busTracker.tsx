import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  StatusBar,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/hooks/useTheme';
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  interpolate,
  FadeIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { api } from '../../src/services/apiClient';
import LogoLoader from '../../src/components/LogoLoader';
import { BusAttendanceService } from '../../src/services/busAttendanceService';

const { width } = Dimensions.get('window');

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  blue: '#2563EB',
  blueMid: '#3B82F6',
  blueLight: '#EFF6FF',
  blueBorder: '#BFDBFE',
  emerald: '#059669',
  emeraldLight: '#ECFDF5',
  amber: '#D97706',
  amberLight: '#FFFBEB',
  amberBorder: '#FDE68A',
  red: '#DC2626',
  redLight: '#FEF2F2',
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate700: '#334155',
  slate900: '#0F172A',
  white: '#FFFFFF',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const tripStatusIsActive = (s?: string | null) =>
  s === 'in_progress' || s === 'active';

type BusPayload = {
  assigned: boolean;
  route_name?: string;
  boarding_stop?: string;
  boarding_stop_order?: number;
  trip?: {
    id: string;
    status: string;
    ui_status?: string;
    started_at?: string | null;
    ended_at?: string | null;
  } | null;
  stops?: Array<{
    id: string;
    name: string;
    stop_order: number;
    status?: string | null;
    reached_at?: string | null;
  }>;
  current_stop?: { name: string; stop_order: number } | null;
  stops_until_boarding?: number | null;
};

// ─── Pulsing live dot ─────────────────────────────────────────────────────────
const LiveDot = () => {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 700, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 700, easing: Easing.in(Easing.ease) }),
      ),
      -1,
    );
  }, []);
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: interpolate(scale.value, [1, 1.5], [0.5, 0]),
  }));
  return (
    <View style={liveDotStyles.wrap}>
      <Animated.View style={[liveDotStyles.ring, ringStyle]} />
      <View style={liveDotStyles.core} />
    </View>
  );
};
const liveDotStyles = StyleSheet.create({
  wrap: { width: 14, height: 14, justifyContent: 'center', alignItems: 'center' },
  ring: {
    position: 'absolute', width: 14, height: 14,
    borderRadius: 7, backgroundColor: C.white, opacity: 0.4,
  },
  core: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.white },
});

// ─── Pulsing stop node (current bus position) ─────────────────────────────────
const CurrentStopNode = ({ theme }: { theme: any }) => {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 900, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.in(Easing.ease) }),
      ),
      -1,
    );
  }, []);
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: interpolate(scale.value, [1, 1.6], [0.5, 0]),
  }));
  return (
    <View style={nodeStyles.wrap}>
      <Animated.View style={[nodeStyles.pulseRing, ringStyle, { backgroundColor: theme.colors.primary }]} />
      <View style={[nodeStyles.currentNode, { backgroundColor: theme.colors.primary, shadowColor: theme.colors.primary }]}>
        <Ionicons name="bus" size={12} color={C.white} />
      </View>
    </View>
  );
};
const nodeStyles = StyleSheet.create({
  wrap: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  pulseRing: {
    position: 'absolute', width: 28, height: 28,
    borderRadius: 14, backgroundColor: C.blue, opacity: 0.3,
  },
  currentNode: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.blue, justifyContent: 'center', alignItems: 'center',
    shadowColor: C.blue, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
});

// ─── Urgency countdown badge ──────────────────────────────────────────────────
const UrgencyBadge = ({ until, theme }: { until: number; theme: any }) => {
  const isUrgent = until <= 2;
  const isClose = until <= 4;
  const bg = isUrgent ? C.redLight : isClose ? C.amberLight : C.white;
  const border = isUrgent ? '#FECACA' : isClose ? C.amberBorder : theme.colors.primary;
  const color = isUrgent ? C.red : isClose ? C.amber : theme.colors.primary;

  return (
    <View style={[urgencyStyles.badge, { backgroundColor: bg, borderColor: border }]}>
      <Ionicons
        name={isUrgent ? 'alert-circle' : 'navigate-circle-outline'}
        size={15}
        color={color}
      />
      <Text style={[urgencyStyles.text, { color }]}>
        {until === 0 ? 'Arriving now' : `${until} stop${until > 1 ? 's' : ''} away`}
      </Text>
    </View>
  );
};
const urgencyStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 24, borderWidth: 1.5, alignSelf: 'flex-start',
  },
  text: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function StudentBusTrackerScreen() {
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const [data, setData] = useState<BusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent?: boolean) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.get<BusPayload>('/transport/my-bus');
      setData(res);

      if (res?.assigned) {
        const history = await BusAttendanceService.getMyAttendance();
        setAttendanceHistory(history || []);
      }
    } catch {
      setData({ assigned: false });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [load]),
  );

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const ui = data?.trip?.ui_status || data?.trip?.status;
    if (tripStatusIsActive(ui)) {
      pollRef.current = setInterval(() => load(true), 20000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [data?.trip?.ui_status, data?.trip?.status, load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  // ── Loading ──
  if (loading && !data) {
    return (
      <ScreenLayout>
        <StatusBar barStyle="dark-content" backgroundColor={C.white} />
        <StudentHeader title={t('busTracker.title')} />
        <View style={s.center}>
          <LogoLoader size={52} color={C.blue} />
          <Text style={s.loadingText}>Fetching route…</Text>
        </View>
      </ScreenLayout>
    );
  }

  // ── Not assigned ──
  if (!data?.assigned) {
    return (
      <ScreenLayout>
        <StatusBar barStyle="dark-content" backgroundColor={C.white} />
        <StudentHeader title={t('busTracker.title')} />
        <View style={s.center}>
          <View style={s.emptyIconWrap}>
            <Ionicons name="bus-outline" size={36} color={C.slate400} />
          </View>
          <Text style={s.emptyTitle}>No bus assigned</Text>
          <Text style={s.emptySub}>Contact your school admin to get a route assigned.</Text>
        </View>
      </ScreenLayout>
    );
  }

  // ── Derived state ──
  const rawTrip = data.trip?.ui_status || data.trip?.status || '';
  const isLive = tripStatusIsActive(rawTrip);
  const isCompleted = rawTrip === 'completed';
  const stops = data.stops ?? [];
  const boarding = data.boarding_stop;
  const boardingOrder = data.boarding_stop_order;
  const until = data.stops_until_boarding;
  const currentOrder = data.current_stop?.stop_order;
  const atYourStop =
    isLive && boardingOrder != null && currentOrder === boardingOrder;

  const statusLabel = isLive ? 'In Progress' : isCompleted ? 'Completed' : 'Scheduled';
  const statusColor = isLive ? C.emerald : isCompleted ? C.slate400 : C.amber;
  const statusBg = isLive ? C.emeraldLight : isCompleted ? C.slate100 : C.amberLight;

  return (
    <ScreenLayout>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />
      <StudentHeader title={data.route_name ? `Bus · ${data.route_name}` : t('busTracker.title')} />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.blue}
            colors={[C.blue]}
          />
        }
      >

        {/* ── Hero Route Card ─────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(500).springify()} style={[s.heroWrapper, { shadowColor: theme.colors.primary }]}>
          <View style={[s.heroCard, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary, borderBottomColor: theme.colors.primaryDark }]}>
            <LinearGradient
              colors={['rgba(255,255,255,0.25)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.5, y: 0.8 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {/* Top row: route name + status chip */}
            <View style={s.heroTop}>
              <View style={s.heroLeft}>
                <View style={[s.routeIconWrap, { shadowColor: theme.colors.primaryDark }]}>
                  <Ionicons name="bus" size={20} color={theme.colors.primary} />
                </View>
                <View>
                  <Text style={s.routeLabel}>{t('busTracker.route')}</Text>
                  <Text style={s.routeName}>{data.route_name || 'Bus Route'}</Text>
                </View>
              </View>
              <View style={[s.statusChip, { backgroundColor: isLive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)' }]}>
                {isLive && <LiveDot />}
                <Text style={[s.statusChipText, { color: C.white }]}>
                  {statusLabel}
                </Text>
              </View>
            </View>

            {/* Divider */}
            <View style={s.heroDivider} />

            {/* Bottom row: your stop + urgency */}
            <View style={s.heroBottom}>
              <View style={s.yourStopBlock}>
                <Text style={s.yourStopLabel}>{t('busTracker.boarding_stop')}</Text>
                <View style={s.yourStopRow}>
                  <Ionicons name="location" size={16} color={C.white} />
                  <Text style={s.yourStopName}>{boarding || '—'}</Text>
                </View>
              </View>
              {isLive && until != null && (
                <UrgencyBadge until={until} theme={theme} />
              )}
              {isLive && until == null && atYourStop && (
                <UrgencyBadge until={0} theme={theme} />
              )}
            </View>
          </View>
        </Animated.View>

        {/* ── Bus at stop alert ───────────────────────────────────────── */}
        {atYourStop && (
          <Animated.View entering={FadeIn.duration(400)}>
            <LinearGradient
              colors={['#FEF3C7', '#FDE68A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.alertBanner}
            >
              <View style={s.alertIconWrap}>
                <Ionicons name="alert-circle" size={22} color={C.amber} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.alertTitle}>{t('busTracker.bus_at_stop')}</Text>
                <Text style={s.alertSub}>{t('busTracker.head_out')}</Text>
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        {/* ── Route Timeline ──────────────────────────────────────────── */}
        <Animated.View
          entering={FadeInUp.delay(150).duration(500).springify()}
          style={[s.timelineCard, isDark && { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderBottomColor: theme.colors.borderLight }]}
        >
          {/* Soft top-left highlight linear gradient */}
          {!isDark && (
            <LinearGradient
              colors={['rgba(255,255,255,1)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.5, y: 0.8 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          )}
          <View style={s.timelineHeader}>
            <Text style={[s.timelineTitle, isDark && { color: theme.colors.textPrimary }]}>{t('busTracker.route_stops')}</Text>
            <Text style={s.timelineCount}>{stops.length} {t('busTracker.stops')}</Text>
          </View>

          {stops.map((stop, idx) => {
            const isReached = stop.status === 'completed';
            const isCurrent =
              isLive && currentOrder != null && stop.stop_order === currentOrder;
            const isBoardingStop = stop.name === boarding;
            const isLast = idx === stops.length - 1;
            const isUpcoming = !isReached && !isCurrent;

            // Node appearance
            const nodeColor = isReached
              ? C.emerald
              : isCurrent
                ? theme.colors.primary
                : isBoardingStop
                  ? theme.colors.primary
                  : C.slate200;

            const nodeBg = isReached
              ? C.emerald
              : isCurrent
                ? theme.colors.primary
                : isBoardingStop
                  ? 'rgba(0,0,0,0)'
                  : C.white;

            return (
              <View key={stop.id} style={s.timelineRow}>
                {/* ── Left: node + connector line ── */}
                <View style={s.timelineLeft}>
                  {/* Connector line above */}
                  {idx > 0 && (
                    <View
                      style={[
                        s.connectorLine,
                        s.connectorTop,
                        { backgroundColor: isReached || isCurrent ? C.emerald : C.slate200 },
                      ]}
                    />
                  )}

                  {/* Stop node */}
                  {isCurrent ? (
                    <CurrentStopNode theme={theme} />
                  ) : (
                    <View
                      style={[
                        s.stopNode,
                        {
                          backgroundColor: nodeBg,
                          borderColor: nodeColor,
                          borderWidth: isBoardingStop && !isReached ? 2.5 : 1.5,
                        },
                      ]}
                    >
                      {isReached ? (
                        <Ionicons name="checkmark" size={12} color={C.white} />
                      ) : isBoardingStop ? (
                        <Ionicons name="person" size={11} color={theme.colors.primary} />
                      ) : (
                        <View style={[s.innerDot, { backgroundColor: isUpcoming ? C.slate200 : nodeColor }]} />
                      )}
                    </View>
                  )}

                  {/* Connector line below */}
                  {!isLast && (
                    <View
                      style={[
                        s.connectorLine,
                        s.connectorBottom,
                        { backgroundColor: isReached ? C.emerald : C.slate200 },
                      ]}
                    />
                  )}
                </View>

                {/* ── Right: stop content ── */}
                <View
                  style={[
                    s.stopContent,
                    isCurrent && [s.stopContentCurrent, isDark && { backgroundColor: theme.colors.background }, { borderColor: theme.colors.primaryLight, borderBottomColor: theme.colors.primaryDark }],
                    isBoardingStop && !isCurrent && [s.stopContentBoarding, isDark && { backgroundColor: theme.colors.background }, { borderColor: theme.colors.primaryLight, borderBottomColor: theme.colors.primary }],
                    isLast && { marginBottom: 0 },
                  ]}
                >
                  <View style={s.stopContentInner}>
                    <View style={{ flex: 1 }}>
                      <View style={s.stopNameRow}>
                        <Text
                          style={[
                            s.stopName,
                            isDark && { color: theme.colors.textPrimary },
                            isReached && { color: isDark ? theme.colors.textMuted : C.slate400 },
                            isCurrent && { color: theme.colors.primary, fontWeight: '700' },
                            isBoardingStop && !isReached && { color: theme.colors.primary },
                          ]}
                        >
                          {stop.name}
                        </Text>
                        {isBoardingStop && (
                          <View style={[s.boardingTag, { backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: theme.colors.primary }]}>
                            <Text style={[s.boardingTagText, { color: theme.colors.primary }]}>{t('busTracker.your_stop')}</Text>
                          </View>
                        )}
                        {isCurrent && (
                          <View style={[s.currentTag, { backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: theme.colors.primary }]}>
                            <Text style={[s.currentTagText, { color: theme.colors.primary }]}>{t('busTracker.bus_here')}</Text>
                          </View>
                        )}
                      </View>

                      {stop.reached_at ? (
                        <Text style={s.stopTime}>
                          {t('busTracker.reached_at')} {new Date(stop.reached_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      ) : isUpcoming && !isCurrent ? (
                        <Text style={s.stopTimePending}>{t('busTracker.pending')}</Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            );
          })}

          {stops.length === 0 && (
            <Text style={s.noStops}>{t('busTracker.no_stop_data')}</Text>
          )}
        </Animated.View>

        {/* ── Attendance Log ──────────────────────────────────────────── */}
        <Animated.View
          entering={FadeInUp.delay(250).duration(500).springify()}
          style={[s.timelineCard, isDark && { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderBottomColor: theme.colors.borderLight }]}
        >
          {/* Soft top-left highlight linear gradient */}
          {!isDark && (
            <LinearGradient
              colors={['rgba(255,255,255,1)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.5, y: 0.8 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          )}
          <View style={s.timelineHeader}>
            <Text style={[s.timelineTitle, isDark && { color: theme.colors.textPrimary }]}>{t('busTracker.attendance_log')}</Text>
            <Text style={s.timelineCount}>{attendanceHistory.length} {t('busTracker.logs')}</Text>
          </View>

          {attendanceHistory.map((item, idx) => {
            const isPresent = item.status === 'present';
            const logColor = isPresent ? C.emerald : C.red;
            const logBg = isPresent ? C.emeraldLight : C.redLight;
            const dateStr = new Date(item.attendance_date).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            });
            const timeStr = new Date(item.marked_at).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit'
            });

            return (
              <View key={item.id} style={[s.logItem, idx > 0 && [s.logItemBorder, isDark && { borderTopColor: theme.colors.borderLight }]]}>
                <View style={[s.logStatusBadge, { backgroundColor: logBg, borderColor: logColor }]}>
                  <Ionicons
                    name={isPresent ? 'checkmark-circle' : 'close-circle'}
                    size={16}
                    color={logColor}
                  />
                  <Text style={[s.logStatusText, { color: logColor }]}>
                    {isPresent ? t('busTracker.present') : t('busTracker.absent')}
                  </Text>
                </View>
                <View style={s.logDetails}>
                  <Text style={[s.logStopName, isDark && { color: theme.colors.textPrimary }]}>{item.stop_name || 'Stop'}</Text>
                  <Text style={s.logRouteName}>{item.route_name || 'Route'}</Text>
                  <Text style={s.logTime}>{dateStr} · {timeStr}</Text>
                </View>
              </View>
            );
          })}

          {attendanceHistory.length === 0 && (
            <Text style={s.noStops}>{t('busTracker.no_log_data')}</Text>
          )}
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const TIMELINE_LEFT = 44;
const NODE_SIZE = 26;

const s = StyleSheet.create({
  scroll: { padding: 16, paddingTop: 8 },

  // ── States ──
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 14 },
  loadingText: { fontSize: 14, color: C.slate400, fontWeight: '500' },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.slate100, justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.slate700 },
  emptySub: { fontSize: 14, color: C.slate400, textAlign: 'center', lineHeight: 20 },

  // ── Hero card ──
  heroWrapper: {
    marginBottom: 24,
    borderRadius: 28,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  heroCard: {
    backgroundColor: C.blue,
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: C.blueBorder,
    borderBottomWidth: 4,
    borderBottomColor: '#1E3A8A', // Deep blue
    overflow: 'hidden',
    position: 'relative',
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  routeIconWrap: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: C.white, justifyContent: 'center', alignItems: 'center',
    shadowColor: C.slate900, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  routeLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  routeName: { fontSize: 22, fontWeight: '800', color: C.white, marginTop: 2, letterSpacing: -0.5 },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 24,
  },
  statusChipText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 18 },
  heroBottom: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-end', gap: 12,
  },
  yourStopBlock: { flex: 1 },
  yourStopLabel: { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '600', letterSpacing: 0.4, marginBottom: 6 },
  yourStopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  yourStopName: { fontSize: 17, fontWeight: '800', color: C.white },

  // ── Alert banner ──
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.amberBorder,
    shadowColor: C.amber, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 3,
  },
  alertIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  alertTitle: { fontSize: 15, fontWeight: '800', color: '#92400E' },
  alertSub: { fontSize: 12, color: '#B45309', marginTop: 2 },

  // ── Timeline card ──
  timelineCard: {
    backgroundColor: '#F8FAFC', // Slate 50 for pure white clay highlight
    borderRadius: 28,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderBottomWidth: 4,
    borderBottomColor: '#CBD5E1', // Structural clay depth
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  timelineHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 24,
  },
  timelineTitle: { fontSize: 18, fontWeight: '800', color: C.slate900, letterSpacing: -0.3 },
  timelineCount: { fontSize: 13, color: C.slate500, fontWeight: '700' },

  // ── Timeline row ──
  timelineRow: {
    flexDirection: 'row',
    minHeight: 56,
  },
  timelineLeft: {
    width: TIMELINE_LEFT,
    alignItems: 'center',
    position: 'relative',
  },
  connectorLine: {
    position: 'absolute',
    width: 2,
    left: TIMELINE_LEFT / 2 - 1,
  },
  connectorTop: {
    top: 0,
    height: NODE_SIZE / 2,
  },
  connectorBottom: {
    top: NODE_SIZE / 2 + NODE_SIZE / 2,
    bottom: 0,
    height: 28,
  },
  stopNode: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    zIndex: 2,
  },
  innerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // ── Stop content ──
  stopContent: {
    flex: 1,
    paddingBottom: 20,
    paddingLeft: 4,
  },
  stopContentCurrent: {
    backgroundColor: C.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginLeft: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderBottomWidth: 3,
    shadowColor: C.slate900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  stopContentBoarding: {
    backgroundColor: C.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginLeft: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderBottomWidth: 3,
    shadowColor: C.slate900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  stopContentInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stopNameRow: {
    flexDirection: 'row', alignItems: 'center',
    flexWrap: 'wrap', gap: 6,
  },
  stopName: {
    fontSize: 14,
    fontWeight: '600',
    color: C.slate700,
    flexShrink: 1,
  },
  stopTime: {
    fontSize: 11,
    color: C.slate400,
    marginTop: 3,
    fontWeight: '500',
  },
  stopTimePending: {
    fontSize: 11,
    color: C.slate400,
    marginTop: 3,
    fontWeight: '500',
  },
  boardingTag: {
    backgroundColor: '#DCFCE7',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  boardingTagText: { fontSize: 10, fontWeight: '700', color: C.emerald },
  currentTag: {
    backgroundColor: C.blueLight,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  currentTagText: { fontSize: 10, fontWeight: '700', color: C.blue },
  noStops: {
    textAlign: 'center',
    color: C.slate400,
    fontSize: 14,
    paddingVertical: 20,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  logItemBorder: {
    borderTopWidth: 1,
    borderTopColor: C.slate100,
  },
  logStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    marginRight: 12,
  },
  logStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  logDetails: {
    flex: 1,
  },
  logStopName: {
    fontSize: 14,
    fontWeight: '700',
    color: C.slate700,
  },
  logRouteName: {
    fontSize: 12,
    color: C.slate400,
    marginTop: 2,
  },
  logTime: {
    fontSize: 11,
    color: C.slate400,
    marginTop: 2,
  },
});