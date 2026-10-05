import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import StaffHeader from '../../src/components/StaffHeader';
import { AcademicPlannerService, AcademicToday } from '../../src/services/academicPlannerService';
import { academicProgressQueue } from '../../src/services/academicProgressQueue';
import { useTheme } from '../../src/hooks/useTheme';
import * as Haptics from '../../src/utils/haptics';

export default function AcademicTodayScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [today, setToday] = useState<AcademicToday | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const styles = useMemo(() => getStyles(isDark), [isDark]);

  const load = useCallback(async () => {
    await academicProgressQueue.flush();
    const data = await AcademicPlannerService.getToday().catch(() => null);
    setToday(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const slot = today?.current_slot;
  const topic = slot?.current_topic;
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  })();

  const mark = async (action: 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'CONTINUE_NEXT_PERIOD' | 'SKIPPED') => {
    if (!slot?.plan_id || !topic?.plan_item_id) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const payload = {
      planId: slot.plan_id,
      planItemId: topic.plan_item_id,
      action: action === 'COMPLETED' ? 'MARK_COMPLETED' as const : action,
    };
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        await academicProgressQueue.enqueue(payload);
      } else {
        await AcademicPlannerService.recordProgress(slot.plan_id, {
          plan_item_id: topic.plan_item_id,
          status: action,
          source: 'ACADEMIC_APP',
        });
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <TourTarget id="screen.staff-academic-today.overview"><StaffHeader title="Academic Today" showBackButton /></TourTarget>
      <TourTarget id="screen.staff-academic-today.workspace" native><TourScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Text style={styles.hello}>{greeting}</Text>
        {!slot ? (
          <Text style={styles.muted}>No class is mapped to an academic plan right now. Your assigned plans will appear after the timetable and curriculum are linked.</Text>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.kicker}>{slot.class_name}{slot.section_name}</Text>
              <Text style={styles.subject}>{slot.subject_name}</Text>
              <Text style={styles.period}>Period {slot.period_number} · {String(slot.start_time || '').slice(0, 5)}</Text>
              <Text style={styles.label}>Today's topic</Text>
              <Text style={styles.chapter}>{topic?.chapter_title || 'No topic scheduled'}</Text>
              <Text style={styles.topic}>{topic?.topic_title || "Generate an academic plan to see today's lesson."}</Text>
              {slot.last_completed_topic ? (
                <Text style={styles.last}>Last class: {slot.last_completed_topic.chapter_title} — {slot.last_completed_topic.topic_title} completed</Text>
              ) : null}
            </View>
            <Text style={styles.label}>Update progress</Text>
            <View style={styles.actions}>
              <Action label="Completed" color="#059669" onPress={() => mark('COMPLETED')} disabled={busy || !topic} />
              <Action label="Partial" color="#D97706" onPress={() => mark('PARTIALLY_COMPLETED')} disabled={busy || !topic} />
              <Action label="Continue next period" color="#4F46E5" onPress={() => mark('CONTINUE_NEXT_PERIOD')} disabled={busy || !topic} />
              <Action label="Skipped" color="#64748B" onPress={() => mark('SKIPPED')} disabled={busy || !topic} />
            </View>
            {topic?.plan_item_id ? (
              <TouchableOpacity style={styles.diary} onPress={() => router.push({ pathname: '/staff/diary', params: { academicPlanItemId: topic.plan_item_id } } as any)}>
                <Text style={styles.diaryText}>Use this topic in diary</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </TourScrollView></TourTarget>
    </View>
  );
}

function Action({ label, color, onPress, disabled }: { label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={{ backgroundColor: color, padding: 14, borderRadius: 14, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: '#fff', fontWeight: '800', textAlign: 'center' }}>{label}</Text>
    </TouchableOpacity>
  );
}

const getStyles = (isDark: boolean) => StyleSheet.create({
  root: { flex: 1, backgroundColor: isDark ? '#080B14' : '#F4F6FB' },
  body: { padding: 20, paddingBottom: 48 },
  hello: { fontSize: 26, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 16 },
  card: { backgroundColor: isDark ? '#111827' : '#fff', borderRadius: 20, padding: 18, marginBottom: 18 },
  kicker: { color: '#6366F1', fontWeight: '700' },
  subject: { fontSize: 22, fontWeight: '800', marginTop: 4, color: isDark ? '#F8FAFC' : '#0F172A' },
  period: { color: '#64748B', marginTop: 4 },
  label: { marginTop: 16, marginBottom: 8, fontWeight: '700', color: isDark ? '#CBD5E1' : '#334155' },
  chapter: { fontSize: 16, fontWeight: '700', color: isDark ? '#E2E8F0' : '#1E293B' },
  topic: { fontSize: 18, marginTop: 4, color: isDark ? '#F8FAFC' : '#0F172A' },
  last: { marginTop: 12, color: '#64748B' },
  muted: { color: '#64748B', lineHeight: 22 },
  actions: { gap: 10 },
  diary: { marginTop: 16, alignItems: 'center' },
  diaryText: { color: '#4F46E5', fontWeight: '700' },
});
