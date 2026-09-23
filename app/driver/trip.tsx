import * as Crypto from 'expo-crypto';
import DriverTrackingHealth from '../../src/components/DriverTrackingHealth';
import { useTransportPolling } from '../../src/hooks/useTransportPolling';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Pressable,
  StatusBar,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { api } from '../../src/services/apiClient';
import LogoLoader from '../../src/components/LogoLoader';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { useTheme } from '../../src/hooks/useTheme';
import { useDriverLocationPermission } from '../../src/hooks/useDriverLocationPermission';
import { useTranslation } from 'react-i18next';
import { driverDateLocale } from '../../src/utils/driverI18n';
import {
  setDriverNextStopTarget,
  postBusLocation,
  startDriverLocationUpdates,
  stopDriverLocationUpdates,
} from '../../src/services/driverLocationTask';

/** Legacy trips may still use `active`; canonical live status is `in_progress`. */
const tripStatusIsActive = (s?: string | null) =>
  s === 'in_progress' || s === 'active';

/**
 * Best-effort recent GPS fix for calibration capture (Phase A). Native only;
 * returns {} when permission is missing or no recent fix exists — the mark
 * still goes through, it just doesn't contribute a calibration sample.
 */
const calibrationFixBody = async (): Promise<Record<string, unknown>> => {
  if (Platform.OS === 'web') return {};
  try {
    const pos = await Location.getLastKnownPositionAsync({ maxAge: 30_000, requiredAccuracy: 50 });
    if (!pos) return {};
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      is_mocked: pos.mocked || false,
      recorded_at: new Date(pos.timestamp).toISOString(),
    };
  } catch {
    return {};
  }
};

type TripPayload = {
  trip: {
    id: string;
    route_id: string;
    trip_direction?: string;
    status: string;
    started_at?: string | null;
    completed_at?: string | null;
    route_name?: string;
    direction?: string;
    date?: string;
    bus_id?: string | null;
  };
  available_routes?: { route_id: string; route_name: string; direction: string }[];
  stops: {
    stop_id: string;
    stop_name: string;
    stop_order: number;
    status?: string;
    reached_at?: string | null;
    assigned_students?: number;
    latitude?: number | null;
    longitude?: number | null;
  }[];
};

export default function DriverTripScreen() {
  const [payload, setPayload] = useState<TripPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [noRoute, setNoRoute] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmSos, setConfirmSos] = useState(false);
  const [sosSending, setSosSending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const foregroundWatchRef = useRef<Location.LocationSubscription | null>(null);
  const { theme } = useTheme();
  const { requestPermissions: requestDriverLocationPermissions, disclosureModal } = useDriverLocationPermission();
  const { t, i18n } = useTranslation();
  const dateLocale = driverDateLocale(i18n.language);
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const startRequestRef = useRef<{selection:string;id:string}|null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedLeg, setSelectedLeg] = useState<'morning' | 'evening'>('morning');
  const loadTrip = useCallback(async (silent?: boolean) => {
    try {
      if (!silent) setLoading(true);
      const data = await api.get<TripPayload>(`/transport/driver/my-trip?trip_direction=${selectedLeg}${selectedRouteId ? `&route_id=${selectedRouteId}` : ''}`);
      setPayload(data);
      setNoRoute(!data.trip);
    } catch (e: any) {
      const code = e?.statusCode ?? e?.status;
      const msg = e?.message || '';
      if (code === 404 || msg.includes('No route')) {
        setNoRoute(true);
        setPayload(null);
      } else {
        alertCompat(t('driver_ui.error'), t('driver_ui.could_not_load_trip'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t, selectedRouteId, selectedLeg]);

  useTransportPolling(() => loadTrip(true), 10000, `${selectedRouteId}:${selectedLeg}`);

  const trip = payload?.trip;
  const stops = payload?.stops ?? [];

  const stopAllLocationTracking = stopDriverLocationUpdates;
  useEffect(() => {
    if (!trip?.bus_id || !tripStatusIsActive(trip.status)) return;
    void startDriverLocationUpdates(trip.bus_id, trip.id).catch(() => {});
  }, [trip?.id, trip?.status, trip?.bus_id]);

  useEffect(() => {
    if (!tripStatusIsActive(trip?.status)) {
      void setDriverNextStopTarget(null);
      return;
    }
    const next = stops.find((stop) => stop.status !== 'completed' && stop.status !== 'skipped');
    if (next?.latitude == null || next.longitude == null) {
      void setDriverNextStopTarget(null);
      return;
    }
    void setDriverNextStopTarget({
      latitude: Number(next.latitude),
      longitude: Number(next.longitude),
    });
  }, [trip?.status, stops]);

  const onRefresh = () => {
    setRefreshing(true);
    loadTrip(true);
  };

  const markReached = async (stopId: string) => {
    if (!trip?.id || submitting) return;
    setSubmitting(true);
    const prev = payload;
    if (prev) {
      setPayload({
        ...prev,
        stops: prev.stops.map((s) =>
          s.stop_id === stopId
            ? { ...s, status: s.status === 'arrived' ? 'completed' : 'arrived', reached_at: new Date().toISOString() }
            : s,
        ),
      });
    }
    try {
      const fix = await calibrationFixBody();
      const action = prev?.stops.find(s => s.stop_id === stopId)?.status === 'arrived' ? 'complete' : 'arrive';
      await api.post(`/transport/trips/${trip.id}/stops/${stopId}/${action}`, {
        ...fix,
        source: 'manual',
      });
      await loadTrip(true);
    } catch {
      if (prev) setPayload(prev);
      alertCompat(t('driver_ui.error'), t('driver_ui.could_not_mark_stop'));
    } finally {
      setSubmitting(false);
    }
  };

  const startTrip = async () => {
    if (!trip?.id || submitting) return;
    setSubmitting(true);
    try {
      // A trip start is the consent point for precise, background GPS. This
      // keeps calibrated routes marking stops even when the app is minimized.
      let locationGranted = Platform.OS === 'web';
      if (Platform.OS !== 'web') {
        locationGranted = await requestDriverLocationPermissions({ requestBackground: true }).catch(() => false);
      }
      const selection = `${trip.route_id}:${trip.trip_direction}`;
      if (startRequestRef.current?.selection !== selection) startRequestRef.current = { selection, id: Crypto.randomUUID() };
      const started = await api.post<{ trip: { id: string } }>('/transport/trips/start', { request_id: startRequestRef.current.id, route_id: trip.route_id, bus_id: trip.bus_id, trip_direction: trip.trip_direction });
      startRequestRef.current = null;
      if (locationGranted && trip.bus_id && Platform.OS !== 'web') {
        await startDriverLocationUpdates(trip.bus_id, started.trip.id);
      } else if (Platform.OS !== 'web') {
        alertCompat(
          t('driver_ui.location_sharing_paused'),
          t('driver_ui.location_permission_instructions'),
        );
      }
      await loadTrip(true);
    } catch {
      alertCompat(t('driver_ui.error'), t('driver_ui.failed_to_start_trip'));
    } finally {
      setSubmitting(false);
    }
  };

  const completeTrip = async () => {
    if (!trip?.id || submitting) return;
    setSubmitting(true);
    setConfirmComplete(false);
    try {
      await api.post(`/transport/driver/trip/${trip.id}/complete`, {});
      await stopAllLocationTracking();
      await loadTrip(true);
    } catch {
      alertCompat(t('driver_ui.error'), t('driver_ui.could_not_complete_trip'));
    } finally {
      setSubmitting(false);
    }
  };

  const triggerSos = async () => {
    if (!trip?.bus_id || submitting) return;
    setSosSending(true);
    try {
      const fix = await calibrationFixBody();
      await api.post('/transport/sos', {
        bus_id: trip.bus_id,
        trip_id: trip.id,
        lat: (fix as any).latitude ?? null,
        lng: (fix as any).longitude ?? null,
        reason: 'DRIVER_EMERGENCY_SOS',
      });
      setConfirmSos(false);
      alertCompat(
        'SOS received by the server',
        'The emergency has been recorded. Contact the school office or emergency services directly if immediate help is needed.'
      );
    } catch {
      alertCompat('SOS Notification', 'SOS delivery could not be confirmed. Please call the school office or emergency services directly.');
    } finally {
      setSosSending(false);
    }
  };

  const statusBanner = () => {
    const s = trip?.status || 'scheduled';
    const label =
      s === 'completed'
        ? t('driver_ui.completed')
        : tripStatusIsActive(s)
          ? t('driver_ui.in_progress')
          : t('driver_ui.not_started');
    const bg =
      s === 'completed'
        ? theme.colors.borderLight
        : tripStatusIsActive(s)
          ? theme.colors.primary + '18'
          : theme.colors.borderLight;
    const fg =
      s === 'completed'
        ? theme.colors.textSecondary
        : tripStatusIsActive(s)
          ? theme.colors.primaryDark
          : theme.colors.textMuted;
    const icon =
      s === 'completed' ? 'checkmark-circle' : tripStatusIsActive(s) ? 'radio-button-on' : 'time-outline';
    return (
      <View style={[styles.banner, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={18} color={fg} />
        <Text style={[styles.bannerText, { color: fg }]}>{label}</Text>
      </View>
    );
  };

  if (loading && !payload) {
    return (
      <ScreenLayout>
        <StudentHeader title={t('driver_ui.trip')} menuUserType="driver" showBackButton={false} />
        <View style={styles.center}>
          <LogoLoader size={56} color={theme.colors.primary} />
        </View>
      </ScreenLayout>
    );
  }

  if (noRoute) {
    return (
      <ScreenLayout>
        <StatusBar barStyle="dark-content" />
        <StudentHeader title={t('driver_ui.trip')} menuUserType="driver" showBackButton={false} />
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="bus-outline" size={40} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>{t('driver_ui.no_route_assigned')}</Text>
          <Text style={styles.emptySub}>{t('driver_ui.contact_admin_route')}</Text>
          <TouchableOpacity style={styles.retry} onPress={() => loadTrip()} activeOpacity={0.85}>
            <Text style={styles.retryText}>{t('driver_ui.retry')}</Text>
          </TouchableOpacity>
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <StatusBar barStyle="dark-content" />
      <StudentHeader
        menuUserType="driver"
        showBackButton={false}
        title={
          trip?.date && trip?.route_name
            ? `${trip.route_name} · ${new Date(`${trip.date}T12:00:00`).toLocaleDateString(dateLocale)}`
            : trip?.route_name || t('driver_ui.trip')
        }
      />
      {statusBanner()}
      {!tripStatusIsActive(trip?.status) && <View style={{ paddingHorizontal: 16, gap: 8 }}>
        <Text style={{ color: theme.colors.textStrong }}>Choose route and journey</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(payload?.available_routes || []).map(route => <TouchableOpacity key={route.route_id}
            onPress={() => setSelectedRouteId(route.route_id)} style={{ padding: 10, borderWidth: 1, borderRadius: 8,
              borderColor: (selectedRouteId || trip?.route_id) === route.route_id ? theme.colors.primary : theme.colors.borderLight }}>
            <Text style={{ color: theme.colors.textStrong }}>{route.route_name}</Text>
          </TouchableOpacity>)}
        </View>
        {trip?.direction === 'both' && <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['morning','evening'] as const).map(leg => <TouchableOpacity key={leg} onPress={() => setSelectedLeg(leg)}
            style={{ padding: 10, borderWidth: 1, borderRadius: 8, borderColor: selectedLeg === leg ? theme.colors.primary : theme.colors.borderLight }}>
            <Text style={{ color: theme.colors.textStrong }}>{leg === 'morning' ? 'Morning pickup' : 'Evening drop-off'}</Text>
          </TouchableOpacity>)}
        </View>}
      </View>}
      <View style={styles.actions}>
        {(!tripStatusIsActive(trip?.status)) && (
          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.btnDisabled]}
            onPress={startTrip}
            disabled={submitting}
            activeOpacity={0.85}
          >
            <Ionicons name="play" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>{t('driver_ui.start_trip')}</Text>
          </TouchableOpacity>
        )}
        {tripStatusIsActive(trip?.status) && (
          <View style={{ flexDirection: 'row', gap: 10, flex: 1 }}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { flex: 1 }, submitting && styles.btnDisabled]}
              onPress={() => setConfirmComplete(true)}
              disabled={submitting}
              activeOpacity={0.85}
            >
              <Ionicons name="flag" size={18} color={theme.colors.primary} />
              <Text style={styles.secondaryBtnText}>{t('driver_ui.complete_trip')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sosBtn, (submitting || sosSending) && styles.btnDisabled]}
              onPress={() => setConfirmSos(true)}
              disabled={submitting || sosSending}
              activeOpacity={0.85}
              accessibilityLabel="Trigger Emergency SOS"
            >
              <Ionicons name="warning" size={18} color="#FFFFFF" />
              <Text style={styles.sosBtnText}>SOS</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <DriverTrackingHealth />
      <FlatList
        data={stops}
        keyExtractor={(item) => item.stop_id}
        contentContainerStyle={styles.listPad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const done = item.status === 'reached' || item.status === 'completed' || item.status === 'skipped';
          return (
            <View style={[styles.card, done && styles.cardDone]}>
              <View style={styles.cardLeft}>
                <View style={[styles.stopIcon, done && styles.stopIconDone]}>
                  <Ionicons
                    name={done ? 'checkmark' : 'ellipse-outline'}
                    size={18}
                    color={done ? '#FFF' : theme.colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopName}>{item.stop_name}</Text>
                  <Text style={styles.meta}>
                    {t('driver_ui.student_count', { count: item.assigned_students ?? 0 })}
                    {item.reached_at
                      ? ` · ${new Date(item.reached_at).toLocaleTimeString(dateLocale)}`
                      : ''}
                  </Text>
                </View>
              </View>
              {tripStatusIsActive(trip?.status) && !done && stops.find(s => !['completed','skipped'].includes(s.status || 'pending'))?.stop_id === item.stop_id && (
                <TouchableOpacity
                  style={styles.markBtn}
                  onPress={() => markReached(item.stop_id)}
                  disabled={submitting}
                  activeOpacity={0.85}
                >
                  <Text style={styles.markBtnText}>{item.status === 'arrived' ? 'Confirm departure' : t('driver_ui.mark_reached')}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptySub}>{t('driver_ui.no_stops_on_route')}</Text>}
        ListFooterComponent={<View style={{ height: 110 }} />}
      />

      <Modal transparent visible={confirmComplete} animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setConfirmComplete(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t('driver_ui.complete_trip_question')}</Text>
            <Text style={styles.modalSub}>{t('driver_ui.complete_trip_warning')}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setConfirmComplete(false)}
              >
                <Text style={styles.modalCancelText}>{t('driver_ui.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalOk} onPress={completeTrip}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{t('driver_ui.confirm')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Emergency SOS Confirmation Modal */}
      <Modal transparent visible={confirmSos} animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => !sosSending && setConfirmSos(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Ionicons name="warning" size={32} color="#DC2626" />
              </View>
              <Text style={[styles.modalTitle, { color: '#DC2626' }]}>TRIGGER EMERGENCY SOS</Text>
            </View>
            <Text style={styles.modalSub}>
              This will immediately broadcast an urgent emergency alert to the school administration, principal, and transport department with your live vehicle GPS location.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setConfirmSos(false)}
                disabled={sosSending}
              >
                <Text style={styles.modalCancelText}>{t('driver_ui.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalOk, { backgroundColor: '#DC2626' }]}
                onPress={triggerSos}
                disabled={sosSending}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>
                  {sosSending ? 'TRANSMITTING...' : 'YES, SEND SOS'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {disclosureModal}
    </ScreenLayout>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: theme.colors.borderLight,
    alignItems: 'center', justifyContent: 'center',
  },
  banner: {
    marginHorizontal: 16, marginTop: 12, paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  bannerText: { fontWeight: '800', textAlign: 'center', fontSize: 15 },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginVertical: 14 },
  listPad: { paddingBottom: 8 },
  primaryBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 52,
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: theme.colors.primary + '44',
  },
  secondaryBtnText: { color: theme.colors.primary, fontWeight: '800', fontSize: 15 },
  sosBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    minHeight: 52,
  },
  sosBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 1,
  },
  btnDisabled: { opacity: 0.6 },
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 10,
  },
  cardDone: { opacity: 0.72 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  stopIcon: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: theme.colors.borderLight,
    alignItems: 'center', justifyContent: 'center',
  },
  stopIconDone: { backgroundColor: theme.colors.success },
  stopName: { fontSize: 16, fontWeight: '700', color: theme.colors.textPrimary },
  meta: { fontSize: 13, color: theme.colors.textMuted, marginTop: 3, fontWeight: '500' },
  markBtn: {
    backgroundColor: theme.colors.primary + '14',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  markBtnText: { color: theme.colors.primary, fontWeight: '800', fontSize: 13 },
  emptyTitle: { fontSize: 20, fontWeight: '800', marginTop: 16, color: theme.colors.textPrimary, letterSpacing: -0.3 },
  emptySub: { fontSize: 15, color: theme.colors.textMuted, marginTop: 8, textAlign: 'center', fontWeight: '500' },
  retry: {
    marginTop: 20,
    paddingHorizontal: 28,
    paddingVertical: 14,
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    minHeight: 48,
  },
  retryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 22,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8, color: theme.colors.textPrimary },
  modalSub: { fontSize: 14, color: theme.colors.textMuted, marginBottom: 18, lineHeight: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancel: { padding: 14, paddingHorizontal: 18 },
  modalCancelText: { fontWeight: '700', color: theme.colors.textSecondary },
  modalOk: { backgroundColor: theme.colors.primary, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 14, minHeight: 48, justifyContent: 'center' },
});
