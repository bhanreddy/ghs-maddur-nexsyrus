/** @jest-environment jsdom */
import { buildAccountsAssessmentPrint, prepareAccountsAssessmentPrint,
  type AccountsAssessmentPrintData, type PrintPaper, type PrintMark, type PrintStudent } from '../utils/assessmentPrint';
import { AccountsMarksService, type AccountsMarksExam } from '../services/accountsMarksService';
import { api } from '../services/apiClient';

jest.mock('../services/apiClient', () => ({ api: { get: jest.fn(), downloadFile: jest.fn() } }));

const paper = (id: string, name: string, component = true, max = 50): PrintPaper => ({
  exam_subject_id: id, subject_id: id, subject_name: name,
  assessment_schema: component ? 'component' : 'consolidated', max_marks: max,
  passing_marks: 18, participation_max_marks: 10, written_work_max_marks: 10,
  project_work_max_marks: 10, slip_test_max_marks: 20,
});
const mark = (id: string, values: Partial<PrintMark> = {}): PrintMark => ({
  exam_subject_id: id, mark_id: `mark-${id}`, marks_obtained: 99, passing_marks: 18,
  participation_marks: 7.2, written_work_marks: 7.3, project_work_marks: 7.5, slip_test_marks: 7.9,
  ...values,
});
const student = (id: string, subjects: PrintMark[]): PrintStudent => ({ student_id: id, student_name: `Student ${id}`, subjects });
const fixture = (className = '8', papers = [paper('eng', 'English'), paper('math', 'Maths')],
  students = [student('1', papers.map((p) => mark(p.exam_subject_id)))]): AccountsAssessmentPrintData => ({
  print_data_version: 1, schoolName: 'Geetanjali', exam: { name: 'FA-1', exam_type: 'fa_results' },
  rankingMethod: 'competition', formativeRows: [], sections: [{
    classSection: { id: 'section-8a', class_name: className, section_name: 'A' },
    teacherName: 'Teacher', papers, students,
  }],
});
const doc = (data: AccountsAssessmentPrintData, options = {}) => new DOMParser()
  .parseFromString(buildAccountsAssessmentPrint(data, options).html, 'text/html');
const rowCells = (document: Document, index = 0) => [...document.querySelectorAll('tbody tr')[index].querySelectorAll('td')]
  .map((cell) => cell.textContent);
const deepFreeze = <T,>(value: T): T => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
  return value;
};

it.each([[0, 0], [7.2, 7], [7.3, 7], [7.49, 7], [7.5, 7.5], [7.51, 7.5], [7.99, 7.5], [8, 8], ['7.30', 7]])(
  'prints direct mark %s as %s in every class, with matching totals', (original, expected) => {
    for (const className of ['4', '8', '9', '10']) {
      const data = fixture(className, [paper('eng', 'English', false, 25)], [student('1', [mark('eng', { marks_obtained: original })])]);
      const printed = prepareAccountsAssessmentPrint(data)[0].students[0];
      expect(printed.subjects[0].marks_obtained).toBe(expected);
      expect(printed.total_obtained).toBe(expected);
      expect(printed.percentage).toBe(Math.round(Number(expected) / 25 * 10000) / 100);
    }
  },
);

it('uses rounded components instead of a stale direct total and leaves percentage/GPA unrounded', () => {
  const data = fixture();
  const result = prepareAccountsAssessmentPrint(data)[0].students[0];
  expect(result.subjects[0]).toMatchObject({ participation_marks: 7, written_work_marks: 7,
    project_work_marks: 7.5, slip_test_marks: 7.5, marks_obtained: 29 });
  expect(result.total_obtained).toBe(58);
  const cells = rowCells(doc(data));
  expect(cells.slice(-5)).toEqual(['58', '58', '1', 'C1', '6']);
  const direct = fixture('4', [paper('eng', 'English', false, 30)], [student('1', [mark('eng', { marks_obtained: 7.9 })])]);
  expect(rowCells(doc(direct)).slice(-4)).toEqual(['7.5', 'D2', '1', '25']);
});

it.each(['8', '9', 'Class VIII', 'IX'])('prints all component columns for English and Maths in Class %s mixed FAs', (className) => {
  const data = fixture(className, [paper('eng', 'English'), paper('math', 'Maths', false, 25)]);
  const document = doc(data);
  expect([...document.querySelectorAll('th')].filter((cell) => cell.textContent === 'Res10')).toHaveLength(2);
  expect([...document.querySelectorAll('th')].filter((cell) => cell.textContent === 'ST20')).toHaveLength(2);
  expect(document.querySelector('thead')?.textContent).not.toContain('20%');
  const cells = rowCells(document);
  expect(cells.slice(2, 9)).toEqual(['7', '7', '7.5', '7.5', '29', 'C1', '6']);
  // A direct-only row preserves its entered total, without inventing components.
  expect(cells.slice(9, 16)).toEqual(['—', '—', '—', '—', '99', 'A1', '10']);
  expect(document.querySelectorAll('col')).toHaveLength(cells.length);
});

it('rounds the lower-class FA weightage itself, without rounding its percentage or GPA', () => {
  const data = fixture('5', [paper('eng', 'English')], [student('1', [mark('eng', {
    participation_marks: 8.9, written_work_marks: 8.7, project_work_marks: 9.3, slip_test_marks: 20,
  })])]);
  // Rounded 46 / 50 = 92%, contribution 18.4 -> 18, GPA remains 9.
  expect(rowCells(doc(data)).slice(2)).toEqual(['8.5', '8.5', '9', '20', '46', '18', '9', '46', '92', '1', 'A1', '9']);
});

it('can repeatedly change print mode without mutating any frozen saved marks or maximums', () => {
  const data = deepFreeze(fixture('8', [paper('eng', 'English')], [student('1', [mark('eng', {
    participation_marks: 10, written_work_marks: 10, project_work_marks: 10, slip_test_marks: 1,
  })])]));
  const original = JSON.stringify(data);
  const first = buildAccountsAssessmentPrint(data);
  const passing = prepareAccountsAssessmentPrint(data, { marksMode: 'passing_criteria' })[0].students[0];
  expect(passing.subjects[0].slip_test_marks).toBe(7.5);
  expect(passing.total_obtained).toBe(37.5);
  expect(buildAccountsAssessmentPrint(data).html).toBe(first.html);
  expect(JSON.stringify(data)).toBe(original);
  expect(data.sections[0].students[0].subjects[0].slip_test_marks).toBe(1);
});

it('preserves zero, missing fields and absences rather than turning them into fabricated pass marks', () => {
  const papers = [paper('eng', 'English'), paper('math', 'Maths')];
  const data = fixture('9', papers, [student('1', [mark('eng', { is_absent: true }), mark('math', {
    mark_id: null, participation_marks: null, written_work_marks: null, project_work_marks: null, slip_test_marks: null,
  })]), student('2', [mark('eng', { participation_marks: 0, written_work_marks: null,
    project_work_marks: null, slip_test_marks: null }), mark('math')])]);
  const result = prepareAccountsAssessmentPrint(data, { marksMode: 'passing_criteria' })[0].students;
  expect(result[0]).toMatchObject({ total_obtained: 0, has_absence: true, result_status: 'Incomplete' });
  expect(result[1].subjects[0]).toMatchObject({ participation_marks: 0, slip_test_marks: null, marks_obtained: 0 });
  expect(rowCells(doc(data), 0).slice(2, 9)).toEqual(['AB', 'AB', 'AB', 'AB', 'AB', 'AB', '4']);
});

it('re-ranks the whole class using printed scores before result filtering', () => {
  const papers = [paper('eng', 'English', false, 25)];
  const data = fixture('4', papers, [student('1', [mark('eng', { marks_obtained: 18.3 })]),
    student('2', [mark('eng', { marks_obtained: 18.2 })]), student('3', [mark('eng', { marks_obtained: 5.9 })])]);
  expect(prepareAccountsAssessmentPrint(data)[0].students.map((s) => s.rank)).toEqual([1, 1, 3]);
  expect(prepareAccountsAssessmentPrint(data, { resultStatus: 'fail' })[0].students.map((s) => [s.student_id, s.rank])).toEqual([['3', 3]]);
  data.rankingMethod = 'dense';
  expect(prepareAccountsAssessmentPrint(data)[0].students.map((s) => s.rank)).toEqual([1, 1, 2]);
});

it('preserves both entered EVS/Science columns while counting one, and hides an entirely empty alternative', () => {
  const papers = [paper('sci', 'Science', false, 25), paper('evs', 'EVS', false, 25)];
  const data = fixture('4', papers, [student('1', [mark('sci', { marks_obtained: 19.3 }), mark('evs', { marks_obtained: 24.9 })])]);
  expect(prepareAccountsAssessmentPrint(data)[0].students[0]).toMatchObject({ total_obtained: 19, total_max: 25, percentage: 76 });
  expect(doc(data).querySelector('thead')?.textContent).toContain('EVS');
  data.sections[0].students[0].subjects[1].mark_id = null;
  expect(doc(data).querySelector('thead')?.textContent).not.toContain('EVS');
});

const summativeFixture = (split = false) => {
  const papers = split ? [paper('phy', 'Physics', false, 40), paper('bio', 'Biology', false, 40)]
    : [paper('eng', 'English', false, 100)];
  const data = fixture('9', papers, [student('1', papers.map((p) => mark(p.exam_subject_id, { marks_obtained: 70.3 })))]);
  data.exam = { name: 'SA-1', exam_type: 'sa_results' };
  data.formativeRows = papers.flatMap((p) => ['FA-1', 'FA-2'].map((name) => ({
    ...paper(p.exam_subject_id, p.subject_name, true, split ? 25 : 50), ...mark(p.exam_subject_id, {
      participation_marks: split ? 5.2 : 10, written_work_marks: split ? 5.3 : 10,
      project_work_marks: split ? 5.9 : 10, slip_test_marks: split ? 5.9 : 13.3,
    }),
    class_section_id: 'section-8a', student_id: '1', exam_name: name, exam_type: 'fa_results',
  })));
  return data;
};

it('rounds FA source components, the SA contribution and exam marks then recomputes combined totals from entered maxima', () => {
  const data = deepFreeze(summativeFixture());
  const result = prepareAccountsAssessmentPrint(data)[0].students[0];
  // FA total 43/50 -> 17.2/20 -> 17; exam 70.3 -> 70, max remains 100.
  expect(result.summative_subjects?.[0]).toMatchObject({ exam_marks: 70, formative_contribution: 17, total: 87, maximum: 120 });
  expect(result).toMatchObject({ total_obtained: 87, total_max: 120, percentage: 72.5 });
  expect(rowCells(doc(data)).slice(-5)).toEqual(['87', '72.5', 'B1', '8', '1']);
});

it('handles split Science with half contributions and component columns without breaking header widths', () => {
  const data = summativeFixture(true);
  data.sections[0].students[0].subjects.forEach((m) => { m.marks_obtained = 30.9; });
  const result = prepareAccountsAssessmentPrint(data)[0].students[0];
  // Each FA 21/25 -> 8.4/10 -> 8. Each exam 30.9 -> 30.5.
  expect(result.summative_subjects?.map((s) => s.total)).toEqual([38.5, 38.5]);
  expect(result.total_obtained).toBe(77);
  expect(rowCells(doc(data))).toContain('77');
  data.exam = { name: 'FA-1', exam_type: 'fa_results' };
  const document = doc(data);
  expect(document.querySelector('thead')?.textContent).toContain('Physical Science');
  expect(document.querySelectorAll('col')).toHaveLength(rowCells(document).length);
});

it('fetches only original data through GET and applies mode locally; Excel keeps its existing request', async () => {
  const data = deepFreeze(fixture());
  (api.get as jest.Mock).mockResolvedValue(data);
  const exam = { id: 'exam-1', name: 'FA-1' } as AccountsMarksExam;
  const filters = { resultStatus: 'all' as const, classId: 'class-8', marksMode: 'passing_criteria' as const };
  const result = await AccountsMarksService.getPrintDocument(exam, filters);
  expect(api.get).toHaveBeenLastCalledWith('/results/accounts/exams/exam-1/marks/export?result_status=all&class_id=class-8&format=print&renderer=client', undefined, { silent: true });
  expect(result.html).toBe(buildAccountsAssessmentPrint(data, filters).html);
  await AccountsMarksService.exportSchoolMarks(exam, filters);
  expect(api.downloadFile).toHaveBeenLastCalledWith('/results/accounts/exams/exam-1/marks/export?result_status=all&class_id=class-8', 'FA-1-filtered-marks.xlsx');
});

it('does not silently print old unrounded server HTML when the read-only payload is unavailable', () => {
  expect(() => buildAccountsAssessmentPrint({ html: 'legacy' } as unknown as AccountsAssessmentPrintData)).toThrow('print data service needs updating');
});

it('keeps fractional percentages and averaged GPA at their usual precision', () => {
  const data = fixture('8', [paper('eng', 'English'), paper('math', 'Maths'), paper('tel', 'Telugu')],
    [student('1', [mark('eng', { participation_marks: 10, written_work_marks: 10, project_work_marks: 10, slip_test_marks: 20 }),
      mark('math', { participation_marks: 10, written_work_marks: 10, project_work_marks: 10, slip_test_marks: 15 }),
      mark('tel', { participation_marks: 10, written_work_marks: 10, project_work_marks: 10, slip_test_marks: 15 })])]);
  expect(rowCells(doc(data)).slice(-5)).toEqual(['140', '93.33', '1', 'A1', '9.3']);
  const direct = fixture('4', [paper('eng', 'English', false, 40)], [student('1', [mark('eng', { marks_obtained: 7.99 })])]);
  expect(prepareAccountsAssessmentPrint(direct)[0].students[0].percentage).toBe(18.75);
});

it('does not turn an entirely missing component row or a null direct score into a total', () => {
  const data = fixture('9', [paper('eng', 'English'), paper('math', 'Maths', false)], [student('1', [mark('eng', {
    participation_marks: null, written_work_marks: null, project_work_marks: null, slip_test_marks: null,
  }), mark('math', { marks_obtained: null })])]);
  expect(prepareAccountsAssessmentPrint(data)[0].students[0]).toMatchObject({ total_obtained: null, percentage: null, result_status: 'Incomplete', rank: null });
  expect(rowCells(doc(data)).slice(-5)).toEqual(['—', '—', '—', '—', '—']);
});

it('uses the newest required FA source and does not substitute an older or different assessment', () => {
  const data = summativeFixture();
  const missingSource = { ...data.formativeRows[0], mark_id: null, participation_marks: null,
    written_work_marks: null, project_work_marks: null, slip_test_marks: null, marks_obtained: null };
  data.formativeRows.unshift(missingSource);
  const result = prepareAccountsAssessmentPrint(data)[0].students[0];
  expect(result.summative_subjects?.[0]).toMatchObject({ exam_marks: 70, formative_contribution: null, total: null, is_complete: false });
  expect(result).toMatchObject({ total_obtained: null, rank: null, result_status: 'Incomplete' });
});

it('prints all component columns even when a secondary FA is configured entirely as direct entries', () => {
  const data = fixture('9', [paper('eng', 'English', false), paper('math', 'Maths', false)]);
  const document = doc(data);
  expect([...document.querySelectorAll('th')].filter((cell) => cell.textContent === 'Res10')).toHaveLength(2);
  expect(document.querySelectorAll('col')).toHaveLength(rowCells(document).length);
  expect(rowCells(document).slice(2, 9)).toEqual(['—', '—', '—', '—', '99', 'A1', '10']);
});

it.each([[20, 7.5], [25, 9], [30, 11], [40, 14.5], [50, 18], [80, 29], [100, 36]])(
  'keeps the 36%% minimum at a half mark for a %s-mark paper without changing the maximum', (maximum, minimum) => {
    const p = paper('eng', 'English', false, maximum);
    const data = fixture('8', [p], [student('1', [mark('eng', { marks_obtained: 0 })])]);
    const printed = prepareAccountsAssessmentPrint(data, { marksMode: 'passing_criteria' })[0].students[0];
    expect(printed.total_obtained).toBe(minimum);
    expect(printed.total_max).toBe(maximum);
    expect(printed.percentage).toBeGreaterThanOrEqual(36);
    expect(prepareAccountsAssessmentPrint(data)[0].students[0].total_obtained).toBe(0);
  },
);
