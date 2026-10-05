import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../src/hooks/useTheme';
import type { SchoolTheme } from '../../../src/theme/types';
import AdminHeader from '../../../src/components/AdminHeader';
import { OmrService, OmrExam, OmrAnswerKey, OmrAnswerKeyQuestion } from '../../../src/services/omrService';
import { alertCompat } from '../../../src/utils/crossPlatformAlert';
import { FeatureRouteGuard, FEATURE_KEYS } from '../../../src/features/feature-access';

type MappingMode = 'GRID' | 'BULK' | 'SCAN';

function OmrAnswerKeyContent() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const router = useRouter();
  const params = useLocalSearchParams<{ examId?: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exams, setExams] = useState<OmrExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>(params.examId || '');
  const [activeExam, setActiveExam] = useState<OmrExam | null>(null);

  const [answerKey, setAnswerKey] = useState<OmrAnswerKey | null>(null);
  const [questions, setQuestions] = useState<Record<number, string>>({});
  const [mappingMode, setMappingMode] = useState<MappingMode>('GRID');

  // Bulk input text
  const [bulkText, setBulkText] = useState('');

  // Versioning modal
  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [changeReason, setChangeReason] = useState('');
  const [scanningMaster, setScanningMaster] = useState(false);

  // Fetch exams and answer key
  const fetchExams = useCallback(async () => {
    try {
      setLoading(true);
      const res = await OmrService.getExams({ limit: 50 });
      if (res.success && res.data) {
        setExams(res.data);
        if (!selectedExamId && res.data.length > 0) {
          setSelectedExamId(res.data[0].id);
        }
      }
    } catch (err: any) {
      alertCompat('Error', err.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  }, [selectedExamId]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  // Load answer key for selected exam
  const loadExamAnswerKey = useCallback(async (examId: string) => {
    if (!examId) return;
    try {
      setLoading(true);
      const exam = exams.find((e: OmrExam) => e.id === examId) || null;
      setActiveExam(exam);

      const res = await OmrService.getAnswerKey(examId);
      if (res.success && res.data) {
        setAnswerKey(res.data);
        const map: Record<number, string> = {};
        res.data.questions?.forEach((q: OmrAnswerKeyQuestion) => {
          map[q.question_number] = q.correct_option;
        });
        setQuestions(map);
      } else {
        setAnswerKey(null);
        // Initialize empty questions based on exam question count
        const count = exam?.question_count || exam?.total_questions || 50;
        const initialMap: Record<number, string> = {};
        for (let i = 1; i <= count; i++) {
          initialMap[i] = '';
        }
        setQuestions(initialMap);
      }
    } catch (err: any) {
      alertCompat('Error', err.message || 'Failed to load answer key');
    } finally {
      setLoading(false);
    }
  }, [exams]);

  useEffect(() => {
    if (selectedExamId) {
      loadExamAnswerKey(selectedExamId);
    }
  }, [selectedExamId, loadExamAnswerKey]);

  // Handle single question toggle in Grid mode
  const handleSelectOption = (questionNum: number, option: string) => {
    setQuestions((prev) => ({
      ...prev,
      [questionNum]: prev[questionNum] === option ? '' : option,
    }));
  };

  // Parse bulk text e.g. "1-B, 2-C, 3-A" or "1B 2C 3A" or "A B C D"
  const handleApplyBulk = () => {
    const text = bulkText.trim();
    if (!text) return;

    const newMap = { ...questions };
    const maxQ = activeExam?.question_count || activeExam?.total_questions || 50;

    // Pattern 1: "1-B", "1:B", "1B"
    const pairRegex = /(\d+)\s*[-:=]?\s*([A-Da-d])/g;
    let match;
    let matchedAny = false;

    while ((match = pairRegex.exec(text)) !== null) {
      const qNum = parseInt(match[1], 10);
      const opt = match[2].toUpperCase();
      if (qNum >= 1 && qNum <= maxQ) {
        newMap[qNum] = opt;
        matchedAny = true;
      }
    }

    // Pattern 2: space or comma separated letters: "A B C D A B C"
    if (!matchedAny) {
      const letters = text.replace(/[^A-Da-d\s,]/g, '').split(/[\s,]+/).filter(Boolean);
      letters.forEach((letter, idx) => {
        const qNum = idx + 1;
        if (qNum <= maxQ) {
          newMap[qNum] = letter.toUpperCase();
        }
      });
    }

    setQuestions(newMap);
    setMappingMode('GRID');
    alertCompat('Bulk Key Applied', 'Question answers updated in the grid. Review and save.');
  };

  // Master sheet scan handler
  const handleScanMasterSheet = async () => {
    if (!selectedExamId) return;

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        alertCompat('Camera Permission', 'Camera access is required to scan master answer sheet.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]?.base64) {
        setScanningMaster(true);
        const res = await OmrService.scanMasterSheet({
          exam_id: selectedExamId,
          image_base64: result.assets[0].base64,
        });

        if (res.success && res.data?.detected_key) {
          setQuestions((prev) => ({
            ...prev,
            ...res.data!.detected_key,
          }));
          setMappingMode('GRID');
          alertCompat('Master Sheet Scanned', `Auto-detected ${Object.keys(res.data.detected_key).length} answers. Check the grid to verify.`);
        }
      }
    } catch (err: any) {
      alertCompat('Scan Failed', err.message || 'Could not process master answer sheet');
    } finally {
      setScanningMaster(false);
    }
  };

  // Save / Publish answer key
  const handleSaveAnswerKey = async (publish: boolean = false) => {
    if (!selectedExamId) return;

    const questionList: OmrAnswerKeyQuestion[] = Object.entries(questions)
      .filter(([_, opt]) => Boolean(opt))
      .map(([qNum, opt]) => ({
        question_number: parseInt(qNum, 10),
        correct_option: opt,
        weight: 1.0,
      }));

    if (questionList.length === 0) {
      alertCompat('Incomplete Key', 'Please specify answers for at least one question.');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        exam_id: selectedExamId,
        questions: questionList,
        change_reason: changeReason.trim() || undefined,
        publish_immediately: publish,
      };

      const res = await OmrService.saveAnswerKey(payload);
      if (res.success && res.data) {
        setAnswerKey(res.data);
        setPublishModalVisible(false);
        setChangeReason('');
        alertCompat(
          publish ? 'Answer Key Published' : 'Draft Saved',
          `Answer Key Version ${res.data.version_number || res.data.version} is now ${res.data.status}.`
        );
      }
    } catch (err: any) {
      alertCompat('Save Failed', err.message || 'Could not save answer key');
    } finally {
      setSaving(false);
    }
  };

  const totalConfigured = Object.values(questions).filter(Boolean).length;
  const totalQuestions = activeExam?.question_count || activeExam?.total_questions || 50;

  return (
    <View style={styles.root}>
      <TourTarget id="screen.admin-omr-answer-key.overview"><AdminHeader title="Answer Key Mapping" showBackButton={true} /></TourTarget>

      {/* Exam Selector Bar */}
      <View style={styles.examBar}>
        <Text style={styles.examBarLabel}>Select Exam:</Text>
        <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.examScroll}>
          {exams.map((exam: OmrExam) => {
            const isSelected = exam.id === selectedExamId;
            return (
              <TouchableOpacity
                key={exam.id}
                style={[styles.examChip, isSelected && styles.examChipActive]}
                onPress={() => setSelectedExamId(exam.id)}
              >
                <Text style={[styles.examChipText, isSelected && styles.examChipTextActive]}>
                  {exam.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </TourScrollView>
      </View>

      {/* Key Status & Version Banner */}
      <View style={styles.statusBanner}>
        <View style={styles.statusInfo}>
          <View style={styles.statusRow}>
            <Text style={styles.statusTitle}>
              Version {answerKey ? (answerKey.version_number || answerKey.version) : '1 (New)'}
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: String(answerKey?.status).toUpperCase() === 'PUBLISHED' ? '#DCFCE7' : '#FEF3C7' },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  { color: String(answerKey?.status).toUpperCase() === 'PUBLISHED' ? '#15803D' : '#B45309' },
                ]}
              >
                {answerKey?.status ? String(answerKey.status).toUpperCase() : 'DRAFT'}
              </Text>
            </View>
          </View>
          <Text style={styles.statusDetail}>
            {totalConfigured} of {totalQuestions} questions mapped • {activeExam?.marking_scheme?.positive || activeExam?.positive_marks_per_question || 1} pts / question
          </Text>
        </View>

        {/* Mode Selector Tabs */}
        <TourTarget id="screen.admin-omr-answer-key.workspace" native><View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.modeTab, mappingMode === 'GRID' && styles.modeTabActive]}
            onPress={() => setMappingMode('GRID')}
          >
            <Ionicons name="grid-outline" size={16} color={mappingMode === 'GRID' ? '#FFF' : theme.colors.text} />
            <Text style={[styles.modeTabText, mappingMode === 'GRID' && styles.modeTabTextActive]}>Grid</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeTab, mappingMode === 'BULK' && styles.modeTabActive]}
            onPress={() => setMappingMode('BULK')}
          >
            <Ionicons name="create-outline" size={16} color={mappingMode === 'BULK' ? '#FFF' : theme.colors.text} />
            <Text style={[styles.modeTabText, mappingMode === 'BULK' && styles.modeTabTextActive]}>Bulk</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeTab, mappingMode === 'SCAN' && styles.modeTabActive]}
            onPress={handleScanMasterSheet}
            disabled={scanningMaster}
          >
            {scanningMaster ? (
              <ActivityIndicator size="small" color="#4F46E5" />
            ) : (
              <>
                <Ionicons name="camera-outline" size={16} color={mappingMode === 'SCAN' ? '#FFF' : theme.colors.text} />
                <Text style={[styles.modeTabText, mappingMode === 'SCAN' && styles.modeTabTextActive]}>Scan Master</Text>
              </>
            )}
          </TouchableOpacity>
        </View></TourTarget>
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loaderText}>Loading answer key data...</Text>
        </View>
      ) : mappingMode === 'BULK' ? (
        <View style={styles.bulkContainer}>
          <Text style={styles.bulkTitle}>Fast Text Input</Text>
          <Text style={styles.bulkHelp}>
            Enter answers separated by commas, spaces, or dashes. Format examples:{'\n'}
            • "1-B, 2-C, 3-A, 4-D"{'\n'}
            • "1B 2C 3A 4D"{'\n'}
            • "B C A D B A C D"
          </Text>
          <TextInput
            style={styles.bulkInput}
            multiline
            numberOfLines={8}
            placeholder="Paste or type answer pairs..."
            placeholderTextColor={theme.colors.textSecondary}
            value={bulkText}
            onChangeText={setBulkText}
          />
          <TouchableOpacity style={styles.applyBulkBtn} onPress={handleApplyBulk}>
            <Ionicons name="checkmark-done" size={18} color="#FFF" style={{ marginRight: 6 }} />
            <Text style={styles.applyBulkText}>Parse & Populate Grid</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TourScrollView contentContainerStyle={styles.gridContent}>
          <View style={styles.gridContainer}>
            {Array.from({ length: totalQuestions }, (_, i) => i + 1).map((qNum) => {
              const currentOpt = questions[qNum] || '';
              return (
                <View key={qNum} style={styles.gridRow}>
                  <View style={styles.qNumBox}>
                    <Text style={styles.qNumText}>{qNum}</Text>
                  </View>

                  <View style={styles.optionsRow}>
                    {['A', 'B', 'C', 'D'].map((opt) => {
                      const isSelected = currentOpt === opt;
                      return (
                        <TouchableOpacity
                          key={opt}
                          style={[styles.bubbleBtn, isSelected && styles.bubbleBtnSelected]}
                          onPress={() => handleSelectOption(qNum, opt)}
                        >
                          <Text style={[styles.bubbleText, isSelected && styles.bubbleTextSelected]}>
                            {opt}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        </TourScrollView>
      )}

      {/* Bottom Action Footer */}
      <View style={styles.footerBar}>
        <TouchableOpacity
          style={styles.draftBtn}
          onPress={() => handleSaveAnswerKey(false)}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={theme.colors.text} />
          ) : (
            <>
              <Ionicons name="document-text-outline" size={18} color={theme.colors.text} style={{ marginRight: 6 }} />
              <Text style={styles.draftBtnText}>Save Draft</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.publishBtn}
          onPress={() => setPublishModalVisible(true)}
          disabled={saving}
        >
          <LinearGradient
            colors={['#4F46E5', '#6366F1']}
            style={styles.publishGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="cloud-upload-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
            <Text style={styles.publishBtnText}>Publish Version</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Publish Version Confirmation Modal */}
      <Modal
        visible={publishModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPublishModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconBox}>
              <Ionicons name="shield-checkmark" size={32} color="#4F46E5" />
            </View>
            <Text style={styles.modalTitle}>Publish Answer Key Version</Text>
            <Text style={styles.modalSub}>
              Publishing will update the official answer key. Any existing scans will automatically be marked for re-evaluation.
            </Text>

            <TextInput
              style={styles.reasonInput}
              placeholder="Reason for change / version note (e.g. 'Corrected Q14 key')"
              placeholderTextColor={theme.colors.textSecondary}
              value={changeReason}
              onChangeText={setChangeReason}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setPublishModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => handleSaveAnswerKey(true)}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Confirm & Publish</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function OmrAnswerKeyScreen() {
  return (
    <FeatureRouteGuard feature={FEATURE_KEYS.OMR_SCANNER}>
      <OmrAnswerKeyContent />
    </FeatureRouteGuard>
  );
}

function getStyles(theme: SchoolTheme, isDark: boolean) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    examBar: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    examBarLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    examScroll: {
      gap: 8,
    },
    examChip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    examChipActive: {
      backgroundColor: '#4F46E5',
      borderColor: '#4F46E5',
    },
    examChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.text,
    },
    examChipTextActive: {
      color: '#FFFFFF',
    },
    statusBanner: {
      padding: 16,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    statusInfo: {
      marginBottom: 12,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    statusTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    statusBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    statusDetail: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    modeTabs: {
      flexDirection: 'row',
      gap: 8,
    },
    modeTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6',
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 6,
    },
    modeTabActive: {
      backgroundColor: '#4F46E5',
      borderColor: '#4F46E5',
    },
    modeTabText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.text,
    },
    modeTabTextActive: {
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
    gridContent: {
      padding: 16,
      paddingBottom: 100,
    },
    gridContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      justifyContent: 'space-between',
    },
    gridRow: {
      width: '48%',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      justifyContent: 'space-between',
    },
    qNumBox: {
      width: 28,
      alignItems: 'center',
    },
    qNumText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
    },
    optionsRow: {
      flexDirection: 'row',
      gap: 6,
    },
    bubbleBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
    },
    bubbleBtnSelected: {
      backgroundColor: '#4F46E5',
      borderColor: '#4F46E5',
    },
    bubbleText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.text,
    },
    bubbleTextSelected: {
      color: '#FFFFFF',
    },
    bulkContainer: {
      padding: 16,
    },
    bulkTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    bulkHelp: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      lineHeight: 18,
      marginTop: 4,
      marginBottom: 12,
    },
    bulkInput: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
      fontSize: 14,
      color: theme.colors.text,
      textAlignVertical: 'top',
      minHeight: 140,
    },
    applyBulkBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#4F46E5',
      paddingVertical: 14,
      borderRadius: 12,
      marginTop: 12,
    },
    applyBulkText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    footerBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: theme.colors.surface,
      padding: 16,
      paddingBottom: Platform.OS === 'ios' ? 34 : 16,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      flexDirection: 'row',
      gap: 12,
    },
    draftBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    draftBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
    },
    publishBtn: {
      flex: 1.5,
      borderRadius: 12,
      overflow: 'hidden',
    },
    publishGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
    },
    publishBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalCard: {
      width: '100%',
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      padding: 20,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    modalIconBox: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 6,
    },
    modalSub: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 16,
    },
    reasonInput: {
      width: '100%',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
      fontSize: 13,
      color: theme.colors.text,
      marginBottom: 16,
    },
    modalActions: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
    },
    modalCancelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    modalCancelText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
    },
    modalConfirmBtn: {
      flex: 1,
      backgroundColor: '#4F46E5',
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    modalConfirmText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
}
