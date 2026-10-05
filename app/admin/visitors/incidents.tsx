import { TourTarget } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService } from '@/src/services/visitorService';

export default function AdminIncidentsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [rows, setRows] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try { setRows(await visitorService.getIncidents()); } finally { setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const bg = isDark ? '#0B0F17' : '#F8FAFC';
  const card = isDark ? '#161E2E' : '#FFFFFF';
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const sub = isDark ? '#94A3B8' : '#64748B';
  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <TourTarget id="screen.admin-visitors-incidents.overview" native><View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={text} /></TouchableOpacity>
        <Text style={[styles.title, { color: text }]}>Security Incidents</Text>
      </View></TourTarget>
      <TourTarget id="screen.admin-visitors-incidents.workspace" native><FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: card }]}>
            <Text style={{ color: text, fontWeight: '800' }}>{item.incident_type} · {item.severity}</Text>
            <Text style={{ color: sub }}>{item.description}</Text>
            <Text style={{ color: sub }}>{item.resolution_status}</Text>
          </View>
        )}
      /></TourTarget>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  title: { fontSize: 20, fontWeight: '800' },
  card: { padding: 14, borderRadius: 12 },
});
