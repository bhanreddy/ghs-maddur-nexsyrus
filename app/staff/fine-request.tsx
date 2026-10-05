import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useEffect, useState } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import KeyboardAwareScreen from '@/components/keyboard/KeyboardAwareScreen';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import StaffHeader from '../../src/components/StaffHeader';
import { FineService } from '../../src/services/fineService';
import { StudentService } from '../../src/services/studentService';
import type { Fine, FineCategory, FinePolicy } from '../../src/types/fines';
import type { Student } from '../../src/types/models';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { FINE_STATUS_LABELS } from '../../src/types/fines';

const fmtINR = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function StaffFineRequestScreen() {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Student[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [categories, setCategories] = useState<FineCategory[]>([]);
  const [policies, setPolicies] = useState<FinePolicy[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [mine, setMine] = useState<Fine[]>([]);

  useEffect(() => {
    FineService.getCategories(true).then((c) => setCategories(Array.isArray(c) ? c : [])).catch(() => {});
    FineService.getPolicies({ active: true }).then((p) => setPolicies(Array.isArray(p) ? p : [])).catch(() => {});
    FineService.listFines({ limit: 20 }).then((r) => setMine(r?.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (query.length < 2) { setMatches([]); return; }
    const t = setTimeout(() => {
      StudentService.getAll<Student>({ search: query, limit: 6 }).then((page) => {
        setMatches(page?.data || []);
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const submit = async () => {
    if (!student || !categoryId || !reason || !Number(amount)) {
      alertCompat('Missing details', 'Choose a student, category, amount and reason. Accounts will review before this is charged.');
      return;
    }
    setSaving(true);
    try {
      await FineService.requestFine({
        student_id: student.id,
        category_id: categoryId,
        policy_id: policyId || null,
        amount: Number(amount),
        reason,
      });
      alertCompat('Request submitted', 'Accounts / Admin will review this before it is added to the student ledger.');
      setStudent(null); setAmount(''); setReason('');
      FineService.listFines({ limit: 20 }).then((r) => setMine(r?.data || [])).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAwareScreen>
      <TourTarget id="screen.staff-fine-request.overview"><StaffHeader title="Fine request" subtitle="Submit for accounts approval" showBackButton /></TourTarget>
      <TourTarget id="screen.staff-fine-request.workspace" native><TourScrollView contentContainerStyle={st.content}>
        <Text style={st.hint}>Teachers cannot debit a student directly. Your request stays pending until accounts approves it.</Text>
        <AppTextInput
          placeholder="Student name or admission number"
          value={student ? `${student.display_name || student.first_name} (${student.admission_no})` : query}
          onChangeText={(v) => { setStudent(null); setQuery(v); }}
          style={st.input}
        />
        {matches.map((s) => (
          <Pressable key={s.id} style={st.match} onPress={() => { setStudent(s); setMatches([]); setQuery(''); }}>
            <Text style={st.title}>{s.display_name || `${s.first_name} ${s.last_name}`}</Text>
            <Text style={st.meta}>{s.admission_no}</Text>
          </Pressable>
        ))}
        <Text style={st.label}>Category</Text>
        <View style={st.wrapChips}>
          {categories.map((c) => (
            <Pressable key={c.id} onPress={() => setCategoryId(c.id)} style={[st.chip, categoryId === c.id && st.chipOn]}>
              <Text style={[st.chipText, categoryId === c.id && { color: '#fff' }]}>{c.name}</Text>
            </Pressable>
          ))}
        </View>
        {policies.filter((p) => !categoryId || p.category_id === categoryId).slice(0, 6).map((p) => (
          <Pressable key={p.id} onPress={() => { setPolicyId(p.id); if (p.fixed_amount) setAmount(String(p.fixed_amount)); }} style={st.match}>
            <Text style={st.title}>{p.name}</Text>
            <Text style={st.meta}>{p.calculation_type}{p.approval_required ? ' · approval required' : ''}</Text>
          </Pressable>
        ))}
        <AppTextInput placeholder="Recommended amount" keyboardType="numeric" value={amount} onChangeText={setAmount} style={st.input} />
        <AppTextInput placeholder="What happened? (shown to parent after approval)" value={reason} onChangeText={setReason} style={st.input} />
        <Pressable style={st.btn} onPress={submit} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>Submit for approval</Text>}
        </Pressable>

        <Text style={st.section}>My recent requests</Text>
        {mine.length === 0 && <Text style={st.hint}>Fine requests you raise will appear here.</Text>}
        {mine.map((f) => (
          <View key={f.id} style={st.match}>
            <Text style={st.title}>{f.student_name} · {fmtINR(Number(f.requested_amount || f.original_amount))}</Text>
            <Text style={st.meta}>{f.fine_no} · {FINE_STATUS_LABELS[f.status]}</Text>
          </View>
        ))}
      </TourScrollView></TourTarget>
    </KeyboardAwareScreen>
  );
}

const st = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  hint: { color: '#64748B', marginBottom: 12, lineHeight: 20 },
  input: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginVertical: 6 },
  match: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginVertical: 4 },
  title: { fontWeight: '800', color: '#0F172A' },
  meta: { color: '#64748B', marginTop: 2, fontSize: 12 },
  label: { fontWeight: '800', marginTop: 10, marginBottom: 6 },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#ECFDF5' },
  chipOn: { backgroundColor: '#059669' },
  chipText: { fontWeight: '700', color: '#065F46', fontSize: 12 },
  btn: { backgroundColor: '#059669', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 12 },
  btnText: { color: '#fff', fontWeight: '800' },
  section: { marginTop: 22, fontWeight: '800', fontSize: 16 },
});
