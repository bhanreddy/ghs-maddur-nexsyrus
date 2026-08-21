export type AssessmentSchema = 'component' | 'consolidated';

export type ComponentField =
  | 'participation'
  | 'writtenWork'
  | 'projectWork'
  | 'slipTest';

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

export const COMPONENT_MAXIMUMS: Record<ComponentField, number> = {
  participation: 10,
  writtenWork: 10,
  projectWork: 10,
  slipTest: 20,
};

export const COMPONENT_TOTAL_MAX = 50;
// A score out of 50 normalized into a 20-mark contribution: score / 50 * 20.
export const COMPONENT_WEIGHTAGE = 20 / COMPONENT_TOTAL_MAX;
export const DEFAULT_CONSOLIDATED_MAX = 25;

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

export function gradeForPercentage(percentage: number): AssessmentGrade {
  const normalized = Math.max(0, Math.min(100, percentage));
  return GRADE_BANDS.find((band) => normalized >= band.minimum)?.grade ?? 'D2';
}

export function gpaForPercentage(percentage: number): number {
  const normalized = Math.max(0, Math.min(100, percentage));
  return GRADE_BANDS.find((band) => normalized >= band.minimum)?.gpa ?? 4;
}

export function calculateComponentAssessment(input: ComponentAssessmentInput): AssessmentResult & {
  weightage: number;
} {
  const obtained = (Object.keys(COMPONENT_MAXIMUMS) as ComponentField[]).reduce(
    (total, field) => total + parseAssessmentNumber(input[field]),
    0,
  );
  const percentage = (obtained / COMPONENT_TOTAL_MAX) * 100;

  return {
    obtained,
    maximum: COMPONENT_TOTAL_MAX,
    weightage: obtained * COMPONENT_WEIGHTAGE,
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
  if (!/^\d*(?:\.\d{0,2})?$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= maximum;
}

export function isComponentAssessmentComplete(input: ComponentAssessmentInput): boolean {
  return (Object.keys(COMPONENT_MAXIMUMS) as ComponentField[]).every(
    (field) => input[field] !== '',
  );
}

export function hasAnyComponentMark(input: ComponentAssessmentInput): boolean {
  return (Object.keys(COMPONENT_MAXIMUMS) as ComponentField[]).some(
    (field) => input[field] !== '',
  );
}
