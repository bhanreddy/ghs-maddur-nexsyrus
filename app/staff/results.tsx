import React, { useState, useEffect, useMemo, useCallback } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, ViewStyle, Pressable } from 'react-native';
import KeyboardAwareScreen from '@/components/keyboard/KeyboardAwareScreen';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import StaffHeader from '../../src/components/StaffHeader';
import { staffTabBarReserve } from '../../src/components/StaffFooter';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import { StudentService } from '../../src/services/studentService';
import { ResultService, TeacherService, TeacherClassAssignment } from '@/src/services/commonServices';
import { useAuth } from '@/src/hooks/useAuth';
import { StudentWithDetails } from '@/src/types/schema';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';

// ─────────────────────────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────────────────────────

interface ExamCategory {
  key: string;
  title: string;
  icon: any;
  color: string;
  description: string;
  examPrefix: string;
  subExams?: string[];
}

const EXTRA_SUB_EXAMS_KEY = 'staffExtraSubExams';

// ponytail: local clay helpers — extract if a 3rd staff screen needs them
function clay(isDark: boolean, raised: 'sm' | 'md' | 'lg' = 'md'): any {
  const spread = raised === 'lg' ? 24 : raised === 'sm' ? 12 : 18;
  const dy = raised === 'lg' ? 12 : raised === 'sm' ? 6 : 9;
  if (Platform.OS === 'web') {
    const drop = isDark ? 'rgba(0,0,0,0.60)' : 'rgba(166,180,200,0.55)';
    const light = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,1)';
    const innerHi = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)';
    const innerLo = isDark ? 'rgba(0,0,0,0.4)' : 'rgba(166,180,200,0.35)';
    return {
      boxShadow:
        `${dy}px ${dy}px ${spread}px ${drop}, ` +
        `-${dy}px -${dy}px ${spread}px ${light}, ` +
        `inset 3px 3px 6px ${innerHi}, ` +
        `inset -3px -3px 6px ${innerLo}`,
    } as ViewStyle;
  }
  return {
    shadowColor: isDark ? '#000000' : '#94A3B8',
    shadowOffset: { width: 0, height: dy },
    shadowOpacity: isDark ? 0.45 : 0.26,
    shadowRadius: spread,
    elevation: raised === 'lg' ? 10 : raised === 'sm' ? 4 : 7,
  };
}

function clayGlow(color: string, raised: 'sm' | 'md' = 'md'): any {
  const dy = raised === 'sm' ? 4 : 7;
  const spread = raised === 'sm' ? 10 : 16;
  if (Platform.OS === 'web') {
    return {
      boxShadow:
        `${dy}px ${dy}px ${spread}px ${color}44, ` +
        `inset 1.5px 1.5px 3px rgba(255,255,255,0.40), ` +
        `inset -1.5px -1.5px 3px rgba(0,0,0,0.12)`,
    } as ViewStyle;
  }
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: dy },
    shadowOpacity: 0.38,
    shadowRadius: spread,
    elevation: raised === 'sm' ? 5 : 8,
  };
}

function clayInset(isDark: boolean): any {
  if (Platform.OS === 'web') {
    const innerLo = isDark ? 'rgba(0,0,0,0.4)' : 'rgba(166,180,200,0.45)';
    const innerHi = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.95)';
    return {
      boxShadow: `inset 4px 4px 8px ${innerLo}, inset -4px -4px 8px ${innerHi}`,
    } as ViewStyle;
  }
  return {
    borderWidth: 1,
    borderColor: isDark ? 'rgba(0,0,0,0.22)' : 'rgba(148,163,184,0.20)',
  };
}

function clayCard(isDark: boolean, raised: 'sm' | 'md' | 'lg' = 'md'): any {
  return {
    backgroundColor: isDark ? '#1A2332' : '#EFF2F9',
    borderRadius: raised === 'lg' ? 30 : 24,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
    ...clay(isDark, raised),
  };
}

function FilterLabelPill({ icon, label, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 5,
      alignSelf: 'flex-start', marginBottom: 10,
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
      backgroundColor: `${color}12`, borderWidth: 1, borderColor: `${color}22`,
    }}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1, color, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

const EXAM_CATEGORIES: ExamCategory[] = [
  {
    key: 'slip_test',
    title: 'Slip Tests',
    icon: 'document-text',
    color: '#3B82F6',
    description: 'Weekly slip tests and unit tests',
    examPrefix: 'ST',
    subExams: ['ST-1', 'ST-2', 'ST-3', 'ST-4', 'ST-5']
  },
  {
    key: 'fa_results',
    title: 'Formative Assessment',
    icon: 'analytics',
    color: '#10B981',
    description: 'FA-1 to FA-4 Internal Exams',
    examPrefix: 'FA',
    subExams: ['FA-1', 'FA-2', 'FA-3', 'FA-4']
  },
  {
    key: 'sa_results',
    title: 'Summative Assessment',
    icon: 'school',
    color: '#F59E0B',
    description: 'Half-yearly and Annual Exams',
    examPrefix: 'SA',
    subExams: ['SA-1', 'SA-2']
  },
  {
    key: 'special',
    title: 'Special Exams',
    icon: 'star',
    color: '#8B5CF6',
    description: 'Talent tests and special evaluations',
    examPrefix: 'Special',
    subExams: ['Special-1', 'Special-2']
  },
  {
    key: 'weekend',
    title: 'Weekend Exams',
    icon: 'calendar',
    color: '#EC4899',
    description: 'Weekly practice (IIT/NEET)',
    examPrefix: 'W',
    subExams: ['W-1', 'W-2', 'W-3', 'W-4']
  }];

function parseExamIndex(name: string, prefix: string): number | null {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = name.match(new RegExp(`^${escaped}-(\\d+)$`));
  return match ? parseInt(match[1], 10) : null;
}

function formatExamName(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

function sortSubExams(exams: string[], prefix: string): string[] {
  return [...exams].sort((a, b) => {
    const indexA = parseExamIndex(a, prefix);
    const indexB = parseExamIndex(b, prefix);
    if (indexA != null && indexB != null) return indexA - indexB;
    return a.localeCompare(b);
  });
}

function mergeSubExams(
  category: ExamCategory,
  extra: string[],
  fromDb: string[]
): string[] {
  const base = category.subExams ?? [];
  const merged = new Set([...base, ...extra, ...fromDb]);
  return sortSubExams([...merged], category.examPrefix);
}

function getNextExamName(category: ExamCategory, currentExams: string[]): string {
  let maxIndex = 0;
  for (const name of currentExams) {
    const index = parseExamIndex(name, category.examPrefix);
    if (index != null && index > maxIndex) maxIndex = index;
  }
  return formatExamName(category.examPrefix, maxIndex + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: derive unique class-sections from flat assignment list
// ─────────────────────────────────────────────────────────────────────────────

interface ClassSectionGroup {
  class_section_id: string;
  class_id: string;
  section_id: string;
  label: string; // e.g. "10-A"
}

function getUniqueClassSections(
  assignments: TeacherClassAssignment[])
  : ClassSectionGroup[] {
  const seen = new Set<string>();
  const result: ClassSectionGroup[] = [];
  for (const a of assignments) {
    if (!seen.has(a.class_section_id)) {
      seen.add(a.class_section_id);
      result.push({
        class_section_id: a.class_section_id,
        class_id: a.class_id,
        section_id: a.section_id,
        label: `${a.class_name}-${a.section_name}`
      });
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function UploadMarks() {
  const { theme, isDark } = useTheme();
  const { isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);

  // ── view state ──────────────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<ExamCategory | null>(null);
  const [selectedSubExam, setSelectedSubExam] = useState('');
  const [maxMarks, setMaxMarks] = useState('100');
  const [extraSubExams, setExtraSubExams] = useState<Record<string, string[]>>({});
  const [dbSubExams, setDbSubExams] = useState<string[]>([]);

  // ── assignment / filter state ────────────────────────────────────────────────
  const [assignments, setAssignments] = useState<TeacherClassAssignment[]>([]);

  /**
   * TWO-LEVEL FILTER
   * Level 1 – Class-Section (unique, derived from assignments)
   * Level 2 – Subject (filtered by selected class_section_id)
   * Together they resolve a single TeacherClassAssignment → selectedAssignment
   */
  const [selectedClassSectionId, setSelectedClassSectionId] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

  // Derived: unique class-sections
  const classSections = useMemo(
    () => getUniqueClassSections(assignments),
    [assignments]
  );

  // Derived: subjects available for the chosen class-section
  const availableSubjects = useMemo(
    () =>
      assignments.filter(
        (a) => a.class_section_id === selectedClassSectionId
      ),
    [assignments, selectedClassSectionId]
  );

  // Derived: resolved assignment (the single row we actually use for API calls)
  const selectedAssignment: TeacherClassAssignment | null = useMemo(
    () =>
      assignments.find(
        (a) =>
          a.class_section_id === selectedClassSectionId &&
          a.subject_id === selectedSubjectId
      ) ?? null,
    [assignments, selectedClassSectionId, selectedSubjectId]
  );

  // ── data state ───────────────────────────────────────────────────────────────
  const [marks, setMarks] = useState<{ [key: string]: string; }>({});
  const [students, setStudents] = useState<StudentWithDetails[]>([]);
  const [loading, setLoading] = useState(false);

  const { user } = useAuth();

  const activeSubExams = useMemo(() => {
    if (!selectedCategory) return [];
    return mergeSubExams(
      selectedCategory,
      extraSubExams[selectedCategory.key] ?? [],
      dbSubExams
    );
  }, [selectedCategory, extraSubExams, dbSubExams]);

  const filledCount = useMemo(
    () => Object.values(marks).filter((v) => v !== '' && v != null).length,
    [marks],
  );

  const accentColor = selectedCategory?.color ?? '#7C6FFF';

  const getDisplaySubExams = useCallback(
    (cat: ExamCategory) => mergeSubExams(cat, extraSubExams[cat.key] ?? [], []),
    [extraSubExams]
  );

  // ── effects ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(EXTRA_SUB_EXAMS_KEY).then((raw) => {
      if (!raw) return;
      try {
        setExtraSubExams(JSON.parse(raw));
      } catch {
        // ignore corrupt storage
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedCategory) {
      setDbSubExams([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const exams = await ResultService.getExams();
        if (cancelled) return;
        const names = exams
          .filter((exam) => exam.exam_type === selectedCategory.key)
          .map((exam) => exam.name);
        setDbSubExams(names);
      } catch {
        if (!cancelled) setDbSubExams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCategory?.key]);

  useEffect(() => {
    if (!selectedCategory || activeSubExams.length === 0) return;
    if (!activeSubExams.includes(selectedSubExam)) {
      setSelectedSubExam(activeSubExams[0]);
    }
  }, [activeSubExams, selectedCategory, selectedSubExam]);

  // 1. Load assignments on mount
  useEffect(() => {
    fetchAssignments();
  }, []);

  // 2. Auto-select first class-section when assignments load
  useEffect(() => {
    if (classSections.length > 0 && !selectedClassSectionId) {
      setSelectedClassSectionId(classSections[0].class_section_id);
    }
  }, [classSections]);

  // 3. Auto-select first subject when class-section changes
  useEffect(() => {
    if (availableSubjects.length > 0) {
      setSelectedSubjectId(availableSubjects[0].subject_id);
    } else {
      setSelectedSubjectId(null);
    }
  }, [selectedClassSectionId, availableSubjects]);

  // 4. Fetch students when resolved assignment changes
  useEffect(() => {
    if (selectedCategory && selectedAssignment) {
      fetchStudents();
    } else {
      setStudents([]);
    }
  }, [selectedCategory, selectedAssignment]);

  // 5. Fetch existing marks when sub-exam or assignment changes
  useEffect(() => {
    if (selectedCategory && selectedAssignment && selectedSubExam) {
      fetchExistingMarks();
    }
  }, [selectedCategory, selectedAssignment, selectedSubExam]);

  // ── data fetchers ─────────────────────────────────────────────────────────────

  const fetchAssignments = async () => {
    try {
      const data = await TeacherService.getMyClasses();
      setAssignments(data);
    } catch (error) {

      alertCompat('Error', 'Could not load your assigned classes.');
    }
  };

  const fetchExistingMarks = async () => {
    if (!selectedAssignment || !selectedCategory || !selectedSubExam) return;
    try {
      setLoading(true);
      const data = await ResultService.getMarks({
        class_section_id: selectedAssignment.class_section_id,
        exam_category: selectedCategory.key,
        sub_exam: selectedSubExam,
        subject_id: selectedAssignment.subject_id
      });
      setMaxMarks(data.max_marks ? data.max_marks.toString() : '100');
      const newMarks: { [key: string]: string; } = {};
      if (data.marks?.length > 0) {
        data.marks.forEach((m: any) => {
          newMarks[m.student_id] = m.marks_obtained.toString();
        });
      }
      setMarks(newMarks);
    } catch (error) {

    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    if (!selectedAssignment) return;
    try {
      setLoading(true);
      const response = await StudentService.getAll<StudentWithDetails>({
        class_id: selectedAssignment.class_id,
        section_id: selectedAssignment.section_id,
        limit: 100
      });
      setStudents(response.data);
    } catch (error) {

      alertCompat('Error', 'Failed to fetch students');
    } finally {
      setLoading(false);
    }
  };

  // ── handlers ──────────────────────────────────────────────────────────────────

  const handleBackToDashboard = () => {
    setSelectedCategory(null);
    setMarks({});
  };

  const handleMaxMarksChange = (text: string) => {
    if (/^\d*$/.test(text)) setMaxMarks(text);
  };

  const handleMarkChange = (studentId: string, text: string) => {
    if (/^\d*$/.test(text) && (text === '' || Number(text) <= Number(maxMarks))) {
      setMarks((prev) => ({ ...prev, [studentId]: text }));
    }
  };

  const handleAddSubExam = async () => {
    if (!selectedCategory) return;
    const nextExam = getNextExamName(selectedCategory, activeSubExams);
    const categoryKey = selectedCategory.key;
    const updatedExtras = {
      ...extraSubExams,
      [categoryKey]: [...(extraSubExams[categoryKey] ?? []), nextExam]
    };
    setExtraSubExams(updatedExtras);
    setSelectedSubExam(nextExam);
    setMarks({});
    try {
      await AsyncStorage.setItem(EXTRA_SUB_EXAMS_KEY, JSON.stringify(updatedExtras));
    } catch {
      // non-blocking if storage fails
    }
  };

  const handleSubmit = async () => {
    if (!selectedCategory || !selectedAssignment) return;
    const filledMarks = Object.keys(marks).map((studentId) => ({
      student_id: studentId,
      marks: Number(marks[studentId])
    }));
    if (filledMarks.length === 0) {
      alertCompat('Warning', 'No marks entered.');
      return;
    }
    alertCompat(
      'Confirm Upload',
      `Upload ${selectedCategory.title} – ${selectedSubExam} marks for ${selectedAssignment.class_name}-${selectedAssignment.section_name} (${selectedAssignment.subject_name})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upload',
          onPress: async () => {
            try {
              setLoading(true);
              await ResultService.upload({
                class_section_id: selectedAssignment.class_section_id,
                exam_category: selectedCategory.key,
                sub_exam: selectedSubExam,
                subject_id: selectedAssignment.subject_id,
                max_marks: Number(maxMarks),
                results: filledMarks
              });
              alertCompat('Success', 'Marks uploaded successfully!');
              setSelectedCategory(null);
              setMarks({});
            } catch (e) {

              alertCompat('Error', 'Failed to upload marks');
            } finally {
              setLoading(false);
            }
          }
        }]

    );
  };

  // ── renders ───────────────────────────────────────────────────────────────────

  const renderDashboard = () =>
    <ScrollView contentContainerStyle={styles.dashboardContent}>
      <View style={styles.headerSection}>
        <LinearGradient
          colors={isDark ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
          style={styles.cardSheen}
        />
        <Text style={styles.pageTitle}>Marks Entry</Text>
        <Text style={styles.pageSubtitle}>Select an exam category to begin</Text>
      </View>
      <View style={styles.gridContainer}>
        {EXAM_CATEGORIES.map((cat, index) =>
          <Animated.View
            key={cat.key}
            entering={FadeInDown.delay(index * 80).duration(500)}
            style={styles.cardContainer}>

            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.75}
              onPress={() => {
                setSelectedCategory(cat);
                const exams = getDisplaySubExams(cat);
                if (exams.length) setSelectedSubExam(exams[0]);
              }}>

              <View style={[styles.iconBox, { backgroundColor: cat.color + '18' }, clayGlow(cat.color, 'sm')]}>
                <Ionicons name={cat.icon} size={22} color={cat.color} />
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.cardTitle}>{cat.title}</Text>
                <Text style={styles.cardSubtitle}>{cat.description}</Text>
                {cat.subExams &&
                  <View style={styles.badgeRow}>
                    {getDisplaySubExams(cat).slice(0, 4).map((sub) =>
                      <View key={sub} style={[styles.badge, { borderColor: cat.color + '60' }]}>
                        <Text style={[styles.badgeText, { color: cat.color }]}>{sub}</Text>
                      </View>
                    )}
                    {getDisplaySubExams(cat).length > 4 &&
                      <Text style={[styles.badgeMore, { color: cat.color }]}>
                        +{getDisplaySubExams(cat).length - 4}
                      </Text>
                    }
                  </View>
                }
              </View>
              <View style={[styles.arrowBox, { backgroundColor: cat.color }, clayGlow(cat.color, 'sm')]}>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </ScrollView>;

  const renderFilterSection = () => {
    if (assignments.length === 0) {
      return (
        <View style={styles.emptyFilterBanner}>
          <Ionicons name="warning-outline" size={16} color="#DC2626" />
          <Text style={styles.emptyFilterText}>No classes are assigned to you in the timetable.</Text>
        </View>);

    }

    return (
      <View style={styles.filterSection}>
        <LinearGradient
          colors={isDark ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
          style={styles.cardSheen}
        />
        <View style={styles.filterGroup}>
          <FilterLabelPill icon="business-outline" label="Class" color="#8B5CF6" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {classSections.map((cs) => {
              const active = selectedClassSectionId === cs.class_section_id;
              return (
                <TouchableOpacity
                  key={cs.class_section_id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSelectedClassSectionId(cs.class_section_id)}
                  activeOpacity={0.7}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{cs.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.filterGroup}>
          <FilterLabelPill icon="book-outline" label="Subject" color="#10B981" />
          {availableSubjects.length === 0 ? (
            <Text style={styles.noSubjectText}>No subjects for this class.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {availableSubjects.map((a) => {
                const active = selectedSubjectId === a.subject_id;
                return (
                  <TouchableOpacity
                    key={a.subject_id}
                    style={[styles.chip, styles.chipSubject, active && styles.chipSubjectActive]}
                    onPress={() => setSelectedSubjectId(a.subject_id)}
                    activeOpacity={0.7}>
                    <Text style={[styles.chipText, active && styles.chipSubjectTextActive]}>{a.subject_name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        <View style={styles.filterGroup}>
          <FilterLabelPill icon="layers-outline" label="Exam" color="#F59E0B" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {activeSubExams.map((exam) => {
              const active = selectedSubExam === exam;
              return (
                <TouchableOpacity
                  key={exam}
                  style={[styles.examTab, active && styles.examTabActive]}
                  onPress={() => setSelectedSubExam(exam)}
                  activeOpacity={0.7}>
                  <Text style={[styles.examTabText, active && styles.examTabTextActive]}>{exam}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.examTabAdd} onPress={handleAddSubExam} activeOpacity={0.7} accessibilityLabel="Add exam">
              <Ionicons name="add" size={18} color="#8B5CF6" />
            </TouchableOpacity>
          </ScrollView>
        </View>

        <View style={styles.workspaceDivider} />

        <View style={styles.maxMarksRow}>
          <View style={styles.maxMarksLeft}>
            <View style={[styles.maxMarksIcon, clayGlow(accentColor, 'sm')]}>
              <Ionicons name="trophy" size={16} color={accentColor} />
            </View>
            <View>
              <Text style={styles.maxMarksLabel}>Total Marks</Text>
              <Text style={styles.maxMarksHint}>Out of score for this exam</Text>
            </View>
          </View>
          <AppTextInput
            style={styles.maxMarksInput}
            value={maxMarks}
            onChangeText={handleMaxMarksChange}
            keyboardType="numeric"
            maxLength={3}
          />
        </View>
      </View>
    );

  };

  const renderUploadForm = () =>
    <>
      <KeyboardAwareScreen
        variant="scroll"
        contentContainerStyle={styles.uploadScroll}
        showsVerticalScrollIndicator={false}
        bottomOffset={24}>

        {selectedAssignment && (
          <Animated.View entering={FadeInRight.duration(300)} style={styles.breadcrumb}>
            <View style={[styles.breadcrumbDot, { backgroundColor: accentColor }]} />
            <Text style={styles.breadcrumbText} numberOfLines={1}>
              {selectedAssignment.class_name}-{selectedAssignment.section_name}
              <Text style={styles.breadcrumbSep}> · </Text>
              {selectedAssignment.subject_name}
              <Text style={styles.breadcrumbSep}> · </Text>
              {selectedSubExam}
            </Text>
          </Animated.View>
        )}

        {renderFilterSection()}

        <View style={styles.studentsCard}>
          <LinearGradient
            colors={isDark ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.65)', 'rgba(255,255,255,0)']}
            style={styles.cardSheen}
          />
          <View style={styles.studentsCardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.studentsTitle}>Students</Text>
              <Text style={styles.studentsSubtitle}>
                {filledCount} of {students.length} marks entered
              </Text>
            </View>
            <View style={[styles.marksCapPill, clayGlow(accentColor, 'sm')]}>
              <Text style={[styles.marksCapText, { color: accentColor }]}>/{maxMarks}</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <LogoLoader size={60} color={accentColor} />
              <Text style={styles.loadingText}>Loading students…</Text>
            </View>
          ) : students.length > 0 ? (
            students.map((student, index) => (
              <Animated.View
                key={student.id}
                entering={FadeInDown.delay(index * 40).duration(350)}
                style={[styles.studentRow, index === students.length - 1 && styles.studentRowLast]}>
                <View style={[styles.studentAvatar, clayGlow('#8B5CF6', 'sm')]}>
                  <Text style={styles.studentAvatarText}>
                    {(student.person.first_name?.[0] ?? '?').toUpperCase()}
                  </Text>
                </View>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName} numberOfLines={1}>
                    {student.person.display_name ??
                      `${student.person.first_name} ${student.person.last_name}`}
                  </Text>
                  <Text style={styles.studentRoll}>#{student.admission_no}</Text>
                </View>
                <AppTextInput
                  style={[styles.markInput, marks[student.id] ? styles.markInputFilled : null]}
                  placeholder="—"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  maxLength={3}
                  value={marks[student.id] || ''}
                  onChangeText={(text) => handleMarkChange(student.id, text)}
                />
              </Animated.View>
            ))
          ) : (
            <View style={styles.emptyStudents}>
              <View style={[styles.emptyIcon, clayGlow(accentColor, 'sm')]}>
                <Ionicons name="people-outline" size={28} color={accentColor} />
              </View>
              <Text style={styles.emptyStudentsText}>No students found</Text>
              <Text style={styles.emptyStudentsSubtext}>
                {selectedAssignment
                  ? `No students in ${selectedAssignment.class_name}-${selectedAssignment.section_name}`
                  : 'Select a class and subject above'}
              </Text>
            </View>
          )}
        </View>
      </KeyboardAwareScreen>

      <View style={styles.floatingAction}>
        <View style={styles.submitCountBadge}>
          <View style={[styles.submitCountDot, { backgroundColor: filledCount > 0 ? '#10B981' : '#94A3B8' }]} />
          <Text style={styles.submitCountText}>
            {filledCount} / {students.length} filled
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.submitPressable, pressed && { opacity: 0.92 }]}
          onPress={handleSubmit}
          disabled={loading || !selectedAssignment}>
          <LinearGradient
            colors={loading || !selectedAssignment ? ['#C4B5FD', '#A78BFA'] : ['#6D28D9', '#8B5CF6', '#A78BFA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.submitButton, clayGlow('#7C3AED', 'md')]}>
            {loading ? (
              <LogoLoader size={30} color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
                <Text style={styles.submitText}>Upload Results</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </>;

  // ── Main Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.orb1, { backgroundColor: isDark ? 'rgba(124,111,255,0.14)' : 'rgba(124,111,255,0.10)' }]} />
      <View style={[styles.orb2, { backgroundColor: isDark ? 'rgba(59,130,246,0.10)' : 'rgba(59,130,246,0.08)' }]} />

      <StaffHeader
        title={selectedCategory?.title ?? 'Upload Marks'}
        showBackButton={true} />
      {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}

      {selectedCategory && (
        <TouchableOpacity style={styles.backToDash} onPress={handleBackToDashboard} activeOpacity={0.8}>
          <View style={[styles.backIcon, clayGlow(accentColor, 'sm')]}>
            <Ionicons name="grid-outline" size={14} color={accentColor} />
          </View>
          <Text style={styles.backText}>All Exams</Text>
        </TouchableOpacity>
      )}

      {selectedCategory ? renderUploadForm() : renderDashboard()}
    </View>);

}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const getStyles = (theme: Theme, isDark: boolean) => {
  const pageBg = isDark ? '#0B1020' : '#EFF2F9';
  const cardBg = isDark ? '#1A2332' : '#EFF2F9';
  const chipBase: ViewStyle = {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#EFF2F9',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.8)',
    ...clay(isDark, 'sm'),
  };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: pageBg,
    },
    orb1: {
      position: 'absolute',
      top: 80,
      right: -60,
      width: 220,
      height: 220,
      borderRadius: 110,
      opacity: 0.9,
    },
    orb2: {
      position: 'absolute',
      top: 280,
      left: -80,
      width: 180,
      height: 180,
      borderRadius: 90,
      opacity: 0.85,
    },
    cardSheen: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 80,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
    },

    // ── Dashboard ────────────────────────────────────────────────────────────
    dashboardContent: {
      padding: 20,
      // Clear the floating bottom tab bar so the last category card isn't covered.
      paddingBottom: staffTabBarReserve(theme.spacing),
    },
    headerSection: {
      marginBottom: 22,
      ...clayCard(isDark, 'md'),
      padding: 20,
      overflow: 'hidden',
    },
    pageTitle: {
      fontSize: 24,
      fontWeight: '900',
      color: theme.colors.text,
      letterSpacing: -0.5,
    },
    pageSubtitle: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 6,
      lineHeight: 18,
    },
    gridContainer: {
      gap: 16,
    },
    cardContainer: {
      width: '100%',
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 20,
      ...clayCard(isDark, 'md'),
      overflow: 'hidden',
    },
    iconBox: {
      width: 54,
      height: 54,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 16,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.4)',
    },
    textContainer: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: theme.colors.text,
      marginBottom: 4,
      letterSpacing: -0.2,
    },
    cardSubtitle: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      lineHeight: 18,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 10,
    },
    badge: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.5)',
      ...clayInset(isDark),
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    badgeMore: {
      fontSize: 11,
      fontWeight: '700',
      alignSelf: 'center',
    },
    arrowBox: {
      width: 42,
      height: 42,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 10,
    },

    // ── Upload flow ──────────────────────────────────────────────────────────
    uploadScroll: {
      paddingBottom: 200,
    },
    backToDash: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginTop: 8,
      marginBottom: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignSelf: 'flex-start',
      gap: 10,
    },
    backIcon: {
      width: 32,
      height: 32,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(124,111,255,0.14)' : '#EFF2F9',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(124,111,255,0.3)',
      ...clay(isDark, 'sm'),
    },
    backText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      fontWeight: '800',
    },
    breadcrumb: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(124,111,255,0.10)' : 'rgba(124,111,255,0.05)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(124,111,255,0.18)' : 'rgba(124,111,255,0.15)',
      ...clayInset(isDark),
    },
    breadcrumbDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    breadcrumbText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '800',
      color: isDark ? '#C4B5FD' : '#5B21B6',
      letterSpacing: 0.1,
    },
    breadcrumbSep: {
      color: isDark ? 'rgba(196,181,253,0.5)' : 'rgba(91,33,182,0.35)',
      fontWeight: '600',
    },

    // ── Workspace / filters ────────────────────────────────────────────────────
    filterSection: {
      marginHorizontal: 16,
      marginBottom: 16,
      paddingTop: 20,
      paddingBottom: 20,
      gap: 20,
      ...clayCard(isDark, 'lg'),
      overflow: 'hidden',
    },
    filterGroup: {
      paddingHorizontal: 16,
    },
    chipRow: {
      flexDirection: 'row',
      gap: 12,
      paddingRight: 16,
      paddingBottom: 6,
    },
    chip: chipBase,
    chipActive: {
      backgroundColor: isDark ? 'rgba(139,92,246,0.10)' : '#EEF2FF',
      borderColor: 'rgba(139,92,246,0.2)',
      ...clayInset(isDark),
    },
    chipSubject: chipBase,
    chipSubjectActive: {
      backgroundColor: isDark ? 'rgba(16,185,129,0.18)' : '#F0FDF4',
      borderColor: 'rgba(16,185,129,0.2)',
      ...clayInset(isDark),
    },
    chipText: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.colors.textSecondary,
    },
    chipTextActive: {
      color: '#7C3AED',
    },
    chipSubjectTextActive: {
      color: '#059669',
    },
    examTab: chipBase,
    examTabActive: {
      backgroundColor: isDark ? 'rgba(245,158,11,0.18)' : '#FFF7ED',
      borderColor: 'rgba(245,158,11,0.2)',
      ...clayInset(isDark),
    },
    examTabText: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.colors.textSecondary,
    },
    examTabTextActive: {
      color: '#D97706',
    },
    examTabAdd: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: isDark ? 'rgba(139,92,246,0.10)' : '#EFF2F9',
      borderWidth: 1.5,
      borderColor: '#8B5CF6',
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      ...clayInset(isDark),
    },
    workspaceDivider: {
      height: 1,
      marginHorizontal: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.14)',
    },
    emptyFilterBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      margin: 16,
      padding: 14,
      backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(239,68,68,0.25)' : '#FECACA',
      ...clayGlow('#EF4444', 'sm'),
    },
    emptyFilterText: {
      color: '#DC2626',
      fontSize: 14,
      fontWeight: '600',
      flex: 1,
    },
    noSubjectText: {
      color: theme.colors.textTertiary,
      fontSize: 13,
      fontStyle: 'italic',
      paddingLeft: 4,
    },
    maxMarksRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 4,
    },
    maxMarksLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      flex: 1,
    },
    maxMarksIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(124,111,255,0.12)' : '#EFF2F9',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(124,111,255,0.3)',
      ...clay(isDark, 'sm'),
    },
    maxMarksLabel: {
      fontSize: 15,
      fontWeight: '800',
      color: theme.colors.text,
      letterSpacing: -0.2,
    },
    maxMarksHint: {
      fontSize: 12,
      color: theme.colors.textTertiary,
      marginTop: 2,
    },
    maxMarksInput: {
      borderWidth: 1.5,
      borderColor: 'rgba(139,92,246,0.2)',
      borderRadius: 16,
      width: 86,
      height: 54,
      textAlign: 'center',
      fontSize: 20,
      fontWeight: '900',
      color: '#7C3AED',
      backgroundColor: isDark ? 'rgba(139,92,246,0.10)' : '#F5F3FF',
      ...clayInset(isDark),
    },

    // ── Students card ────────────────────────────────────────────────────────
    studentsCard: {
      marginHorizontal: 16,
      marginTop: 8,
      ...clayCard(isDark, 'lg'),
      overflow: 'hidden',
      paddingBottom: 8,
    },
    studentsCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.15)',
    },
    studentsTitle: {
      fontSize: 18,
      fontWeight: '900',
      color: theme.colors.text,
      letterSpacing: -0.3,
    },
    studentsSubtitle: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 4,
      fontWeight: '600',
    },
    marksCapPill: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(124,111,255,0.10)' : '#EFF2F9',
      borderWidth: 1,
      borderColor: 'rgba(124,111,255,0.2)',
      ...clay(isDark, 'sm'),
    },
    marksCapText: {
      fontSize: 16,
      fontWeight: '900',
    },
    loadingContainer: {
      alignItems: 'center',
      paddingVertical: 48,
      gap: 14,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    studentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(148,163,184,0.12)',
      gap: 14,
    },
    studentRowLast: {
      borderBottomWidth: 0,
    },
    studentAvatar: {
      width: 46,
      height: 46,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(139,92,246,0.16)' : '#EFF2F9',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(139,92,246,0.3)',
      ...clay(isDark, 'sm'),
    },
    studentAvatarText: {
      fontSize: 16,
      fontWeight: '900',
      color: '#7C3AED',
    },
    studentInfo: {
      flex: 1,
      minWidth: 0,
    },
    studentName: {
      fontSize: 15,
      fontWeight: '800',
      color: theme.colors.text,
      letterSpacing: -0.1,
    },
    studentRoll: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 3,
      fontWeight: '600',
    },
    markInput: {
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.25)',
      borderRadius: 14,
      width: 68,
      height: 48,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '800',
      color: theme.colors.text,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#EFF2F9',
      ...clayInset(isDark),
    },
    markInputFilled: {
      borderColor: 'rgba(139,92,246,0.5)',
      backgroundColor: isDark ? 'rgba(139,92,246,0.14)' : '#F5F3FF',
      color: '#7C3AED',
    },
    emptyStudents: {
      alignItems: 'center',
      paddingVertical: 56,
      paddingHorizontal: 24,
      gap: 12,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(124,111,255,0.10)' : '#EFF2F9',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
      borderWidth: 1,
      borderColor: 'rgba(124,111,255,0.2)',
      ...clay(isDark, 'sm'),
    },
    emptyStudentsText: {
      fontSize: 17,
      fontWeight: '800',
      color: theme.colors.textSecondary,
    },
    emptyStudentsSubtext: {
      fontSize: 14,
      color: theme.colors.textTertiary,
      textAlign: 'center',
      lineHeight: 20,
    },

    // ── Submit ───────────────────────────────────────────────────────────────
    floatingAction: {
      position: 'absolute',
      bottom: 90,
      left: 18,
      right: 18,
      gap: 12,
    },
    submitCountBadge: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 24,
      backgroundColor: cardBg,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.8)',
      ...clay(isDark, 'sm'),
    },
    submitCountDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    submitCountText: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.colors.textSecondary,
    },
    submitPressable: {
      borderRadius: 24,
      overflow: 'hidden',
    },
    submitButton: {
      paddingVertical: 18,
      borderRadius: 24,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
    },
    submitText: {
      color: '#fff',
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
  });
};
