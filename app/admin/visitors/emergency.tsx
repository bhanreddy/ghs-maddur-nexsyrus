import { TourTarget } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService } from '@/src/services/visitorService';

export default function AdminEmergencyScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    setData(await visitorService.getEmergencyStatus());
  }, []);
  useEffect(() => { load(); }, [load]);

  const bg = isDark ? '#0B0F17' : '#F8FAFC';
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const sub = isDark ? '#94A3B8' : '#64748B';

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <TourTarget id="screen.admin-visitors-emergency.overview" native><View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={text} /></TouchableOpacity>
        <Text style={[styles.title, { color: text }]}>Emergency Register</Text>
      </View></TourTarget>
      {!data?.isActive ? (
        <TouchableOpacity
          style={styles.activate}
          onPress={() => Alert.alert('Activate emergency?', 'This snapshots everyone currently inside.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Activate', style: 'destructive', onPress: async () => { await visitorService.activateEmergency({ incidentType: 'GENERAL' }); load(); } },
          ])}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>Activate emergency mode</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.activate, { backgroundColor: '#0F766E' }]}
          onPress={async () => { await visitorService.resolveEmergency(data.emergency.id); load(); }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>Resolve emergency</Text>
        </TouchableOpacity>
      )}
      <TourTarget id="screen.admin-visitors-emergency.workspace" native><FlatList
        data={data?.muster || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={{ color: text, fontWeight: '800' }}>{item.person_name}</Text>
            <Text style={{ color: sub }}>{item.person_type} · {item.status} · {item.gate_entered}</Text>
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
  activate: { marginHorizontal: 16, backgroundColor: '#B91C1C', borderRadius: 12, padding: 14, alignItems: 'center' },
  card: { backgroundColor: '#161E2E', padding: 14, borderRadius: 12 },
});
