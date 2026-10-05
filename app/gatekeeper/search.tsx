import { TourTarget } from '@/src/features/app-tour';
import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService } from '@/src/services/visitorService';

export default function VisitorSearchScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async (value: string) => {
    setQ(value);
    if (value.trim().length < 2) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      setRows(await visitorService.searchVisitors(value.trim()));
    } finally {
      setLoading(false);
    }
  };

  const bg = isDark ? '#0B0F17' : '#F4F6F9';
  const card = isDark ? '#161E2E' : '#FFFFFF';
  const text = isDark ? '#F1F5F9' : '#0F172A';
  const sub = isDark ? '#94A3B8' : '#64748B';

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <TourTarget id="screen.gatekeeper-search.overview" native><View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={text} /></TouchableOpacity>
        <TourTarget id="gatekeeper.visitor.search" native event="gatekeeper.visitor.search"><TextInput
          value={q}
          onChangeText={search}
          placeholder="Name, mobile, vehicle, purpose"
          placeholderTextColor={sub}
          style={[styles.input, { color: text, backgroundColor: card }]}
          autoFocus
        /></TourTarget>
      </View></TourTarget>
      {loading ? <ActivityIndicator color="#10B981" /> : null}
      <TourTarget id="gatekeeper.visitor.results" style={{ flex: 1 }}><TourTarget id="screen.gatekeeper-search.workspace" native><FlatList
        data={rows}
        keyExtractor={(item, idx) => `${item.request_id || item.profile_id}-${idx}`}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: card }]}>
            <Text style={[styles.name, { color: text }]}>{item.visitor_name}</Text>
            <Text style={{ color: sub }}>{item.mobile_number} · {item.visitor_type}</Text>
            <Text style={{ color: sub }}>{item.approval_status} · {item.purpose}</Text>
            {item.checkin_id && !item.checked_out_at ? (
              <TouchableOpacity onPress={() => router.push('/gatekeeper/inside' as any)}>
                <Text style={{ color: '#10B981', fontWeight: '700', marginTop: 8 }}>Currently inside — open register</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      /></TourTarget></TourTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  input: { flex: 1, borderRadius: 12, paddingHorizontal: 12, height: 44, fontSize: 16 },
  card: { padding: 16, borderRadius: 16 },
  name: { fontSize: 16, fontWeight: '800' },
});
