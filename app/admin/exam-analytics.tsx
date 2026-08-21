import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';

import AdminHeader from '../../src/components/AdminHeader';
import AppTextInput from '../../src/components/AppTextInput';
import LogoLoader from '../../src/components/LogoLoader';
import StudentPhoto from '../../src/components/StudentPhoto';
import { useTheme } from '../../src/hooks/useTheme';
import type { Theme } from '../../src/theme/themes';
import {
  ExamAnalyticsClassSection,
  ExamAnalyticsContext,
  ExamAnalyticsExam,
  ExamAnalyticsReport,
  ExamAnalyticsService,
  ExamAnalyticsStudent,
} from '../../src/services/examAnalyticsService';
import {
  buildExamAnalyticsSeries,
  ExamAnalyticsScale,
  isStudentInsideClassRange,
} from '../../src/utils/examAnalytics';
import { searchStudentsByPrefix } from '../../src/utils/studentPrefixSearch';

const SERIES = [
  { key: 'highest', label: 'Class maximum', color: '#2563EB' },
  { key: 'average', label: 'Class average', color: '#8B5CF6' },
  { key: 'lowest', label: 'Class minimum', color: '#F59E0B' },
  { key: 'student', label: 'Selected student', color: '#10B981' },
] as const;

const displayScore = (value: number | null, suffix = '') => value == null ? '—' : `${Number(value.toFixed(2))}${suffix}`;

export default function ExamAnalyticsScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { width } = useWindowDimensions();
  const requestSequence = useRef(0);
  const [context, setContext] = useState<ExamAnalyticsContext | null>(null);
  const [selectedClass, setSelectedClass] = useState<ExamAnalyticsClassSection | null>(null);
  const [selectedExam, setSelectedExam] = useState<ExamAnalyticsExam | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<ExamAnalyticsStudent | null>(null);
  const [report, setReport] = useState<ExamAnalyticsReport | null>(null);
  const [studentQuery, setStudentQuery] = useState('');
  const [scale, setScale] = useState<ExamAnalyticsScale>('score');
  const [loadingContext, setLoadingContext] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadReport = useCallback(async (
    classSection: ExamAnalyticsClassSection,
    exam: ExamAnalyticsExam,
    student?: ExamAnalyticsStudent | null,
  ) => {
    const sequence = ++requestSequence.current;
    setLoadingReport(true);
    setError('');
    try {
      const data = await ExamAnalyticsService.getReport(classSection.id, exam.id, student?.id);
      if (sequence === requestSequence.current) setReport(data);
    } catch (requestError: any) {
      if (sequence === requestSequence.current) {
        setReport(null);
        setError(requestError?.message || 'Could not calculate exam analytics.');
      }
    } finally {
      if (sequence === requestSequence.current) setLoadingReport(false);
    }
  }, []);

  const loadContext = useCallback(async (classSectionId?: string, asRefresh = false) => {
    if (asRefresh) setRefreshing(true);
    else setLoadingContext(true);
    setError('');
    try {
      const data = await ExamAnalyticsService.getContext(classSectionId);
      setContext(data);
      const nextClass = data.class_sections.find((item) => item.id === data.selected_class_section_id) ?? null;
      const nextExam = data.exams[0] ?? null;
      setSelectedClass(nextClass);
      setSelectedExam(nextExam);
      setSelectedStudent(null);
      setStudentQuery('');
      setReport(null);
      if (nextClass && nextExam) await loadReport(nextClass, nextExam, null);
    } catch (requestError: any) {
      setError(requestError?.message || 'Could not load exam analytics options.');
    } finally {
      setLoadingContext(false);
      setRefreshing(false);
    }
  }, [loadReport]);

  useEffect(() => { void loadContext(); }, [loadContext]);

  const studentMatches = useMemo(() => {
    if (!context) return [];
    return searchStudentsByPrefix(context.students, studentQuery, 8);
  }, [context, studentQuery]);

  const series = useMemo(
    () => buildExamAnalyticsSeries(report?.subjects ?? [], scale),
    [report, scale],
  );
  const chartWidth = Math.max(width - 86, (report?.subjects.length ?? 0) * 104);
  const chartSpacing = Math.max(78, chartWidth / Math.max(report?.subjects.length ?? 1, 1));
  const allStudentPointsInRange = report?.selected_student
    ? report.subjects.length > 0 && report.subjects.every((subject) =>
      subject.student_status === 'graded' && isStudentInsideClassRange(subject) === true
    )
    : false;

  const chooseClass = (classSection: ExamAnalyticsClassSection) => {
    if (classSection.id !== selectedClass?.id) void loadContext(classSection.id);
  };

  const chooseExam = (exam: ExamAnalyticsExam) => {
    setSelectedExam(exam);
    setSelectedStudent(null);
    setStudentQuery('');
    if (selectedClass) void loadReport(selectedClass, exam, null);
  };

  const chooseStudent = (student: ExamAnalyticsStudent) => {
    setSelectedStudent(student);
    setStudentQuery(student.display_name);
    if (selectedClass && selectedExam) void loadReport(selectedClass, selectedExam, student);
  };

  const clearStudent = () => {
    setSelectedStudent(null);
    setStudentQuery('');
    if (selectedClass && selectedExam) void loadReport(selectedClass, selectedExam, null);
  };

  return (
    <View style={styles.root}>
      <AdminHeader title="Exam Analytics" showBackButton />
      {loadingContext ? (
        <View style={styles.centerState}>
          <LogoLoader size={72} color="#7C3AED" />
          <Text style={styles.stateText}>Preparing exam analytics…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadContext(selectedClass?.id, true)} tintColor="#7C3AED" />}
        >
          <View style={styles.hero}>
            <View style={styles.heroIcon}><Ionicons name="analytics" size={28} color="#FFFFFF" /></View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>MANAGEMENT VIEW</Text>
              <Text style={styles.heroTitle}>Subject performance range</Text>
              <Text style={styles.heroText}>Compare minimum, average and maximum marks, then place any student inside the class performance range.</Text>
            </View>
          </View>

          {context?.class_sections.length ? (
            <View style={styles.selectorCard}>
              <Text style={styles.selectorLabel}>1 · Select class</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {context.class_sections.map((classSection) => {
                  const active = selectedClass?.id === classSection.id;
                  return <TouchableOpacity key={classSection.id} onPress={() => chooseClass(classSection)} style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{classSection.class_name}-{classSection.section_name}</Text>
                    <Text style={[styles.chipMeta, active && styles.chipMetaActive]}>{classSection.student_count} students</Text>
                  </TouchableOpacity>;
                })}
              </ScrollView>
            </View>
          ) : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No current classes</Text><Text style={styles.stateText}>Create a class section before opening exam analytics.</Text></View>}

          {!!selectedClass && (
            <View style={styles.selectorCard}>
              <Text style={styles.selectorLabel}>2 · Select exam</Text>
              {context?.exams.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {context.exams.map((exam) => {
                  const active = selectedExam?.id === exam.id;
                  return <TouchableOpacity key={exam.id} onPress={() => chooseExam(exam)} style={[styles.examChip, active && styles.examChipActive]}>
                    <Ionicons name={active ? 'document-text' : 'document-text-outline'} size={16} color={active ? '#FFFFFF' : '#7C3AED'} />
                    <Text style={[styles.examChipText, active && styles.examChipTextActive]}>{exam.name}</Text>
                  </TouchableOpacity>;
                })}
              </ScrollView> : <Text style={styles.stateText}>No exam papers are configured for this class.</Text>}
            </View>
          )}

          {!!selectedExam && (
            <View style={styles.studentCard}>
              <View style={styles.studentHeadingRow}>
                <View><Text style={styles.selectorLabel}>3 · Student overlay (optional)</Text><Text style={styles.selectorHint}>Search by name, initials, or admission-number prefix.</Text></View>
                {!!selectedStudent && <Pressable onPress={clearStudent} style={styles.clearButton}><Text style={styles.clearButtonText}>Class overview</Text></Pressable>}
              </View>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color={theme.colors.textTertiary} />
                <AppTextInput
                  value={studentQuery}
                  onChangeText={(text) => {
                    setStudentQuery(text);
                    if (selectedStudent && text !== selectedStudent.display_name) {
                      setSelectedStudent(null);
                      setReport(null);
                    }
                  }}
                  placeholder="Student name or admission number"
                  placeholderTextColor={theme.colors.textTertiary}
                  style={styles.searchInput}
                />
                {!!studentQuery && <Pressable onPress={clearStudent}><Ionicons name="close-circle" size={21} color={theme.colors.textTertiary} /></Pressable>}
              </View>
              {!!studentQuery.trim() && !selectedStudent && (
                <View style={styles.matchList}>
                  {studentMatches.length ? studentMatches.map((student) => (
                    <TouchableOpacity key={student.id} style={styles.studentOption} onPress={() => chooseStudent(student)}>
                      <StudentPhoto photoUrl={student.photo_url} displayName={student.display_name} size={39} borderRadius={12} />
                      <View style={{ flex: 1 }}><Text style={styles.studentName}>{student.display_name}</Text><Text style={styles.studentMeta}>Admission {student.admission_no}{student.roll_number ? ` · Roll ${student.roll_number}` : ''}</Text></View>
                      <Ionicons name="chevron-forward" size={17} color={theme.colors.textTertiary} />
                    </TouchableOpacity>
                  )) : <Text style={styles.noMatch}>No matching active student in this class.</Text>}
                </View>
              )}
            </View>
          )}

          {!!error && <View style={styles.errorBanner}><Ionicons name="alert-circle-outline" size={19} color="#DC2626" /><Text style={styles.errorText}>{error}</Text></View>}
          {loadingReport && <View style={styles.loadingCard}><ActivityIndicator color="#7C3AED" /><Text style={styles.stateText}>Calculating every subject…</Text></View>}

          {report && !loadingReport && (
            <>
              <View style={styles.metricGrid}>
                {[
                  ['Subjects', String(report.summary.subject_count), 'library-outline', '#2563EB'],
                  ['Students', String(report.summary.student_count), 'people-outline', '#059669'],
                  ['Marks complete', `${report.summary.completion_percentage.toFixed(1)}%`, 'checkmark-done-outline', '#7C3AED'],
                  ['Strongest subject', report.summary.strongest_subject ?? '—', 'trending-up-outline', '#0891B2'],
                  ['Needs focus', report.summary.focus_subject ?? '—', 'flag-outline', '#EA580C'],
                  [report.selected_student ? 'Student average' : 'Recorded marks', report.selected_student ? `${displayScore(report.summary.student_average_percentage, '%')}` : `${report.summary.graded_entries}/${report.summary.possible_entries}`, 'person-outline', '#DB2777'],
                ].map(([label, value, icon, color]) => <View key={label} style={styles.metricCard}>
                  <View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}><Ionicons name={icon as any} size={17} color={color} /></View>
                  <Text style={styles.metricLabel}>{label}</Text><Text numberOfLines={2} style={styles.metricValue}>{value}</Text>
                </View>)}
              </View>

              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <View style={styles.chartTitleCopy}>
                    <Text style={styles.chartTitle}>{report.exam.name} · {report.class_section.class_name}-{report.class_section.section_name}</Text>
                    <Text style={styles.chartSubtitle}>X-axis: subjects · Y-axis: {scale === 'score' ? 'marks scored' : 'percentage'}</Text>
                  </View>
                  <View style={styles.scaleToggle}>
                    {(['score', 'percentage'] as ExamAnalyticsScale[]).map((option) => <Pressable key={option} onPress={() => setScale(option)} style={[styles.scaleOption, scale === option && styles.scaleOptionActive]}><Text style={[styles.scaleText, scale === option && styles.scaleTextActive]}>{option === 'score' ? 'Scores' : '%'}</Text></Pressable>)}
                  </View>
                </View>

                <View style={styles.legend}>
                  {SERIES.filter((item) => item.key !== 'student' || report.selected_student).map((item) => <View key={item.key} style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: item.color }]} /><Text style={styles.legendText}>{item.key === 'student' ? report.selected_student?.display_name : item.label}</Text></View>)}
                </View>

                {report.subjects.length ? <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.chartScroll}>
                  <LineChart
                    data={series.highest}
                    data2={series.average}
                    data3={series.lowest}
                    data4={report.selected_student ? series.student : undefined}
                    height={270}
                    width={chartWidth}
                    maxValue={series.maximumValue}
                    noOfSections={5}
                    stepValue={series.maximumValue / 5}
                    spacing={chartSpacing}
                    initialSpacing={38}
                    endSpacing={28}
                    color1="#2563EB"
                    color2="#8B5CF6"
                    color3="#F59E0B"
                    color4="#10B981"
                    thickness1={2.4}
                    thickness2={2.4}
                    thickness3={2.4}
                    thickness4={3.4}
                    strokeDashArray1={[8, 5]}
                    strokeDashArray3={[8, 5]}
                    dataPointsColor1="#2563EB"
                    dataPointsColor2="#8B5CF6"
                    dataPointsColor3="#F59E0B"
                    dataPointsColor4="#10B981"
                    dataPointsRadius1={4}
                    dataPointsRadius2={4}
                    dataPointsRadius3={4}
                    dataPointsRadius4={5}
                    yAxisLabelSuffix={scale === 'percentage' ? '%' : ''}
                    yAxisThickness={0}
                    xAxisThickness={1}
                    xAxisColor={isDark ? '#334155' : '#CBD5E1'}
                    rulesColor={isDark ? 'rgba(255,255,255,.08)' : '#E2E8F0'}
                    yAxisTextStyle={styles.axisText}
                    xAxisLabelTextStyle={styles.xAxisText}
                    xAxisTextNumberOfLines={2}
                    interpolateMissingValues={false}
                    isAnimated
                    animateTogether
                    animationDuration={700}
                  />
                </ScrollView> : <Text style={styles.noMatch}>No subject papers are available for this exam.</Text>}

                {!!report.selected_student && (
                  <View style={[styles.rangeNote, allStudentPointsInRange ? styles.rangeNoteGood : styles.rangeNoteWarn]}>
                    <Ionicons name={allStudentPointsInRange ? 'shield-checkmark-outline' : 'warning-outline'} size={18} color={allStudentPointsInRange ? '#047857' : '#B45309'} />
                    <Text style={[styles.rangeNoteText, { color: allStudentPointsInRange ? '#047857' : '#B45309' }]}>{allStudentPointsInRange ? `${report.selected_student.display_name}'s line is inside the observed class minimum–maximum range.` : 'Some subjects are absent or still missing for this student.'}</Text>
                  </View>
                )}
              </View>

              <View style={styles.tableCard}>
                <View style={styles.tableHeading}><Text style={styles.tableTitle}>Subject statistics</Text><Text style={styles.tableHint}>Highest and lowest are observed marks, excluding absent and missing entries.</Text></View>
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                      {['Subject', 'Exam max', 'Class min', 'Average', 'Class max', report.selected_student ? 'Student' : 'Graded'].map((label, index) => <Text key={label} style={[styles.headerCell, { width: index === 0 ? 160 : 100 }]}>{label}</Text>)}
                    </View>
                    {report.subjects.map((subject, index) => <View key={subject.subject_id} style={[styles.tableRow, index % 2 === 1 && styles.tableAlt]}>
                      <Text style={[styles.subjectCell, { width: 160 }]}>{subject.subject_name}</Text>
                      <Text style={[styles.dataCell, { width: 100 }]}>{subject.max_marks}</Text>
                      <Text style={[styles.dataCell, { width: 100, color: '#D97706' }]}>{displayScore(subject.lowest_score)}</Text>
                      <Text style={[styles.dataCell, { width: 100, color: '#7C3AED' }]}>{displayScore(subject.average_score)}</Text>
                      <Text style={[styles.dataCell, { width: 100, color: '#2563EB' }]}>{displayScore(subject.highest_score)}</Text>
                      <Text style={[styles.studentCell, { width: 100 }]}>{report.selected_student ? (subject.student_status === 'absent' ? 'Absent' : displayScore(subject.student_score)) : `${subject.graded_students}/${subject.total_students}`}</Text>
                    </View>)}
                  </View>
                </ScrollView>
              </View>

              {!!report.selected_student && <View style={styles.insightCard}><Ionicons name="sparkles" size={20} color="#7C3AED" /><View style={{ flex: 1 }}><Text style={styles.insightTitle}>Management insight</Text><Text style={styles.insightText}>{report.selected_student.display_name} is at or above the class average in {report.summary.student_above_class_average ?? 0} of {report.subjects.filter((subject) => subject.student_score != null).length} graded subjects.</Text></View></View>}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const getStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  root: { flex: 1, backgroundColor: isDark ? '#0B1020' : '#F5F6FA' },
  page: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 16, paddingBottom: 100, gap: 14 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
  stateText: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 15, padding: 20, borderRadius: 24, backgroundColor: isDark ? '#312E81' : '#4338CA' },
  heroIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.15)' },
  heroCopy: { flex: 1 }, heroEyebrow: { color: '#C7D2FE', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginTop: 3 }, heroText: { color: '#E0E7FF', fontSize: 12, lineHeight: 17, marginTop: 5 },
  selectorCard: { padding: 15, borderRadius: 20, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  selectorLabel: { color: theme.colors.textStrong, fontSize: 14, fontWeight: '900' }, selectorHint: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 3 },
  chipRow: { gap: 9, paddingTop: 12, paddingBottom: 2 }, chip: { minWidth: 112, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: isDark ? 'rgba(255,255,255,.04)' : '#F8FAFC' },
  chipActive: { backgroundColor: '#4338CA', borderColor: '#4338CA' }, chipText: { color: theme.colors.textStrong, fontSize: 12, fontWeight: '900' }, chipTextActive: { color: '#FFFFFF' }, chipMeta: { color: theme.colors.textTertiary, fontSize: 9.5, marginTop: 3 }, chipMetaActive: { color: '#C7D2FE' },
  examChip: { minHeight: 42, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: '#C4B5FD', backgroundColor: isDark ? 'rgba(124,58,237,.08)' : '#F5F3FF' }, examChipActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' }, examChipText: { color: '#7C3AED', fontSize: 12, fontWeight: '800' }, examChipTextActive: { color: '#FFFFFF' },
  studentCard: { padding: 15, borderRadius: 20, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }, studentHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, clearButton: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9, backgroundColor: isDark ? 'rgba(124,58,237,.15)' : '#F5F3FF' }, clearButtonText: { color: '#7C3AED', fontSize: 10, fontWeight: '900' },
  searchWrap: { minHeight: 52, marginTop: 12, paddingHorizontal: 13, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: isDark ? 'rgba(255,255,255,.04)' : '#F8FAFC' }, searchInput: { flex: 1, height: 48, borderWidth: 0, paddingHorizontal: 0, backgroundColor: 'transparent', color: theme.colors.text },
  matchList: { marginTop: 8, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }, studentOption: { padding: 9, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }, studentName: { color: theme.colors.textStrong, fontSize: 13, fontWeight: '800' }, studentMeta: { color: theme.colors.textSecondary, fontSize: 10.5, marginTop: 2 }, noMatch: { color: theme.colors.textSecondary, fontSize: 12, fontStyle: 'italic', padding: 15 },
  errorBanner: { padding: 13, borderRadius: 14, flexDirection: 'row', gap: 8, backgroundColor: isDark ? 'rgba(220,38,38,.12)' : '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' }, errorText: { flex: 1, color: '#DC2626', fontSize: 12, fontWeight: '700' }, loadingCard: { minHeight: 100, borderRadius: 19, alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: theme.colors.card },
  emptyCard: { padding: 30, alignItems: 'center', borderRadius: 20, backgroundColor: theme.colors.card }, emptyTitle: { color: theme.colors.textStrong, fontSize: 17, fontWeight: '900', marginBottom: 5 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, metricCard: { flexGrow: 1, flexBasis: '29%', minWidth: 145, minHeight: 112, padding: 13, borderRadius: 17, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }, metricIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, metricLabel: { color: theme.colors.textSecondary, fontSize: 9.5, fontWeight: '800', textTransform: 'uppercase', marginTop: 8 }, metricValue: { color: theme.colors.textStrong, fontSize: 17, lineHeight: 21, fontWeight: '900', marginTop: 4 },
  chartCard: { overflow: 'hidden', borderRadius: 22, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }, chartHeader: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }, chartTitleCopy: { flex: 1 }, chartTitle: { color: theme.colors.textStrong, fontSize: 16, fontWeight: '900' }, chartSubtitle: { color: theme.colors.textSecondary, fontSize: 10.5, marginTop: 4 },
  scaleToggle: { padding: 3, borderRadius: 10, flexDirection: 'row', backgroundColor: isDark ? '#111827' : '#EEF2FF' }, scaleOption: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 }, scaleOptionActive: { backgroundColor: '#7C3AED' }, scaleText: { color: theme.colors.textSecondary, fontSize: 10, fontWeight: '900' }, scaleTextActive: { color: '#FFFFFF' },
  legend: { paddingHorizontal: 16, paddingTop: 13, flexDirection: 'row', flexWrap: 'wrap', gap: 13 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 }, legendLine: { width: 20, height: 3, borderRadius: 2 }, legendText: { color: theme.colors.textSecondary, fontSize: 10.5, fontWeight: '700' }, chartScroll: { padding: 13, paddingTop: 18, paddingBottom: 8 }, axisText: { color: theme.colors.textTertiary, fontSize: 9 }, xAxisText: { color: theme.colors.textSecondary, fontSize: 9, width: 75, textAlign: 'center' },
  rangeNote: { margin: 14, marginTop: 5, padding: 12, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 8 }, rangeNoteGood: { backgroundColor: isDark ? 'rgba(16,185,129,.12)' : '#ECFDF5' }, rangeNoteWarn: { backgroundColor: isDark ? 'rgba(245,158,11,.12)' : '#FFF7ED' }, rangeNoteText: { flex: 1, fontSize: 11, fontWeight: '700', lineHeight: 16 },
  tableCard: { overflow: 'hidden', borderRadius: 20, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }, tableHeading: { padding: 15, borderBottomWidth: 1, borderBottomColor: theme.colors.border }, tableTitle: { color: theme.colors.textStrong, fontSize: 15, fontWeight: '900' }, tableHint: { color: theme.colors.textSecondary, fontSize: 10.5, marginTop: 4 }, tableRow: { minHeight: 48, flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }, tableHeader: { backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF' }, tableAlt: { backgroundColor: isDark ? 'rgba(255,255,255,.02)' : '#FAFAFC' }, headerCell: { padding: 10, color: isDark ? '#C7D2FE' : '#3730A3', fontSize: 10, fontWeight: '900', textAlign: 'center', textAlignVertical: 'center' }, subjectCell: { padding: 10, color: theme.colors.textStrong, fontSize: 11.5, fontWeight: '800', textAlignVertical: 'center' }, dataCell: { padding: 10, color: theme.colors.text, fontSize: 11.5, fontWeight: '800', textAlign: 'center', textAlignVertical: 'center' }, studentCell: { padding: 10, color: '#059669', fontSize: 11.5, fontWeight: '900', textAlign: 'center', textAlignVertical: 'center' },
  insightCard: { padding: 16, borderRadius: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 11, backgroundColor: isDark ? 'rgba(124,58,237,.12)' : '#F5F3FF', borderWidth: 1, borderColor: isDark ? '#4C1D95' : '#DDD6FE' }, insightTitle: { color: isDark ? '#DDD6FE' : '#5B21B6', fontSize: 13, fontWeight: '900' }, insightText: { color: theme.colors.textSecondary, fontSize: 11.5, lineHeight: 17, marginTop: 3 },
});
