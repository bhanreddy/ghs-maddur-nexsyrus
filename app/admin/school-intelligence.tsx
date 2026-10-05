import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { clayCard } from '../../src/theme/clayStyles';
import * as Haptics from '../../src/utils/haptics';
import { SchoolIntelligenceService, SchoolCockpitData, ClassIntelligenceSummary } from '../../src/services/intelligenceService';

const { width: WIN_W } = Dimensions.get('window');

export default function AdminSchoolIntelligenceScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();

  const [cockpit, setCockpit] = useState<SchoolCockpitData | null>(null);
  const [classes, setClasses] = useState<ClassIntelligenceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [cockpitRes, classRes] = await Promise.all([
        SchoolIntelligenceService.getSchoolCockpit(),
        SchoolIntelligenceService.getClassBreakdown(),
      ]);
      setCockpit(cockpitRes);
      setClasses(classRes || []);
    } catch (err) {
      console.warn('Failed to load school intelligence', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const primaryColor = theme.colors.primary || '#6366F1';
  const cardStyle = clayCard(isDark, 'md');

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? '#080B14' : '#F1F5F9' }]}>
        <AdminHeader title="School Intelligence" />
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={[styles.loadingText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            Aggregating school-wide intelligence...
          </Text>
        </View>
      </View>
    );
  }

  const totals = cockpit?.student_tiers || {
    total: cockpit?.overview?.totalStudents || 0,
    stable: cockpit?.overview?.stableCount || 0,
    watch: cockpit?.overview?.watchCount || 0,
    attention: cockpit?.overview?.attentionCount || 0,
    growth: cockpit?.overview?.growthCount || 0,
  };

  const today = cockpit?.today_intelligence || {
    emerging_patterns: cockpit?.today?.emergingPatterns || 0,
    student_strengths: cockpit?.today?.studentStrengths || 0,
    class_trends: (cockpit?.classTrends || []).length,
    follow_ups_due: cockpit?.today?.followupsDue || 0,
    items_requiring_review: cockpit?.today?.itemsRequiringReview || 0,
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#080B14' : '#F1F5F9' }]}>
      <TourTarget id="screen.admin-school-intelligence.overview"><AdminHeader title="School Intelligence Cockpit" /></TourTarget>

      <TourTarget id="screen.admin-school-intelligence.workspace" native><TourScrollView
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
        {/* Top Hero Banner */}
        <View style={[cardStyle, styles.heroCard]}>
          <View style={styles.heroRow}>
            <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.heroBadge}>
              <Ionicons name="sparkles" size={22} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroSchoolTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                {totals.total.toLocaleString()} Active Students
              </Text>
              <Text style={[styles.heroSchoolSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Deterministic pattern detection across academics, attendance, and conduct.
              </Text>
            </View>
          </View>

          {/* Student Status Grid */}
          <View style={styles.tierGrid}>
            <View style={[styles.tierPill, { backgroundColor: 'rgba(5,150,105,0.1)' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <View>
                <Text style={[styles.tierCount, { color: '#059669' }]}>{totals.stable}</Text>
                <Text style={[styles.tierLabel, { color: '#059669' }]}>Stable</Text>
              </View>
            </View>

            <View style={[styles.tierPill, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
              <Ionicons name="warning" size={16} color="#F59E0B" />
              <View>
                <Text style={[styles.tierCount, { color: '#F59E0B' }]}>{totals.watch}</Text>
                <Text style={[styles.tierLabel, { color: '#F59E0B' }]}>Watch</Text>
              </View>
            </View>

            <View style={[styles.tierPill, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
              <Ionicons name="alert-circle" size={16} color="#EF4444" />
              <View>
                <Text style={[styles.tierCount, { color: '#EF4444' }]}>{totals.attention}</Text>
                <Text style={[styles.tierLabel, { color: '#EF4444' }]}>Attention</Text>
              </View>
            </View>

            <View style={[styles.tierPill, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
              <Ionicons name="star" size={16} color="#10B981" />
              <View>
                <Text style={[styles.tierCount, { color: '#10B981' }]}>{totals.growth}</Text>
                <Text style={[styles.tierLabel, { color: '#10B981' }]}>Growth</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Today's Intelligence Card */}
        <View style={[cardStyle, styles.sectionCard]}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="flash-outline" size={18} color="#F59E0B" />
            <Text style={[styles.sectionTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
              Today's Intelligence
            </Text>
          </View>

          <View style={styles.todayGrid}>
            <View style={[styles.todayItem, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
              <Text style={[styles.todayNum, { color: '#6366F1' }]}>{today.emerging_patterns}</Text>
              <Text style={[styles.todaySub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Emerging Patterns
              </Text>
            </View>

            <View style={[styles.todayItem, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
              <Text style={[styles.todayNum, { color: '#10B981' }]}>{today.student_strengths}</Text>
              <Text style={[styles.todaySub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Student Strengths
              </Text>
            </View>

            <View style={[styles.todayItem, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
              <Text style={[styles.todayNum, { color: '#3B82F6' }]}>{today.class_trends}</Text>
              <Text style={[styles.todaySub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Class Trends
              </Text>
            </View>

            <View style={[styles.todayItem, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
              <Text style={[styles.todayNum, { color: '#EA580C' }]}>{today.follow_ups_due}</Text>
              <Text style={[styles.todaySub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Follow-ups Due
              </Text>
            </View>

            <View style={[styles.todayItem, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
              <Text style={[styles.todayNum, { color: '#EF4444' }]}>{today.items_requiring_review}</Text>
              <Text style={[styles.todaySub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Review Required
              </Text>
            </View>
          </View>
        </View>

        {/* Class Intelligence Section */}
        <View style={[cardStyle, styles.sectionCard]}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="business-outline" size={18} color="#6366F1" />
            <Text style={[styles.sectionTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
              Class Intelligence Breakdown ({classes.length})
            </Text>
          </View>

          {classes.length === 0 ? (
            <Text style={[styles.emptyNote, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              No class sections mapped or intelligence data processing.
            </Text>
          ) : (
            <View style={styles.classList}>
              {classes.map((c) => (
                <TouchableOpacity
                  key={c.class_section_id || c.class_id}
                  onPress={() => {
                    if (!c.class_section_id) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: '/admin/class-intelligence',
                      params: {
                        classSectionId: c.class_section_id,
                        className: `${c.class_name || ''} ${c.section_name || ''}`.trim(),
                      },
                    } as any);
                  }}
                  style={[styles.classCard, { borderColor: isDark ? '#334155' : '#E2E8F0' }]}
                >
                  <View style={styles.classCardTop}>
                    <View>
                      <Text style={[styles.className, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                        {c.class_name} {c.section_name ? `• Section ${c.section_name}` : ''}
                      </Text>
                      <Text style={[styles.classStudentCount, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                        {c.total_students || c.student_count || 0} Students Enrolled
                      </Text>
                    </View>

                    <View style={styles.classStatusSummary}>
                      {(c.attention_count ?? c.attention_students_count ?? 0) > 0 ? (
                        <View style={[styles.miniBadge, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                          <Text style={[styles.miniBadgeText, { color: '#EF4444' }]}>
                            {c.attention_count ?? c.attention_students_count} Attention
                          </Text>
                        </View>
                      ) : null}
                      {(c.growth_count ?? c.growth_students_count ?? 0) > 0 ? (
                        <View style={[styles.miniBadge, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
                          <Text style={[styles.miniBadgeText, { color: '#10B981' }]}>
                            {c.growth_count ?? c.growth_students_count} Strengths
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {/* Class Metrics Row */}
                  <View style={styles.classMetricsBar}>
                    <View style={styles.metricColumn}>
                      <Text style={[styles.metricHeader, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                        Attendance
                      </Text>
                      <Text style={[styles.metricVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                        {c.attendance_rate != null ? `${c.attendance_rate}%` : c.avg_attendance_rate != null ? `${c.avg_attendance_rate}%` : 'N/A'}
                      </Text>
                    </View>

                    <View style={styles.metricColumn}>
                      <Text style={[styles.metricHeader, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                        Homework
                      </Text>
                      <Text style={[styles.metricVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                        {c.homework_rate != null ? `${c.homework_rate}%` : 'N/A'}
                      </Text>
                    </View>

                    <View style={styles.metricColumn}>
                      <Text style={[styles.metricHeader, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                        Academics
                      </Text>
                      <Text style={[styles.metricVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                        {c.academic_trend || (c.avg_assessment_score != null ? `${c.avg_assessment_score}%` : 'N/A')}
                      </Text>
                    </View>

                    <View style={styles.metricColumn}>
                      <Text style={[styles.metricHeader, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                        Observations
                      </Text>
                      <Text style={[styles.metricVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                        {c.observation_count || 0}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </TourScrollView></TourTarget>
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
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  heroCard: {
    padding: 16,
    marginBottom: 14,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  heroBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSchoolTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  heroSchoolSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  tierGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  tierPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  tierCount: {
    fontSize: 16,
    fontWeight: '800',
  },
  tierLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  sectionCard: {
    padding: 16,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  todayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  todayItem: {
    width: (WIN_W - 64) / 2,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  todayNum: {
    fontSize: 20,
    fontWeight: '800',
  },
  todaySub: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  emptyNote: {
    fontSize: 13,
  },
  classList: {
    gap: 10,
  },
  classCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  classCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  className: {
    fontSize: 14,
    fontWeight: '700',
  },
  classStudentCount: {
    fontSize: 11,
    marginTop: 2,
  },
  classStatusSummary: {
    flexDirection: 'row',
    gap: 6,
  },
  miniBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  miniBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  classMetricsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.15)',
  },
  metricColumn: {
    alignItems: 'center',
  },
  metricHeader: {
    fontSize: 10,
    fontWeight: '600',
  },
  metricVal: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
});
