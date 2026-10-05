import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import AdminHeader from '../../../src/components/AdminHeader';
import { AcademicPlannerService } from '../../../src/services/academicPlannerService';
import { alertCompat } from '../../../src/utils/crossPlatformAlert';

export default function AcademicRisksScreen() {
  const [risks, setRisks] = useState<any[]>([]);
  const [weekly, setWeekly] = useState<any>(null);

  const load = useCallback(async () => {
    const [list, digest] = await Promise.all([
      AcademicPlannerService.listRisks().catch(() => []),
      AcademicPlannerService.getWeeklyReport().catch(() => null),
    ]);
    setRisks(Array.isArray(list) ? list : []);
    setWeekly(digest);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.root}>
      <TourTarget id="screen.admin-academic-planner-risks.overview"><AdminHeader title="Academic Risks" showBackButton /></TourTarget>
      <TourTarget id="screen.admin-academic-planner-risks.workspace" native><TourScrollView contentContainerStyle={{ padding: 16 }}>
        <TouchableOpacity style={styles.primary} onPress={async () => {
          await AcademicPlannerService.scanRisks();
          await load();
        }}>
          <Text style={styles.primaryText}>Scan for persistent delays</Text>
        </TouchableOpacity>
        {weekly?.largest_delay ? (
          <Text style={styles.muted}>Largest delay: {weekly.largest_delay.class_name}{weekly.largest_delay.section_name} {weekly.largest_delay.subject_name}</Text>
        ) : null}
        {risks.length === 0 ? <Text style={styles.muted}>No active academic risks. One late period does not create an alert.</Text> : null}
        {risks.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={styles.title}>{r.risk_type} · {r.severity}</Text>
            <Text style={styles.muted}>{r.reason}</Text>
            <TouchableOpacity style={styles.btn} onPress={async () => {
              const proposal = await AcademicPlannerService.generateRecovery(r.academic_plan_id, r.id);
              alertCompat('Recovery options', JSON.stringify(proposal?.options || proposal, null, 2).slice(0, 800));
            }}>
              <Text style={styles.btnText}>Generate recovery plan</Text>
            </TouchableOpacity>
          </View>
        ))}
      </TourScrollView></TourTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },
  primary: { backgroundColor: '#4F46E5', padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  primaryText: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 14, marginBottom: 8 },
  title: { fontWeight: '800' },
  muted: { color: '#6B7280', marginTop: 6, lineHeight: 20 },
  btn: { marginTop: 10, backgroundColor: '#FEF3C7', padding: 10, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#92400E', fontWeight: '700' },
});
