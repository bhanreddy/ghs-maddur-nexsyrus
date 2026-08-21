import type { ExamAnalyticsSubject } from '../services/examAnalyticsService';
import { buildExamAnalyticsSeries, isStudentInsideClassRange } from './examAnalytics';

const subject = (overrides: Partial<ExamAnalyticsSubject>): ExamAnalyticsSubject => ({
  subject_id: 'subject-1',
  subject_name: 'Mathematics',
  assessment_schema: 'consolidated',
  max_marks: 25,
  total_students: 3,
  graded_students: 3,
  lowest_score: 10,
  highest_score: 23,
  average_score: 17,
  student_score: 19,
  lowest_percentage: 40,
  highest_percentage: 92,
  average_percentage: 68,
  student_percentage: 76,
  student_status: 'graded',
  ...overrides,
});

describe('exam analytics chart', () => {
  it('aligns highest, average, lowest and student score lines', () => {
    const result = buildExamAnalyticsSeries([subject({})], 'score');
    expect(result.highest[0].value).toBe(23);
    expect(result.average[0].value).toBe(17);
    expect(result.lowest[0].value).toBe(10);
    expect(result.student[0].value).toBe(19);
    expect(result.maximumValue).toBe(30);
  });

  it('normalizes mixed assessment maximums to a 100 percent axis', () => {
    const result = buildExamAnalyticsSeries([
      subject({ max_marks: 25 }),
      subject({ subject_id: 'subject-2', max_marks: 50 }),
    ], 'percentage');
    expect(result.maximumValue).toBe(100);
    expect(result.student[0].value).toBe(76);
  });

  it('keeps a graded student between the observed class minimum and maximum', () => {
    expect(isStudentInsideClassRange(subject({ student_score: 19 }))).toBe(true);
    expect(isStudentInsideClassRange(subject({ student_score: null }))).toBeNull();
  });
});
