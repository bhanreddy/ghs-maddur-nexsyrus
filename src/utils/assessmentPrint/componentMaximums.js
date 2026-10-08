import { parseComponentMaximums } from '../assessmentGrading';

/** Use the configured maxima through the existing frontend validation. */
export function componentMaximumsFromRow(row) {
  const maxima = parseComponentMaximums({
    participation: row?.participation_max_marks,
    writtenWork: row?.written_work_max_marks,
    projectWork: row?.project_work_max_marks,
    slipTest: row?.slip_test_max_marks,
  });
  return { participation: maxima.participation, written_work: maxima.writtenWork,
    project_work: maxima.projectWork, slip_test: maxima.slipTest };
}
