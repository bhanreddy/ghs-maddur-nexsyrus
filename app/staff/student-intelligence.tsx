import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import StaffHeader from '../../src/components/StaffHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { clayCard, clayInset } from '../../src/theme/clayStyles';
import * as Haptics from '../../src/utils/haptics';
import { SchoolIntelligenceService, TeacherCockpitStudent, IntelligenceInsight } from '../../src/services/intelligenceService';
import { InsightExplanationModal } from '../../src/components/anecdote/InsightExplanationModal';
import { InterventionModal } from '../../src/components/anecdote/InterventionModal';
import { StudentIntelligenceTimeline } from '../../src/components/anecdote/StudentIntelligenceTimeline';
import StudentPhoto from '../../src/components/StudentPhoto';

const { width: WIN_W } = Dimensions.get('window');

const TIERS = [
  { key: 'ALL', label: 'All Students', icon: 'people-outline', color: '#6366F1' },
  { key: 'ATTENTION', label: 'Attention (🔴)', icon: 'alert-circle', color: '#EF4444' },
  { key: 'WATCH', label: 'Watch (🟡)', icon: 'warning', color: '#F59E0B' },
  { key: 'STRENGTHS', label: 'Strengths (🌟)', icon: 'star', color: '#10B981' },
  { key: 'STABLE', label: 'Stable (🟢)', icon: 'checkmark-circle', color: '#059669' },
];

export default function StaffStudentIntelligenceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ studentId?: string }>();
  const { theme, isDark } = useTheme();

  const [activeTier, setActiveTier] = useState('ALL');
  const [students, setStudents] = useState<TeacherCockpitStudent[]>([]);
  const [counts, setCounts] = useState({ stable: 0, watch: 0, attention: 0, strengths: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals
  const [selectedInsight, setSelectedInsight] = useState<IntelligenceInsight | null>(null);
  const [interventionStudent, setInterventionStudent] = useState<{ id: string; name: string; insightId?: string } | null>(null);
  const [timelineStudent, setTimelineStudent] = useState<{ id: string; name: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await SchoolIntelligenceService.getTeacherCockpit();
      setStudents(data?.students || []);
      if (data?.summary) {
        setCounts({
          stable: data.summary.stable || 0,
          watch: data.summary.watch || 0,
          attention: data.summary.attention || 0,
          strengths: data.summary.growth || 0,
          total: data.summary.total || 0,
        });
      }
    } catch (err) {
      console.warn('Failed to load teacher intelligence cockpit', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredStudents = useMemo(() => {
    if (params?.studentId) {
      const matched = students.filter((s) => s.student_id === params.studentId || s.id === params.studentId);
      if (matched.length > 0) return matched;
    }

    if (activeTier === 'ALL') return students;
    if (activeTier === 'ATTENTION') {
      return students.filter((s) => s.status_tier === 'ATTENTION' || s.severity === 'LEVEL_3_ATTENTION' || s.severity === 'LEVEL_4_CRITICAL');
    }
    if (activeTier === 'WATCH') {
      return students.filter((s) => s.status_tier === 'WATCH' || s.severity === 'LEVEL_2_WATCH');
    }
    if (activeTier === 'STRENGTHS') {
      return students.filter((s) => s.status_tier === 'GROWTH' || s.severity === 'LEVEL_1_POSITIVE');
    }
    if (activeTier === 'STABLE') {
      return students.filter((s) => s.status_tier === 'STABLE' || (!s.status_tier && !s.severity));
    }
    return students;
  }, [students, activeTier, params?.studentId]);

  const primaryColor = theme.colors.primary || '#6366F1';
  const cardStyle = clayCard(isDark, 'md');

  const getTierMeta = (tier?: string) => {
    switch (tier) {
      case 'ATTENTION':
        return { label: 'Attention Required', color: '#EF4444', bg: 'rgba(239,68,68,0.12)', icon: 'alert-circle' };
      case 'WATCH':
        return { label: 'Watch', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', icon: 'warning' };
      case 'GROWTH':
      case 'STRENGTHS':
        return { label: 'Emerging Strength', color: '#10B981', bg: 'rgba(16,185,129,0.12)', icon: 'star' };
      default:
        return { label: 'Stable', color: '#059669', bg: 'rgba(5,150,105,0.12)', icon: 'checkmark-circle' };
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#080B14' : '#F1F5F9' }]}>
      <TourTarget id="screen.staff-student-intelligence.overview"><StaffHeader title="Student Intelligence Cockpit" /></TourTarget>

      <TourScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              loadData();
            }}
            tintColor={primaryColor}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Metric Summary Ribbon */}
        <View style={styles.metricsGrid}>
          <TouchableOpacity
            onPress={() => setActiveTier('STABLE')}
            style={[cardStyle, styles.metricCard, activeTier === 'STABLE' && { borderColor: '#059669', borderWidth: 2 }]}
          >
            <Text style={[styles.metricNumber, { color: '#059669' }]}>{counts.stable}</Text>
            <Text style={[styles.metricLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>🟢 Stable</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTier('WATCH')}
            style={[cardStyle, styles.metricCard, activeTier === 'WATCH' && { borderColor: '#F59E0B', borderWidth: 2 }]}
          >
            <Text style={[styles.metricNumber, { color: '#F59E0B' }]}>{counts.watch}</Text>
            <Text style={[styles.metricLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>🟡 Watch</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTier('ATTENTION')}
            style={[cardStyle, styles.metricCard, activeTier === 'ATTENTION' && { borderColor: '#EF4444', borderWidth: 2 }]}
          >
            <Text style={[styles.metricNumber, { color: '#EF4444' }]}>{counts.attention}</Text>
            <Text style={[styles.metricLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>🔴 Attention</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTier('STRENGTHS')}
            style={[cardStyle, styles.metricCard, activeTier === 'STRENGTHS' && { borderColor: '#10B981', borderWidth: 2 }]}
          >
            <Text style={[styles.metricNumber, { color: '#10B981' }]}>{counts.strengths}</Text>
            <Text style={[styles.metricLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>🌟 Strengths</Text>
          </TouchableOpacity>
        </View>

        {/* Tier Selector Pills */}
        <TourTarget id="screen.staff-student-intelligence.workspace" native><TourScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
          {TIERS.map((t) => {
            const active = activeTier === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => {
                  setActiveTier(t.key);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={[
                  styles.tabBtn,
                  {
                    backgroundColor: active ? primaryColor : isDark ? '#1E293B' : '#FFF',
                    borderColor: active ? primaryColor : isDark ? '#334155' : '#E2E8F0',
                  },
                ]}
              >
                <Ionicons
                  name={t.icon as any}
                  size={14}
                  color={active ? '#FFF' : isDark ? '#94A3B8' : '#64748B'}
                />
                <Text
                  style={[
                    styles.tabBtnText,
                    { color: active ? '#FFF' : isDark ? '#CBD5E1' : '#475569', fontWeight: active ? '700' : '500' },
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </TourScrollView></TourTarget>

        {/* Students List */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={primaryColor} />
            <Text style={[styles.loadingText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Calculating student baselines and patterns...
            </Text>
          </View>
        ) : filteredStudents.length === 0 ? (
          <View style={[cardStyle, styles.emptyCard]}>
            <Ionicons name="sparkles-outline" size={44} color={isDark ? '#475569' : '#94A3B8'} />
            <Text style={[styles.emptyTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
              No students in this tier
            </Text>
            <Text style={[styles.emptySubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Deterministic algorithms evaluate student attendance, assessment marks, and teacher observations daily.
            </Text>
          </View>
        ) : (
          <View style={styles.listGrid}>
            {filteredStudents.map((st) => {
              const meta = getTierMeta(st.status_tier);
              const studentId = st.student_id || st.id;
              const studentName = st.display_name || st.name || 'Student';

              return (
                <View key={studentId} style={[cardStyle, styles.studentCard]}>
                  {/* Top: Student profile + Status Badge */}
                  <View style={styles.studentCardHeader}>
                    <View style={styles.profileRow}>
                      <StudentPhoto photoUrl={st.photo_url} size={44} />
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={[styles.studentName, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                          {studentName}
                        </Text>
                        <Text style={[styles.studentSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                          {st.admission_no ? `Adm #${st.admission_no}` : ''}
                          {st.class_name ? ` • ${st.class_name}` : ''}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                      <Ionicons name={meta.icon as any} size={12} color={meta.color} />
                      <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>

                  {/* Latest Insight Card / Explanation Hook */}
                  {st.latest_insight ? (
                    <View style={[styles.insightBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
                      <View style={styles.insightTop}>
                        <Ionicons name="sparkles" size={14} color="#8B5CF6" />
                        <Text style={[styles.insightTitle, { color: isDark ? '#C7D2FE' : '#4338CA' }]}>
                          {st.latest_insight.title}
                        </Text>
                      </View>
                      <Text
                        style={[styles.insightSummary, { color: isDark ? '#CBD5E1' : '#475569' }]}
                        numberOfLines={2}
                      >
                        {st.latest_insight.summary}
                      </Text>

                      {/* "Why?" Button - Mandatory Requirement */}
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedInsight(st.latest_insight as any);
                        }}
                        style={styles.whyBtn}
                      >
                        <Ionicons name="help-circle-outline" size={14} color={primaryColor} />
                        <Text style={[styles.whyBtnText, { color: primaryColor }]}>
                          Why was this generated?
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={[styles.insightBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
                      <Text style={[styles.insightSummary, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                        Consistent baseline across attendance, homework, and assessments.
                      </Text>
                    </View>
                  )}

                  {/* Actions Footer: Timeline & Intervention */}
                  <View style={[styles.cardFooter, { borderTopColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setTimelineStudent({ id: studentId, name: studentName });
                      }}
                      style={styles.actionBtn}
                    >
                      <Ionicons name="time-outline" size={15} color={primaryColor} />
                      <Text style={[styles.actionBtnText, { color: primaryColor }]}>Timeline</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setInterventionStudent({
                          id: studentId,
                          name: studentName,
                          insightId: st.latest_insight?.id,
                        });
                      }}
                      style={styles.actionBtn}
                    >
                      <Ionicons name="git-network-outline" size={15} color="#8B5CF6" />
                      <Text style={[styles.actionBtnText, { color: '#8B5CF6' }]}>Intervene</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        router.push({
                          pathname: '/staff/anecdotes',
                          params: { studentId },
                        } as any);
                      }}
                      style={styles.actionBtn}
                    >
                      <Ionicons name="add-circle-outline" size={15} color="#10B981" />
                      <Text style={[styles.actionBtnText, { color: '#10B981' }]}>Observe</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </TourScrollView>

      {/* "Why?" Insight Explanation Modal */}
      <InsightExplanationModal
        visible={Boolean(selectedInsight)}
        insight={selectedInsight}
        onClose={() => setSelectedInsight(null)}
        onCreateIntervention={(ins) => {
          setSelectedInsight(null);
          setInterventionStudent({
            id: ins.student_id || '',
            name: 'Student',
            insightId: ins.id,
          });
        }}
        onMarkReviewed={async (ins) => {
          try {
            await SchoolIntelligenceService.reviewInsight(ins.id, { status: 'ACKNOWLEDGED' });
            setSelectedInsight(null);
            loadData();
          } catch (err) {
            console.warn('Failed to mark insight reviewed', err);
          }
        }}
        onDismiss={async (ins) => {
          try {
            await SchoolIntelligenceService.reviewInsight(ins.id, { status: 'DISMISSED' });
            setSelectedInsight(null);
            loadData();
          } catch (err) {
            console.warn('Failed to dismiss insight', err);
          }
        }}
      />

      {/* Intervention Modal */}
      {interventionStudent && (
        <InterventionModal
          visible={Boolean(interventionStudent)}
          studentId={interventionStudent.id}
          studentName={interventionStudent.name}
          insightId={interventionStudent.insightId}
          onClose={() => setInterventionStudent(null)}
          onSuccess={() => loadData()}
        />
      )}

      {/* Student Timeline Bottom Sheet */}
      {timelineStudent && (
        <View style={styles.timelineOverlay}>
          <View style={[styles.timelineSheet, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
            <View style={styles.timelineHeader}>
              <View>
                <Text style={[styles.timelineHeaderTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                  {timelineStudent.name}
                </Text>
                <Text style={[styles.timelineHeaderSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  Unified Intelligence Timeline
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTimelineStudent(null)} style={styles.closeTimelineBtn}>
                <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, paddingHorizontal: 16 }}>
              <StudentIntelligenceTimeline studentId={timelineStudent.id} />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  metricNumber: {
    fontSize: 18,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  tabsScroll: {
    marginBottom: 14,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  tabBtnText: {
    fontSize: 12,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
  },
  listGrid: {
    gap: 12,
  },
  studentCard: {
    padding: 16,
  },
  studentCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '700',
  },
  studentSub: {
    fontSize: 11,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  insightBox: {
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  insightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  insightTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  insightSummary: {
    fontSize: 12,
    lineHeight: 16,
  },
  whyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  whyBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 10,
    borderTopWidth: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  timelineOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  timelineSheet: {
    height: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  timelineHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  timelineHeaderSub: {
    fontSize: 12,
    marginTop: 2,
  },
  closeTimelineBtn: {
    padding: 6,
  },
});
