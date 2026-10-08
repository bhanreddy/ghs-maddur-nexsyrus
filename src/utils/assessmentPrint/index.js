import { buildAssessmentMarksPrint } from './render.js';
import { assessmentPrintSubjects } from './marks.js';
import { displayAssessmentPapers, selectScoringSubjects, summarizeStudentMarks } from './totals.js';
import { rankResultRows } from './ranking.js';
import { prepareSummativeMarksSection, usesSummativeMarksRegister } from './summative.js';

const matchesFilter = (student, filter) => filter === 'pass' ? student.result_status === 'Pass'
  : filter === 'fail' ? student.result_status.startsWith('Fail')
  : filter === 'absent' ? student.has_absence
  : filter === 'incomplete' ? student.result_status === 'Incomplete' : true;

/** Read-only payload -> disposable, rounded print model. Never sends marks back. */
export function prepareAccountsAssessmentPrint(data, { marksMode = 'original', resultStatus = 'all' } = {}) {
  if (data?.print_data_version !== 1 || !Array.isArray(data.sections)) {
    throw new Error('The print data service needs updating. Reload after the frontend and API updates are deployed.');
  }
  if (!['original', 'passing_criteria'].includes(marksMode)) throw new Error('Invalid print marks mode');
  return data.sections.map((section) => {
    const papers = section.papers || [];
    if (usesSummativeMarksRegister(data.exam, section.classSection)) {
      return prepareSummativeMarksSection(section, data.exam, data.formativeRows || [],
        data.rankingMethod, resultStatus, marksMode);
    }
    const students = section.students.map((student) => {
      const subjects = assessmentPrintSubjects(papers, student.subjects, marksMode);
      const totals = summarizeStudentMarks({ papers, subjects });
      const selected = selectScoringSubjects(papers, subjects);
      const hasAbsence = selected.subjects.some((subject) => subject.mark_id && subject.is_absent);
      const failed = selected.subjects.some((subject) => subject.mark_id && !subject.is_absent
        && subject.marks_obtained != null && subject.marks_obtained < Number(subject.passing_marks || 0));
      return { ...student, subjects, total_obtained: totals.total_obtained,
        total_max: totals.total_max, percentage: totals.percentage,
        has_absence: hasAbsence,
        result_status: !totals.is_complete ? 'Incomplete' : hasAbsence ? 'Fail (Absent)' : failed ? 'Fail' : 'Pass',
      };
    });
    // Rank and decide alternative columns across the full cohort before filtering.
    const ranks = new Map(rankResultRows(students.filter((student) => student.percentage != null), data.rankingMethod)
      .map((student) => [String(student.student_id), student.rank]));
    return { ...section, displayPapers: displayAssessmentPapers(papers, students),
      students: students.map((student) => ({ ...student, rank: ranks.get(String(student.student_id)) ?? null }))
        .filter((student) => matchesFilter(student, resultStatus)),
    };
  });
}

/** Preview and printing share this exact HTML, including all rounded totals. */
export function buildAccountsAssessmentPrint(data, options = {}) {
  const sections = prepareAccountsAssessmentPrint(data, options);
  return buildAssessmentMarksPrint({ schoolName: data.schoolName, exam: data.exam,
    sections, marksMode: options.marksMode || 'original' });
}
