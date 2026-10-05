import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/src/hooks/useTheme';
import { eventService, type EventItem } from '@/src/services/eventService';

export default function AccountsEventCollectionsScreen() {
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
  const textCol = isDark ? '#F9FAFB' : '#0F172A';
  const subCol = isDark ? '#9CA3AF' : '#64748B';

  return (
    <TourTarget id="screen.accounts-event-collections.workspace" style={{ flex: 1 }}><SafeAreaView style={[styles.root, { backgroundColor: bg }]} edges={['top']}>
      <TourTarget id="screen.accounts-event-collections.overview" native><Text style={[styles.title, { color: textCol }]}>Event collections</Text></TourTarget>
      <Text style={[styles.sub, { color: subCol }]}>Fee, waiver and expense records stay on the event ledger — not tuition.</Text>
      {loading ? <ActivityIndicator color="#4F46E5" /> : (
        <TourScrollView>
          {events.map((ev) => (
            <View key={ev.id} style={styles.card}>
              <Text style={[styles.cardTitle, { color: textCol }]}>{ev.title}</Text>
              <Text style={{ color: subCol }}>{ev.status} • {ev.start_date}</Text>
            </View>
          ))}
        </TourScrollView>
      )}
    </SafeAreaView></TourTarget>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '800' },
  sub: { marginTop: 6, marginBottom: 16 },
  card: { padding: 16, borderRadius: 16, backgroundColor: '#11182722', marginBottom: 12 },
  cardTitle: { fontWeight: '700', fontSize: 16 },
});
