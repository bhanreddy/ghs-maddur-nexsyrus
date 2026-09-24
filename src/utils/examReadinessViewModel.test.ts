import {
  buildFollowUpItems,
  filterFollowUpItems,
  compareFollowUpItems,
  getReadinessBadgeInfo,
  getReadinessExplanation,
  FollowUpItem,
} from './examReadinessViewModel';
import { ExamResultReadiness } from '../services/examService';

describe('examReadinessViewModel', () => {
  const sampleReadiness: ExamResultReadiness = {
    ready: false,
    publishable: true,
    partial: true,
    papers_total: 3,
    papers_complete: 0,
    expected_entries: 100,
    entered_entries: 60,
    missing_entries: 40,
    papers: [
      {
        exam_subject_id: 'sub-1',
        class_id: 'cls-1',
        class_name: 'Grade 5',
        subject_id: 's-eng',
        subject_name: 'English',
        expected_entries: 40,
        entered_entries: 30,
        missing_entries: 10,
        complete: false,
        pending_teachers: [
          {
            teacher_id: 't-1',
            teacher_name: 'Mrs. Davis',
            section_names: ['A'],
            expected_entries: 20,
            entered_entries: 18,
            missing_entries: 2,
          },
          {
            teacher_id: 't-2',
            teacher_name: 'Mr. Smith',
            section_names: ['B'],
            expected_entries: 20,
            entered_entries: 12,
            missing_entries: 8,
          },
        ],
        unassigned_sections: [],
      },
      {
        exam_subject_id: 'sub-2',
        class_id: 'cls-2',
        class_name: 'Grade 6',
        subject_id: 's-sci',
        subject_name: 'Science',
        expected_entries: 30,
        entered_entries: 20,
        missing_entries: 10,
        complete: false,
        pending_teachers: [],
        unassigned_sections: [
          {
            section_id: 'sec-c',
            section_name: 'C',
          },
        ],
      },
      {
        exam_subject_id: 'sub-3',
        class_id: 'cls-3',
        class_name: 'Grade 7',
        subject_id: 's-math',
        subject_name: 'Mathematics',
        expected_entries: 30,
        entered_entries: 10,
        missing_entries: 20,
        complete: false,
        pending_teachers: [],
        unassigned_sections: [],
      },
      {
        // Completed paper should not show in follow-up items
        exam_subject_id: 'sub-4',
        class_id: 'cls-1',
        class_name: 'Grade 5',
        subject_id: 's-art',
        subject_name: 'Art',
        expected_entries: 40,
        entered_entries: 40,
        missing_entries: 0,
        complete: true,
        pending_teachers: [],
        unassigned_sections: [],
      },
    ],
  };

  test('buildFollowUpItems flattens papers and filters out complete papers', () => {
    const items = buildFollowUpItems(sampleReadiness);
    expect(items).toHaveLength(4);

    // Unassigned must come first by priority ordering
    expect(items[0].type).toBe('unassigned');
    expect(items[0].section_name).toBe('C');
    expect(items[0].class_name).toBe('Grade 6');
    expect(items[0].subject_name).toBe('Science');

    // Unresolved comes second
    expect(items[1].type).toBe('unresolved');
    expect(items[1].subject_name).toBe('Mathematics');
    expect(items[1].missing_entries).toBe(20);

    // Assigned teachers come next, sorted by largest missing entries first (8 then 2)
    expect(items[2].type).toBe('assigned');
    expect(items[2].teacher_name).toBe('Mr. Smith');
    expect(items[2].missing_entries).toBe(8);

    expect(items[3].type).toBe('assigned');
    expect(items[3].teacher_name).toBe('Mrs. Davis');
    expect(items[3].missing_entries).toBe(2);
  });

  test('unassigned items do not fabricate 0 as missing count', () => {
    const items = buildFollowUpItems(sampleReadiness);
    const unassigned = items.find((i) => i.type === 'unassigned');
    expect(unassigned?.missing_entries).toBeUndefined();
    expect(unassigned?.status_label).toBe('Teacher not assigned');
  });

  test('filterFollowUpItems filters by category', () => {
    const items = buildFollowUpItems(sampleReadiness);

    const missingUploads = filterFollowUpItems(items, { filter: 'missing_uploads' });
    expect(missingUploads).toHaveLength(2);
    expect(missingUploads.every((i) => i.type === 'assigned')).toBe(true);

    const unassigned = filterFollowUpItems(items, { filter: 'unassigned' });
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].type).toBe('unassigned');

    const unresolved = filterFollowUpItems(items, { filter: 'unresolved' });
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].type).toBe('unresolved');
  });

  test('filterFollowUpItems filters by classId', () => {
    const items = buildFollowUpItems(sampleReadiness);

    const grade5 = filterFollowUpItems(items, { classId: 'cls-1' });
    expect(grade5).toHaveLength(2);
    expect(grade5.every((i) => i.class_id === 'cls-1')).toBe(true);

    const grade6 = filterFollowUpItems(items, { classId: 'cls-2' });
    expect(grade6).toHaveLength(1);
    expect(grade6[0].class_id).toBe('cls-2');
  });

  test('filterFollowUpItems searches case-insensitively across teacher, class, subject, section, and status', () => {
    const items = buildFollowUpItems(sampleReadiness);

    expect(filterFollowUpItems(items, { query: 'davis' })).toHaveLength(1);
    expect(filterFollowUpItems(items, { query: 'GRADE 6' })).toHaveLength(1);
    expect(filterFollowUpItems(items, { query: 'math' })).toHaveLength(1);
    expect(filterFollowUpItems(items, { query: 'section C' })).toHaveLength(1);
    expect(filterFollowUpItems(items, { query: 'not assigned' })).toHaveLength(1);
  });

  test('compareFollowUpItems sorts deterministic tie-breakers', () => {
    const itemA: FollowUpItem = {
      id: '1',
      type: 'assigned',
      exam_subject_id: 'e1',
      class_id: 'c1',
      class_name: 'Class 5',
      subject_id: 's1',
      subject_name: 'English',
      teacher_name: 'Teacher A',
      missing_entries: 5,
      status_label: 'Pending',
      raw_paper: {} as any,
    };
    const itemB: FollowUpItem = {
      id: '2',
      type: 'assigned',
      exam_subject_id: 'e2',
      class_id: 'c1',
      class_name: 'Class 5',
      subject_id: 's1',
      subject_name: 'English',
      teacher_name: 'Teacher B',
      missing_entries: 5,
      status_label: 'Pending',
      raw_paper: {} as any,
    };

    expect(compareFollowUpItems(itemA, itemB)).toBeLessThan(0);
  });

  test('getReadinessBadgeInfo covers all readiness states', () => {
    expect(getReadinessBadgeInfo(sampleReadiness, true).stateKey).toBe('published');
    expect(getReadinessBadgeInfo({ ...sampleReadiness, ready: true }, false).stateKey).toBe('ready');
    expect(getReadinessBadgeInfo({ ...sampleReadiness, publishable: true }, false).stateKey).toBe('partial');
    expect(
      getReadinessBadgeInfo({ ...sampleReadiness, entered_entries: 0, publishable: false }, false).stateKey
    ).toBe('not_started');
  });

  test('getReadinessExplanation provides correct business copy for edge cases', () => {
    expect(getReadinessExplanation({ ...sampleReadiness, papers_total: 0 }, false)).toContain(
      'Teachers can enter marks in Staff → Results without creating or publishing a timetable'
    );
    expect(getReadinessExplanation({ ...sampleReadiness, expected_entries: 0 }, false)).toContain(
      'No active student results are expected'
    );
    expect(getReadinessExplanation(sampleReadiness, true)).toContain('Results are live');
  });
});
