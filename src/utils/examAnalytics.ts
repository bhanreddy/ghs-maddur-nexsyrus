import type { ExamAnalyticsSubject } from '../services/examAnalyticsService';

export type ExamAnalyticsScale = 'score' | 'percentage';

export interface AnalyticsChartPoint {
  value?: number;
  label: string;
  dataPointText?: string;
  hideDataPoint?: boolean;
}

export interface ExamAnalyticsSeries {
  highest: AnalyticsChartPoint[];
  average: AnalyticsChartPoint[];
  lowest: AnalyticsChartPoint[];
  student: AnalyticsChartPoint[];
  maximumValue: number;
}

const shortSubjectLabel = (subjectName: string): string => {
  const trimmed = subjectName.trim();
  if (trimmed.length <= 10) return trimmed;
  const initials = trimmed.split(/\s+/).map((part) => part[0]).join('').toUpperCase();
  return initials.length >= 2 ? initials.slice(0, 6) : `${trimmed.slice(0, 8)}…`;
};

const point = (value: number | null, label: string): AnalyticsChartPoint => ({
  value: value ?? undefined,
  label,
  dataPointText: value == null ? undefined : Number(value.toFixed(1)).toString(),
  hideDataPoint: value == null,
});

/** Builds the four aligned chart lines from the server's subject statistics. */
export function buildExamAnalyticsSeries(
  subjects: ExamAnalyticsSubject[],
  scale: ExamAnalyticsScale,
): ExamAnalyticsSeries {
  const scoreKey = scale === 'percentage' ? '_percentage' : '_score';
  const valueFor = (
    subject: ExamAnalyticsSubject,
    series: 'highest' | 'average' | 'lowest' | 'student',
  ): number | null => subject[`${series}${scoreKey}` as keyof ExamAnalyticsSubject] as number | null;

  const labels = subjects.map((subject) => shortSubjectLabel(subject.subject_name));
  const highest = subjects.map((subject, index) => point(valueFor(subject, 'highest'), labels[index]));
  const average = subjects.map((subject, index) => point(valueFor(subject, 'average'), labels[index]));
  const lowest = subjects.map((subject, index) => point(valueFor(subject, 'lowest'), labels[index]));
  const student = subjects.map((subject, index) => point(valueFor(subject, 'student'), labels[index]));
  const rawMaximum = scale === 'percentage'
    ? 100
    : Math.max(
      0,
      ...subjects.flatMap((subject) => [
        subject.max_marks,
        subject.highest_score ?? 0,
        subject.student_score ?? 0,
      ]),
    );

  return {
    highest,
    average,
    lowest,
    student,
    maximumValue: Math.max(10, Math.ceil(rawMaximum / 10) * 10),
  };
}

export function isStudentInsideClassRange(subject: ExamAnalyticsSubject): boolean | null {
  if (
    subject.student_score == null
    || subject.lowest_score == null
    || subject.highest_score == null
  ) return null;
  return subject.student_score >= subject.lowest_score
    && subject.student_score <= subject.highest_score;
}
