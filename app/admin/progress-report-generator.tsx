import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import AdminHeader from '../../src/components/AdminHeader';
import AppTextInput from '../../src/components/AppTextInput';
import LogoLoader from '../../src/components/LogoLoader';
import { SCHOOL_CONFIG, schoolColorWithAlpha, schoolTheme } from '../../src/constants/schoolConfig';
import { AcademicYear, ClassSection, ClassService } from '../../src/services/classService';
import { Exam, ResultService } from '../../src/services/commonServices';
import { SchoolSettings, SchoolSettingsService } from '../../src/services/schoolSettingsService';
import { SchoolProfile, SchoolService } from '../../src/services/schoolService';
import { StudentService } from '../../src/services/studentService';
import { useTheme } from '../../src/hooks/useTheme';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import {
  rankAssessmentScores,
  ResultRankingMethod,
} from '../../src/utils/assessmentGrading';
import {
  buildProgressReportHtml,
  ProgressReportBrand,
  ProgressReportLayout,
  ProgressReportStudent,
  ProgressReportSubject,
  ProgressReportType,
  progressReportSummary,
} from '../../src/utils/progressReportHtml';
import {
  bundledAssetToBase64Uri,
  resolveApiAssetUrl,
  toBase64Uri,
} from '../../src/utils/toBase64Uri';

type ReportScope = 'student' | 'class';

interface ExamReport {
  id: string;
  name: string;
  type: string;
  date: string;
  subjects: ProgressReportSubject[];
}

interface StudentReportRecord {
  id: string;
  admissionNo: string;
  name: string;
  parentName: string;
  classLabel: string;
  rollNo: string;
  academicYear: string;
  attendance: string;
  attendancePercentage: number | null;
  exams: ExamReport[];
  selectedExamIndex: number;
  classRank?: number | null;
}

const REPORT_OPTIONS: {
  value: ProgressReportType;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    value: 'direct',
    title: 'Direct assessment',
    subtitle: 'Subject, maximum marks, marks obtained, grade and teacher remarks',
    icon: 'create-outline',
  },
  {
    value: 'component',
    title: 'Component-based assessment',
    subtitle: 'Participation, written work, project work, slip test, total and grade',
    icon: 'grid-outline',
  },
];

const PRINT_LAYOUT_OPTIONS: {
  value: ProgressReportLayout;
  title: string;
  subtitle: string;
  badge: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    value: 'ultra-premium',
    title: 'Ultra Premium',
    subtitle: 'One student per A4 page with spacious typography and signature areas',
    badge: '1 PER PAGE',
    icon: 'diamond-outline',
  },
  {
    value: 'normal',
    title: 'Normal',
    subtitle: 'Two students per A4 page with a clearly marked tear gap',
    badge: '2 PER PAGE',
    icon: 'cut-outline',
  },
];

const RANKING_OPTIONS: {
  value: ResultRankingMethod;
  title: string;
  description: string;
  example: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    value: 'competition',
    title: 'Standard competition',
    description: 'Equal percentages share a rank; occupied positions are skipped.',
    example: '1, 1, 1, 4',
    icon: 'podium-outline',
  },
  {
    value: 'attendance_tiebreak',
    title: 'Attendance tie-break',
    description: 'Equal percentages are ordered by attendance; exact ties still share a rank.',
    example: 'Marks → Attendance',
    icon: 'calendar-outline',
  },
  {
    value: 'dense',
    title: 'Consecutive ranks',
    description: 'Equal percentages share a rank and the next score gets the next rank.',
    example: '1, 1, 1, 2',
    icon: 'list-outline',
  },
];

function isPlaceholderSchoolName(value?: string | null) {
  const name = value?.trim() || '';
  return !name || /^(default\s+school(\s+name)?|school|school\s+name|my\s+school|unnamed\s+school)$/i.test(name);
}

function numberOrNull(value: unknown) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateLabel(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function normalizeSubjects(raw: any[]): ProgressReportSubject[] {
  return (raw || []).map((subject) => ({
    subject: subject.subject || 'Subject',
    assessmentSchema:
      subject.assessmentSchema === 'component' || subject.assessment_schema === 'component'
        ? 'component'
        : 'consolidated',
    maxMarks: Number(subject.maxMarks ?? subject.max_marks ?? 0),
    passingMarks: Number(subject.passingMarks ?? subject.passing_marks ?? 0),
    obtained: numberOrNull(subject.obtained ?? subject.marks_obtained),
    consolidatedMaxMarks: Number(
      subject.consolidatedMaxMarks ?? subject.consolidated_max_marks ?? subject.maxMarks ?? 0,
    ),
    consolidatedMarksObtained: numberOrNull(
      subject.consolidatedMarksObtained ?? subject.consolidated_marks_obtained,
    ),
    componentMaximums: {
      participation: Number(
        subject.componentMaximums?.participation ?? subject.component_maximums?.participation ?? 10,
      ),
      writtenWork: Number(
        subject.componentMaximums?.writtenWork ?? subject.component_maximums?.written_work ?? 10,
      ),
      projectWork: Number(
        subject.componentMaximums?.projectWork ?? subject.component_maximums?.project_work ?? 10,
      ),
      slipTest: Number(
        subject.componentMaximums?.slipTest ?? subject.component_maximums?.slip_test ?? 20,
      ),
    },
    participationMarks: numberOrNull(
      subject.participationMarks ?? subject.participation_marks,
    ),
    writtenWorkMarks: numberOrNull(subject.writtenWorkMarks ?? subject.written_work_marks),
    projectWorkMarks: numberOrNull(subject.projectWorkMarks ?? subject.project_work_marks),
    slipTestMarks: numberOrNull(subject.slipTestMarks ?? subject.slip_test_marks),
    grade: subject.grade || '-',
    remarks: subject.remarks || '',
    isAbsent: Boolean(subject.is_absent),
    hasMarks:
      typeof subject.hasMarks === 'boolean'
        ? subject.hasMarks
        : typeof subject.has_marks === 'boolean'
          ? subject.has_marks
          : subject.obtained != null || subject.marks_obtained != null || subject.is_absent,
  }));
}

function mapStudent(student: any, payload: any, selectedExamId?: string): StudentReportRecord {
  const profile = payload?.student || {};
  const enrollment = student.current_enrollment || {};
  const father = student.parents?.find((parent: any) =>
    String(parent.relation || parent.relationship || '').toLowerCase().includes('father'),
  );
  const guardian = student.parents?.find((parent: any) => {
    const relation = String(parent.relation || parent.relationship || '').toLowerCase();
    return relation.includes('mother') || relation.includes('guardian');
  });
  const parentName =
    profile.father_name ||
    profile.mother_or_guardian_name ||
    father?.display_name ||
    guardian?.display_name ||
    '-';
  const exams: ExamReport[] = (payload?.exams || []).map((exam: any) => ({
    id: exam.exam_id,
    name: exam.exam_name || 'Assessment',
    type: exam.exam_type || '',
    date: dateLabel(exam.end_date || exam.start_date),
    subjects: normalizeSubjects(exam.subjects),
  }));
  const selectedExamIndex = selectedExamId
    ? Math.max(0, exams.findIndex((exam) => exam.id === selectedExamId))
    : 0;
  const attendance = payload?.attendance;
  const attendanceText = attendance?.total > 0
    ? `${Number(attendance.present || 0) + Number(attendance.late || 0)} / ${attendance.total}`
    : '-';
  const attendancePercentage = attendance?.total > 0
    ? Number(
        attendance.percentage ??
          ((Number(attendance.present || 0) + Number(attendance.late || 0)) /
            Number(attendance.total)) *
            100,
      )
    : null;

  return {
    id: student.id || profile.id,
    admissionNo: profile.admission_no || student.admission_no || '-',
    name:
      profile.name ||
      student.display_name ||
      [student.first_name, student.last_name].filter(Boolean).join(' ') ||
      'Student',
    parentName,
    classLabel:
      profile.class ||
      [enrollment.class_code || enrollment.class_name, enrollment.section_name]
        .filter(Boolean)
        .join(' ') ||
      '-',
    rollNo: String(profile.roll_number || enrollment.roll_number || '-'),
    academicYear: payload?.academic_year || '-',
    attendance: attendanceText,
    attendancePercentage: Number.isFinite(attendancePercentage)
      ? attendancePercentage
      : null,
    exams,
    selectedExamIndex,
  };
}

function printableStudent(record: StudentReportRecord): ProgressReportStudent {
  const exam = record.exams[record.selectedExamIndex];
  return {
    id: record.id,
    admissionNo: record.admissionNo,
    name: record.name,
    parentName: record.parentName,
    classLabel: record.classLabel,
    rollNo: record.rollNo,
    academicYear: record.academicYear,
    attendance: record.attendance,
    examName: exam?.name || 'Progress Report',
    examDate: exam?.date || '',
    subjects: exam?.subjects || [],
    classRank: record.classRank,
  };
}

async function resolveProgressReportLogo(remoteLogoUrl?: string | null): Promise<string> {
  const remote = resolveApiAssetUrl(remoteLogoUrl);
  if (remote) {
    const encoded = await toBase64Uri(remote);
    if (encoded) return encoded;
  }
  return (await bundledAssetToBase64Uri(SCHOOL_CONFIG.logo as number)) ?? '';
}

function applyClassRanks(
  records: StudentReportRecord[],
  reportType: ProgressReportType,
  rankingMethod: ResultRankingMethod,
) {
  const rankable = records.flatMap((record) => {
    const summary = progressReportSummary(printableStudent(record), reportType);
    return summary.subjects.length
      ? [
          {
            id: record.id,
            score: summary.percentage,
            attendancePercentage: record.attendancePercentage,
          },
        ]
      : [];
  });
  const ranks = rankAssessmentScores(rankable, rankingMethod);
  return records.map((record) => ({
    ...record,
    classRank: ranks[record.id] ?? null,
  }));
}

export default function ProgressReportGenerator() {
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const mobile = width < 700;
  const compact = width < 400;
  const colors = isDark ? schoolTheme.dark.colors : schoolTheme.light.colors;
  const styles = useMemo(
    () => createStyles(colors, isDark, mobile, compact),
    [colors, compact, isDark, mobile],
  );

  const [reportType, setReportType] = useState<ProgressReportType>('direct');
  const [printLayout, setPrintLayout] = useState<ProgressReportLayout>('normal');
  const [scope, setScope] = useState<ReportScope>('class');
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(null);
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfile | null>(null);
  const [rankingMethod, setRankingMethod] = useState<ResultRankingMethod>('competition');
  const [rankingSaving, setRankingSaving] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [studentReport, setStudentReport] = useState<StudentReportRecord | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [mappings, setMappings] = useState<ClassSection[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedYearId, setSelectedYearId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [batchReports, setBatchReports] = useState<StudentReportRecord[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ completed: 0, total: 0 });

  const configuredSchoolName = schoolSettings?.school_name?.trim() || '';
  const profileSchoolName = schoolProfile?.name?.trim() || '';
  const schoolName = !isPlaceholderSchoolName(configuredSchoolName)
    ? configuredSchoolName
    : !isPlaceholderSchoolName(profileSchoolName)
      ? profileSchoolName
      : SCHOOL_CONFIG.name;
  const schoolLogoUrl = schoolSettings?.school_logo_url || schoolProfile?.logo_url || '';

  const classes = useMemo(() => {
    const seen = new Set<string>();
    return mappings.filter((item) => {
      if (seen.has(item.class_id)) return false;
      seen.add(item.class_id);
      return true;
    });
  }, [mappings]);
  const sections = useMemo(
    () => mappings.filter((item) => item.class_id === selectedClassId),
    [mappings, selectedClassId],
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      SchoolSettingsService.getSettings().catch(() => null),
      SchoolService.getProfile().catch(() => null),
      ClassService.getAcademicYears(),
      ClassService.getCurrentAcademicYear().catch(() => null),
    ])
      .then(async ([settings, profile, academicYears, currentYear]) => {
        if (!active) return;
        setSchoolSettings(settings);
        setSchoolProfile(profile);
        const savedRanking = settings?.result_ranking_method;
        setRankingMethod(
          savedRanking === 'attendance_tiebreak' || savedRanking === 'dense'
            ? savedRanking
            : 'competition',
        );
        setYears(academicYears);
        const yearId = currentYear?.id || academicYears[0]?.id || '';
        if (yearId) await loadYear(yearId);
      })
      .catch(() => alertCompat('Unable to load report setup', 'Please refresh and try again.'));
    return () => {
      active = false;
    };
  }, []);

  const loadYear = async (yearId: string) => {
    setSelectedYearId(yearId);
    setSelectedClassId('');
    setSelectedSectionId('');
    setSelectedExamId('');
    setBatchReports([]);
    const [classSections, availableExams] = await Promise.all([
      ClassService.getClassSections(yearId),
      ResultService.getExams({ academic_year_id: yearId }),
    ]);
    setMappings(classSections);
    setExams(availableExams.filter((exam) => exam.status !== 'cancelled'));
  };

  const brand = (): ProgressReportBrand => ({
    name: schoolName,
    address:
      schoolSettings?.school_address ||
      schoolProfile?.address ||
      SCHOOL_CONFIG.address ||
      '',
    contact:
      schoolSettings?.school_phone ||
      schoolProfile?.phone ||
      SCHOOL_CONFIG.contact ||
      '',
    email:
      schoolSettings?.school_email ||
      schoolProfile?.email ||
      SCHOOL_CONFIG.email ||
      '',
    affiliation: schoolSettings?.school_affiliation || schoolProfile?.affiliation || '',
    tagline: schoolSettings?.school_tagline || 'Learn. Grow. Shine.',
    logoUrl: schoolLogoUrl,
    primary: colors.primaryDark,
    secondary: colors.secondary,
  });

  const searchStudent = async () => {
    if (!studentQuery.trim()) {
      alertCompat('Find a student', 'Enter an admission number, roll number or student name.');
      return;
    }
    setStudentLoading(true);
    setStudentReport(null);
    try {
      const matches = await StudentService.search(studentQuery.trim(), 8, { lifecycle: 'all' });
      const exact = matches.find(
        (item: any) => String(item.admission_no || '').toLowerCase() === studentQuery.trim().toLowerCase(),
      );
      const student = exact || matches[0];
      if (!student) throw new Error('No matching student was found.');
      const payload = await StudentService.getResults(student.id);
      const mapped = mapStudent(student, payload);
      if (!mapped.exams.length) throw new Error('This student has no assessment results yet.');
      setStudentReport(mapped);
    } catch (error: any) {
      alertCompat('Student report unavailable', error?.message || 'Could not load the student report.');
    } finally {
      setStudentLoading(false);
    }
  };

  const loadClassReports = async () => {
    if (!selectedYearId || !selectedClassId || !selectedSectionId || !selectedExamId) {
      alertCompat('Complete the filters', 'Select academic year, class, section and assessment.');
      return;
    }
    setBatchLoading(true);
    setBatchReports([]);
    try {
      const students = await StudentService.getAllPages<any>({
        academic_year_id: selectedYearId,
        class_id: selectedClassId,
        section_id: selectedSectionId,
        lifecycle: 'all',
        sort_by: 'roll_number',
        sort_order: 'asc',
        limit: 100,
      });
      if (!students.length) throw new Error('No students were found in this class section.');
      setBatchProgress({ completed: 0, total: students.length });
      const loaded: StudentReportRecord[] = [];
      for (let index = 0; index < students.length; index += 6) {
        const chunk = students.slice(index, index + 6);
        const records = await Promise.all(
          chunk.map(async (student) => {
            const payload = await StudentService.getResults(student.id, selectedYearId);
            return mapStudent(student, payload, selectedExamId);
          }),
        );
        loaded.push(...records);
        setBatchProgress({ completed: Math.min(index + chunk.length, students.length), total: students.length });
      }
      setBatchReports(applyClassRanks(loaded, reportType, rankingMethod));
    } catch (error: any) {
      alertCompat('Class reports unavailable', error?.message || 'Could not prepare this class.');
    } finally {
      setBatchLoading(false);
    }
  };

  const changeRankingMethod = async (next: ResultRankingMethod) => {
    if (rankingSaving || next === rankingMethod) return;
    const previous = rankingMethod;
    setRankingMethod(next);
    setBatchReports((current) => applyClassRanks(current, reportType, next));
    setRankingSaving(true);
    try {
      await SchoolSettingsService.updateSettings({
        result_ranking_method: next,
      });
      setSchoolSettings((current) =>
        current ? { ...current, result_ranking_method: next } : current,
      );
    } catch {
      setRankingMethod(previous);
      setBatchReports((current) =>
        applyClassRanks(current, reportType, previous),
      );
      alertCompat(
        'Could not save ranking policy',
        'Only an authorised administrator can change result ranking.',
      );
    } finally {
      setRankingSaving(false);
    }
  };

  const printBrand = async (): Promise<ProgressReportBrand> => ({
    ...brand(),
    logoUrl: await resolveProgressReportLogo(schoolLogoUrl),
  });

  const printHtml = async (html: string, title: string) => {
    if (Platform.OS === 'web') {
      const popup = window.open('', '_blank', 'width=1000,height=1200');
      if (!popup) {
        alertCompat('Print window blocked', 'Allow popups for this site and try again.');
        return;
      }
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      const images = Array.from(popup.document.images);
      await Promise.race([
        Promise.all(
          images.map((image) =>
            image.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  image.onload = () => resolve();
                  image.onerror = () => resolve();
                }),
          ),
        ),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]);
      popup.focus();
      popup.print();
      return;
    }
    const Print = await import('expo-print');
    const Sharing = await import('expo-sharing');
    const output = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(output.uri, { mimeType: 'application/pdf', dialogTitle: title });
  };

  const printStudent = async () => {
    if (!studentReport) return;
    const report = printableStudent(studentReport);
    const summary = progressReportSummary(report, reportType);
    if (!summary.subjects.length) {
      alertCompat('No matching marks', `This assessment has no ${reportType === 'direct' ? 'direct' : 'component-based'} subjects.`);
      return;
    }
    await printHtml(
      buildProgressReportHtml(
        [report],
        reportType,
        await printBrand(),
        printLayout,
        { duplicateSingle: true },
      ),
      'Save student progress report',
    );
  };

  const printClass = async () => {
    if (!batchReports.length) {
      alertCompat('Prepare the class first', 'Load the class reports before printing.');
      return;
    }
    const printable = batchReports.map(printableStudent);
    const matching = printable.filter((record) => progressReportSummary(record, reportType).subjects.length > 0);
    if (!matching.length) {
      alertCompat('No matching marks', `This assessment has no ${reportType === 'direct' ? 'direct' : 'component-based'} subjects.`);
      return;
    }
    await printHtml(
      buildProgressReportHtml(matching, reportType, await printBrand(), printLayout),
      'Save class progress reports',
    );
  };

  const current = studentReport ? printableStudent(studentReport) : null;
  const rankingLabel =
    RANKING_OPTIONS.find((option) => option.value === rankingMethod)?.title ||
    'Standard competition';
  const selectedClass = classes.find((item) => item.class_id === selectedClassId);
  const selectedSection = sections.find((item) => item.section_id === selectedSectionId);
  const selectedExam = exams.find((item) => item.id === selectedExamId);
  const selectedYear = years.find((item) => item.id === selectedYearId);
  const selectedFilterCount = [
    selectedYearId,
    selectedClassId,
    selectedSectionId,
    selectedExamId,
  ].filter(Boolean).length;
  const classSelectionComplete = selectedFilterCount === 4;
  const reportsPerPage = printLayout === 'ultra-premium' ? 1 : 2;
  const printLayoutTitle = printLayout === 'ultra-premium' ? 'Ultra Premium' : 'Normal';
  const hasPrintableReport =
    (scope === 'student' && Boolean(studentReport)) ||
    (scope === 'class' && batchReports.length > 0);
  const workflowSteps = scope === 'class'
    ? [
        { label: 'Format', complete: true },
        { label: 'Ranking', complete: true },
        { label: 'Class', complete: classSelectionComplete },
        { label: 'Ready', complete: batchReports.length > 0 },
      ]
    : [
        { label: 'Format', complete: true },
        { label: 'Student', complete: Boolean(studentReport) },
        { label: 'Preview', complete: Boolean(current) },
        { label: 'Ready', complete: Boolean(studentReport) },
      ];

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.background, schoolColorWithAlpha(colors.primary, isDark ? 0.18 : 0.06)]}
        style={StyleSheet.absoluteFill}
      />
      <AdminHeader title="Progress Reports" showBackButton />
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingBottom:
              (hasPrintableReport ? (mobile ? 118 : 128) : 34) +
              insets.bottom,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Animated.View entering={FadeIn.duration(240)} style={styles.heroShell}>
            <LinearGradient
              colors={
                isDark
                  ? [schoolColorWithAlpha(colors.primary, 0.34), colors.surface]
                  : ['#FFFFFF', schoolColorWithAlpha(colors.primary, 0.1)]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroGlow} />
              <View style={styles.heroLead}>
                <View style={styles.heroIcon}>
                  <Ionicons name="ribbon-outline" size={22} color="#fff" />
                </View>
                <View style={styles.heroCopy}>
                  <Text style={styles.eyebrow}>PREMIUM TWO-UP REPORTS</Text>
                  <Text style={styles.title}>Beautiful reports, ready in minutes</Text>
                  <Text style={styles.subtitle}>
                    Select the format, choose who to include, preview, and print two cards on every A4 page.
                  </Text>
                </View>
              </View>
              <View style={styles.brandChip}>
                {schoolLogoUrl ? (
                  <Image source={{ uri: schoolLogoUrl }} style={styles.brandLogo} />
                ) : (
                  <Image source={SCHOOL_CONFIG.logo} style={styles.brandLogo} />
                )}
                <View style={styles.brandCopy}>
                  <Text style={styles.brandOverline}>REPORTS FOR</Text>
                  <Text style={styles.brandName} numberOfLines={2}>{schoolName}</Text>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          <View style={styles.workflowCard}>
            {workflowSteps.map((step, index) => (
              <React.Fragment key={step.label}>
                <View style={styles.workflowStep}>
                  <View
                    style={[
                      styles.workflowDot,
                      step.complete && styles.workflowDotComplete,
                    ]}
                  >
                    <Ionicons
                      name={step.complete ? 'checkmark' : 'ellipse'}
                      size={step.complete ? 14 : 8}
                      color={step.complete ? '#fff' : colors.textMuted}
                    />
                  </View>
                  <Text
                    style={[
                      styles.workflowLabel,
                      step.complete && styles.workflowLabelComplete,
                    ]}
                    numberOfLines={1}
                  >
                    {step.label}
                  </Text>
                </View>
                {index < workflowSteps.length - 1 && (
                  <View
                    style={[
                      styles.workflowLine,
                      workflowSteps[index + 1].complete &&
                        styles.workflowLineComplete,
                    ]}
                  />
                )}
              </React.Fragment>
            ))}
          </View>

          <View style={styles.typeCard}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionStep}>1</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Choose the progress report type</Text>
                <Text style={styles.sectionHint}>Pick the assessment structure that matches how marks were entered.</Text>
              </View>
              <View style={styles.requiredBadge}>
                <Text style={styles.requiredBadgeText}>REQUIRED</Text>
              </View>
            </View>
            <View style={[styles.typeOptions, mobile && styles.stack]}>
              {REPORT_OPTIONS.map((option) => {
                const active = reportType === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    onPress={() => {
                      setReportType(option.value);
                      setBatchReports([]);
                    }}
                    style={({ pressed }) => [
                      styles.typeOption,
                      active && styles.typeOptionActive,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <View style={[styles.optionIcon, active && styles.optionIconActive]}>
                      <Ionicons name={option.icon} size={23} color={active ? '#fff' : colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{option.title}</Text>
                      <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                    </View>
                    <Ionicons
                      name={active ? 'checkmark-circle' : 'ellipse-outline'}
                      size={23}
                      color={active ? colors.primary : colors.textMuted}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.typeCard}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionStep}>2</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Choose the print design</Text>
                <Text style={styles.sectionHint}>Both designs use larger, easier-to-read text.</Text>
              </View>
              <View style={styles.requiredBadge}>
                <Text style={styles.requiredBadgeText}>REQUIRED</Text>
              </View>
            </View>
            <View style={[styles.typeOptions, mobile && styles.stack]}>
              {PRINT_LAYOUT_OPTIONS.map((option) => {
                const active = printLayout === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={`${option.title}, ${option.badge}`}
                    onPress={() => setPrintLayout(option.value)}
                    style={({ pressed }) => [
                      styles.typeOption,
                      active && styles.typeOptionActive,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <View style={[styles.optionIcon, active && styles.optionIconActive]}>
                      <Ionicons name={option.icon} size={23} color={active ? '#fff' : colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.layoutTitleRow}>
                        <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{option.title}</Text>
                        <View style={[styles.layoutBadge, active && styles.layoutBadgeActive]}>
                          <Text style={[styles.layoutBadgeText, active && styles.layoutBadgeTextActive]}>{option.badge}</Text>
                        </View>
                      </View>
                      <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                    </View>
                    <Ionicons
                      name={active ? 'checkmark-circle' : 'ellipse-outline'}
                      size={23}
                      color={active ? colors.primary : colors.textMuted}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.scopeBar}>
            <View style={styles.scopeCopy}>
              <Text style={styles.scopeLabel}>WHO ARE YOU PRINTING FOR?</Text>
              {!mobile && (
                <Text style={styles.scopeHint}>Switch without losing the selected format</Text>
              )}
            </View>
            <View style={styles.scopeToggle}>
              {([
                ['class', 'Whole class', 'people-outline'],
                ['student', 'Single student', 'person-outline'],
              ] as [ReportScope, string, keyof typeof Ionicons.glyphMap][]).map(([value, label, icon]) => {
                const active = scope === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    onPress={() => setScope(value)}
                    style={({ pressed }) => [
                      styles.scopeOption,
                      active && styles.scopeOptionActive,
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <Ionicons name={icon} size={16} color={active ? '#fff' : colors.textSecondary} />
                    <Text style={[styles.scopeText, active && styles.scopeTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {scope === 'class' && (
            <View style={styles.rankingCard}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionStep}>3</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>
                    Choose the ranking algorithm
                  </Text>
                  <Text style={styles.sectionHint}>
                    This school-wide policy is also used by marks entry and report-card ranks.
                  </Text>
                </View>
                {rankingSaving && (
                  <LogoLoader size={22} color={colors.primary} />
                )}
              </View>
              <ScrollView
                horizontal={mobile}
                scrollEnabled={mobile}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[
                  styles.rankingOptions,
                  mobile && styles.rankingOptionsMobile,
                ]}
              >
                {RANKING_OPTIONS.map((option) => {
                  const active = rankingMethod === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked: active,
                        disabled: rankingSaving,
                      }}
                      disabled={rankingSaving}
                      onPress={() => changeRankingMethod(option.value)}
                      style={({ pressed }) => [
                        styles.rankingOption,
                        mobile && styles.rankingOptionMobile,
                        active && styles.rankingOptionActive,
                        pressed && styles.optionPressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.rankingIcon,
                          active && styles.rankingIconActive,
                        ]}
                      >
                        <Ionicons
                          name={option.icon}
                          size={19}
                          color={active ? '#fff' : colors.primary}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.rankingTitle,
                            active && styles.rankingTitleActive,
                          ]}
                        >
                          {option.title}
                        </Text>
                        <Text style={styles.rankingDescription}>
                          {option.description}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.rankingExample,
                          active && styles.rankingExampleActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.rankingExampleText,
                            active && styles.rankingExampleTextActive,
                          ]}
                        >
                          {option.example}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {scope === 'student' ? (
            <View style={styles.filterCard}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionStep}>3</Text>
                <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Find a student</Text><Text style={styles.sectionHint}>Admission number, roll number or full name</Text></View>
                {studentReport && (
                  <Pressable
                    accessibilityLabel="Clear selected student"
                    onPress={() => {
                      setStudentReport(null);
                      setStudentQuery('');
                    }}
                    style={styles.clearButton}
                  >
                    <Ionicons name="close" size={17} color={colors.textSecondary} />
                  </Pressable>
                )}
              </View>
              <View style={styles.searchRow}>
                <View style={styles.searchInput}>
                  <Ionicons name="search-outline" size={19} color={colors.textMuted} />
                  <AppTextInput
                    value={studentQuery}
                    onChangeText={setStudentQuery}
                    onSubmitEditing={searchStudent}
                    placeholder="Search student"
                    placeholderTextColor={colors.textMuted}
                    style={styles.textInput}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.primaryButton, studentLoading && styles.buttonDisabled]}
                  onPress={searchStudent}
                  disabled={studentLoading}
                  activeOpacity={0.86}
                >
                  {studentLoading ? <LogoLoader size={23} color="#fff" /> : <><Ionicons name="search" size={18} color="#fff" /><Text style={styles.primaryButtonText}>Find</Text></>}
                </TouchableOpacity>
              </View>
              {studentReport && (
                <View style={styles.selectedStudentCard}>
                  <View style={styles.selectedStudentAvatar}>
                    <Text style={styles.selectedStudentInitials}>
                      {studentReport.name
                        .split(' ')
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join('')
                        .toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedStudentName}>{studentReport.name}</Text>
                    <Text style={styles.selectedStudentMeta}>
                      {studentReport.classLabel} · Roll {studentReport.rollNo} · {studentReport.admissionNo}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                </View>
              )}
              {studentReport && studentReport.exams.length > 1 && (
                <ChipSelector
                  label="Assessment"
                  items={studentReport.exams.map((exam, index) => ({ id: String(index), label: exam.name }))}
                  selectedId={String(studentReport.selectedExamIndex)}
                  onSelect={(id) => setStudentReport({ ...studentReport, selectedExamIndex: Number(id) })}
                  styles={styles}
                />
              )}
            </View>
          ) : (
            <View style={styles.filterCard}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionStep}>4</Text>
                <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Select the class assessment</Text><Text style={styles.sectionHint}>Complete all four selections to prepare the class pack.</Text></View>
                <View style={[styles.completionBadge, classSelectionComplete && styles.completionBadgeDone]}>
                  <Text style={[styles.completionBadgeText, classSelectionComplete && styles.completionBadgeTextDone]}>
                    {selectedFilterCount}/4
                  </Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${(selectedFilterCount / 4) * 100}%` },
                  ]}
                />
              </View>
              <View style={styles.selectionSummary}>
                {[
                  ['calendar-outline', selectedYear?.code || 'Year'],
                  ['school-outline', selectedClass?.class_name || 'Class'],
                  ['people-outline', selectedSection?.section_name || 'Section'],
                  ['clipboard-outline', selectedExam?.name || 'Assessment'],
                ].map(([icon, label], index) => {
                  const selected = index < selectedFilterCount;
                  return (
                    <View key={String(icon)} style={[styles.selectionSummaryItem, selected && styles.selectionSummaryItemDone]}>
                      <Ionicons
                        name={icon as keyof typeof Ionicons.glyphMap}
                        size={14}
                        color={selected ? colors.primary : colors.textMuted}
                      />
                      <Text
                        style={[styles.selectionSummaryText, selected && styles.selectionSummaryTextDone]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <ChipSelector label="Academic year" items={years.map((year) => ({ id: year.id, label: year.code }))} selectedId={selectedYearId} onSelect={loadYear} styles={styles} />
              <ChipSelector label="Class" items={classes.map((item) => ({ id: item.class_id, label: item.class_name }))} selectedId={selectedClassId} onSelect={(id) => { setSelectedClassId(id); setSelectedSectionId(''); setBatchReports([]); }} styles={styles} />
              <ChipSelector label="Section" items={sections.map((item) => ({ id: item.section_id, label: item.section_name }))} selectedId={selectedSectionId} onSelect={(id) => { setSelectedSectionId(id); setBatchReports([]); }} styles={styles} />
              <ChipSelector label="Assessment" items={exams.map((exam) => ({ id: exam.id, label: exam.name }))} selectedId={selectedExamId} onSelect={(id) => { setSelectedExamId(id); setBatchReports([]); }} styles={styles} />
              {batchLoading && batchProgress.total > 0 && (
                <View style={styles.loadingProgressTrack}>
                  <View
                    style={[
                      styles.loadingProgressFill,
                      {
                        width: `${Math.min(100, (batchProgress.completed / batchProgress.total) * 100)}%`,
                      },
                    ]}
                  />
                </View>
              )}
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  styles.prepareButton,
                  (!classSelectionComplete || batchLoading) && styles.buttonDisabled,
                ]}
                onPress={loadClassReports}
                disabled={!classSelectionComplete || batchLoading}
                activeOpacity={0.86}
              >
                {batchLoading ? <><LogoLoader size={23} color="#fff" /><Text style={styles.primaryButtonText}>Preparing {batchProgress.completed}/{batchProgress.total}</Text></> : <><Ionicons name="sparkles-outline" size={18} color="#fff" /><Text style={styles.primaryButtonText}>{classSelectionComplete ? 'Prepare class reports' : 'Complete the selections'}</Text></>}
              </TouchableOpacity>
            </View>
          )}

          {scope === 'student' && current ? (
            <ReportPreview
              report={current}
              reportType={reportType}
              schoolName={schoolName}
              schoolLogoUrl={schoolLogoUrl}
              mobile={mobile}
              styles={styles}
            />
          ) : scope === 'class' && batchReports.length ? (
            <View style={styles.readyCard}>
              <View style={styles.readyIcon}><Ionicons name="checkmark" size={26} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.readyTitle}>{batchReports.length} reports ready</Text>
                <Text style={styles.readyHint}>
                  {printLayout === 'ultra-premium'
                    ? 'One student per A4 page'
                    : 'Two students per A4 page with tear gap'}{' '}
                  in roll-number order · {rankingLabel} ranking applied.
                </Text>
              </View>
              <View style={styles.pageCount}><Text style={styles.pageCountValue}>{Math.ceil(batchReports.length / reportsPerPage)}</Text><Text style={styles.pageCountLabel}>PAGES</Text></View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="documents-outline" size={30} color={colors.primary} />
              </View>
              <View style={styles.emptyCopy}>
                <Text style={styles.emptyEyebrow}>NEXT STEP</Text>
                <Text style={styles.emptyTitle}>
                  {scope === 'class'
                    ? classSelectionComplete
                      ? 'Prepare your class report pack'
                      : `Complete ${4 - selectedFilterCount} more selection${4 - selectedFilterCount === 1 ? '' : 's'}`
                    : studentReport
                      ? 'Your student report is ready to preview'
                      : 'Search for a student to continue'}
                </Text>
                <Text style={styles.emptyText}>
                  {scope === 'class'
                    ? classSelectionComplete
                      ? 'We will calculate ranks, assemble the cards, and show the final page count.'
                      : 'Choose the academic year, class, section, and assessment above.'
                    : 'Use an admission number, roll number, or student name.'}
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {hasPrintableReport && (
        <Animated.View
          entering={FadeInDown.duration(220)}
          style={[
            styles.printBar,
            {
              bottom: Platform.OS === 'web' ? 16 : Math.max(insets.bottom, 10),
            },
          ]}
        >
          <View style={styles.printBarCopy}>
            <View style={styles.printReadyRow}>
              <Ionicons name="checkmark-circle" size={15} color={colors.success} />
              <Text style={styles.printReadyText}>READY TO PRINT</Text>
            </View>
            <Text style={styles.printBarTitle}>
              {printLayout === 'ultra-premium' ? 'One report per A4 page' : 'Two reports per A4 page'}
            </Text>
            {!compact && (
              <Text style={styles.printBarHint} numberOfLines={1}>
                {printLayoutTitle} · {reportType === 'direct' ? 'Direct assessment' : 'Component-based assessment'}
                {scope === 'class' ? ` · ${rankingLabel}` : ' · School + parent copies'}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.printButton}
            onPress={scope === 'student' ? printStudent : printClass}
            activeOpacity={0.86}
          >
            <Feather name="printer" size={18} color="#fff" />
            <Text style={styles.printButtonText}>
              {mobile ? 'Print PDF' : 'Print / Save PDF'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

function ChipSelector({
  label,
  items,
  selectedId,
  onSelect,
  styles,
}: {
  label: string;
  items: { id: string; label: string }[];
  selectedId: string;
  onSelect: (id: string) => void | Promise<void>;
  styles: ReturnType<typeof createStyles>;
}) {
  const selectedItem = items.find((item) => item.id === selectedId);
  return (
    <View style={styles.chipGroup}>
      <View style={styles.chipLabelRow}>
        <Text style={styles.chipLabel}>{label}</Text>
        {!!selectedItem && (
          <View style={styles.selectedMiniBadge}>
            <Ionicons name="checkmark" size={11} color="#fff" />
            <Text style={styles.selectedMiniBadgeText} numberOfLines={1}>
              {selectedItem.label}
            </Text>
          </View>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {items.length ? items.map((item) => {
          const active = item.id === selectedId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => onSelect(item.id)}
              style={({ pressed }) => [
                styles.chip,
                active && styles.chipActive,
                pressed && styles.optionPressed,
              ]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
              {active && <Ionicons name="checkmark" size={14} color="#fff" />}
            </Pressable>
          );
        }) : <Text style={styles.noOptions}>Choose the previous filter first</Text>}
      </ScrollView>
    </View>
  );
}

function ReportPreview({
  report,
  reportType,
  schoolName,
  schoolLogoUrl,
  mobile,
  styles,
}: {
  report: ProgressReportStudent;
  reportType: ProgressReportType;
  schoolName: string;
  schoolLogoUrl: string;
  mobile: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const summary = progressReportSummary(report, reportType);
  return (
    <View style={styles.previewCard}>
      <View style={styles.previewAccent} />
      <View style={styles.previewHeader}>
        {schoolLogoUrl ? (
          <Image source={{ uri: schoolLogoUrl }} style={styles.previewLogo} />
        ) : (
          <Image source={SCHOOL_CONFIG.logo} style={styles.previewLogo} />
        )}
        <View style={{ flex: 1 }}><Text style={styles.previewSchool}>{schoolName}</Text><Text style={styles.previewKind}>{reportType === 'direct' ? 'DIRECT ASSESSMENT' : 'COMPONENT-BASED ASSESSMENT'} PROGRESS REPORT</Text></View>
      </View>
      <View style={styles.previewStudentRow}>
        <View><Text style={styles.previewLabel}>STUDENT</Text><Text style={styles.previewValue}>{report.name}</Text></View>
        <View><Text style={styles.previewLabel}>CLASS & SECTION</Text><Text style={styles.previewValue}>{report.classLabel}</Text></View>
        <View><Text style={styles.previewLabel}>ROLL NO.</Text><Text style={styles.previewValue}>{report.rollNo}</Text></View>
      </View>
      <View style={styles.previewTableLabelRow}>
        <Text style={styles.previewTableLabel}>MARKS BREAKDOWN</Text>
        {mobile && (
          <View style={styles.swipeHint}>
            <Ionicons name="swap-horizontal" size={14} color="#7C3AED" />
            <Text style={styles.swipeHintText}>Swipe table</Text>
          </View>
        )}
      </View>
      <ScrollView
        horizontal
        scrollEnabled={mobile}
        showsHorizontalScrollIndicator={mobile}
        contentContainerStyle={styles.previewTableScroll}
      >
        <View style={[styles.previewTable, mobile && styles.previewTableMobile]}>
          <View style={styles.previewTableHeader}>
            <Text style={[styles.previewTh, { flex: 2 }]}>Subject</Text>
            {reportType === 'component' ? <><Text style={styles.previewTh}>Part.</Text><Text style={styles.previewTh}>Written</Text><Text style={styles.previewTh}>Project</Text><Text style={styles.previewTh}>Slip</Text><Text style={styles.previewTh}>Total</Text></> : <><Text style={styles.previewTh}>Max.</Text><Text style={styles.previewTh}>Marks</Text><Text style={styles.previewTh}>Grade</Text><Text style={[styles.previewTh, { flex: 2 }]}>Teacher remarks</Text></>}
          </View>
          {summary.subjects.slice(0, 10).map((subject, index) => (
            <View key={`${subject.subject}-${index}`} style={[styles.previewTableRow, index % 2 === 1 && styles.previewTableRowAlt]}>
              <Text style={[styles.previewTd, styles.previewSubject]}>{subject.subject}</Text>
              {reportType === 'component' ? <>
                <Text style={styles.previewTd}>{subject.isAbsent ? '-' : subject.participationMarks ?? '-'}</Text><Text style={styles.previewTd}>{subject.isAbsent ? '-' : subject.writtenWorkMarks ?? '-'}</Text><Text style={styles.previewTd}>{subject.isAbsent ? '-' : subject.projectWorkMarks ?? '-'}</Text><Text style={styles.previewTd}>{subject.isAbsent ? '-' : subject.slipTestMarks ?? '-'}</Text><Text style={[styles.previewTd, styles.previewTotal]}>{subject.isAbsent ? 'Absent' : subject.obtained ?? '-'}</Text>
              </> : <>
                <Text style={styles.previewTd}>{subject.consolidatedMaxMarks || subject.maxMarks}</Text><Text style={[styles.previewTd, styles.previewTotal]}>{subject.isAbsent ? 'Absent' : subject.consolidatedMarksObtained ?? subject.obtained ?? '-'}</Text><Text style={styles.previewTd}>{subject.grade}</Text><Text style={[styles.previewTd, { flex: 2 }]}>{subject.remarks}</Text>
              </>}
            </View>
          ))}
        </View>
      </ScrollView>
      {!summary.subjects.length && <View style={styles.previewEmpty}><Text style={styles.previewEmptyText}>No {reportType === 'direct' ? 'direct' : 'component-based'} marks in {report.examName}.</Text></View>}
      <View style={styles.previewSummary}>
        {[['Result', summary.result], ['Percentage', summary.totalMax ? `${summary.percentage.toFixed(1)}%` : '-'], ['Rank', report.classRank ? `#${report.classRank}` : '-'], ['Attendance', report.attendance]].map(([label, value]) => <View key={label}><Text style={styles.previewLabel}>{label}</Text><Text style={styles.previewSummaryValue}>{value}</Text></View>)}
      </View>
    </View>
  );
}

const createStyles = (
  colors: (typeof schoolTheme.light)['colors'],
  dark: boolean,
  mobile: boolean,
  compact: boolean,
) => StyleSheet.create({
  root: { flex: 1 },
  keyboardRoot: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
    paddingHorizontal: mobile ? 12 : 20,
    paddingTop: mobile ? 12 : 20,
    gap: mobile ? 12 : 16,
  },
  heroShell: {
    borderRadius: mobile ? 20 : 26,
    backgroundColor: dark ? colors.surface : '#fff',
    shadowColor: colors.primaryDark,
    shadowOpacity: dark ? 0.15 : 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  hero: {
    minHeight: mobile ? 156 : 126,
    flexDirection: mobile ? 'column' : 'row',
    alignItems: mobile ? 'stretch' : 'center',
    justifyContent: 'space-between',
    gap: mobile ? 14 : 20,
    padding: mobile ? 16 : 22,
    borderRadius: mobile ? 20 : 26,
    borderWidth: 1,
    borderColor: schoolColorWithAlpha(colors.primary, 0.18),
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    right: -58,
    top: -78,
    backgroundColor: schoolColorWithAlpha(colors.secondary, dark ? 0.08 : 0.1),
  },
  heroLead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIcon: {
    width: mobile ? 46 : 54,
    height: mobile ? 46 : 54,
    borderRadius: mobile ? 15 : 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  heroCopy: { flex: 1 },
  eyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.25, color: colors.secondary, marginBottom: 3 },
  title: { fontSize: mobile ? (compact ? 19 : 21) : 27, lineHeight: mobile ? 26 : 33, fontWeight: '900', color: colors.textStrong },
  subtitle: { marginTop: 5, maxWidth: 710, fontSize: mobile ? 11 : 13, lineHeight: mobile ? 17 : 19, color: colors.textSecondary },
  brandChip: {
    minWidth: mobile ? undefined : 235,
    maxWidth: mobile ? undefined : 275,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: dark ? schoolColorWithAlpha('#FFFFFF', 0.06) : 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: schoolColorWithAlpha(colors.primary, 0.14),
  },
  brandLogo: { width: 36, height: 36, resizeMode: 'contain' },
  brandCopy: { flex: 1 },
  brandOverline: { fontSize: 8, fontWeight: '900', letterSpacing: 0.9, color: colors.textMuted },
  brandName: { marginTop: 1, fontSize: 12, lineHeight: 16, fontWeight: '900', color: colors.textStrong },
  workflowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: mobile ? 12 : 18,
    paddingVertical: mobile ? 10 : 12,
    borderRadius: 16,
    backgroundColor: dark ? colors.surface : '#fff',
    borderWidth: 1,
    borderColor: colors.border,
  },
  workflowStep: { flexDirection: mobile ? 'column' : 'row', alignItems: 'center', gap: mobile ? 3 : 7 },
  workflowDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.card : '#f1f5f9', borderWidth: 1, borderColor: colors.border },
  workflowDotComplete: { backgroundColor: colors.primary, borderColor: colors.primary },
  workflowLabel: { fontSize: mobile ? 9 : 11, fontWeight: '800', color: colors.textMuted },
  workflowLabelComplete: { color: colors.textStrong },
  workflowLine: { flex: 1, height: 2, marginHorizontal: mobile ? 4 : 9, backgroundColor: colors.border },
  workflowLineComplete: { backgroundColor: schoolColorWithAlpha(colors.primary, 0.45) },
  typeCard: {
    padding: mobile ? 15 : 19,
    borderRadius: mobile ? 19 : 23,
    backgroundColor: dark ? colors.surface : '#fff',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: mobile ? 12 : 15 },
  sectionStep: { width: 30, height: 30, lineHeight: 30, textAlign: 'center', borderRadius: 10, overflow: 'hidden', backgroundColor: colors.primary, color: '#fff', fontWeight: '900' },
  sectionTitle: { fontSize: mobile ? 15 : 17, lineHeight: mobile ? 20 : 22, fontWeight: '900', color: colors.textStrong },
  sectionHint: { marginTop: 2, fontSize: mobile ? 10 : 12, lineHeight: mobile ? 15 : 17, color: colors.textSecondary },
  requiredBadge: { display: compact ? 'none' : 'flex', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: schoolColorWithAlpha(colors.secondary, 0.11) },
  requiredBadgeText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.7, color: colors.secondary },
  typeOptions: { flexDirection: 'row', gap: 11 },
  stack: { flexDirection: 'column' },
  typeOption: {
    flex: 1,
    minHeight: mobile ? 86 : 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: mobile ? 12 : 15,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: dark ? colors.card : '#fbfcfe',
  },
  typeOptionActive: { borderColor: colors.primary, backgroundColor: schoolColorWithAlpha(colors.primary, 0.08) },
  optionPressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  optionIcon: { width: mobile ? 40 : 44, height: mobile ? 40 : 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: schoolColorWithAlpha(colors.primary, 0.1) },
  optionIconActive: { backgroundColor: colors.primary },
  layoutTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  layoutBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: schoolColorWithAlpha(colors.textMuted, 0.1) },
  layoutBadgeActive: { backgroundColor: schoolColorWithAlpha(colors.primary, 0.13) },
  layoutBadgeText: { fontSize: 7, fontWeight: '900', letterSpacing: 0.55, color: colors.textMuted },
  layoutBadgeTextActive: { color: colors.primary },
  optionTitle: { fontSize: mobile ? 14 : 15, fontWeight: '900', color: colors.textStrong },
  optionTitleActive: { color: colors.primary },
  optionSubtitle: { marginTop: 3, fontSize: mobile ? 10 : 11, lineHeight: mobile ? 14 : 16, color: colors.textSecondary },
  scopeBar: {
    flexDirection: mobile ? 'column' : 'row',
    alignItems: mobile ? 'stretch' : 'center',
    justifyContent: 'space-between',
    gap: mobile ? 9 : 12,
    padding: mobile ? 12 : 11,
    borderRadius: 18,
    backgroundColor: dark ? colors.surface : '#fff',
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopeCopy: { marginLeft: mobile ? 2 : 7 },
  scopeLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.9, color: colors.textStrong },
  scopeHint: { marginTop: 2, fontSize: 10, color: colors.textMuted },
  scopeToggle: { width: mobile ? '100%' : undefined, flexDirection: 'row', gap: 5, padding: 4, borderRadius: 13, backgroundColor: schoolColorWithAlpha(colors.primary, 0.07) },
  scopeOption: { flex: mobile ? 1 : undefined, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  scopeOptionActive: { backgroundColor: colors.primary },
  scopeText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  scopeTextActive: { color: '#fff' },
  filterCard: { padding: mobile ? 15 : 19, borderRadius: mobile ? 19 : 23, backgroundColor: dark ? colors.surface : '#fff', borderWidth: 1, borderColor: colors.border },
  rankingCard: { padding: mobile ? 15 : 19, borderRadius: mobile ? 19 : 23, backgroundColor: dark ? colors.surface : '#fff', borderWidth: 1, borderColor: colors.border },
  rankingOptions: { flexDirection: 'row', gap: 10 },
  rankingOptionsMobile: { paddingRight: 8 },
  rankingOption: { flex: 1, minHeight: 130, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: dark ? colors.card : '#f8fafc' },
  rankingOptionMobile: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: compact ? 242 : 270,
    width: compact ? 242 : 270,
    minHeight: 140,
  },
  rankingOptionActive: { borderColor: colors.primary, backgroundColor: schoolColorWithAlpha(colors.primary, 0.07) },
  rankingIcon: { width: 35, height: 35, marginBottom: 9, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: schoolColorWithAlpha(colors.primary, 0.1) },
  rankingIconActive: { backgroundColor: colors.primary },
  rankingTitle: { fontSize: 13, fontWeight: '900', color: colors.textStrong },
  rankingTitleActive: { color: colors.primary },
  rankingDescription: { marginTop: 4, minHeight: 34, fontSize: 10, lineHeight: 15, color: colors.textSecondary },
  rankingExample: { alignSelf: 'flex-start', marginTop: 9, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: schoolColorWithAlpha(colors.textMuted, 0.1) },
  rankingExampleActive: { backgroundColor: schoolColorWithAlpha(colors.primary, 0.13) },
  rankingExampleText: { fontSize: 9, fontWeight: '900', color: colors.textSecondary },
  rankingExampleTextActive: { color: colors.primary },
  clearButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.card : '#f1f5f9', borderWidth: 1, borderColor: colors.border },
  searchRow: { flexDirection: mobile ? 'column' : 'row', gap: 9 },
  searchInput: { flex: mobile ? undefined : 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: dark ? colors.card : '#f8fafc' },
  textInput: { flex: 1, minHeight: 48, color: colors.textPrimary, fontSize: 14 },
  primaryButton: { minHeight: mobile ? 52 : 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 19, borderRadius: 14, backgroundColor: colors.primary },
  buttonDisabled: { opacity: 0.48 },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  prepareButton: { alignSelf: mobile ? 'stretch' : 'flex-start', marginTop: 13, minWidth: mobile ? undefined : 230 },
  selectedStudentCard: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 15, backgroundColor: schoolColorWithAlpha(colors.success, 0.07), borderWidth: 1, borderColor: schoolColorWithAlpha(colors.success, 0.22) },
  selectedStudentAvatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  selectedStudentInitials: { color: '#fff', fontSize: 12, fontWeight: '900' },
  selectedStudentName: { fontSize: 13, fontWeight: '900', color: colors.textStrong },
  selectedStudentMeta: { marginTop: 2, fontSize: 10, color: colors.textSecondary },
  completionBadge: { minWidth: 40, paddingHorizontal: 9, paddingVertical: 6, alignItems: 'center', borderRadius: 10, backgroundColor: dark ? colors.card : '#f1f5f9' },
  completionBadgeDone: { backgroundColor: schoolColorWithAlpha(colors.success, 0.13) },
  completionBadgeText: { fontSize: 11, fontWeight: '900', color: colors.textMuted },
  completionBadgeTextDone: { color: colors.success },
  progressTrack: { height: 5, marginTop: -2, marginBottom: 12, borderRadius: 99, overflow: 'hidden', backgroundColor: dark ? colors.card : '#eef2f7' },
  progressFill: { height: '100%', borderRadius: 99, backgroundColor: colors.primary },
  selectionSummary: { flexDirection: 'row', flexWrap: mobile ? 'wrap' : 'nowrap', gap: 7, marginBottom: 4 },
  selectionSummaryItem: { flex: mobile ? undefined : 1, width: mobile ? '48%' : undefined, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 10, backgroundColor: dark ? colors.card : '#f8fafc', borderWidth: 1, borderColor: colors.border },
  selectionSummaryItemDone: { backgroundColor: schoolColorWithAlpha(colors.primary, 0.055), borderColor: schoolColorWithAlpha(colors.primary, 0.18) },
  selectionSummaryText: { flex: 1, fontSize: 9, fontWeight: '700', color: colors.textMuted },
  selectionSummaryTextDone: { color: colors.textStrong },
  chipGroup: { marginTop: 13 },
  chipLabelRow: { minHeight: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 7 },
  chipLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.7, color: colors.textMuted, textTransform: 'uppercase' },
  selectedMiniBadge: { maxWidth: '58%', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.primary },
  selectedMiniBadgeText: { flexShrink: 1, color: '#fff', fontSize: 9, fontWeight: '800' },
  chips: { gap: 7, paddingRight: 18 },
  chip: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: dark ? colors.card : '#f8fafc' },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },
  noOptions: { paddingVertical: 10, fontSize: 11, color: colors.textMuted, fontStyle: 'italic' },
  loadingProgressTrack: { height: 5, marginTop: 14, borderRadius: 99, overflow: 'hidden', backgroundColor: dark ? colors.card : '#eef2f7' },
  loadingProgressFill: { height: '100%', borderRadius: 99, backgroundColor: colors.secondary },
  emptyState: { flexDirection: mobile ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: 14, padding: mobile ? 24 : 34, borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: schoolColorWithAlpha(colors.primary, 0.3), backgroundColor: schoolColorWithAlpha(colors.primary, 0.03) },
  emptyIconWrap: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: schoolColorWithAlpha(colors.primary, 0.1) },
  emptyCopy: { maxWidth: 570, alignItems: mobile ? 'center' : 'flex-start' },
  emptyEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1, color: colors.primary },
  emptyTitle: { marginTop: 3, fontSize: 16, fontWeight: '900', color: colors.textStrong, textAlign: mobile ? 'center' : 'left' },
  emptyText: { marginTop: 4, fontSize: 11, lineHeight: 17, color: colors.textSecondary, textAlign: mobile ? 'center' : 'left' },
  readyCard: { flexDirection: 'row', flexWrap: mobile ? 'wrap' : 'nowrap', alignItems: 'center', gap: 13, padding: mobile ? 15 : 18, borderRadius: 20, backgroundColor: schoolColorWithAlpha(colors.success, 0.1), borderWidth: 1, borderColor: schoolColorWithAlpha(colors.success, 0.3) },
  readyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.success },
  readyTitle: { fontSize: 16, fontWeight: '900', color: colors.textStrong },
  readyHint: { marginTop: 3, fontSize: 11, lineHeight: 16, color: colors.textSecondary },
  pageCount: { alignItems: 'center', minWidth: 66, marginLeft: mobile ? 'auto' : 0, padding: 9, borderRadius: 12, backgroundColor: dark ? colors.card : '#fff' },
  pageCountValue: { fontSize: 19, fontWeight: '900', color: colors.primary },
  pageCountLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8, color: colors.textMuted },
  previewCard: { overflow: 'hidden', padding: mobile ? 13 : 18, borderRadius: mobile ? 19 : 22, backgroundColor: dark ? colors.surface : '#fff', borderWidth: 1, borderColor: colors.border },
  previewAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: colors.secondary },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  previewLogo: { width: mobile ? 42 : 50, height: mobile ? 42 : 50, resizeMode: 'contain' },
  previewLogoFallback: { width: mobile ? 42 : 50, height: mobile ? 42 : 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  previewLogoFallbackText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  previewSchool: { fontSize: mobile ? 15 : 20, fontWeight: '900', color: colors.primary, textTransform: 'uppercase' },
  previewKind: { marginTop: 3, fontSize: mobile ? 8 : 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.65, color: colors.secondary },
  previewStudentRow: { flexDirection: 'row', flexWrap: mobile ? 'wrap' : 'nowrap', justifyContent: 'space-between', gap: mobile ? 12 : 15, paddingVertical: 12 },
  previewLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 0.6, color: colors.textMuted, textTransform: 'uppercase' },
  previewValue: { marginTop: 2, fontSize: 12, fontWeight: '800', color: colors.textStrong },
  previewTableLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  previewTableLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8, color: colors.primary },
  swipeHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swipeHintText: { fontSize: 9, fontWeight: '800', color: colors.primary },
  previewTableScroll: { minWidth: '100%' },
  previewTable: { width: '100%' },
  previewTableMobile: { width: reportTableWidth(compact) },
  previewTableHeader: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8, backgroundColor: colors.primary, borderTopLeftRadius: 9, borderTopRightRadius: 9 },
  previewTh: { flex: 1, color: '#fff', fontSize: 9, fontWeight: '900', textAlign: 'center' },
  previewTableRow: { flexDirection: 'row', minHeight: 38, alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  previewTableRowAlt: { backgroundColor: schoolColorWithAlpha(colors.primary, 0.035) },
  previewTd: { flex: 1, fontSize: 10, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  previewSubject: { flex: 2, textAlign: 'left' },
  previewTotal: { fontWeight: '900', color: colors.primary },
  previewEmpty: { padding: 28, alignItems: 'center', borderWidth: 1, borderTopWidth: 0, borderColor: colors.border },
  previewEmptyText: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
  previewSummary: { flexDirection: 'row', flexWrap: mobile ? 'wrap' : 'nowrap', justifyContent: 'space-between', gap: mobile ? 14 : 12, marginTop: 13, padding: 12, borderRadius: 12, backgroundColor: schoolColorWithAlpha(colors.primary, 0.06) },
  previewSummaryValue: { marginTop: 3, fontSize: 13, fontWeight: '900', color: colors.textStrong },
  printBar: { position: 'absolute', left: mobile ? 10 : 18, right: mobile ? 10 : 18, maxWidth: 760, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: mobile ? 10 : 16, padding: mobile ? 10 : 13, paddingLeft: mobile ? 12 : 17, borderRadius: mobile ? 17 : 19, backgroundColor: dark ? '#172033' : '#fff', borderWidth: 1, borderColor: colors.border, shadowColor: '#0f172a', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 9 }, elevation: 10 },
  printBarCopy: { flex: 1, minWidth: 0 },
  printReadyRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  printReadyText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8, color: colors.success },
  printBarTitle: { fontSize: mobile ? 12 : 13, fontWeight: '900', color: dark ? '#fff' : colors.textStrong },
  printBarHint: { marginTop: 2, fontSize: 9, color: dark ? '#cbd5e1' : colors.textSecondary },
  printButton: { minHeight: mobile ? 48 : 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: mobile ? 14 : 18, paddingVertical: 12, borderRadius: 13, backgroundColor: colors.primary },
  printButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
});

function reportTableWidth(compact: boolean) {
  return compact ? 690 : 740;
}
