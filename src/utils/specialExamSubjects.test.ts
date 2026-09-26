import {
  CLASS_TEACHER_NOT_ASSIGNED,
  draftsToSpecs,
  papersToDrafts,
  sectionsMissingClassTeacher,
} from './specialExamSubjects';

const sections = [
  { id: 'sec-a', class_id: 'class-5', class_name: '5', section_name: 'A', class_teacher_id: 't1', class_teacher_name: 'Anita' },
  { id: 'sec-b', class_id: 'class-5', class_name: '5', section_name: 'B', class_teacher_id: null, class_teacher_name: null },
];

describe('special exam subject drafts', () => {
  test('turns exam-only papers into editable drafts and ignores regular papers', () => {
    const drafts = papersToDrafts([
      {
        id: 'paper-1',
        class_id: 'class-5',
        class_section_id: 'sec-a',
        subject_name: 'Handwriting',
        max_marks: 20,
        passing_marks: 8,
        is_exam_only: true,
      },
      {
        id: 'paper-2',
        class_id: 'class-5',
        class_section_id: null,
        subject_name: 'Math',
        max_marks: 100,
        passing_marks: 35,
        is_exam_only: false,
      },
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].name).toBe('Handwriting');
    expect(drafts[0].selected).toEqual(['sec-a']);
    expect(drafts[0].paperIds['sec-a']).toBe('paper-1');
  });

  test('builds class-wide and section targets and flags a missing class teacher', () => {
    const draft = {
      localId: 'local',
      name: '  Handwriting ',
      maxMarks: '20',
      passingMarks: '0',
      selected: ['class:class-5', 'sec-b'],
      paperIds: { 'class:class-5': 'paper-class' },
    };
    expect(draftsToSpecs([draft], sections)).toEqual([{
      name: 'Handwriting',
      max_marks: 20,
      passing_marks: 0,
      targets: [{ id: 'paper-class', class_id: 'class-5', class_section_id: null }],
    }]);
    expect(sectionsMissingClassTeacher(draft, sections).map((section) => section.id)).toEqual(['sec-b']);
    expect(CLASS_TEACHER_NOT_ASSIGNED).toBe('Class teacher not assigned');
  });
});
