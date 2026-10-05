import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/hooks/useTheme';
import { eventService, type EventItem } from '@/src/services/eventService';

export default function StaffEventsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await eventService.listEvents();
      setEvents(res.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const bg = isDark ? '#090D16' : '#F8FAFC';
  const cardBg = isDark ? '#111827' : '#FFFFFF';
  const textCol = isDark ? '#F9FAFB' : '#0F172A';
  const subCol = isDark ? '#9CA3AF' : '#64748B';

  return (
    <TourTarget id="screen.staff-events.workspace" style={{ flex: 1 }}><SafeAreaView style={[styles.root, { backgroundColor: bg }]} edges={['top']}>
      <TourTarget id="screen.staff-events.overview" native><View style={styles.header}>
        <Text style={[styles.title, { color: textCol }]}>Event Operations</Text>
      </View></TourTarget>
      {loading ? <ActivityIndicator color="#4F46E5" /> : (
        <TourScrollView refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
          {events.map((ev) => (
            <View key={ev.id} style={[styles.card, { backgroundColor: cardBg }]}>
              <Text style={[styles.cardTitle, { color: textCol }]}>{ev.title}</Text>
              <Text style={[styles.meta, { color: subCol }]}>{ev.start_date} • {ev.status} • Ready {ev.readiness_score || 0}%</Text>
              <View style={styles.row}>
                <TouchableOpacity style={styles.chip} onPress={() => router.push(`/admin/events/${ev.id}/scanner` as any)}>
                  <Ionicons name="scan" size={14} color="#FFF" />
                  <Text style={styles.chipText}>Attendance scan</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.chip, { backgroundColor: '#334155' }]} onPress={() => router.push(`/admin/events/${ev.id}` as any)}>
                  <Text style={styles.chipText}>Command center</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </TourScrollView>
      )}
    </SafeAreaView></TourTarget>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { padding: 16 },
  title: { fontSize: 22, fontWeight: '800' },
  card: { margin: 16, marginTop: 0, padding: 16, borderRadius: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  meta: { marginTop: 6 },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chip: { backgroundColor: '#4F46E5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { color: '#FFF', fontWeight: '700' },
});
