export type AssessmentSchema = 'component' | 'consolidated';

export type ComponentField =
  | 'participation'
  | 'writtenWork'
  | 'projectWork'
  | 'slipTest';

export type ComponentMaximums = Record<ComponentField, number>;

export interface ComponentAssessmentInput {
  participation: string;
  writtenWork: string;
  projectWork: string;
  slipTest: string;
}

export interface AssessmentResult {
  obtained: number;
  maximum: number;
  percentage: number;
  grade: AssessmentGrade;
  gpa: number;
}

export interface AssessmentSummary extends AssessmentResult {
  subjectCount: number;
  averageGrade: AssessmentGrade;
}

export type AssessmentGrade = 'A1' | 'B1' | 'B2' | 'C1' | 'C2' | 'D1' | 'D2';
export type ResultRankingMethod = 'competition' | 'attendance_tiebreak' | 'dense';

export interface RankableAssessmentScore {
  id: string;
  score: number;
  attendancePercentage?: number | null;
}

export const COMPONENT_FIELDS: ComponentField[] = [
  'participation',
  'writtenWork',
  'projectWork',
  'slipTest',
];

export const DEFAULT_COMPONENT_MAXIMUMS: ComponentMaximums = {
  participation: 10,
  writtenWork: 10,
  projectWork: 10,
  slipTest: 20,
};

export const COMPONENT_MAXIMUMS = DEFAULT_COMPONENT_MAXIMUMS;

export const COMPONENT_TOTAL_MAX = 50;
export const COMPONENT_WEIGHTAGE = 20 / COMPONENT_TOTAL_MAX;
export const DEFAULT_CONSOLIDATED_MAX = 25;
export const COMPONENT_WEIGHTAGE_SCALE = 20;
export const ABSENT_MARK = 'A';
const ABSENT_MARKS = new Set([ABSENT_MARK, 'AB']);

export const EMPTY_COMPONENT_MARKS: ComponentAssessmentInput = {
  participation: '',
  writtenWork: '',
  projectWork: '',
  slipTest: '',
};

const GRADE_BANDS: { minimum: number; grade: AssessmentGrade; gpa: number }[] = [
  { minimum: 91, grade: 'A1', gpa: 10 },
  { minimum: 81, grade: 'B1', gpa: 9 },
  { minimum: 71, grade: 'B2', gpa: 8 },
  { minimum: 61, grade: 'C1', gpa: 7 },
  { minimum: 51, grade: 'C2', gpa: 6 },
  { minimum: 41, grade: 'D1', gpa: 5 },
  { minimum: 0, grade: 'D2', gpa: 4 },
];

export function parseAssessmentNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function componentTotalMax(maximums: ComponentMaximums = DEFAULT_COMPONENT_MAXIMUMS): number {
  return COMPONENT_FIELDS.reduce((total, field) => total + maximums[field], 0);
}

export function stringifyComponentMaximums(
  maximums: ComponentMaximums = DEFAULT_COMPONENT_MAXIMUMS,
): Record<ComponentField, string> {
  return {
    participation: String(maximums.participation),
    writtenWork: String(maximums.writtenWork),
    projectWork: String(maximums.projectWork),
    slipTest: String(maximums.slipTest),
  };
}

export function parseComponentMaximums(
  input?: Partial<Record<ComponentField, string | number>> | null,
): ComponentMaximums {
  const next = { ...DEFAULT_COMPONENT_MAXIMUMS };
  COMPONENT_FIELDS.forEach((field) => {
    const raw = input?.[field];
    if (raw == null || raw === '') return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 999) {
      next[field] = parsed;
    }
  });
  return next;
}

export function gradeForPercentage(percentage: number): AssessmentGrade {
  const normalized = Math.max(0, Math.min(100, percentage));
  return GRADE_BANDS.find((band) => normalized >= band.minimum)?.grade ?? 'D2';
}

export function gpaForPercentage(percentage: number): number {
  const normalized = Math.max(0, Math.min(100, percentage));
  return GRADE_BANDS.find((band) => normalized >= band.minimum)?.gpa ?? 4;
}

export function calculateComponentAssessment(
  input: ComponentAssessmentInput,
  maximums: ComponentMaximums = DEFAULT_COMPONENT_MAXIMUMS,
): AssessmentResult & {
  weightage: number;
} {
  const obtained = COMPONENT_FIELDS.reduce(
    (total, field) => total + parseAssessmentNumber(input[field]),
    0,
  );
  const maximum = componentTotalMax(maximums);
  const percentage = maximum > 0 ? (obtained / maximum) * 100 : 0;
  const weightageScale = maximum > 0 ? COMPONENT_WEIGHTAGE_SCALE / maximum : 0;

  return {
    obtained,
    maximum,
    weightage: obtained * weightageScale,
    percentage,
    grade: gradeForPercentage(percentage),
    gpa: gpaForPercentage(percentage),
  };
}

export function calculateConsolidatedAssessment(
  marksObtained: string | number,
  maxMarks: string | number = DEFAULT_CONSOLIDATED_MAX,
): AssessmentResult {
  const obtained = parseAssessmentNumber(marksObtained);
  const maximum = Math.max(0, parseAssessmentNumber(maxMarks));
  const percentage = maximum > 0 ? (obtained / maximum) * 100 : 0;

  return {
    obtained,
    maximum,
    percentage,
    grade: gradeForPercentage(percentage),
    gpa: gpaForPercentage(percentage),
  };
}

/** Rolls subject results into the report-card grand total and average grade. */
export function calculateAssessmentSummary(subjects: AssessmentResult[]): AssessmentSummary {
  const obtained = subjects.reduce((total, subject) => total + subject.obtained, 0);
  const maximum = subjects.reduce((total, subject) => total + subject.maximum, 0);
  const percentage = maximum > 0 ? (obtained / maximum) * 100 : 0;
  const grade = gradeForPercentage(percentage);

  return {
    obtained,
    maximum,
    percentage,
    grade,
    averageGrade: grade,
    gpa: gpaForPercentage(percentage),
    subjectCount: subjects.length,
  };
}

/**
 * Applies the school-selected result ranking policy.
 * competition: 1, 1, 1, 4; dense: 1, 1, 1, 2; attendance breaks mark ties.
 */
export function rankAssessmentScores(
  scores: RankableAssessmentScore[],
  method: ResultRankingMethod = 'competition',
): Record<string, number> {
  const sorted = [...scores].sort((a, b) => {
    const scoreDifference = b.score - a.score;
    if (scoreDifference !== 0) return scoreDifference;
    if (method === 'attendance_tiebreak') {
      const attendanceDifference = (b.attendancePercentage ?? -1) - (a.attendancePercentage ?? -1);
      if (attendanceDifference !== 0) return attendanceDifference;
    }
    return a.id.localeCompare(b.id);
  });
  const ranks: Record<string, number> = {};
  let previousKey: string | undefined;
  let previousRank = 0;
  let denseRank = 0;

  sorted.forEach((entry, index) => {
    const tieKey = method === 'attendance_tiebreak'
      ? `${entry.score}:${entry.attendancePercentage ?? 'missing'}`
      : String(entry.score);
    if (previousKey === undefined || tieKey !== previousKey) {
      denseRank += 1;
      previousRank = method === 'dense' ? denseRank : index + 1;
      previousKey = tieKey;
    }
    ranks[entry.id] = previousRank;
  });

  return ranks;
}

export function isValidAssessmentInput(value: string, maximum: number): boolean {
  if (value === '') return true;
  if (isAbsentAssessmentInput(value)) return true;
  if (!/^\d*(?:\.\d{0,2})?$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= maximum;
}

/** Normalize decimal separators and the absence marker entered from mobile keyboards. */
export function normalizeAssessmentInput(value: string): string {
  return value.trim().replace(/[,\u066B]/g, '.').toUpperCase();
}

export function isAbsentAssessmentInput(value: string | null | undefined): boolean {
  return typeof value === 'string' && ABSENT_MARKS.has(value.trim().toUpperCase());
}

export function isComponentAssessmentAbsent(input: ComponentAssessmentInput): boolean {
  return COMPONENT_FIELDS.some((field) => isAbsentAssessmentInput(input[field]));
}

export function updateComponentAssessmentInput(
  input: ComponentAssessmentInput,
  field: ComponentField,
  value: string,
): ComponentAssessmentInput {
  return { ...input, [field]: value };
}

export function isComponentAssessmentComplete(input: ComponentAssessmentInput): boolean {
  return COMPONENT_FIELDS.every((field) => input[field] !== '');
}

export function hasAnyComponentMark(input: ComponentAssessmentInput): boolean {
  return COMPONENT_FIELDS.some((field) => input[field] !== '');
}
