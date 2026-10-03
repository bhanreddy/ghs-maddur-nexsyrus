import {
  AssessmentSchema,
  ComponentAssessmentInput,
  ComponentField,
  EMPTY_COMPONENT_MARKS,
  isAbsentAssessmentInput,
  isValidAssessmentInput,
  normalizeAssessmentInput,
  parseComponentMaximums,
} from './assessmentGrading';

export interface AssessmentDraft {
  consolidatedMaxMarks: string;
  componentMaximums: Record<ComponentField, string>;
  consolidatedByStudent: Record<string, string>;
  componentByStudent: Record<string, ComponentAssessmentInput>;
  // Local-only metadata: keeps staff edits/clears intact when modes are toggled.
  prefilledSlipTestByStudent?: Record<string, string>;
}

interface StoredMark {
  student_id: string;
  marks_obtained: number | null;
  consolidated_marks_obtained?: number | null;
  participation_marks?: number | null;
  written_work_marks?: number | null;
  project_work_marks?: number | null;
  slip_test_marks?: number | null;
  is_absent: boolean;
}

/** Reads both legacy consolidated responses and the current component format. */
export function mergeStoredAssessmentMarks(
  draft: AssessmentDraft,
  marks: readonly StoredMark[],
  serverSchema: AssessmentSchema,
): AssessmentDraft {
  const consolidatedByStudent = { ...draft.consolidatedByStudent };
  const componentByStudent = { ...draft.componentByStudent };

  marks.forEach((mark) => {
    if (mark.is_absent) {
      consolidatedByStudent[mark.student_id] = 'A';
      // A missed consolidated test becomes a missed Slip Test only. The other
      // three components still need staff input when switching to components.
      if (serverSchema === 'component') {
        componentByStudent[mark.student_id] = {
          participation: 'A', writtenWork: 'A', projectWork: 'A', slipTest: 'A',
        };
      }
      return;
    }

    if (mark.consolidated_marks_obtained != null) {
      consolidatedByStudent[mark.student_id] = String(mark.consolidated_marks_obtained);
    } else if (serverSchema === 'consolidated' && mark.marks_obtained != null) {
      consolidatedByStudent[mark.student_id] = String(mark.marks_obtained);
    }

    const hasComponents = [mark.participation_marks, mark.written_work_marks,
      mark.project_work_marks, mark.slip_test_marks].some((value) => value != null);
    if (hasComponents) {
      // Completed component uploads store AB as null; keep that convention.
      const fromServer = (value: number | null | undefined) => value == null ? 'A' : String(value);
      componentByStudent[mark.student_id] = {
        participation: fromServer(mark.participation_marks),
        writtenWork: fromServer(mark.written_work_marks),
        projectWork: fromServer(mark.project_work_marks),
        slipTest: fromServer(mark.slip_test_marks),
      };
    }
  });

  return { ...draft, consolidatedByStudent, componentByStudent };
}

/** Called only for the draft belonging to the selected class, subject and test. */
export function prefillSlipTestFromConsolidated(draft: AssessmentDraft): AssessmentDraft {
  const sourceMaximum = Number(draft.consolidatedMaxMarks);
  const candidates = Object.entries(draft.consolidatedByStudent).filter(([studentId, raw]) => {
    const value = normalizeAssessmentInput(raw);
    const current = draft.componentByStudent[studentId]?.slipTest ?? '';
    if (Object.prototype.hasOwnProperty.call(draft.prefilledSlipTestByStudent ?? {}, studentId)) {
      const previousCopy = draft.prefilledSlipTestByStudent?.[studentId];
      // Refresh an untouched copy if consolidated marks changed in another
      // session, while protecting both edits and intentionally cleared fields.
      if (current !== previousCopy || value === previousCopy) return false;
    } else if (current !== '') return false;
    return value !== '' && (isAbsentAssessmentInput(value) || (
      Number.isFinite(sourceMaximum) && sourceMaximum >= 1 && sourceMaximum <= 999 &&
      isValidAssessmentInput(value, sourceMaximum)
    ));
  });
  if (candidates.length === 0) return draft;

  const componentByStudent = { ...draft.componentByStudent };
  const prefilledSlipTestByStudent = { ...draft.prefilledSlipTestByStudent };
  candidates.forEach(([studentId, raw]) => {
    const value = normalizeAssessmentInput(raw);
    componentByStudent[studentId] = {
      ...EMPTY_COMPONENT_MARKS,
      ...componentByStudent[studentId],
      slipTest: value,
    };
    prefilledSlipTestByStudent[studentId] = value;
  });

  const hasNumericCopy = candidates.some(([, value]) => !isAbsentAssessmentInput(value));
  const slipMaximum = parseComponentMaximums(draft.componentMaximums).slipTest;
  return {
    ...draft,
    componentByStudent,
    prefilledSlipTestByStudent,
    // Preserve exact scores and their original scale; never clamp copied marks.
    componentMaximums: hasNumericCopy && sourceMaximum > slipMaximum
      ? { ...draft.componentMaximums, slipTest: String(sourceMaximum) }
      : draft.componentMaximums,
  };
}
