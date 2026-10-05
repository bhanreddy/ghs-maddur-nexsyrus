import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import {
  PaperForgeService,
  Blueprint,
  BlueprintSection,
  GeneratedPaperRecord,
  GeneratedQuestion,
  QuestionType,
  DifficultyLevel,
} from '../../src/services/paperforgeService';

type TabMode = 'generator' | 'saved';

export default function QuestionPapersScreen() {
  const { theme, isDark } = useTheme();

  // Navigation tab
  const [tab, setTab] = useState<TabMode>('generator');

  // Generator Config State (Survives failures!)
  const [classLevel, setClassLevel] = useState('Class 10');
  const [subject, setSubject] = useState('Mathematics');
  const [examName, setExamName] = useState('Mid-Term Examination');
  const [durationMinutes, setDurationMinutes] = useState('90');
  const [chaptersInput, setChaptersInput] = useState('Quadratic Equations, Triangles, Coordinate Geometry');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('MEDIUM');

  // Blueprint sections
  const [sections, setSections] = useState<BlueprintSection[]>([
    { subject: 'Mathematics', chapters: [], question_type: 'MCQ', count: 10, marks_per_question: 1, bloom_target: 'KNOWLEDGE', difficulty: 'EASY' },
    { subject: 'Mathematics', chapters: [], question_type: 'VSA', count: 5, marks_per_question: 2, bloom_target: 'UNDERSTANDING', difficulty: 'MEDIUM' },
    { subject: 'Mathematics', chapters: [], question_type: 'SA', count: 4, marks_per_question: 3, bloom_target: 'APPLICATION', difficulty: 'MEDIUM' },
    { subject: 'Mathematics', chapters: [], question_type: 'LA', count: 2, marks_per_question: 5, bloom_target: 'ANALYSIS', difficulty: 'HARD' },
  ]);

  // Generation status
  const [genState, setGenState] = useState<'CONFIGURING' | 'GENERATING' | 'READY' | 'FAILED'>('CONFIGURING');
  const [genError, setGenError] = useState<string | null>(null);
  const [currentPaper, setCurrentPaper] = useState<GeneratedPaperRecord | null>(null);

  // Saved papers list
  const [savedPapers, setSavedPapers] = useState<GeneratedPaperRecord[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Edit Question Modal
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Total Marks computation
  const totalMarks = sections.reduce((acc, s) => acc + s.count * s.marks_per_question, 0);
  const totalQuestions = sections.reduce((acc, s) => acc + s.count, 0);

  const fetchSavedPapers = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const list = await PaperForgeService.listPapers();
      setSavedPapers(list);
    } catch (e: any) {
      // Non-blocking
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'saved') {
      fetchSavedPapers();
    }
  }, [tab, fetchSavedPapers]);

  // Handle Section changes
  const updateSectionCount = (index: number, count: number) => {
    const updated = [...sections];
    updated[index].count = Math.max(count, 1);
    setSections(updated);
  };

  const updateSectionMarks = (index: number, marks: number) => {
    const updated = [...sections];
    updated[index].marks_per_question = Math.max(marks, 1);
    setSections(updated);
  };

  const handleGenerate = async () => {
    if (genState === 'GENERATING') return; // Anti-spam protection

    if (!classLevel.trim() || !subject.trim()) {
      alertCompat('Missing Information', 'Please provide Class and Subject.');
      return;
    }

    const chapters = chaptersInput.split(',').map((c) => c.trim()).filter(Boolean);
    const configuredSections: BlueprintSection[] = sections.map((sec) => ({
      ...sec,
      subject: subject.trim(),
      chapters,
      difficulty,
    }));

    const blueprint: Blueprint = {
      class_level: classLevel.trim(),
      board: 'CBSE',
      tolerance_pct: 10.0,
      sections: configuredSections,
    };

    setGenState('GENERATING');
    setGenError(null);

    try {
      const record = await PaperForgeService.generatePaper({
        subject: subject.trim(),
        class_level: classLevel.trim(),
        exam_name: examName.trim(),
        title: `${examName.trim()} - ${subject.trim()}`,
        blueprint,
      });

      setCurrentPaper(record);
      setGenState('READY');
      alertCompat('Success', 'Question paper generated successfully!');
    } catch (err: any) {
      setGenState('FAILED');
      const msg = err.response?.data?.error || err.message || 'Generation failed. Please try again.';
      setGenError(msg);
      alertCompat('Generation Error', msg);
    }
  };

  const handleExport = async (paperId?: string | null) => {
    const id = paperId || currentPaper?.id;
    if (!id) {
      alertCompat('Notice', 'Paper ID is not available for direct export.');
      return;
    }
    try {
      await PaperForgeService.exportPaper(id, 'pdf');
    } catch {
      alertCompat('Error', 'Unable to export this question paper.');
    }
  };

  const openEditModal = (idx: number) => {
    if (!currentPaper || !currentPaper.questions[idx]) return;
    const q = currentPaper.questions[idx];
    setEditIndex(idx);
    setEditText(q.question_text);
    setEditAnswer(q.correct_answer);
  };

  const saveQuestionEdit = async () => {
    if (editIndex === null || !currentPaper) return;
    setSavingEdit(true);

    const updatedQuestions = [...currentPaper.questions];
    updatedQuestions[editIndex] = {
      ...updatedQuestions[editIndex],
      question_text: editText,
      correct_answer: editAnswer,
    };

    try {
      if (currentPaper.id) {
        await PaperForgeService.updatePaper(currentPaper.id, {
          questions: updatedQuestions,
        });
      }
      setCurrentPaper({
        ...currentPaper,
        questions: updatedQuestions,
      });
      setEditIndex(null);
      alertCompat('Success', 'Question updated.');
    } catch (e: any) {
      alertCompat('Error', 'Failed to save question edit.');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteQuestion = async (idx: number) => {
    if (!currentPaper) return;
    const updated = currentPaper.questions.filter((_, i) => i !== idx);
    try {
      if (currentPaper.id) {
        await PaperForgeService.updatePaper(currentPaper.id, { questions: updated });
      }
      setCurrentPaper({ ...currentPaper, questions: updated });
    } catch {
      // fallback local
      setCurrentPaper({ ...currentPaper, questions: updated });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0B0F17' : '#F8FAFC' }]}>
      <TourTarget id="screen.admin-question-papers.overview"><AdminHeader title="PaperForge Question Papers" /></TourTarget>

      {/* Tabs */}
      <TourTarget id="screen.admin-question-papers.workspace" native><View style={[styles.tabBar, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]}>
        <TouchableOpacity
          style={[styles.tabItem, tab === 'generator' && styles.tabItemActive]}
          onPress={() => setTab('generator')}
        >
          <Ionicons
            name="document-text-outline"
            size={18}
            color={tab === 'generator' ? '#2563EB' : isDark ? '#94A3B8' : '#64748B'}
          />
          <Text
            style={[
              styles.tabText,
              { color: tab === 'generator' ? '#2563EB' : isDark ? '#94A3B8' : '#64748B' },
              tab === 'generator' && styles.tabTextActive,
            ]}
          >
            Create Paper
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, tab === 'saved' && styles.tabItemActive]}
          onPress={() => setTab('saved')}
        >
          <Ionicons
            name="folder-open-outline"
            size={18}
            color={tab === 'saved' ? '#2563EB' : isDark ? '#94A3B8' : '#64748B'}
          />
          <Text
            style={[
              styles.tabText,
              { color: tab === 'saved' ? '#2563EB' : isDark ? '#94A3B8' : '#64748B' },
              tab === 'saved' && styles.tabTextActive,
            ]}
          >
            Saved Papers ({savedPapers.length})
          </Text>
        </TouchableOpacity>
      </View></TourTarget>

      <TourScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {tab === 'generator' ? (
          <>
            {/* Header Description */}
            <View style={[styles.heroCard, { backgroundColor: isDark ? '#161E2E' : '#EFF6FF' }]}>
              <View style={styles.heroRow}>
                <View style={[styles.heroIconWrap, { backgroundColor: '#2563EB' }]}>
                  <Ionicons name="sparkles" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.heroTextWrap}>
                  <Text style={[styles.heroTitle, { color: isDark ? '#F8FAFC' : '#1E3A8A' }]}>
                    Curriculum-Aligned Paper Generator
                  </Text>
                  <Text style={[styles.heroSub, { color: isDark ? '#94A3B8' : '#3B82F6' }]}>
                    Define blueprint, marks, and taxonomy. PaperForge builds balanced question papers with full failure recovery.
                  </Text>
                </View>
              </View>
            </View>

            {/* Step 1: Basic Parameters */}
            <View style={[styles.card, { backgroundColor: isDark ? '#161E2E' : '#FFFFFF' }]}>
              <Text style={[styles.sectionTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                1. Assessment Scope
              </Text>

              <View style={styles.formRow}>
                <View style={styles.formCol}>
                  <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#475569' }]}>Class / Standard</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: isDark ? '#0B0F17' : '#F1F5F9', color: isDark ? '#F8FAFC' : '#0F172A' }]}
                    value={classLevel}
                    onChangeText={setClassLevel}
                    placeholder="e.g. Class 10"
                    placeholderTextColor="#94A3B8"
                  />
                </View>

                <View style={styles.formCol}>
                  <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#475569' }]}>Subject</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: isDark ? '#0B0F17' : '#F1F5F9', color: isDark ? '#F8FAFC' : '#0F172A' }]}
                    value={subject}
                    onChangeText={setSubject}
                    placeholder="e.g. Mathematics"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formCol}>
                  <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#475569' }]}>Exam Title</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: isDark ? '#0B0F17' : '#F1F5F9', color: isDark ? '#F8FAFC' : '#0F172A' }]}
                    value={examName}
                    onChangeText={setExamName}
                    placeholder="e.g. Mid-Term Examination"
                    placeholderTextColor="#94A3B8"
                  />
                </View>

                <View style={styles.formCol}>
                  <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#475569' }]}>Duration (Minutes)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: isDark ? '#0B0F17' : '#F1F5F9', color: isDark ? '#F8FAFC' : '#0F172A' }]}
                    value={durationMinutes}
                    onChangeText={setDurationMinutes}
                    keyboardType="numeric"
                    placeholder="e.g. 90"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#475569', marginTop: 8 }]}>
                Chapters / Syllabus Coverage (comma-separated)
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#0B0F17' : '#F1F5F9', color: isDark ? '#F8FAFC' : '#0F172A' }]}
                value={chaptersInput}
                onChangeText={setChaptersInput}
                placeholder="e.g. Real Numbers, Polynomials, Linear Equations"
                placeholderTextColor="#94A3B8"
              />

              {/* Difficulty Balance */}
              <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#475569', marginTop: 12 }]}>
                Target Difficulty Level
              </Text>
              <View style={styles.pillRow}>
                {(['EASY', 'MEDIUM', 'HARD'] as DifficultyLevel[]).map((lvl) => (
                  <TouchableOpacity
                    key={lvl}
                    style={[
                      styles.pill,
                      difficulty === lvl && styles.pillActive,
                      { borderColor: difficulty === lvl ? '#2563EB' : isDark ? 'rgba(255,255,255,0.1)' : '#CBD5E1' },
                    ]}
                    onPress={() => setDifficulty(lvl)}
                  >
                    <Text style={[styles.pillText, { color: difficulty === lvl ? '#2563EB' : isDark ? '#94A3B8' : '#64748B' }]}>
                      {lvl}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Step 2: Blueprint Table */}
            <View style={[styles.card, { backgroundColor: isDark ? '#161E2E' : '#FFFFFF' }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.sectionTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                  2. Question Paper Blueprint
                </Text>
                <View style={styles.badgeWrap}>
                  <Text style={styles.badgeText}>{totalQuestions} Qs • {totalMarks} Marks</Text>
                </View>
              </View>

              {/* Blueprint Summary Table */}
              <View style={styles.table}>
                <View style={[styles.tableHead, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                  <Text style={[styles.th, { flex: 1.5, color: isDark ? '#94A3B8' : '#64748B' }]}>Section</Text>
                  <Text style={[styles.th, { flex: 1.5, color: isDark ? '#94A3B8' : '#64748B' }]}>Type</Text>
                  <Text style={[styles.th, { flex: 1, textAlign: 'center', color: isDark ? '#94A3B8' : '#64748B' }]}>Count</Text>
                  <Text style={[styles.th, { flex: 1, textAlign: 'center', color: isDark ? '#94A3B8' : '#64748B' }]}>Marks/Q</Text>
                  <Text style={[styles.th, { flex: 1, textAlign: 'right', color: isDark ? '#94A3B8' : '#64748B' }]}>Total</Text>
                </View>

                {sections.map((sec, idx) => {
                  const sectionLabels = ['A', 'B', 'C', 'D', 'E'];
                  return (
                    <View key={idx} style={[styles.tableRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
                      <Text style={[styles.td, { flex: 1.5, fontWeight: '700', color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                        Section {sectionLabels[idx] || idx + 1}
                      </Text>
                      <Text style={[styles.td, { flex: 1.5, color: isDark ? '#CBD5E1' : '#334155' }]}>
                        {sec.question_type}
                      </Text>
                      <View style={[styles.counterWrap, { flex: 1, justifyContent: 'center' }]}>
                        <TouchableOpacity onPress={() => updateSectionCount(idx, sec.count - 1)} style={styles.counterBtn}>
                          <Text style={styles.counterBtnText}>-</Text>
                        </TouchableOpacity>
                        <Text style={[styles.counterVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{sec.count}</Text>
                        <TouchableOpacity onPress={() => updateSectionCount(idx, sec.count + 1)} style={styles.counterBtn}>
                          <Text style={styles.counterBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={[styles.counterWrap, { flex: 1, justifyContent: 'center' }]}>
                        <Text style={[styles.counterVal, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{sec.marks_per_question}M</Text>
                      </View>
                      <Text style={[styles.td, { flex: 1, textAlign: 'right', fontWeight: '700', color: '#2563EB' }]}>
                        {sec.count * sec.marks_per_question}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Error Notice if FAILED */}
              {genState === 'FAILED' && genError && (
                <View style={styles.errorNotice}>
                  <Ionicons name="alert-circle" size={18} color="#EF4444" />
                  <Text style={styles.errorNoticeText}>
                    {genError}. Your blueprint configuration has been saved. Please click Retry below.
                  </Text>
                </View>
              )}

              {/* Action Button with anti-spam disabled state */}
              <TouchableOpacity
                disabled={genState === 'GENERATING'}
                onPress={handleGenerate}
                style={[styles.generateBtn, genState === 'GENERATING' && { opacity: 0.6 }]}
              >
                <LinearGradient
                  colors={['#2563EB', '#1D4ED8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.btnGrad}
                >
                  {genState === 'GENERATING' ? (
                    <View style={styles.generatingRow}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.generateBtnText}>Generating Questions via PaperForge...</Text>
                    </View>
                  ) : (
                    <View style={styles.generatingRow}>
                      <Ionicons name={genState === 'FAILED' ? 'refresh' : 'flash'} size={18} color="#FFFFFF" />
                      <Text style={styles.generateBtnText}>
                        {genState === 'FAILED' ? 'Retry Generation' : 'Generate Question Paper'}
                      </Text>
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Step 3: Professional Preview & Question Editor */}
            {currentPaper && currentPaper.questions && currentPaper.questions.length > 0 && (
              <View style={[styles.card, { backgroundColor: isDark ? '#161E2E' : '#FFFFFF' }]}>
                <View style={styles.previewHeader}>
                  <View>
                    <Text style={[styles.previewExam, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                      {examName || currentPaper.title}
                    </Text>
                    <Text style={[styles.previewSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      {classLevel} • {subject} • Time: {durationMinutes} Mins • Max Marks: {totalMarks}
                    </Text>
                  </View>

                  <TouchableOpacity style={styles.exportBtn} onPress={() => handleExport()}>
                    <Ionicons name="download-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.exportBtnText}>Export PDF</Text>
                  </TouchableOpacity>
                </View>

                {/* Instructions */}
                <View style={[styles.instructionsBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                  <Text style={[styles.instructionsTitle, { color: isDark ? '#94A3B8' : '#475569' }]}>
                    General Instructions:
                  </Text>
                  <Text style={[styles.instructionItem, { color: isDark ? '#CBD5E1' : '#334155' }]}>
                    1. All questions are compulsory. Internal choice is provided where applicable.
                  </Text>
                  <Text style={[styles.instructionItem, { color: isDark ? '#CBD5E1' : '#334155' }]}>
                    2. Use of calculators is not permitted.
                  </Text>
                </View>

                {/* Questions List */}
                <View style={styles.questionsList}>
                  {currentPaper.questions.map((q, idx) => (
                    <View
                      key={idx}
                      style={[styles.questionCard, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0' }]}
                    >
                      <View style={styles.questionHead}>
                        <View style={styles.qNumBadge}>
                          <Text style={styles.qNumText}>Q{idx + 1}</Text>
                        </View>
                        <View style={styles.qMetaRow}>
                          <Text style={[styles.qTypeTag, { color: '#2563EB' }]}>{q.question_type}</Text>
                          <Text style={[styles.qMarksTag, { color: isDark ? '#94A3B8' : '#64748B' }]}>[{q.marks || 1}M]</Text>
                          {q.bloom_level && (
                            <Text style={[styles.bloomTag, { color: '#059669' }]}>• {q.bloom_level}</Text>
                          )}
                        </View>
                        <View style={styles.qActionRow}>
                          <TouchableOpacity onPress={() => openEditModal(idx)} style={styles.qIconBtn}>
                            <Ionicons name="pencil" size={16} color="#3B82F6" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => deleteQuestion(idx)} style={styles.qIconBtn}>
                            <Ionicons name="trash-outline" size={16} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <Text style={[styles.qText, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                        {q.question_text}
                      </Text>

                      {/* Options for MCQ */}
                      {q.options && Array.isArray(q.options) && (
                        <View style={styles.optionsWrap}>
                          {q.options.map((opt, oIdx) => (
                            <Text key={oIdx} style={[styles.optionText, { color: isDark ? '#CBD5E1' : '#334155' }]}>
                              {String.fromCharCode(65 + oIdx)}. {opt}
                            </Text>
                          ))}
                        </View>
                      )}

                      {/* Answer Key */}
                      <View style={[styles.ansKeyBox, { backgroundColor: isDark ? '#0B0F17' : '#F1F5F9' }]}>
                        <Text style={[styles.ansKeyLabel, { color: isDark ? '#10B981' : '#059669' }]}>Answer Key:</Text>
                        <Text style={[styles.ansKeyText, { color: isDark ? '#CBD5E1' : '#334155' }]}>
                          {q.correct_answer}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        ) : (
          /* Saved Papers Tab */
          <View style={styles.savedSection}>
            {loadingSaved ? (
              <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
            ) : savedPapers.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: isDark ? '#161E2E' : '#FFFFFF' }]}>
                <Ionicons name="documents-outline" size={48} color="#94A3B8" />
                <Text style={[styles.emptyTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>No Saved Papers Yet</Text>
                <Text style={[styles.emptySub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  Generate your first question paper using the Create Paper tab above.
                </Text>
              </View>
            ) : (
              savedPapers.map((item) => (
                <View key={item.id} style={[styles.savedCard, { backgroundColor: isDark ? '#161E2E' : '#FFFFFF' }]}>
                  <View style={styles.savedCardHead}>
                    <View>
                      <Text style={[styles.savedTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                        {item.title || `${item.subject} - ${item.class_level}`}
                      </Text>
                      <Text style={[styles.savedMeta, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                        {item.class_level} • {item.subject} • {item.question_count || 0} Questions
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.savedExportBtn}
                      onPress={() => handleExport(item.id)}
                    >
                      <Ionicons name="download-outline" size={16} color="#2563EB" />
                      <Text style={styles.savedExportText}>PDF</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.savedDate, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                    Created on {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </TourScrollView>

      {/* Edit Question Modal */}
      <Modal visible={editIndex !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: isDark ? '#161E2E' : '#FFFFFF' }]}>
            <Text style={[styles.modalTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
              Edit Question {editIndex !== null ? editIndex + 1 : ''}
            </Text>

            <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#475569', marginTop: 8 }]}>Question Text</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDark ? '#0B0F17' : '#F1F5F9', color: isDark ? '#F8FAFC' : '#0F172A' }]}
              value={editText}
              onChangeText={setEditText}
              multiline
            />

            <Text style={[styles.label, { color: isDark ? '#94A3B8' : '#475569', marginTop: 8 }]}>Correct Answer / Solution</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: isDark ? '#0B0F17' : '#F1F5F9', color: isDark ? '#F8FAFC' : '#0F172A' }]}
              value={editAnswer}
              onChangeText={setEditAnswer}
              multiline
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditIndex(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveBtn} onPress={saveQuestionEdit} disabled={savingEdit}>
                {savingEdit ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    marginRight: 24,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#2563EB',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  heroCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextWrap: { flex: 1 },
  heroTitle: { fontSize: 16, fontWeight: '700' },
  heroSub: { fontSize: 13, marginTop: 2 },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  badgeWrap: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  formCol: { flex: 1 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: '#EFF6FF',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  table: {
    marginTop: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  tableHead: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  th: {
    fontSize: 12,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  td: {
    fontSize: 13,
  },
  counterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  counterBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  counterVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorNotice: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    alignItems: 'center',
  },
  errorNoticeText: {
    flex: 1,
    fontSize: 13,
    color: '#B91C1C',
    fontWeight: '500',
  },
  generateBtn: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  btnGrad: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  generateBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  previewExam: {
    fontSize: 18,
    fontWeight: '800',
  },
  previewSub: {
    fontSize: 12,
    marginTop: 2,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  exportBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  instructionsBox: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  instructionsTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  instructionItem: {
    fontSize: 12,
    marginTop: 2,
  },
  questionsList: {
    gap: 16,
  },
  questionCard: {
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  questionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  qNumBadge: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  qNumText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  qMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginLeft: 8,
  },
  qTypeTag: {
    fontSize: 12,
    fontWeight: '700',
  },
  qMarksTag: {
    fontSize: 12,
  },
  bloomTag: {
    fontSize: 11,
    fontWeight: '600',
  },
  qActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  qIconBtn: {
    padding: 4,
  },
  qText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  optionsWrap: {
    marginTop: 8,
    gap: 4,
    paddingLeft: 4,
  },
  optionText: {
    fontSize: 13,
  },
  ansKeyBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
  },
  ansKeyLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  ansKeyText: {
    fontSize: 12,
    marginTop: 2,
  },
  savedSection: {
    gap: 12,
  },
  savedCard: {
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  savedCardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  savedTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  savedMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  savedExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
  },
  savedExportText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  savedDate: {
    fontSize: 11,
    marginTop: 8,
  },
  emptyBox: {
    padding: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalInput: {
    minHeight: 70,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
    marginTop: 4,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelBtnText: {
    color: '#64748B',
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
