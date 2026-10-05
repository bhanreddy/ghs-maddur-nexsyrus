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
  TextInput,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/services/apiClient';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import LogoLoader from '../../src/components/LogoLoader';
import * as Haptics from '../../src/utils/haptics';

interface UdiseSummary {
  totalStudents: number;
  readyCount: number;
  needsAttentionCount: number;
  criticalCount: number;
  duplicateCount: number;
  readinessPercentage: number;
  missingStats: {
    penNumber: number;
    aparNumber: number;
    aadhaarNumber: number;
    dob: number;
    parentName: number;
  };
}

interface ClassBreakdown {
  class_id: string;
  class_name: string;
  section_id: string;
  section_name: string;
  total: number;
  ready: number;
  needs_attention: number;
  critical: number;
  duplicate: number;
  readiness_percentage: number;
}

interface UdiseStudent {
  student_id: string;
  admission_no: string;
  student_name: string;
  class_name: string;
  section_name: string;
  gender: string;
  dob: string | null;
  pen_number: string | null;
  apar_number: string | null;
  aadhaar_number: string | null;
  father_name: string | null;
  mother_name: string | null;
  udise_status: 'ready' | 'needs_attention' | 'critical_incomplete' | 'duplicate';
  errors: { field: string; error: string }[];
  warnings: { field: string; error: string }[];
  is_ready: boolean;
}

export default function UdiseReadinessScreen() {
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<UdiseSummary | null>(null);
  const [classes, setClasses] = useState<ClassBreakdown[]>([]);
  const [students, setStudents] = useState<UdiseStudent[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [missingFilter, setMissingFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadOverview = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await api.get<{ summary: UdiseSummary; classBreakdown: ClassBreakdown[] }>('/udise/readiness');
      if (res) {
        setSummary(res.summary);
        setClasses(res.classBreakdown || []);
      }
    } catch (err: any) {
      alertCompat('Error', err?.message || 'Failed to load UDISE readiness overview');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadStudents = useCallback(async () => {
    try {
      const params: Record<string, string> = { limit: '200' };
      if (statusFilter) params.status = statusFilter;
      if (missingFilter) params.missing_field = missingFilter;
      if (selectedClassId) params.class_id = selectedClassId;
      const res = await api.get<{ students: UdiseStudent[] }>('/udise/students', params);
      if (res) {
        setStudents(res.students || []);
      }
    } catch (err: any) {
      console.warn('Failed to load UDISE students', err?.message);
    }
  }, [statusFilter, missingFilter, selectedClassId]);

  useFocusEffect(
    useCallback(() => {
      loadOverview(true);
      loadStudents();
    }, [loadOverview, loadStudents])
  );

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const handleOpenStudent = useCallback((studentId: string) => {
    if (!studentId) return;
    Haptics.selectionAsync();
    router.push({
      pathname: '/admin/addStudent',
      params: { id: studentId },
    });
  }, [router]);

  const onRefresh = () => {
    setRefreshing(true);
    loadOverview();
    loadStudents();
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      if (Platform.OS === 'web') {
        window.open('/api/v1/udise/export', '_blank');
      } else {
        alertCompat('Export Ready', 'UDISE CSV export generated. Access from desktop portal for full spreadsheet download.');
      }
    } catch (err: any) {
      alertCompat('Export Error', err?.message || 'Failed to generate export');
    } finally {
      setExporting(false);
    }
  };

  const filteredStudents = students.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.student_name?.toLowerCase().includes(q) ||
      s.admission_no?.toLowerCase().includes(q) ||
      s.pen_number?.toLowerCase().includes(q)
    );
  });

  const styles = getStyles(isDark);

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <AdminHeader title="UDISE+ Readiness Center" />
        <LogoLoader />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TourTarget id="screen.admin-udise-readiness.overview"><AdminHeader
        title="UDISE+ Readiness Center"
        rightAction={{
          icon: 'cloud-download-outline',
          onPress: handleExport,
        }}
      /></TourTarget>

      <TourScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Top Hero Banner */}
        <LinearGradient
          colors={['#4F46E5', '#6366F1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTextCol}>
            <Text style={styles.heroBadge}>GOVERNMENT COMPLIANCE AUDIT</Text>
            <Text style={styles.heroTitle}>UDISE+ School Readiness</Text>
            <Text style={styles.heroSub}>
              Validate student demographics, PEN, APAAR, and Aadhaar numbers prior to portal submission.
            </Text>
          </View>
          <View style={styles.heroScoreBox}>
            <Text style={styles.heroScoreVal}>{summary?.readinessPercentage ?? 0}%</Text>
            <Text style={styles.heroScoreLabel}>Compliant</Text>
          </View>
        </LinearGradient>

        {/* Quick Metric Cards */}
        <View style={styles.statsGrid}>
          <TouchableOpacity
            style={[
              styles.statCard,
              { borderLeftColor: '#10B981' },
              statusFilter === 'ready' && { borderWidth: 2, borderColor: '#10B981' },
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setStatusFilter(statusFilter === 'ready' ? null : 'ready');
            }}
          >
            <Text style={styles.statLabel}>Fully Ready</Text>
            <Text style={[styles.statVal, { color: '#10B981' }]}>{summary?.readyCount ?? 0}</Text>
            <Text style={styles.statSub}>100% compliant fields</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statCard,
              { borderLeftColor: '#F59E0B' },
              statusFilter === 'needs_attention' && { borderWidth: 2, borderColor: '#F59E0B' },
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setStatusFilter(statusFilter === 'needs_attention' ? null : 'needs_attention');
            }}
          >
            <Text style={styles.statLabel}>Needs Attention</Text>
            <Text style={[styles.statVal, { color: '#F59E0B' }]}>{summary?.needsAttentionCount ?? 0}</Text>
            <Text style={styles.statSub}>Missing PEN / APAAR</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statCard,
              { borderLeftColor: '#EF4444' },
              statusFilter === 'critical_incomplete' && { borderWidth: 2, borderColor: '#EF4444' },
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setStatusFilter(statusFilter === 'critical_incomplete' ? null : 'critical_incomplete');
            }}
          >
            <Text style={styles.statLabel}>Critical Missing</Text>
            <Text style={[styles.statVal, { color: '#EF4444' }]}>{summary?.criticalCount ?? 0}</Text>
            <Text style={styles.statSub}>DOB / Parent / Gender</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statCard,
              { borderLeftColor: '#EC4899' },
              statusFilter === 'duplicate' && { borderWidth: 2, borderColor: '#EC4899' },
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setStatusFilter(statusFilter === 'duplicate' ? null : 'duplicate');
            }}
          >
            <Text style={styles.statLabel}>Duplicates</Text>
            <Text style={[styles.statVal, { color: '#EC4899' }]}>{summary?.duplicateCount ?? 0}</Text>
            <Text style={styles.statSub}>ADM / PEN / Aadhaar</Text>
          </TouchableOpacity>
        </View>

        {/* Class Compliance Breakdown */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Class-Wise Compliance Breakdown</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {selectedClassId && (
                <TouchableOpacity onPress={() => setSelectedClassId(null)}>
                  <Text style={{ fontSize: 12, color: '#2563eb', fontWeight: '700' }}>Clear Class</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.sectionSub}>{classes.length} Active Sections</Text>
            </View>
          </View>

          <View style={styles.classList}>
            {classes.map(c => {
              const isClassSelected = selectedClassId === c.class_id;
              return (
                <TouchableOpacity
                  key={`${c.class_id}-${c.section_id}`}
                  style={[
                    styles.classRow,
                    isClassSelected && {
                      backgroundColor: isDark ? 'rgba(37,99,235,0.15)' : '#eff6ff',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#2563eb',
                      paddingHorizontal: 8,
                    },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedClassId(isClassSelected ? null : c.class_id);
                  }}
                >
                  <View style={styles.classNameCol}>
                    <Text style={[styles.classNameText, isClassSelected && { color: '#2563eb', fontWeight: '800' }]}>
                      {c.class_name} - {c.section_name}
                    </Text>
                    <Text style={styles.classDetailText}>{c.ready} of {c.total} students ready</Text>
                  </View>
                  <View style={styles.progressBarWrapper}>
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${c.readiness_percentage}%`,
                            backgroundColor:
                              c.readiness_percentage >= 90 ? '#10B981' :
                              c.readiness_percentage >= 70 ? '#F59E0B' : '#EF4444',
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressText}>{c.readiness_percentage}%</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Student Issues & Grid */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Student Audit Records</Text>
            <Text style={styles.sectionSub}>Review and resolve specific validation issues</Text>
          </View>

          {/* Search and Filters */}
          <TourTarget id="screen.admin-udise-readiness.workspace" native><View style={styles.filterRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by student name or admission no..."
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            <TourScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              <TouchableOpacity
                style={[styles.filterChip, statusFilter === null && styles.filterChipActive]}
                onPress={() => setStatusFilter(null)}
              >
                <Text style={[styles.filterChipText, statusFilter === null && styles.filterChipTextActive]}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, statusFilter === 'critical_incomplete' && styles.filterChipActive]}
                onPress={() => setStatusFilter(statusFilter === 'critical_incomplete' ? null : 'critical_incomplete')}
              >
                <Text style={[styles.filterChipText, statusFilter === 'critical_incomplete' && styles.filterChipTextActive]}>Critical Incomplete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, statusFilter === 'needs_attention' && styles.filterChipActive]}
                onPress={() => setStatusFilter(statusFilter === 'needs_attention' ? null : 'needs_attention')}
              >
                <Text style={[styles.filterChipText, statusFilter === 'needs_attention' && styles.filterChipTextActive]}>Needs Attention</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, statusFilter === 'duplicate' && styles.filterChipActive]}
                onPress={() => setStatusFilter(statusFilter === 'duplicate' ? null : 'duplicate')}
              >
                <Text style={[styles.filterChipText, statusFilter === 'duplicate' && styles.filterChipTextActive]}>Duplicates</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, statusFilter === 'ready' && styles.filterChipActive]}
                onPress={() => setStatusFilter(statusFilter === 'ready' ? null : 'ready')}
              >
                <Text style={[styles.filterChipText, statusFilter === 'ready' && styles.filterChipTextActive]}>Ready</Text>
              </TouchableOpacity>
            </TourScrollView>
          </View></TourTarget>

          {/* Student Cards */}
          <View style={styles.studentGrid}>
            {filteredStudents.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="checkmark-done-circle" size={40} color="#10B981" />
                <Text style={styles.emptyTitle}>No matching records found</Text>
                <Text style={styles.emptySub}>All students in this filter meet compliance criteria.</Text>
              </View>
            ) : (
              filteredStudents.map(s => {
                const badgeColor =
                  s.udise_status === 'ready' ? '#10B981' :
                  s.udise_status === 'needs_attention' ? '#F59E0B' :
                  s.udise_status === 'duplicate' ? '#EC4899' : '#EF4444';

                const badgeLabel =
                  s.udise_status === 'ready' ? 'READY' :
                  s.udise_status === 'needs_attention' ? 'ATTENTION' :
                  s.udise_status === 'duplicate' ? 'DUPLICATE' : 'CRITICAL';

                return (
                  <TouchableOpacity
                    key={s.student_id}
                    style={styles.studentCard}
                    activeOpacity={0.7}
                    onPress={() => handleOpenStudent(s.student_id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit student ${s.student_name}`}
                  >
                    <View style={styles.studentCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.studentName}>{s.student_name}</Text>
                        <Text style={styles.studentMeta}>
                          Adm: {s.admission_no} · {s.class_name}-{s.section_name}
                        </Text>
                      </View>
                      <View style={styles.headerRightCol}>
                        <View style={[styles.statusBadge, { backgroundColor: `${badgeColor}20` }]}>
                          <Text style={[styles.statusBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
                        </View>
                        <View style={styles.editBadge}>
                          <Ionicons name="pencil" size={11} color={isDark ? '#818CF8' : '#4F46E5'} />
                          <Text style={styles.editBadgeText}>Edit</Text>
                          <Ionicons name="chevron-forward" size={12} color={isDark ? '#818CF8' : '#4F46E5'} />
                        </View>
                      </View>
                    </View>

                    <View style={styles.idRow}>
                      <Text style={styles.idTag}>PEN: {s.pen_number || 'Missing'}</Text>
                      <Text style={styles.idTag}>APAAR: {s.apar_number || 'Missing'}</Text>
                      <Text style={styles.idTag}>Aadhaar: {s.aadhaar_number ? '••••' + s.aadhaar_number.slice(-4) : 'Missing'}</Text>
                    </View>

                    {/* Validation Errors & Warnings */}
                    {[...s.errors, ...s.warnings].length > 0 && (
                      <View style={styles.issuesContainer}>
                        {[...s.errors, ...s.warnings].map((issue, idx) => (
                          <View key={idx} style={styles.issuePill}>
                            <Ionicons
                              name={s.errors.includes(issue as any) ? 'alert-circle' : 'warning'}
                              size={12}
                              color={s.errors.includes(issue as any) ? '#EF4444' : '#F59E0B'}
                            />
                            <Text style={styles.issueText}>{issue.error}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>
      </TourScrollView>
    </View>
  );
}

const getStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#0B0F19' : '#F8FAFC',
    },
    centerContainer: {
      flex: 1,
      backgroundColor: isDark ? '#0B0F19' : '#F8FAFC',
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    exportBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#4F46E5',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    exportBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '600',
    },
    heroCard: {
      borderRadius: 16,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    heroTextCol: {
      flex: 1,
      paddingRight: 16,
    },
    heroBadge: {
      color: 'rgba(255, 255, 255, 0.8)',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      marginBottom: 4,
    },
    heroTitle: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 4,
    },
    heroSub: {
      color: 'rgba(255, 255, 255, 0.9)',
      fontSize: 12,
      lineHeight: 16,
    },
    heroScoreBox: {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroScoreVal: {
      color: '#FFFFFF',
      fontSize: 24,
      fontWeight: '800',
    },
    heroScoreLabel: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '600',
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 16,
    },
    statCard: {
      flex: 1,
      minWidth: 150,
      backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
      borderRadius: 12,
      padding: 14,
      borderLeftWidth: 4,
      borderWidth: 1,
      borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    statLabel: {
      fontSize: 12,
      color: isDark ? '#9CA3AF' : '#6B7280',
      fontWeight: '500',
      marginBottom: 4,
    },
    statVal: {
      fontSize: 22,
      fontWeight: '700',
      marginBottom: 2,
    },
    statSub: {
      fontSize: 10,
      color: isDark ? '#6B7280' : '#9CA3AF',
    },
    sectionCard: {
      backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? '#374151' : '#E5E7EB',
      marginBottom: 16,
    },
    sectionHeader: {
      marginBottom: 14,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#F9FAFB' : '#111827',
      marginBottom: 2,
    },
    sectionSub: {
      fontSize: 12,
      color: isDark ? '#9CA3AF' : '#6B7280',
    },
    classList: {
      gap: 10,
    },
    classRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? '#374151' : '#E5E7EB',
    },
    classNameCol: {
      width: '40%',
    },
    classNameText: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#E5E7EB' : '#1F2937',
    },
    classDetailText: {
      fontSize: 11,
      color: isDark ? '#9CA3AF' : '#6B7280',
    },
    progressBarWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    progressBarTrack: {
      flex: 1,
      height: 8,
      backgroundColor: isDark ? '#374151' : '#E5E7EB',
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 4,
    },
    progressText: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#D1D5DB' : '#374151',
      width: 44,
      textAlign: 'right',
    },
    filterRow: {
      marginBottom: 14,
      gap: 10,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: isDark ? '#111827' : '#F3F4F6',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: isDark ? '#F9FAFB' : '#111827',
      padding: 0,
    },
    chipScroll: {
      flexDirection: 'row',
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: isDark ? '#111827' : '#F3F4F6',
      marginRight: 8,
      borderWidth: 1,
      borderColor: isDark ? '#374151' : '#E5E7EB',
    },
    filterChipActive: {
      backgroundColor: '#4F46E5',
      borderColor: '#4F46E5',
    },
    filterChipText: {
      fontSize: 12,
      color: isDark ? '#9CA3AF' : '#6B7280',
      fontWeight: '500',
    },
    filterChipTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    studentGrid: {
      gap: 10,
    },
    studentCard: {
      backgroundColor: isDark ? '#111827' : '#F9FAFB',
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: isDark ? '#374151' : '#E5E7EB',
      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
    },
    studentCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    headerRightCol: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    editBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.18)' : '#EEF2FF',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(99, 102, 241, 0.35)' : '#C7D2FE',
    },
    editBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: isDark ? '#818CF8' : '#4F46E5',
    },
    studentName: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#F9FAFB' : '#111827',
    },
    studentMeta: {
      fontSize: 12,
      color: isDark ? '#9CA3AF' : '#6B7280',
      marginTop: 2,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    statusBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    idRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 6,
    },
    idTag: {
      fontSize: 11,
      color: isDark ? '#9CA3AF' : '#6B7280',
      backgroundColor: isDark ? '#1F2937' : '#E5E7EB',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    issuesContainer: {
      gap: 4,
      marginTop: 4,
      paddingTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? '#374151' : '#E5E7EB',
    },
    issuePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    issueText: {
      fontSize: 11,
      color: isDark ? '#D1D5DB' : '#4B5563',
    },
    emptyBox: {
      alignItems: 'center',
      paddingVertical: 30,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: isDark ? '#D1D5DB' : '#374151',
      marginTop: 8,
    },
    emptySub: {
      fontSize: 12,
      color: isDark ? '#6B7280' : '#9CA3AF',
      marginTop: 2,
    },
  });
