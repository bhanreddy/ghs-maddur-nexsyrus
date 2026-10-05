import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../../src/components/AdminHeader';
import { useTheme } from '../../../src/hooks/useTheme';
import { AcademicPlannerService, CommandCenterSummary } from '../../../src/services/academicPlannerService';
import { ClassService } from '../../../src/services/classService';

const HEALTH_COLOR: Record<string, string> = {
  AHEAD: '#0EA5E9',
  ON_TRACK: '#10B981',
  SLIGHT_DELAY: '#F59E0B',
  AT_RISK: '#F97316',
  CRITICAL: '#EF4444',
  COMPLETED: '#6366F1',
};

export default function AcademicCommandCenter() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [summary, setSummary] = useState<CommandCenterSummary | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [yearId, setYearId] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const styles = useMemo(() => getStyles(isDark), [isDark]);

  const load = useCallback(async () => {
    const year = yearId || (await ClassService.getCurrentAcademicYear())?.id;
    if (year && !yearId) setYearId(year);
    const [kpi, drill] = await Promise.all([
      AcademicPlannerService.getCommandCenter(year).catch(() => null),
      AcademicPlannerService.getDrilldown({ academic_year_id: year }).catch(() => []),
    ]);
    if (kpi) setSummary(kpi);
    setRows(Array.isArray(drill) ? drill : []);
  }, [yearId]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.root}>
      <TourTarget id="screen.admin-academic-planner.overview"><AdminHeader title="Academic Command Center" showBackButton /></TourTarget>
      <TourTarget id="screen.admin-academic-planner.workspace" native><TourScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={styles.navRow}>
          <NavChip label="Curriculum" icon="library-outline" onPress={() => router.push('/admin/academic-planner/curriculum')} />
          <NavChip label="Plans" icon="map-outline" onPress={() => router.push('/admin/academic-planner/plans')} />
          <NavChip label="Risks" icon="warning-outline" onPress={() => router.push('/admin/academic-planner/risks')} />
        </View>

        <View style={styles.kpiGrid}>
          <Kpi title="Overall completion" value={`${summary?.overall_actual_completion ?? 0}%`} sub={`Expected ${summary?.overall_expected_completion ?? 0}%`} />
          <Kpi title="Academic health" value={summary?.overall_health || '—'} />
          <Kpi title="On track" value={String(summary?.counts.on_track ?? 0)} color="#10B981" />
          <Kpi title="At risk" value={String(summary?.counts.at_risk ?? 0)} color="#F97316" />
          <Kpi title="Critical" value={String(summary?.counts.critical ?? 0)} color="#EF4444" />
          <Kpi title="Completed" value={String(summary?.counts.completed ?? 0)} color="#6366F1" />
        </View>

        <Text style={styles.section}>Class · Section · Subject</Text>
        {rows.length === 0 ? (
          <Text style={styles.empty}>No academic plans yet. Create a curriculum, then generate a teaching plan.</Text>
        ) : rows.map((row) => (
          <View key={row.plan_id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{row.class_name}{row.section_name} · {row.subject_name}</Text>
              <Text style={styles.rowSub}>{row.teacher_name || 'Unassigned'} · {row.completed_topics || 0}/{row.total_topics || 0} topics</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: (HEALTH_COLOR[row.health_status] || '#94A3B8') + '22' }]}>
              <Text style={{ color: HEALTH_COLOR[row.health_status] || '#64748B', fontWeight: '700', fontSize: 12 }}>
                {Math.round(Number(row.actual_progress || 0))}%
              </Text>
            </View>
          </View>
        ))}
      </TourScrollView></TourTarget>
    </View>
  );
}

function NavChip({ label, icon, onPress }: { label: string; icon: any; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ flex: 1, backgroundColor: '#EEF2FF', padding: 12, borderRadius: 14, alignItems: 'center', gap: 4 }}>
      <Ionicons name={icon} size={18} color="#4F46E5" />
      <Text style={{ color: '#312E81', fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Kpi({ title, value, sub, color }: { title: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={{ width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
      <Text style={{ color: '#6B7280', fontSize: 12 }}>{title}</Text>
      <Text style={{ color: color || '#111827', fontSize: 22, fontWeight: '800', marginTop: 4 }}>{value}</Text>
      {sub ? <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  root: { flex: 1, backgroundColor: isDark ? '#0B1220' : '#F3F4F6' },
  body: { padding: 16, paddingBottom: 40 },
  navRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  section: { fontSize: 15, fontWeight: '700', marginBottom: 10, marginTop: 8, color: isDark ? '#E5E7EB' : '#111827' },
  empty: { color: '#6B7280', lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#111827' : '#fff', padding: 14, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: isDark ? '#1F2937' : '#E5E7EB' },
  rowTitle: { fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827' },
  rowSub: { color: '#6B7280', marginTop: 2, fontSize: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
});
