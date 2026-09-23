import * as Crypto from 'expo-crypto';
import { useTransportPolling } from '../../src/hooks/useTransportPolling';
import DriverTrackingHealth from '../../src/components/DriverTrackingHealth';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, RefreshControl, Platform } from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../src/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown, FadeInUp,
  useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, Easing
} from
  'react-native-reanimated';
import * as Haptics from '@/src/utils/haptics';
import { api } from '../../src/services/apiClient';
import {
  startDriverLocationUpdates,
  stopDriverLocationUpdates,
  postBusLocation,
  adaptDriverLocationSampling,
  flushQueuedBusLocations,
  setDriverNextStopTarget,
} from '../../src/services/driverLocationTask';
import { usePersistedSWR } from '../../src/hooks/usePersistedSWR';
import LogoLoader from '../../src/components/LogoLoader';
import AdminHeaderCard from '../../src/components/AdminHeaderCard';
import { useTheme } from '../../src/hooks/useTheme';
import { useDriverLocationPermission } from '../../src/hooks/useDriverLocationPermission';
import { driverDateLocale, translateDriverDirection } from '../../src/utils/driverI18n';

const HEARTBEAT_INTERVAL = 30000;
const AUTO_TRANSITION_RETRY_MS = 30000;
/** Auto-mark "arrived" when the bus is within this distance of the next stop. */
const AUTO_ARRIVE_RADIUS_KM = 0.15;
/** Auto-complete an arrived stop once the bus pulls this far away. Larger than
 *  the arrive radius (hysteresis) so a bus idling at the boundary can't flap. */
const AUTO_COMPLETE_EXIT_RADIUS_KM = 0.25;

/** Haversine distance in km. */
const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

type StopStatus = 'pending' | 'arrived' | 'completed' | 'skipped';

interface TripStop {
  id: string;
  stop_id: string;
  stop_name: string;
  stop_order: number;
  status: StopStatus;
  latitude?: number;
  longitude?: number;
  student_count: number;
  arrival_time?: string;
  departure_time?: string;
}

interface BusInfo {
  id: string;
  bus_no: string;
  capacity: number;
}

interface RouteInfo {
  id: string;
  name: string;
  direction: string;
  total_stops: number;
  bus_id?: string;
}

type TripLeg = 'morning' | 'evening';

/** Phase A calibration status for the selected route-leg (drives the badge). */
interface CalibrationInfo {
  trip_direction: string;
  is_calibrated: boolean;
  stops_total: number;
  stops_calibrated: number;
  segments_total: number;
  segments_learned: number;
  clean_trip_count: number;
  required_clean_trip_count: number;
}

/** Latest foreground GPS fix, attached to stop marks for calibration. */
type GpsFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  mocked: boolean;
  ts: number;
};
/** A fix older than this is not trustworthy as "where the stop is". */
const FIX_MAX_AGE_MS = 60_000;

/* ─── Status Colors ─── */
const STATUS_CONFIG: Record<StopStatus, { bg: string; colorKey: 'info' | 'warning' | 'success' | 'danger' | 'textMuted'; icon: string; label: string; }> = {
  pending: { bg: '#F1F5F9', colorKey: 'textMuted', icon: 'ellipse-outline', label: 'Pending' },
  arrived: { bg: '#FEF3C7', colorKey: 'warning', icon: 'location', label: 'At Stop' },
  completed: { bg: '#DCFCE7', colorKey: 'success', icon: 'checkmark-circle', label: 'Done' },
  skipped: { bg: '#FEE2E2', colorKey: 'danger', icon: 'close-circle', label: 'Skipped' }
};

/* ════════════════════════════════════════════════════════════
   ████  DRIVER DASHBOARD  ████
   ════════════════════════════════════════════════════════════ */
export default function DriverDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const { requestPermissions: requestDriverLocationPermissions, disclosureModal } = useDriverLocationPermission();
  const dateLocale = driverDateLocale(i18n.language);

  const PRIMARY = theme.colors.primary;
  const PRIMARY_GRADIENT: [string, string] = [theme.colors.primary, theme.colors.primaryDark];
  const GREEN = theme.colors.success;
  const RED = theme.colors.danger;

  const s = React.useMemo(() => getStyles(theme), [theme]);

  // Data state
  const [buses, setBuses] = useState<BusInfo[]>([]);
  const [selectedBus, setSelectedBus] = useState<BusInfo | null>(null);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteInfo | null>(null);
  const [tripLeg, setTripLeg] = useState<TripLeg>('morning');
  const [stops, setStops] = useState<TripStop[]>([]);

  // Trip state
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const startRequestRef = useRef<{selection:string;id:string}|null>(null);
  const [tripStartedAt, setTripStartedAt] = useState<Date | null>(null);
  const [elapsedMin, setElapsedMin] = useState(0);

  // UI state
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [locationSharingPaused, setLocationSharingPaused] = useState(false);

  const {
    data: driverBusData,
    loading: busDataLoading,
    isRefreshing: busDataRefreshing,
    refetch: refetchBusData,
  } = usePersistedSWR<any>({
    cacheKey: 'driver-my-bus',
    userId: user?.userId,
    ttlMs: 30_000,
    persist: true,
    revalidateOnMount: true,
    enabled: !!user?.userId,
    fetcher: () => api.get<any>('/transport/driver/my-bus', undefined, { silent: true }),
  });

  const loading = busDataLoading && !driverBusData;
  const tripControlsEnabled = !busDataRefreshing;

  // Refs
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const foregroundIntervalRef = useRef(5000);
  const foregroundRestartingRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoArrivedStopsRef = useRef<Set<string>>(new Set());
  const autoCompletedStopsRef = useRef<Set<string>>(new Set());
  const autoRetryAfterRef = useRef<Map<string, number>>(new Map());
  const lastFixRef = useRef<GpsFix | null>(null);
  const [calibration, setCalibration] = useState<CalibrationInfo | null>(null);

  const displayName = user?.display_name || user?.first_name || t('driver_ui.driver');
  const greeting = new Date().getHours() < 12 ? t('dashboard.good_morning', 'Good Morning') :
    new Date().getHours() < 17 ? t('dashboard.good_afternoon', 'Good Afternoon') : t('dashboard.good_evening', 'Good Evening');

  // Pulse animation
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (isTracking) {
      pulse.value = withRepeat(
        withTiming(1.25, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1, true
      );
    } else { pulse.value = withTiming(1, { duration: 200 }); }
  }, [isTracking, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const inferTripLeg = (direction?: string | null): TripLeg => {
    if (direction === 'afternoon' || direction === 'evening') return 'evening';
    if (direction === 'morning') return 'morning';
    return new Date().getHours() >= 12 ? 'evening' : 'morning';
  };

  const resolveTripDirectionParam = (route: RouteInfo | null, leg: TripLeg) => {
    if (!route) return leg === 'evening' ? 'evening' : 'morning';
    if (route.direction === 'both') return leg === 'evening' ? 'evening' : 'morning';
    if (route.direction === 'afternoon' || route.direction === 'evening') return route.direction;
    return route.direction || 'morning';
  };

  const routesForSelectedBus = selectedBus
    ? routes.filter((r) => r.bus_id === selectedBus.id)
    : routes;

  /* ─── Apply driver's buses & routes from API payload ─── */
  const applyDriverPayload = useCallback(async (data: any) => {
    const busList: BusInfo[] = data.buses?.length ? data.buses : (data.bus ? [data.bus] : []);
    const routeList: RouteInfo[] = data.routes || [];
    setBuses(busList);
    setRoutes(routeList);

    const activeTrips: any[] = data.activeTrips?.length
      ? data.activeTrips
      : (data.activeTrip ? [data.activeTrip] : []);

    if (activeTrips.length > 0) {
      const active = activeTrips[0];
      const activeBus = busList.find((b) => b.id === active.bus_id) || busList[0] || null;
      setSelectedBus(activeBus);
      const activeRoute = routeList.find((r) => r.id === active.route_id) || null;
      if (activeRoute) {
        setSelectedRoute(activeRoute);
        setTripLeg(active.trip_direction === 'evening' || active.trip_direction === 'afternoon' ? 'evening' : 'morning');
      }
      setActiveTripId(active.id);
      setIsTracking(true);
      setTripStartedAt(new Date(active.started_at));
      await fetchTripStatus(active.id);
      // Resume GPS streaming after an app restart mid-trip — without this the
      // trip shows as tracking but no location ever reaches parents.
      if (activeBus) void startLocationTracking(activeBus.id);
    } else {
      // A trip may have been closed by an administrator or by overnight
      // maintenance while this device was backgrounded. Stop any persisted
      // native location task as soon as the dashboard confirms there is no
      // active trip.
      setActiveTripId(null);
      setIsTracking(false);
      setTripStartedAt(null);
      setLocationSharingPaused(false);
    }

    if (activeTrips.length === 0 && busList.length > 0) {
      const initialBus = busList[0];
      setSelectedBus(initialBus);
      const busRoutes = routeList.filter((r) => r.bus_id === initialBus.id);
      if (busRoutes.length > 0) {
        setSelectedRoute(busRoutes[0]);
        const leg = inferTripLeg(busRoutes[0].direction);
        setTripLeg(leg);
        await fetchRouteStops(busRoutes[0].id, leg);
      }
    }
  }, []);

  useEffect(() => {
    if (!driverBusData) return;
    void applyDriverPayload(driverBusData);
  }, [driverBusData, applyDriverPayload]);

  const refreshDriverData = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchBusData();
    } finally {
      setRefreshing(false);
    }
  }, [refetchBusData]);

  /* ─── Fetch route stops (pre-trip) ─── */
  const fetchRouteStops = async (routeId: string, leg: TripLeg = tripLeg) => {
    try {
      const route = routes.find((r) => r.id === routeId) || selectedRoute;
      const tripDirection = resolveTripDirectionParam(route, leg);
      const data = await api.get<any[]>(
        `/transport/driver/route/${routeId}/stops?trip_direction=${tripDirection}`,
        undefined,
        { silent: true },
      );
      setStops(data.map((s, idx) => ({
        id: '', stop_id: s.id, stop_name: s.name,
        stop_order: s.exec_order ?? idx + 1,
        status: 'pending' as StopStatus, latitude: s.latitude, longitude: s.longitude,
        student_count: s.student_count || 0
      })));
    } catch { }
  };

  /* ─── Fetch trip status (during trip) ─── */
  const fetchTripStatus = async (tripId: string) => {
    try {
      const data = await api.get<any>(
        `/transport/trips/${tripId}/status`,
        undefined,
        { silent: true },
      );
      if (!['active', 'in_progress'].includes(data.trip?.status)) {
        setIsTracking(false); setActiveTripId(null);
      }
      setStops(data.stops.map((s: any) => ({
        id: s.id, stop_id: s.stop_id, stop_name: s.stop_name,
        stop_order: s.stop_order, status: s.status,
        latitude: s.latitude, longitude: s.longitude,
        student_count: Number(s.student_count ?? s.assigned_students) || 0,
        arrival_time: s.arrival_time, departure_time: s.departure_time
      })));
    } catch { }
  };

  useTransportPolling(async () => {
    if (activeTripId) await fetchTripStatus(activeTripId);
    else await refetchBusData();
  }, 10000);

  /* ─── Calibration status (Phase A badge) ─── */
  useEffect(() => {
    if (!selectedRoute?.id) { setCalibration(null); return; }
    let cancelled = false;
    api.get<CalibrationInfo>(
      `/transport/driver/route/${selectedRoute.id}/calibration?trip_direction=${tripLeg}`,
      undefined,
      { silent: true },
    )
      .then((d) => { if (!cancelled) setCalibration(d); })
      .catch(() => { if (!cancelled) setCalibration(null); });
    return () => { cancelled = true; };
  }, [selectedRoute?.id, tripLeg, isTracking]);

  /** GPS fix payload for stop marks — only when fresh enough to trust. */
  const freshFixBody = async () => {
    if (Platform.OS === 'web') return {};
    try {
      const fix = await Location.getLastKnownPositionAsync({ maxAge: 30000, requiredAccuracy: 50 });
      if (!fix || Date.now() - fix.timestamp > 30000) return {};
      return { latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy,
        is_mocked: fix.mocked === true, recorded_at: new Date(fix.timestamp).toISOString() };
    } catch { return {}; }
  };

  /* ─── Timer for elapsed time ─── */
  useEffect(() => {
    if (isTracking && tripStartedAt) {
      timerRef.current = setInterval(() => {
        setElapsedMin(Math.floor((Date.now() - tripStartedAt.getTime()) / 60000));
      }, 10000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isTracking, tripStartedAt]);

  /* ─── START TRIP ─── */
  const handleStartTrip = async () => {
    if (!selectedBus || !selectedRoute) return alertCompat(t('driver_ui.error'), t('driver_ui.select_bus_route_first'));
    if (selectedRoute.direction === 'both' && !tripLeg) {
      return alertCompat(t('driver_ui.error'), t('driver_ui.choose_morning_evening'));
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setActionLoading(true);
    try {
      const tripDirection = resolveTripDirectionParam(selectedRoute, tripLeg);
      const selection = `${selectedRoute.id}:${tripDirection}`;
      if (startRequestRef.current?.selection !== selection) startRequestRef.current = { selection, id: Crypto.randomUUID() };
      const data = await api.post<any>('/transport/trips/start', {
        request_id: startRequestRef.current.id,
        route_id: selectedRoute.id,
        bus_id: selectedBus.id,
        trip_direction: tripDirection,
      });
      startRequestRef.current = null;
      setActiveTripId(data.trip.id);
      setIsTracking(true);
      setTripStartedAt(new Date());
      setElapsedMin(0);
      await fetchTripStatus(data.trip.id);
      await startLocationTracking(selectedBus.id, true);
    } catch {
      alertCompat(t('driver_ui.error'), t('driver_ui.failed_to_start_trip'));
    } finally { setActionLoading(false); }
  };

  /* ─── END TRIP ─── */
  const handleEndTrip = async () => {
    alertCompat(t('driver_ui.end_trip'), t('driver_ui.end_trip_question'), [
      { text: t('driver_ui.cancel'), style: 'cancel' },
      {
        text: t('driver_ui.end_trip'), style: 'destructive', onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          setActionLoading(true);
          try {
            const result = await api.post<{ calibration?: CalibrationInfo }>(
              `/transport/trips/${activeTripId}/end`,
            );
            if (result?.calibration) setCalibration(result.calibration);
            setIsTracking(false);
            setActiveTripId(null);
            stopLocationTracking();
            await refreshDriverData();
          } catch {
            alertCompat(t('driver_ui.error'), t('driver_ui.failed_to_end_trip'));
          } finally { setActionLoading(false); }
        }
      }]
    );
  };

  /* ─── ARRIVE AT STOP ─── */
  const handleArriveStop = async (stopId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionLoading(true);
    try {
      // Manual mark + fresh GPS fix = a calibration sample (Phase A).
      await api.post<any>(`/transport/trips/${activeTripId}/stops/${stopId}/arrive`, {
        ...await freshFixBody(),
        source: 'manual',
      });
      await fetchTripStatus(activeTripId!);
    } catch {
      alertCompat(t('driver_ui.cannot_arrive'), t('driver_ui.action_failed'));
    } finally { setActionLoading(false); }
  };

  /* ─── COMPLETE STOP ─── */
  const handleCompleteStop = async (stopId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionLoading(true);
    try {
      await api.post<any>(`/transport/trips/${activeTripId}/stops/${stopId}/complete`);
      await fetchTripStatus(activeTripId!);
    } catch {
      alertCompat(t('driver_ui.cannot_complete'), t('driver_ui.action_failed'));
    } finally { setActionLoading(false); }
  };

  /* ─── SKIP STOP ─── */
  const handleSkipStop = async (stopId: string) => {
    alertCompat(t('driver_ui.skip_stop'), t('driver_ui.skip_stop_question'), [
      { text: t('driver_ui.cancel'), style: 'cancel' },
      {
        text: t('driver_ui.skip'), style: 'destructive', onPress: async () => {
          Haptics.selectionAsync();
          setActionLoading(true);
          try {
            await api.post<any>(`/transport/trips/${activeTripId}/stops/${stopId}/skip`);
            await fetchTripStatus(activeTripId!);
          } catch { alertCompat(t('driver_ui.cannot_skip'), t('driver_ui.action_failed')); } finally { setActionLoading(false); }
        }
      }]
    );
  };

  const startLocationTracking = async (busId: string, requestPermission = false) => {
    if (Platform.OS === 'web') return;
    try {
      const granted = requestPermission ? await requestDriverLocationPermissions({ requestBackground: true }) : (await Location.getForegroundPermissionsAsync()).granted;
      if (!granted) { setLocationSharingPaused(true); return; }
      await startDriverLocationUpdates(busId);
      setLocationSharingPaused(false);
    } catch { setLocationSharingPaused(true); }
  };
  const stopLocationTracking = () => { void stopDriverLocationUpdates(); };

  /* ─── Derived state ─── */
  const currentStop = stops.find((s) => s.status === 'pending' || s.status === 'arrived');
  const completedCount = stops.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
  const progressPercent = stops.length > 0 ? completedCount / stops.length * 100 : 0;

  useEffect(() => {
    if (!isTracking || currentStop?.latitude == null || currentStop?.longitude == null) {
      void setDriverNextStopTarget(null);
      return;
    }
    void setDriverNextStopTarget({
      latitude: Number(currentStop.latitude),
      longitude: Number(currentStop.longitude),
    });
  }, [isTracking, currentStop?.stop_id, currentStop?.latitude, currentStop?.longitude]);

  useEffect(() => {
    if (!isTracking || !selectedBus?.id || Platform.OS === 'web') return;
    return NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void flushQueuedBusLocations(selectedBus.id).catch(() => {});
      }
    });
  }, [isTracking, selectedBus?.id]);

  /* ─── Loading ─── */
  if (loading) {
    return (
      <ScreenLayout>
        <StudentHeader title={t('driver_ui.route')} menuUserType="driver" showBackButton={false} />
        <View style={s.center}><LogoLoader size={60} color={PRIMARY} /></View>
      </ScreenLayout>);

  }

  return (
    <ScreenLayout>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F1A" />
      <StudentHeader title={t('driver_ui.route', 'My Route')} menuUserType="driver" showBackButton={false} />
      <DriverTrackingHealth />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshDriverData} tintColor="transparent" colors={['transparent']} progressBackgroundColor="transparent" />}>

        {refreshing &&
          <View style={{ width: '100%', alignItems: 'center', paddingVertical: 12 }}>
            <LogoLoader size={28} />
          </View>
        }

        {/* ═══════ Compact identity ═══════ */}
        <Animated.View entering={FadeInDown.duration(320)} style={s.identityBlock}>
          <Text style={s.dateEyebrow}>
            {new Date().toLocaleDateString(dateLocale, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
          </Text>
          <Text style={s.greetingLine}>
            {greeting}, <Text style={s.greetingName}>{displayName}</Text>
          </Text>
          <View style={s.identityCard}>
            <AdminHeaderCard
              compact
              compactRole
              embedded
              dense
              displayName={displayName}
              photoUrl={user?.photoUrl}
              roleLabel={t('driver_ui.driver', 'Driver')}
              staffCode={user?.staff_code ?? undefined}
              portalBadge={t('driver_ui.driver_portal_badge')}
            />
          </View>
        </Animated.View>

        {/* ═══════ Trip status (primary) ═══════ */}
        <Animated.View entering={FadeInDown.delay(60).duration(360)} style={s.heroWrap}>
          <LinearGradient colors={PRIMARY_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
            <View style={[s.heroDecor, { top: -24, right: -20, width: 100, height: 100 }]} />
            <View style={[s.heroDecor, { bottom: -20, left: -16, width: 72, height: 72 }]} />

            <View style={s.heroTop}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <View style={s.heroDutyRow}>
                  <Animated.View style={[s.liveDot, { backgroundColor: locationSharingPaused ? '#FCA5A5' : isTracking ? GREEN : '#FCD34D' }, isTracking && !locationSharingPaused && pulseStyle]} />
                  <Text style={s.heroGreet}>
                    {locationSharingPaused
                      ? t('driver_ui.location_paused_short', 'Location paused')
                      : isTracking
                        ? t('driver_ui.on_trip', 'ON TRIP')
                        : t('driver_ui.on_duty', 'On duty')}
                  </Text>
                </View>
                <Text style={s.heroName}>{t('driver_ui.todays_trip', "Today's Trip")}</Text>
                <Text style={s.heroRoute} numberOfLines={1}>
                  {selectedRoute
                    ? `${selectedRoute.name}${selectedRoute.direction ? ` · ${translateDriverDirection(selectedRoute.direction, t)}` : ''}`
                    : t('driver_ui.pick_route_hint', 'Select a route to begin')}
                </Text>
              </View>
              <View style={s.heroBusPill}>
                <Ionicons name="bus" size={16} color="#FFF" />
                <Text style={s.heroBusText}>{selectedBus?.bus_no || buses[0]?.bus_no || '—'}</Text>
              </View>
            </View>

            <View style={s.heroStats}>
              <View style={s.heroStat}>
                <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.85)" />
                <Text style={s.heroStatValue}>{isTracking ? t('driver_ui.minute_short', { count: elapsedMin }) : t('driver_ui.ready', 'Ready')}</Text>
                <Text style={s.heroStatLabel}>{t('driver_ui.elapsed', 'Time')}</Text>
              </View>
              <View style={s.heroStatDivider} />
              <View style={s.heroStat}>
                <Ionicons name="speedometer-outline" size={16} color="rgba(255,255,255,0.85)" />
                <Text style={s.heroStatValue}>{isTracking ? `${speed.toFixed(0)}` : '—'}</Text>
                <Text style={s.heroStatLabel}>{t('driver_ui.speed_unit_kmh')}</Text>
              </View>
              <View style={s.heroStatDivider} />
              <View style={s.heroStat}>
                <Ionicons name="flag-outline" size={16} color="rgba(255,255,255,0.85)" />
                <Text style={s.heroStatValue}>
                  {stops.length > 0 ? `${completedCount}/${stops.length}` : '—'}
                </Text>
                <Text style={s.heroStatLabel}>{t('driver_ui.stops', 'Stops')}</Text>
              </View>
            </View>

            {currentStop && (
              <View style={s.nextStopRow}>
                <Ionicons name="navigate" size={14} color="#FDE68A" />
                <Text style={s.nextStopText} numberOfLines={1}>
                  {t('driver_ui.next_stop', 'Next')}: {currentStop.stop_name}
                  {currentStop.student_count > 0 ? ` · ${currentStop.student_count}` : ''}
                </Text>
              </View>
            )}
          </LinearGradient>
        </Animated.View>

        <TouchableOpacity
          onPress={() => router.push('/driver/updates')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
            padding: 14,
            borderRadius: 16,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
          accessibilityRole="button"
          accessibilityLabel="Open important updates"
        >
          <Ionicons name="notifications-circle-outline" size={20} color={theme.colors.primary} />
          <Text style={{ flex: 1, fontWeight: '700', color: theme.colors.textStrong }}>Updates</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>

        {isTracking && locationSharingPaused &&
          <View style={s.pauseAlert}>
            <Text style={s.pauseAlertTitle}>{t('driver_ui.location_sharing_is_paused')}</Text>
            <Text style={s.pauseAlertBody}>{t('driver_ui.location_paused_help')}</Text>
          </View>
        }

        {/* ═══════ No Bus State ═══════ */}
        {!selectedBus && buses.length === 0 &&
          <Animated.View entering={FadeInDown.delay(100).duration(360)} style={s.emptyCard}>
            <View style={s.emptyIcon}><Ionicons name="bus-outline" size={36} color="#CBD5E1" /></View>
            <Text style={s.emptyTitle}>{t('driver_ui.no_bus_assigned', 'No Bus Assigned')}</Text>
            <Text style={s.emptySub}>{t('driver_ui.contact_admin_bus', 'Contact admin to get a bus assigned to you.')}</Text>
          </Animated.View>
        }

        {/* ═══════ Bus Selector ═══════ */}
        {buses.length > 1 && !isTracking &&
          <Animated.View entering={FadeInDown.delay(90).duration(360)}>
            <View style={s.secHeader}>
              <View style={s.secIconBox}><Ionicons name="bus" size={15} color={PRIMARY} /></View>
              <Text style={s.secTitle}>{t('driver_ui.select_bus', 'Select Bus')}</Text>
            </View>
            <View style={s.routeGrid}>
              {buses.map((b) =>
                <TouchableOpacity
                  key={b.id}
                  style={[s.routeCard, selectedBus?.id === b.id && s.routeCardActive]}
                  activeOpacity={0.75}
                  onPress={() => {
                    setSelectedBus(b);
                    const busRoutes = routes.filter((r) => r.bus_id === b.id);
                    if (busRoutes.length > 0) {
                      setSelectedRoute(busRoutes[0]);
                      setTripLeg(inferTripLeg(busRoutes[0].direction));
                      fetchRouteStops(busRoutes[0].id, inferTripLeg(busRoutes[0].direction));
                    } else {
                      setSelectedRoute(null);
                      setStops([]);
                    }
                  }}>
                  <Ionicons name="bus-outline" size={18} color={selectedBus?.id === b.id ? '#FFF' : PRIMARY} />
                  <Text style={[s.routeCardTitle, selectedBus?.id === b.id && { color: '#FFF' }]}>{b.bus_no}</Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        }

        {/* ═══════ Route Selector ═══════ */}
        {selectedBus && !isTracking && routesForSelectedBus.length > 0 &&
          <Animated.View entering={FadeInDown.delay(100).duration(360)}>
            <View style={s.secHeader}>
              <View style={s.secIconBox}><Ionicons name="map" size={15} color={PRIMARY} /></View>
              <Text style={s.secTitle}>{t('driver_ui.select_route', 'Select Route')}</Text>
            </View>
            <View style={s.routeGrid}>
              {routesForSelectedBus.map((r) =>
                <TouchableOpacity
                  key={r.id}
                  style={[s.routeCard, selectedRoute?.id === r.id && s.routeCardActive]}
                  activeOpacity={0.75}
                  onPress={() => {
                    setSelectedRoute(r);
                    const leg = inferTripLeg(r.direction);
                    setTripLeg(leg);
                    fetchRouteStops(r.id, leg);
                  }}>
                  <View style={s.routeCardLeft}>
                    <Ionicons name="navigate-outline" size={18} color={selectedRoute?.id === r.id ? '#FFF' : PRIMARY} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.routeCardTitle, selectedRoute?.id === r.id && { color: '#FFF' }]} numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text style={[s.routeCardMeta, selectedRoute?.id === r.id && { color: 'rgba(255,255,255,0.78)' }]}>
                        {translateDriverDirection(r.direction, t)}{r.total_stops ? ` · ${t('driver_ui.stop_count', { count: r.total_stops })}` : ''}
                      </Text>
                    </View>
                  </View>
                  {selectedRoute?.id === r.id && (
                    <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  )}
                </TouchableOpacity>
              )}
            </View>
            {selectedRoute?.direction === 'both' &&
              <View style={s.legRow}>
                {(['morning', 'evening'] as TripLeg[]).map((leg) =>
                  <TouchableOpacity
                    key={leg}
                    style={[s.legChip, tripLeg === leg && s.legChipActive]}
                    onPress={() => {
                      setTripLeg(leg);
                      if (selectedRoute) fetchRouteStops(selectedRoute.id, leg);
                    }}>
                    <Text style={[s.legChipText, tripLeg === leg && { color: '#FFF' }]}>
                      {leg === 'morning' ? t('driver_ui.morning_pickup', 'Morning (pickup)') : t('driver_ui.evening_dropoff', 'Evening (drop-off)')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          </Animated.View>
        }

        {/* ═══════ Trip Progress ═══════ */}
        {isTracking &&
          <Animated.View entering={FadeInDown.delay(100).duration(360)} style={s.progressCard}>
            <View style={s.progressHeader}>
              <Text style={s.progressTitle}>{t('driver_ui.trip_progress', 'Trip Progress')}</Text>
              <Text style={s.progressCount}>{completedCount}/{stops.length} {t('driver_ui.stops', 'stops')}</Text>
            </View>
            <View style={s.progressBarBg}>
              <View style={[s.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
            <Text style={s.progressRoute}>
              {selectedRoute?.name} • {translateDriverDirection(isTracking ? resolveTripDirectionParam(selectedRoute, tripLeg) : selectedRoute?.direction, t)}
            </Text>
          </Animated.View>
        }

        {/* ═══════ Calibration ═══════ */}
        {selectedRoute && calibration && stops.length > 0 &&
          <Animated.View
            entering={FadeInDown.delay(120).duration(320)}
            style={[s.calibCard, calibration.is_calibrated && s.calibCardDone]}>
            <View style={[s.calibIcon, calibration.is_calibrated && s.calibIconDone]}>
              <Ionicons
                name={calibration.is_calibrated ? 'checkmark-circle' : 'compass-outline'}
                size={20}
                color={calibration.is_calibrated ? GREEN : '#B45309'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.calibTitle, calibration.is_calibrated && { color: '#065F46' }]}>
                {calibration.is_calibrated
                  ? t('driver_ui.route_calibrated', 'Route calibrated')
                  : `${t('driver_ui.calibrating_route', 'Calibrating route')} · ${t('driver_ui.trip_of', {
                    current: Math.min(
                      calibration.clean_trip_count + 1,
                      calibration.required_clean_trip_count || 4,
                    ),
                    total: calibration.required_clean_trip_count || 4,
                  })}`}
              </Text>
              <Text style={[s.calibSub, calibration.is_calibrated && { color: '#047857' }]}>
                {calibration.is_calibrated
                  ? t('driver_ui.calibrated_sub', 'Stop locations and timings learned from your trips')
                  : t('driver_ui.calibrating_sub', 'Mark each stop on arrival — GPS learns stop locations and timings')}
              </Text>
            </View>
          </Animated.View>
        }

        {/* ═══════ Stop List ═══════ */}
        {stops.length > 0 &&
          <Animated.View entering={FadeInUp.delay(140).duration(360)}>
            <View style={s.secHeader}>
              <View style={[s.secIconBox, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="list" size={15} color={GREEN} />
              </View>
              <Text style={s.secTitle}>{isTracking ? t('driver_ui.stop_execution', 'Stop Execution') : t('driver_ui.route_stops', 'Route Stops')}</Text>
            </View>
            {stops.map((stop, idx) => {
              const cfg = STATUS_CONFIG[stop.status];
              const isCurrent = currentStop?.stop_id === stop.stop_id;
              const isLast = idx === stops.length - 1;

              return (
                <Animated.View
                  key={stop.stop_id}
                  entering={FadeInDown.delay(160 + idx * 40).duration(300)}
                  style={[s.stopCard, isCurrent && s.stopCardCurrent]}>
                  <View style={s.timeline}>
                    <View style={[s.timelineDot, { backgroundColor: cfg.colorKey === 'textMuted' ? theme.colors.textMuted : theme.colors[cfg.colorKey] }]}>
                      <Ionicons name={cfg.icon as any} size={12} color="#FFF" />
                    </View>
                    {!isLast && <View style={[s.timelineLine, {
                      backgroundColor: stop.status === 'completed' ? GREEN : '#E2E8F0'
                    }]} />}
                  </View>
                  <View style={s.stopContent}>
                    <View style={s.stopTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.stopOrder}>{t('driver_ui.stop', 'Stop')} {stop.stop_order}</Text>
                        <Text style={s.stopName}>{stop.stop_name}</Text>
                      </View>
                      <View style={[s.stopBadge, { backgroundColor: cfg.bg }]}>
                        <Text style={[s.stopBadgeText, { color: cfg.colorKey === 'textMuted' ? theme.colors.textMuted : theme.colors[cfg.colorKey] }]}>{t(`driver_ui.${stop.status}`, cfg.label)}</Text>
                      </View>
                    </View>
                    {stop.student_count > 0 &&
                      <View style={s.studentRow}>
                        <Ionicons name="people" size={13} color="#64748B" />
                        <Text style={s.studentText}>{t('driver_ui.student_count', { count: stop.student_count })}</Text>
                      </View>
                    }
                    {isTracking && isCurrent &&
                      <View style={s.stopActions}>
                        {stop.status === 'pending' &&
                          <>
                            <TouchableOpacity
                              style={[s.stopBtn, s.stopBtnArrive]}
                              onPress={() => handleArriveStop(stop.stop_id)}
                              disabled={actionLoading || !tripControlsEnabled}>
                              <Ionicons name="location" size={16} color="#B45309" />
                              <Text style={[s.stopBtnText, { color: '#B45309' }]}>{t('driver_ui.arrive', 'Arrive')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.stopBtn, s.stopBtnSkip]}
                              onPress={() => handleSkipStop(stop.stop_id)}
                              disabled={actionLoading || !tripControlsEnabled}>
                              <Ionicons name="close-circle-outline" size={16} color={RED} />
                              <Text style={[s.stopBtnText, { color: RED }]}>{t('driver_ui.skip', 'Skip')}</Text>
                            </TouchableOpacity>
                          </>
                        }
                        {stop.status === 'arrived' &&
                          <TouchableOpacity
                            style={[s.stopBtn, s.stopBtnDone, { flex: 1 }]}
                            onPress={() => handleCompleteStop(stop.stop_id)}
                            disabled={actionLoading || !tripControlsEnabled}>
                            <Ionicons name="checkmark-circle" size={16} color="#047857" />
                            <Text style={[s.stopBtnText, { color: '#047857' }]}>{t('driver_ui.complete_stop', 'Complete Stop')}</Text>
                          </TouchableOpacity>
                        }
                      </View>
                    }
                  </View>
                </Animated.View>
              );
            })}
          </Animated.View>
        }

        {/* ═══════ Trip Control ═══════ */}
        {selectedBus &&
          <Animated.View entering={FadeInUp.delay(200).duration(360)} style={s.controlSection}>
            {!isTracking ?
              <TouchableOpacity
                style={[s.startWrap, (!selectedRoute || actionLoading || !tripControlsEnabled) && { opacity: 0.55 }]}
                onPress={handleStartTrip}
                activeOpacity={0.85}
                disabled={actionLoading || !selectedRoute || !tripControlsEnabled}>
                <LinearGradient colors={PRIMARY_GRADIENT} style={s.startGrad}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {actionLoading ?
                    <LogoLoader color="#FFF" /> :
                    <>
                      <Ionicons name="play" size={22} color="#FFF" />
                      <Text style={s.ctrlText}>{t('driver_ui.start_trip', 'START TRIP').toUpperCase()}</Text>
                    </>
                  }
                </LinearGradient>
              </TouchableOpacity> :
              <TouchableOpacity style={s.endBtn} onPress={handleEndTrip} activeOpacity={0.85} disabled={actionLoading || !tripControlsEnabled}>
                {actionLoading ? <LogoLoader color="#FFF" /> :
                  <>
                    <Ionicons name="stop" size={22} color="#FFF" />
                    <Text style={s.ctrlText}>{t('driver_ui.end_trip', 'END TRIP').toUpperCase()}</Text>
                  </>
                }
              </TouchableOpacity>
            }
          </Animated.View>
        }
        <View style={{ height: 110 }} />
      </ScrollView>
      {disclosureModal}
    </ScreenLayout>);

}

/* ════════════════════════════ STYLES ════════════════════════════ */
const getStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },

  identityBlock: { marginBottom: 14 },
  dateEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  greetingLine: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  greetingName: { color: theme.colors.primary, fontWeight: '800' },
  identityCard: { marginBottom: 2 },

  /* Hero */
  heroWrap: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 18,
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.primaryDark,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.28,
        shadowRadius: 18,
      },
      android: { elevation: 5 },
      default: {
        shadowColor: theme.colors.primaryDark,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 16,
      },
    }),
  },
  hero: { padding: 18, overflow: 'hidden' },
  heroDecor: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  heroDutyRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  heroGreet: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  heroName: { color: '#FFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  heroRoute: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '600', marginTop: 4 },
  heroBusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    minWidth: 56, justifyContent: 'center',
  },
  heroBusText: { color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroStat: { flex: 1, alignItems: 'center', gap: 2 },
  heroStatValue: { color: '#FFF', fontSize: 17, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 },
  heroStatLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
  heroStatDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.16)' },
  nextStopRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.18)',
  },
  nextStopText: { flex: 1, color: '#FEF3C7', fontSize: 13, fontWeight: '700' },

  pauseAlert: {
    marginBottom: 16, padding: 14, borderRadius: 14,
    backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#FECDD3',
  },
  pauseAlertTitle: { color: '#9F1239', fontWeight: '800', fontSize: 14 },
  pauseAlertBody: { color: '#9F1239', marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: '500' },

  /* Empty */
  emptyCard: {
    alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24,
    backgroundColor: theme.colors.surface,
    borderRadius: 24, marginBottom: 18,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.borderLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 4 },
  emptySub: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },

  /* Sections */
  secHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  secIconBox: {
    width: 34, height: 34, borderRadius: 12,
    backgroundColor: theme.colors.primaryLight + '22',
    justifyContent: 'center', alignItems: 'center',
  },
  secTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.textPrimary, letterSpacing: -0.3 },

  /* Route selector */
  routeGrid: { gap: 10, marginBottom: 18 },
  routeCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.surface, paddingHorizontal: 16, paddingVertical: 16,
    borderRadius: 18, minHeight: 56,
    borderWidth: 1.5, borderColor: theme.colors.border,
  },
  routeCardActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  routeCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  routeCardTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.textPrimary },
  routeCardMeta: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '600', marginTop: 2, textTransform: 'capitalize' },
  legRow: { flexDirection: 'row', gap: 10, marginBottom: 18, marginTop: -6 },
  legChip: {
    flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center', minHeight: 48,
    backgroundColor: theme.colors.surface, borderWidth: 1.5, borderColor: theme.colors.border,
  },
  legChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primaryDark },
  legChipText: { fontSize: 13, fontWeight: '800', color: theme.colors.textSecondary },

  /* Progress */
  calibCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 16, padding: 14, marginBottom: 14,
  },
  calibCardDone: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  calibIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center',
  },
  calibIconDone: { backgroundColor: '#D1FAE5' },
  calibTitle: { fontSize: 14, fontWeight: '800', color: '#92400E' },
  calibSub: { fontSize: 12, color: '#B45309', marginTop: 3, fontWeight: '500', lineHeight: 16 },
  progressCard: {
    backgroundColor: theme.colors.surface, borderRadius: 20, padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' },
  progressTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.textPrimary },
  progressCount: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  progressBarBg: { height: 10, backgroundColor: theme.colors.borderLight, borderRadius: 6, overflow: 'hidden', marginBottom: 10 },
  progressBarFill: { height: '100%', backgroundColor: theme.colors.success, borderRadius: 6 },
  progressRoute: { fontSize: 13, color: theme.colors.textMuted, fontWeight: '600' },

  /* Stop Cards */
  stopCard: {
    flexDirection: 'row', marginBottom: 6, padding: 4,
    backgroundColor: 'transparent', borderRadius: 18
  },
  stopCardCurrent: {
    backgroundColor: theme.colors.surface, borderRadius: 20, padding: 12,
    borderWidth: 1.5, borderColor: theme.colors.primaryLight + '55',
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  timeline: { width: 36, alignItems: 'center', marginRight: 10 },
  timelineDot: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  timelineLine: { width: 3, flex: 1, marginVertical: 4, borderRadius: 1.5 },
  stopContent: { flex: 1, paddingBottom: 14 },
  stopTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  stopOrder: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  stopName: { fontSize: 16, fontWeight: '800', color: theme.colors.textPrimary, letterSpacing: -0.2 },
  stopBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, alignSelf: 'flex-start' },
  stopBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  studentText: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },
  stopActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, gap: 6, flex: 1, minHeight: 48,
  },
  stopBtnArrive: { backgroundColor: '#FEF3C7' },
  stopBtnSkip: { backgroundColor: '#FEE2E2' },
  stopBtnDone: { backgroundColor: '#D1FAE5' },
  stopBtnText: { fontSize: 14, fontWeight: '800' },

  /* Control */
  controlSection: { marginTop: 8, marginBottom: 8 },
  startWrap: {
    borderRadius: 22, overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.32,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  startGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 58, gap: 10, borderRadius: 22
  },
  endBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 58, borderRadius: 22, backgroundColor: theme.colors.danger, gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.danger,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  ctrlText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 1.2 }
});
