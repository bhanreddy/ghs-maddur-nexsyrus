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
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import AdminHeader from '../../src/components/AdminHeader';
import AppTextInput from '../../src/components/AppTextInput';
import LogoLoader from '../../src/components/LogoLoader';
import { schoolColorWithAlpha, schoolTheme } from '../../src/constants/schoolConfig';
import { AcademicYear, ClassSection, ClassService } from '../../src/services/classService';
import { Exam, ResultService } from '../../src/services/commonServices';
import { SchoolSettings, SchoolSettingsService } from '../../src/services/schoolSettingsService';
import { SchoolProfile, SchoolService } from '../../src/services/schoolService';
import { StudentService } from '../../src/services/studentService';
import { useTheme } from '../../src/hooks/useTheme';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import {
  buildTwoUpProgressReportHtml,
  ProgressReportBrand,
  ProgressReportStudent,
  ProgressReportSubject,
  ProgressReportType,
  progressReportSummary,
} from '../../src/utils/progressReportHtml';

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

export default function ProgressReportGenerator() {
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1040;
  const colors = isDark ? schoolTheme.dark.colors : schoolTheme.light.colors;
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [reportType, setReportType] = useState<ProgressReportType>('direct');
  const [scope, setScope] = useState<ReportScope>('class');
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(null);
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfile | null>(null);
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

  const schoolName = schoolSettings?.school_name?.trim() || schoolProfile?.name?.trim() || 'School';
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
    address: schoolSettings?.school_address || schoolProfile?.address || '',
    contact: schoolSettings?.school_phone || schoolProfile?.phone || '',
    email: schoolSettings?.school_email || schoolProfile?.email || '',
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
      const scored = loaded
        .map((record) => ({ record, score: progressReportSummary(printableStudent(record), reportType).percentage }))
        .sort((a, b) => b.score - a.score);
      let previousScore: number | null = null;
      let previousRank = 0;
      scored.forEach((item, index) => {
        if (previousScore == null || Math.abs(item.score - previousScore) > 0.001) {
          previousRank = index + 1;
          previousScore = item.score;
        }
        item.record.classRank = previousRank;
      });
      setBatchReports(loaded);
    } catch (error: any) {
      alertCompat('Class reports unavailable', error?.message || 'Could not prepare this class.');
    } finally {
      setBatchLoading(false);
    }
  };

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
      setTimeout(() => {
        popup.focus();
        popup.print();
      }, 500);
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
      buildTwoUpProgressReportHtml([report], reportType, brand(), { duplicateSingle: true }),
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
      buildTwoUpProgressReportHtml(matching, reportType, brand()),
      'Save class progress reports',
    );
  };

  const current = studentReport ? printableStudent(studentReport) : null;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.background, schoolColorWithAlpha(colors.primary, isDark ? 0.18 : 0.06)]}
        style={StyleSheet.absoluteFill}
      />
      <AdminHeader title="Progress Reports" showBackButton />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <Animated.View entering={FadeIn.duration(240)} style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name="ribbon-outline" size={22} color="#fff" />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>PREMIUM TWO-UP REPORTS</Text>
              <Text style={styles.title}>Print-ready progress reports</Text>
              <Text style={styles.subtitle}>
                Two polished report cards on every A4 page, using the school profile and marks already recorded.
              </Text>
            </View>
            <View style={styles.brandChip}>
              {schoolLogoUrl ? <Image source={{ uri: schoolLogoUrl }} style={styles.brandLogo} /> : <View style={styles.brandFallback}><Text style={styles.brandFallbackText}>{schoolName.slice(0, 2).toUpperCase()}</Text></View>}
              <Text style={styles.brandName} numberOfLines={2}>{schoolName}</Text>
            </View>
          </Animated.View>

          <View style={styles.typeCard}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionStep}>1</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Choose the progress report type</Text>
                <Text style={styles.sectionHint}>These are the only assessment formats used in the report.</Text>
              </View>
            </View>
            <View style={[styles.typeOptions, !wide && styles.stack]}>
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
                    style={[styles.typeOption, active && styles.typeOptionActive]}
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

          <View style={styles.scopeBar}>
            <Text style={styles.scopeLabel}>PRINT COVERAGE</Text>
            <View style={styles.scopeToggle}>
              {([
                ['class', 'Whole class', 'people-outline'],
                ['student', 'Single student', 'person-outline'],
              ] as [ReportScope, string, keyof typeof Ionicons.glyphMap][]).map(([value, label, icon]) => {
                const active = scope === value;
                return (
                  <Pressable key={value} onPress={() => setScope(value)} style={[styles.scopeOption, active && styles.scopeOptionActive]}>
                    <Ionicons name={icon} size={16} color={active ? '#fff' : colors.textSecondary} />
                    <Text style={[styles.scopeText, active && styles.scopeTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {scope === 'student' ? (
            <View style={styles.filterCard}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionStep}>2</Text>
                <View><Text style={styles.sectionTitle}>Find a student</Text><Text style={styles.sectionHint}>Admission number, roll number or full name</Text></View>
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
                <TouchableOpacity style={styles.primaryButton} onPress={searchStudent} disabled={studentLoading}>
                  {studentLoading ? <LogoLoader size={23} color="#fff" /> : <><Ionicons name="search" size={18} color="#fff" /><Text style={styles.primaryButtonText}>Find</Text></>}
                </TouchableOpacity>
              </View>
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
                <Text style={styles.sectionStep}>2</Text>
                <View><Text style={styles.sectionTitle}>Select the class assessment</Text><Text style={styles.sectionHint}>These filters choose the students and recorded marks to print.</Text></View>
              </View>
              <ChipSelector label="Academic year" items={years.map((year) => ({ id: year.id, label: year.code }))} selectedId={selectedYearId} onSelect={loadYear} styles={styles} />
              <ChipSelector label="Class" items={classes.map((item) => ({ id: item.class_id, label: item.class_name }))} selectedId={selectedClassId} onSelect={(id) => { setSelectedClassId(id); setSelectedSectionId(''); setBatchReports([]); }} styles={styles} />
              <ChipSelector label="Section" items={sections.map((item) => ({ id: item.section_id, label: item.section_name }))} selectedId={selectedSectionId} onSelect={(id) => { setSelectedSectionId(id); setBatchReports([]); }} styles={styles} />
              <ChipSelector label="Assessment" items={exams.map((exam) => ({ id: exam.id, label: exam.name }))} selectedId={selectedExamId} onSelect={(id) => { setSelectedExamId(id); setBatchReports([]); }} styles={styles} />
              <TouchableOpacity style={[styles.primaryButton, styles.prepareButton]} onPress={loadClassReports} disabled={batchLoading}>
                {batchLoading ? <><LogoLoader size={23} color="#fff" /><Text style={styles.primaryButtonText}>Preparing {batchProgress.completed}/{batchProgress.total}</Text></> : <><Ionicons name="sparkles-outline" size={18} color="#fff" /><Text style={styles.primaryButtonText}>Prepare class reports</Text></>}
              </TouchableOpacity>
            </View>
          )}

          {scope === 'student' && current ? (
            <ReportPreview report={current} reportType={reportType} schoolName={schoolName} schoolLogoUrl={schoolLogoUrl} styles={styles} />
          ) : scope === 'class' && batchReports.length ? (
            <View style={styles.readyCard}>
              <View style={styles.readyIcon}><Ionicons name="checkmark" size={26} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.readyTitle}>{batchReports.length} reports ready</Text>
                <Text style={styles.readyHint}>They will print two per A4 page in roll-number order.</Text>
              </View>
              <View style={styles.pageCount}><Text style={styles.pageCountValue}>{Math.ceil(batchReports.length / 2)}</Text><Text style={styles.pageCountLabel}>PAGES</Text></View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="documents-outline" size={34} color={colors.primary} />
              <Text style={styles.emptyTitle}>Your premium report preview will appear here</Text>
              <Text style={styles.emptyText}>Choose a report type, select the recorded assessment, then prepare the report.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {((scope === 'student' && studentReport) || (scope === 'class' && batchReports.length > 0)) && (
        <Animated.View entering={FadeInDown.duration(220)} style={styles.printBar}>
          <View><Text style={styles.printBarTitle}>Two reports per A4 page</Text><Text style={styles.printBarHint}>{reportType === 'direct' ? 'Direct assessment' : 'Component-based assessment'} format</Text></View>
          <TouchableOpacity style={styles.printButton} onPress={scope === 'student' ? printStudent : printClass}>
            <Feather name="printer" size={18} color="#fff" />
            <Text style={styles.printButtonText}>Print / Save PDF</Text>
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
  return (
    <View style={styles.chipGroup}>
      <Text style={styles.chipLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {items.length ? items.map((item) => {
          const active = item.id === selectedId;
          return (
            <Pressable key={item.id} onPress={() => onSelect(item.id)} style={[styles.chip, active && styles.chipActive]}>
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
  styles,
}: {
  report: ProgressReportStudent;
  reportType: ProgressReportType;
  schoolName: string;
  schoolLogoUrl: string;
  styles: ReturnType<typeof createStyles>;
}) {
  const summary = progressReportSummary(report, reportType);
  return (
    <View style={styles.previewCard}>
      <View style={styles.previewAccent} />
      <View style={styles.previewHeader}>
        {schoolLogoUrl ? <Image source={{ uri: schoolLogoUrl }} style={styles.previewLogo} /> : <View style={styles.previewLogoFallback}><Text style={styles.previewLogoFallbackText}>{schoolName.slice(0, 2).toUpperCase()}</Text></View>}
        <View style={{ flex: 1 }}><Text style={styles.previewSchool}>{schoolName}</Text><Text style={styles.previewKind}>{reportType === 'direct' ? 'DIRECT ASSESSMENT' : 'COMPONENT-BASED ASSESSMENT'} PROGRESS REPORT</Text></View>
      </View>
      <View style={styles.previewStudentRow}>
        <View><Text style={styles.previewLabel}>STUDENT</Text><Text style={styles.previewValue}>{report.name}</Text></View>
        <View><Text style={styles.previewLabel}>CLASS & SECTION</Text><Text style={styles.previewValue}>{report.classLabel}</Text></View>
        <View><Text style={styles.previewLabel}>ROLL NO.</Text><Text style={styles.previewValue}>{report.rollNo}</Text></View>
      </View>
      <View style={styles.previewTableHeader}>
        <Text style={[styles.previewTh, { flex: 2 }]}>Subject</Text>
        {reportType === 'component' ? <><Text style={styles.previewTh}>Part.</Text><Text style={styles.previewTh}>Written</Text><Text style={styles.previewTh}>Project</Text><Text style={styles.previewTh}>Slip</Text><Text style={styles.previewTh}>Total</Text></> : <><Text style={styles.previewTh}>Max.</Text><Text style={styles.previewTh}>Marks</Text><Text style={styles.previewTh}>Grade</Text><Text style={[styles.previewTh, { flex: 2 }]}>Teacher remarks</Text></>}
      </View>
      {summary.subjects.slice(0, 10).map((subject, index) => (
        <View key={`${subject.subject}-${index}`} style={[styles.previewTableRow, index % 2 === 1 && styles.previewTableRowAlt]}>
          <Text style={[styles.previewTd, styles.previewSubject]}>{subject.subject}</Text>
          {reportType === 'component' ? <>
            <Text style={styles.previewTd}>{subject.participationMarks ?? '-'}</Text><Text style={styles.previewTd}>{subject.writtenWorkMarks ?? '-'}</Text><Text style={styles.previewTd}>{subject.projectWorkMarks ?? '-'}</Text><Text style={styles.previewTd}>{subject.slipTestMarks ?? '-'}</Text><Text style={[styles.previewTd, styles.previewTotal]}>{subject.obtained ?? '-'}</Text>
          </> : <>
            <Text style={styles.previewTd}>{subject.consolidatedMaxMarks || subject.maxMarks}</Text><Text style={[styles.previewTd, styles.previewTotal]}>{subject.isAbsent ? 'AB' : subject.consolidatedMarksObtained ?? subject.obtained ?? '-'}</Text><Text style={styles.previewTd}>{subject.grade}</Text><Text style={[styles.previewTd, { flex: 2 }]}>{subject.remarks}</Text>
          </>}
        </View>
      ))}
      {!summary.subjects.length && <View style={styles.previewEmpty}><Text style={styles.previewEmptyText}>No {reportType === 'direct' ? 'direct' : 'component-based'} marks in {report.examName}.</Text></View>}
      <View style={styles.previewSummary}>
        {[['Result', summary.result], ['Percentage', summary.totalMax ? `${summary.percentage.toFixed(1)}%` : '-'], ['Rank', report.classRank ? `#${report.classRank}` : '-'], ['Attendance', report.attendance]].map(([label, value]) => <View key={label}><Text style={styles.previewLabel}>{label}</Text><Text style={styles.previewSummaryValue}>{value}</Text></View>)}
      </View>
    </View>
  );
}

const createStyles = (colors: (typeof schoolTheme.light)['colors'], dark: boolean) => StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 130 },
  content: { width: '100%', maxWidth: 1240, alignSelf: 'center', padding: 20, gap: 16 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 22, backgroundColor: dark ? colors.surface : '#fff', borderWidth: 1, borderColor: colors.border },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  heroCopy: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, color: colors.secondary, marginBottom: 3 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: '900', color: colors.textStrong },
  subtitle: { marginTop: 4, maxWidth: 720, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  brandChip: { maxWidth: 230, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9, borderRadius: 14, backgroundColor: schoolColorWithAlpha(colors.primary, 0.07) },
  brandLogo: { width: 34, height: 34, resizeMode: 'contain' },
  brandFallback: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  brandFallbackText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  brandName: { flex: 1, fontSize: 11, lineHeight: 15, fontWeight: '800', color: colors.textStrong },
  typeCard: { padding: 18, borderRadius: 22, backgroundColor: dark ? colors.surface : '#fff', borderWidth: 1, borderColor: colors.border },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 14 },
  sectionStep: { width: 30, height: 30, lineHeight: 30, textAlign: 'center', borderRadius: 10, overflow: 'hidden', backgroundColor: colors.primary, color: '#fff', fontWeight: '900' },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: colors.textStrong },
  sectionHint: { marginTop: 2, fontSize: 12, color: colors.textSecondary },
  typeOptions: { flexDirection: 'row', gap: 12 },
  stack: { flexDirection: 'column' },
  typeOption: { flex: 1, minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 17, borderWidth: 1.5, borderColor: colors.border, backgroundColor: dark ? colors.card : '#fbfcfe' },
  typeOptionActive: { borderColor: colors.primary, backgroundColor: schoolColorWithAlpha(colors.primary, 0.08) },
  optionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: schoolColorWithAlpha(colors.primary, 0.1) },
  optionIconActive: { backgroundColor: colors.primary },
  optionTitle: { fontSize: 15, fontWeight: '900', color: colors.textStrong },
  optionTitleActive: { color: colors.primary },
  optionSubtitle: { marginTop: 4, fontSize: 11, lineHeight: 16, color: colors.textSecondary },
  scopeBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 10, borderRadius: 17, backgroundColor: dark ? colors.surface : '#fff', borderWidth: 1, borderColor: colors.border },
  scopeLabel: { marginLeft: 7, fontSize: 10, fontWeight: '900', letterSpacing: 1, color: colors.textMuted },
  scopeToggle: { flexDirection: 'row', gap: 5, padding: 4, borderRadius: 13, backgroundColor: schoolColorWithAlpha(colors.primary, 0.07) },
  scopeOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 },
  scopeOptionActive: { backgroundColor: colors.primary },
  scopeText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  scopeTextActive: { color: '#fff' },
  filterCard: { padding: 18, borderRadius: 22, backgroundColor: dark ? colors.surface : '#fff', borderWidth: 1, borderColor: colors.border },
  searchRow: { flexDirection: 'row', gap: 10 },
  searchInput: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: dark ? colors.card : '#f8fafc' },
  textInput: { flex: 1, minHeight: 48, color: colors.textPrimary, fontSize: 14 },
  primaryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 19, borderRadius: 14, backgroundColor: colors.primary },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  prepareButton: { alignSelf: 'flex-start', marginTop: 10 },
  chipGroup: { marginTop: 11 },
  chipLabel: { marginBottom: 7, fontSize: 10, fontWeight: '900', letterSpacing: .7, color: colors.textMuted, textTransform: 'uppercase' },
  chips: { gap: 7, paddingRight: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: dark ? colors.card : '#f8fafc' },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },
  noOptions: { paddingVertical: 8, fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
  emptyState: { alignItems: 'center', padding: 42, borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: schoolColorWithAlpha(colors.primary, .35), backgroundColor: schoolColorWithAlpha(colors.primary, .035) },
  emptyTitle: { marginTop: 12, fontSize: 16, fontWeight: '900', color: colors.textStrong, textAlign: 'center' },
  emptyText: { marginTop: 5, maxWidth: 520, fontSize: 12, lineHeight: 18, color: colors.textSecondary, textAlign: 'center' },
  readyCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 18, borderRadius: 20, backgroundColor: schoolColorWithAlpha(colors.success, .1), borderWidth: 1, borderColor: schoolColorWithAlpha(colors.success, .3) },
  readyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.success },
  readyTitle: { fontSize: 16, fontWeight: '900', color: colors.textStrong },
  readyHint: { marginTop: 3, fontSize: 12, color: colors.textSecondary },
  pageCount: { alignItems: 'center', minWidth: 66, padding: 9, borderRadius: 12, backgroundColor: dark ? colors.card : '#fff' },
  pageCountValue: { fontSize: 19, fontWeight: '900', color: colors.primary },
  pageCountLabel: { fontSize: 8, fontWeight: '900', letterSpacing: .8, color: colors.textMuted },
  previewCard: { overflow: 'hidden', padding: 17, borderRadius: 20, backgroundColor: dark ? colors.surface : '#fff', borderWidth: 1, borderColor: colors.border },
  previewAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: colors.secondary },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  previewLogo: { width: 50, height: 50, resizeMode: 'contain' },
  previewLogoFallback: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  previewLogoFallbackText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  previewSchool: { fontSize: 20, fontWeight: '900', color: colors.primary, textTransform: 'uppercase' },
  previewKind: { marginTop: 3, fontSize: 10, fontWeight: '900', letterSpacing: .7, color: colors.secondary },
  previewStudentRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 15, paddingVertical: 12 },
  previewLabel: { fontSize: 8, fontWeight: '900', letterSpacing: .6, color: colors.textMuted, textTransform: 'uppercase' },
  previewValue: { marginTop: 2, fontSize: 12, fontWeight: '800', color: colors.textStrong },
  previewTableHeader: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 8, backgroundColor: colors.primary, borderTopLeftRadius: 9, borderTopRightRadius: 9 },
  previewTh: { flex: 1, color: '#fff', fontSize: 9, fontWeight: '900', textAlign: 'center' },
  previewTableRow: { flexDirection: 'row', minHeight: 35, alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  previewTableRowAlt: { backgroundColor: schoolColorWithAlpha(colors.primary, .035) },
  previewTd: { flex: 1, fontSize: 10, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  previewSubject: { flex: 2, textAlign: 'left' },
  previewTotal: { fontWeight: '900', color: colors.primary },
  previewEmpty: { padding: 28, alignItems: 'center', borderWidth: 1, borderTopWidth: 0, borderColor: colors.border },
  previewEmptyText: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
  previewSummary: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 13, padding: 12, borderRadius: 12, backgroundColor: schoolColorWithAlpha(colors.primary, .06) },
  previewSummaryValue: { marginTop: 3, fontSize: 13, fontWeight: '900', color: colors.textStrong },
  printBar: { position: 'absolute', left: 18, right: 18, bottom: 16, maxWidth: 760, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: 13, paddingLeft: 17, borderRadius: 18, backgroundColor: dark ? '#172033' : '#fff', borderWidth: 1, borderColor: colors.border, shadowColor: '#0f172a', shadowOpacity: .16, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  printBarTitle: { fontSize: 13, fontWeight: '900', color: dark ? '#fff' : colors.textStrong },
  printBarHint: { marginTop: 2, fontSize: 10, color: dark ? '#cbd5e1' : colors.textSecondary },
  printButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 17, paddingVertical: 12, borderRadius: 13, backgroundColor: colors.primary },
  printButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
});
