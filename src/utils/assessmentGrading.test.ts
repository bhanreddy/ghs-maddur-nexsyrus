import {
  calculateComponentAssessment,
  calculateConsolidatedAssessment,
  calculateAssessmentSummary,
  gradeForPercentage,
  isAbsentAssessmentInput,
  isComponentAssessmentAbsent,
  isValidAssessmentInput,
  normalizeAssessmentInput,
  rankAssessmentScores,
} from './assessmentGrading';

describe('assessment grading', () => {
  it('calculates component totals, weightage, percentage, GPA and grade', () => {
    expect(calculateComponentAssessment({
      participation: '10',
      writtenWork: '9',
      projectWork: '8.5',
      slipTest: '16.5',
    })).toEqual({
      obtained: 44,
      maximum: 50,
      weightage: 17.6,
      percentage: 88,
      grade: 'B1',
      gpa: 9,
    });
  });

  it('uses teacher-configured component maximums for percentage and weightage', () => {
    expect(calculateComponentAssessment({
      participation: '20',
      writtenWork: '20',
      projectWork: '10',
      slipTest: '30',
    }, {
      participation: 20,
      writtenWork: 20,
      projectWork: 20,
      slipTest: 40,
    })).toMatchObject({
      obtained: 80,
      maximum: 100,
      weightage: 16,
      percentage: 80,
      grade: 'B2',
      gpa: 8,
    });
  });

  it('calculates consolidated values against a configurable maximum', () => {
    expect(calculateConsolidatedAssessment('18', '25')).toMatchObject({
      obtained: 18,
      maximum: 25,
      percentage: 72,
      grade: 'B2',
      gpa: 8,
    });
  });

  it.each([
    [91, 'A1'], [81, 'B1'], [71, 'B2'], [61, 'C1'],
    [51, 'C2'], [41, 'D1'], [40, 'D2'],
  ])('maps %s percent to %s', (percentage, grade) => {
    expect(gradeForPercentage(percentage as number)).toBe(grade);
  });

  it('uses competition ranking for tied scores', () => {
    expect(rankAssessmentScores([
      { id: 'a', score: 24 },
      { id: 'b', score: 24 },
      { id: 'c', score: 24 },
      { id: 'd', score: 10 },
    ])).toEqual({ a: 1, b: 1, c: 1, d: 4 });
  });

  it('uses attendance to break equal-score ties', () => {
    expect(rankAssessmentScores([
      { id: 'a', score: 90, attendancePercentage: 92 },
      { id: 'b', score: 90, attendancePercentage: 98 },
      { id: 'c', score: 80, attendancePercentage: 100 },
    ], 'attendance_tiebreak')).toEqual({ b: 1, a: 2, c: 3 });
  });

  it('supports consecutive dense ranks without gaps', () => {
    expect(rankAssessmentScores([
      { id: 'a', score: 90 },
      { id: 'b', score: 90 },
      { id: 'c', score: 80 },
      { id: 'd', score: 70 },
    ], 'dense')).toEqual({ a: 1, b: 1, c: 2, d: 3 });
  });

  it('calculates cumulative report-card totals and average grade across subjects', () => {
    const summary = calculateAssessmentSummary([
      calculateConsolidatedAssessment(24, 25),
      calculateConsolidatedAssessment(18, 25),
      calculateConsolidatedAssessment(20, 25),
    ]);
    expect(summary).toMatchObject({
      obtained: 62,
      maximum: 75,
      subjectCount: 3,
      averageGrade: 'B1',
      gpa: 9,
    });
    expect(summary.percentage).toBeCloseTo(82.67, 2);
  });

  it('rejects negative, malformed and over-maximum values', () => {
    expect(isValidAssessmentInput('10', 10)).toBe(true);
    expect(isValidAssessmentInput('10.25', 10)).toBe(false);
    expect(isValidAssessmentInput('-1', 10)).toBe(false);
    expect(isValidAssessmentInput('abc', 10)).toBe(false);
  });

  it('accepts decimal marks and normalizes mobile locale separators', () => {
    expect(isValidAssessmentInput('8.5', 10)).toBe(true);
    expect(isValidAssessmentInput('7.25', 10)).toBe(true);
    expect(normalizeAssessmentInput('7,25')).toBe('7.25');
    expect(normalizeAssessmentInput('7٫25')).toBe('7.25');
  });

  it('accepts A as an absent mark, displays it uppercase, and calculates it as zero', () => {
    expect(normalizeAssessmentInput('a')).toBe('A');
    expect(isValidAssessmentInput('A', 10)).toBe(true);
    expect(isAbsentAssessmentInput('a')).toBe(true);
    expect(calculateConsolidatedAssessment('A', 25).obtained).toBe(0);
    expect(calculateComponentAssessment({
      participation: 'A',
      writtenWork: 'A',
      projectWork: 'A',
      slipTest: 'A',
    }).obtained).toBe(0);
    expect(isComponentAssessmentAbsent({
      participation: 'A',
      writtenWork: 'A',
      projectWork: 'A',
      slipTest: 'A',
    })).toBe(true);
  });
});
