import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Modal,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import type { SchoolTheme } from '../../src/theme/types';
import StaffHeader from '../../src/components/StaffHeader';
import { OmrService, OmrScan, OmrScanAnswer, OmrReviewItem } from '../../src/services/omrService';
import { alertCompat } from '../../src/utils/crossPlatformAlert';

type FilterType = 'ALL' | 'FLAGGED' | 'LOW_CONFIDENCE' | 'MULTIPLE' | 'UNIDENTIFIED';

export default function OmrReviewScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const router = useRouter();
  const params = useLocalSearchParams<{ examId?: string; batchId?: string }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scans, setScans] = useState<OmrScan[]>([]);
  const [exceptions, setExceptions] = useState<OmrReviewItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>('FLAGGED');
  const [selectedScan, setSelectedScan] = useState<OmrScan | null>(null);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);

  // Review override state
  const [selectedQuestion, setSelectedQuestion] = useState<OmrScanAnswer | null>(null);
  const [overrideOption, setOverrideOption] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);

  const fetchScansAndExceptions = useCallback(async () => {
    try {
      setLoading(true);
      const [scansRes, exceptionsRes] = await Promise.all([
        OmrService.getScans({
          exam_id: params.examId,
          batch_id: params.batchId,
          limit: 100,
        }),
        OmrService.getExceptions({
          exam_id: params.examId,
          status: 'PENDING',
        }),
      ]);

      if (scansRes.success && scansRes.data) {
        setScans(scansRes.data);
      }
      if (exceptionsRes.success && exceptionsRes.data) {
        setExceptions(exceptionsRes.data);
      }
    } catch (err: any) {
      alertCompat('Error', err.message || 'Failed to load OMR review items');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [params.examId, params.batchId]);

  useEffect(() => {
    fetchScansAndExceptions();
  }, [fetchScansAndExceptions]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchScansAndExceptions();
  }, [fetchScansAndExceptions]);

  // Filter scans based on selection
  const filteredScans = useMemo(() => {
    return scans.filter((scan: OmrScan) => {
      if (activeFilter === 'ALL') return true;
      if (activeFilter === 'FLAGGED') return scan.status === 'REVIEW_REQUIRED' || scan.is_flagged;
      if (activeFilter === 'LOW_CONFIDENCE') return scan.confidence_score < 70;
      if (activeFilter === 'MULTIPLE') {
        return scan.answers?.some((a: OmrScanAnswer) => a.fill_status === 'MULTIPLE' || a.is_flagged);
      }
      if (activeFilter === 'UNIDENTIFIED') {
        return !scan.student_id;
      }
      return true;
    });
  }, [scans, activeFilter]);

  const handleOpenReview = async (scan: OmrScan) => {
    setSelectedScan(scan);
    setSelectedQuestion(null);
    setOverrideOption('');
    setOverrideReason('');
    setReviewModalVisible(true);
    try {
      const detail = await OmrService.getScan(scan.id);
      if (detail.success && detail.data) setSelectedScan(detail.data);
    } catch {}
  };

  const handleSelectQuestion = (answer: OmrScanAnswer) => {
    setSelectedQuestion(answer);
    setOverrideOption(answer.detected_option || 'BLANK');
    setOverrideReason('');
  };

  const handleSubmitOverride = async () => {
    if (!selectedScan || !selectedQuestion) return;
    if (!overrideReason.trim()) {
      alertCompat('Reason Required', 'Please provide a brief justification for the manual override (audit requirement).');
      return;
    }

    try {
      setOverrideSubmitting(true);
      const res = await OmrService.overrideAnswer(selectedScan.id, {
        question_number: selectedQuestion.question_number,
        new_option: overrideOption === 'BLANK' ? null : overrideOption,
        reason: overrideReason.trim(),
      });

      if (res.success && res.data) {
        alertCompat('Answer Overridden', 'Mark updated and exam results re-evaluated.');
        setSelectedScan(res.data);
        fetchScansAndExceptions();
        setSelectedQuestion(null);
      }
    } catch (err: any) {
      alertCompat('Override Failed', err.message || 'Could not update answer.');
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const getConfidenceBadge = (score: number) => {
    if (score >= 90) {
      return { bg: isDark ? '#064E3B' : '#DCFCE7', text: isDark ? '#34D399' : '#15803D', label: `${score}% High` };
    }
    if (score >= 70) {
      return { bg: isDark ? '#78350F' : '#FEF3C7', text: isDark ? '#FBBF24' : '#B45309', label: `${score}% Med` };
    }
    return { bg: isDark ? '#7F1D1D' : '#FEE2E2', text: isDark ? '#F87171' : '#B91C1C', label: `${score}% Low` };
  };

  return (
    <View style={styles.root}>
      <TourTarget id="screen.staff-omr-review.overview"><StaffHeader title="OMR Review & Verification" subtitle="Resolve ambiguous bubbles and flagged sheets" /></TourTarget>

      {/* Top Exception Counter Banner */}
      <View style={styles.counterBanner}>
        <LinearGradient
          colors={isDark ? ['#1E1B4B', '#312E81'] : ['#EEF2FF', '#E0E7FF']}
          style={styles.counterCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <View style={styles.counterIconWrapper}>
            <Ionicons name="alert-circle" size={28} color="#4F46E5" />
          </View>
          <View style={styles.counterTextWrapper}>
            <Text style={styles.counterTitle}>
              {exceptions.length} {exceptions.length === 1 ? 'Action Item' : 'Action Items'} Pending
            </Text>
            <Text style={styles.counterSubtitle}>
              {scans.filter((s: OmrScan) => s.status === 'REVIEW_REQUIRED').length} sheets require manual verification before results can be finalized.
            </Text>
          </View>
        </LinearGradient>
      </View>

      {/* Filter Tabs */}
      <TourTarget id="screen.staff-omr-review.workspace" native><View style={styles.filterRow}>
        <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {(['FLAGGED', 'ALL', 'LOW_CONFIDENCE', 'MULTIPLE', 'UNIDENTIFIED'] as FilterType[]).map((filter) => {
            const isActive = activeFilter === filter;
            return (
              <TouchableOpacity
                key={filter}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveFilter(filter)}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {filter.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </TourScrollView>
      </View></TourTarget>

      {/* Scans List */}
      {loading && !refreshing ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loaderText}>Loading OMR verification queue...</Text>
        </View>
      ) : filteredScans.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-done-circle-outline" size={64} color={isDark ? '#34D399' : '#10B981'} />
          <Text style={styles.emptyTitle}>All Clear!</Text>
          <Text style={styles.emptySubtitle}>
            No OMR sheets matching "{activeFilter.replace('_', ' ')}" require verification.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredScans}
          keyExtractor={(item: OmrScan) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }: { item: OmrScan }) => {
            const conf = getConfidenceBadge(item.confidence_score);
            const flaggedAnswers = item.answers?.filter((a: OmrScanAnswer) => a.is_flagged || a.fill_status === 'AMBIGUOUS' || a.fill_status === 'MULTIPLE') || [];

            return (
              <TouchableOpacity
                style={[styles.scanCard, item.status === 'REVIEW_REQUIRED' && styles.scanCardFlagged]}
                onPress={() => handleOpenReview(item)}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentRoll}>
                      Roll #{item.roll_number_detected || (item.student_id ? 'Linked' : 'UNIDENTIFIED')}
                    </Text>
                    <Text style={styles.sheetId}>Sheet: {item.sheet_id.slice(0, 12)}...</Text>
                  </View>
                  <View style={[styles.confidenceBadge, { backgroundColor: conf.bg }]}>
                    <Text style={[styles.confidenceText, { color: conf.text }]}>{conf.label}</Text>
                  </View>
                </View>

                <View style={styles.cardStats}>
                  <View style={styles.statItem}>
                    <Text style={styles.statVal}>{item.correct_count ?? '—'}</Text>
                    <Text style={styles.statLbl}>Correct</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statVal}>{item.wrong_count ?? '—'}</Text>
                    <Text style={styles.statLbl}>Wrong</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statVal}>{item.blank_count ?? '—'}</Text>
                    <Text style={styles.statLbl}>Blank</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statVal, { color: '#4F46E5' }]}>
                      {item.final_score != null ? `${item.final_score}` : 'Pending'}
                    </Text>
                    <Text style={styles.statLbl}>Score</Text>
                  </View>
                </View>

                {flaggedAnswers.length > 0 && (
                  <View style={styles.flaggedBanner}>
                    <Ionicons name="warning" size={14} color="#D97706" />
                    <Text style={styles.flaggedBannerText}>
                      {flaggedAnswers.length} question(s) need attention (Q
                      {flaggedAnswers.map((a: OmrScanAnswer) => a.question_number).join(', Q')})
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Detail Review Modal */}
      <Modal visible={reviewModalVisible} animationType="slide" transparent onRequestClose={() => setReviewModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Manual Verification</Text>
                <Text style={styles.modalSubtitle}>
                  Roll #{selectedScan?.roll_number_detected || 'Unidentified'} • Sheet {selectedScan?.sheet_id.slice(0, 8)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReviewModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <TourScrollView style={styles.modalBody}>
              {/* Question list with bubbles */}
              <Text style={styles.sectionHeader}>Detected Answers & Fill States</Text>
              <View style={styles.questionsGrid}>
                {selectedScan?.answers?.map((ans: OmrScanAnswer) => {
                  const isFlagged = ans.is_flagged || ans.fill_status === 'AMBIGUOUS' || ans.fill_status === 'MULTIPLE';
                  const isCurrent = selectedQuestion?.id === ans.id;

                  return (
                    <TouchableOpacity
                      key={ans.id}
                      style={[
                        styles.questionRow,
                        isFlagged && styles.questionRowFlagged,
                        isCurrent && styles.questionRowSelected,
                      ]}
                      onPress={() => handleSelectQuestion(ans)}
                    >
                      <View style={styles.qNumBox}>
                        <Text style={styles.qNumText}>Q{ans.question_number}</Text>
                      </View>
                      <View style={styles.qAnswerBox}>
                        <Text style={styles.qAnswerText}>
                          {ans.detected_option || 'BLANK'}
                        </Text>
                        <Text style={styles.qStatusText}>{ans.fill_status}</Text>
                      </View>
                      <View style={styles.qConfidenceBox}>
                        <Text
                          style={[
                            styles.qConfidenceText,
                            { color: ans.confidence_score >= 90 ? '#10B981' : ans.confidence_score >= 70 ? '#F59E0B' : '#EF4444' },
                          ]}
                        >
                          {ans.confidence_score}%
                        </Text>
                        {ans.is_manually_verified && (
                          <Ionicons name="checkmark-circle" size={14} color="#10B981" style={{ marginTop: 2 }} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Override Editor Card */}
              {selectedQuestion && (
                <View style={styles.overrideBox}>
                  <Text style={styles.overrideTitle}>
                    Override Question {selectedQuestion.question_number}
                  </Text>
                  <Text style={styles.overrideHelp}>
                    Current Detected: {selectedQuestion.detected_option || 'BLANK'} ({selectedQuestion.fill_status})
                  </Text>

                  {/* Option Selector Buttons */}
                  <View style={styles.optionButtonsRow}>
                    {['A', 'B', 'C', 'D', 'BLANK'].map((opt) => {
                      const isOptActive = overrideOption === opt;
                      return (
                        <TouchableOpacity
                          key={opt}
                          style={[styles.optBtn, isOptActive && styles.optBtnActive]}
                          onPress={() => setOverrideOption(opt)}
                        >
                          <Text style={[styles.optBtnText, isOptActive && styles.optBtnTextActive]}>{opt}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Reason input */}
                  <TextInput
                    style={styles.reasonInput}
                    placeholder="Audit reason (e.g. 'Student lightly filled B, erased C')"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={overrideReason}
                    onChangeText={setOverrideReason}
                  />

                  <TouchableOpacity
                    style={styles.submitOverrideBtn}
                    onPress={handleSubmitOverride}
                    disabled={overrideSubmitting}
                  >
                    {overrideSubmitting ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Ionicons name="save-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
                        <Text style={styles.submitOverrideText}>Save & Re-evaluate Result</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </TourScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getStyles(theme: SchoolTheme, isDark: boolean) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    counterBanner: {
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    counterCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? '#3730A3' : '#C7D2FE',
    },
    counterIconWrapper: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? '#312E81' : '#E0E7FF',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    counterTextWrapper: {
      flex: 1,
    },
    counterTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 2,
    },
    counterSubtitle: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      lineHeight: 18,
    },
    filterRow: {
      paddingVertical: 12,
    },
    filterScroll: {
      paddingHorizontal: 16,
      gap: 8,
    },
    filterChip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    filterChipActive: {
      backgroundColor: '#4F46E5',
      borderColor: '#4F46E5',
    },
    filterText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.text,
    },
    filterTextActive: {
      color: '#FFFFFF',
    },
    loaderContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loaderText: {
      marginTop: 12,
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.text,
      marginTop: 16,
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 20,
    },
    listContent: {
      padding: 16,
      paddingTop: 4,
      gap: 12,
    },
    scanCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    scanCardFlagged: {
      borderColor: '#F59E0B',
      borderLeftWidth: 4,
      borderLeftColor: '#F59E0B',
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    studentInfo: {
      flex: 1,
    },
    studentRoll: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    sheetId: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    confidenceBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    confidenceText: {
      fontSize: 12,
      fontWeight: '700',
    },
    cardStats: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB',
      borderRadius: 12,
      padding: 10,
      marginTop: 12,
    },
    statItem: {
      alignItems: 'center',
      flex: 1,
    },
    statVal: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.text,
    },
    statLbl: {
      fontSize: 11,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    flaggedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      padding: 8,
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.1)' : '#FEF3C7',
      borderRadius: 8,
      gap: 6,
    },
    flaggedBannerText: {
      fontSize: 12,
      color: isDark ? '#FBBF24' : '#B45309',
      fontWeight: '600',
      flex: 1,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '90%',
      paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },
    modalSubtitle: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    closeBtn: {
      padding: 4,
    },
    modalBody: {
      padding: 20,
    },
    sectionHeader: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 12,
    },
    questionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 20,
    },
    questionRow: {
      width: '48%',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F3F4F6',
      borderRadius: 10,
      padding: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    questionRowFlagged: {
      borderColor: '#F59E0B',
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.08)' : '#FEF3C7',
    },
    questionRowSelected: {
      borderColor: '#4F46E5',
      borderWidth: 2,
    },
    qNumBox: {
      width: 32,
    },
    qNumText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.text,
    },
    qAnswerBox: {
      flex: 1,
      marginLeft: 4,
    },
    qAnswerText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#4F46E5',
    },
    qStatusText: {
      fontSize: 10,
      color: theme.colors.textSecondary,
    },
    qConfidenceBox: {
      alignItems: 'flex-end',
    },
    qConfidenceText: {
      fontSize: 11,
      fontWeight: '700',
    },
    overrideBox: {
      backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF',
      borderRadius: 16,
      padding: 16,
      marginTop: 10,
      borderWidth: 1,
      borderColor: isDark ? '#3730A3' : '#C7D2FE',
    },
    overrideTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.text,
    },
    overrideHelp: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
      marginBottom: 12,
    },
    optionButtonsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    optBtn: {
      flex: 1,
      height: 42,
      borderRadius: 8,
      backgroundColor: theme.colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    optBtnActive: {
      backgroundColor: '#4F46E5',
      borderColor: '#4F46E5',
    },
    optBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.text,
    },
    optBtnTextActive: {
      color: '#FFFFFF',
    },
    reasonInput: {
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
      fontSize: 13,
      color: theme.colors.text,
      marginBottom: 12,
    },
    submitOverrideBtn: {
      backgroundColor: '#4F46E5',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 10,
    },
    submitOverrideText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
  });
}
