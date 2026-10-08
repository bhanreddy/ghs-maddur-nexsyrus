import { hasSavedMark, normalizeAssessmentSubjects, subjectObtained } from './totals.js';
import { componentMaximumsFromRow } from './componentMaximums.js';

const fields = ['participation_marks', 'written_work_marks', 'project_work_marks', 'slip_test_marks'];
const finiteMark = (value) => value == null || value === '' || !Number.isFinite(Number(value))
  ? null : Number(value);

/** Frontend print policy only: 7.2/7.3 => 7; 7.5 through 7.99 => 7.5. */
export function floorPrintMark(value) {
  const mark = finiteMark(value);
  return mark === null ? null : Math.floor(mark * 2 + 1e-9) / 2;
}

/** Build fresh rows on every preview, so toggling never changes source marks. */
export function assessmentPrintSubjects(papers = [], subjects = [], marksMode = 'original') {
  const identity = (row) => String(row.exam_subject_id ?? row.subject_id);
  const byId = new Map(papers.map((paper) => [identity(paper), paper]));
  return normalizeAssessmentSubjects(papers, subjects).map((subject) => {
    if (!hasSavedMark(subject) || subject.is_absent || subject.isAbsent) return subject;
    const component = subject.assessment_schema === 'component';
    const adjusted = { ...subject };
    const passField = component ? 'slip_test_marks' : 'marks_obtained';
    for (const field of component ? fields : ['marks_obtained']) {
      const original = finiteMark(subject[field]);
      if (original === null) continue;
      const maximum = component
        ? componentMaximumsFromRow({ ...subject, ...byId.get(identity(subject)) }).slip_test
        : Number(subject.max_marks);
      const rounded = floorPrintMark(original);
      // Passing mode still promises at least 36%. Use the smallest half mark
      // meeting that threshold (20 * 36% = 7.2 -> 7.5); never raise missing/AB.
      const minimum = maximum > 0 ? Math.ceil(maximum * 0.36 * 2 - 1e-9) / 2 : null;
      adjusted[field] = marksMode === 'passing_criteria' && field === passField && minimum !== null
        ? Math.max(rounded, minimum) : rounded;
    }
    return { ...adjusted, marks_obtained: subjectObtained(adjusted) };
  });
}
