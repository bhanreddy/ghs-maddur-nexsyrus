import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/services/apiClient';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import LogoLoader from '../../src/components/LogoLoader';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '../../src/utils/haptics';
import { ClassService } from '../../src/services/classService';
import { GlassSurfaces, PremiumGradients } from '../../src/theme/themes';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RiskSummary {
  total: number;
  healthy: number;
  approachingRisk: number;
  belowThreshold: number;
  notReviewed: number;
  resolved: number;
}

interface AtRiskStudent {
  id: string;
  student_id?: string;
  student_name: string;
  admission_no: string;
  class_id: string;
  class_name: string;
  section_id: string;
  section_name: string;
  total_sessions: number;
  present_count: number;
  late_count: number;
  half_day_count: number;
  absent_count: number;
  attendance_percentage: number | null;
  risk_state: string;
  intervention_status: 'not_reviewed' | 'parent_contacted' | 'monitoring' | 'resolved';
  intervention_notes: string | null;
  intervention_updated_at: string | null;
}

interface ClassItem {
  id: number | string;
  name: string;
}

type RiskFilterOption = 'all' | 'critical' | 'approaching' | 'healthy' | 'low_sample';
type StatusFilterOption = 'all' | 'not_reviewed' | 'parent_contacted' | 'monitoring' | 'resolved';

const QUICK_NOTES = [
  '📞 Called parent - informed about attendance',
  '🏥 Medical illness / leave certificate provided',
  '🤝 In-person meeting scheduled with parents',
  '🎯 Student counseled regarding regular attendance',
  '📈 Attendance improved after intervention',
];

// ─── Glassmorphism Helpers ────────────────────────────────────────────────────

function glassCard(isDark: boolean, elevated: boolean = false): any {
  const glass = isDark ? GlassSurfaces.dark : GlassSurfaces.light;
  const base: any = {
    backgroundColor: elevated ? glass.cardStrong : glass.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: glass.cardBorder,
    overflow: 'hidden' as const,
  };
  if (Platform.OS === 'web') {
    return {
      ...base,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: elevated
        ? isDark
          ? '0 16px 40px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)'
          : '0 16px 40px -8px rgba(15,23,42,0.12), 0 0 0 1px rgba(255,255,255,0.6)'
        : isDark
          ? '0 8px 24px -4px rgba(0,0,0,0.4)'
          : '0 4px 16px -4px rgba(15,23,42,0.06)',
    };
  }
  return {
    ...base,
    shadowColor: isDark ? '#000' : '#4F46E5',
    shadowOffset: { width: 0, height: elevated ? 12 : 4 },
    shadowOpacity: isDark ? (elevated ? 0.5 : 0.3) : (elevated ? 0.12 : 0.06),
    shadowRadius: elevated ? 24 : 12,
    elevation: elevated ? 8 : 3,
  };
}

function glassInnerPanel(isDark: boolean): any {
  const glass = isDark ? GlassSurfaces.dark : GlassSurfaces.light;
  return {
    backgroundColor: glass.innerPanel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)',
  };
}

// ─── Summary Card Config ──────────────────────────────────────────────────────

const SUMMARY_CARDS = [
  {
    key: 'critical' as const,
    gradient: ['#FF2A6D', '#FF5E62'] as [string, string],
    glowColor: '#FF2A6D',
    icon: 'alert-circle' as const,
    label: 'Below 75% Risk',
    sub: 'Critical action needed',
    valueKey: 'belowThreshold' as const,
    filterType: 'risk' as const,
  },
  {
    key: 'approaching' as const,
    gradient: ['#F59E0B', '#FF7700'] as [string, string],
    glowColor: '#F59E0B',
    icon: 'warning' as const,
    label: 'Approaching (75-80%)',
    sub: 'Caution threshold',
    valueKey: 'approachingRisk' as const,
    filterType: 'risk' as const,
  },
  {
    key: 'not_reviewed' as const,
    gradient: ['#8B5CF6', '#D946EF'] as [string, string],
    glowColor: '#8B5CF6',
    icon: 'clipboard' as const,
    label: 'Needs Review',
    sub: 'Pending intervention',
    valueKey: 'notReviewed' as const,
    filterType: 'status' as const,
  },
  {
    key: 'resolved' as const,
    gradient: ['#059669', '#10B981'] as [string, string],
    glowColor: '#10B981',
    icon: 'shield-checkmark' as const,
    label: 'Resolved Cases',
    sub: 'Interventions completed',
    valueKey: 'resolved' as const,
    filterType: 'status' as const,
  },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AttendanceRiskScreen() {
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const flatListRef = useRef<FlatList>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<RiskSummary | null>(null);
  const [students, setStudents] = useState<AtRiskStudent[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [lookbackDays, setLookbackDays] = useState<number>(60);

  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskFilterOption>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>('all');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Reset pagination when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, riskFilter, statusFilter, selectedClassId, lookbackDays, pageSize]);

  // Intervention Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<AtRiskStudent | null>(null);
  const [interventionStatus, setInterventionStatus] = useState<
    'not_reviewed' | 'parent_contacted' | 'monitoring' | 'resolved'
  >('parent_contacted');
  const [interventionNotes, setInterventionNotes] = useState('');
  const [savingIntervention, setSavingIntervention] = useState(false);

  // Load Classes once
  useEffect(() => {
    (async () => {
      try {
        const cls = await ClassService.getClasses();
        if (Array.isArray(cls)) {
          setClasses(cls.map((c) => ({ id: c.id, name: c.name })));
        }
      } catch {
        // Soft fail
      }
    })();
  }, []);

  const fetchRiskData = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {
        limit: '1000',
        lookback_days: String(lookbackDays),
      };
      if (selectedClassId) params.class_id = selectedClassId;

      const res = await api.get<{ summary: RiskSummary; students: AtRiskStudent[] }>(
        '/attendance/risk-insights',
        params
      );
      if (res) {
        setSummary(res.summary || null);
        setStudents(res.students || []);
      }
    } catch (err: any) {
      alertCompat('Error', err?.message || 'Failed to load attendance risk insights');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [lookbackDays, selectedClassId]);

  useEffect(() => {
    fetchRiskData();
  }, [fetchRiskData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRiskData();
  };

  const openInterventionModal = (student: AtRiskStudent) => {
    Haptics.selectionAsync();
    setSelectedStudent(student);
    setInterventionStatus(student.intervention_status || 'parent_contacted');
    setInterventionNotes(student.intervention_notes || '');
    setModalVisible(true);
  };

  const handleSaveIntervention = async () => {
    if (!selectedStudent) return;
    const targetStudentId = selectedStudent.student_id || selectedStudent.id;
    if (!targetStudentId) return;
    try {
      setSavingIntervention(true);
      await api.patch(`/attendance/interventions/${targetStudentId}`, {
        status: interventionStatus,
        notes: interventionNotes.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      alertCompat('Success', 'Intervention recorded successfully');
      setModalVisible(false);
      fetchRiskData();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      alertCompat('Error', err?.message || 'Failed to save intervention');
    } finally {
      setSavingIntervention(false);
    }
  };

  const resetAllFilters = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearchQuery('');
    setRiskFilter('all');
    setStatusFilter('all');
    setSelectedClassId(null);
  };

  // Student Tier categorization
  const getStudentTierInfo = useCallback(
    (item: AtRiskStudent) => {
      const normState = String(item.risk_state || '').toUpperCase();
      const sessions = item.total_sessions || 0;
      const pct = item.attendance_percentage;

      if (sessions === 0 || pct == null) {
        return {
          tier: 'no_data' as const,
          label: 'No Data Yet',
          badgeText: 'No Records',
          color: isDark ? '#94A3B8' : '#64748B',
          bg: isDark ? 'rgba(148, 163, 184, 0.12)' : '#F1F5F9',
          borderColor: isDark ? 'rgba(148, 163, 184, 0.25)' : '#E2E8F0',
          iconName: 'help-circle-outline' as const,
          gradient: ['#64748B', '#94A3B8'] as [string, string],
        };
      }

      if (normState === 'BELOW_THRESHOLD' || pct < 75) {
        return {
          tier: 'critical' as const,
          label: 'Critical (<75%)',
          badgeText: 'Below 75%',
          color: '#EF4444',
          bg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
          borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA',
          iconName: 'alert-circle' as const,
          gradient: PremiumGradients.danger,
        };
      }

      if (normState === 'APPROACHING_RISK' || (pct >= 75 && pct < 80)) {
        return {
          tier: 'approaching' as const,
          label: 'Approaching (75-80%)',
          badgeText: '75% - 80%',
          color: '#F59E0B',
          bg: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
          borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
          iconName: 'warning-outline' as const,
          gradient: PremiumGradients.warning,
        };
      }

      return {
        tier: 'healthy' as const,
        label: 'Healthy (≥80%)',
        badgeText: 'HEALTHY (≥80%)',
        color: '#10B981',
        bg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
        borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
        iconName: 'checkmark-circle-outline' as const,
        gradient: PremiumGradients.success,
      };
    },
    [isDark]
  );

  const getInterventionBadge = (status: string | null | undefined, tier: string) => {
    if (tier === 'healthy' && (!status || status === 'not_reviewed')) {
      return {
        label: 'Good Standing',
        icon: 'checkmark-circle' as const,
        bg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
        text: '#059669',
        border: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
      };
    }
    const norm = String(status || '').toLowerCase();
    switch (norm) {
      case 'resolved':
        return {
          label: 'Resolved',
          icon: 'checkmark-done-circle' as const,
          bg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
          text: '#059669',
          border: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
        };
      case 'parent_contacted':
        return {
          label: 'Parent Contacted',
          icon: 'call-outline' as const,
          bg: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
          text: '#2563EB',
          border: isDark ? 'rgba(59, 130, 246, 0.3)' : '#BFDBFE',
        };
      case 'monitoring':
        return {
          label: 'Monitoring',
          icon: 'eye-outline' as const,
          bg: isDark ? 'rgba(168, 85, 247, 0.15)' : '#FAF5FF',
          text: '#9333EA',
          border: isDark ? 'rgba(168, 85, 247, 0.3)' : '#E9D5FF',
        };
      default:
        return {
          label: 'Not Reviewed',
          icon: 'time-outline' as const,
          bg: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
          text: '#DC2626',
          border: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FECACA',
        };
    }
  };

  // Computed summary based on authoritative student classification
  const computedSummary = useMemo<RiskSummary>(() => {
    if (!students.length && summary) return summary;
    let healthy = 0;
    let approachingRisk = 0;
    let belowThreshold = 0;
    let notReviewed = 0;
    let resolved = 0;

    for (const s of students) {
      const tier = getStudentTierInfo(s).tier;
      if (tier === 'critical') belowThreshold++;
      else if (tier === 'approaching') approachingRisk++;
      else if (tier === 'healthy') healthy++;

      const isResolved = s.intervention_status === 'resolved';
      if (isResolved) {
        resolved++;
      } else if (tier !== 'healthy' && (!s.intervention_status || s.intervention_status === 'not_reviewed')) {
        notReviewed++;
      }
    }

    return {
      total: students.length || summary?.total || 0,
      healthy,
      approachingRisk,
      belowThreshold,
      notReviewed,
      resolved,
    };
  }, [students, summary, getStudentTierInfo]);

  // Client-side filtering
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const tierInfo = getStudentTierInfo(s);

      if (riskFilter !== 'all') {
        if (riskFilter === 'low_sample') {
          if ((s.total_sessions || 0) >= 5) {
            return false;
          }
        } else if (tierInfo.tier !== riskFilter) {
          return false;
        }
      }

      if (statusFilter !== 'all') {
        if (statusFilter === 'not_reviewed') {
          const isNotReviewed =
            (!s.intervention_status || s.intervention_status === 'not_reviewed') &&
            tierInfo.tier !== 'healthy';
          if (!isNotReviewed) return false;
        } else if (s.intervention_status !== statusFilter) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = (s.student_name || '').toLowerCase();
        const adm = (s.admission_no || '').toLowerCase();
        const cls = (s.class_name || '').toLowerCase();
        const sec = (s.section_name || '').toLowerCase();
        const fullClass = `${cls} - ${sec}`.toLowerCase();
        const fullClass2 = `${cls} ${sec}`.toLowerCase();

        const matchesSearch =
          name.includes(q) ||
          adm.includes(q) ||
          cls.includes(q) ||
          sec.includes(q) ||
          fullClass.includes(q) ||
          fullClass2.includes(q);

        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [students, searchQuery, riskFilter, statusFilter, getStudentTierInfo]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    riskFilter !== 'all' ||
    statusFilter !== 'all' ||
    selectedClassId !== null;

  // Pagination Calculations
  const totalItems = filteredStudents.length;
  const effectivePageSize = pageSize === 0 ? Math.max(1, totalItems) : pageSize;
  const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedStudents = useMemo(() => {
    if (pageSize === 0) return filteredStudents;
    const start = (validPage - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, validPage, pageSize]);

  const startIndex = totalItems === 0 ? 0 : (validPage - 1) * effectivePageSize + 1;
  const endIndex = Math.min(validPage * effectivePageSize, totalItems);

  const handlePageChange = (newPage: number) => {
    Haptics.selectionAsync();
    setCurrentPage(newPage);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const handleToggleSummaryCard = (type: 'critical' | 'approaching' | 'not_reviewed' | 'resolved') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (type === 'critical') {
      setRiskFilter((prev) => (prev === 'critical' ? 'all' : 'critical'));
    } else if (type === 'approaching') {
      setRiskFilter((prev) => (prev === 'approaching' ? 'all' : 'approaching'));
    } else if (type === 'not_reviewed') {
      setStatusFilter((prev) => (prev === 'not_reviewed' ? 'all' : 'not_reviewed'));
    } else if (type === 'resolved') {
      setStatusFilter((prev) => (prev === 'resolved' ? 'all' : 'resolved'));
    }
  };

  // ─── Render: Student Card ────────────────────────────────────────────────

  const renderStudentItem = ({ item }: { item: AtRiskStudent }) => {
    const tier = getStudentTierInfo(item);
    const intBadge = getInterventionBadge(item.intervention_status, tier.tier);
    const pctNumber = item.attendance_percentage != null ? item.attendance_percentage : 0;
    const pctDisplay = item.attendance_percentage != null ? `${item.attendance_percentage}%` : 'N/A';
    const initials = (item.student_name || 'S')
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    // Stat items for the mini-card grid
    const statItems = [
      { value: item.total_sessions || 0, label: 'Total Days', color: isDark ? '#F1F5F9' : '#1E293B', icon: 'calendar-outline' as const },
      { value: item.present_count || 0, label: 'Present', color: '#10B981', icon: 'checkmark-circle-outline' as const },
      { value: item.absent_count || 0, label: 'Absent', color: '#EF4444', icon: 'close-circle-outline' as const },
      { value: item.half_day_count || 0, label: 'Half-Days', color: '#F59E0B', icon: 'time-outline' as const },
    ];

    return (
      <Animated.View
        entering={FadeInDown.duration(320).springify().damping(16)}
        style={[
          styles.studentCard,
          {
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.82)',
            borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.6)',
            shadowColor: isDark ? '#000' : tier.color,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: isDark ? 0.45 : 0.1,
            shadowRadius: 20,
            elevation: 6,
          },
        ]}
      >
        {/* ── Top edge shine highlight ── */}
        <LinearGradient
          colors={[
            isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.95)',
            isDark ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,0)',
          ]}
          style={styles.cardShineStrip}
        />

        {/* ── Gradient accent bar (left edge) ── */}
        <LinearGradient
          colors={[...tier.gradient, `${tier.color}40`] as any}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.cardAccentBar}
        />

        <View style={styles.cardContent}>
          {/* ── Header Row: Avatar + Info + Percentage ── */}
          <View style={styles.cardHeader}>
            <View style={styles.studentInfoLeft}>
              {/* Glowing Avatar with ring */}
              <View style={[
                styles.avatarRing,
                {
                  borderColor: `${tier.color}30`,
                  shadowColor: tier.color,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.35,
                  shadowRadius: 10,
                  elevation: 4,
                },
              ]}>
                <LinearGradient
                  colors={tier.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarCircle}
                >
                  <Text style={styles.avatarText}>{initials}</Text>
                </LinearGradient>
              </View>

              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text
                    style={[styles.studentName, { color: isDark ? '#F8FAFC' : '#0F172A' }]}
                    numberOfLines={1}
                  >
                    {item.student_name}
                  </Text>
                  <View
                    style={[
                      styles.classChip,
                      {
                        backgroundColor: isDark ? 'rgba(129,140,248,0.12)' : 'rgba(79,70,229,0.06)',
                        borderColor: isDark ? 'rgba(129,140,248,0.25)' : 'rgba(79,70,229,0.12)',
                      },
                    ]}
                  >
                    <Ionicons name="school-outline" size={9} color={isDark ? '#A5B4FC' : '#6366F1'} style={{ marginRight: 3 }} />
                    <Text style={[styles.classChipTxt, { color: isDark ? '#A5B4FC' : '#4F46E5' }]}>
                      {item.class_name || 'Class'} - {item.section_name || 'A'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.admNo, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  Adm: {item.admission_no}
                </Text>
              </View>
            </View>

            {/* Gradient Percentage Badge */}
            <View style={styles.pctBadgeOuter}>
              <LinearGradient
                colors={tier.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.pctBadgeGradient}
              >
                <Text style={styles.pctValue}>{pctDisplay}</Text>
              </LinearGradient>
              <View style={[
                styles.pctLabelStrip,
                {
                  backgroundColor: tier.bg,
                  borderColor: tier.borderColor,
                },
              ]}>
                <Ionicons name={tier.iconName} size={9} color={tier.color} />
                <Text style={[styles.pctLabel, { color: tier.color }]}>{tier.badgeText}</Text>
              </View>
            </View>
          </View>

          {/* ── Progress Bar with glow ── */}
          <View style={styles.progressWrapper}>
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)' },
              ]}
            >
              <LinearGradient
                colors={[tier.gradient[0], tier.gradient[1], `${tier.gradient[1]}CC`]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[
                  styles.progressBar,
                  { width: `${Math.min(100, Math.max(0, pctNumber))}%` },
                ]}
              />
            </View>
            {/* Glow dot at end of progress */}
            {pctNumber > 0 && (
              <View
                style={[
                  styles.progressGlowDot,
                  {
                    left: `${Math.min(98, Math.max(2, pctNumber))}%`,
                    backgroundColor: tier.color,
                    shadowColor: tier.color,
                  },
                ]}
              />
            )}
          </View>

          {/* ── Stats Grid — Individual frosted mini-cards ── */}
          <View style={styles.statsGrid}>
            {statItems.map((stat, idx) => (
              <View
                key={idx}
                style={[
                  styles.statMiniCard,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.65)',
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : `${stat.color}15`,
                  },
                ]}
              >
                <Ionicons name={stat.icon} size={13} color={stat.color} style={{ marginBottom: 2 }} />
                <Text style={[styles.statMiniVal, { color: stat.color }]}>
                  {stat.value}
                </Text>
                <Text style={[styles.statMiniLbl, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>

          {/* ── Latest Note Callout ── */}
          {Boolean(item.intervention_notes) && (
            <View
              style={[
                styles.notesBox,
                {
                  backgroundColor: isDark ? 'rgba(129,140,248,0.06)' : 'rgba(99,102,241,0.04)',
                  borderColor: isDark ? 'rgba(129,140,248,0.15)' : 'rgba(99,102,241,0.1)',
                  borderLeftColor: '#818CF8',
                },
              ]}
            >
              <View style={styles.notesHeader}>
                <View style={[
                  styles.notesIconWrap,
                  { backgroundColor: isDark ? 'rgba(129,140,248,0.15)' : 'rgba(99,102,241,0.08)' },
                ]}>
                  <Ionicons name="chatbox-ellipses-outline" size={11} color="#818CF8" />
                </View>
                <Text style={styles.notesLbl}>Latest Action Note</Text>
              </View>
              <Text
                style={[styles.notesTxt, { color: isDark ? '#CBD5E1' : '#334155' }]}
                numberOfLines={2}
              >
                "{item.intervention_notes}"
              </Text>
            </View>
          )}

          {/* ── Separator ── */}
          <View style={[
            styles.cardDivider,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' },
          ]} />

          {/* ── Footer with Status and Intervene Button ── */}
          <View style={styles.interventionFooter}>
            <View
              style={[
                styles.intBadge,
                {
                  backgroundColor: intBadge.bg,
                  borderColor: intBadge.border,
                },
              ]}
            >
              <Ionicons name={intBadge.icon} size={13} color={intBadge.text} />
              <Text style={[styles.intBadgeTxt, { color: intBadge.text }]}>{intBadge.label}</Text>
            </View>

            <TouchableOpacity
              style={styles.interveneBtn}
              onPress={() => openInterventionModal(item)}
              activeOpacity={0.75}
            >
              <LinearGradient
                colors={['#4F46E5', '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.interveneBtnGradient}
              >
                <Feather name="edit-3" size={12} color="#FFFFFF" />
                <Text style={styles.interveneBtnTxt}>Intervene</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  // ─── Render: Main ───────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Mesh gradient background */}
      <LinearGradient
        colors={
          isDark
            ? ['#0B0F19', '#0F172A', '#1E1B4B', '#0F172A']
            : ['#F8FAFC', '#EEF2FF', '#F0F9FF', '#F8FAFC']
        }
        locations={[0, 0.3, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative glow orbs */}
      <View style={[styles.glowOrb, styles.glowOrb1, { backgroundColor: isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.06)' }]} />
      <View style={[styles.glowOrb, styles.glowOrb2, { backgroundColor: isDark ? 'rgba(236,72,153,0.06)' : 'rgba(236,72,153,0.04)' }]} />

      <TourTarget id="screen.admin-attendance-risk.overview"><AdminHeader title="Attendance Risk Intelligence" showBackButton={true} /></TourTarget>

      <FlatList
        ref={flatListRef}
        data={paginatedStudents}
        keyExtractor={(s: any) => String(s.student_id || s.id || s.admission_no)}
        renderItem={renderStudentItem}
        contentContainerStyle={[styles.listContent, isDesktop && styles.desktopContainer]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#818CF8" />
        }
        ListHeaderComponent={
          <View style={styles.headerSection}>
            {/* ─── Executive Summary 2×2 Gradient Glass Cards ─── */}
            {computedSummary && (
              <View style={styles.summaryGrid}>
                {SUMMARY_CARDS.map((card) => {
                  const isRiskFilter = card.filterType === 'risk';
                  const isActive = isRiskFilter
                    ? riskFilter === card.key
                    : statusFilter === card.key;

                  return (
                    <TouchableOpacity
                      key={card.key}
                      style={[
                        styles.summaryCard,
                        { shadowColor: card.glowColor },
                        isActive && styles.summaryCardActive,
                      ]}
                      onPress={() => handleToggleSummaryCard(card.key as any)}
                      activeOpacity={0.85}
                    >
                      <LinearGradient
                        colors={card.gradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.summaryGradientBg}
                      >
                        {/* Specular glass shine strip at top */}
                        <View style={styles.summaryShineLine} />

                        {/* Ambient decorative corner glow */}
                        <View style={styles.summaryCornerGlow} />

                        {/* Translucent background watermark icon */}
                        <Ionicons
                          name={card.icon}
                          size={66}
                          color="#FFFFFF"
                          style={styles.summaryWatermarkIcon}
                        />

                        {/* Lighting gradient overlay (highlights top, preserves rich color) */}
                        <LinearGradient
                          colors={['rgba(255,255,255,0.24)', 'rgba(255,255,255,0.03)', 'rgba(0,0,0,0.12)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.summaryGlassOverlay}
                        >
                          <View style={styles.summaryCardTop}>
                            <View style={styles.summaryIconWrap}>
                              <Ionicons name={card.icon} size={18} color="#FFFFFF" />
                            </View>
                            {isActive ? (
                              <View style={styles.activeFilterPill}>
                                <View style={styles.activeFilterDot} />
                                <Text style={styles.activeFilterPillText}>FILTERED</Text>
                              </View>
                            ) : (
                              <View style={styles.summaryFilterHint}>
                                <Ionicons name="funnel-outline" size={10} color="rgba(255,255,255,0.65)" />
                              </View>
                            )}
                          </View>

                          <Text style={styles.sumVal}>
                            {computedSummary[card.valueKey]}
                          </Text>
                          <View style={styles.statAccentLine} />
                          <Text style={styles.sumLbl} numberOfLines={1}>{card.label}</Text>
                          <Text style={styles.sumSub} numberOfLines={1}>{card.sub}</Text>
                        </LinearGradient>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ─── Scope Bar: Lookback Days & Classes ─── */}
            <View style={styles.scopeBar}>
              <TourScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scopeScrollContent}
              >
                <View style={styles.scopeGroup}>
                  <Text style={[styles.scopeGroupLabel, { color: isDark ? '#A5B4FC' : '#6366F1' }]}>
                    Horizon:
                  </Text>
                  {[30, 60, 90].map((days) => {
                    const isActive = lookbackDays === days;
                    return (
                      <TouchableOpacity
                        key={days}
                        style={[styles.horizonPill]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setLookbackDays(days);
                        }}
                      >
                        {isActive ? (
                          <LinearGradient
                            colors={PremiumGradients.indigo}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.horizonPillGradient}
                          >
                            <Text style={[styles.horizonPillTxt, { color: '#FFFFFF', fontWeight: '700' }]}>
                              {days}D
                            </Text>
                          </LinearGradient>
                        ) : (
                          <View
                            style={[
                              styles.horizonPillInner,
                              {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)',
                                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(99,102,241,0.15)',
                              },
                            ]}
                          >
                            <Text style={[styles.horizonPillTxt, { color: isDark ? '#E2E8F0' : '#475569' }]}>
                              {days}D
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {classes.length > 0 && (
                  <View style={styles.scopeGroup}>
                    <Text style={[styles.scopeGroupLabel, { color: isDark ? '#A5B4FC' : '#6366F1' }]}>
                      Class:
                    </Text>
                    {[{ id: null, name: 'All Classes' }, ...classes.map(c => ({ id: String(c.id), name: c.name }))].map((c) => {
                      const isActive = selectedClassId === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id ?? 'all'}
                          style={[styles.horizonPill]}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setSelectedClassId(c.id);
                          }}
                        >
                          {isActive ? (
                            <LinearGradient
                              colors={PremiumGradients.indigo}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={styles.horizonPillGradient}
                            >
                              <Text style={[styles.horizonPillTxt, { color: '#FFFFFF', fontWeight: '700' }]}>
                                {c.name}
                              </Text>
                            </LinearGradient>
                          ) : (
                            <View
                              style={[
                                styles.horizonPillInner,
                                {
                                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)',
                                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(99,102,241,0.15)',
                                },
                              ]}
                            >
                              <Text style={[styles.horizonPillTxt, { color: isDark ? '#E2E8F0' : '#475569' }]}>
                                {c.name}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </TourScrollView>
            </View>

            {/* ─── Frosted Glass Search Bar ─── */}
            <TourTarget id="screen.admin-attendance-risk.workspace" native><View
              style={[
                styles.searchBar,
                glassCard(isDark, false),
                { borderRadius: 16, padding: 0 },
              ]}
            >
              <View style={styles.searchInner}>
                <View style={[styles.searchIconWrap, { backgroundColor: isDark ? 'rgba(129,140,248,0.15)' : 'rgba(79,70,229,0.1)' }]}>
                  <Ionicons name="search-outline" size={16} color={isDark ? '#A5B4FC' : '#4F46E5'} />
                </View>
                <TextInput
                  style={[styles.searchInput, { color: isDark ? '#F8FAFC' : '#1E293B' }]}
                  placeholder="Search student, admission no, or class..."
                  placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {Boolean(searchQuery) && (
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSearchQuery('');
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.searchClearBtn}
                  >
                    <Ionicons name="close-circle" size={18} color={isDark ? '#64748B' : '#94A3B8'} />
                  </TouchableOpacity>
                )}
              </View>
            </View></TourTarget>

            {/* ─── Risk Tier Filter Chips ─── */}
            <View style={styles.filterSection}>
              <TourScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChipScroll}
              >
                {([
                  { key: 'all' as const, label: 'All Tiers', gradient: PremiumGradients.indigo, color: '#4F46E5' },
                  { key: 'critical' as const, label: 'Critical (<75%)', gradient: PremiumGradients.danger, color: '#EF4444' },
                  { key: 'approaching' as const, label: 'Approaching (75-80%)', gradient: PremiumGradients.warning, color: '#D97706' },
                  { key: 'healthy' as const, label: 'Healthy (≥80%)', gradient: PremiumGradients.success, color: '#059669' },
                  { key: 'low_sample' as const, label: 'New (<5 Days)', gradient: PremiumGradients.sky, color: '#0284C7' },
                ]).map((chip) => {
                  const isActive = riskFilter === chip.key;
                  return (
                    <TouchableOpacity
                      key={chip.key}
                      style={styles.filterChipOuter}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setRiskFilter(chip.key);
                      }}
                    >
                      {isActive ? (
                        <LinearGradient
                          colors={chip.gradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.filterChipGradient}
                        >
                          <Text style={styles.filterChipTxtOn}>{chip.label}</Text>
                        </LinearGradient>
                      ) : (
                        <View
                          style={[
                            styles.filterChipInactive,
                            {
                              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.85)',
                              borderColor: isDark
                                ? `${chip.color}30`
                                : `${chip.color}20`,
                            },
                          ]}
                        >
                          <Text style={[styles.filterChipTxt, { color: chip.color }]}>
                            {chip.label}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </TourScrollView>
            </View>

            {/* ─── Secondary Status Filter Row ─── */}
            <View style={styles.statusFilterSection}>
              <TourScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChipScroll}
              >
                {([
                  { key: 'all', label: 'All Status' },
                  { key: 'not_reviewed', label: 'Not Reviewed' },
                  { key: 'parent_contacted', label: 'Parent Contacted' },
                  { key: 'monitoring', label: 'Monitoring' },
                  { key: 'resolved', label: 'Resolved' },
                ] as const).map((opt) => {
                  const isActive = statusFilter === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.statusPill,
                        {
                          backgroundColor: isActive
                            ? isDark ? '#818CF8' : '#4F46E5'
                            : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.85)',
                          borderColor: isActive
                            ? isDark ? '#6366F1' : '#4338CA'
                            : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(99,102,241,0.12)',
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setStatusFilter(opt.key);
                      }}
                    >
                      <Text
                        style={[
                          styles.statusPillTxt,
                          {
                            color: isActive
                              ? '#FFFFFF'
                              : isDark ? '#94A3B8' : '#64748B',
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </TourScrollView>
            </View>

            {/* ─── Results Bar ─── */}
            <View style={styles.resultsBar}>
              <Text style={[styles.resultsCountTxt, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                {totalItems === 0
                  ? 'Showing 0 students'
                  : pageSize === 0 || totalItems <= effectivePageSize
                  ? `Showing ${totalItems} of ${students.length} students`
                  : `Showing ${startIndex}–${endIndex} of ${totalItems} students (from ${students.length} total)`}
              </Text>
              {hasActiveFilters && (
                <TouchableOpacity style={styles.resetBtn} onPress={resetAllFilters}>
                  <LinearGradient
                    colors={PremiumGradients.indigo}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.resetBtnGradient}
                  >
                    <Ionicons name="refresh" size={12} color="#FFFFFF" />
                    <Text style={styles.resetBtnTxt}>Clear</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <Animated.View entering={FadeIn.duration(400)} style={styles.emptyState}>
              <View style={styles.emptyGlowRing}>
                <LinearGradient
                  colors={PremiumGradients.success}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.emptyIconCircle}
                >
                  <Ionicons name="shield-checkmark-outline" size={40} color="#FFFFFF" />
                </LinearGradient>
              </View>
              <Text style={[styles.emptyTitle, { color: isDark ? '#F8FAFC' : '#1E293B' }]}>
                No Matching Students Found
              </Text>
              <Text style={[styles.emptySub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                {hasActiveFilters
                  ? 'No students match your active search and filter combinations.'
                  : 'All evaluated students currently maintain attendance above risk thresholds.'}
              </Text>
              {hasActiveFilters && (
                <TouchableOpacity style={styles.emptyResetBtn} onPress={resetAllFilters}>
                  <LinearGradient
                    colors={PremiumGradients.indigo}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.emptyResetGradient}
                  >
                    <Text style={styles.emptyResetBtnTxt}>Reset All Filters</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </Animated.View>
          ) : (
            <View style={styles.loaderArea}>
              <LogoLoader size={60} color="#818CF8" />
              <Text style={[styles.loaderTxt, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Analyzing attendance patterns...
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          filteredStudents.length > 0 ? (
            <View
              style={[
                styles.paginationCard,
                glassCard(isDark, true),
              ]}
            >
              {/* Pagination Controls Row */}
              <View style={styles.paginationMainRow}>
                <TouchableOpacity
                  disabled={validPage <= 1}
                  onPress={() => handlePageChange(Math.max(1, validPage - 1))}
                  style={[
                    styles.pageBtn,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)',
                      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(99,102,241,0.12)',
                    },
                    validPage <= 1 && { opacity: 0.35 },
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="chevron-back"
                    size={16}
                    color={isDark ? '#E2E8F0' : '#4F46E5'}
                  />
                  <Text
                    style={[
                      styles.pageBtnTxt,
                      { color: isDark ? '#E2E8F0' : '#4F46E5' },
                    ]}
                  >
                    Prev
                  </Text>
                </TouchableOpacity>

                <View style={styles.pageInfoCenter}>
                  <Text style={[styles.pageIndicatorTxt, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                    Page <Text style={{ fontWeight: '800', color: '#818CF8' }}>{validPage}</Text> of{' '}
                    <Text style={{ fontWeight: '800' }}>{totalPages}</Text>
                  </Text>
                  <Text style={[styles.pageSubCount, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                    {pageSize === 0
                      ? `All ${totalItems} students`
                      : `${startIndex}–${endIndex} of ${totalItems} students`}
                  </Text>
                </View>

                <TouchableOpacity
                  disabled={validPage >= totalPages}
                  onPress={() => handlePageChange(Math.min(totalPages, validPage + 1))}
                  style={[
                    styles.pageBtn,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)',
                      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(99,102,241,0.12)',
                    },
                    validPage >= totalPages && { opacity: 0.35 },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.pageBtnTxt,
                      { color: isDark ? '#E2E8F0' : '#4F46E5' },
                    ]}
                  >
                    Next
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={isDark ? '#E2E8F0' : '#4F46E5'}
                  />
                </TouchableOpacity>
              </View>

              {/* Page Size Selector */}
              <View style={styles.pageSizeRow}>
                <Text style={[styles.pageSizeLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  Per page:
                </Text>
                {([
                  { label: '10', value: 10 },
                  { label: '20', value: 20 },
                  { label: '50', value: 50 },
                  { label: 'All', value: 0 },
                ] as const).map((sz) => {
                  const isSelected = pageSize === sz.value;
                  return (
                    <TouchableOpacity
                      key={sz.label}
                      style={[styles.pageSizePill]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setPageSize(sz.value);
                      }}
                      activeOpacity={0.7}
                    >
                      {isSelected ? (
                        <LinearGradient
                          colors={PremiumGradients.indigo}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.pageSizePillGradient}
                        >
                          <Text style={[styles.pageSizePillTxt, { color: '#FFFFFF', fontWeight: '700' }]}>
                            {sz.label}
                          </Text>
                        </LinearGradient>
                      ) : (
                        <View
                          style={[
                            styles.pageSizePillInner,
                            {
                              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)',
                              borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(99,102,241,0.12)',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.pageSizePillTxt,
                              { color: isDark ? '#CBD5E1' : '#475569' },
                            ]}
                          >
                            {sz.label}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null
        }
      />

      {/* ─── Premium Glass Intervention Modal ─── */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View
            entering={FadeInDown.duration(350).springify().damping(20)}
            style={[
              styles.modalCard,
              glassCard(isDark, true),
              { borderRadius: 24 },
            ]}
          >
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                  Attendance Intervention
                </Text>
                <Text style={[styles.modalSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  Log contact and corrective actions
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setModalVisible(false);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[
                  styles.modalCloseBtn,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' },
                ]}
              >
                <Ionicons name="close" size={18} color={isDark ? '#94A3B8' : '#64748B'} />
              </TouchableOpacity>
            </View>

            {/* Selected Student Banner */}
            {selectedStudent && (
              <View
                style={[
                  styles.modalStudentCard,
                  glassInnerPanel(isDark),
                ]}
              >
                <View style={styles.modalStudentLeft}>
                  <Text
                    style={[styles.modalStudentName, { color: isDark ? '#F8FAFC' : '#0F172A' }]}
                  >
                    {selectedStudent.student_name}
                  </Text>
                  <Text style={[styles.modalStudentMeta, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                    Adm: {selectedStudent.admission_no} • {selectedStudent.class_name} -{' '}
                    {selectedStudent.section_name}
                  </Text>
                </View>
                <View style={styles.modalStudentRight}>
                  <Text style={[styles.modalPct, { color: '#818CF8' }]}>
                    {selectedStudent.attendance_percentage != null
                      ? `${selectedStudent.attendance_percentage}%`
                      : 'N/A'}
                  </Text>
                  <Text style={styles.modalPctLbl}>Attendance</Text>
                </View>
              </View>
            )}

            {/* Status Selection */}
            <Text style={[styles.inputLabel, { color: isDark ? '#A5B4FC' : '#4F46E5' }]}>
              Update Intervention Status
            </Text>
            <View style={styles.statusOptionsGrid}>
              {([
                { key: 'not_reviewed', label: 'Not Reviewed', icon: 'time-outline', color: '#DC2626', gradient: PremiumGradients.danger },
                { key: 'parent_contacted', label: 'Parent Contacted', icon: 'call-outline', color: '#2563EB', gradient: ['#3B82F6', '#60A5FA'] as [string, string] },
                { key: 'monitoring', label: 'Monitoring', icon: 'eye-outline', color: '#9333EA', gradient: PremiumGradients.purple },
                { key: 'resolved', label: 'Resolved', icon: 'checkmark-circle-outline', color: '#059669', gradient: PremiumGradients.success },
              ] as const).map((st) => {
                const isSelected = interventionStatus === st.key;
                return (
                  <TouchableOpacity
                    key={st.key}
                    style={[
                      styles.statusTile,
                      {
                        borderColor: isSelected
                          ? st.color
                          : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(99,102,241,0.1)',
                        backgroundColor: isSelected
                          ? isDark ? 'rgba(255,255,255,0.08)' : `${st.color}10`
                          : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
                      },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setInterventionStatus(st.key);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={st.icon as any}
                      size={16}
                      color={isSelected ? st.color : isDark ? '#94A3B8' : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.statusTileTxt,
                        {
                          color: isSelected ? st.color : isDark ? '#E2E8F0' : '#475569',
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {st.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Quick Action Notes */}
            <Text style={[styles.inputLabel, { color: isDark ? '#A5B4FC' : '#4F46E5' }]}>
              Quick Action Presets
            </Text>
            <TourScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickNotesScroll}
            >
              {QUICK_NOTES.map((qn, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.quickNoteChip,
                    {
                      backgroundColor: isDark ? 'rgba(129,140,248,0.1)' : 'rgba(79,70,229,0.06)',
                      borderColor: isDark ? 'rgba(129,140,248,0.2)' : 'rgba(79,70,229,0.12)',
                    },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setInterventionNotes((prev) => (prev ? `${prev}\n${qn}` : qn));
                  }}
                >
                  <Text style={[styles.quickNoteChipTxt, { color: isDark ? '#A5B4FC' : '#4F46E5' }]}>{qn}</Text>
                </TouchableOpacity>
              ))}
            </TourScrollView>

            {/* Notes TextInput */}
            <Text style={[styles.inputLabel, { color: isDark ? '#A5B4FC' : '#4F46E5' }]}>
              Intervention Action Details
            </Text>
            <TextInput
              style={[
                styles.notesInput,
                glassInnerPanel(isDark),
                {
                  color: isDark ? '#F8FAFC' : '#0F172A',
                },
              ]}
              placeholder="Record interaction summary, parent response, reason for absence, and follow-up plan..."
              placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
              value={interventionNotes}
              onChangeText={setInterventionNotes}
              multiline
              numberOfLines={4}
            />

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.cancelBtn,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)',
                  },
                ]}
                onPress={() => setModalVisible(false)}
                disabled={savingIntervention}
              >
                <Text style={[styles.cancelBtnTxt, { color: isDark ? '#CBD5E1' : '#475569' }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveIntervention}
                disabled={savingIntervention}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#4F46E5', '#7C3AED']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.saveBtnGradient}
                >
                  {savingIntervention ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={styles.saveBtnTxt}>Save Record</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Decorative glow orbs
  glowOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  glowOrb1: {
    width: 250,
    height: 250,
    top: 80,
    right: -80,
  },
  glowOrb2: {
    width: 200,
    height: 200,
    top: 320,
    left: -60,
  },

  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  desktopContainer: {
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },
  headerSection: {
    marginBottom: 8,
  },

  // ─── Summary Grid ─────────────────────────────────
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    width: '48.2%',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.26)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  summaryCardActive: {
    borderColor: 'rgba(255,255,255,0.95)',
    borderWidth: 2,
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 10,
    transform: [{ scale: 1.02 }],
  },
  summaryGradientBg: {
    flex: 1,
    borderRadius: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  summaryShineLine: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 1,
    zIndex: 2,
  },
  summaryCornerGlow: {
    position: 'absolute',
    top: -18,
    right: -18,
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.14)',
    zIndex: 1,
  },
  summaryWatermarkIcon: {
    position: 'absolute',
    right: -6,
    bottom: -8,
    opacity: 0.13,
    transform: [{ rotate: '-12deg' }],
    zIndex: 1,
  },
  summaryGlassOverlay: {
    flex: 1,
    padding: 14,
    paddingTop: 13,
    zIndex: 3,
  },
  summaryCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.42)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  summaryFilterHint: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  activeFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  activeFilterDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  activeFilterPillText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.8,
  },
  sumVal: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.8,
    lineHeight: 36,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  statAccentLine: {
    width: 18,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginTop: 2,
    marginBottom: 4,
  },
  sumLbl: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  sumSub: {
    fontSize: 10.5,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.80)',
    marginTop: 2,
  },

  // ─── Scope Bar ────────────────────────────────────
  scopeBar: {
    marginBottom: 14,
  },
  scopeScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 2,
  },
  scopeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scopeGroupLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginRight: 2,
    letterSpacing: 0.3,
  },
  horizonPill: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  horizonPillGradient: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  horizonPillInner: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  horizonPillTxt: {
    fontSize: 11.5,
    fontWeight: '600',
  },

  // ─── Search Bar ───────────────────────────────────
  searchBar: {
    marginBottom: 14,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: Platform.OS === 'web' ? 4 : 2,
  },
  searchIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    padding: 0,
    paddingVertical: 8,
  },
  searchClearBtn: {
    padding: 8,
  },

  // ─── Filter Chips ─────────────────────────────────
  filterSection: {
    marginBottom: 8,
  },
  statusFilterSection: {
    marginBottom: 14,
  },
  filterChipScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  filterChipOuter: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  filterChipGradient: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 22,
  },
  filterChipInactive: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 22,
    borderWidth: 1,
  },
  filterChipTxt: {
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTxtOn: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ─── Status Filter Pills ──────────────────────────
  statusPill: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusPillTxt: {
    fontSize: 11.5,
    fontWeight: '600',
  },

  // ─── Results Bar ──────────────────────────────────
  resultsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  resultsCountTxt: {
    fontSize: 12,
  },
  resetBtn: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  resetBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  resetBtnTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ─── Student Card ─────────────────────────────────
  studentCard: {
    marginBottom: 16,
    flexDirection: 'row',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardShineStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    zIndex: 2,
  },
  cardAccentBar: {
    width: 5,
  },
  cardContent: {
    flex: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 10,
  },
  studentInfoLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  avatarCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  studentName: {
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  classChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  classChipTxt: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  admNo: {
    fontSize: 11,
    marginTop: 3,
    fontWeight: '500',
  },

  // ─── Percentage Badge ─────────────────────────────
  pctBadgeOuter: {
    alignItems: 'center',
    gap: 4,
  },
  pctBadgeGradient: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    alignItems: 'center',
    minWidth: 56,
  },
  pctValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  pctLabelStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    borderWidth: 1,
  },
  pctLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  // ─── Progress Bar ─────────────────────────────────
  progressWrapper: {
    position: 'relative',
    marginBottom: 14,
    height: 8,
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressGlowDot: {
    position: 'absolute',
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: -4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },

  // ─── Stats Grid (Individual Mini-Cards) ───────────
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statMiniCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  statMiniVal: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  statMiniLbl: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.2,
  },

  // ─── Notes Box ────────────────────────────────────
  notesBox: {
    padding: 11,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 3,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  notesIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesLbl: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#818CF8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesTxt: {
    fontSize: 11.5,
    fontStyle: 'italic',
    lineHeight: 17,
    paddingLeft: 28,
  },

  // ─── Card Divider ─────────────────────────────────
  cardDivider: {
    height: 1,
    marginBottom: 12,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },

  // ─── Intervention Footer ──────────────────────────
  interventionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  intBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  intBadgeTxt: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  interveneBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  interveneBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  interveneBtnTxt: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  // ─── Empty State ──────────────────────────────────
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    gap: 14,
    paddingHorizontal: 20,
  },
  emptyGlowRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 8,
  },
  emptyIconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 320,
  },
  emptyResetBtn: {
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  emptyResetGradient: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyResetBtnTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ─── Loader ───────────────────────────────────────
  loaderArea: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  loaderTxt: {
    fontSize: 13,
    fontWeight: '500',
  },

  // ─── Modal ────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    padding: 22,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalStudentCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    marginBottom: 18,
  },
  modalStudentLeft: {
    flex: 1,
  },
  modalStudentName: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalStudentMeta: {
    fontSize: 11.5,
    marginTop: 3,
  },
  modalStudentRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  modalPct: {
    fontSize: 18,
    fontWeight: '900',
  },
  modalPctLbl: {
    fontSize: 9.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statusOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statusTile: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  statusTileTxt: {
    fontSize: 12,
  },
  quickNotesScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 14,
  },
  quickNoteChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  quickNoteChipTxt: {
    fontSize: 11,
    fontWeight: '600',
  },
  notesInput: {
    padding: 14,
    fontSize: 13,
    textAlignVertical: 'top',
    height: 90,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  cancelBtnTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  saveBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
  },
  saveBtnTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ─── Pagination ───────────────────────────────────
  paginationCard: {
    marginTop: 12,
    marginBottom: 36,
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 14,
  },
  paginationMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  pageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  pageBtnTxt: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  pageInfoCenter: {
    alignItems: 'center',
  },
  pageIndicatorTxt: {
    fontSize: 13,
    fontWeight: '600',
  },
  pageSubCount: {
    fontSize: 10.5,
    marginTop: 2,
  },
  pageSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  pageSizeLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  pageSizePill: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  pageSizePillGradient: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
  },
  pageSizePillInner: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  pageSizePillTxt: {
    fontSize: 12,
    fontWeight: '500',
  },
});
