import React, { useMemo, useState } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Pressable,
  useWindowDimensions,
  Image,
} from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AdminHeader from '../../src/components/AdminHeader';
import { ADMIN_THEME } from '../../src/constants/adminTheme';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { StudentService } from '../../src/services/studentService';
import {
  AcademicYear,
  ClassSection,
  ClassService,
} from '../../src/services/classService';
import { Exam, ResultService } from '../../src/services/commonServices';
import {
  SCHOOL_CONFIG,
  schoolColorWithAlpha,
  schoolTheme,
} from '@/src/constants/schoolConfig';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';

// --- Types ---
interface SubjectMark {
  subject: string;
  maxMarks: number;
  passingMarks?: number;
  obtained: number | null;
  grade: string;
  is_absent?: boolean;
  hasMarks?: boolean;
}

interface ExamResult {
  exam_id: string;
  exam_name: string;
  exam_type: string;
  subjects: SubjectMark[];
}

interface StudentResult {
  id: string;
  admissionNo: string;
  name: string;
  fatherName: string;
  motherName: string;
  class: string;
  rollNo: string;
  dob: string;
  academicYear: string;
  attendance: string;
  attendanceDetail: string;
  exams: ExamResult[];
  selectedExamIndex: number;
  marks: SubjectMark[];
  totalMax: number;
  totalObtained: number;
  percentage: number;
  result: 'PASS' | 'FAIL' | 'PENDING';
  division: string;
  gradedSubjects: number;
  pendingSubjects: number;
}

type AssessmentMode = 'combined' | 'exam-only';
type ReportScope = 'student' | 'class';

interface InternalParameter {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  enabled: boolean;
  weight: number;
  score: number | null;
  auto?: boolean;
}

interface ReportCalculation {
  mode: AssessmentMode;
  internalAllocation: number;
  examAllocation: number;
  totalWeight: number;
  internalPerformance: number;
  internalMarks: number;
  examContribution: number;
  finalPercentage: number;
  missingParameters: number;
  result: 'PASS' | 'FAIL' | 'PENDING';
}

interface BatchReportItem {
  result: StudentResult;
  calculation: ReportCalculation;
  parameters: InternalParameter[];
}

const INTERNAL_PRESETS: Record<
  'balanced' | 'academic' | 'holistic',
  Record<string, number>
> = {
  balanced: {
    tests: 25,
    assignments: 15,
    projects: 15,
    practical: 15,
    notebook: 10,
    attendance: 10,
    participation: 5,
    discipline: 5,
  },
  academic: {
    tests: 35,
    assignments: 20,
    projects: 15,
    practical: 15,
    notebook: 10,
    attendance: 5,
    participation: 0,
    discipline: 0,
  },
  holistic: {
    tests: 15,
    assignments: 10,
    projects: 20,
    practical: 15,
    notebook: 10,
    attendance: 10,
    participation: 10,
    discipline: 10,
  },
};

const DEFAULT_INTERNAL_PARAMETERS: InternalParameter[] = [
  {
    key: 'tests',
    label: 'Unit tests',
    description: 'Periodic tests and quizzes',
    icon: 'school-outline',
    enabled: true,
    weight: 25,
    score: null,
  },
  {
    key: 'assignments',
    label: 'Assignments',
    description: 'Homework and written work',
    icon: 'document-text-outline',
    enabled: true,
    weight: 15,
    score: null,
  },
  {
    key: 'projects',
    label: 'Projects',
    description: 'Individual and group projects',
    icon: 'bulb-outline',
    enabled: true,
    weight: 15,
    score: null,
  },
  {
    key: 'practical',
    label: 'Practical / Lab',
    description: 'Experiments and applied work',
    icon: 'flask-outline',
    enabled: true,
    weight: 15,
    score: null,
  },
  {
    key: 'notebook',
    label: 'Notebook',
    description: 'Completion and presentation',
    icon: 'book-outline',
    enabled: true,
    weight: 10,
    score: null,
  },
  {
    key: 'attendance',
    label: 'Attendance',
    description: 'Auto-filled from attendance',
    icon: 'calendar-outline',
    enabled: true,
    weight: 10,
    score: null,
    auto: true,
  },
  {
    key: 'participation',
    label: 'Class participation',
    description: 'Engagement and initiative',
    icon: 'hand-left-outline',
    enabled: true,
    weight: 5,
    score: null,
  },
  {
    key: 'discipline',
    label: 'Discipline',
    description: 'Conduct and punctuality',
    icon: 'shield-checkmark-outline',
    enabled: true,
    weight: 5,
    score: null,
  },
];

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function roundTo(value: number, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function calculateReport(
  resultData: StudentResult | null,
  assessmentMode: AssessmentMode,
  internalAllocation: number,
  passPercentage: number,
  parameters: InternalParameter[],
): ReportCalculation {
  const selected = parameters.filter(
    (parameter) => parameter.enabled && parameter.weight > 0,
  );
  const missingParameters = selected.filter(
    (parameter) => parameter.score == null,
  ).length;
  const totalWeight = selected.reduce(
    (sum, parameter) => sum + parameter.weight,
    0,
  );
  const internalPerformance =
    totalWeight > 0
      ? selected.reduce(
          (sum, parameter) =>
            sum + clamp(parameter.score ?? 0) * parameter.weight,
          0,
        ) / totalWeight
      : 0;
  const activeInternalAllocation =
    assessmentMode === 'combined' ? internalAllocation : 0;
  const examAllocation = 100 - activeInternalAllocation;
  const internalMarks = (internalPerformance * activeInternalAllocation) / 100;
  const examContribution =
    ((resultData?.percentage || 0) * examAllocation) / 100;
  const finalPercentage = examContribution + internalMarks;
  let result: ReportCalculation['result'] = 'PENDING';
  const internalIsComplete =
    assessmentMode === 'exam-only' || missingParameters === 0;
  if (
    resultData &&
    resultData.gradedSubjects > 0 &&
    resultData.pendingSubjects === 0 &&
    internalIsComplete
  ) {
    result =
      resultData.result === 'FAIL' || finalPercentage < passPercentage
        ? 'FAIL'
        : 'PASS';
  }

  return {
    mode: assessmentMode,
    internalAllocation: activeInternalAllocation,
    examAllocation,
    totalWeight,
    internalPerformance: roundTo(internalPerformance),
    internalMarks: roundTo(internalMarks),
    examContribution: roundTo(examContribution),
    finalPercentage: roundTo(finalPercentage),
    missingParameters,
    result,
  };
}

function formatDob(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeFilePart(value: string): string {
  return String(value || 'report')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function subjectHasScore(m: SubjectMark): boolean {
  return Boolean(m.hasMarks) && !m.is_absent && m.obtained != null;
}

function formatObtained(m: SubjectMark): string {
  if (m.is_absent) return 'AB';
  if (!m.hasMarks || m.obtained == null) return '—';
  const n = Number(m.obtained);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function computeSummary(marks: SubjectMark[]) {
  let totalMax = 0;
  let totalObtained = 0;
  let hasFailed = false;
  let gradedSubjects = 0;
  let pendingSubjects = 0;

  marks.forEach((m) => {
    if (!m.hasMarks && !m.is_absent) {
      pendingSubjects += 1;
      return;
    }
    gradedSubjects += 1;
    totalMax += m.maxMarks;
    if (m.is_absent) {
      hasFailed = true;
      return;
    }
    const obtained = Number(m.obtained ?? 0);
    totalObtained += obtained;
    const passingMarks = m.passingMarks || Math.round(m.maxMarks * 0.35);
    if (obtained < passingMarks) hasFailed = true;
  });

  if (gradedSubjects === 0) {
    return {
      totalMax: marks.reduce((s, m) => s + m.maxMarks, 0),
      totalObtained: 0,
      percentage: 0,
      result: 'PENDING' as const,
      division: '—',
      gradedSubjects: 0,
      pendingSubjects: marks.length,
    };
  }

  const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
  const result: 'PASS' | 'FAIL' = hasFailed ? 'FAIL' : 'PASS';
  let division = '—';
  if (result === 'PASS') {
    if (percentage >= 75) division = 'Distinction';
    else if (percentage >= 60) division = 'First Class';
    else if (percentage >= 50) division = 'Second Class';
    else division = 'Third Class';
  }

  return {
    totalMax,
    totalObtained: parseFloat(totalObtained.toFixed(2)),
    percentage: parseFloat(percentage.toFixed(2)),
    result,
    division,
    gradedSubjects,
    pendingSubjects,
  };
}

function normalizeSubjects(raw: any[]): SubjectMark[] {
  return (raw || []).map((sm) => {
    const hasMarks =
      typeof sm.hasMarks === 'boolean'
        ? sm.hasMarks
        : sm.obtained != null || sm.is_absent === true;
    return {
      subject: sm.subject,
      maxMarks: Number(sm.maxMarks) || 0,
      passingMarks: Number(sm.passingMarks) || undefined,
      obtained: hasMarks && !sm.is_absent ? Number(sm.obtained) : null,
      grade: sm.grade || (sm.is_absent ? 'AB' : '—'),
      is_absent: Boolean(sm.is_absent),
      hasMarks,
    };
  });
}

// -------------------------------------------------------------------
// buildReportHTML — compact A4 letterhead for print / PDF
// -------------------------------------------------------------------
function buildReportHTML(
  resultData: StudentResult,
  schoolConfig: typeof SCHOOL_CONFIG,
  logoDataUri: string,
  calculation: ReportCalculation,
  parameters: InternalParameter[],
  passPercentage: number,
): string {
  const c = schoolTheme.light.colors;
  const ribbon = schoolConfig.theme;
  const examName =
    resultData.exams[resultData.selectedExamIndex]?.exam_name?.toUpperCase() ||
    'PROGRESS REPORT';
  const isPass = calculation.result === 'PASS';
  const isPending = calculation.result === 'PENDING';
  const badgeColor = isPending ? c.warning : isPass ? c.success : c.danger;
  const badgeBg = isPending
    ? schoolColorWithAlpha(c.warning, 0.16)
    : isPass
      ? schoolColorWithAlpha(c.success, 0.16)
      : schoolColorWithAlpha(c.danger, 0.14);

  const tableRows = resultData.marks
    .map((m, i) => {
      const scored = subjectHasScore(m);
      const passMark = m.passingMarks || Math.round(m.maxMarks * 0.35);
      const isFail = scored && Number(m.obtained) < passMark;
      const color = m.is_absent || isFail ? c.danger : c.textPrimary;
      const bg = i % 2 === 0 ? schoolColorWithAlpha(c.primary, 0.04) : '#fff';
      const examPercent =
        scored && m.maxMarks > 0 ? (Number(m.obtained) / m.maxMarks) * 100 : 0;
      const finalPercent =
        calculation.mode === 'combined'
          ? (examPercent * calculation.examAllocation) / 100 +
            calculation.internalMarks
          : examPercent;
      return `
      <tr style="background:${bg}">
        <td class="sub">${escapeHtml(m.subject)}</td>
        <td>${m.maxMarks}</td>
        <td style="color:${color};font-weight:${isFail || m.is_absent ? '700' : '600'}">${formatObtained(m)}</td>
        ${calculation.mode === 'combined' ? `<td>${calculation.internalMarks}/${calculation.internalAllocation}</td><td><strong>${scored ? `${roundTo(finalPercent, 1)}%` : '—'}</strong></td>` : ''}
        <td>${escapeHtml(m.grade || '—')}</td>
      </tr>`;
    })
    .join('');

  const contactLine = [
    schoolConfig.address,
    schoolConfig.contact ? `Ph: ${schoolConfig.contact}` : '',
    schoolConfig.email || '',
  ]
    .filter(Boolean)
    .join('  ·  ');
  const selectedParameters = parameters.filter(
    (parameter) => parameter.enabled && parameter.weight > 0,
  );
  const parameterLine = selectedParameters
    .map((parameter) => `${escapeHtml(parameter.label)} ${parameter.weight}%`)
    .join('  ·  ');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Progress Report - ${escapeHtml(resultData.name)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body {
      margin: 0; padding: 0;
      font-family: 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: ${c.textPrimary}; background: #fff;
      font-size: 11.5px; line-height: 1.35;
    }
    .sheet { position: relative; min-height: 100%; }
    .wm {
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      z-index: 0; pointer-events: none; opacity: 0.07;
    }
    .wm img { width: 340px; height: 340px; object-fit: contain; }
    .content { position: relative; z-index: 1; }

    .letterhead {
      display: flex; align-items: center; gap: 14px;
      padding: 12px 14px 10px;
      background: linear-gradient(135deg, ${ribbon.ribbonGradient[0]}, ${ribbon.ribbonGradient[1]} 55%, ${ribbon.ribbonGradient[2]});
      color: #fff; border-radius: 6px 6px 0 0;
    }
    .logo {
      width: 52px; height: 52px; border-radius: 50%;
      background: rgba(255,255,255,0.18);
      display: flex; align-items: center; justify-content: center;
      overflow: hidden; flex-shrink: 0;
    }
    .logo img { width: 42px; height: 42px; object-fit: contain; }
    .lh-text { flex: 1; text-align: center; }
    .school { font-size: 18px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase; }
    .tagline { font-size: 10px; color: ${ribbon.ribbonTagline}; margin-top: 2px; font-weight: 600; }
    .contact { font-size: 9.5px; color: rgba(255,255,255,0.9); margin-top: 4px; }

    .accent { height: 3px; background: ${ribbon.accent}; }

    .title-band {
      display: flex; justify-content: space-between; align-items: baseline;
      padding: 10px 4px 8px; border-bottom: 1.5px solid ${c.border};
      margin-bottom: 10px;
    }
    .exam-title {
      font-size: 13px; font-weight: 800; letter-spacing: 1.4px;
      color: ${c.primaryDark}; text-transform: uppercase;
    }
    .year { font-size: 11px; color: ${c.textSecondary}; font-weight: 600; }

    .info {
      display: grid; grid-template-columns: 1fr 1fr 1fr;
      gap: 6px 14px; padding: 10px 12px; margin-bottom: 12px;
      border: 1px solid ${c.border}; border-radius: 6px;
      background: ${schoolColorWithAlpha(c.primary, 0.03)};
    }
    .info .lab {
      font-size: 9px; font-weight: 700; letter-spacing: 0.6px;
      text-transform: uppercase; color: ${c.textMuted};
    }
    .info .val { font-size: 12px; font-weight: 700; color: ${c.textStrong}; margin-top: 1px; }
    .formula {
      padding: 8px 10px; margin: -2px 0 10px; border-radius: 5px;
      background: ${schoolColorWithAlpha(c.primary, 0.07)}; color: ${c.textSecondary};
      font-size: 9.5px; text-align: center;
    }
    .formula strong { color: ${c.primaryDark}; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    thead th {
      background: ${c.primaryDark}; color: #fff;
      padding: 7px 8px; font-size: 10.5px; font-weight: 700;
      text-align: center; letter-spacing: 0.3px;
    }
    thead th:first-child { text-align: left; border-radius: 4px 0 0 0; }
    thead th:last-child { border-radius: 0 4px 0 0; }
    td { padding: 6px 8px; text-align: center; font-size: 11.5px; border-bottom: 1px solid ${c.borderLight}; }
    td.sub { text-align: left; font-weight: 600; }

    .summary {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
      margin-bottom: 28px;
    }
    .stat {
      border: 1px solid ${c.border}; border-radius: 6px;
      padding: 8px 10px; text-align: center;
      background: #fff;
    }
    .stat .lab { font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${c.textMuted}; letter-spacing: 0.5px; }
    .stat .val { font-size: 14px; font-weight: 800; color: ${c.textStrong}; margin-top: 2px; }
    .badge {
      display: inline-block; background: ${badgeBg}; color: ${badgeColor};
      padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 800;
    }

    .sigs {
      display: flex; justify-content: space-between; gap: 16px;
      margin-top: 36px; padding: 0 6px;
    }
    .sig { width: 28%; text-align: center; }
    .sig-line { border-bottom: 1px solid ${c.textMuted}; height: 28px; margin-bottom: 6px; }
    .sig-lab { font-size: 10px; font-weight: 700; color: ${c.textSecondary}; text-transform: uppercase; letter-spacing: 0.4px; }

    .footnote {
      margin-top: 16px; text-align: center; font-size: 9px; color: ${c.textMuted};
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="wm"><img src="${logoDataUri}" alt="" /></div>
    <div class="content">
      <div class="letterhead">
        <div class="logo"><img src="${logoDataUri}" alt="logo" /></div>
        <div class="lh-text">
          <div class="school">${escapeHtml(schoolConfig.name)}</div>
          ${schoolConfig.tagline ? `<div class="tagline">${escapeHtml(schoolConfig.tagline)}</div>` : ''}
          <div class="contact">${escapeHtml(contactLine)}</div>
        </div>
        <div style="width:52px;flex-shrink:0"></div>
      </div>
      <div class="accent"></div>

      <div class="title-band">
        <div class="exam-title">${escapeHtml(examName)}</div>
        <div class="year">Academic Year ${escapeHtml(resultData.academicYear)}</div>
      </div>

      <div class="info">
        <div><div class="lab">Student Name</div><div class="val">${escapeHtml(resultData.name)}</div></div>
        <div><div class="lab">Class &amp; Section</div><div class="val">${escapeHtml(resultData.class)}</div></div>
        <div><div class="lab">Roll No</div><div class="val">${escapeHtml(resultData.rollNo)}</div></div>
        <div><div class="lab">Admission No</div><div class="val">${escapeHtml(resultData.admissionNo)}</div></div>
        <div><div class="lab">Father's Name</div><div class="val">${escapeHtml(resultData.fatherName)}</div></div>
        <div><div class="lab">Date of Birth</div><div class="val">${escapeHtml(resultData.dob)}</div></div>
        <div><div class="lab">Attendance</div><div class="val">${escapeHtml(resultData.attendance)}</div></div>
        <div><div class="lab">Mother / Guardian</div><div class="val">${escapeHtml(resultData.motherName)}</div></div>
        <div><div class="lab">Exam</div><div class="val">${escapeHtml(resultData.exams[resultData.selectedExamIndex]?.exam_name || '—')}</div></div>
      </div>

      ${calculation.mode === 'combined' ? `<div class="formula"><strong>Combined assessment:</strong> Exam ${calculation.examAllocation}% + Internal ${calculation.internalAllocation}% &nbsp;·&nbsp; Internal performance ${calculation.internalPerformance}% &nbsp;·&nbsp; Pass mark ${passPercentage}%<br/>${parameterLine}</div>` : ''}

      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>Max Marks</th>
            <th>Obtained</th>
            ${calculation.mode === 'combined' ? '<th>Internal</th><th>Final</th>' : ''}
            <th>Grade</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>

      <div class="summary">
        <div class="stat">
          <div class="lab">Exam Score</div>
          <div class="val">${resultData.percentage}%</div>
        </div>
        <div class="stat">
          <div class="lab">${calculation.mode === 'combined' ? 'Internal Marks' : 'Percentage'}</div>
          <div class="val">${calculation.mode === 'combined' ? `${calculation.internalMarks} / ${calculation.internalAllocation}` : `${resultData.percentage}%`}</div>
        </div>
        <div class="stat">
          <div class="lab">Result</div>
          <div class="val"><span class="badge">${escapeHtml(calculation.result)}</span></div>
        </div>
        <div class="stat">
          <div class="lab">Final Score</div>
          <div class="val">${calculation.finalPercentage}%</div>
        </div>
      </div>

      <div class="sigs">
        <div class="sig"><div class="sig-line"></div><div class="sig-lab">Class Teacher</div></div>
        <div class="sig"><div class="sig-line"></div><div class="sig-lab">Principal</div></div>
        <div class="sig"><div class="sig-line"></div><div class="sig-lab">Parent / Guardian</div></div>
      </div>
      <div class="footnote">Computer-generated progress report · ${escapeHtml(schoolConfig.name)}</div>
    </div>
  </div>
</body>
</html>`;
}

function buildBatchReportHTML(
  reports: BatchReportItem[],
  schoolConfig: typeof SCHOOL_CONFIG,
  logoDataUri: string,
  passPercentage: number,
): string {
  if (reports.length === 0) return '';
  const documents = reports.map((item) =>
    buildReportHTML(
      item.result,
      schoolConfig,
      logoDataUri,
      item.calculation,
      item.parameters,
      passPercentage,
    ),
  );
  const first = documents[0];
  const head = first.match(/<head>[\s\S]*?<\/head>/i)?.[0] || '<head></head>';
  const batchHead = head
    .replace('position: fixed; top: 50%;', 'position: absolute; top: 50%;')
    .replace(
      '</head>',
      `<style>
        .sheet { min-height: 277mm; page-break-after: always; break-after: page; overflow: hidden; }
        .sheet:last-child { page-break-after: auto; break-after: auto; }
      </style></head>`,
    );
  const pages = documents
    .map(
      (document) =>
        document.match(/<body>([\s\S]*?)<\/body>/i)?.[1]?.trim() || '',
    )
    .join('\n');

  return `<!DOCTYPE html><html>${batchHead}<body>${pages}</body></html>`;
}

async function getLogoDataUri(): Promise<string> {
  const { bundledAssetToBase64Uri } =
    await import('../../src/utils/toBase64Uri');
  return (
    (await bundledAssetToBase64Uri(
      require('../../assets/images/icon.png'),
      'image/png',
    )) ?? ''
  );
}

export default function ProgressReportGenerator() {
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 1080;
  const schoolColors = isDark
    ? schoolTheme.dark.colors
    : schoolTheme.light.colors;
  const styles = useMemo(
    () => getStyles(theme, schoolColors, isDark),
    [theme, schoolColors, isDark],
  );

  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultData, setResultData] = useState<StudentResult | null>(null);
  const [assessmentMode, setAssessmentMode] =
    useState<AssessmentMode>('combined');
  const [internalAllocation, setInternalAllocation] = useState(20);
  const [passPercentage, setPassPercentage] = useState(35);
  const [parameters, setParameters] = useState<InternalParameter[]>(
    DEFAULT_INTERNAL_PARAMETERS,
  );
  const [showParameters, setShowParameters] = useState(true);
  const [reportScope, setReportScope] = useState<ReportScope>('student');
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [availableExams, setAvailableExams] = useState<Exam[]>([]);
  const [selectedYearId, setSelectedYearId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [selectedBatchExamId, setSelectedBatchExamId] = useState('');
  const [openSelector, setOpenSelector] = useState<
    'year' | 'class' | 'section' | 'exam' | null
  >(null);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({
    completed: 0,
    total: 0,
  });
  const [batchReports, setBatchReports] = useState<BatchReportItem[]>([]);

  const availableClasses = useMemo(() => {
    const seen = new Set<string>();
    return classSections
      .filter((mapping) => {
        if (seen.has(mapping.class_id)) return false;
        seen.add(mapping.class_id);
        return true;
      })
      .map((mapping) => ({ id: mapping.class_id, label: mapping.class_name }));
  }, [classSections]);

  const availableSections = useMemo(
    () =>
      classSections
        .filter((mapping) => mapping.class_id === selectedClassId)
        .map((mapping) => ({
          id: mapping.section_id,
          label: mapping.section_name,
        })),
    [classSections, selectedClassId],
  );

  const calculation = useMemo<ReportCalculation>(() => {
    return calculateReport(
      resultData,
      assessmentMode,
      internalAllocation,
      passPercentage,
      parameters,
    );
  }, [
    assessmentMode,
    internalAllocation,
    parameters,
    passPercentage,
    resultData,
  ]);

  const updateParameter = (
    key: string,
    field: 'enabled' | 'weight' | 'score',
    value: boolean | number | null,
  ) => {
    setParameters((current) =>
      current.map((parameter) => {
        if (parameter.key !== key) return parameter;
        if (field === 'enabled') {
          return { ...parameter, enabled: Boolean(value) };
        }
        if (field === 'weight') {
          return { ...parameter, weight: clamp(Number(value)) };
        }
        return {
          ...parameter,
          score: value == null ? null : clamp(Number(value)),
        };
      }),
    );
  };

  const applyPreset = (preset: keyof typeof INTERNAL_PRESETS) => {
    const weights = INTERNAL_PRESETS[preset];
    setParameters((current) =>
      current.map((parameter) => ({
        ...parameter,
        enabled: (weights[parameter.key] || 0) > 0,
        weight: weights[parameter.key] || 0,
      })),
    );
  };

  const buildStudentResult = (
    studentMeta: {
      id: string;
      admissionNo: string;
      name: string;
      fatherName: string;
      motherName: string;
      classLabel: string;
      rollNo: string;
      dob: string;
    },
    resultsResponse: any,
    selectedIndex = 0,
  ): StudentResult => {
    const exams: ExamResult[] = (resultsResponse?.exams || []).map(
      (ex: any) => ({
        exam_id: ex.exam_id,
        exam_name: ex.exam_name,
        exam_type: ex.exam_type,
        subjects: normalizeSubjects(ex.subjects || []),
      }),
    );

    const attendanceData = resultsResponse?.attendance;
    const academicYear = resultsResponse?.academic_year || 'N/A';
    let attendanceStr = '—';
    let attendanceDetail = 'No attendance records';
    if (attendanceData && attendanceData.total > 0) {
      attendanceStr = `${attendanceData.percentage}%`;
      attendanceDetail = `${attendanceData.present + attendanceData.late}/${attendanceData.total} days`;
    }

    const selectedMarks =
      exams.length > 0 ? exams[selectedIndex]?.subjects || [] : [];
    const summary =
      selectedMarks.length > 0
        ? computeSummary(selectedMarks)
        : {
            totalMax: 0,
            totalObtained: 0,
            percentage: 0,
            result: 'PENDING' as const,
            division: '—',
            gradedSubjects: 0,
            pendingSubjects: 0,
          };

    return {
      id: studentMeta.id,
      admissionNo: studentMeta.admissionNo,
      name: studentMeta.name,
      fatherName: studentMeta.fatherName,
      motherName: studentMeta.motherName,
      class: studentMeta.classLabel,
      rollNo: studentMeta.rollNo,
      dob: studentMeta.dob,
      academicYear,
      attendance: attendanceStr,
      attendanceDetail,
      exams,
      selectedExamIndex: selectedIndex,
      marks: selectedMarks,
      ...summary,
    };
  };

  const mapStudentResult = (
    student: any,
    resultsResponse: any,
    selectedExamId?: string,
  ): StudentResult => {
    const profile = resultsResponse?.student;
    const currentEnrollment = student.current_enrollment;
    const fatherObj = student.parents?.find(
      (parent: any) =>
        String(parent.relation || parent.relationship || '').toLowerCase() ===
        'father',
    );
    const motherObj = student.parents?.find((parent: any) => {
      const relation = String(
        parent.relation || parent.relationship || '',
      ).toLowerCase();
      return relation === 'mother' || relation === 'guardian';
    });
    const fatherFromList = fatherObj
      ? [fatherObj.first_name, fatherObj.last_name].filter(Boolean).join(' ') ||
        fatherObj.display_name
      : '';
    const motherFromList = motherObj
      ? [motherObj.first_name, motherObj.last_name].filter(Boolean).join(' ') ||
        motherObj.display_name
      : '';
    const classLabel =
      profile?.class ||
      [
        currentEnrollment?.class_code || currentEnrollment?.class_name,
        currentEnrollment?.section_name,
      ]
        .filter(Boolean)
        .join(' ') ||
      'N/A';
    const examIndex = selectedExamId
      ? Math.max(
          0,
          (resultsResponse?.exams || []).findIndex(
            (exam: any) => exam.exam_id === selectedExamId,
          ),
        )
      : 0;

    return buildStudentResult(
      {
        id: student.id,
        admissionNo: profile?.admission_no || student.admission_no || '—',
        name:
          profile?.name ||
          student.display_name ||
          `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
          'Student',
        fatherName: profile?.father_name || fatherFromList || '—',
        motherName: profile?.mother_or_guardian_name || motherFromList || '—',
        classLabel,
        rollNo:
          profile?.roll_number ||
          currentEnrollment?.roll_number?.toString() ||
          '—',
        dob: formatDob(profile?.dob || student.dob),
      },
      resultsResponse,
      examIndex,
    );
  };

  const loadYearOptions = async (academicYearId: string) => {
    setFiltersLoading(true);
    setSelectedYearId(academicYearId);
    setSelectedClassId('');
    setSelectedSectionId('');
    setSelectedBatchExamId('');
    setBatchReports([]);
    try {
      const [mappings, exams] = await Promise.all([
        ClassService.getClassSections(academicYearId),
        ResultService.getExams({ academic_year_id: academicYearId }),
      ]);
      setClassSections(mappings);
      setAvailableExams(exams.filter((exam) => exam.status !== 'cancelled'));
    } catch {
      alertCompat('Unable to load filters', 'Please refresh and try again.');
      setClassSections([]);
      setAvailableExams([]);
    } finally {
      setFiltersLoading(false);
    }
  };

  const handleScopeChange = async (scope: ReportScope) => {
    setReportScope(scope);
    setOpenSelector(null);
    if (scope === 'student') return;

    setAssessmentMode('exam-only');
    if (academicYears.length > 0) return;
    setFiltersLoading(true);
    try {
      const [years, currentYear] = await Promise.all([
        ClassService.getAcademicYears(),
        ClassService.getCurrentAcademicYear().catch(() => null),
      ]);
      setAcademicYears(years);
      const initialYear = currentYear?.id || years[0]?.id || '';
      if (initialYear) await loadYearOptions(initialYear);
    } catch {
      alertCompat(
        'Unable to load academic structure',
        'Check that academic years, classes, and sections are configured.',
      );
    } finally {
      setFiltersLoading(false);
    }
  };

  const handleLoadClass = async () => {
    if (
      !selectedYearId ||
      !selectedClassId ||
      !selectedSectionId ||
      !selectedBatchExamId
    ) {
      alertCompat(
        'Complete the selection',
        'Select academic year, class, section, and exam.',
      );
      return;
    }

    setBatchLoading(true);
    setBatchReports([]);
    setBatchProgress({ completed: 0, total: 0 });
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
      if (students.length === 0) {
        alertCompat(
          'No students found',
          'This class and section has no students.',
        );
        return;
      }

      setBatchProgress({ completed: 0, total: students.length });
      const loaded: BatchReportItem[] = [];
      const selectedExam = availableExams.find(
        (exam) => exam.id === selectedBatchExamId,
      );
      const chunkSize = 6;
      for (let start = 0; start < students.length; start += chunkSize) {
        const chunk = students.slice(start, start + chunkSize);
        const chunkReports = await Promise.all(
          chunk.map(async (student) => {
            const response = await StudentService.getResults(
              student.id,
              selectedYearId,
            ).catch(() => null);
            let result = mapStudentResult(
              student,
              response,
              selectedBatchExamId,
            );
            const selectedIndex = result.exams.findIndex(
              (exam) => exam.exam_id === selectedBatchExamId,
            );
            if (selectedIndex < 0) {
              result = {
                ...result,
                exams: [
                  {
                    exam_id: selectedBatchExamId,
                    exam_name: selectedExam?.name || 'Selected exam',
                    exam_type: selectedExam?.exam_type || 'exam',
                    subjects: [],
                  },
                ],
                selectedExamIndex: 0,
                marks: [],
                totalMax: 0,
                totalObtained: 0,
                percentage: 0,
                result: 'PENDING',
                division: '—',
                gradedSubjects: 0,
                pendingSubjects: 0,
              };
            }
            const studentParameters = parameters.map((parameter) => {
              if (parameter.key !== 'attendance') return parameter;
              const attendanceScore = Number.parseFloat(result.attendance);
              return {
                ...parameter,
                score: Number.isFinite(attendanceScore)
                  ? clamp(attendanceScore)
                  : null,
              };
            });
            return {
              result,
              parameters: studentParameters,
              calculation: calculateReport(
                result,
                assessmentMode,
                internalAllocation,
                passPercentage,
                studentParameters,
              ),
            };
          }),
        );
        loaded.push(...chunkReports);
        setBatchProgress({
          completed: Math.min(start + chunk.length, students.length),
          total: students.length,
        });
      }
      setBatchReports(loaded);
    } catch (error: any) {
      alertCompat(
        'Class reports unavailable',
        error?.message || 'Could not load progress reports for this class.',
      );
    } finally {
      setBatchLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!studentId.trim()) {
      alertCompat(
        'Error',
        'Please enter Admission No, Roll No, or student name',
      );
      return;
    }
    setLoading(true);
    setResultData(null);
    try {
      let student: any = null;
      const searchResults = await StudentService.search(studentId, 5, {
        lifecycle: 'all',
      });
      if (searchResults && searchResults.length > 0) {
        const exactMatch = searchResults.find(
          (s: any) =>
            String(s.admission_no || '').toLowerCase() ===
            studentId.trim().toLowerCase(),
        );
        student = exactMatch || searchResults[0];
      }

      if (!student) {
        try {
          student = await StudentService.getById(studentId);
        } catch {
          // not found by ID
        }
      }
      if (!student) {
        alertCompat('Error', 'Student not found');
        return;
      }

      const resultsResponse = await StudentService.getResults(student.id).catch(
        () => null,
      );
      const data = mapStudentResult(student, resultsResponse);

      const attendanceScore = Number.parseFloat(data.attendance);
      if (Number.isFinite(attendanceScore)) {
        setParameters((current) =>
          current.map((parameter) =>
            parameter.key === 'attendance'
              ? { ...parameter, score: clamp(attendanceScore) }
              : parameter,
          ),
        );
      }
      setResultData(data);
    } catch {
      alertCompat('Error', 'Student not found or error fetching data.');
    } finally {
      setLoading(false);
    }
  };

  const selectExam = (index: number) => {
    if (!resultData || !resultData.exams[index]) return;
    const selectedMarks = resultData.exams[index].subjects;
    const summary =
      selectedMarks.length > 0
        ? computeSummary(selectedMarks)
        : {
            totalMax: 0,
            totalObtained: 0,
            percentage: 0,
            result: 'PENDING' as const,
            division: '—',
            gradedSubjects: 0,
            pendingSubjects: 0,
          };
    setResultData({
      ...resultData,
      selectedExamIndex: index,
      marks: selectedMarks,
      ...summary,
    });
  };

  const handlePrint = async () => {
    if (!resultData) return;
    if (resultData.exams.length === 0 || resultData.marks.length === 0) {
      alertCompat(
        'Nothing to print',
        'No exam marks available for this student.',
      );
      return;
    }
    if (assessmentMode === 'combined' && calculation.missingParameters > 0) {
      alertCompat(
        'Internal marks incomplete',
        `Enter scores for ${calculation.missingParameters} selected internal parameter${calculation.missingParameters === 1 ? '' : 's'} before printing.`,
      );
      return;
    }
    try {
      const logoDataUri = await getLogoDataUri();
      const html = buildReportHTML(
        resultData,
        SCHOOL_CONFIG,
        logoDataUri,
        calculation,
        parameters,
        passPercentage,
      );

      if (Platform.OS === 'web') {
        const printWindow = window.open('', '_blank', 'width=900,height=1200');
        if (!printWindow) {
          alertCompat(
            'Print Error',
            'Popup blocked. Please allow popups for this site.',
          );
          return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
        }, 400);
        printWindow.addEventListener('afterprint', () => {
          try {
            printWindow.close();
          } catch {
            /* ignore */
          }
        });
      } else {
        const Print = await import('expo-print');
        await Print.printAsync({ html });
      }
    } catch (err: any) {
      alertCompat('Print Error', err?.message || 'Could not generate PDF.');
    }
  };

  const getBatchFileBase = () => {
    const year = academicYears.find((item) => item.id === selectedYearId)?.code;
    const mapping = classSections.find(
      (item) =>
        item.class_id === selectedClassId &&
        item.section_id === selectedSectionId,
    );
    const exam = availableExams.find(
      (item) => item.id === selectedBatchExamId,
    )?.name;
    return [year, mapping?.class_name, mapping?.section_name, exam]
      .filter(Boolean)
      .map((value) => safeFilePart(String(value)))
      .join('_');
  };

  const handleBatchPdf = async () => {
    if (batchReports.length === 0) {
      alertCompat(
        'Load the class first',
        'Prepare the class reports before exporting.',
      );
      return;
    }
    try {
      const logoDataUri = await getLogoDataUri();
      const html = buildBatchReportHTML(
        batchReports,
        SCHOOL_CONFIG,
        logoDataUri,
        passPercentage,
      );
      if (Platform.OS === 'web') {
        const printWindow = window.open('', '_blank', 'width=1000,height=1200');
        if (!printWindow) {
          alertCompat(
            'PDF window blocked',
            'Allow popups for this site, then try again.',
          );
          return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
        }, 500);
      } else {
        const Print = await import('expo-print');
        const Sharing = await import('expo-sharing');
        const file = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save class progress reports',
        });
      }
    } catch (error: any) {
      alertCompat(
        'PDF export failed',
        error?.message || 'Could not create the class PDF.',
      );
    }
  };

  const handleBatchExcel = async () => {
    if (batchReports.length === 0) {
      alertCompat(
        'Load the class first',
        'Prepare the class reports before exporting.',
      );
      return;
    }
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const mapping = classSections.find(
        (item) =>
          item.class_id === selectedClassId &&
          item.section_id === selectedSectionId,
      );
      const examName =
        availableExams.find((item) => item.id === selectedBatchExamId)?.name ||
        'Exam';
      const yearName =
        academicYears.find((item) => item.id === selectedYearId)?.code ||
        'Academic year';
      const classLabel = [mapping?.class_name, mapping?.section_name]
        .filter(Boolean)
        .join(' - ');
      const summaryRows: any[][] = [
        [`${SCHOOL_CONFIG.name} - Class Progress Report`],
        [`${yearName} | ${classLabel} | ${examName}`],
        [`Generated ${new Date().toLocaleString()}`],
        [],
        [
          'S.No',
          'Admission No',
          'Roll No',
          'Student Name',
          'Class & Section',
          'Exam',
          'Attendance',
          'Exam Score',
          'Exam Weight',
          'Exam Contribution',
          'Internal Performance',
          'Internal Allocation',
          'Internal Marks',
          'Final Score',
          'Final Result',
          'Graded Subjects',
          'Pending Subjects',
          'Exam Result',
        ],
      ];
      batchReports.forEach((item, index) => {
        const { result, calculation: itemCalculation } = item;
        summaryRows.push([
          index + 1,
          result.admissionNo,
          result.rollNo,
          result.name,
          result.class,
          result.exams[result.selectedExamIndex]?.exam_name || examName,
          Number.parseFloat(result.attendance) / 100 || 0,
          result.percentage / 100,
          itemCalculation.examAllocation / 100,
          itemCalculation.examContribution / 100,
          itemCalculation.internalPerformance / 100,
          itemCalculation.internalAllocation / 100,
          itemCalculation.internalMarks / 100,
          itemCalculation.finalPercentage / 100,
          itemCalculation.result,
          result.gradedSubjects,
          result.pendingSubjects,
          result.result,
        ]);
      });
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      summarySheet.T1 = { t: 's', v: 'Pass threshold' };
      summarySheet.T2 = { t: 'n', v: passPercentage / 100, z: '0.0%' };
      const summaryLastRow = 5 + batchReports.length;
      summarySheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 17 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 17 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 17 } },
      ];
      summarySheet['!autofilter'] = { ref: `A5:R${summaryLastRow}` };
      summarySheet['!cols'] = [
        { wch: 7 },
        { wch: 16 },
        { wch: 10 },
        { wch: 26 },
        { wch: 18 },
        { wch: 22 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 18 },
        { wch: 20 },
        { wch: 19 },
        { wch: 15 },
        { wch: 12 },
        { wch: 13 },
        { wch: 16 },
        { wch: 16 },
        { wch: 12 },
        { wch: 3 },
        { wch: 15 },
      ];
      for (let index = 0; index < batchReports.length; index += 1) {
        const excelRow = index + 6;
        const item = batchReports[index];
        summarySheet[`J${excelRow}`] = {
          t: 'n',
          f: `H${excelRow}*I${excelRow}`,
          v: item.calculation.examContribution / 100,
          z: '0.0%',
        };
        summarySheet[`M${excelRow}`] = {
          t: 'n',
          f: `K${excelRow}*L${excelRow}`,
          v: item.calculation.internalMarks / 100,
          z: '0.0%',
        };
        summarySheet[`N${excelRow}`] = {
          t: 'n',
          f: `J${excelRow}+M${excelRow}`,
          v: item.calculation.finalPercentage / 100,
          z: '0.0%',
        };
        summarySheet[`O${excelRow}`] = {
          t: 's',
          f: `IF(Q${excelRow}>0,"PENDING",IF(OR(R${excelRow}="FAIL",N${excelRow}<$T$2),"FAIL","PASS"))`,
          v: item.calculation.result,
        };
        for (const column of ['G', 'H', 'I', 'J', 'K', 'L', 'M', 'N']) {
          if (summarySheet[`${column}${excelRow}`]) {
            summarySheet[`${column}${excelRow}`].z = '0.0%';
          }
        }
      }
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Class Summary');

      const subjectRows: any[][] = [
        [
          'Admission No',
          'Roll No',
          'Student Name',
          'Subject',
          'Max Marks',
          'Obtained',
          'Absent',
          'Exam Score',
          'Exam Weight',
          'Internal Marks',
          'Final Score',
          'Grade',
        ],
      ];
      batchReports.forEach((item) => {
        item.result.marks.forEach((mark) => {
          const hasScore = subjectHasScore(mark);
          const examScore =
            hasScore && mark.maxMarks > 0
              ? Number(mark.obtained) / mark.maxMarks
              : 0;
          subjectRows.push([
            item.result.admissionNo,
            item.result.rollNo,
            item.result.name,
            mark.subject,
            mark.maxMarks,
            hasScore ? mark.obtained : null,
            mark.is_absent ? 'Yes' : 'No',
            examScore,
            item.calculation.examAllocation / 100,
            item.calculation.internalMarks / 100,
            (examScore * item.calculation.examAllocation) / 100 +
              item.calculation.internalMarks / 100,
            mark.grade || '—',
          ]);
        });
      });
      const subjectSheet = XLSX.utils.aoa_to_sheet(subjectRows);
      subjectSheet['!autofilter'] = {
        ref: `A1:L${Math.max(1, subjectRows.length)}`,
      };
      subjectSheet['!cols'] = [
        { wch: 16 },
        { wch: 10 },
        { wch: 26 },
        { wch: 22 },
        { wch: 12 },
        { wch: 12 },
        { wch: 9 },
        { wch: 12 },
        { wch: 12 },
        { wch: 15 },
        { wch: 12 },
        { wch: 10 },
      ];
      for (let row = 2; row <= subjectRows.length; row += 1) {
        const examScoreValue = Number(subjectSheet[`H${row}`]?.v || 0);
        const finalScoreValue = Number(subjectSheet[`K${row}`]?.v || 0);
        subjectSheet[`H${row}`] = {
          t: 'n',
          f: `IFERROR(F${row}/E${row},0)`,
          v: examScoreValue,
          z: '0.0%',
        };
        subjectSheet[`K${row}`] = {
          t: 'n',
          f: `H${row}*I${row}+J${row}`,
          v: finalScoreValue,
          z: '0.0%',
        };
        for (const column of ['H', 'I', 'J', 'K']) {
          if (subjectSheet[`${column}${row}`]) {
            subjectSheet[`${column}${row}`].z = '0.0%';
          }
        }
      }
      XLSX.utils.book_append_sheet(workbook, subjectSheet, 'Subject Marks');

      const parameterRows = [
        ['Internal Assessment Configuration'],
        [
          'Assessment method',
          assessmentMode === 'combined' ? 'Exam + internal' : 'Exam only',
        ],
        ['Pass percentage', passPercentage / 100],
        [
          'Exam allocation',
          (100 - (assessmentMode === 'combined' ? internalAllocation : 0)) /
            100,
        ],
        [
          'Internal allocation',
          (assessmentMode === 'combined' ? internalAllocation : 0) / 100,
        ],
        [],
        ['Parameter', 'Selected', 'Weight', 'Score source'],
        ...parameters.map((parameter) => [
          parameter.label,
          parameter.enabled ? 'Yes' : 'No',
          parameter.weight / 100,
          parameter.auto ? 'Student attendance record' : 'Manual score',
        ]),
      ];
      const parameterSheet = XLSX.utils.aoa_to_sheet(parameterRows);
      parameterSheet['!cols'] = [
        { wch: 28 },
        { wch: 15 },
        { wch: 12 },
        { wch: 30 },
      ];
      for (const cell of ['B3', 'B4', 'B5']) {
        if (parameterSheet[cell]) parameterSheet[cell].z = '0.0%';
      }
      for (let row = 8; row < 8 + parameters.length; row += 1) {
        if (parameterSheet[`C${row}`]) parameterSheet[`C${row}`].z = '0.0%';
      }
      XLSX.utils.book_append_sheet(
        workbook,
        parameterSheet,
        'Calculation Setup',
      );
      workbook.Props = {
        Title: `${classLabel} ${examName} progress reports`,
        Subject: 'Student progress report export',
        Author: SCHOOL_CONFIG.name,
        CreatedDate: new Date(),
      };
      (workbook as any).CalcPr = { fullCalcOnLoad: true };

      const fileName = `${getBatchFileBase() || 'class-progress-reports'}.xlsx`;
      if (Platform.OS === 'web') {
        XLSX.writeFileXLSX(workbook, fileName, { compression: true });
      } else {
        const FileSystem: any = await import('expo-file-system/legacy');
        const Sharing = await import('expo-sharing');
        const base64 = XLSX.write(workbook, {
          bookType: 'xlsx',
          type: 'base64',
          compression: true,
        });
        const uri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(uri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await Sharing.shareAsync(uri, {
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Save class progress report workbook',
        });
      }
    } catch (error: any) {
      alertCompat(
        'Excel export failed',
        error?.message || 'Could not create the Excel workbook.',
      );
    }
  };

  const renderSelectionField = (
    selector: 'year' | 'class' | 'section' | 'exam',
    label: string,
    placeholder: string,
    value: string,
    options: { id: string; label: string }[],
    onSelect: (id: string) => void | Promise<void>,
    disabled = false,
  ) => {
    const selectedLabel = options.find((option) => option.id === value)?.label;
    const isOpen = openSelector === selector;
    return (
      <View
        style={[styles.selectionField, isOpen && styles.selectionFieldOpen]}
      >
        <Text style={styles.selectionLabel}>{label}</Text>
        <Pressable
          style={[
            styles.selectionButton,
            isOpen && styles.selectionButtonOpen,
            disabled && styles.selectionButtonDisabled,
          ]}
          disabled={disabled}
          onPress={() => setOpenSelector(isOpen ? null : selector)}
        >
          <Text
            style={[
              styles.selectionValue,
              !selectedLabel && styles.selectionPlaceholder,
            ]}
            numberOfLines={1}
          >
            {selectedLabel || placeholder}
          </Text>
          <Ionicons
            name={isOpen ? 'chevron-up' : 'chevron-down'}
            size={17}
            color={schoolColors.textMuted}
          />
        </Pressable>
        {isOpen && (
          <ScrollView
            style={styles.selectionOptions}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {options.length > 0 ? (
              options.map((option) => (
                <Pressable
                  key={option.id}
                  style={[
                    styles.selectionOption,
                    option.id === value && styles.selectionOptionActive,
                  ]}
                  onPress={async () => {
                    setOpenSelector(null);
                    await onSelect(option.id);
                  }}
                >
                  <Text
                    style={[
                      styles.selectionOptionText,
                      option.id === value && styles.selectionOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {option.id === value && (
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={schoolColors.primary}
                    />
                  )}
                </Pressable>
              ))
            ) : (
              <Text style={styles.selectionEmpty}>No options available</Text>
            )}
          </ScrollView>
        )}
      </View>
    );
  };

  const renderClassSelector = () => {
    const yearOptions = academicYears.map((year) => ({
      id: year.id,
      label: year.code,
    }));
    const examOptions = availableExams.map((exam) => ({
      id: exam.id,
      label: exam.name,
    }));
    const canPrepare =
      selectedYearId &&
      selectedClassId &&
      selectedSectionId &&
      selectedBatchExamId;

    return (
      <Animated.View
        entering={FadeIn.duration(220)}
        style={[
          styles.classFilterCard,
          openSelector ? styles.classFilterCardRaised : null,
        ]}
      >
        <View style={styles.classFilterHeader}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>1</Text>
          </View>
          <View style={styles.cardHeadingCopy}>
            <Text style={styles.searchTitle}>
              Choose a class and examination
            </Text>
            <Text style={styles.searchHint}>
              Every student in the selected section will receive one PDF page
            </Text>
          </View>
          <View style={styles.batchModeBadge}>
            <Ionicons
              name="people-outline"
              size={14}
              color={schoolColors.primary}
            />
            <Text style={styles.batchModeBadgeText}>CLASS MODE</Text>
          </View>
        </View>

        {filtersLoading && academicYears.length === 0 ? (
          <View style={styles.filterLoading}>
            <LogoLoader size={30} color={schoolColors.primary} />
            <Text style={styles.filterLoadingText}>
              Loading academic structure…
            </Text>
          </View>
        ) : (
          <View style={styles.classFilterGrid}>
            {renderSelectionField(
              'year',
              'Academic year',
              'Select year',
              selectedYearId,
              yearOptions,
              loadYearOptions,
            )}
            {renderSelectionField(
              'class',
              'Class',
              'Select class',
              selectedClassId,
              availableClasses,
              (id) => {
                setSelectedClassId(id);
                setSelectedSectionId('');
                setBatchReports([]);
              },
              !selectedYearId,
            )}
            {renderSelectionField(
              'section',
              'Section',
              'Select section',
              selectedSectionId,
              availableSections,
              (id) => {
                setSelectedSectionId(id);
                setBatchReports([]);
              },
              !selectedClassId,
            )}
            {renderSelectionField(
              'exam',
              'Examination',
              'Select exam',
              selectedBatchExamId,
              examOptions,
              (id) => {
                setSelectedBatchExamId(id);
                setBatchReports([]);
              },
              !selectedYearId,
            )}
            <TouchableOpacity
              style={[
                styles.prepareClassButton,
                (!canPrepare || batchLoading) && styles.disabledBtn,
              ]}
              disabled={!canPrepare || batchLoading}
              onPress={handleLoadClass}
              activeOpacity={0.86}
            >
              {batchLoading ? (
                <LogoLoader size={25} color="#FFF" />
              ) : (
                <Ionicons name="sparkles-outline" size={17} color="#FFF" />
              )}
              <Text style={styles.prepareClassButtonText}>
                {batchLoading ? 'Preparing reports…' : 'Prepare class reports'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {batchLoading && batchProgress.total > 0 && (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round(
                      (batchProgress.completed / batchProgress.total) * 100,
                    )}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {batchProgress.completed} of {batchProgress.total} students
              prepared
            </Text>
          </View>
        )}
      </Animated.View>
    );
  };

  const renderBatchPreview = () => {
    if (batchLoading) {
      return (
        <View style={styles.batchLoadingCard}>
          <LogoLoader size={52} color={schoolColors.primary} />
          <Text style={styles.batchLoadingTitle}>Building student reports</Text>
          <Text style={styles.batchLoadingSubtitle}>
            Fetching marks and attendance for each student. You can keep this
            page open.
          </Text>
        </View>
      );
    }
    if (batchReports.length === 0) {
      return (
        <View style={styles.batchEmptyCard}>
          <View style={styles.batchEmptyIcon}>
            <Ionicons
              name="people-outline"
              size={34}
              color={schoolColors.primary}
            />
          </View>
          <Text style={styles.welcomeEyebrow}>CLASS REPORT PACK</Text>
          <Text style={styles.welcomeTitle}>
            One report page for every student
          </Text>
          <Text style={styles.welcomeSubtitle}>
            Complete the class filters above, then prepare the report pack. You
            can export the entire section as PDF or Excel.
          </Text>
          <View style={styles.batchFeatureGrid}>
            {[
              ['document-text-outline', 'PDF', 'One student per A4 page'],
              ['grid-outline', 'Excel', 'Summary, marks, and setup sheets'],
              [
                'checkmark-done-outline',
                'Ordered',
                'Sorted by class roll number',
              ],
            ].map(([icon, title, description]) => (
              <View key={title} style={styles.batchFeatureCard}>
                <Ionicons
                  name={icon as React.ComponentProps<typeof Ionicons>['name']}
                  size={21}
                  color={schoolColors.primary}
                />
                <Text style={styles.batchFeatureTitle}>{title}</Text>
                <Text style={styles.batchFeatureDescription}>
                  {description}
                </Text>
              </View>
            ))}
          </View>
        </View>
      );
    }

    const completeCount = batchReports.filter(
      (item) => item.calculation.result !== 'PENDING',
    ).length;
    const pendingCount = batchReports.length - completeCount;
    return (
      <Animated.View
        entering={FadeInDown.duration(260)}
        style={styles.batchReadyCard}
      >
        <LinearGradient
          colors={[
            schoolColorWithAlpha(schoolColors.success, 0.15),
            schoolColorWithAlpha(schoolColors.primary, 0.05),
          ]}
          style={styles.batchReadyHeader}
        >
          <View style={styles.batchReadyIcon}>
            <Ionicons
              name="checkmark-done"
              size={26}
              color={schoolColors.success}
            />
          </View>
          <View style={styles.cardHeadingCopy}>
            <Text style={styles.batchReadyTitle}>
              Class report pack is ready
            </Text>
            <Text style={styles.batchReadySubtitle}>
              Review the student list, then choose an export format
            </Text>
          </View>
        </LinearGradient>
        <View style={styles.batchStatsRow}>
          {[
            ['Students', batchReports.length, schoolColors.primary],
            ['Complete', completeCount, schoolColors.success],
            ['Pending', pendingCount, schoolColors.warning],
            ['PDF pages', batchReports.length, schoolColors.primary],
          ].map(([label, value, color]) => (
            <View key={String(label)} style={styles.batchStat}>
              <View
                style={[styles.overviewDot, { backgroundColor: String(color) }]}
              />
              <Text style={styles.batchStatValue}>{String(value)}</Text>
              <Text style={styles.batchStatLabel}>{String(label)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.exportChoiceRow}>
          <TouchableOpacity
            style={[styles.exportChoice, styles.pdfChoice]}
            onPress={handleBatchPdf}
            activeOpacity={0.86}
          >
            <View style={styles.exportIconWrap}>
              <Ionicons name="document-text-outline" size={24} color="#FFF" />
            </View>
            <View style={styles.exportChoiceCopy}>
              <Text style={styles.exportChoiceTitle}>Download PDF</Text>
              <Text style={styles.exportChoiceSubtitle}>
                {batchReports.length} A4 pages · one student per page
              </Text>
            </View>
            <Feather name="download" size={19} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportChoice, styles.excelChoice]}
            onPress={handleBatchExcel}
            activeOpacity={0.86}
          >
            <View style={styles.exportIconWrap}>
              <Ionicons name="grid-outline" size={24} color="#FFF" />
            </View>
            <View style={styles.exportChoiceCopy}>
              <Text style={styles.exportChoiceTitle}>Download Excel</Text>
              <Text style={styles.exportChoiceSubtitle}>
                Summary, subject marks, and calculation setup
              </Text>
            </View>
            <Feather name="download" size={19} color="#FFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.rosterHeader}>
          <Text style={styles.rosterTitle}>Students in this report</Text>
          <Text style={styles.rosterCount}>{batchReports.length} students</Text>
        </View>
        <View style={styles.rosterList}>
          {batchReports.slice(0, 10).map((item, index) => (
            <View key={item.result.id} style={styles.rosterRow}>
              <View style={styles.rosterNumber}>
                <Text style={styles.rosterNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.rosterCopy}>
                <Text style={styles.rosterName}>{item.result.name}</Text>
                <Text style={styles.rosterMeta}>
                  Roll {item.result.rollNo} · {item.result.admissionNo}
                </Text>
              </View>
              <Text
                style={[
                  styles.rosterScore,
                  item.calculation.result === 'PENDING' && styles.textPending,
                ]}
              >
                {item.calculation.result === 'PENDING'
                  ? 'Pending'
                  : `${item.calculation.finalPercentage}%`}
              </Text>
            </View>
          ))}
          {batchReports.length > 10 && (
            <Text style={styles.moreStudentsText}>
              + {batchReports.length - 10} more students included in both
              exports
            </Text>
          )}
        </View>
      </Animated.View>
    );
  };

  const renderSetupPanel = () => {
    const selectedCount = parameters.filter(
      (parameter) => parameter.enabled,
    ).length;
    const weightIsValid = Math.abs(calculation.totalWeight - 100) < 0.01;

    return (
      <View style={[styles.setupColumn, isWide && styles.setupColumnWide]}>
        <View style={styles.setupCard}>
          <View style={styles.cardHeadingRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>2</Text>
            </View>
            <View style={styles.cardHeadingCopy}>
              <Text style={styles.panelTitle}>Calculation setup</Text>
              <Text style={styles.panelSubtitle}>
                Choose how the final score is calculated
              </Text>
            </View>
          </View>

          <Text style={styles.controlLabel}>Assessment method</Text>
          <View style={styles.segmentedControl}>
            {(
              [
                ['combined', 'Exam + internal'],
                ['exam-only', 'Exam only'],
              ] as [AssessmentMode, string][]
            ).map(([value, label]) => {
              const active = assessmentMode === value;
              const unavailable =
                reportScope === 'class' && value === 'combined';
              return (
                <Pressable
                  key={value}
                  style={[
                    styles.segmentButton,
                    active && styles.segmentButtonActive,
                    unavailable && styles.segmentButtonDisabled,
                  ]}
                  disabled={unavailable}
                  onPress={() => setAssessmentMode(value)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      active && styles.segmentTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {reportScope === 'class' && (
            <View style={styles.classCalculationNote}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={schoolColors.primary}
              />
              <Text style={styles.classCalculationNoteText}>
                Class exports use recorded exam marks. Student-specific internal
                scores can still be exported individually.
              </Text>
            </View>
          )}

          {assessmentMode === 'combined' && (
            <>
              <View style={styles.controlTitleRow}>
                <Text style={styles.controlLabel}>
                  Internal marks allocation
                </Text>
                <Text style={styles.allocationHint}>
                  Exam {100 - internalAllocation} + Internal{' '}
                  {internalAllocation}
                </Text>
              </View>
              <View style={styles.optionRow}>
                {[10, 20, 25, 30].map((value) => {
                  const active = internalAllocation === value;
                  return (
                    <Pressable
                      key={value}
                      style={[
                        styles.optionChip,
                        active && styles.optionChipActive,
                      ]}
                      onPress={() => setInternalAllocation(value)}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          active && styles.optionChipTextActive,
                        ]}
                      >
                        {value} marks
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <Text style={styles.controlLabel}>Minimum pass percentage</Text>
          <View style={styles.optionRow}>
            {[35, 40, 50].map((value) => {
              const active = passPercentage === value;
              return (
                <Pressable
                  key={value}
                  style={[styles.optionChip, active && styles.optionChipActive]}
                  onPress={() => setPassPercentage(value)}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      active && styles.optionChipTextActive,
                    ]}
                  >
                    {value}%
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {assessmentMode === 'combined' && (
          <View style={styles.setupCard}>
            <Pressable
              style={styles.parameterHeader}
              onPress={() => setShowParameters((visible) => !visible)}
            >
              <View style={styles.cardHeadingCopy}>
                <Text style={styles.panelTitle}>Internal parameters</Text>
                <Text style={styles.panelSubtitle}>
                  {selectedCount} selected · scores are out of 100
                </Text>
              </View>
              <View style={styles.headerRight}>
                <View
                  style={[
                    styles.weightBadge,
                    weightIsValid
                      ? styles.weightBadgeValid
                      : styles.weightBadgeWarning,
                  ]}
                >
                  <Text
                    style={[
                      styles.weightBadgeText,
                      weightIsValid
                        ? styles.weightTextValid
                        : styles.weightTextWarning,
                    ]}
                  >
                    {calculation.totalWeight}%
                  </Text>
                </View>
                <Ionicons
                  name={showParameters ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={schoolColors.textMuted}
                />
              </View>
            </Pressable>

            {showParameters && (
              <>
                <Text style={styles.presetLabel}>QUICK PRESETS</Text>
                <View style={styles.presetRow}>
                  {(['balanced', 'academic', 'holistic'] as const).map(
                    (preset) => (
                      <Pressable
                        key={preset}
                        style={styles.presetChip}
                        onPress={() => applyPreset(preset)}
                      >
                        <Text style={styles.presetChipText}>
                          {preset.charAt(0).toUpperCase() + preset.slice(1)}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>

                <View style={styles.parameterList}>
                  {parameters.map((parameter) => (
                    <View
                      key={parameter.key}
                      style={[
                        styles.parameterRow,
                        !parameter.enabled && styles.parameterRowDisabled,
                      ]}
                    >
                      <Pressable
                        style={[
                          styles.parameterToggle,
                          parameter.enabled && styles.parameterToggleActive,
                        ]}
                        onPress={() =>
                          updateParameter(
                            parameter.key,
                            'enabled',
                            !parameter.enabled,
                          )
                        }
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: parameter.enabled }}
                      >
                        <Ionicons
                          name={parameter.enabled ? 'checkmark' : 'add'}
                          size={14}
                          color={
                            parameter.enabled ? '#FFF' : schoolColors.textMuted
                          }
                        />
                      </Pressable>
                      <View style={styles.parameterIcon}>
                        <Ionicons
                          name={parameter.icon}
                          size={18}
                          color={
                            parameter.enabled
                              ? schoolColors.primary
                              : schoolColors.textMuted
                          }
                        />
                      </View>
                      <View style={styles.parameterCopy}>
                        <Text style={styles.parameterName}>
                          {parameter.label}
                        </Text>
                        <Text
                          style={styles.parameterDescription}
                          numberOfLines={1}
                        >
                          {parameter.description}
                        </Text>
                      </View>
                      {parameter.enabled && (
                        <View style={styles.parameterInputs}>
                          <View style={styles.miniField}>
                            <Text style={styles.miniFieldLabel}>Weight</Text>
                            <View style={styles.miniInputWrap}>
                              <AppTextInput
                                style={styles.miniInput}
                                value={String(parameter.weight)}
                                keyboardType="numeric"
                                onChangeText={(value) =>
                                  updateParameter(
                                    parameter.key,
                                    'weight',
                                    Number(value),
                                  )
                                }
                              />
                              <Text style={styles.miniSuffix}>%</Text>
                            </View>
                          </View>
                          <View style={styles.miniField}>
                            <Text style={styles.miniFieldLabel}>
                              {parameter.auto && parameter.score != null
                                ? 'Auto score'
                                : 'Score'}
                            </Text>
                            <View style={styles.miniInputWrap}>
                              <AppTextInput
                                style={styles.miniInput}
                                value={
                                  parameter.score == null
                                    ? ''
                                    : String(roundTo(parameter.score))
                                }
                                placeholder="—"
                                placeholderTextColor={schoolColors.textMuted}
                                keyboardType="numeric"
                                editable={
                                  !parameter.auto || parameter.score == null
                                }
                                onChangeText={(value) =>
                                  updateParameter(
                                    parameter.key,
                                    'score',
                                    value.trim() === '' ? null : Number(value),
                                  )
                                }
                              />
                              <Text style={styles.miniSuffix}>%</Text>
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  ))}
                </View>

                {!weightIsValid && (
                  <View style={styles.weightWarning}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={16}
                      color={schoolColors.warning}
                    />
                    <Text style={styles.weightWarningText}>
                      Weights should total 100%. The preview is currently
                      normalised automatically.
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        <View style={styles.liveCalculationCard}>
          <View style={styles.liveCalculationIcon}>
            <Ionicons
              name="calculator-outline"
              size={22}
              color={schoolColors.primary}
            />
          </View>
          <View style={styles.liveCalculationCopy}>
            <Text style={styles.liveCalculationLabel}>LIVE CALCULATION</Text>
            <Text style={styles.liveCalculationValue}>
              {reportScope === 'class'
                ? batchReports.length > 0
                  ? `${batchReports.length} student reports ready`
                  : 'Waiting for a class'
                : !resultData
                  ? 'Waiting for a student'
                  : assessmentMode === 'combined' &&
                      calculation.missingParameters > 0
                    ? `${calculation.missingParameters} score${calculation.missingParameters === 1 ? '' : 's'} required`
                    : assessmentMode === 'combined'
                      ? `${calculation.examContribution} exam + ${calculation.internalMarks} internal`
                      : `${calculation.examContribution}% exam score`}
            </Text>
            <Text style={styles.liveCalculationFormula}>
              {reportScope === 'class'
                ? 'Prepare the selected class to unlock PDF and Excel exports.'
                : !resultData
                  ? 'The final score will update as soon as a student is selected.'
                  : assessmentMode === 'combined' &&
                      calculation.missingParameters > 0
                    ? 'Enter each selected parameter score to complete the report.'
                    : resultData
                      ? `Final score ${calculation.finalPercentage}% · Internal performance ${calculation.internalPerformance}%`
                      : 'The final score will update as soon as a student is selected.'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderExamPicker = () => {
    if (!resultData || resultData.exams.length <= 1) return null;
    return (
      <View style={styles.examPickerContainer}>
        <Text style={styles.examPickerLabel}>Select exam</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.examPickerScroll}
        >
          {resultData.exams.map((exam, index) => {
            const active = index === resultData.selectedExamIndex;
            return (
              <Pressable
                key={exam.exam_id}
                style={[styles.examChip, active && styles.examChipActive]}
                onPress={() => selectExam(index)}
              >
                <Text
                  style={[
                    styles.examChipText,
                    active && styles.examChipTextActive,
                  ]}
                >
                  {exam.exam_name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderWelcomeState = () => (
    <Animated.View
      entering={FadeInDown.duration(320)}
      style={styles.welcomeCard}
    >
      <LinearGradient
        colors={[
          schoolColorWithAlpha(schoolColors.primary, isDark ? 0.24 : 0.12),
          schoolColorWithAlpha(schoolColors.primary, isDark ? 0.08 : 0.025),
        ]}
        style={styles.welcomeHero}
      >
        <View style={styles.welcomeIconWrap}>
          <Ionicons
            name="document-text-outline"
            size={32}
            color={schoolColors.primary}
          />
        </View>
        <View style={styles.welcomeCopy}>
          <Text style={styles.welcomeEyebrow}>REPORT PREVIEW</Text>
          <Text style={styles.welcomeTitle}>
            Your student report will appear here
          </Text>
          <Text style={styles.welcomeSubtitle}>
            Find a student, choose the assessment method, and review every mark
            before printing.
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.workflowList}>
        {[
          [
            'search-outline',
            'Find a student',
            'Use admission number, roll number, or full name.',
          ],
          [
            'options-outline',
            'Set internal parameters',
            'Choose weightage for tests, projects, attendance, and more.',
          ],
          [
            'print-outline',
            'Review and publish',
            'Check the live calculation, then print or save as PDF.',
          ],
        ].map(([icon, title, description], index) => (
          <View key={title} style={styles.workflowItem}>
            <View style={styles.workflowNumber}>
              <Text style={styles.workflowNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.workflowIcon}>
              <Ionicons
                name={icon as React.ComponentProps<typeof Ionicons>['name']}
                size={20}
                color={schoolColors.primary}
              />
            </View>
            <View style={styles.workflowCopy}>
              <Text style={styles.workflowTitle}>{title}</Text>
              <Text style={styles.workflowDescription}>{description}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.featureStrip}>
        {[
          ['checkmark-circle-outline', '8 assessment parameters'],
          ['flash-outline', 'Instant calculation'],
          ['shield-checkmark-outline', 'Print-ready report'],
        ].map(([icon, label]) => (
          <View key={label} style={styles.featureItem}>
            <Ionicons
              name={icon as React.ComponentProps<typeof Ionicons>['name']}
              size={16}
              color={schoolColors.success}
            />
            <Text style={styles.featureText}>{label}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );

  const renderNoResults = () => (
    <Animated.View entering={FadeInDown.springify()} style={styles.emptyCard}>
      <View style={styles.emptyIconWrap}>
        <Ionicons
          name="document-text-outline"
          size={36}
          color={schoolColors.primary}
        />
      </View>
      <Text style={styles.emptyTitle}>No exam papers for this class</Text>
      <Text style={styles.emptySubtitle}>
        {resultData?.name} ({resultData?.class}) has no published exam subjects
        yet for {resultData?.academicYear}.{'\n'}Attendance:{' '}
        {resultData?.attendance} ({resultData?.attendanceDetail})
      </Text>
    </Animated.View>
  );

  const renderReportCard = () => {
    if (!resultData) return null;
    if (resultData.exams.length === 0 || resultData.marks.length === 0) {
      return (
        <>
          {renderExamPicker()}
          {renderNoResults()}
        </>
      );
    }

    const isPass = calculation.result === 'PASS';
    const isPending = calculation.result === 'PENDING';

    return (
      <Animated.View
        entering={FadeInDown.springify()}
        style={styles.previewWrap}
      >
        {renderExamPicker()}

        <View style={styles.studentSelectionCard}>
          <View style={styles.studentAvatar}>
            <Text style={styles.studentAvatarText}>
              {resultData.name
                .split(' ')
                .slice(0, 2)
                .map((part) => part.charAt(0))
                .join('')
                .toUpperCase() || 'ST'}
            </Text>
          </View>
          <View style={styles.studentSelectionCopy}>
            <View style={styles.selectedLabelRow}>
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={schoolColors.success}
              />
              <Text style={styles.selectedLabel}>STUDENT SELECTED</Text>
            </View>
            <Text style={styles.selectedStudentName}>{resultData.name}</Text>
            <Text style={styles.selectedStudentMeta}>
              {resultData.class} · Roll {resultData.rollNo} ·{' '}
              {resultData.admissionNo}
            </Text>
          </View>
          <Pressable
            style={styles.changeStudentButton}
            onPress={() => {
              setResultData(null);
              setStudentId('');
            }}
          >
            <Feather name="refresh-cw" size={14} color={schoolColors.primary} />
            <Text style={styles.changeStudentText}>Change</Text>
          </Pressable>
        </View>

        <View style={styles.calculationOverview}>
          {[
            [
              'Exam contribution',
              `${calculation.examContribution}/${calculation.examAllocation}`,
            ],
            [
              assessmentMode === 'combined' ? 'Internal marks' : 'Assessment',
              assessmentMode === 'combined'
                ? `${calculation.internalMarks}/${calculation.internalAllocation}`
                : 'Exam only',
            ],
            ['Final score', `${calculation.finalPercentage}%`],
            ['Status', calculation.result],
          ].map(([label, value], index) => (
            <View key={label} style={styles.overviewStat}>
              <View
                style={[
                  styles.overviewDot,
                  {
                    backgroundColor: [
                      schoolColors.primary,
                      schoolColors.warning,
                      schoolColors.success,
                      isPass
                        ? schoolColors.success
                        : isPending
                          ? schoolColors.warning
                          : schoolColors.danger,
                    ][index],
                  },
                ]}
              />
              <Text style={styles.overviewLabel}>{label}</Text>
              <Text
                style={[
                  styles.overviewValue,
                  label === 'Status' &&
                    (isPass
                      ? styles.textPass
                      : isPending
                        ? styles.textPending
                        : styles.textFail),
                ]}
              >
                {value}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.paperSheet}>
          <LinearGradient
            colors={[
              SCHOOL_CONFIG.theme.ribbonGradient[0],
              SCHOOL_CONFIG.theme.ribbonGradient[1],
              SCHOOL_CONFIG.theme.ribbonGradient[2],
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.letterhead}
          >
            <View style={styles.logoCircle}>
              <Image source={SCHOOL_CONFIG.logo} style={styles.logoImg} />
            </View>
            <View style={styles.letterheadCenter}>
              <Text style={styles.schoolName}>{SCHOOL_CONFIG.name}</Text>
              {!!SCHOOL_CONFIG.tagline && (
                <Text style={styles.tagline}>{SCHOOL_CONFIG.tagline}</Text>
              )}
              <Text style={styles.contactLine} numberOfLines={2}>
                {SCHOOL_CONFIG.address}
              </Text>
            </View>
            <View style={{ width: 44 }} />
          </LinearGradient>
          <View style={styles.accentBar} />

          <View style={styles.titleBand}>
            <Text style={styles.examTitle}>
              {resultData.exams[
                resultData.selectedExamIndex
              ]?.exam_name?.toUpperCase() || 'PROGRESS REPORT'}
            </Text>
            <Text style={styles.yearText}>{resultData.academicYear}</Text>
          </View>

          <View style={styles.detailsGrid}>
            {[
              ['Student', resultData.name],
              ['Class & Sec', resultData.class],
              ['Roll No', resultData.rollNo],
              ['Admission No', resultData.admissionNo],
              ["Father's Name", resultData.fatherName],
              ['D.O.B', resultData.dob],
              ['Attendance', `${resultData.attendance}`],
              ['Mother / Guardian', resultData.motherName],
            ].map(([label, value]) => (
              <View key={label} style={styles.detailItem}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.detailValue} numberOfLines={2}>
                  {value}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <Text style={[styles.colSubject, styles.th]}>Subject</Text>
              <Text style={[styles.colMarks, styles.th]}>Max</Text>
              <Text style={[styles.colMarks, styles.th]}>Exam</Text>
              {assessmentMode === 'combined' && (
                <Text style={[styles.colMarks, styles.th]}>Internal</Text>
              )}
              {assessmentMode === 'combined' && (
                <Text style={[styles.colMarks, styles.th]}>Final</Text>
              )}
              <Text style={[styles.colGrade, styles.th]}>Grade</Text>
            </View>
            {resultData.marks.map((m, i) => {
              const scored = subjectHasScore(m);
              const passingMarks =
                m.passingMarks || Math.round(m.maxMarks * 0.35);
              const isFail = scored && Number(m.obtained) < passingMarks;
              const examPercent =
                scored && m.maxMarks > 0
                  ? (Number(m.obtained) / m.maxMarks) * 100
                  : 0;
              const finalPercent =
                assessmentMode === 'combined'
                  ? (examPercent * calculation.examAllocation) / 100 +
                    calculation.internalMarks
                  : examPercent;
              return (
                <View
                  key={`${m.subject}-${i}`}
                  style={[styles.tableRow, i % 2 === 0 && styles.rowAlt]}
                >
                  <Text style={[styles.colSubject, styles.td]}>
                    {m.subject}
                  </Text>
                  <Text style={[styles.colMarks, styles.td]}>{m.maxMarks}</Text>
                  <Text
                    style={[
                      styles.colMarks,
                      styles.td,
                      (isFail || m.is_absent) && styles.textDanger,
                      !scored && !m.is_absent && styles.textMuted,
                    ]}
                  >
                    {formatObtained(m)}
                  </Text>
                  {assessmentMode === 'combined' && (
                    <Text style={[styles.colMarks, styles.td]}>
                      {calculation.internalMarks}/
                      {calculation.internalAllocation}
                    </Text>
                  )}
                  {assessmentMode === 'combined' && (
                    <Text
                      style={[styles.colMarks, styles.td, styles.finalMark]}
                    >
                      {scored ? `${roundTo(finalPercent)}%` : '—'}
                    </Text>
                  )}
                  <Text style={[styles.colGrade, styles.td]}>
                    {m.grade || '—'}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Exam score</Text>
              <Text style={styles.statValue}>{resultData.percentage}%</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>
                {assessmentMode === 'combined'
                  ? 'Internal marks'
                  : 'Total marks'}
              </Text>
              <Text style={styles.statValue}>
                {assessmentMode === 'combined'
                  ? `${calculation.internalMarks}/${calculation.internalAllocation}`
                  : `${resultData.totalObtained}/${resultData.totalMax}`}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Result</Text>
              <View
                style={[
                  styles.resultBadge,
                  isPending
                    ? styles.badgePending
                    : isPass
                      ? styles.badgePass
                      : styles.badgeFail,
                ]}
              >
                <Text
                  style={[
                    styles.resultText,
                    isPending
                      ? styles.textPending
                      : isPass
                        ? styles.textPass
                        : styles.textFail,
                  ]}
                >
                  {calculation.result}
                </Text>
              </View>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Final score</Text>
              <Text style={styles.statValue}>
                {calculation.finalPercentage}%
              </Text>
            </View>
          </View>

          {resultData.pendingSubjects > 0 && (
            <Text style={styles.pendingNote}>
              {resultData.pendingSubjects} subject
              {resultData.pendingSubjects === 1 ? '' : 's'} pending marks entry
            </Text>
          )}

          <View style={styles.footerSignatures}>
            {['Class Teacher', 'Principal', 'Parent'].map((label) => (
              <View key={label} style={styles.signBox}>
                <Text style={styles.signLabel}>{label}</Text>
              </View>
            ))}
          </View>

          <View pointerEvents="none" style={styles.watermark}>
            <Image source={SCHOOL_CONFIG.logo} style={styles.watermarkImg} />
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[
          schoolColors.background,
          schoolColorWithAlpha(schoolColors.primary, isDark ? 0.18 : 0.08),
        ]}
        style={StyleSheet.absoluteFill}
      />
      <AdminHeader title="Progress Reports" showBackButton />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          reportScope === 'student' && resultData?.marks?.length
            ? { paddingBottom: 110 }
            : null,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <Animated.View
            entering={FadeIn.duration(240)}
            style={styles.pageIntro}
          >
            <View style={styles.eyebrowPill}>
              <Ionicons
                name="sparkles-outline"
                size={14}
                color={schoolColors.primary}
              />
              <Text style={styles.eyebrowText}>SMART REPORT BUILDER</Text>
            </View>
            <Text style={styles.pageTitle}>
              Create a complete progress report
            </Text>
            <Text style={styles.pageSubtitle}>
              Build one student report or prepare an entire class pack with PDF
              and Excel exports.
            </Text>
          </Animated.View>

          <View style={[styles.scopeCard, !isWide && styles.scopeCardStacked]}>
            <View style={styles.scopeHeading}>
              <Text style={styles.scopeLabel}>WHAT DO YOU WANT TO CREATE?</Text>
              <Text style={styles.scopeHint}>
                Switch anytime without losing your setup
              </Text>
            </View>
            <View
              style={[
                styles.scopeOptions,
                !isWide && styles.scopeOptionsStacked,
              ]}
            >
              {(
                [
                  [
                    'student',
                    'Single student',
                    'Search and generate one report',
                    'person-outline',
                  ],
                  [
                    'class',
                    'Whole class',
                    'PDF + Excel for a class section',
                    'people-outline',
                  ],
                ] as [
                  ReportScope,
                  string,
                  string,
                  React.ComponentProps<typeof Ionicons>['name'],
                ][]
              ).map(([scope, title, description, icon]) => {
                const active = reportScope === scope;
                return (
                  <Pressable
                    key={scope}
                    style={[
                      styles.scopeOption,
                      active && styles.scopeOptionActive,
                    ]}
                    onPress={() => handleScopeChange(scope)}
                  >
                    <View
                      style={[
                        styles.scopeIcon,
                        active && styles.scopeIconActive,
                      ]}
                    >
                      <Ionicons
                        name={icon}
                        size={21}
                        color={active ? '#FFF' : schoolColors.primary}
                      />
                    </View>
                    <View style={styles.scopeOptionCopy}>
                      <Text
                        style={[
                          styles.scopeOptionTitle,
                          active && styles.scopeOptionTitleActive,
                        ]}
                      >
                        {title}
                      </Text>
                      <Text style={styles.scopeOptionDescription}>
                        {description}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.scopeRadio,
                        active && styles.scopeRadioActive,
                      ]}
                    >
                      {active && <View style={styles.scopeRadioDot} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {reportScope === 'student' ? (
            <Animated.View
              entering={FadeIn.duration(280)}
              style={styles.searchCard}
            >
              <View style={styles.searchHeading}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>1</Text>
                </View>
                <View style={styles.cardHeadingCopy}>
                  <Text style={styles.searchTitle}>Find a student</Text>
                  <Text style={styles.searchHint}>
                    Admission number, roll number, or full name
                  </Text>
                </View>
              </View>
              <View style={[styles.inputRow, isWide && styles.inputRowWide]}>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="search-outline"
                    size={20}
                    color={ADMIN_THEME.colors.text.muted}
                    style={styles.searchIcon}
                  />
                  <AppTextInput
                    style={styles.input}
                    placeholder="Try ADM-1024, roll 12, or Nikhil"
                    placeholderTextColor={ADMIN_THEME.colors.text.muted}
                    value={studentId}
                    onChangeText={setStudentId}
                    onSubmitEditing={handleSearch}
                    returnKeyType="search"
                  />
                </View>
                <TouchableOpacity
                  style={[styles.searchBtn, loading && styles.disabledBtn]}
                  onPress={handleSearch}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <LogoLoader size={28} color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="search" size={18} color="#FFF" />
                      {isWide && (
                        <Text style={styles.searchButtonText}>
                          Find student
                        </Text>
                      )}
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </Animated.View>
          ) : (
            renderClassSelector()
          )}

          <View style={[styles.workspace, isWide && styles.workspaceWide]}>
            {renderSetupPanel()}
            <View style={styles.previewColumn}>
              {reportScope === 'class'
                ? renderBatchPreview()
                : resultData
                  ? renderReportCard()
                  : renderWelcomeState()}
            </View>
          </View>
        </View>
      </ScrollView>

      {reportScope === 'student' &&
        resultData &&
        resultData.marks.length > 0 && (
          <Animated.View
            entering={FadeInDown.duration(220)}
            style={styles.printBar}
          >
            <TouchableOpacity
              style={styles.printBtn}
              onPress={handlePrint}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={[
                  SCHOOL_CONFIG.theme.ribbonGradient[0],
                  SCHOOL_CONFIG.theme.ribbonGradient[1],
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.printGradient}
              >
                <Feather name="printer" size={18} color="#FFF" />
                <Text style={styles.printText}>Print / Save PDF</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}
    </View>
  );
}

const getStyles = (
  theme: Theme,
  sc: (typeof schoolTheme.light)['colors'],
  isDark: boolean,
) =>
  StyleSheet.create({
    root: { flex: 1 },
    scroll: { paddingBottom: 40 },
    content: {
      padding: 20,
      maxWidth: 1400,
      width: '100%',
      alignSelf: 'center',
    },
    pageIntro: { marginBottom: 18, maxWidth: 760 },
    eyebrowPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.1),
      marginBottom: 10,
    },
    eyebrowText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      color: sc.primary,
    },
    pageTitle: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '800',
      color: sc.textStrong,
      letterSpacing: -0.5,
    },
    pageSubtitle: {
      fontSize: 14,
      lineHeight: 21,
      color: sc.textSecondary,
      marginTop: 6,
      maxWidth: 700,
    },
    scopeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 18,
      padding: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: sc.border,
      backgroundColor: isDark ? sc.card : '#FFF',
      marginBottom: 14,
      ...ADMIN_THEME.shadows.sm,
    },
    scopeCardStacked: {
      alignItems: 'stretch',
      flexDirection: 'column',
      gap: 10,
    },
    scopeHeading: { paddingHorizontal: 6, minWidth: 220 },
    scopeLabel: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.9,
      color: sc.primary,
    },
    scopeHint: { fontSize: 10, color: sc.textMuted, marginTop: 3 },
    scopeOptions: { flex: 1, flexDirection: 'row', gap: 9 },
    scopeOptionsStacked: { flexDirection: 'column' },
    scopeOption: {
      flex: 1,
      minWidth: 220,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: sc.border,
      backgroundColor: isDark
        ? sc.background
        : ADMIN_THEME.colors.background.surface,
    },
    scopeOptionActive: {
      borderColor: sc.primary,
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.07),
    },
    scopeIcon: {
      width: 38,
      height: 38,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.1),
    },
    scopeIconActive: { backgroundColor: sc.primary },
    scopeOptionCopy: { flex: 1, minWidth: 0 },
    scopeOptionTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: sc.textPrimary,
    },
    scopeOptionTitleActive: { color: sc.primary },
    scopeOptionDescription: { fontSize: 9, color: sc.textMuted, marginTop: 2 },
    scopeRadio: {
      width: 17,
      height: 17,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: sc.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scopeRadioActive: { borderColor: sc.primary },
    scopeRadioDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: sc.primary,
    },
    searchCard: {
      backgroundColor: isDark ? sc.card : '#FFF',
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: sc.border,
      marginBottom: 20,
      ...ADMIN_THEME.shadows.sm,
    },
    searchHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
    },
    stepBadge: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: sc.primary,
      marginRight: 10,
    },
    stepBadgeText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
    cardHeadingCopy: { flex: 1, minWidth: 0 },
    searchTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: sc.textStrong,
    },
    searchHint: {
      fontSize: 12,
      color: sc.textMuted,
      marginTop: 2,
    },
    inputRow: { flexDirection: 'row', gap: 10 },
    inputRowWide: { maxWidth: 880 },
    inputWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark
        ? sc.background
        : ADMIN_THEME.colors.background.surface,
      borderWidth: 1,
      borderColor: sc.border,
      borderRadius: 13,
      paddingHorizontal: 14,
      height: 52,
    },
    searchIcon: { marginRight: 8 },
    input: { flex: 1, fontSize: 15, color: sc.textPrimary },
    searchBtn: {
      minWidth: 52,
      height: 52,
      paddingHorizontal: 17,
      borderRadius: 13,
      backgroundColor: sc.primary,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      alignItems: 'center',
      ...ADMIN_THEME.shadows.sm,
    },
    searchButtonText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
    disabledBtn: { opacity: 0.7 },
    classFilterCard: {
      backgroundColor: isDark ? sc.card : '#FFF',
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: sc.border,
      marginBottom: 20,
      ...ADMIN_THEME.shadows.sm,
      overflow: 'visible',
      zIndex: 4,
    },
    classFilterCardRaised: {
      zIndex: 40,
    },
    classFilterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    batchModeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.09),
    },
    batchModeBadgeText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.6,
      color: sc.primary,
    },
    classFilterGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      gap: 10,
      overflow: 'visible',
      zIndex: 20,
    },
    selectionField: {
      flexGrow: 1,
      flexBasis: 190,
      minWidth: 165,
      position: 'relative',
      zIndex: 21,
    },
    selectionFieldOpen: { zIndex: 120 },
    selectionLabel: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      color: sc.textMuted,
      marginBottom: 6,
    },
    selectionButton: {
      height: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingHorizontal: 12,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: sc.border,
      backgroundColor: isDark
        ? sc.background
        : ADMIN_THEME.colors.background.surface,
    },
    selectionButtonOpen: { borderColor: sc.primary },
    selectionButtonDisabled: { opacity: 0.45 },
    selectionValue: {
      flex: 1,
      fontSize: 12,
      fontWeight: '700',
      color: sc.textPrimary,
    },
    selectionPlaceholder: { color: sc.textMuted, fontWeight: '500' },
    selectionOptions: {
      position: 'absolute',
      top: 70,
      left: 0,
      right: 0,
      maxHeight: 240,
      overflow: 'hidden',
      borderRadius: 11,
      borderWidth: 1,
      borderColor: sc.border,
      backgroundColor: isDark ? sc.card : '#FFF',
      ...ADMIN_THEME.shadows.md,
      zIndex: 1000,
      elevation: 24,
    },
    selectionOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: sc.border,
    },
    selectionOptionActive: {
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.08),
    },
    selectionOptionText: { flex: 1, fontSize: 11, color: sc.textPrimary },
    selectionOptionTextActive: { fontWeight: '800', color: sc.primary },
    selectionEmpty: {
      padding: 14,
      fontSize: 11,
      textAlign: 'center',
      color: sc.textMuted,
    },
    prepareClassButton: {
      height: 46,
      minWidth: 190,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 11,
      backgroundColor: sc.primary,
      ...ADMIN_THEME.shadows.sm,
    },
    prepareClassButtonText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
    filterLoading: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    filterLoadingText: { fontSize: 12, color: sc.textMuted },
    progressWrap: { marginTop: 14 },
    progressTrack: {
      height: 7,
      borderRadius: 99,
      overflow: 'hidden',
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.1),
    },
    progressFill: {
      height: '100%',
      borderRadius: 99,
      backgroundColor: sc.primary,
    },
    progressText: {
      fontSize: 10,
      fontWeight: '700',
      color: sc.textMuted,
      marginTop: 6,
    },
    workspace: { width: '100%', gap: 20, zIndex: 1, elevation: 1 },
    workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
    setupColumn: { width: '100%', gap: 14 },
    setupColumnWide: { width: 410, flexShrink: 0 },
    previewColumn: { flex: 1, minWidth: 0 },
    setupCard: {
      backgroundColor: isDark ? sc.card : '#FFF',
      borderWidth: 1,
      borderColor: sc.border,
      borderRadius: 18,
      padding: 16,
      ...ADMIN_THEME.shadows.sm,
    },
    cardHeadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 18,
    },
    panelTitle: { fontSize: 15, fontWeight: '800', color: sc.textStrong },
    panelSubtitle: {
      fontSize: 11,
      lineHeight: 16,
      color: sc.textMuted,
      marginTop: 2,
    },
    controlLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: sc.textMuted,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginTop: 4,
    },
    controlTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 14,
    },
    allocationHint: { fontSize: 10, fontWeight: '700', color: sc.primary },
    segmentedControl: {
      flexDirection: 'row',
      padding: 4,
      borderRadius: 12,
      backgroundColor: isDark
        ? sc.background
        : schoolColorWithAlpha(sc.primary, 0.06),
      marginBottom: 12,
    },
    segmentButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 9,
      borderRadius: 9,
    },
    segmentButtonActive: {
      backgroundColor: isDark ? sc.surface : '#FFF',
      ...ADMIN_THEME.shadows.sm,
    },
    segmentButtonDisabled: { opacity: 0.38 },
    segmentText: { fontSize: 12, fontWeight: '700', color: sc.textMuted },
    segmentTextActive: { color: sc.primary },
    classCalculationNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 7,
      padding: 9,
      borderRadius: 9,
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.07),
      marginBottom: 12,
    },
    classCalculationNoteText: {
      flex: 1,
      fontSize: 9,
      lineHeight: 14,
      color: sc.textSecondary,
    },
    optionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
      marginBottom: 12,
    },
    optionChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: sc.border,
      backgroundColor: isDark ? sc.background : '#FFF',
    },
    optionChipActive: {
      borderColor: sc.primary,
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.1),
    },
    optionChipText: {
      fontSize: 11,
      fontWeight: '700',
      color: sc.textSecondary,
    },
    optionChipTextActive: { color: sc.primary },
    parameterHeader: { flexDirection: 'row', alignItems: 'center' },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginLeft: 8,
    },
    weightBadge: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
    },
    weightBadgeValid: {
      backgroundColor: schoolColorWithAlpha(sc.success, 0.12),
    },
    weightBadgeWarning: {
      backgroundColor: schoolColorWithAlpha(sc.warning, 0.14),
    },
    weightBadgeText: { fontSize: 10, fontWeight: '800' },
    weightTextValid: { color: sc.success },
    weightTextWarning: { color: sc.warning },
    presetLabel: {
      fontSize: 9,
      letterSpacing: 0.8,
      fontWeight: '800',
      color: sc.textMuted,
      marginTop: 16,
      marginBottom: 8,
    },
    presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    presetChip: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.08),
    },
    presetChipText: { fontSize: 10, fontWeight: '700', color: sc.primary },
    parameterList: { marginTop: 12, gap: 2 },
    parameterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: sc.border,
      gap: 8,
    },
    parameterRowDisabled: { opacity: 0.55 },
    parameterToggle: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: sc.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? sc.background : '#FFF',
    },
    parameterToggleActive: {
      backgroundColor: sc.primary,
      borderColor: sc.primary,
    },
    parameterIcon: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.08),
    },
    parameterCopy: { flex: 1, minWidth: 70 },
    parameterName: { fontSize: 11, fontWeight: '800', color: sc.textPrimary },
    parameterDescription: { fontSize: 9, color: sc.textMuted, marginTop: 2 },
    parameterInputs: { flexDirection: 'row', gap: 5 },
    miniField: { width: 57 },
    miniFieldLabel: {
      fontSize: 8,
      fontWeight: '700',
      color: sc.textMuted,
      marginBottom: 3,
      textTransform: 'uppercase',
    },
    miniInputWrap: {
      flexDirection: 'row',
      height: 32,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: sc.border,
      borderRadius: 8,
      paddingHorizontal: 5,
      backgroundColor: isDark
        ? sc.background
        : ADMIN_THEME.colors.background.surface,
    },
    miniInput: {
      flex: 1,
      minWidth: 0,
      fontSize: 10,
      color: sc.textStrong,
      paddingVertical: 0,
    },
    miniSuffix: { fontSize: 9, color: sc.textMuted },
    weightWarning: {
      flexDirection: 'row',
      gap: 7,
      alignItems: 'flex-start',
      marginTop: 10,
      padding: 10,
      borderRadius: 10,
      backgroundColor: schoolColorWithAlpha(sc.warning, 0.1),
    },
    weightWarningText: {
      flex: 1,
      fontSize: 10,
      lineHeight: 15,
      color: sc.textSecondary,
    },
    liveCalculationCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: schoolColorWithAlpha(sc.primary, 0.2),
      backgroundColor: schoolColorWithAlpha(sc.primary, isDark ? 0.14 : 0.06),
    },
    liveCalculationIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.12),
    },
    liveCalculationCopy: { flex: 1 },
    liveCalculationLabel: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: sc.primary,
    },
    liveCalculationValue: {
      fontSize: 14,
      fontWeight: '800',
      color: sc.textStrong,
      marginTop: 2,
    },
    liveCalculationFormula: {
      fontSize: 10,
      lineHeight: 15,
      color: sc.textMuted,
      marginTop: 2,
    },
    examPickerContainer: { marginBottom: 12, width: '100%' },
    examPickerLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: sc.textSecondary,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    examPickerScroll: { paddingRight: 8, gap: 8 },
    examChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: isDark ? sc.card : '#FFF',
      borderWidth: 1,
      borderColor: sc.border,
      marginRight: 8,
    },
    examChipActive: {
      backgroundColor: sc.primary,
      borderColor: sc.primary,
    },
    examChipText: { fontSize: 13, fontWeight: '600', color: sc.textSecondary },
    examChipTextActive: { color: SCHOOL_CONFIG.theme.ribbonTitle },
    welcomeCard: {
      overflow: 'hidden',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: sc.border,
      backgroundColor: isDark ? sc.card : '#FFF',
      ...ADMIN_THEME.shadows.sm,
    },
    welcomeHero: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 24,
      gap: 16,
      borderBottomWidth: 1,
      borderBottomColor: sc.border,
    },
    welcomeIconWrap: {
      width: 62,
      height: 62,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? sc.card : '#FFF',
      ...ADMIN_THEME.shadows.sm,
    },
    welcomeCopy: { flex: 1 },
    welcomeEyebrow: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1,
      color: sc.primary,
    },
    welcomeTitle: {
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '800',
      color: sc.textStrong,
      marginTop: 4,
    },
    welcomeSubtitle: {
      fontSize: 12,
      lineHeight: 18,
      color: sc.textSecondary,
      marginTop: 5,
      maxWidth: 520,
    },
    workflowList: { padding: 20, gap: 10 },
    workflowItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 13,
      borderRadius: 14,
      backgroundColor: isDark
        ? sc.background
        : schoolColorWithAlpha(sc.primary, 0.035),
      borderWidth: 1,
      borderColor: sc.border,
    },
    workflowNumber: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: sc.primary,
      marginRight: 10,
    },
    workflowNumberText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
    workflowIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.1),
      marginRight: 11,
    },
    workflowCopy: { flex: 1 },
    workflowTitle: { fontSize: 13, fontWeight: '800', color: sc.textPrimary },
    workflowDescription: {
      fontSize: 11,
      lineHeight: 16,
      color: sc.textMuted,
      marginTop: 2,
    },
    featureStrip: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: sc.border,
      backgroundColor: isDark
        ? sc.background
        : ADMIN_THEME.colors.background.surface,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginRight: 8,
    },
    featureText: { fontSize: 10, fontWeight: '700', color: sc.textSecondary },
    batchEmptyCard: {
      alignItems: 'center',
      padding: 30,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: sc.border,
      backgroundColor: isDark ? sc.card : '#FFF',
      ...ADMIN_THEME.shadows.sm,
    },
    batchEmptyIcon: {
      width: 68,
      height: 68,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.1),
      marginBottom: 14,
    },
    batchFeatureGrid: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 9,
      marginTop: 22,
    },
    batchFeatureCard: {
      flexGrow: 1,
      flexBasis: 150,
      minWidth: 140,
      padding: 14,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: sc.border,
      backgroundColor: isDark
        ? sc.background
        : ADMIN_THEME.colors.background.surface,
    },
    batchFeatureTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: sc.textPrimary,
      marginTop: 8,
    },
    batchFeatureDescription: {
      fontSize: 9,
      lineHeight: 14,
      color: sc.textMuted,
      marginTop: 3,
    },
    batchLoadingCard: {
      minHeight: 360,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 30,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: sc.border,
      backgroundColor: isDark ? sc.card : '#FFF',
    },
    batchLoadingTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: sc.textStrong,
      marginTop: 14,
    },
    batchLoadingSubtitle: {
      maxWidth: 420,
      textAlign: 'center',
      fontSize: 11,
      lineHeight: 17,
      color: sc.textMuted,
      marginTop: 5,
    },
    batchReadyCard: {
      overflow: 'hidden',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: sc.border,
      backgroundColor: isDark ? sc.card : '#FFF',
      ...ADMIN_THEME.shadows.sm,
    },
    batchReadyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 18,
      borderBottomWidth: 1,
      borderBottomColor: sc.border,
    },
    batchReadyIcon: {
      width: 48,
      height: 48,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: schoolColorWithAlpha(sc.success, 0.12),
    },
    batchReadyTitle: { fontSize: 17, fontWeight: '800', color: sc.textStrong },
    batchReadySubtitle: { fontSize: 10, color: sc.textMuted, marginTop: 3 },
    batchStatsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      padding: 14,
    },
    batchStat: {
      flexGrow: 1,
      flexBasis: 110,
      minWidth: 100,
      padding: 11,
      borderRadius: 12,
      backgroundColor: isDark
        ? sc.background
        : ADMIN_THEME.colors.background.surface,
      borderWidth: 1,
      borderColor: sc.border,
    },
    batchStatValue: { fontSize: 18, fontWeight: '800', color: sc.textStrong },
    batchStatLabel: { fontSize: 9, color: sc.textMuted, marginTop: 2 },
    exportChoiceRow: { gap: 9, paddingHorizontal: 14, paddingBottom: 16 },
    exportChoice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      minHeight: 68,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 14,
      ...ADMIN_THEME.shadows.sm,
    },
    pdfChoice: { backgroundColor: sc.primary },
    excelChoice: { backgroundColor: '#147A45' },
    exportIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    exportChoiceCopy: { flex: 1 },
    exportChoiceTitle: { fontSize: 13, fontWeight: '800', color: '#FFF' },
    exportChoiceSubtitle: {
      fontSize: 9,
      lineHeight: 14,
      color: 'rgba(255,255,255,0.8)',
      marginTop: 2,
    },
    rosterHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: sc.border,
    },
    rosterTitle: { fontSize: 12, fontWeight: '800', color: sc.textPrimary },
    rosterCount: { fontSize: 9, fontWeight: '700', color: sc.textMuted },
    rosterList: { paddingHorizontal: 14, paddingBottom: 16 },
    rosterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: sc.border,
    },
    rosterNumber: {
      width: 26,
      height: 26,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.08),
      marginRight: 9,
    },
    rosterNumberText: { fontSize: 9, fontWeight: '800', color: sc.primary },
    rosterCopy: { flex: 1, minWidth: 0 },
    rosterName: { fontSize: 11, fontWeight: '800', color: sc.textPrimary },
    rosterMeta: { fontSize: 9, color: sc.textMuted, marginTop: 2 },
    rosterScore: {
      fontSize: 11,
      fontWeight: '800',
      color: sc.success,
      marginLeft: 8,
    },
    moreStudentsText: {
      textAlign: 'center',
      paddingVertical: 11,
      fontSize: 10,
      fontWeight: '700',
      color: sc.primary,
    },
    emptyCard: {
      alignItems: 'center',
      padding: 32,
      backgroundColor: isDark ? sc.card : '#FFF',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: sc.border,
    },
    emptyIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: sc.textPrimary,
    },
    emptySubtitle: {
      fontSize: 13,
      color: sc.textMuted,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 20,
    },
    previewWrap: { width: '100%' },
    studentSelectionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: sc.border,
      backgroundColor: isDark ? sc.card : '#FFF',
      marginBottom: 10,
      ...ADMIN_THEME.shadows.sm,
    },
    studentAvatar: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.12),
      marginRight: 11,
    },
    studentAvatarText: { fontSize: 14, fontWeight: '800', color: sc.primary },
    studentSelectionCopy: { flex: 1, minWidth: 0 },
    selectedLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    selectedLabel: {
      fontSize: 8,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: sc.success,
    },
    selectedStudentName: {
      fontSize: 15,
      fontWeight: '800',
      color: sc.textStrong,
      marginTop: 2,
    },
    selectedStudentMeta: { fontSize: 10, color: sc.textMuted, marginTop: 2 },
    changeStudentButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 9,
      backgroundColor: schoolColorWithAlpha(sc.primary, 0.08),
      marginLeft: 8,
    },
    changeStudentText: { fontSize: 10, fontWeight: '800', color: sc.primary },
    calculationOverview: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    overviewStat: {
      flexGrow: 1,
      flexBasis: 130,
      minWidth: 120,
      padding: 11,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: sc.border,
      backgroundColor: isDark ? sc.card : '#FFF',
    },
    overviewDot: { width: 18, height: 3, borderRadius: 99, marginBottom: 7 },
    overviewLabel: {
      fontSize: 9,
      fontWeight: '700',
      color: sc.textMuted,
      textTransform: 'uppercase',
    },
    overviewValue: {
      fontSize: 15,
      fontWeight: '800',
      color: sc.textStrong,
      marginTop: 3,
    },
    paperSheet: {
      width: '100%',
      backgroundColor: isDark ? sc.card : sc.surface,
      borderRadius: 10,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: sc.border,
      ...ADMIN_THEME.shadows.md,
    },
    letterhead: {
      paddingVertical: 16,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    logoCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    logoImg: { width: 36, height: 36, resizeMode: 'contain' },
    letterheadCenter: { flex: 1, alignItems: 'center' },
    schoolName: {
      fontSize: 16,
      fontWeight: '800',
      color: SCHOOL_CONFIG.theme.ribbonTitle,
      letterSpacing: 0.4,
      textAlign: 'center',
      textTransform: 'uppercase',
    },
    tagline: {
      fontSize: 11,
      color: SCHOOL_CONFIG.theme.ribbonTagline,
      marginTop: 2,
      fontWeight: '600',
    },
    contactLine: {
      fontSize: 10,
      color: SCHOOL_CONFIG.theme.ribbonBodyMuted,
      marginTop: 4,
      textAlign: 'center',
    },
    accentBar: { height: 3, backgroundColor: SCHOOL_CONFIG.theme.accent },
    titleBand: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: sc.border,
    },
    examTitle: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: sc.primaryDark || sc.primary,
      flex: 1,
      paddingRight: 8,
    },
    yearText: {
      fontSize: 12,
      fontWeight: '600',
      color: sc.textSecondary,
    },
    detailsGrid: {
      padding: 14,
      flexDirection: 'row',
      flexWrap: 'wrap',
      backgroundColor: schoolColorWithAlpha(sc.primary, isDark ? 0.08 : 0.04),
      gap: 4,
    },
    detailItem: { width: '50%', paddingVertical: 6, paddingHorizontal: 4 },
    detailLabel: {
      fontSize: 10,
      color: sc.textMuted,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    detailValue: {
      fontSize: 13,
      color: sc.textStrong,
      fontWeight: '700',
      marginTop: 2,
    },
    tableContainer: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: sc.primaryDark || sc.primary,
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: 6,
      marginBottom: 2,
    },
    th: {
      color: SCHOOL_CONFIG.theme.ribbonTitle,
      fontWeight: '700',
      fontSize: 12,
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: sc.border,
    },
    rowAlt: { backgroundColor: schoolColorWithAlpha(sc.primary, 0.05) },
    td: { color: sc.textPrimary, fontSize: 13, fontWeight: '500' },
    colSubject: { flex: 2.2 },
    colMarks: { flex: 1, textAlign: 'center' },
    colGrade: { flex: 1, textAlign: 'center' },
    finalMark: { color: sc.primary, fontWeight: '800' },
    textDanger: { color: sc.danger, fontWeight: '700' },
    textMuted: { color: sc.textMuted },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      padding: 12,
    },
    statCard: {
      flexGrow: 1,
      flexBasis: '45%',
      minWidth: 120,
      borderWidth: 1,
      borderColor: sc.border,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: 'center',
      backgroundColor: isDark ? sc.background : '#FFF',
    },
    statLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: sc.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    statValue: {
      fontSize: 15,
      fontWeight: '800',
      color: sc.textStrong,
    },
    resultBadge: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 999,
    },
    badgePass: { backgroundColor: schoolColorWithAlpha(sc.success, 0.18) },
    badgeFail: { backgroundColor: schoolColorWithAlpha(sc.danger, 0.14) },
    badgePending: { backgroundColor: schoolColorWithAlpha(sc.warning, 0.18) },
    textPass: { color: sc.success },
    textFail: { color: sc.danger },
    textPending: { color: sc.warning },
    resultText: {
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    pendingNote: {
      textAlign: 'center',
      fontSize: 12,
      color: sc.warning,
      fontWeight: '600',
      paddingBottom: 8,
    },
    footerSignatures: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 36,
      paddingBottom: 20,
    },
    signBox: {
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: sc.textMuted,
      width: '28%',
      paddingTop: 8,
    },
    signLabel: {
      fontSize: 10,
      color: sc.textSecondary,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    watermark: {
      position: 'absolute',
      top: '42%',
      left: '50%',
      transform: [{ translateX: -130 }, { translateY: -130 }],
      zIndex: 0,
      opacity: 0.08,
    },
    watermarkImg: {
      width: 260,
      height: 260,
      resizeMode: 'contain',
    },
    printBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 28 : 16,
      backgroundColor: schoolColorWithAlpha(sc.background, 0.94),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: sc.border,
    },
    printBtn: {
      width: '100%',
      maxWidth: 860,
      alignSelf: 'center',
      borderRadius: 12,
      overflow: 'hidden',
      ...ADMIN_THEME.shadows.md,
    },
    printGradient: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 14,
      gap: 10,
    },
    printText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  });
