import { rankAssessmentScores } from '../assessmentGrading';

/** Adapt print rows to the existing frontend ranking policy. */
export function rankResultRows(rows, method = 'competition') {
  const finite = (value, fallback) => value == null || !Number.isFinite(Number(value)) ? fallback : Number(value);
  const ranks = rankAssessmentScores(rows.map((row) => ({
    id: String(row.student_id), score: finite(row.percentage, 0),
    attendancePercentage: finite(row.attendance_percentage, null),
  })), method);
  return rows.map((row) => ({ ...row, rank: ranks[String(row.student_id)] }));
}
