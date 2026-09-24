import React from 'react';
import { Text, TouchableOpacity, TextInput } from 'react-native';
import { ExamMissingMarksModal } from './ExamMissingMarksModal';
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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Icon',
}));

jest.mock('react-native-keyboard-controller', () => {
  const { View } = require('react-native');
  return {
    KeyboardAvoidingView: View,
  };
});

describe('ExamMissingMarksModal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });
  const readinessWithGaps: ExamResultReadiness = {
    ready: false,
    publishable: false,
    partial: false,
    papers_total: 2,
    papers_complete: 0,
    expected_entries: 50,
    entered_entries: 20,
    missing_entries: 30,
    papers: [
      {
        exam_subject_id: 'paper-1',
        class_id: 'cls-1',
        class_name: 'Class 8',
        subject_id: 'sub-1',
        subject_name: 'Science',
        expected_entries: 25,
        entered_entries: 15,
        missing_entries: 10,
        complete: false,
        pending_teachers: [
          {
            teacher_id: 'teach-1',
            teacher_name: 'Priya Sharma',
            section_names: ['A'],
            expected_entries: 25,
            entered_entries: 15,
            missing_entries: 10,
          },
        ],
        unassigned_sections: [],
      },
      {
        exam_subject_id: 'paper-2',
        class_id: 'cls-2',
        class_name: 'Class 9',
        subject_id: 'sub-2',
        subject_name: 'Hindi',
        expected_entries: 25,
        entered_entries: 5,
        missing_entries: 20,
        complete: false,
        pending_teachers: [],
        unassigned_sections: [
          {
            section_id: 'sec-b',
            section_name: 'B',
          },
        ],
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

  test('renders modal header, search, filter chips, and download button', () => {
    const onExport = jest.fn();
    const onClose = jest.fn();

    let tree: any;
    act(() => {
      tree = create(
        <ExamMissingMarksModal
          visible={true}
          onClose={onClose}
          readiness={readinessWithGaps}
          examName="FA-1 Evaluation"
          onExportMissingMarks={onExport}
        />
      );
    });

    const content = textOf(tree);
    expect(content).toContain('Unuploaded marks');
    expect(content).toContain('FA-1 Evaluation');
    expect(content).toContain('30 missing across 2 follow-up items');
    expect(content).toContain('Priya Sharma');
    expect(content).toContain('Teacher not assigned');
    expect(content).toContain('Download follow-up Excel');

    // Trigger download
    const downloadBtn = tree.root
      .findAllByType(TouchableOpacity)
      .find((t: any) => textOf(t).includes('Download follow-up Excel'));
    expect(downloadBtn).toBeDefined();
    act(() => {
      downloadBtn.props.onPress();
    });
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  test('shows assign teacher button in Admin mode and hides it in Accounts mode', () => {
    const onAssignTeacher = jest.fn();
    const onClose = jest.fn();

    // 1. Admin mode with onAssignTeacher provided
    let adminTree: any;
    act(() => {
      adminTree = create(
        <ExamMissingMarksModal
          visible={true}
          onClose={onClose}
          readiness={readinessWithGaps}
          examName="Exam"
          onExportMissingMarks={jest.fn()}
          onAssignTeacher={onAssignTeacher}
        />
      );
    });

    const assignBtn = adminTree.root
      .findAllByType(TouchableOpacity)
      .find((t: any) => textOf(t).includes('Assign teacher'));
    expect(assignBtn).toBeDefined();

    act(() => {
      assignBtn.props.onPress();
    });
    expect(onClose).toHaveBeenCalled();
    expect(onAssignTeacher).toHaveBeenCalledWith(
      readinessWithGaps.papers[1],
      readinessWithGaps.papers[1].unassigned_sections[0]
    );

    // 2. Accounts mode with onAssignTeacher undefined
    let accountsTree: any;
    act(() => {
      accountsTree = create(
        <ExamMissingMarksModal
          visible={true}
          onClose={onClose}
          readiness={readinessWithGaps}
          examName="Exam"
          onExportMissingMarks={jest.fn()}
          onAssignTeacher={undefined}
        />
      );
    });

    const accountsAssignBtn = accountsTree.root
      .findAllByType(TouchableOpacity)
      .find((t: any) => textOf(t).includes('Assign teacher'));
    // Must NOT render a dead assign button in accounts route
    expect(accountsAssignBtn).toBeUndefined();
  });

  test('search query filters rows dynamically', () => {
    let tree: any;
    act(() => {
      tree = create(
        <ExamMissingMarksModal
          visible={true}
          onClose={jest.fn()}
          readiness={readinessWithGaps}
          examName="Exam"
          onExportMissingMarks={jest.fn()}
        />
      );
    });

    const input = tree.root.findByType(TextInput);
    expect(input).toBeDefined();

    // Search for Priya
    act(() => {
      input.props.onChangeText('Priya');
    });

    const content = textOf(tree);
    expect(content).toContain('Priya Sharma');
    expect(content).not.toContain('Teacher not assigned');
  });
});
