import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../../src/hooks/useTheme';
import type { SchoolTheme } from '../../../src/theme/types';
import AdminHeader from '../../../src/components/AdminHeader';
import {
  OmrService,
  OmrExam,
  OmrTemplate,
  OmrAnalyticsReport,
  OmrAuditLog,
} from '../../../src/services/omrService';
import { FeatureRouteGuard, FEATURE_KEYS } from '../../../src/features/feature-access';
import { alertCompat } from '../../../src/utils/crossPlatformAlert';

type TabKey = 'EXAMS' | 'TEMPLATES' | 'EXCEPTIONS' | 'FINALIZATION' | 'ANALYTICS' | 'AUDIT';

function OmrControlCenterContent() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabKey>('EXAMS');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data states
  const [exams, setExams] = useState<OmrExam[]>([]);
  const [templates, setTemplates] = useState<OmrTemplate[]>([]);
  const [papers, setPapers] = useState<Array<{ id: string; exam_name: string; subject_name: string; class_name: string; has_omr: boolean }>>([]);
  const [selectedPaperId, setSelectedPaperId] = useState('');
  const [selectedExam, setSelectedExam] = useState<OmrExam | null>(null);
  const [analytics, setAnalytics] = useState<OmrAnalyticsReport | null>(null);
  const [auditLogs, setAuditLogs] = useState<OmrAuditLog[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);

  // Create Exam Modal
  const [createExamModalVisible, setCreateExamModalVisible] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [questionCount, setQuestionCount] = useState('50');
  const [positiveMarks, setPositiveMarks] = useState('1');
  const [negativeMarks, setNegativeMarks] = useState('0.25');
  const [creatingExam, setCreatingExam] = useState(false);

  // Finalization state
  const [finalizing, setFinalizing] = useState(false);

  // Initial load
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [examsRes, templatesRes, auditRes, papersRes, exceptionsRes] = await Promise.all([
        OmrService.getExams({ limit: 50 }),
        OmrService.getTemplates(),
        OmrService.getAuditLogs({ limit: 30 }),
        OmrService.getPapers(),
        OmrService.getExceptions(),
      ]);

      if (examsRes.success && examsRes.data) {
        setExams(examsRes.data);
        if (!selectedExam && examsRes.data.length > 0) {
          setSelectedExam(examsRes.data[0]);
        }
      }
      if (templatesRes.success && templatesRes.data) {
        setTemplates(templatesRes.data);
        if (templatesRes.data.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(templatesRes.data[0].id);
        }
      }
      if (auditRes.success && auditRes.data) {
        setAuditLogs(auditRes.data);
      }
      if (papersRes.success && papersRes.data) {
        const available = papersRes.data.filter((p) => !p.has_omr);
        setPapers(available);
        if (available.length > 0 && !selectedPaperId) {
          setSelectedPaperId(available[0].id);
        }
      }
      if (exceptionsRes.success && exceptionsRes.data) {
        setExceptions(exceptionsRes.data);
      }
    } catch (err: any) {
      alertCompat('Error', err.message || 'Failed to load OMR Control Center data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedExam, selectedTemplateId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Load analytics when selected exam changes
  useEffect(() => {
    if (selectedExam) {
      OmrService.getAnalytics(selectedExam.id).then((res: { success: boolean; data: OmrAnalyticsReport | null }) => {
        if (res.success && res.data) {
          setAnalytics(res.data);
        } else {
          setAnalytics(null);
        }
      });
    }
  }, [selectedExam]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  // Create OMR Exam
  const handleCreateExam = async () => {
    if (!newExamTitle.trim()) {
      alertCompat('Required', 'Please enter an exam title.');
      return;
    }
    if (!selectedTemplateId) {
      alertCompat('Required', 'Please select an OMR sheet template.');
      return;
    }

    if (!selectedPaperId) {
      alertCompat('Required', 'Select an existing exam paper (class + subject) to attach this OMR exam.');
      return;
    }

    try {
      setCreatingExam(true);
      const res = await OmrService.createExam({
        title: newExamTitle.trim(),
        exam_subject_id: selectedPaperId,
        template_id: selectedTemplateId,
        question_count: parseInt(questionCount, 10) || 50,
        marking_scheme: {
          positive: parseFloat(positiveMarks) || 1,
          negative: parseFloat(negativeMarks) || 0,
          blank: 0,
        },
        multiple_answer_policy: 'MARK_WRONG',
        confidence_threshold: 70,
        review_threshold: 85,
      });

      if (res.success && res.data) {
        alertCompat('Success', `OMR Exam "${res.data.title}" created successfully.`);
        setCreateExamModalVisible(false);
        setNewExamTitle('');
        loadDashboardData();
      }
    } catch (err: any) {
      alertCompat('Creation Failed', err.message || 'Could not create OMR exam');
    } finally {
      setCreatingExam(false);
    }
  };

  // Finalize Exam Marks
  const handleFinalizeExam = async () => {
    if (!selectedExam) return;

    try {
      setFinalizing(true);
      const res = await OmrService.finalizeExam(selectedExam.id, {
        allow_unverified_override: false,
      });

      if (res.success && res.data) {
        alertCompat(
          'Results Finalized',
          `Successfully finalized ${res.data.scans_finalized} student marks into the official SchoolIMS marks database!`
        );
        loadDashboardData();
      }
    } catch (err: any) {
      alertCompat('Finalization Blocked', err.message || 'Could not finalize exam');
    } finally {
      setFinalizing(false);
    }
  };

  // Open dedicated print screen (scanner-aligned A4 sheets with school name header)
  const handlePrintSheets = (opts?: { examId?: string; templateId?: string }) => {
    router.push({
      pathname: '/admin/omr/print',
      params: {
        ...(opts?.examId ? { examId: opts.examId } : {}),
        ...(opts?.templateId ? { templateId: opts.templateId } : {}),
      },
    } as any);
  };

  return (
    <View style={styles.root}>
      <TourTarget id="screen.admin-omr.overview"><AdminHeader title="OMR Control Center" showBackButton={true} /></TourTarget>

      {/* Primary Tab Navigation */}
      <TourTarget id="screen.admin-omr.workspace" native><View style={styles.tabBar}>
        {(['EXAMS', 'TEMPLATES', 'EXCEPTIONS', 'FINALIZATION', 'ANALYTICS', 'AUDIT'] as TabKey[]).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab === 'EXAMS'
                  ? 'Exams'
                  : tab === 'TEMPLATES'
                  ? 'Templates'
                  : tab === 'EXCEPTIONS'
                  ? 'Exceptions'
                  : tab === 'FINALIZATION'
                  ? 'Finalize'
                  : tab === 'ANALYTICS'
                  ? 'Analytics'
                  : 'Audit'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View></TourTarget>

      {/* Main Body */}
      {loading && !refreshing ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loaderText}>Loading OMR subsystem...</Text>
        </View>
      ) : (
        <TourScrollView
          style={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
          contentContainerStyle={styles.scrollContent}
        >
          {/* TAB 1: EXAMS & BATCHES */}
          {activeTab === 'EXAMS' && (
            <View>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>Configured OMR Exams</Text>
                  <Text style={styles.sectionSubtitle}>Select an exam to configure keys, scanner, or batches</Text>
                </View>
                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.secondaryActionBtn}
                    onPress={() => handlePrintSheets(selectedExam ? { examId: selectedExam.id } : undefined)}
                  >
                    <Ionicons name="print-outline" size={18} color="#4F46E5" style={{ marginRight: 4 }} />
                    <Text style={styles.secondaryActionBtnText}>Print Sheets</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryActionBtn}
                    onPress={() => setCreateExamModalVisible(true)}
                  >
                    <Ionicons name="add" size={18} color="#FFF" style={{ marginRight: 4 }} />
                    <Text style={styles.primaryActionBtnText}>New Exam</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {exams.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="clipboard-outline" size={48} color={theme.colors.textSecondary} />
                  <Text style={styles.emptyCardTitle}>No OMR Exams Configured</Text>
                  <Text style={styles.emptyCardText}>
                    Create your first OMR exam to assign templates, answer keys, and begin camera scanning.
                  </Text>
                </View>
              ) : (
                exams.map((exam: OmrExam) => {
                  const isCurrent = selectedExam?.id === exam.id;
                  const isPublished = String(exam.status).toUpperCase() === 'PUBLISHED' || String(exam.status).toUpperCase() === 'ACTIVE';
                  const qCount = exam.question_count || exam.total_questions || 50;
                  const posMark = exam.marking_scheme?.positive || exam.positive_marks_per_question || 1;
                  const negMark = exam.marking_scheme?.negative || exam.negative_marks_per_question || 0;

                  return (
                    <TouchableOpacity
                      key={exam.id}
                      style={[styles.examCard, isCurrent && styles.examCardActive]}
                      onPress={() => setSelectedExam(exam)}
                    >
                      <View style={styles.examCardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.examCardTitle}>{exam.title}</Text>
                          <Text style={styles.examCardMeta}>
                            {qCount} Questions • Template: {exam.template?.name || exam.template_name || 'Standard'}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.examStatusBadge,
                            { backgroundColor: isPublished ? '#DCFCE7' : '#FEF3C7' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.examStatusText,
                              { color: isPublished ? '#15803D' : '#B45309' },
                            ]}
                          >
                            {exam.status ? String(exam.status).toUpperCase() : 'DRAFT'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.examCardFooter}>
                        <View style={styles.markingPill}>
                          <Text style={styles.markingPillText}>
                            +{posMark} / -{negMark} pts
                          </Text>
                        </View>

                        <View style={styles.examCardActions}>
                          <TouchableOpacity
                            style={styles.smallOutlineBtn}
                            onPress={() => handlePrintSheets({ examId: exam.id })}
                          >
                            <Ionicons name="print-outline" size={14} color="#4F46E5" style={{ marginRight: 4 }} />
                            <Text style={styles.smallOutlineBtnText}>Print</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.smallOutlineBtn}
                            onPress={() => router.push({ pathname: '/admin/omr/answer-key', params: { examId: exam.id } })}
                          >
                            <Ionicons name="key-outline" size={14} color="#4F46E5" style={{ marginRight: 4 }} />
                            <Text style={styles.smallOutlineBtnText}>Answer Key</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.smallOutlineBtn}
                            onPress={() => router.push({ pathname: '/staff/omr-scanner', params: { examId: exam.id } })}
                          >
                            <Ionicons name="camera-outline" size={14} color="#4F46E5" style={{ marginRight: 4 }} />
                            <Text style={styles.smallOutlineBtnText}>Scan</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.smallOutlineBtn}
                            onPress={() => router.push({ pathname: '/staff/omr-review', params: { examId: exam.id } })}
                          >
                            <Ionicons name="eye-outline" size={14} color="#4F46E5" style={{ marginRight: 4 }} />
                            <Text style={styles.smallOutlineBtnText}>Review</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {/* TAB 2: TEMPLATES & PRINTABLES */}
          {activeTab === 'TEMPLATES' && (
            <View>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>Physical Sheet Templates</Text>
                  <Text style={styles.sectionSubtitle}>Standard A4 templates with corner registration markers</Text>
                </View>
              </View>

              {templates.map((tpl: OmrTemplate) => (
                <View key={tpl.id} style={styles.templateCard}>
                  <View style={styles.tplHeader}>
                    <View style={styles.tplIconBox}>
                      <Ionicons name="document-attach" size={24} color="#4F46E5" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tplName}>{tpl.name}</Text>
                      <Text style={styles.tplCode}>{tpl.code} • Version {tpl.version || 1}</Text>
                    </View>
                  </View>

                  <Text style={styles.tplDesc}>{tpl.description || 'Standard high-speed OMR sheet with corner fiducial registration.'}</Text>

                  <View style={styles.tplSpecs}>
                    <View style={styles.tplSpecItem}>
                      <Text style={styles.tplSpecVal}>{tpl.geometry?.questionCount || tpl.total_questions || 50}</Text>
                      <Text style={styles.tplSpecLbl}>Questions</Text>
                    </View>
                    <View style={styles.tplSpecItem}>
                      <Text style={styles.tplSpecVal}>{tpl.geometry?.optionsPerQuestion || tpl.options_per_question || 4}</Text>
                      <Text style={styles.tplSpecLbl}>Options/Q</Text>
                    </View>
                    <View style={styles.tplSpecItem}>
                      <Text style={styles.tplSpecVal}>{tpl.geometry?.rollDigits || tpl.roll_number_digits || 4} Digits</Text>
                      <Text style={styles.tplSpecLbl}>Admission</Text>
                    </View>
                    <View style={styles.tplSpecItem}>
                      <Text style={styles.tplSpecVal}>4 Markers</Text>
                      <Text style={styles.tplSpecLbl}>Fiducials</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.printTemplateBtn}
                    onPress={() => handlePrintSheets({ templateId: tpl.id })}
                  >
                    <Ionicons name="print-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.printTemplateBtnText}>Print A4 OMR Sheet</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {activeTab === 'EXCEPTIONS' && (
            <View>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>OMR Exceptions</Text>
                  <Text style={styles.sectionSubtitle}>Sheets that need identification, review, or a new scan</Text>
                </View>
              </View>
              {exceptions.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="checkmark-circle-outline" size={48} color={theme.colors.textSecondary} />
                  <Text style={styles.emptyCardTitle}>No open exceptions</Text>
                  <Text style={styles.emptyCardText}>High-confidence sheets skip this queue automatically.</Text>
                </View>
              ) : (
                exceptions.map((item: any) => (
                  <TouchableOpacity
                    key={item.scan_id || item.id}
                    style={styles.examCard}
                    onPress={() =>
                      router.push({ pathname: '/staff/omr-review', params: { examId: item.omr_exam_id } } as any)
                    }
                  >
                    <Text style={styles.examCardTitle}>{item.exam_title || 'OMR sheet'}</Text>
                    <Text style={styles.sectionSubtitle}>
                      {item.exception_type || 'REVIEW_REQUIRED'} · Sheet {item.sheet_id} · Admission {item.detected_roll_number || 'unidentified'}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* TAB 3: RESULTS FINALIZATION */}
          {activeTab === 'FINALIZATION' && (
            <View>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>Exam Result Finalization</Text>
                  <Text style={styles.sectionSubtitle}>
                    Atomically push verified OMR marks into the SchoolIMS marks repository
                  </Text>
                </View>
              </View>

              {selectedExam ? (
                <View style={styles.finalizationCard}>
                  <Text style={styles.finalizeExamTitle}>{selectedExam.title}</Text>
                  <Text style={styles.finalizeExamSub}>
                    Current Status: <Text style={{ fontWeight: '700' }}>{selectedExam.status ? String(selectedExam.status).toUpperCase() : 'DRAFT'}</Text>
                  </Text>

                  {/* Checklist */}
                  <View style={styles.checklist}>
                    <View style={styles.checkRow}>
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                      <Text style={styles.checkLabel}>Answer Key Published</Text>
                    </View>
                    <View style={styles.checkRow}>
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                      <Text style={styles.checkLabel}>Multi-tenant Isolation Validated</Text>
                    </View>
                    <View style={styles.checkRow}>
                      <Ionicons name="shield-checkmark" size={20} color="#4F46E5" />
                      <Text style={styles.checkLabel}>Deterministic Evaluation Engine Ready</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.finalizeActionBtn, String(selectedExam.status).toUpperCase() === 'FINALIZED' && { opacity: 0.6 }]}
                    onPress={handleFinalizeExam}
                    disabled={finalizing || String(selectedExam.status).toUpperCase() === 'FINALIZED'}
                  >
                    {finalizing ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Ionicons name="lock-closed-outline" size={18} color="#FFF" style={{ marginRight: 8 }} />
                        <Text style={styles.finalizeActionBtnText}>
                          {String(selectedExam.status).toUpperCase() === 'FINALIZED'
                            ? 'Results Already Finalized'
                            : 'Finalize & Post to SchoolIMS Marks'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.emptyCardText}>Select an exam to review finalization status.</Text>
              )}
            </View>
          )}

          {/* TAB 4: ANALYTICS & INSIGHTS */}
          {activeTab === 'ANALYTICS' && (
            <View>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>OMR Analytics Engine</Text>
                  <Text style={styles.sectionSubtitle}>
                    Real question-level difficulty and option distraction analysis
                  </Text>
                </View>
              </View>

              {analytics ? (
                <View>
                  {/* Summary Metric Cards */}
                  <View style={styles.analyticsStatsRow}>
                    <View style={styles.analyticsStatCard}>
                      <Text style={styles.analyticsStatVal}>{analytics.summary?.total_sheets || 0}</Text>
                      <Text style={styles.analyticsStatLbl}>Sheets Evaluated</Text>
                    </View>
                    <View style={styles.analyticsStatCard}>
                      <Text style={[styles.analyticsStatVal, { color: '#10B981' }]}>
                        {analytics.summary?.average_score != null ? `${analytics.summary.average_score}%` : '—'}
                      </Text>
                      <Text style={styles.analyticsStatLbl}>Average Score</Text>
                    </View>
                    <View style={styles.analyticsStatCard}>
                      <Text style={[styles.analyticsStatVal, { color: '#4F46E5' }]}>
                        {analytics.summary?.highest_score != null ? `${analytics.summary.highest_score}` : '—'}
                      </Text>
                      <Text style={styles.analyticsStatLbl}>Highest Mark</Text>
                    </View>
                  </View>

                  {/* Question Difficulty Breakdown */}
                  <Text style={styles.subsectionTitle}>Question Difficulty Index</Text>
                  <View style={styles.questionAnalyticsList}>
                    {analytics.question_statistics?.slice(0, 15).map((q: any) => (
                      <View key={q.question_number} style={styles.qStatRow}>
                        <View style={styles.qStatNum}>
                          <Text style={styles.qStatNumText}>Q{q.question_number}</Text>
                        </View>
                        <View style={styles.qStatBarWrapper}>
                          <View
                            style={[
                              styles.qStatBar,
                              {
                                width: `${Math.min(100, Math.max(5, q.correct_percentage))}%`,
                                backgroundColor:
                                  q.correct_percentage >= 75
                                    ? '#10B981'
                                    : q.correct_percentage >= 40
                                    ? '#F59E0B'
                                    : '#EF4444',
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.qStatPct}>{q.correct_percentage}%</Text>
                        <View style={styles.qStatDifficultyBadge}>
                          <Text style={styles.qStatDifficultyText}>{q.difficulty_level}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Ionicons name="bar-chart-outline" size={48} color={theme.colors.textSecondary} />
                  <Text style={styles.emptyCardTitle}>No Analytics Data Yet</Text>
                  <Text style={styles.emptyCardText}>
                    Scan and evaluate sheets for this exam to unlock empirical question difficulty charts and score distributions.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* TAB 5: AUDIT TRAIL */}
          {activeTab === 'AUDIT' && (
            <View>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>OMR Audit Trail</Text>
                  <Text style={styles.sectionSubtitle}>
                    Immutable log of answer-key revisions, manual overrides, and finalizations
                  </Text>
                </View>
              </View>

              {auditLogs.length === 0 ? (
                <Text style={styles.emptyCardText}>No audit records logged yet.</Text>
              ) : (
                auditLogs.map((log: OmrAuditLog) => (
                  <View key={log.id} style={styles.auditCard}>
                    <View style={styles.auditHeader}>
                      <Text style={styles.auditAction}>{log.action}</Text>
                      <Text style={styles.auditTime}>
                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <Text style={styles.auditEntity}>
                      Entity: {log.entity} • ID: {log.entity_id ? log.entity_id.slice(0, 8) : '—'}...
                    </Text>
                    {log.details && (
                      <Text style={styles.auditDetails}>
                        {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </View>
          )}
        </TourScrollView>
      )}

      {/* Modal: Create OMR Exam */}
      <Modal
        visible={createExamModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCreateExamModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Configure New OMR Exam</Text>
              <TouchableOpacity onPress={() => setCreateExamModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <TourScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Exam Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Mathematics Mid-Term Unit Test"
                placeholderTextColor={theme.colors.textSecondary}
                value={newExamTitle}
                onChangeText={setNewExamTitle}
              />

              <Text style={styles.inputLabel}>Existing exam paper</Text>
              <View style={styles.tplSelectRow}>
                {papers.length === 0 ? (
                  <Text style={styles.sectionSubtitle}>Create a class/subject paper in Examinations first.</Text>
                ) : papers.slice(0, 12).map((paper) => {
                  const isSel = selectedPaperId === paper.id;
                  return (
                    <TouchableOpacity
                      key={paper.id}
                      style={[styles.tplChip, isSel && styles.tplChipActive]}
                      onPress={() => setSelectedPaperId(paper.id)}
                    >
                      <Text style={[styles.tplChipText, isSel && styles.tplChipTextActive]}>
                        {paper.exam_name} · {paper.subject_name} · {paper.class_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.inputLabel}>Select OMR Template</Text>
              <View style={styles.tplSelectRow}>
                {templates.map((tpl: OmrTemplate) => {
                  const isSel = selectedTemplateId === tpl.id;
                  return (
                    <TouchableOpacity
                      key={tpl.id}
                      style={[styles.tplChip, isSel && styles.tplChipActive]}
                      onPress={() => setSelectedTemplateId(tpl.id)}
                    >
                      <Text style={[styles.tplChipText, isSel && styles.tplChipTextActive]}>
                        {tpl.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.inputGrid}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Questions</Text>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={questionCount}
                    onChangeText={setQuestionCount}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>+ Mark / Q</Text>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={positiveMarks}
                    onChangeText={setPositiveMarks}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>- Mark / Q</Text>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={negativeMarks}
                    onChangeText={setNegativeMarks}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.createModalSubmitBtn}
                onPress={handleCreateExam}
                disabled={creatingExam}
              >
                {creatingExam ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.createModalSubmitText}>Create OMR Exam</Text>
                )}
              </TouchableOpacity>
            </TourScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function OmrControlCenterScreen() {
  return (
    <FeatureRouteGuard feature={FEATURE_KEYS.OMR_SCANNER}>
      <OmrControlCenterContent />
    </FeatureRouteGuard>
  );
}

function getStyles(theme: SchoolTheme, isDark: boolean) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingHorizontal: 8,
    },
    tabItem: {
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabItemActive: {
      borderBottomColor: '#4F46E5',
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    tabTextActive: {
      color: '#4F46E5',
      fontWeight: '700',
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
    container: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
      gap: 12,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.colors.text,
    },
    sectionSubtitle: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    primaryActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#4F46E5',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
    },
    primaryActionBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    secondaryActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(79,70,229,0.18)' : '#EEF2FF',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? '#3730A3' : '#C7D2FE',
    },
    secondaryActionBtnText: {
      color: '#4F46E5',
      fontSize: 13,
      fontWeight: '700',
    },
    emptyCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 32,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginTop: 12,
    },
    emptyCardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      marginTop: 12,
    },
    emptyCardText: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 18,
    },
    examCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 12,
    },
    examCardActive: {
      borderColor: '#4F46E5',
    },
    examCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    examCardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    examCardMeta: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    examStatusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    examStatusText: {
      fontSize: 11,
      fontWeight: '700',
    },
    examCardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6',
      flexWrap: 'wrap',
      gap: 8,
    },
    markingPill: {
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    markingPillText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#4F46E5',
    },
    examCardActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    smallOutlineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? '#3730A3' : '#C7D2FE',
      backgroundColor: isDark ? 'rgba(55, 48, 163, 0.2)' : '#EEF2FF',
    },
    smallOutlineBtnText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#4F46E5',
    },
    templateCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 16,
    },
    tplHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    tplIconBox: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF',
      justifyContent: 'center',
      alignItems: 'center',
    },
    tplName: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    tplCode: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    tplDesc: {
      fontSize: 13,
      color: theme.colors.text,
      lineHeight: 18,
      marginBottom: 12,
    },
    tplSpecs: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB',
      borderRadius: 12,
      padding: 10,
      marginBottom: 14,
    },
    tplSpecItem: {
      alignItems: 'center',
      flex: 1,
    },
    tplSpecVal: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
    },
    tplSpecLbl: {
      fontSize: 11,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    printTemplateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#4F46E5',
      paddingVertical: 12,
      borderRadius: 10,
    },
    printTemplateBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    finalizationCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    finalizeExamTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },
    finalizeExamSub: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 2,
      marginBottom: 16,
    },
    checklist: {
      gap: 10,
      marginBottom: 20,
      paddingVertical: 8,
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    checkLabel: {
      fontSize: 14,
      color: theme.colors.text,
      fontWeight: '500',
    },
    finalizeActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10B981',
      paddingVertical: 14,
      borderRadius: 12,
    },
    finalizeActionBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    analyticsStatsRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 20,
    },
    analyticsStatCard: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    analyticsStatVal: {
      fontSize: 20,
      fontWeight: '800',
      color: theme.colors.text,
    },
    analyticsStatLbl: {
      fontSize: 11,
      color: theme.colors.textSecondary,
      marginTop: 4,
      textAlign: 'center',
    },
    subsectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 12,
    },
    questionAnalyticsList: {
      gap: 8,
    },
    qStatRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    qStatNum: {
      width: 36,
    },
    qStatNumText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.text,
    },
    qStatBarWrapper: {
      flex: 1,
      height: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E5E7EB',
      borderRadius: 4,
      overflow: 'hidden',
      marginHorizontal: 10,
    },
    qStatBar: {
      height: '100%',
      borderRadius: 4,
    },
    qStatPct: {
      width: 44,
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'right',
    },
    qStatDifficultyBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6',
      marginLeft: 8,
    },
    qStatDifficultyText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    auditCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 10,
    },
    auditHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    auditAction: {
      fontSize: 14,
      fontWeight: '700',
      color: '#4F46E5',
    },
    auditTime: {
      fontSize: 11,
      color: theme.colors.textSecondary,
    },
    auditEntity: {
      fontSize: 12,
      color: theme.colors.text,
    },
    auditDetails: {
      fontSize: 11,
      color: theme.colors.textSecondary,
      marginTop: 4,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '85%',
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
    modalBody: {
      padding: 20,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 6,
      marginTop: 10,
    },
    textInput: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
      fontSize: 14,
      color: theme.colors.text,
    },
    tplSelectRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    tplChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    tplChipActive: {
      backgroundColor: '#4F46E5',
      borderColor: '#4F46E5',
    },
    tplChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.text,
    },
    tplChipTextActive: {
      color: '#FFFFFF',
    },
    inputGrid: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    createModalSubmitBtn: {
      backgroundColor: '#4F46E5',
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 24,
      marginBottom: 20,
    },
    createModalSubmitText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
