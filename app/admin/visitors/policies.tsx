import { TourTarget } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService } from '@/src/services/visitorService';

const CATEGORIES = ['PARENT', 'VENDOR', 'CONTRACTOR', 'DELIVERY', 'GUEST'];
const POLICIES = ['AUTO_APPROVE', 'HOST_APPROVAL', 'ADMIN_APPROVAL', 'GATEKEEPER_APPROVAL'];

export default function ApprovalPoliciesScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [policies, setPolicies] = useState<any[]>([]);

  const load = useCallback(async () => {
    const res = await visitorService.getSettings();
    setPolicies(res.policies || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const bg = isDark ? '#0B0F17' : '#F8FAFC';
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const sub = isDark ? '#94A3B8' : '#64748B';

  const current = (cat: string) => policies.find((p) => p.category === cat)?.policy_type || 'HOST_APPROVAL';

  return (
    <TourTarget id="screen.admin-visitors-policies.workspace" native><View style={[styles.root, { backgroundColor: bg }]}>
      <TourTarget id="screen.admin-visitors-policies.overview" native><View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={text} /></TouchableOpacity>
        <Text style={[styles.title, { color: text }]}>Approval Rules</Text>
      </View></TourTarget>
      {CATEGORIES.map((cat) => (
        <View key={cat} style={styles.row}>
          <Text style={{ color: text, fontWeight: '800', width: 120 }}>{cat}</Text>
          <TouchableOpacity
            style={styles.pill}
            onPress={() => {
              const next = POLICIES[(POLICIES.indexOf(current(cat)) + 1) % POLICIES.length];
              Alert.alert(`Set ${cat} to ${next}?`, '', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Save', onPress: async () => { await visitorService.updatePolicy(cat, { policyType: next }); load(); } },
              ]);
            }}
          >
            <Text style={{ color: '#10B981', fontWeight: '700' }}>{current(cat)}</Text>
          </TouchableOpacity>
        </View>
      ))}
      <Text style={{ color: sub, padding: 16 }}>Tap a rule to cycle Auto → Host → Admin → Gatekeeper.</Text>
    </View></TourTarget>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  title: { fontSize: 20, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  pill: { backgroundColor: 'rgba(16,185,129,0.12)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
});
