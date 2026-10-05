import { TourTarget } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService } from '@/src/services/visitorService';

export default function ContractorsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [rows, setRows] = useState<any[]>([]);
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await visitorService.getContractors());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!fullName.trim() || !mobileNumber.trim() || !companyName.trim()) {
      Alert.alert('Required', 'Name, mobile and company are required.');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const until = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    try {
      await visitorService.createContractor({
        fullName, mobileNumber, companyName, validFrom: today, validUntil: until,
      });
      setFullName('');
      setMobileNumber('');
      setCompanyName('');
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not create contractor pass');
    }
  };

  const bg = isDark ? '#0B0F17' : '#F4F6F9';
  const card = isDark ? '#161E2E' : '#FFFFFF';
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const sub = isDark ? '#94A3B8' : '#64748B';

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <TourTarget id="screen.gatekeeper-contractors.overview" native><View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={text} /></TouchableOpacity>
        <Text style={[styles.title, { color: text }]}>Contractors</Text>
      </View></TourTarget>
      <View style={[styles.form, { backgroundColor: card }]}>
        <TextInput value={fullName} onChangeText={setFullName} placeholder="Technician name" placeholderTextColor={sub} style={[styles.input, { color: text }]} />
        <TextInput value={mobileNumber} onChangeText={setMobileNumber} placeholder="Mobile" placeholderTextColor={sub} keyboardType="phone-pad" style={[styles.input, { color: text }]} />
        <TextInput value={companyName} onChangeText={setCompanyName} placeholder="Company" placeholderTextColor={sub} style={[styles.input, { color: text }]} />
        <TouchableOpacity style={styles.cta} onPress={create}><Text style={styles.ctaText}>Issue 30-day pass</Text></TouchableOpacity>
      </View>
      <TourTarget id="screen.gatekeeper-contractors.workspace" native><FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: card }]}>
            <Text style={{ color: text, fontWeight: '800' }}>{item.full_name}</Text>
            <Text style={{ color: sub }}>{item.company_name} · {item.pass_code || 'No pass'}</Text>
            <Text style={{ color: sub }}>{item.valid_from} → {item.valid_until}</Text>
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
  form: { marginHorizontal: 16, padding: 16, borderRadius: 16, gap: 8 },
  input: { borderBottomWidth: 1, borderBottomColor: '#334155', paddingVertical: 8 },
  cta: { backgroundColor: '#0F766E', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: '800' },
  card: { padding: 14, borderRadius: 12 },
});
