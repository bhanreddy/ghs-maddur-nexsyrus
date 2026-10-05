import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import AdminHeader from '../../../src/components/AdminHeader';
import { AcademicPlannerService, AcademicPlan, Curriculum } from '../../../src/services/academicPlannerService';
import { ClassService } from '../../../src/services/classService';
import { alertCompat } from '../../../src/utils/crossPlatformAlert';

export default function AcademicPlansScreen() {
  const [plans, setPlans] = useState<AcademicPlan[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [sections, setSections] = useState<any[]>([]);

  const load = useCallback(async () => {
    const year = await ClassService.getCurrentAcademicYear();
    const [planList, currList, classSections] = await Promise.all([
      AcademicPlannerService.listPlans({ academic_year_id: year?.id }),
      AcademicPlannerService.listCurricula({ academic_year_id: year?.id }),
      ClassService.getClassSections(year?.id),
    ]);
    setPlans(Array.isArray(planList) ? planList : []);
    setCurricula(Array.isArray(currList) ? currList : []);
    setSections(Array.isArray(classSections) ? classSections : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const generateFromCurriculum = async (curriculum: Curriculum) => {
    const match = sections.find((s) => s.class_id === curriculum.class_id);
    if (!match) {
      alertCompat('No section mapping', 'Map this class to a section before generating a plan.');
      return;
    }
    const year = await ClassService.getCurrentAcademicYear();
    await AcademicPlannerService.createPlan({
      academic_year_id: year?.id,
      class_id: curriculum.class_id,
      section_id: match.section_id,
      subject_id: curriculum.subject_id,
      curriculum_id: curriculum.id,
      auto_generate: true,
      status: 'ACTIVE',
    });
    await load();
  };

  return (
    <View style={styles.root}>
      <TourTarget id="screen.admin-academic-planner-plans.overview"><AdminHeader title="Academic Plans" showBackButton /></TourTarget>
      <TourTarget id="screen.admin-academic-planner-plans.workspace" native><TourScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.h}>Generate from curriculum</Text>
        {curricula.map((c) => (
          <TouchableOpacity key={c.id} style={styles.card} onPress={() => generateFromCurriculum(c)}>
            <Text style={styles.title}>{c.name}</Text>
            <Text style={styles.muted}>Tap to generate a section teaching plan</Text>
          </TouchableOpacity>
        ))}
        <Text style={[styles.h, { marginTop: 18 }]}>Existing plans</Text>
        {plans.map((p) => (
          <View key={p.id} style={styles.card}>
            <Text style={styles.title}>{p.class_name}{p.section_name} · {p.subject_name}</Text>
            <Text style={styles.muted}>{p.status} · actual {Math.round(Number(p.actual_progress || 0))}% · expected {Math.round(Number(p.expected_progress || 0))}%</Text>
            <TouchableOpacity style={styles.btn} onPress={() => AcademicPlannerService.generatePlan(p.id).then(load)}>
              <Text style={styles.btnText}>Regenerate dates</Text>
            </TouchableOpacity>
          </View>
        ))}
      </TourScrollView></TourTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },
  h: { fontWeight: '800', fontSize: 16, marginBottom: 8 },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 14, marginBottom: 8 },
  title: { fontWeight: '700' },
  muted: { color: '#6B7280', marginTop: 4 },
  btn: { marginTop: 10, backgroundColor: '#EEF2FF', padding: 10, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#4338CA', fontWeight: '700' },
});
