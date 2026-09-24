import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { ExamMarksReadinessCard } from './ExamMarksReadinessCard';
import { ExamResultReadiness } from '../../services/examService';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer');

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        primary: '#4F46E5',
        card: '#FFFFFF',
        background: '#F8FAFC',
        border: '#E2E8F0',
        borderLight: '#F1F5F9',
        text: '#0F172A',
        textStrong: '#020617',
        textSecondary: '#64748B',
        textTertiary: '#94A3B8',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
      },
    },
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Icon',
}));

describe('ExamMarksReadinessCard', () => {
  const baseReadiness: ExamResultReadiness = {
    ready: false,
    publishable: true,
    partial: true,
    papers_total: 4,
    papers_complete: 2,
    expected_entries: 100,
    entered_entries: 75,
    missing_entries: 25,
    papers: [
      {
        exam_subject_id: 'p1',
        class_id: 'c1',
        class_name: 'Class 5',
        subject_id: 's1',
        subject_name: 'Math',
        expected_entries: 25,
        entered_entries: 0,
        missing_entries: 25,
        complete: false,
        pending_teachers: [
          {
            teacher_id: 't1',
            teacher_name: 'John Doe',
            section_names: ['A'],
            expected_entries: 25,
            entered_entries: 0,
            missing_entries: 25,
          },
        ],
        unassigned_sections: [],
      },
    ],
  };

  const textOf = (node: any) => {
    const root = node?.root || node;
    if (!root || !root.findAllByType) return '';
    return root
      .findAllByType(Text)
      .map((n: any) =>
        React.Children.toArray(n.props.children)
          .filter((c: any) => typeof c === 'string' || typeof c === 'number')
          .join('')
      )
      .join(' ');
  };

  test('renders readiness progress, metrics, and partial publish button', () => {
    const onOpenFullList = jest.fn();
    const onExportMissingMarks = jest.fn();
    const onResultPublishToggle = jest.fn();

    let tree: any;
    act(() => {
      tree = create(
        <ExamMarksReadinessCard
          readiness={baseReadiness}
          resultsPublished={false}
          onOpenFullList={onOpenFullList}
          onExportMissingMarks={onExportMissingMarks}
          onResultPublishToggle={onResultPublishToggle}
          examName="Midterm Exam"
        />
      );
    });

    const content = textOf(tree);
    expect(content).toContain('Marks readiness');
    expect(content).toContain('75% complete');
    expect(content).toContain('75'); // entered
    expect(content).toContain('100'); // expected
    expect(content).toContain('25'); // missing
    expect(content).toContain('Publish partial results');

    // Trigger open full list
    const viewAllBtn = tree.root
      .findAllByType(TouchableOpacity)
      .find((t: any) => textOf(t).includes('follow-up') || textOf(t).includes('manager'));
    expect(viewAllBtn).toBeDefined();
    act(() => {
      viewAllBtn.props.onPress();
    });
    expect(onOpenFullList).toHaveBeenCalledTimes(1);
  });

  test('renders compact success state when all marks are uploaded', () => {
    const completeReadiness: ExamResultReadiness = {
      ready: true,
      publishable: true,
      partial: false,
      papers_total: 4,
      papers_complete: 4,
      expected_entries: 100,
      entered_entries: 100,
      missing_entries: 0,
      papers: [],
    };

    let tree: any;
    act(() => {
      tree = create(
        <ExamMarksReadinessCard
          readiness={completeReadiness}
          resultsPublished={false}
          onOpenFullList={jest.fn()}
          onExportMissingMarks={jest.fn()}
          onResultPublishToggle={jest.fn()}
          examName="Final Exam"
        />
      );
    });

    const content = textOf(tree);
    expect(content).toContain('100% complete');
    expect(content).toContain('All student marks have been uploaded');
    expect(content).toContain('Publish results');
    expect(content).not.toContain('follow-ups');
  });

  test('renders unpublish button when results are already published', () => {
    let tree: any;
    act(() => {
      tree = create(
        <ExamMarksReadinessCard
          readiness={baseReadiness}
          resultsPublished={true}
          onOpenFullList={jest.fn()}
          onExportMissingMarks={jest.fn()}
          onResultPublishToggle={jest.fn()}
          examName="Annual Exam"
        />
      );
    });

    const content = textOf(tree);
    expect(content).toContain('Results published');
    expect(content).toContain('Unpublish results');
  });

  test('renders explanation when papers_total is zero', () => {
    const noPapersReadiness: ExamResultReadiness = {
      ready: false,
      publishable: false,
      partial: false,
      papers_total: 0,
      papers_complete: 0,
      expected_entries: 0,
      entered_entries: 0,
      missing_entries: 0,
      papers: [],
    };

    let tree: any;
    act(() => {
      tree = create(
        <ExamMarksReadinessCard
          readiness={noPapersReadiness}
          resultsPublished={false}
          onOpenFullList={jest.fn()}
          onExportMissingMarks={jest.fn()}
          onResultPublishToggle={jest.fn()}
          examName="Direct Exam"
        />
      );
    });

    const content = textOf(tree);
    expect(content).toContain('Direct marks entry');
    expect(content).toContain('Teachers can enter marks in Staff → Results without creating or publishing a timetable');
  });
});
