import {
  EMPTY_COMPONENT_MARKS,
  calculateComponentAssessment,
  isComponentAssessmentAbsent,
  isComponentAssessmentComplete,
  isValidAssessmentInput,
  numericOrNullComponentMark,
  parseComponentMaximums,
  stringifyComponentMaximums,
} from './assessmentGrading';
import { AssessmentDraft, mergeStoredAssessmentMarks, prefillSlipTestFromConsolidated } from './marksEntryDraft';

const emptyDraft = (maximum = '25'): AssessmentDraft => ({
  consolidatedMaxMarks: maximum,
  componentMaximums: stringifyComponentMaximums(),
  consolidatedByStudent: {},
  componentByStudent: {},
});

describe('consolidated marks to Slip Test', () => {
  it('copies exact scores including zero and decimals, leaving the other three inputs empty', () => {
    const draft = { ...emptyDraft(), consolidatedByStudent: { one: '23', two: '0', three: '18.75' } };
    const next = prefillSlipTestFromConsolidated(draft);
    for (const [id, score] of Object.entries(draft.consolidatedByStudent)) {
      expect(next.componentByStudent[id]).toEqual({ ...EMPTY_COMPONENT_MARKS, slipTest: score });
      expect(isComponentAssessmentComplete(next.componentByStudent[id])).toBe(false);
    }
    expect(draft.componentByStudent).toEqual({});
    expect(next.consolidatedByStudent).toEqual(draft.consolidatedByStudent);
  });

  it('carries a larger consolidated maximum so copied marks remain valid for upload', () => {
    const next = prefillSlipTestFromConsolidated({
      ...emptyDraft('80'), consolidatedByStudent: { one: '76.5' },
    });
    expect(next.componentByStudent.one.slipTest).toBe('76.5');
    expect(next.componentMaximums).toEqual({ participation: '10', writtenWork: '10', projectWork: '10', slipTest: '80' });
    expect(isValidAssessmentInput('76.5', parseComponentMaximums(next.componentMaximums).slipTest)).toBe(true);
  });

  it('keeps a larger existing component maximum', () => {
    const next = prefillSlipTestFromConsolidated({
      ...emptyDraft(), componentMaximums: { ...stringifyComponentMaximums(), slipTest: '40' },
      consolidatedByStudent: { one: '20' },
    });
    expect(next.componentMaximums.slipTest).toBe('40');
  });

  it('preserves existing staff component input, including Slip Test zero and AB', () => {
    const draft: AssessmentDraft = {
      ...emptyDraft(), consolidatedByStudent: { one: '20', two: '15', three: '10' },
      componentByStudent: {
        one: { ...EMPTY_COMPONENT_MARKS, participation: '8', writtenWork: '9' },
        two: { ...EMPTY_COMPONENT_MARKS, slipTest: '0' },
        three: { ...EMPTY_COMPONENT_MARKS, slipTest: 'AB' },
      },
    };
    const next = prefillSlipTestFromConsolidated(draft);
    expect(next.componentByStudent.one).toEqual({ participation: '8', writtenWork: '9', projectWork: '', slipTest: '20' });
    expect(next.componentByStudent.two).toEqual(draft.componentByStudent.two);
    expect(next.componentByStudent.three).toEqual(draft.componentByStudent.three);
  });

  it('does not reinsert an intentionally cleared or edited copy after toggling modes or restoring storage', () => {
    const copied = prefillSlipTestFromConsolidated({ ...emptyDraft(), consolidatedByStudent: { one: '20', two: '18' } });
    copied.componentByStudent.one.slipTest = '';
    copied.componentByStudent.two.slipTest = '17';
    const restored: AssessmentDraft = JSON.parse(JSON.stringify(copied));
    expect(prefillSlipTestFromConsolidated(restored)).toBe(restored);
    expect(restored.componentByStudent.one.slipTest).toBe('');
    expect(restored.componentByStudent.two.slipTest).toBe('17');
  });

  it('refreshes an untouched copy when newer consolidated marks are loaded', () => {
    const copied = prefillSlipTestFromConsolidated({ ...emptyDraft(), consolidatedByStudent: { one: '20' } });
    const updated = { ...copied, consolidatedByStudent: { one: '22' } };
    expect(prefillSlipTestFromConsolidated(updated).componentByStudent.one.slipTest).toBe('22');
  });

  it('does not repeatedly change an already copied draft', () => {
    const next = prefillSlipTestFromConsolidated({ ...emptyDraft(), consolidatedByStudent: { one: '20' } });
    expect(prefillSlipTestFromConsolidated(next)).toBe(next);
  });

  it('skips empty and invalid consolidated marks', () => {
    const draft = { ...emptyDraft(), consolidatedByStudent: { one: '', two: '-1', three: '26', four: 'bad' } };
    expect(prefillSlipTestFromConsolidated(draft)).toBe(draft);
  });

  it('marks a missed consolidated test as Slip Test AB while requiring the other three marks', () => {
    const next = prefillSlipTestFromConsolidated({ ...emptyDraft(), consolidatedByStudent: { one: 'A' } });
    expect(next.componentByStudent.one).toEqual({ ...EMPTY_COMPONENT_MARKS, slipTest: 'A' });
    expect(isComponentAssessmentAbsent(next.componentByStudent.one)).toBe(false);
    expect(isComponentAssessmentComplete(next.componentByStudent.one)).toBe(false);
    expect(next.componentMaximums.slipTest).toBe('20');
  });

  it('keeps different class, subject or test drafts independent', () => {
    const drafts = {
      'class-one:fa:FA1:math': { ...emptyDraft(), consolidatedByStudent: { student: '18' } },
      'class-one:fa:FA2:math': { ...emptyDraft(), consolidatedByStudent: { student: '9' } },
      'class-two:fa:FA1:math': { ...emptyDraft(), consolidatedByStudent: { student: '12' } },
      'class-one:fa:FA1:english': { ...emptyDraft(), consolidatedByStudent: { student: '15' } },
    };
    const selectedKey = 'class-one:fa:FA1:math';
    const next = { ...drafts, [selectedKey]: prefillSlipTestFromConsolidated(drafts[selectedKey]) };
    expect(next[selectedKey].componentByStudent.student.slipTest).toBe('18');
    for (const key of Object.keys(drafts).filter((key) => key !== selectedKey)) {
      expect(next[key as keyof typeof next]).toBe(drafts[key as keyof typeof drafts]);
      expect(next[key as keyof typeof next].componentByStudent).toEqual({});
    }
  });
});

describe('marks response compatibility', () => {
  it('reads a legacy response containing only marks_obtained', () => {
    const draft = mergeStoredAssessmentMarks(emptyDraft(), [{
      student_id: 'one', marks_obtained: 19.5, is_absent: false,
    }], 'consolidated');
    expect(prefillSlipTestFromConsolidated(draft).componentByStudent.one).toEqual({ ...EMPTY_COMPONENT_MARKS, slipTest: '19.5' });
  });

  it('prefers consolidated_marks_obtained and never uses a component total as a Slip Test score', () => {
    const draft = mergeStoredAssessmentMarks(emptyDraft(), [{
      student_id: 'one', marks_obtained: 48, consolidated_marks_obtained: 23,
      participation_marks: 8, written_work_marks: 9, project_work_marks: 8, slip_test_marks: 23, is_absent: false,
    }, {
      student_id: 'two', marks_obtained: 40, is_absent: false,
    }], 'component');
    expect(draft.consolidatedByStudent).toEqual({ one: '23' });
    expect(prefillSlipTestFromConsolidated(draft)).toBe(draft);
    expect(draft.componentByStudent.one.slipTest).toBe('23');
    expect(draft.componentByStudent.two).toBeUndefined();
  });

  it('distinguishes consolidated absence from whole component assessment absence', () => {
    const marks = [{ student_id: 'one', marks_obtained: null, is_absent: true }];
    const direct = prefillSlipTestFromConsolidated(mergeStoredAssessmentMarks(emptyDraft(), marks, 'consolidated'));
    expect(direct.componentByStudent.one).toEqual({ ...EMPTY_COMPONENT_MARKS, slipTest: 'A' });
    const components = mergeStoredAssessmentMarks(emptyDraft(), marks, 'component');
    expect(isComponentAssessmentAbsent(components.componentByStudent.one)).toBe(true);
  });

  it('round trips completed copied marks through the existing upload fields, including a missed component', () => {
    const copied = prefillSlipTestFromConsolidated({ ...emptyDraft(), consolidatedByStudent: { one: '23' } });
    const entry = { ...copied.componentByStudent.one, participation: '8', writtenWork: 'A', projectWork: '9' };
    expect(isComponentAssessmentComplete(entry)).toBe(true);
    const result = calculateComponentAssessment(entry, parseComponentMaximums(copied.componentMaximums));
    const stored = {
      student_id: 'one', marks_obtained: result.obtained, consolidated_marks_obtained: 23,
      participation_marks: numericOrNullComponentMark(entry.participation),
      written_work_marks: numericOrNullComponentMark(entry.writtenWork),
      project_work_marks: numericOrNullComponentMark(entry.projectWork),
      slip_test_marks: numericOrNullComponentMark(entry.slipTest), is_absent: false,
    };
    expect(stored.marks_obtained).toBe(40);
    const reloaded = mergeStoredAssessmentMarks(emptyDraft(), [stored], 'component');
    expect(reloaded.componentByStudent.one).toEqual(entry);
    expect(prefillSlipTestFromConsolidated(reloaded)).toBe(reloaded);
  });
});
