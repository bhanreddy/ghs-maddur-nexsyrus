import { TourTarget } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from '@/src/utils/haptics';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService, type VisitorRequest } from '@/src/services/visitorService';

export default function ExpectedVisitorsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [rows, setRows] = useState<VisitorRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await visitorService.getExpectedVisitors());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const bg = isDark ? '#0B0F17' : '#F4F6F9';
  const card = isDark ? '#161E2E' : '#FFFFFF';
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const sub = isDark ? '#94A3B8' : '#64748B';

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <TourTarget id="screen.gatekeeper-expected.overview" native><View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={text} /></TouchableOpacity>
        <Text style={[styles.title, { color: text }]}>Expected Today</Text>
      </View></TourTarget>
      <TourTarget id="screen.gatekeeper-expected.workspace" native><FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={<Text style={{ color: sub, textAlign: 'center', marginTop: 40 }}>No approved visitors remaining today.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: card }]}
            onPress={() => {
              Haptics.selectionAsync();
              router.push({ pathname: '/gatekeeper/verify', params: { token: item.pass_code || item.id } } as any);
            }}
          >
            <Text style={[styles.name, { color: text }]}>{item.visitor_name}</Text>
            <Text style={{ color: sub }}>{item.purpose}</Text>
            <Text style={{ color: '#10B981', fontWeight: '700' }}>{item.start_time} – {item.end_time}</Text>
          </TouchableOpacity>
        )}
      /></TourTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  title: { fontSize: 20, fontWeight: '800' },
  card: { padding: 16, borderRadius: 16 },
  name: { fontSize: 16, fontWeight: '800' },
});
