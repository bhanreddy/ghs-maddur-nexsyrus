import { TourTarget } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService } from '@/src/services/visitorService';

export default function VehicleEntryScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [rows, setRows] = useState<any[]>([]);
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('CAR');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await visitorService.getVehicles(true));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const logEntry = async () => {
    if (!registrationNumber.trim()) {
      Alert.alert('Required', 'Enter the vehicle registration number.');
      return;
    }
    try {
      await visitorService.recordVehicle({ registrationNumber, vehicleType });
      setRegistrationNumber('');
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not log vehicle');
    }
  };

  const bg = isDark ? '#0B0F17' : '#F4F6F9';
  const card = isDark ? '#161E2E' : '#FFFFFF';
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const sub = isDark ? '#94A3B8' : '#64748B';

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <TourTarget id="screen.gatekeeper-vehicles.overview" native><View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={text} /></TouchableOpacity>
        <Text style={[styles.title, { color: text }]}>Vehicle Entry</Text>
      </View></TourTarget>
      <View style={[styles.form, { backgroundColor: card }]}>
        <TextInput value={registrationNumber} onChangeText={setRegistrationNumber} autoCapitalize="characters" placeholder="KA-01-AB-1234" placeholderTextColor={sub} style={[styles.input, { color: text }]} />
        <View style={styles.types}>
          {['BIKE', 'CAR', 'AUTO', 'VAN', 'DELIVERY', 'OTHER'].map((t) => (
            <TouchableOpacity key={t} onPress={() => setVehicleType(t)} style={[styles.chip, vehicleType === t && styles.chipOn]}>
              <Text style={{ color: vehicleType === t ? '#fff' : sub, fontWeight: '700' }}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.cta} onPress={logEntry}><Text style={styles.ctaText}>Log vehicle in</Text></TouchableOpacity>
      </View>
      <TourTarget id="screen.gatekeeper-vehicles.workspace" native><FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: card }]}>
            <Text style={{ color: text, fontWeight: '800' }}>{item.registration_number}</Text>
            <Text style={{ color: sub }}>{item.vehicle_type} · {item.visitor_name || 'Unlinked'}</Text>
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
  form: { marginHorizontal: 16, padding: 16, borderRadius: 16, gap: 10 },
  input: { borderBottomWidth: 1, borderBottomColor: '#334155', paddingVertical: 8, fontSize: 18, fontWeight: '800' },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(148,163,184,0.15)' },
  chipOn: { backgroundColor: '#0F766E' },
  cta: { backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: '800' },
  card: { padding: 14, borderRadius: 12 },
});
