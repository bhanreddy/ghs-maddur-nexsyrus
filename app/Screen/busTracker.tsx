import { useTransportPolling } from '../../src/hooks/useTransportPolling';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  StatusBar,
  TouchableOpacity,
  Platform,
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { isTelugu } from '../../src/utils/lang';
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
import LiveBusMap, { LiveStop } from '../../src/components/LiveBusMap';
import LiveRouteTracker from '../../src/components/LiveRouteTracker';
import {
  interpolateRouteCoordinate,
  isFixFromCurrentTrip,
  simulateLiveCoordinate,
} from '../../src/services/transportLiveSimulation';

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  blue: '#2563EB',
  blueMid: '#3B82F6',
  blueLight: '#EFF6FF',
  blueBorder: '#BFDBFE',
  emerald: '#059669',
  emeraldLight: '#ECFDF5',
  teal: '#14B8A6',
  tealDark: '#0F766E',
  tealLight: '#CCFBF1',
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
  boarding_stop_id?: string;
  boarding_stop_order?: number;
  trip?: {
    id: string;
    status: string;
    ui_status?: string;
    started_at?: string | null;
    ended_at?: string | null;
  } | null;
  stops?: {
    id: string;
    name: string;
    stop_order: number;
    exec_order?: number;
    latitude?: number | null;
    longitude?: number | null;
    status?: string | null;
    reached_at?: string | null;
  }[];
  current_stop?: { id: string; name: string; stop_order: number; status?: string } | null;
  stops_until_boarding?: number | null;
};

type LivePayload = {
  assigned: boolean;
  live: boolean;
  trip?: { id: string; status: string } | null;
  location?: {
    latitude: number;
    longitude: number;
    speed: number | null;
    heading: number | null;
    recorded_at: string;
    age_seconds: number | null;
    is_fresh: boolean;
  } | null;
  eta_minutes?: number | null;
  eta_low_minutes?: number | null;
  eta_high_minutes?: number | null;
  eta_confidence?: 'high' | 'medium' | 'low';
  eta_source?: string;
  distance_km?: number | null;
  boarding_stop_id?: string | null;
  stops?: LiveStop[];
};

const formatAge = (ageSeconds: number | null | undefined, t: TFunction) => {
  if (ageSeconds == null) return null;
  if (ageSeconds < 15) return t('busTracker.just_now');
  if (ageSeconds < 60) return t('busTracker.seconds_ago', { count: ageSeconds });
  return t('busTracker.minutes_ago', { count: Math.round(ageSeconds / 60) });
};

// ─── Pulsing stop node (current bus position) ─────────────────────────────────
const CurrentStopNode = ({ color }: { color: string }) => {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 900, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.in(Easing.ease) }),
      ),
      -1,
    );
  }, [scale]);
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: interpolate(scale.value, [1, 1.6], [0.5, 0]),
  }));
  return (
    <View style={nodeStyles.wrap}>
      <Animated.View style={[nodeStyles.pulseRing, ringStyle, { backgroundColor: color }]} />
      <View style={[nodeStyles.currentNode, { backgroundColor: color, shadowColor: color }]}>
        <Ionicons name="bus" size={13} color={C.white} />
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
  const { t } = useTranslation();
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
        {until === 0
          ? t('busTracker.arriving_now')
          : t(until === 1 ? 'busTracker.stops_away_one' : 'busTracker.stops_away_other', { count: until })}
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
  const { t, i18n } = useTranslation();
  const dateLocale = isTelugu(i18n.language) ? 'te-IN' : 'en-IN';
  const [data, setData] = useState<BusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [liveError, setLiveError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [live, setLive] = useState<LivePayload | null>(null);
  const [mapOpen, setMapOpen] = useState(Platform.OS !== 'web');
  const [nowMs, setNowMs] = useState(Date.now());
  const [smoothEta, setSmoothEta] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const livePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingHighEtaRef = useRef<number | null>(null);
  const simulationStartedAtRef = useRef(0);
  const simulationClockRef = useRef(0);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const simulationStopCount = data?.stops?.length ?? 0;
  const simulationEnd = Math.max(0, simulationStopCount - 1);
  const simulationDurationMs = Math.max(7_000, simulationEnd * 4_500);
  const routeSignature = data?.stops?.map((stop) => stop.id).join('|') || '';

  const load = useCallback(async (silent?: boolean) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.get<BusPayload>('/transport/my-bus');
      setData(res);
      setLoadError(false);

      if (res?.assigned) {
        try {
          const history = await BusAttendanceService.getMyAttendance();
          setAttendanceHistory(history || []);
        } catch {
          // Attendance history is secondary; the confirmed transport
          // assignment should still render when this request fails.
          setAttendanceHistory([]);
        }
      } else {
        setAttendanceHistory([]);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadLive = useCallback(async () => {
    try {
      const res = await api.get<LivePayload>('/transport/my-bus/live');
      setLive(res);
      setLiveError(false);
    } catch {
      setLiveError(true);
      // Retain the last observation and age it locally while reconnecting.
    }
  }, []);

  useTransportPolling(async () => { await load(true); await loadLive(); }, 10000);

  // Keep the freshness label accurate between 10-second live-location polls.
  useEffect(() => {
    const activeUi = data?.trip?.ui_status || data?.trip?.status;
    if (!tripStatusIsActive(activeUi)) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [data?.trip?.ui_status, data?.trip?.status]);

  // ETA smoothing: a trustworthy ETA drops immediately (good news) but only
  // rises when the higher reading persists across two polls — no jitter.
  useEffect(() => {
    if (!isFixFromCurrentTrip(live?.location?.recorded_at, data?.trip?.started_at)) {
      setSmoothEta(null);
      pendingHighEtaRef.current = null;
      return;
    }
    const e = live?.eta_minutes ?? null;
    if (e == null) { setSmoothEta(null); pendingHighEtaRef.current = null; return; }
    setSmoothEta((prev) => {
      if (prev == null || e <= prev) { pendingHighEtaRef.current = null; return e; }
      if (pendingHighEtaRef.current != null) { pendingHighEtaRef.current = null; return e; }
      pendingHighEtaRef.current = e;
      return prev;
    });
  }, [data?.trip?.started_at, live?.eta_minutes, live?.location?.recorded_at]);

  useEffect(() => {
    setSimulationRunning(false);
    setSimulationProgress(0);
    simulationClockRef.current = 0;
  }, [routeSignature]);

  useEffect(() => {
    const ui = data?.trip?.ui_status || data?.trip?.status;
    if (tripStatusIsActive(ui)) setSimulationRunning(false);
  }, [data?.trip?.ui_status, data?.trip?.status]);

  useEffect(() => {
    if (!simulationRunning || simulationEnd <= 0) return;

    const tick = () => {
      const elapsed = Date.now() - simulationStartedAtRef.current;
      const next = Math.min(simulationEnd, (elapsed / simulationDurationMs) * simulationEnd);
      setSimulationProgress(next);
      if (next >= simulationEnd) setSimulationRunning(false);
    };

    tick();
    const timer = setInterval(tick, 180);
    return () => clearInterval(timer);
  }, [simulationDurationMs, simulationEnd, simulationRunning]);

  const toggleRouteSimulation = useCallback(() => {
    if (simulationEnd <= 0) return;
    if (simulationRunning) {
      setSimulationRunning(false);
      return;
    }

    const restarting = simulationProgress >= simulationEnd;
    const startProgress = restarting ? 0 : simulationProgress;
    if (restarting || simulationClockRef.current === 0) {
      simulationClockRef.current = Date.now();
    }
    simulationStartedAtRef.current =
      Date.now() - (startProgress / simulationEnd) * simulationDurationMs;
    setSimulationProgress(startProgress);
    setSimulationRunning(true);
  }, [
    simulationDurationMs,
    simulationEnd,
    simulationProgress,
    simulationRunning,
  ]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
    loadLive();
  };

  // ── Loading ──
  if (loading && !data) {
    return (
      <ScreenLayout>
        <StatusBar barStyle="dark-content" backgroundColor={C.white} />
        <StudentHeader title={t('busTracker.title')} />
        <View style={s.center}>
          <LogoLoader size={52} color={C.blue} />
          <Text style={s.loadingText}>{t('busTracker.loading')}</Text>
        </View>
      </ScreenLayout>
    );
  }

  // ── Load error ──
  // Do not claim that transport was not opted when the API never confirmed it.
  if (loadError && !data) {
    return (
      <ScreenLayout>
        <StatusBar barStyle="dark-content" backgroundColor={C.white} />
        <StudentHeader title={t('busTracker.title')} />
        <View style={s.center}>
          <View style={s.emptyIconWrap}>
            <Ionicons name="cloud-offline-outline" size={36} color={C.slate400} />
          </View>
          <Text style={s.emptyTitle}>{t('busTracker.load_error_title')}</Text>
          <Text style={s.emptySub}>{t('busTracker.load_error_sub')}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => load()}
            style={s.retryButton}
          >
            <Text style={s.retryButtonText}>{t('common.retry', 'Retry')}</Text>
          </TouchableOpacity>
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
          <Text style={s.emptyTitle}>{t('busTracker.no_bus_title')}</Text>
          <Text style={s.emptySub}>{t('busTracker.no_bus_sub')}</Text>
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
  const boardingStopId = data.boarding_stop_id;
  const until = data.stops_until_boarding;
  const atYourStop =
    isLive && boardingStopId != null && data.current_stop?.id === boardingStopId && data.current_stop?.status === 'arrived';

  const statusLabel = isLive
    ? t('busTracker.status_in_progress')
    : isCompleted
      ? t('busTracker.completed')
      : t('busTracker.status_scheduled');

  // ── Live tracking — only driver GPS and server-calculated ETA ──
  const liveData = live;
  const showLive = isLive && !!live?.live;
  const rawLoc = liveData?.location ?? null;
  // Never carry the previous journey's endpoint into a newly-started trip.
  // Until the driver sends the first fix for this trip, the marker stays at
  // execution stop #1 (the school in the reported case).
  const locBelongsToCurrentTrip = isFixFromCurrentTrip(
    rawLoc?.recorded_at,
    data.trip?.started_at,
  );
  const loc = locBelongsToCurrentTrip ? rawLoc : null;
  // Freshness recomputed locally against the 1s clock so it feels real-time
  // between the 10s polls, instead of only updating when the server answers.
  const locAgeSec = loc?.recorded_at
    ? Math.max(0, Math.round((nowMs - new Date(loc.recorded_at).getTime()) / 1000))
    : null;
  const locFresh = locAgeSec != null && locAgeSec <= 120;
  // Bridge the small gaps between real GPS packets. Projection is deliberately
  // capped to 12 seconds/250m, then the next driver fix corrects the marker.
  const simulatedPosition = loc
    ? locFresh
      ? simulateLiveCoordinate(loc, nowMs)
      : { latitude: loc.latitude, longitude: loc.longitude }
    : null;

  // Smoothed ETA point + learned confidence range (Phase C).
  const etaPoint = loc && locFresh ? smoothEta ?? liveData?.eta_minutes ?? null : null;
  const etaLow = locFresh ? liveData?.eta_low_minutes ?? null : null;
  const etaHigh = locFresh ? liveData?.eta_high_minutes ?? null : null;
  const etaHasRange = etaLow != null && etaHigh != null && etaHigh > etaLow;
  const etaConfLabel = liveData?.eta_confidence === 'high'
    ? t('busTracker.eta_live_estimate')
    : liveData?.eta_confidence === 'low'
      ? t('busTracker.eta_rough_estimate')
      : t('busTracker.eta_estimated');
  const rideHeadline = atYourStop
    ? t('busTracker.bus_at_your_stop')
    : isLive && etaPoint != null
      ? etaPoint === 0
        ? t('busTracker.arriving_now')
        : t('busTracker.bus_arrives_in', { min: etaPoint })
      : isLive
        ? t('busTracker.bus_on_the_way')
        : isCompleted
          ? t('busTracker.trip_complete')
          : t('busTracker.bus_scheduled');
  const rideDetail = atYourStop
    ? t('busTracker.head_to_boarding')
    : isLive
      ? t('busTracker.live_auto_update')
      : isCompleted
        ? t('busTracker.check_details_below')
        : t('busTracker.tracking_starts_when_driver');
  const previewStops: LiveStop[] = stops.map((stop) => ({
    id: stop.id,
    name: stop.name,
    latitude: stop.latitude ?? null,
    longitude: stop.longitude ?? null,
    exec_order: stop.exec_order ?? stop.stop_order,
    status: stop.status || 'pending',
  }));
  const routeSimulationActive =
    !isLive
    && simulationStopCount > 1
    && (simulationRunning || simulationProgress > 0);
  const simulationFinished =
    routeSimulationActive && simulationProgress >= simulationEnd;
  const simulationJourneyIndex = Math.min(
    simulationEnd,
    Math.floor(simulationProgress + 0.001),
  );
  const simulationBusPosition = routeSimulationActive
    ? interpolateRouteCoordinate(stops, simulationProgress)
    : null;
  // Prefer live stop statuses, but keep assignment lat/lng when live omits them
  // so the Route path viewer can still project a geographic line.
  const baseTrackerStops = (() => {
    const liveStops = showLive && liveData?.stops?.length ? liveData.stops : null;
    if (!liveStops) return previewStops;
    const previewById = new Map(previewStops.map((s) => [s.id, s]));
    return liveStops.map((s) => {
      const fromPreview = previewById.get(s.id);
      return {
        ...s,
        latitude: s.latitude ?? fromPreview?.latitude ?? null,
        longitude: s.longitude ?? fromPreview?.longitude ?? null,
      };
    });
  })();
  const trackerStops = routeSimulationActive
    ? baseTrackerStops.map((stop, index) => ({
      ...stop,
      status:
        index < simulationJourneyIndex || (simulationFinished && index === simulationJourneyIndex)
          ? 'completed'
          : index === simulationJourneyIndex
            ? 'active'
            : 'pending',
    }))
    : baseTrackerStops;
  const trackerBusPosition = showLive ? simulatedPosition : simulationBusPosition;
  const usingStreetMap = mapOpen && showLive && Platform.OS !== 'web';

  return (
    <ScreenLayout>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />
      <StudentHeader
        title={
          data.route_name
            ? t('busTracker.header_route', { route: data.route_name })
            : t('busTracker.title')
        }
      />

      {(loadError || liveError) && <Text accessibilityLiveRegion="polite" style={{ padding: 12, color: '#92400E' }}>Connection interrupted. Showing the last received update.</Text>}
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
        {/* Ride-hailing style trip sheet: the next useful answer comes first. */}
        <Animated.View
          entering={FadeInDown.duration(450).springify()}
          style={[s.tripSheet, isDark && { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        >
          <View style={s.sheetHandle} />
          <View style={s.tripTopRow}>
            <View style={[s.routeIconWrap, { backgroundColor: `${theme.colors.primary}14` }]}>
              <Ionicons name="bus" size={20} color={theme.colors.primary} />
            </View>
            <View style={s.tripTitleBlock}>
              <Text style={s.tripEyebrow}>
                {isLive ? t('busTracker.live_school_ride') : t('busTracker.todays_school_ride')}
              </Text>
              <Text style={[s.tripHeadline, isDark && { color: theme.colors.textPrimary }]}>{rideHeadline}</Text>
              <Text style={s.tripDetail}>{rideDetail}</Text>
            </View>
            <View style={[s.statusChip, { backgroundColor: isLive ? C.emeraldLight : C.slate100 }]}>
              {isLive && <View style={s.statusLiveDot} />}
              <Text style={[s.statusChipText, { color: isLive ? C.emerald : C.slate500 }]}>{statusLabel}</Text>
            </View>
          </View>

          <View style={[s.tripRouteRow, { borderTopColor: isDark ? theme.colors.border : C.slate100 }]}>
            <View style={s.tripRouteRail}>
              <View style={[s.tripRouteDot, { backgroundColor: theme.colors.primary }]} />
              <View style={s.tripRouteLine} />
              <View style={s.tripRoutePin} />
            </View>
            <View style={s.tripStopBlock}>
              <Text style={s.tripStopLabel}>{t('busTracker.boarding_stop_label')}</Text>
              <Text style={[s.tripStopName, isDark && { color: theme.colors.textPrimary }]} numberOfLines={1}>{boarding || '—'}</Text>
              <Text style={s.tripRouteName}>{data.route_name || t('busTracker.bus_route_fallback')}</Text>
            </View>
            {isLive && until != null && <UrgencyBadge until={until} theme={theme} />}
          </View>
        </Animated.View>

        {/* ── Route map: preview while scheduled, real GPS while active ── */}
        <Animated.View
          entering={FadeInUp.delay(80).duration(500).springify()}
          style={[s.liveCard, isDark && { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderBottomColor: theme.colors.borderLight }]}
        >
            <View style={s.sheetHandle} />
            <View style={s.liveHeader}>
              <View style={s.liveHeaderLeft}>
                <View style={[s.liveGreenDot, { backgroundColor: showLive && locFresh ? C.emerald : C.slate400 }]} />
                <Text style={[s.liveTitle, isDark && { color: theme.colors.textPrimary }]}>
                  {showLive ? t('busTracker.live_bus_map') : t('busTracker.route_map_preview')}
                </Text>
                {locFresh && (
                  <View style={s.liveNowPill}>
                    <View style={s.liveNowDot} />
                    <Text style={s.liveNowText}>{t('busTracker.live')}</Text>
                  </View>
                )}
              </View>
              {loc && (
                <Text style={s.liveFreshness}>
                  {locFresh
                    ? t('busTracker.updated_ago', { age: formatAge(locAgeSec, t) })
                    : t('busTracker.last_seen_ago', { age: formatAge(locAgeSec, t) })}
                </Text>
              )}
            </View>

            <View style={[s.mapModeBar, isDark && { backgroundColor: theme.colors.background }]}>
              <TouchableOpacity
                style={[s.mapModeButton, !usingStreetMap && s.mapModeButtonActive]}
                activeOpacity={0.75}
                onPress={() => setMapOpen(false)}
              >
                <Ionicons name="git-branch-outline" size={15} color={!usingStreetMap ? C.white : C.slate500} />
                <Text style={[s.mapModeText, !usingStreetMap && s.mapModeTextActive]}>
                  {t('busTracker.route_view')}
                </Text>
              </TouchableOpacity>

              {Platform.OS !== 'web' && showLive && (
                <TouchableOpacity
                  style={[s.mapModeButton, usingStreetMap && s.mapModeButtonActive]}
                  activeOpacity={0.75}
                  onPress={() => setMapOpen(true)}
                >
                  <Ionicons name="map-outline" size={15} color={usingStreetMap ? C.white : C.slate500} />
                  <Text style={[s.mapModeText, usingStreetMap && s.mapModeTextActive]}>
                    {t('busTracker.live_map')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Native gets a real follow-camera map; web and route mode use the
                lightweight 60fps tracker. Both receive the same simulated fix. */}
            {usingStreetMap ? (
              <Animated.View entering={FadeIn.duration(220)}>
                <LiveBusMap
                  stops={trackerStops}
                  busLocation={simulatedPosition}
                  heading={loc?.heading}
                  speed={loc?.speed}
                  isFresh={locFresh}
                  boardingStopId={liveData?.boarding_stop_id || boardingStopId}
                  height={310}
                />
              </Animated.View>
            ) : (
              <LiveRouteTracker
                stops={trackerStops}
                bus={trackerBusPosition
                  ? { ...trackerBusPosition, heading: showLive ? loc?.heading : null }
                  : null}
                boardingStopId={boardingStopId}
                isFresh={(showLive && locFresh) || routeSimulationActive}
                etaMinutes={showLive && locFresh ? liveData?.eta_minutes : null}
                mode={showLive ? 'live' : 'preview'}
                simulationProgress={routeSimulationActive ? simulationProgress : null}
                simulationStopCount={stops.length}
                height={300}
              />
            )}

            {showLive && (
              <View style={[s.mapStatsRow, isDark && { backgroundColor: theme.colors.background }]}>
                <View style={s.mapStat}>
                  <View style={[s.mapStatIcon, { backgroundColor: C.blueLight }]}>
                    <Ionicons name="speedometer-outline" size={15} color={C.blue} />
                  </View>
                  <View>
                    <Text style={s.mapStatLabel}>{t('busTracker.speed')}</Text>
                    <Text style={[s.mapStatValue, isDark && { color: theme.colors.textPrimary }]}>
                      {loc?.speed != null ? `${Math.max(0, Math.round(loc.speed))} km/h` : '—'}
                    </Text>
                  </View>
                </View>
                <View style={s.mapStatDivider} />
                <View style={s.mapStat}>
                  <View style={[s.mapStatIcon, { backgroundColor: locFresh ? C.emeraldLight : C.amberLight }]}>
                    <Ionicons name={locFresh ? 'radio-outline' : 'cloud-offline-outline'} size={15} color={locFresh ? C.emerald : C.amber} />
                  </View>
                  <View>
                    <Text style={s.mapStatLabel}>{t('busTracker.signal')}</Text>
                    <Text style={[s.mapStatValue, isDark && { color: theme.colors.textPrimary }]}>
                      {locFresh ? t('busTracker.gps_strong') : t('busTracker.gps_weak')}
                    </Text>
                  </View>
                </View>
                <View style={s.mapStatDivider} />
                <View style={s.mapStat}>
                  <View style={[s.mapStatIcon, { backgroundColor: C.slate100 }]}>
                    <Ionicons name="flag-outline" size={15} color={C.slate700} />
                  </View>
                  <View>
                    <Text style={s.mapStatLabel}>{t('busTracker.stops_left')}</Text>
                    <Text style={[s.mapStatValue, isDark && { color: theme.colors.textPrimary }]}>
                      {until != null ? until : '—'}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* ETA row */}
            {showLive && liveData ? (
            <View style={[s.liveEtaRow, { marginTop: 16 }]}>
              <View style={[s.liveEtaIcon, { backgroundColor: theme.colors.primary }]}>
                <Ionicons name="navigate" size={18} color={C.white} />
              </View>
              <View style={{ flex: 1 }}>
                {etaPoint != null ? (
                  <>
                    <View style={s.liveEtaTopRow}>
                      <Text style={[s.liveEtaBig, isDark && { color: theme.colors.textPrimary }]}>
                        {etaPoint === 0 ? t('busTracker.arriving_now') : t('busTracker.eta_min', { min: etaPoint })}
                      </Text>
                      {etaPoint > 0 && (
                        <View style={s.etaConfChip}>
                          <Text style={s.etaConfChipText}>
                            {etaHasRange
                              ? t('busTracker.eta_range', { low: etaLow, high: etaHigh })
                              : etaConfLabel}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.liveEtaSub}>
                      {etaPoint === 0
                        ? t('busTracker.bus_at_or_near_stop')
                        : `${liveData.distance_km != null ? t('busTracker.distance_km', { distance: liveData.distance_km }) : t('busTracker.on_the_way')} ${t('busTracker.to_stop', { stop: boarding || t('busTracker.your_stop_fallback') })}${etaHasRange ? t('busTracker.eta_suffix', { label: etaConfLabel }) : ''}`}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[s.liveEtaBig, isDark && { color: theme.colors.textPrimary }]}>
                      {loc ? t('busTracker.on_the_way') : t('busTracker.waiting_for_gps')}
                    </Text>
                    <Text style={s.liveEtaSub}>
                      {loc
                        ? t('busTracker.eta_unavailable')
                        : t('busTracker.bus_appears_when_gps')}
                    </Text>
                  </>
                )}
              </View>
            </View>
            ) : (
              <View style={[s.simulationPanel, isDark && { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
                <View style={s.simulationTopRow}>
                  <View style={[s.previewMapIcon, { backgroundColor: routeSimulationActive ? C.tealLight : `${theme.colors.primary}14` }]}>
                    <Ionicons
                      name={routeSimulationActive ? 'bus' : 'navigate-outline'}
                      size={17}
                      color={routeSimulationActive ? C.tealDark : theme.colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.previewMapTitle, isDark && { color: theme.colors.textPrimary }]}>
                      {routeSimulationActive
                        ? simulationFinished
                          ? t('busTracker.simulation_complete')
                          : t('busTracker.route_simulation')
                        : t('busTracker.preview_the_journey')}
                    </Text>
                    <Text style={s.previewMapText}>
                      {routeSimulationActive
                        ? t('busTracker.simulation_stop_progress', {
                          current: simulationJourneyIndex + 1,
                          total: stops.length,
                        })
                        : t('busTracker.simulation_from_start_to_end')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    activeOpacity={0.78}
                    style={[
                      s.simulationButton,
                      { backgroundColor: simulationRunning ? C.slate900 : C.tealDark },
                    ]}
                    onPress={toggleRouteSimulation}
                    disabled={stops.length < 2}
                  >
                    <Ionicons
                      name={simulationRunning ? 'pause' : simulationFinished ? 'refresh' : 'play'}
                      size={15}
                      color={C.white}
                    />
                    <Text style={s.simulationButtonText}>
                      {simulationRunning
                        ? t('busTracker.pause')
                        : simulationFinished
                          ? t('busTracker.replay')
                          : simulationProgress > 0
                            ? t('busTracker.resume')
                            : t('busTracker.start')}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={s.simulationProgressTrack}>
                  <View
                    style={[
                      s.simulationProgressFill,
                      {
                        width: `${simulationEnd > 0
                          ? Math.max(0, Math.min(100, (simulationProgress / simulationEnd) * 100))
                          : 0}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            )}

            {/* Stale-signal notice */}
            {showLive && loc && !locFresh && (
              <View style={s.liveStaleBanner}>
                <Ionicons name="cloud-offline-outline" size={15} color={C.amber} />
                <Text style={s.liveStaleText}>{t('busTracker.gps_signal_lost')}</Text>
              </View>
            )}

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
            const reachedFromServer =
              stop.status === 'completed' || stop.status === 'skipped';
            const reachedInSimulation =
              routeSimulationActive
              && (
                idx < simulationJourneyIndex
                || (simulationFinished && idx === simulationJourneyIndex)
              );
            const isReached = reachedFromServer || reachedInSimulation;
            const isCurrent = routeSimulationActive
              ? idx === simulationJourneyIndex
              : isLive && stop.id === data.current_stop?.id;
            const isBoardingStop = stop.id === boardingStopId;
            const isLast = idx === stops.length - 1;
            const isUpcoming = !isReached && !isCurrent;
            const simulatedStopTime = simulationClockRef.current
              ? simulationClockRef.current + idx * 4 * 60_000
              : null;
            const reachedTime = stop.reached_at
              ? new Date(stop.reached_at)
              : simulatedStopTime != null
                ? new Date(simulatedStopTime)
                : null;
            const timeText = reachedTime?.toLocaleTimeString(dateLocale, {
              hour: '2-digit',
              minute: '2-digit',
            });
            const statusText = isCurrent
              ? simulationFinished
                ? t('busTracker.route_ended')
                : t('busTracker.bus_here')
              : isReached
                ? t('busTracker.bus_left')
                : routeSimulationActive
                  ? t('busTracker.upcoming')
                  : t('busTracker.pending');
            const lineBeforeComplete =
              isReached || isCurrent || (routeSimulationActive && idx <= simulationJourneyIndex);
            const lineAfterComplete =
              isReached && !(simulationFinished && isCurrent);

            return (
              <View key={stop.id} style={s.journeyRow}>
                <View style={s.journeyRail}>
                  {idx > 0 && (
                    <View
                      style={[
                        s.journeyConnector,
                        s.journeyConnectorTop,
                        { backgroundColor: lineBeforeComplete ? C.teal : '#CDEAF3' },
                      ]}
                    />
                  )}

                  {isCurrent ? (
                    <View style={s.journeyCurrentNode}>
                      <CurrentStopNode color={C.tealDark} />
                    </View>
                  ) : (
                    <View
                      style={[
                        s.journeyNode,
                        isReached
                          ? s.journeyNodeReached
                          : isBoardingStop
                            ? [s.journeyNodeUpcoming, { borderColor: theme.colors.primary }]
                            : s.journeyNodeUpcoming,
                      ]}
                    >
                      {isReached ? (
                        <View style={s.journeyNodeCore} />
                      ) : isBoardingStop ? (
                        <Ionicons name="person" size={10} color={theme.colors.primary} />
                      ) : (
                        <View style={s.journeyNodePendingCore} />
                      )}
                    </View>
                  )}

                  {!isLast && (
                    <View
                      style={[
                        s.journeyConnector,
                        s.journeyConnectorBottom,
                        { backgroundColor: lineAfterComplete ? C.teal : '#CDEAF3' },
                      ]}
                    />
                  )}
                </View>

                <View
                  style={[
                    s.journeyStopContent,
                    isCurrent && s.journeyStopCurrent,
                    isBoardingStop && s.journeyBoardingStop,
                    isDark && {
                      backgroundColor:
                        isCurrent || isBoardingStop ? theme.colors.background : 'transparent',
                    },
                    isLast && s.journeyStopLast,
                  ]}
                >
                  <View style={s.journeyStopHeading}>
                    <Text
                      style={[
                        s.journeyStopName,
                        isDark && { color: theme.colors.textPrimary },
                        isCurrent && { color: C.tealDark },
                      ]}
                      numberOfLines={2}
                    >
                      {stop.name}
                    </Text>
                    <Text
                      style={[
                        s.journeyStopStatus,
                        {
                          color: isCurrent
                            ? C.tealDark
                            : isReached
                              ? C.red
                              : C.slate400,
                        },
                      ]}
                    >
                      {statusText}
                    </Text>
                  </View>

                  {isBoardingStop && (
                    <View style={[s.journeyBoardingTag, { borderColor: theme.colors.primary }]}>
                      <Ionicons name="person-outline" size={10} color={theme.colors.primary} />
                      <Text style={[s.journeyBoardingTagText, { color: theme.colors.primary }]}>
                        {t('busTracker.your_stop')}
                      </Text>
                    </View>
                  )}

                  <View style={s.journeyTimeRow}>
                    <Ionicons
                      name={isUpcoming ? 'time-outline' : isCurrent ? 'navigate-outline' : 'log-out-outline'}
                      size={14}
                      color={isCurrent || isReached ? C.teal : C.slate400}
                    />
                    <Text style={[s.journeyTimeLabel, (isCurrent || isReached) && { color: C.tealDark }]}>
                      {isCurrent && !simulationFinished
                        ? t('busTracker.arriving_now')
                        : timeText
                          ? routeSimulationActive
                            ? isUpcoming
                              ? t('busTracker.simulated_expected', { time: timeText })
                              : t('busTracker.simulated_at', { time: timeText })
                            : t('busTracker.reached_at_time', { time: timeText })
                          : isUpcoming
                            ? t('busTracker.waiting_for_bus')
                            : t('busTracker.pending')}
                    </Text>
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
            const dateStr = new Date(item.attendance_date).toLocaleDateString(dateLocale, {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            });
            const timeStr = new Date(item.marked_at).toLocaleTimeString(dateLocale, {
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
                  <Text style={[s.logStopName, isDark && { color: theme.colors.textPrimary }]}>
                    {item.stop_name || t('busTracker.stop_fallback')}
                  </Text>
                  <Text style={s.logRouteName}>{item.route_name || t('busTracker.route_fallback')}</Text>
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
  retryButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: C.blue,
  },
  retryButtonText: { fontSize: 14, fontWeight: '700', color: C.white },

  // ── Trip sheet ──
  tripSheet: {
    backgroundColor: C.white,
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.slate200,
    shadowColor: C.slate900,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 99,
    backgroundColor: C.slate200,
    marginBottom: 16,
  },
  tripTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  routeIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  tripTitleBlock: { flex: 1, minWidth: 0 },
  tripEyebrow: { fontSize: 10, fontWeight: '800', color: C.slate500, letterSpacing: 0.8, marginBottom: 3 },
  tripHeadline: { fontSize: 18, lineHeight: 22, fontWeight: '800', color: C.slate900, letterSpacing: -0.3 },
  tripDetail: { fontSize: 12, lineHeight: 17, color: C.slate500, marginTop: 3 },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 6, paddingHorizontal: 9, borderRadius: 99,
  },
  statusChipText: { fontSize: 11, fontWeight: '800' },
  statusLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.emerald },
  tripRouteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 16, paddingTop: 14, borderTopWidth: 1,
  },
  tripRouteRail: { width: 16, height: 38, alignItems: 'center', justifyContent: 'space-between' },
  tripRouteDot: { width: 9, height: 9, borderRadius: 5 },
  tripRouteLine: { width: 2, flex: 1, backgroundColor: C.slate200 },
  tripRoutePin: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: C.slate400, backgroundColor: C.white },
  tripStopBlock: { flex: 1, minWidth: 0 },
  tripStopLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7, color: C.slate400 },
  tripStopName: { fontSize: 15, fontWeight: '700', color: C.slate900, marginTop: 2 },
  tripRouteName: { fontSize: 12, color: C.slate500, marginTop: 2 },

  // ── Live GPS card ──
  liveCard: {
    backgroundColor: C.white,
    borderRadius: 24,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: C.slate900,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  liveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveGreenDot: { width: 9, height: 9, borderRadius: 4.5 },
  liveTitle: { fontSize: 15, fontWeight: '800', color: C.slate900, letterSpacing: -0.2 },
  liveFreshness: { fontSize: 11, color: C.slate400, fontWeight: '600' },
  liveNowPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.emeraldLight, borderRadius: 20,
    paddingVertical: 3, paddingHorizontal: 8,
  },
  liveNowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.emerald },
  liveNowText: { fontSize: 10, fontWeight: '800', color: C.emerald, letterSpacing: 0.5 },
  mapModeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    padding: 4,
    marginBottom: 10,
    borderRadius: 15,
    backgroundColor: C.slate100,
  },
  mapModeButton: {
    minHeight: 36,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 11,
  },
  mapModeButtonActive: {
    backgroundColor: C.slate900,
    shadowColor: C.slate900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  mapModeText: { color: C.slate500, fontSize: 11, fontWeight: '800' },
  mapModeTextActive: { color: C.white },
  mapStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 15,
    backgroundColor: 'rgba(248,250,252,0.82)',
  },
  mapStat: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 5,
  },
  mapStatIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapStatLabel: {
    color: C.slate400,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
  },
  mapStatValue: { color: C.slate900, fontSize: 11, fontWeight: '800', marginTop: 1 },
  mapStatDivider: { width: 1, height: 30, backgroundColor: C.slate200 },
  liveEtaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingBottom: 4 },
  liveEtaIcon: {
    width: 40, height: 40, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  liveEtaBig: { fontSize: 25, fontWeight: '800', color: C.slate900, letterSpacing: -0.7 },
  liveEtaSub: { fontSize: 12, color: C.slate500, fontWeight: '500', marginTop: 2 },
  liveEtaTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  etaConfChip: {
    backgroundColor: C.blueLight, borderRadius: 12,
    paddingVertical: 3, paddingHorizontal: 9,
    borderWidth: 1, borderColor: C.blueBorder,
  },
  etaConfChipText: { fontSize: 11, fontWeight: '700', color: C.blue },
  liveStaleBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.amberLight, borderColor: C.amberBorder, borderWidth: 1,
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, marginTop: 12,
  },
  liveStaleText: { fontSize: 12, color: C.amber, fontWeight: '600', flex: 1 },
  liveMapToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 14, paddingVertical: 12, borderRadius: 14,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.slate200,
    minHeight: 44,
  },
  liveMapToggleText: { fontSize: 13, fontWeight: '700' },
  simulationPanel: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.slate200,
    backgroundColor: C.slate50,
  },
  simulationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  simulationButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  simulationButtonText: { color: C.white, fontSize: 11, fontWeight: '800' },
  simulationProgressTrack: {
    height: 5,
    marginTop: 11,
    overflow: 'hidden',
    borderRadius: 99,
    backgroundColor: '#DDE8EC',
  },
  simulationProgressFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: C.teal,
  },
  previewMapFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    marginTop: 12, paddingHorizontal: 4, paddingVertical: 4,
  },
  previewMapIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  previewMapTitle: { fontSize: 13, fontWeight: '800', color: C.slate900 },
  previewMapText: { fontSize: 11, lineHeight: 16, color: C.slate500, marginTop: 2 },

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
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: C.slate900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  timelineHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 18,
  },
  timelineTitle: { fontSize: 16, fontWeight: '800', color: C.slate900, letterSpacing: -0.2 },
  timelineCount: { fontSize: 12, color: C.slate500, fontWeight: '700' },

  // Transit-app journey rail.
  journeyRow: { minHeight: 82, flexDirection: 'row' },
  journeyRail: {
    position: 'relative',
    width: 50,
    alignItems: 'center',
  },
  journeyConnector: {
    position: 'absolute',
    left: 23,
    width: 4,
  },
  journeyConnectorTop: { top: 0, height: 18 },
  journeyConnectorBottom: { top: 43, bottom: 0 },
  journeyCurrentNode: { zIndex: 3, marginTop: 12 },
  journeyNode: {
    zIndex: 2,
    width: 18,
    height: 18,
    marginTop: 17,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  journeyNodeReached: {
    borderColor: C.white,
    backgroundColor: C.teal,
    shadowColor: C.tealDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  journeyNodeUpcoming: {
    borderColor: '#9DB8C1',
    backgroundColor: C.white,
  },
  journeyNodeCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.white,
  },
  journeyNodePendingCore: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D6E5EA',
  },
  journeyStopContent: {
    flex: 1,
    minHeight: 72,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
  },
  journeyStopLast: { marginBottom: 0 },
  journeyStopCurrent: {
    borderWidth: 1.5,
    borderColor: C.teal,
    backgroundColor: '#F0FDFA',
    shadowColor: C.tealDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 7,
    elevation: 2,
  },
  journeyBoardingStop: {
    borderWidth: 1,
    borderColor: C.blueBorder,
    backgroundColor: '#F8FBFF',
  },
  journeyStopHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  journeyStopName: {
    flex: 1,
    color: C.slate900,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  journeyStopStatus: { marginTop: 1, fontSize: 10, fontWeight: '800' },
  journeyBoardingTag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: C.white,
  },
  journeyBoardingTagText: { fontSize: 9, fontWeight: '800' },
  journeyTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  journeyTimeLabel: { color: C.slate400, fontSize: 11, fontWeight: '600' },

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
    paddingBottom: 15,
    paddingLeft: 2,
  },
  stopContentCurrent: {
    backgroundColor: C.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginLeft: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderBottomWidth: 1,
  },
  stopContentBoarding: {
    backgroundColor: C.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginLeft: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderBottomWidth: 1,
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
