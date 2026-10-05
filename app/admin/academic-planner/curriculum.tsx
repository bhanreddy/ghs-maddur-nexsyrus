import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import AdminHeader from '../../../src/components/AdminHeader';
import { AcademicPlannerService, Curriculum } from '../../../src/services/academicPlannerService';
import { ClassService } from '../../../src/services/classService';
import { ResultService } from '../../../src/services/commonServices';
import { alertCompat } from '../../../src/utils/crossPlatformAlert';
import { useTheme } from '../../../src/hooks/useTheme';

export default function CurriculumBuilderScreen() {
  const { isDark } = useTheme();
  const [list, setList] = useState<Curriculum[]>([]);
  const [selected, setSelected] = useState<Curriculum | null>(null);
  const [name, setName] = useState('');
  const [unitTitle, setUnitTitle] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [topicTitle, setTopicTitle] = useState('');
  const [periods, setPeriods] = useState('5');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [yearId, setYearId] = useState('');
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  const load = useCallback(async () => {
    const [year, cls, subs, curricula] = await Promise.all([
      ClassService.getCurrentAcademicYear(),
      ClassService.getClasses(),
      ResultService.getSubjects(),
      AcademicPlannerService.listCurricula(),
    ]);
    if (year?.id) setYearId(year.id);
    setClasses(cls || []);
    setSubjects(subs || []);
    setList(Array.isArray(curricula) ? curricula : []);
    if (!classId && cls?.[0]?.id) setClassId(cls[0].id);
    if (!subjectId && subs?.[0]?.id) setSubjectId(subs[0].id);
  }, [classId, subjectId]);

  useEffect(() => { load(); }, [load]);

  const openCurriculum = async (id: string) => {
    const full = await AcademicPlannerService.getCurriculum(id);
    setSelected(full);
  };

  return (
    <View style={[styles.root, { backgroundColor: isDark ? '#0B1220' : '#F3F4F6' }]}>
      <TourTarget id="screen.admin-academic-planner-curriculum.overview"><AdminHeader title="Curriculum Builder" showBackButton /></TourTarget>
      <TourTarget id="screen.admin-academic-planner-curriculum.workspace" native><TourScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Text style={styles.h}>Create curriculum</Text>
        <TextInput placeholder="e.g. Class 7 Mathematics 2026–27" value={name} onChangeText={setName} style={styles.input} />
        <TouchableOpacity
          style={styles.primary}
          onPress={async () => {
            if (!name || !yearId || !classId || !subjectId) {
              alertCompat('Missing details', 'Name, class, subject and academic year are required.');
              return;
            }
            await AcademicPlannerService.createCurriculum({ academic_year_id: yearId, class_id: classId, subject_id: subjectId, name, status: 'ACTIVE' });
            setName('');
            await load();
          }}
        >
          <Text style={styles.primaryText}>Create</Text>
        </TouchableOpacity>

        {list.map((c) => (
          <TouchableOpacity key={c.id} style={styles.card} onPress={() => openCurriculum(c.id)}>
            <Text style={styles.cardTitle}>{c.name}</Text>
            <Text style={styles.muted}>Version {c.version} · {c.status}</Text>
          </TouchableOpacity>
        ))}

        {selected ? (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.h}>{selected.name}</Text>
            <TextInput placeholder="Unit title" value={unitTitle} onChangeText={setUnitTitle} style={styles.input} />
            <TouchableOpacity style={styles.secondary} onPress={async () => {
              if (!unitTitle) return;
              await AcademicPlannerService.createUnit(selected.id, { title: unitTitle, estimated_periods: Number(periods) || 1 });
              setUnitTitle('');
              await openCurriculum(selected.id);
            }}><Text style={styles.secondaryText}>Add unit</Text></TouchableOpacity>

            {(selected.units || []).map((unit) => (
              <View key={unit.id} style={styles.nested}>
                <Text style={styles.cardTitle}>{unit.title}</Text>
                <TextInput placeholder="Chapter title" value={chapterTitle} onChangeText={setChapterTitle} style={styles.input} />
                <TouchableOpacity style={styles.secondary} onPress={async () => {
                  if (!chapterTitle) return;
                  await AcademicPlannerService.createChapter(selected.id, { unit_id: unit.id, title: chapterTitle, estimated_periods: Number(periods) || 1 });
                  setChapterTitle('');
                  await openCurriculum(selected.id);
                }}><Text style={styles.secondaryText}>Add chapter</Text></TouchableOpacity>
                {(unit.chapters || []).map((ch) => (
                  <View key={ch.id} style={styles.nested}>
                    <Text style={{ fontWeight: '700' }}>{ch.title}</Text>
                    {(ch.topics || []).map((tp) => (
                      <Text key={tp.id} style={styles.muted}>• {tp.title} ({tp.estimated_periods} periods)</Text>
                    ))}
                    <TextInput placeholder="Topic title" value={topicTitle} onChangeText={setTopicTitle} style={styles.input} />
                    <TextInput placeholder="Estimated periods" value={periods} onChangeText={setPeriods} style={styles.input} keyboardType="number-pad" />
                    <TouchableOpacity style={styles.secondary} onPress={async () => {
                      if (!topicTitle) return;
                      await AcademicPlannerService.createTopic(ch.id, { title: topicTitle, estimated_periods: Number(periods) || 1 });
                      setTopicTitle('');
                      await openCurriculum(selected.id);
                    }}><Text style={styles.secondaryText}>Add topic</Text></TouchableOpacity>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}
      </TourScrollView></TourTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  h: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  primary: { backgroundColor: '#4F46E5', padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondary: { backgroundColor: '#EEF2FF', padding: 10, borderRadius: 10, alignItems: 'center', marginBottom: 8 },
  secondaryText: { color: '#4338CA', fontWeight: '700' },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 14, marginBottom: 8 },
  cardTitle: { fontWeight: '700' },
  muted: { color: '#6B7280', marginTop: 4 },
  nested: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, marginTop: 8 },
});
