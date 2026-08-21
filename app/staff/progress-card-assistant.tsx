import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';

import AppTextInput from '../../src/components/AppTextInput';
import StaffHeader from '../../src/components/StaffHeader';
import StudentPhoto from '../../src/components/StudentPhoto';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import LogoLoader from '../../src/components/LogoLoader';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import { useTheme } from '../../src/hooks/useTheme';
import type { Theme } from '../../src/theme/themes';
import {
  FinalCalculationPeriod,
  FinalCalculationsReport,
  ProgressCardAssistantReport,
  ProgressCardAssistantService,
  ProgressCardClassContext,
  ProgressCardExamOption,
  ProgressCardStudentOption,
} from '../../src/services/progressCardAssistantService';
import { gradeForPercentage, gpaForPercentage } from '../../src/utils/assessmentGrading';
import { searchStudentsByPrefix } from '../../src/utils/studentPrefixSearch';

const RANKING_LABELS = {
  competition: 'Standard competition (1, 1, 1, 4)',
  attendance_tiebreak: 'Marks, then attendance tie-break',
  dense: 'Consecutive ranks (1, 1, 1, 2)',
} as const;

const displayMark = (value: number | null | undefined) => value == null ? '—' : String(value);
type ResultDisplayMode = 'percentage' | 'grading';
const RESULT_DISPLAY_MODE_KEY = 'progressCardResultDisplayMode';
const finalPeriodLabels: Record<FinalCalculationPeriod, string> = {
  summative_1: 'Summative I',
  summative_2: 'Summative II',
  annual: 'Annual Final',
};
const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function printableWorksheet(
  report: ProgressCardAssistantReport,
  finalCalculations?: FinalCalculationsReport | null,
  displayMode: ResultDisplayMode = 'percentage',
): string {
  const grade = gradeForPercentage(report.summary.percentage);
  const resultHeading = displayMode === 'percentage' ? 'Percentage' : 'Grade / GPA';
  const rows = report.subjects.map((subject, index) => `
    <tr class="${subject.entry_status === 'missing' ? 'missing' : ''}">
      <td>${index + 1}</td><td>${escapeHtml(subject.subject_name)}</td>
      <td>${escapeHtml(subject.assessment_schema === 'component' ? 'Component' : 'Consolidated')}</td>
      <td>${displayMark(subject.participation_marks)}</td>
      <td>${displayMark(subject.written_work_marks)}</td>
      <td>${displayMark(subject.project_work_marks)}</td>
      <td>${displayMark(subject.slip_test_marks)}</td>
      <td>${subject.assessment_schema === 'consolidated'
        ? `${displayMark(subject.consolidated_marks_obtained)}/${subject.consolidated_max_marks}`
        : '—'}</td>
      <td>${displayMark(subject.marks_obtained)}/${subject.max_marks}</td>
      <td>${displayMark(subject.weightage_20)}</td>
      <td>${subject.percentage == null ? '—' : displayMode === 'percentage'
        ? `${subject.percentage}%`
        : `${gradeForPercentage(subject.percentage)} / ${gpaForPercentage(subject.percentage)}`}</td>
    </tr>`).join('');

  const finalSection = finalCalculations ? `
    <h2>Calculated Summative & Annual Results</h2>
    <table><thead><tr><th>Result</th><th>Formula</th><th>Grand Total</th><th>${resultHeading}</th><th>Rank</th><th>Status</th></tr></thead><tbody>
      ${(['summative_1', 'summative_2', 'annual'] as FinalCalculationPeriod[]).map((period) => {
        const summary = finalCalculations.student.summaries[period];
        return `<tr><td>${finalPeriodLabels[period]}</td><td>${escapeHtml(finalCalculations.formulas[period])}</td>
          <td>${summary.total_obtained == null ? '—' : `${summary.total_obtained}/${summary.total_max}`}</td>
          <td>${summary.percentage == null ? '—' : displayMode === 'percentage' ? `${summary.percentage}%` : `${summary.grade} / ${summary.gpa}`}</td>
          <td>${summary.rank ?? '—'}</td><td>${summary.status}</td></tr>`;
      }).join('')}
    </tbody></table>
    <h3>Annual Subject Calculation</h3>
    <table><thead><tr><th>Subject</th><th>4 FAs /20</th><th>SA1 + SA2 /80</th><th>Total /100</th><th>${resultHeading}</th></tr></thead><tbody>
      ${finalCalculations.student.subjects.map((subject) => `<tr><td>${escapeHtml(subject.subject_name)}</td>
        <td>${displayMark(subject.annual.formative_contribution)}</td><td>${displayMark(subject.annual.summative_contribution)}</td>
        <td>${displayMark(subject.annual.total)}</td><td>${subject.annual.percentage == null ? '—' : displayMode === 'percentage' ? `${subject.annual.percentage}%` : `${subject.annual.grade} / ${subject.annual.gpa}`}</td></tr>`).join('')}
    </tbody></table>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#172033}
    h1{font-size:22px;margin:0 0 4px;color:#7c2d12}h2{font-size:17px;margin:20px 0 8px;color:#5b21b6}h3{font-size:14px;margin:14px 0 7px;color:#5b21b6}.meta{font-size:12px;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #94a3b8;padding:6px;text-align:center}
    th{background:#fff1e6;color:#7c2d12}.missing{background:#fff7ed}.summary{display:flex;gap:10px;margin-top:14px}
    .box{border:1px solid #cbd5e1;border-radius:8px;padding:9px 12px;min-width:100px}.box b{display:block;font-size:16px}
    .note{margin-top:12px;font-size:10px;color:#64748b}
  </style></head><body>
    <h1>${escapeHtml(report.exam.name)} — Progress Card Worksheet</h1>
    <div class="meta"><b>${escapeHtml(report.student.display_name)}</b> · Admission ${escapeHtml(report.student.admission_no)} ·
      Class ${escapeHtml(report.class_section.class_name)}-${escapeHtml(report.class_section.section_name)} · ${escapeHtml(report.class_section.academic_year)}</div>
    <table><thead><tr><th>#</th><th>Subject</th><th>Schema</th><th>Participation /10</th><th>Written /10</th>
      <th>Project /10</th><th>Slip /20</th><th>Direct</th><th>Total</th><th>20% Weight</th><th>${resultHeading}</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <div class="summary">
      <div class="box">Grand Total<b>${report.summary.total_obtained}/${report.summary.total_max}</b></div>
      <div class="box">${resultHeading}<b>${displayMode === 'percentage' ? `${report.summary.percentage.toFixed(2)}%` : `${grade} / ${gpaForPercentage(report.summary.percentage)}`}</b></div>
      <div class="box">Rank<b>${report.summary.rank == null ? '—' : report.summary.rank}</b></div>
      <div class="box">Attendance<b>${report.attendance.days_present}/${report.attendance.working_days}</b></div>
    </div>
    <div class="note">Ranking: ${escapeHtml(RANKING_LABELS[report.summary.ranking_method])}. Missing entries: ${report.summary.missing_subjects}.</div>
    ${finalSection}
  </body></html>`;
}

export default function ProgressCardAssistantScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { staffId, isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
  const finalRequestSequence = useRef(0);
  const [context, setContext] = useState<ProgressCardClassContext | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<ProgressCardStudentOption | null>(null);
  const [selectedExam, setSelectedExam] = useState<ProgressCardExamOption | null>(null);
  const [report, setReport] = useState<ProgressCardAssistantReport | null>(null);
  const [finalCalculations, setFinalCalculations] = useState<FinalCalculationsReport | null>(null);
  const [finalPeriod, setFinalPeriod] = useState<FinalCalculationPeriod>('summative_1');
  const [displayMode, setDisplayMode] = useState<ResultDisplayMode>('percentage');
  const [query, setQuery] = useState('');
  const [loadingContext, setLoadingContext] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingFinal, setLoadingFinal] = useState(false);
  const [finalError, setFinalError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(RESULT_DISPLAY_MODE_KEY).then((saved) => {
      if (saved === 'percentage' || saved === 'grading') setDisplayMode(saved);
    }).catch(() => {
      // Display preference is optional; percentage remains the safe default.
    });
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingContext(true);
    ProgressCardAssistantService.getContext(staffId)
      .then((data) => {
        if (!active) return;
        setContext(data);
        setSelectedExam(data.exams[0] ?? null);
      })
      .catch((requestError: any) => {
        if (active) setError(requestError?.message || 'Could not load your class.');
      })
      .finally(() => { if (active) setLoadingContext(false); });
    return () => { active = false; };
  }, [staffId]);

  const changeDisplayMode = useCallback((mode: ResultDisplayMode) => {
    setDisplayMode(mode);
    AsyncStorage.setItem(RESULT_DISPLAY_MODE_KEY, mode).catch(() => {
      // The toggle still works for this session if local persistence is unavailable.
    });
  }, []);

  const matches = useMemo(() => {
    if (!context) return [];
    return searchStudentsByPrefix(context.students, query, 10);
  }, [context, query]);

  const loadReport = useCallback(async (
    student: ProgressCardStudentOption,
    exam: ProgressCardExamOption,
  ) => {
    setLoadingReport(true);
    setError('');
    try {
      const data = await ProgressCardAssistantService.getStudentReport(student.id, exam.id, staffId);
      setReport(data);
    } catch (requestError: any) {
      setReport(null);
      setError(requestError?.message || 'Could not calculate this progress card.');
    } finally {
      setLoadingReport(false);
    }
  }, [staffId]);

  const chooseStudent = useCallback((student: ProgressCardStudentOption) => {
    setSelectedStudent(student);
    setQuery(student.display_name);
    if (selectedExam) loadReport(student, selectedExam);
    setLoadingFinal(true);
    setFinalError('');
    const requestSequence = ++finalRequestSequence.current;
    ProgressCardAssistantService.getFinalCalculations(student.id, staffId)
      .then((data) => { if (requestSequence === finalRequestSequence.current) setFinalCalculations(data); })
      .catch((requestError: any) => {
        if (requestSequence !== finalRequestSequence.current) return;
        setFinalCalculations(null);
        setFinalError(requestError?.message || 'Summative and annual source marks are not ready yet.');
      })
      .finally(() => { if (requestSequence === finalRequestSequence.current) setLoadingFinal(false); });
  }, [loadReport, selectedExam, staffId]);

  const chooseExam = useCallback((exam: ProgressCardExamOption) => {
    setSelectedExam(exam);
    if (selectedStudent) loadReport(selectedStudent, exam);
  }, [loadReport, selectedStudent]);

  const copySummary = useCallback(async () => {
    if (!report) return;
    const grade = gradeForPercentage(report.summary.percentage);
    const lines = [
      `${report.student.display_name} (${report.student.admission_no})`,
      `${report.exam.name} · ${report.class_section.class_name}-${report.class_section.section_name}`,
      `Total: ${report.summary.total_obtained}/${report.summary.total_max}`,
      displayMode === 'percentage'
        ? `Percentage: ${report.summary.percentage.toFixed(2)}% · Rank: ${report.summary.rank ?? '—'}`
        : `Grade: ${grade} · GPA: ${gpaForPercentage(report.summary.percentage)} · Rank: ${report.summary.rank ?? '—'}`,
      `Attendance: ${report.attendance.days_present}/${report.attendance.working_days}`,
    ];
    if (finalCalculations) {
      const annual = finalCalculations.student.summaries.annual;
      lines.push(`Annual Final: ${annual.total_obtained == null ? 'Incomplete' : `${annual.total_obtained}/${annual.total_max} · ${displayMode === 'percentage' ? `${annual.percentage}%` : `${annual.grade} / GPA ${annual.gpa}`} · Rank ${annual.rank ?? '—'}`}`);
    }
    await Clipboard.setStringAsync(lines.join('\n'));
    alertCompat('Copied', 'The calculated progress-card summary is ready to paste.');
  }, [displayMode, finalCalculations, report]);

  const printWorksheet = useCallback(async () => {
    if (!report) return;
    try {
      await Print.printAsync({ html: printableWorksheet(report, finalCalculations, displayMode) });
    } catch {
      alertCompat('Print unavailable', 'The worksheet could not be opened for printing.');
    }
  }, [displayMode, finalCalculations, report]);

  const renderStudentOption = (student: ProgressCardStudentOption) => (
    <TouchableOpacity key={student.id} style={styles.studentOption} onPress={() => chooseStudent(student)} activeOpacity={0.72}>
      <StudentPhoto photoUrl={student.photo_url} displayName={student.display_name} size={42} borderRadius={13} />
      <View style={styles.studentOptionCopy}>
        <Text style={styles.studentOptionName}>{student.display_name}</Text>
        <Text style={styles.studentOptionMeta}>Admission {student.admission_no}{student.roll_number ? ` · Roll ${student.roll_number}` : ''}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <StaffHeader title="Progress Card Assistant" showBackButton />
      {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}

      {loadingContext ? (
        <View style={styles.centerState}><LogoLoader size={68} color="#F97316" /><Text style={styles.stateText}>Preparing your class…</Text></View>
      ) : !context?.class_section ? (
        <View style={styles.centerState}>
          <View style={styles.stateIcon}><Ionicons name="school-outline" size={32} color="#F97316" /></View>
          <Text style={styles.stateTitle}>Class teacher access only</Text>
          <Text style={styles.stateText}>A current class section must be assigned to you before student progress cards can be viewed.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}><Ionicons name="reader-outline" size={26} color="#FFFFFF" /></View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>YOUR CLASS · {context.class_section.academic_year}</Text>
              <Text style={styles.heroTitle}>{context.class_section.class_name}-{context.class_section.section_name}</Text>
              <Text style={styles.heroText}>{context.students.length} students · {context.exams.length} exams · Ready-made physical card calculations</Text>
            </View>
          </View>

          <View style={styles.searchCard}>
            <View style={styles.sectionHeadingRow}>
              <Ionicons name="search" size={18} color="#F97316" />
              <Text style={styles.sectionTitle}>Find a student</Text>
            </View>
            <Text style={styles.sectionHint}>Enter the beginning of a name or admission number, then select the student.</Text>
            <View style={styles.searchInputWrap}>
              <Ionicons name="person-outline" size={18} color={theme.colors.textTertiary} />
              <AppTextInput
                value={query}
                onChangeText={(text) => { setQuery(text); if (text !== selectedStudent?.display_name) setSelectedStudent(null); }}
                placeholder="Example: Ravi or 2026…"
                placeholderTextColor={theme.colors.textTertiary}
                autoCapitalize="words"
                style={styles.searchInput}
              />
              {!!query && <Pressable onPress={() => { finalRequestSequence.current += 1; setQuery(''); setSelectedStudent(null); setReport(null); setFinalCalculations(null); setFinalError(''); setLoadingFinal(false); }}><Ionicons name="close-circle" size={20} color={theme.colors.textTertiary} /></Pressable>}
            </View>
            {!!query.trim() && !selectedStudent && (
              <View style={styles.resultsList}>
                {matches.length ? matches.map(renderStudentOption) : <Text style={styles.noMatch}>No matching student in your class.</Text>}
              </View>
            )}
          </View>

          <View style={styles.examCard}>
            <View style={styles.sectionHeadingRow}>
              <Ionicons name="documents-outline" size={18} color="#7C3AED" />
              <Text style={styles.sectionTitle}>Assessment</Text>
            </View>
            {context.exams.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.examChips}>
                {context.exams.map((exam) => {
                  const active = selectedExam?.id === exam.id;
                  return <TouchableOpacity key={exam.id} onPress={() => chooseExam(exam)} style={[styles.examChip, active && styles.examChipActive]}>
                    <Text style={[styles.examChipText, active && styles.examChipTextActive]}>{exam.name}</Text>
                  </TouchableOpacity>;
                })}
              </ScrollView>
            ) : <Text style={styles.noMatch}>No assessments have been created for this class.</Text>}
          </View>

          {!!error && <View style={styles.errorBanner}><Ionicons name="alert-circle-outline" size={18} color="#DC2626" /><Text style={styles.errorText}>{error}</Text></View>}
          {loadingReport && <View style={styles.reportLoading}><ActivityIndicator color="#F97316" /><Text style={styles.stateText}>Calculating all subjects…</Text></View>}

          {report && !loadingReport && (
            <>
              <View style={styles.selectedCard}>
                <StudentPhoto photoUrl={report.student.photo_url} displayName={report.student.display_name} size={54} borderRadius={17} />
                <View style={styles.selectedCopy}>
                  <Text style={styles.selectedName}>{report.student.display_name}</Text>
                  <Text style={styles.selectedMeta}>Admission {report.student.admission_no} · {report.exam.name}</Text>
                </View>
                <View style={styles.completeBadge}><Text style={styles.completeBadgeText}>{report.summary.completed_subjects}/{report.summary.subject_count}</Text></View>
              </View>

              <View style={styles.displayModeCard}>
                <View style={styles.displayModeCopy}>
                  <Text style={styles.displayModeTitle}>Display results as</Text>
                  <Text style={styles.displayModeHint}>Marks remain unchanged when switching views.</Text>
                </View>
                <View style={styles.displayModeToggle}>
                  {([
                    ['percentage', 'Percentage', 'pie-chart-outline'],
                    ['grading', 'Grading', 'ribbon-outline'],
                  ] as [ResultDisplayMode, string, keyof typeof Ionicons.glyphMap][]).map(([mode, label, icon]) => {
                    const active = displayMode === mode;
                    return <TouchableOpacity key={mode} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => changeDisplayMode(mode)} style={[styles.displayModeOption, active && styles.displayModeOptionActive]}><Ionicons name={icon} size={15} color={active ? '#FFFFFF' : '#7C3AED'} /><Text style={[styles.displayModeOptionText, active && styles.displayModeOptionTextActive]}>{label}</Text></TouchableOpacity>;
                  })}
                </View>
              </View>

              <View style={styles.summaryGrid}>
                {[
                  ['Grand total', `${report.summary.total_obtained}/${report.summary.total_max}`],
                  ...(displayMode === 'percentage'
                    ? [['Percentage', `${report.summary.percentage.toFixed(2)}%`]]
                    : [
                      ['Grade', gradeForPercentage(report.summary.percentage)],
                      ['GPA', gpaForPercentage(report.summary.percentage).toFixed(1)],
                    ]),
                  ['Rank', report.summary.rank == null ? '—' : `#${report.summary.rank}`],
                  ['Attendance', report.attendance.percentage == null ? '—' : `${report.attendance.percentage.toFixed(1)}%`],
                ].map(([label, value]) => <View key={label} style={styles.summaryItem}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>)}
              </View>

              {report.summary.missing_subjects > 0 && (
                <View style={styles.missingBanner}><Ionicons name="warning-outline" size={18} color="#B45309" /><Text style={styles.missingText}>{report.summary.missing_subjects} subject entr{report.summary.missing_subjects === 1 ? 'y is' : 'ies are'} still missing. Totals may change after completion.</Text></View>
              )}

              <View style={styles.tableCard}>
                <View style={styles.tableIntro}>
                  <Text style={styles.tableTitle}>Subject-wise detailed marks</Text>
                  <Text style={styles.tableHint}>Swipe horizontally to view every component.</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tableScroll}>
                  <View>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                      {[
                        ['Subject', 150], ['Schema', 105], ['Participation /10', 105], ['Written /10', 88],
                        ['Project /10', 88], ['Slip /20', 78], ['Direct', 82], ['Total', 82], ['20% Weight', 88], [displayMode === 'percentage' ? 'Percentage' : 'Grade / GPA', 92],
                      ].map(([label, width]) => <Text key={String(label)} style={[styles.headerCell, { width: Number(width) }]}>{label}</Text>)}
                    </View>
                    {report.subjects.map((subject, index) => {
                      const component = subject.assessment_schema === 'component';
                      return <View key={subject.subject_id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt, subject.entry_status === 'missing' && styles.tableRowMissing]}>
                        <Text style={[styles.subjectCell, { width: 150 }]}>{subject.subject_name}</Text>
                        <View style={[styles.schemaCell, { width: 105 }]}><Text style={[styles.schemaBadge, component ? styles.componentBadge : styles.consolidatedBadge]}>{component ? 'Component' : 'Direct'}</Text></View>
                        <Text style={[styles.dataCell, { width: 105 }]}>{component ? displayMark(subject.participation_marks) : '—'}</Text>
                        <Text style={[styles.dataCell, { width: 88 }]}>{component ? displayMark(subject.written_work_marks) : '—'}</Text>
                        <Text style={[styles.dataCell, { width: 88 }]}>{component ? displayMark(subject.project_work_marks) : '—'}</Text>
                        <Text style={[styles.dataCell, { width: 78 }]}>{component ? displayMark(subject.slip_test_marks) : '—'}</Text>
                        <Text style={[styles.dataCell, { width: 82 }]}>{component ? '—' : `${displayMark(subject.consolidated_marks_obtained)}/${subject.consolidated_max_marks}`}</Text>
                        <Text style={[styles.totalCell, { width: 82 }]}>{subject.entry_status === 'missing' ? 'Missing' : `${displayMark(subject.marks_obtained)}/${subject.max_marks}`}</Text>
                        <Text style={[styles.dataCell, { width: 88 }]}>{component ? displayMark(subject.weightage_20) : '—'}</Text>
                        <Text style={[styles.gradeCell, { width: 92 }]}>{subject.percentage == null ? '—' : displayMode === 'percentage' ? `${subject.percentage.toFixed(1)}%` : `${gradeForPercentage(subject.percentage)} / ${gpaForPercentage(subject.percentage)}`}</Text>
                      </View>;
                    })}
                    <View style={[styles.tableRow, styles.grandRow]}>
                      <Text style={[styles.grandLabel, { width: 784 }]}>GRAND TOTAL</Text>
                      <Text style={[styles.grandValue, { width: 82 }]}>{report.summary.total_obtained}/{report.summary.total_max}</Text>
                      <Text style={[styles.grandValue, { width: 180 }]}>{displayMode === 'percentage' ? `${report.summary.percentage.toFixed(2)}%` : `${gradeForPercentage(report.summary.percentage)} · GPA ${gpaForPercentage(report.summary.percentage)}`}</Text>
                    </View>
                  </View>
                </ScrollView>
              </View>

              <View style={styles.finalCard}>
                <View style={styles.finalHeader}>
                  <View style={styles.finalHeaderIcon}><Ionicons name="calculator-outline" size={21} color="#FFFFFF" /></View>
                  <View style={{ flex: 1 }}><Text style={styles.finalTitle}>Summative & Annual calculations</Text><Text style={styles.finalHint}>Calculated automatically from FA-1…FA-4 and SA-1…SA-2 source marks.</Text></View>
                </View>

                <View style={styles.finalTabs}>
                  {(Object.keys(finalPeriodLabels) as FinalCalculationPeriod[]).map((period) => <TouchableOpacity key={period} onPress={() => setFinalPeriod(period)} style={[styles.finalTab, finalPeriod === period && styles.finalTabActive]}><Text style={[styles.finalTabText, finalPeriod === period && styles.finalTabTextActive]}>{finalPeriodLabels[period]}</Text></TouchableOpacity>)}
                </View>

                {loadingFinal ? <View style={styles.finalLoading}><ActivityIndicator color="#7C3AED" /><Text style={styles.stateText}>Calculating weighted results…</Text></View> : finalCalculations ? (() => {
                  const summary = finalCalculations.student.summaries[finalPeriod];
                  const isAnnual = finalPeriod === 'annual';
                  return <>
                    <View style={styles.formulaBanner}><Ionicons name="information-circle-outline" size={17} color="#7C3AED" /><Text style={styles.formulaText}>{finalCalculations.formulas[finalPeriod]}</Text></View>
                    <View style={styles.finalSummaryRow}>
                      {[
                        ['Grand total', summary.total_obtained == null ? 'Incomplete' : `${summary.total_obtained}/${summary.total_max}`],
                        [displayMode === 'percentage' ? 'Percentage' : 'Grade / GPA', summary.percentage == null ? '—' : displayMode === 'percentage' ? `${summary.percentage.toFixed(2)}%` : `${summary.grade} / ${summary.gpa}`],
                        ['Rank', summary.rank == null ? '—' : `#${summary.rank}`],
                        ['Completed', `${summary.completed_subjects}/${summary.subject_count}`],
                      ].map(([label, value]) => <View key={label} style={styles.finalSummaryItem}><Text style={styles.finalSummaryLabel}>{label}</Text><Text style={styles.finalSummaryValue}>{value}</Text></View>)}
                    </View>
                    {summary.status === 'incomplete' && <View style={styles.missingBanner}><Ionicons name="warning-outline" size={18} color="#B45309" /><Text style={styles.missingText}>{summary.completed_subjects}/{summary.subject_count} subjects complete. Missing source assessments: {summary.missing_sources.join(', ') || 'marks not entered'}.</Text></View>}
                    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tableScroll}>
                      <View>
                        <View style={[styles.tableRow, styles.tableHeader]}>
                          {[
                            ['Subject', 150],
                            [isAnnual ? '4 FAs /20' : finalPeriod === 'summative_1' ? 'FA1+FA2 /20' : 'FA3+FA4 /20', 115],
                            [isAnnual ? 'SA1+SA2 /80' : finalPeriod === 'summative_1' ? 'SA1 Exam /80' : 'SA2 Exam /80', 120],
                            ['Total /100', 100], [displayMode === 'percentage' ? 'Percentage' : 'Grade / GPA', 100], ['Status', 90],
                          ].map(([label, cellWidth]) => <Text key={String(label)} style={[styles.headerCell, { width: Number(cellWidth) }]}>{label}</Text>)}
                        </View>
                        {finalCalculations.student.subjects.map((subject, index) => {
                          const result = subject[finalPeriod];
                          const first = result.formative_contribution;
                          const second = isAnnual ? result.summative_contribution : result.exam_contribution;
                          return <View key={subject.subject_id} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt, result.status === 'incomplete' && styles.tableRowMissing]}>
                            <Text style={[styles.subjectCell, { width: 150 }]}>{subject.subject_name}</Text>
                            <Text style={[styles.dataCell, { width: 115 }]}>{displayMark(first)}</Text>
                            <Text style={[styles.dataCell, { width: 120 }]}>{displayMark(second)}</Text>
                            <Text style={[styles.totalCell, { width: 100 }]}>{displayMark(result.total)}</Text>
                            <Text style={[styles.gradeCell, { width: 100 }]}>{result.percentage == null ? '—' : displayMode === 'percentage' ? `${result.percentage.toFixed(1)}%` : `${result.grade} / ${result.gpa}`}</Text>
                            <Text style={[styles.finalStatusCell, { width: 90 }, result.status === 'complete' ? styles.finalComplete : styles.finalIncomplete]}>{result.status === 'complete' ? 'Ready' : 'Missing'}</Text>
                          </View>;
                        })}
                      </View>
                    </ScrollView>
                  </>;
                })() : <View style={styles.finalLoading}><Ionicons name="hourglass-outline" size={24} color="#B45309" /><Text style={styles.stateText}>{finalError || 'Select a student to calculate final results.'}</Text></View>}
              </View>

              <View style={styles.attendanceCard}>
                <View><Text style={styles.attendanceTitle}>Attendance</Text><Text style={styles.attendanceHint}>Used only when the admin selects attendance tie-break ranking.</Text></View>
                <View style={styles.attendanceNumbers}><Text style={styles.attendanceBig}>{report.attendance.days_present}/{report.attendance.working_days}</Text><Text style={styles.attendancePct}>{report.attendance.percentage == null ? '—' : `${report.attendance.percentage.toFixed(1)}%`}</Text></View>
              </View>

              <View style={styles.policyNote}><Ionicons name="shield-checkmark-outline" size={17} color="#7C3AED" /><Text style={styles.policyText}>Ranking policy: {RANKING_LABELS[report.summary.ranking_method]}</Text></View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.secondaryAction} onPress={copySummary}><Ionicons name="copy-outline" size={18} color="#7C3AED" /><Text style={styles.secondaryActionText}>Copy summary</Text></TouchableOpacity>
                <TouchableOpacity style={styles.primaryAction} onPress={printWorksheet}><Ionicons name="print-outline" size={18} color="#FFFFFF" /><Text style={styles.primaryActionText}>{Platform.OS === 'web' ? 'Print worksheet' : 'Print / Save PDF'}</Text></TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const getStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? '#0B1020' : '#F6F3EF' },
  content: { width: '100%', maxWidth: 1080, alignSelf: 'center', padding: 16, paddingBottom: 150, gap: 14 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  stateIcon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(249,115,22,.15)' : '#FFEDD5' },
  stateTitle: { color: theme.colors.textStrong, fontSize: 20, fontWeight: '900' },
  stateText: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  heroCard: { borderRadius: 24, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: isDark ? '#7C2D12' : '#9A3412', shadowColor: '#9A3412', shadowOffset: { width: 0, height: 8 }, shadowOpacity: .22, shadowRadius: 18, elevation: 5 },
  heroIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.16)' },
  heroCopy: { flex: 1 }, heroEyebrow: { color: '#FED7AA', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', marginTop: 3 }, heroText: { color: '#FFEDD5', fontSize: 12, lineHeight: 17, marginTop: 4 },
  searchCard: { borderRadius: 22, padding: 16, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, sectionTitle: { color: theme.colors.textStrong, fontSize: 16, fontWeight: '900' },
  sectionHint: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 5 },
  searchInputWrap: { minHeight: 54, marginTop: 13, borderRadius: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: isDark ? 'rgba(255,255,255,.05)' : '#F8FAFC', borderWidth: 1.5, borderColor: isDark ? 'rgba(255,255,255,.1)' : '#E2E8F0' },
  searchInput: { flex: 1, height: 50, borderWidth: 0, backgroundColor: 'transparent', color: theme.colors.text, fontSize: 15, paddingHorizontal: 0 },
  resultsList: { marginTop: 8, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border },
  studentOption: { minHeight: 66, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: theme.colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  studentOptionCopy: { flex: 1 }, studentOptionName: { color: theme.colors.textStrong, fontSize: 14, fontWeight: '800' }, studentOptionMeta: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 3 },
  noMatch: { color: theme.colors.textSecondary, fontSize: 13, padding: 16, fontStyle: 'italic' },
  examCard: { borderRadius: 20, padding: 15, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  examChips: { gap: 9, paddingTop: 12, paddingBottom: 2 }, examChip: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: isDark ? 'rgba(255,255,255,.04)' : '#F8FAFC' },
  examChipActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' }, examChipText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '800' }, examChipTextActive: { color: '#FFFFFF' },
  errorBanner: { borderRadius: 15, padding: 13, flexDirection: 'row', gap: 9, alignItems: 'center', backgroundColor: isDark ? 'rgba(220,38,38,.14)' : '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' }, errorText: { flex: 1, color: '#DC2626', fontSize: 12, fontWeight: '700' },
  reportLoading: { minHeight: 100, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.colors.card },
  selectedCard: { borderRadius: 20, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  selectedCopy: { flex: 1 }, selectedName: { color: theme.colors.textStrong, fontSize: 17, fontWeight: '900' }, selectedMeta: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 },
  completeBadge: { borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: isDark ? 'rgba(16,185,129,.15)' : '#ECFDF5' }, completeBadgeText: { color: '#059669', fontSize: 13, fontWeight: '900' },
  displayModeCard: { borderRadius: 18, padding: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 11, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }, displayModeCopy: { flex: 1, minWidth: 170 }, displayModeTitle: { color: theme.colors.textStrong, fontSize: 13, fontWeight: '900' }, displayModeHint: { color: theme.colors.textSecondary, fontSize: 10, marginTop: 3 },
  displayModeToggle: { flexDirection: 'row', padding: 3, borderRadius: 13, gap: 3, backgroundColor: isDark ? '#111827' : '#F1F5F9' }, displayModeOption: { minHeight: 39, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, displayModeOptionActive: { backgroundColor: '#7C3AED', shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 3 }, shadowOpacity: .2, shadowRadius: 6, elevation: 2 }, displayModeOptionText: { color: '#7C3AED', fontSize: 10.5, fontWeight: '900' }, displayModeOptionTextActive: { color: '#FFFFFF' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, summaryItem: { flexGrow: 1, flexBasis: '29%', minWidth: 104, borderRadius: 17, padding: 13, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  summaryLabel: { color: theme.colors.textTertiary, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: .55 }, summaryValue: { color: theme.colors.textStrong, fontSize: 19, fontWeight: '900', marginTop: 6 },
  missingBanner: { borderRadius: 15, padding: 13, flexDirection: 'row', gap: 9, alignItems: 'center', backgroundColor: isDark ? 'rgba(245,158,11,.14)' : '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' }, missingText: { flex: 1, color: isDark ? '#FCD34D' : '#9A3412', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  tableCard: { borderRadius: 22, overflow: 'hidden', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }, tableIntro: { padding: 15, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tableTitle: { color: theme.colors.textStrong, fontSize: 16, fontWeight: '900' }, tableHint: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 3 }, tableScroll: { paddingBottom: 5 },
  tableRow: { minHeight: 50, flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }, tableHeader: { minHeight: 54, backgroundColor: isDark ? '#431407' : '#FFF1E6' },
  headerCell: { paddingHorizontal: 7, textAlign: 'center', textAlignVertical: 'center', color: isDark ? '#FED7AA' : '#7C2D12', fontSize: 10, fontWeight: '900', alignSelf: 'center' },
  subjectCell: { padding: 10, color: theme.colors.textStrong, fontSize: 12, fontWeight: '800', textAlignVertical: 'center' }, dataCell: { padding: 10, color: theme.colors.text, fontSize: 12, fontWeight: '700', textAlign: 'center', textAlignVertical: 'center' },
  totalCell: { padding: 10, color: '#EA580C', fontSize: 12, fontWeight: '900', textAlign: 'center', textAlignVertical: 'center' }, gradeCell: { padding: 10, color: '#7C3AED', fontSize: 12, fontWeight: '900', textAlign: 'center', textAlignVertical: 'center' },
  schemaCell: { alignItems: 'center', justifyContent: 'center' }, schemaBadge: { overflow: 'hidden', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, fontSize: 9, fontWeight: '900' }, componentBadge: { color: '#047857', backgroundColor: isDark ? 'rgba(16,185,129,.15)' : '#D1FAE5' }, consolidatedBadge: { color: '#1D4ED8', backgroundColor: isDark ? 'rgba(59,130,246,.15)' : '#DBEAFE' },
  tableRowAlt: { backgroundColor: isDark ? 'rgba(255,255,255,.025)' : '#FAFAF9' }, tableRowMissing: { backgroundColor: isDark ? 'rgba(245,158,11,.08)' : '#FFF7ED' },
  grandRow: { minHeight: 52, backgroundColor: isDark ? '#312E81' : '#EEF2FF' }, grandLabel: { padding: 11, color: isDark ? '#C7D2FE' : '#3730A3', fontSize: 12, fontWeight: '900', textAlignVertical: 'center' }, grandValue: { padding: 11, color: isDark ? '#C7D2FE' : '#3730A3', fontSize: 12, fontWeight: '900', textAlign: 'center', textAlignVertical: 'center' },
  finalCard: { borderRadius: 22, overflow: 'hidden', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }, finalHeader: { padding: 15, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: theme.colors.border }, finalHeaderIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C3AED' }, finalTitle: { color: theme.colors.textStrong, fontSize: 16, fontWeight: '900' }, finalHint: { color: theme.colors.textSecondary, fontSize: 10.5, lineHeight: 15, marginTop: 3 },
  finalTabs: { flexDirection: 'row', padding: 10, gap: 7, backgroundColor: isDark ? 'rgba(255,255,255,.025)' : '#FAFAFC' }, finalTab: { flex: 1, minHeight: 40, paddingHorizontal: 8, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border }, finalTabActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' }, finalTabText: { color: theme.colors.textSecondary, fontSize: 10.5, fontWeight: '900', textAlign: 'center' }, finalTabTextActive: { color: '#FFFFFF' },
  finalLoading: { minHeight: 110, padding: 20, alignItems: 'center', justifyContent: 'center', gap: 9 }, formulaBanner: { margin: 12, marginBottom: 4, padding: 11, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: isDark ? 'rgba(124,58,237,.12)' : '#F5F3FF' }, formulaText: { flex: 1, color: isDark ? '#DDD6FE' : '#5B21B6', fontSize: 11, fontWeight: '700' },
  finalSummaryRow: { padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, finalSummaryItem: { flexGrow: 1, flexBasis: '21%', minWidth: 105, padding: 11, borderRadius: 13, backgroundColor: isDark ? 'rgba(255,255,255,.04)' : '#F8FAFC' }, finalSummaryLabel: { color: theme.colors.textTertiary, fontSize: 8.5, fontWeight: '900', textTransform: 'uppercase' }, finalSummaryValue: { color: theme.colors.textStrong, fontSize: 14, fontWeight: '900', marginTop: 5 }, finalStatusCell: { padding: 10, fontSize: 10.5, fontWeight: '900', textAlign: 'center', textAlignVertical: 'center' }, finalComplete: { color: '#059669' }, finalIncomplete: { color: '#B45309' },
  attendanceCard: { borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border }, attendanceTitle: { color: theme.colors.textStrong, fontSize: 15, fontWeight: '900' }, attendanceHint: { color: theme.colors.textSecondary, fontSize: 10.5, lineHeight: 15, marginTop: 4, maxWidth: 500 }, attendanceNumbers: { alignItems: 'flex-end' }, attendanceBig: { color: theme.colors.textStrong, fontSize: 18, fontWeight: '900' }, attendancePct: { color: '#059669', fontSize: 12, fontWeight: '800', marginTop: 2 },
  policyNote: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 5 }, policyText: { flex: 1, color: theme.colors.textSecondary, fontSize: 11, fontWeight: '600' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, secondaryAction: { flex: 1, minWidth: 145, minHeight: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#C4B5FD', backgroundColor: isDark ? 'rgba(124,58,237,.10)' : '#F5F3FF' }, secondaryActionText: { color: '#7C3AED', fontSize: 13, fontWeight: '900' },
  primaryAction: { flex: 1.4, minWidth: 175, minHeight: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EA580C' }, primaryActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});
