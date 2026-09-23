import { useTransportPolling } from '../../src/hooks/useTransportPolling';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import AdminHeader from '../../src/components/AdminHeader';
import LiveBusMap, { LiveStop } from '../../src/components/LiveBusMap';
import LiveRouteTracker from '../../src/components/LiveRouteTracker';
import LogoLoader from '../../src/components/LogoLoader';
import { api } from '../../src/services/apiClient';
import { useTheme } from '../../src/hooks/useTheme';

type Location = {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  recorded_at: string;
  age_seconds: number;
  is_fresh: boolean;
};

type LiveRoute = {
  route: string;
  trip: { id: string; ui_status?: string; status?: string; driver_name?: string | null } | null;
  stops: LiveStop[];
  location: Location | null;
  tracking_health?: { automatic_stops_enabled: boolean; pending_notifications: number; failed_notifications: number; oldest_pending_seconds: number | null } | null;
};

const LIVE_POLL_MS = 5_000;

/** School-admin live GPS view. Data is server-authorized and never reads GPS directly. */
export default function AdminLiveBusTracking() {
  const { routeId } = useLocalSearchParams<{ routeId?: string }>();
  const { theme } = useTheme();
  const [data, setData] = useState<LiveRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const load = useCallback(async (silent = false) => {
    if (!routeId) { setLoading(false); setError('Choose a route to view tracking'); return; }
    if (!silent) setLoading(true);
    try {
      const result = await api.get<LiveRoute>(`/transport/routes/${routeId}/live`, undefined, { silent: true });
      setData(result);
      setError(null);
    } catch {
      setError('Connection interrupted. Showing the last received information.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [routeId]);

  useTransportPolling(() => load(true), LIVE_POLL_MS);

  const onRefresh = () => {
    setRefreshing(true);
    void load(true);
  };

  const status = data?.trip?.ui_status || data?.trip?.status;
  const isLive = status === 'in_progress' || status === 'active';
  const age = data?.location ? Math.max(0, (now - Date.parse(data.location.recorded_at)) / 1000) : null;
  const location = data?.location ? { ...data.location, age_seconds: age ?? 0, is_fresh: isLive && age != null && age <= 120 } : null;

  return (
    <View style={[s.page, { backgroundColor: theme.colors.background }]}> 
      <AdminHeader title="Live bus tracking" showBackButton />
      {error && <Text accessibilityLiveRegion="polite" style={{ padding: 12, color: '#92400E' }}>{error}</Text>}
      {loading && !data ? (
        <View style={s.loader}><LogoLoader size={52} color={theme.colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        >
          <View style={[s.hero, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderLight }]}> 
            <View style={[s.icon, { backgroundColor: isLive ? '#DCFCE7' : '#E2E8F0' }]}> 
              <Ionicons name={isLive ? 'navigate' : 'pause-circle-outline'} size={22} color={isLive ? '#059669' : '#64748B'} />
            </View>
            <View style={s.heroText}>
              <Text style={[s.route, { color: theme.colors.textStrong }]}>{data?.route || 'Route'}</Text>
              <Text style={[s.sub, { color: theme.colors.textSecondary }]}>
                {isLive ? `Live trip · ${data?.trip?.driver_name || 'Driver'}` : 'No active trip'}
              </Text>
            </View>
            <View style={[s.badge, { backgroundColor: isLive && location?.is_fresh ? '#DCFCE7' : '#FEF3C7' }]}> 
              <View style={[s.dot, { backgroundColor: isLive && location?.is_fresh ? '#10B981' : '#F59E0B' }]} />
              <Text style={[s.badgeText, { color: isLive && location?.is_fresh ? '#047857' : '#92400E' }]}>
                {isLive && location?.is_fresh ? 'LIVE' : location ? 'LAST FIX' : 'WAITING'}
              </Text>
            </View>
          </View>

          {isLive && data?.tracking_health && <View style={{ padding: 12 }}>
            <Text style={{ color: theme.colors.textSecondary }}>{data.tracking_health.automatic_stops_enabled ? 'Automatic stop updates enabled' : 'Driver confirmations required while the route is being calibrated'}</Text>
            {(data.tracking_health.failed_notifications > 0 || (data.tracking_health.oldest_pending_seconds || 0) > 120) &&
              <Text style={{ color: '#92400E', paddingTop: 6 }}>Notification delivery needs attention: {data.tracking_health.pending_notifications} pending, {data.tracking_health.failed_notifications} failed.</Text>}
          </View>}
          {Platform.OS === 'web' ? (
            <LiveRouteTracker
              stops={data?.stops || []}
              bus={location ? { latitude: Number(location.latitude), longitude: Number(location.longitude), heading: location.heading } : null}
              isFresh={location?.is_fresh}
              height={340}
            />
          ) : (
            <LiveBusMap
              stops={data?.stops || []}
              busLocation={location ? { latitude: Number(location.latitude), longitude: Number(location.longitude) } : null}
              heading={location?.heading}
              speed={location?.speed}
              isFresh={location?.is_fresh}
              height={340}
            />
          )}

          <View style={[s.info, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderLight }]}> 
            <View>
              <Text style={[s.infoLabel, { color: theme.colors.textSecondary }]}>Last GPS update</Text>
              <Text style={[s.infoValue, { color: theme.colors.textStrong }]}>
                {location ? `${Math.max(0, Math.round(location.age_seconds))} sec ago` : 'No location received'}
              </Text>
            </View>
            <TouchableOpacity style={[s.refresh, { backgroundColor: theme.colors.primary }]} onPress={() => void load(true)} activeOpacity={0.85}>
              <Ionicons name="refresh" size={17} color="#FFFFFF" />
              <Text style={s.refreshText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          <Text style={[s.note, { color: theme.colors.textSecondary }]}>The map refreshes every 5 seconds while this screen is open. Automatic stop updates are driven by the same live GPS feed.</Text>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  hero: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 18, padding: 14, gap: 11 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1 },
  route: { fontSize: 16, fontWeight: '800' },
  sub: { marginTop: 2, fontSize: 12, fontWeight: '600' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  info: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 16, borderWidth: 1 },
  infoLabel: { fontSize: 12, fontWeight: '600' },
  infoValue: { marginTop: 3, fontSize: 14, fontWeight: '800' },
  refresh: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  refreshText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  note: { fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
});
