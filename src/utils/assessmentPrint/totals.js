import { hasScienceAlternatives, scienceAlternativeKind, selectScienceAlternative } from './science.js';

import { subjectContribution as coreContribution, subjectPercentage,
  summarizeStudentMarks as coreTotals, examTotalMaximum as coreMaximum } from '../marksTotals';
export { subjectPercentage };

// Print-only adapters resolve component fields and EVS/Science before using
// the same arithmetic as other frontend reports. They never write saved data.
/** Marks are DECIMAL(5,2); summing in hundredths keeps the arithmetic exact. */
const SCALE = 100;

export const MARK_ENTRY_STATUS = Object.freeze({
  GRADED: 'graded',
  ABSENT: 'absent',
  MISSING: 'missing',
});

/** postgres.js returns DECIMAL columns as strings, so coerce before arithmetic. */
function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const toHundredths = (value) => Math.round(value * SCALE);
const fromHundredths = (value) => value / SCALE;

/** A marks row exists. Accepts every shape the progress-report queries return. */
export function hasSavedMark(subject) {
  return subject?.mark_id != null
    || subject?.hasMarks === true
    || subject?.has_marks === true;
}

function isAbsent(subject) {
  return subject?.is_absent === true || subject?.isAbsent === true;
}

export function subjectMaximum(subject) {
  return finiteNumber(subject?.max_marks);
}

export function subjectObtained(subject) {
  if (subject?.assessment_schema === 'component') {
    const values = ['participation_marks', 'written_work_marks', 'project_work_marks', 'slip_test_marks']
      .map((field) => subject[field]);
    const numbers = values.map(finiteNumber);
    // Individual component absences are stored as null and contribute zero;
    // an entirely empty component row must not fall back to a stale total.
    if (numbers.every((value) => value === null)) return null;
    if (values.some((value, index) => value != null && value !== '' && numbers[index] === null)) return null;
    return fromHundredths(numbers.reduce((total, value) => total + (value === null ? 0 : toHundredths(value)), 0));
  }
  return finiteNumber(subject?.marks_obtained);
}

/** Resolve paper schema before deriving totals, grades, filters or display cells. */
export function normalizeAssessmentSubjects(papers = [], subjects = []) {
  const identity = (row) => row?.exam_subject_id ?? row?.subject_id;
  const paperById = new Map(papers.filter((paper) => identity(paper) != null)
    .map((paper) => [String(identity(paper)), paper]));
  return subjects.map((subject) => {
    const paper = paperById.get(String(identity(subject)));
    const resolved = {
      ...subject,
      assessment_schema: paper?.assessment_schema ?? subject.assessment_schema,
      max_marks: paper?.max_marks ?? subject.max_marks,
      subject_name: paper?.subject_name ?? subject.subject_name,
    };
    return { ...resolved, marks_obtained: subjectObtained(resolved) };
  });
}

const subjectIdentity = (row) => String(row?.exam_subject_id ?? row?.subject_id ?? row?.subject_name);
const marksAvailability = (row) => {
  const contribution = subjectContribution(row);
  return !contribution.counted ? 0 : contribution.status === MARK_ENTRY_STATUS.ABSENT ? 1 : 2;
};

/** The original marks stay available to display; only these rows enter overall results. */
export function selectScoringSubjects(papers = [], subjects = []) {
  const rows = normalizeAssessmentSubjects(papers, uniqueSubjects(subjects));
  const byPaper = new Map(rows.map((row) => [subjectIdentity(row), row]));
  const selectedPapers = selectScienceAlternative(papers, (paper) => marksAvailability(byPaper.get(subjectIdentity(paper))));
  const excluded = new Set(papers.filter((paper) => !selectedPapers.includes(paper)).map(subjectIdentity));
  return {
    papers: selectedPapers,
    subjects: papers.length ? rows.filter((row) => !excluded.has(subjectIdentity(row)))
      : selectScienceAlternative(rows, marksAvailability),
  };
}

/** Hide an unused EVS/Science alternative across the cohort, while preserving every entered value. */
export function displayAssessmentPapers(papers = [], students = []) {
  if (!hasScienceAlternatives(papers) || !students.length) return papers;
  const entered = new Set();
  const containsValue = (value) => value != null && value !== '';
  for (const student of students) {
    for (const row of normalizeAssessmentSubjects(papers, student.subjects || [])) {
      if (!hasSavedMark(row)) continue;
      const fields = row.assessment_schema === 'component'
        ? ['participation_marks', 'written_work_marks', 'project_work_marks', 'slip_test_marks']
        : ['marks_obtained'];
      if (isAbsent(row) || fields.some((field) => containsValue(row[field]))) entered.add(subjectIdentity(row));
    }
    // A summative row can display its FA contribution even before the exam
    // mark is entered. Preserve that column as well.
    for (const row of student.summative_subjects || []) {
      if (row.exam_absent || containsValue(row.exam_marks) || containsValue(row.formative_contribution)) {
        entered.add(subjectIdentity(row));
      }
    }
  }
  const alternatives = papers.filter((paper) => scienceAlternativeKind(paper.subject_name));
  if (!alternatives.some((paper) => entered.has(subjectIdentity(paper)))) return papers;
  return papers.filter((paper) => !scienceAlternativeKind(paper.subject_name) || entered.has(subjectIdentity(paper)));
}

export function markEntryStatus(subject) {
  if (!hasSavedMark(subject)) return MARK_ENTRY_STATUS.MISSING;
  return isAbsent(subject) ? MARK_ENTRY_STATUS.ABSENT : MARK_ENTRY_STATUS.GRADED;
}

/** One subject's contribution to the grand total, or why it cannot contribute. */
const toCoreSubject = (subject) => ({
  maxMarks: subject?.max_marks,
  obtained: subjectObtained(subject),
  hasMarks: hasSavedMark(subject),
  isAbsent: isAbsent(subject),
});

export function subjectContribution(subject) {
  const result = coreContribution(toCoreSubject(subject));
  return { ...result, exclusion_reason: result.exclusionReason };
}

/** Full configured maximum for an exam, used for headers and completeness. */
export function examTotalMaximum(papers = []) {
  if (!Array.isArray(papers)) return 0;
  return coreMaximum(selectScienceAlternative(papers).map(toCoreSubject));
}

/** Drops repeated rows for the same paper so a duplicate join cannot inflate totals. */
function uniqueSubjects(subjects) {
  if (!Array.isArray(subjects)) return [];
  const seen = new Set();
  return subjects.filter((subject) => {
    const key = subject?.exam_subject_id ?? subject?.mark_id ?? subject?.subject_id;
    if (key == null) return true;
    const identity = String(key);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

/**
 * Grand total, maximum and percentage for one student in one examination.
 *
 * @param {object} input
 * @param {Array} [input.papers] every configured exam paper for the class
 * @param {Array} [input.subjects] the student's rows, one per paper
 */
export function summarizeStudentMarks({ papers = [], subjects = [] } = {}) {
  const selected = selectScoringSubjects(papers, subjects);
  const byId = new Map(selected.subjects.map((subject) => [subjectIdentity(subject), subject]));
  const rows = selected.papers.length
    ? selected.papers.map((paper) => byId.get(subjectIdentity(paper)) ?? paper)
    : selected.subjects;
  const result = coreTotals(rows.map(toCoreSubject));
  return {
    total_obtained: result.totalObtained, total_max: result.totalMax,
    percentage: result.percentage, exam_total_max: result.examTotalMax,
    subject_count: result.subjectCount, entered_subjects: result.enteredSubjects,
    counted_subjects: result.countedSubjects, graded_subjects: result.gradedSubjects,
    absent_subjects: result.absentSubjects, missing_subjects: result.missingSubjects,
    unassessable_subjects: result.unassessableSubjects, is_complete: result.isComplete,
    exceeds_maximum: result.exceedsMaximum,
  };
}

/** Class headings follow the selected alternatives, including differing EVS/Science maxima. */
export function examMaximumForStudents(papers = [], students = []) {
  const maximums = [...new Set(students.map((student) =>
    summarizeStudentMarks({ papers, subjects: student.subjects }).exam_total_max))].sort((a, b) => a - b);
  return maximums.length > 1 ? maximums.join(' / ') : maximums[0] ?? examTotalMaximum(papers);
}

