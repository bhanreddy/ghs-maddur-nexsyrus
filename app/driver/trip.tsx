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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { api } from '../../src/services/apiClient';
import LogoLoader from '../../src/components/LogoLoader';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { useTheme } from '../../src/hooks/useTheme';

/** Legacy trips may still use `active`; canonical live status is `in_progress`. */
const tripStatusIsActive = (s?: string | null) =>
  s === 'in_progress' || s === 'active';

type TripPayload = {
  trip: {
    id: string;
    status: string;
    started_at?: string | null;
    completed_at?: string | null;
    route_name?: string;
    direction?: string;
    date?: string;
  };
  stops: Array<{
    stop_id: string;
    stop_name: string;
    stop_order: number;
    status?: string;
    reached_at?: string | null;
    assigned_students?: number;
  }>;
};

export default function DriverTripScreen() {
  const [payload, setPayload] = useState<TripPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [noRoute, setNoRoute] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { theme } = useTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const loadTrip = useCallback(async (silent?: boolean) => {
    try {
      if (!silent) setLoading(true);
      const data = await api.get<TripPayload>('/transport/driver/my-trip');
      setPayload(data);
      setNoRoute(false);
    } catch (e: any) {
      const code = e?.statusCode ?? e?.status;
      const msg = e?.message || '';
      if (code === 404 || msg.includes('No route')) {
        setNoRoute(true);
        setPayload(null);
      } else {
        alertCompat('Error', msg || 'Could not load trip');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTrip();
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [loadTrip]),
  );

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    const st = payload?.trip?.status;
    if (tripStatusIsActive(st)) {
      pollRef.current = setInterval(() => loadTrip(true), 30000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [payload?.trip?.status, loadTrip]);

  const trip = payload?.trip;
  const stops = payload?.stops ?? [];

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
            ? { ...s, status: 'reached', reached_at: new Date().toISOString() }
            : s,
        ),
      });
    }
    try {
      await api.post(`/transport/driver/trip/${trip.id}/stop/${stopId}/reach`, {});
      alertCompat('Updated', 'Stop marked — notifications sent');
    } catch (e: any) {
      if (prev) setPayload(prev);
      alertCompat('Error', e?.message || 'Could not mark stop');
    } finally {
      setSubmitting(false);
    }
  };

  const startTrip = async () => {
    if (!trip?.id || submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/transport/driver/trip/${trip.id}/start`, {});
      await loadTrip(true);
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Could not start trip');
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
      await loadTrip(true);
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Could not complete trip');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBanner = () => {
    const s = trip?.status || 'scheduled';
    const label =
      s === 'completed'
        ? 'Completed'
        : tripStatusIsActive(s)
          ? 'In Progress'
          : 'Not Started';
    const bg =
      s === 'completed' ? '#E5E7EB' : tripStatusIsActive(s) ? '#DBEAFE' : '#F3F4F6';
    const fg =
      s === 'completed' ? '#374151' : tripStatusIsActive(s) ? '#1D4ED8' : '#6B7280';
    return (
      <View style={[styles.banner, { backgroundColor: bg }]}>
        <Text style={[styles.bannerText, { color: fg }]}>{label}</Text>
      </View>
    );
  };

  if (loading && !payload) {
    return (
      <ScreenLayout>
        <StudentHeader title="My Trip" menuUserType="driver" />
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
        <StudentHeader title="My Trip" menuUserType="driver" />
        <View style={styles.center}>
          <Ionicons name="bus-outline" size={56} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>No route assigned</Text>
          <Text style={styles.emptySub}>Contact your school admin.</Text>
          <TouchableOpacity style={styles.retry} onPress={() => loadTrip()}>
            <Text style={styles.retryText}>Retry</Text>
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
        title={
          trip?.date && trip?.route_name
            ? `${trip.route_name} · ${trip.date}`
            : trip?.route_name || 'My Trip'
        }
      />
      {statusBanner()}
      <View style={styles.actions}>
        {trip?.status === 'scheduled' && (
          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.btnDisabled]}
            onPress={startTrip}
            disabled={submitting}
          >
            <Text style={styles.primaryBtnText}>Start Trip</Text>
          </TouchableOpacity>
        )}
        {tripStatusIsActive(trip?.status) && (
          <TouchableOpacity
            style={[styles.secondaryBtn, submitting && styles.btnDisabled]}
            onPress={() => setConfirmComplete(true)}
            disabled={submitting}
          >
            <Text style={styles.secondaryBtnText}>Complete Trip</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={stops}
        keyExtractor={(item) => item.stop_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const done = item.status === 'reached' || item.status === 'completed';
          return (
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                <Ionicons
                  name={done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={done ? theme.colors.success : '#94A3B8'}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopName}>{item.stop_name}</Text>
                  <Text style={styles.meta}>
                    {item.assigned_students ?? 0} student(s)
                    {item.reached_at
                      ? ` · ${new Date(item.reached_at).toLocaleTimeString()}`
                      : ''}
                  </Text>
                </View>
              </View>
              {tripStatusIsActive(trip?.status) && !done && (
                <TouchableOpacity
                  style={styles.markBtn}
                  onPress={() => markReached(item.stop_id)}
                  disabled={submitting}
                >
                  <Text style={styles.markBtnText}>Mark reached</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptySub}>No stops on this route.</Text>}
      />

      <Modal transparent visible={confirmComplete} animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setConfirmComplete(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Complete this trip?</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setConfirmComplete(false)}
              >
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalOk} onPress={completeTrip}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenLayout>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  banner: { marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 16 },
  bannerText: { fontWeight: '800', textAlign: 'center', fontSize: 15 },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginVertical: 16 },
  primaryBtn: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 6
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#EEF2FF',
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 2
  },
  secondaryBtnText: { color: theme.colors.primary, fontWeight: '800', fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 20,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#94A3B8', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 2,
    borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.6)'
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  stopName: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
  meta: { fontSize: 13, color: '#64748B', marginTop: 4, fontWeight: '500' },
  markBtn: {
    backgroundColor: '#FDF2F8',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  markBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 13 },
  emptyTitle: { fontSize: 20, fontWeight: '800', marginTop: 16, color: '#1E293B', letterSpacing: -0.3 },
  emptySub: { fontSize: 15, color: '#64748B', marginTop: 8, textAlign: 'center', fontWeight: '500' },
  retry: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4
  },
  retryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.15, shadowRadius: 32, elevation: 12
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 20, color: '#1E293B' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 14 },
  modalCancel: { padding: 14, paddingHorizontal: 20 },
  modalOk: { backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16 },
});
