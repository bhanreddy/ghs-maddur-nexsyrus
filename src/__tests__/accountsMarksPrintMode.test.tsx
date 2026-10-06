/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import AccountsMarksExportScreen from '../../app/accounts/marks';
import { AccountsMarksService } from '../services/accountsMarksService';
import { printAssessmentMarks } from '../utils/assessmentMarksPrint';
const { create, act } = require('react-test-renderer');

jest.mock('../features/app-tour', () => {
  const { View, ScrollView } = require('react-native');
  return { TourTarget: View, TourScrollView: ScrollView };
});
jest.mock('../hooks/useTheme', () => ({ useTheme: () => ({ theme: require('../theme/types').defaultLightTheme, isDark: false }) }));
jest.mock('../contexts/AccountsWebChromeContext', () => ({ useAccountsWebChrome: () => ({ shellActive: true }) }));
jest.mock('../components/AdminHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/HtmlPreview', () => ({ __esModule: true, default: 'HtmlPreview' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../utils/crossPlatformAlert', () => ({ alertCompat: jest.fn() }));
jest.mock('../utils/assessmentMarksPrint', () => ({ printAssessmentMarks: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/accountsMarksService', () => ({ AccountsMarksService: { getContext: jest.fn(), getPrintDocument: jest.fn(), exportSchoolMarks: jest.fn().mockResolvedValue(undefined) } }));

let tree: any;
const textOf = (node: any) => node.findAllByType(Text).map((text: any) => React.Children.toArray(text.props.children).join('')).join(' ');
const button = (label: string) => tree.root.findAllByType(TouchableOpacity).find((node: any) => textOf(node) === label);
const selectOption = async (label: string, option: string) => {
  await act(async () => { tree.root.findAllByType(TouchableOpacity).find((node: any) => node.props.accessibilityLabel?.startsWith(`${label}: `)).props.onPress(); });
  await act(async () => { button(option).props.onPress(); });
};
const closePreview = async () => {
  await act(async () => { tree.root.findAllByType(TouchableOpacity).find((node: any) => node.props.accessibilityLabel === 'Close print preview').props.onPress(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  (AccountsMarksService.getContext as jest.Mock).mockResolvedValue({
    exams: [{ id: 'exam', name: 'FA-1', exam_type: 'fa_results', academic_year_id: 'year', academic_year: '2026–27', class_ids: ['class'] }],
    class_sections: [{ id: 'class-section', academic_year_id: 'year', class_id: 'class', class_name: '8', section_id: 'section', section_name: 'A' }],
    ranking_method: 'competition',
  });
  (AccountsMarksService.getPrintDocument as jest.Mock).mockImplementation((_exam, filters) => Promise.resolve({
    html: `<html>${filters.marksMode}</html>`, marks_mode: filters.marksMode, page_count: 1, student_count: 1,
  }));
});
afterEach(() => { act(() => tree?.unmount()); });

it('defaults to original marks, prints the selected preview, and allows switching back without changing Excel', async () => {
  await act(async () => { tree = create(<AccountsMarksExportScreen />); });
  await act(async () => { button('Preview & print marks list').props.onPress(); });
  expect(AccountsMarksService.getPrintDocument).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ marksMode: 'original' }));
  await closePreview();
  await selectOption('Printed marks', 'Passing criteria (36%)');
  await act(async () => { button('Preview & print marks list').props.onPress(); });
  expect(AccountsMarksService.getPrintDocument).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ marksMode: 'passing_criteria' }));
  expect(tree.root.findByType('HtmlPreview').props.html).toBe('<html>passing_criteria</html>');
  await act(async () => { button('Print marks list').props.onPress(); });
  expect(printAssessmentMarks).toHaveBeenCalledWith('<html>passing_criteria</html>');
  await closePreview();
  await act(async () => { button('Download all classes & sections').props.onPress(); });
  expect(AccountsMarksService.exportSchoolMarks).toHaveBeenLastCalledWith(expect.anything(), { classId: undefined, sectionId: undefined, resultStatus: 'all' });
  await selectOption('Printed marks', 'Original marks');
  await act(async () => { button('Preview & print marks list').props.onPress(); });
  expect(tree.root.findByType('HtmlPreview').props.html).toBe('<html>original</html>');
});

it('uses dropdown filters for print and Excel and clears dependent filters when class or exam changes', async () => {
  (AccountsMarksService.getContext as jest.Mock).mockResolvedValue({
    exams: [
      { id: 'fa1', name: 'FA-1', exam_type: 'fa_results', academic_year_id: 'year', academic_year: '2026–27', class_ids: ['class-1', 'class-10', 'class-2'] },
      { id: 'fa2', name: 'FA-2', exam_type: 'fa_results', academic_year_id: 'year', academic_year: '2026–27', class_ids: ['class-10'] },
      { id: 'weekend', name: 'W-4', exam_type: 'weekend', academic_year_id: 'year', academic_year: '2026–27', class_ids: ['class-1'] },
    ],
    class_sections: ['1', '10', '2'].map(name => ({ id: `cs-${name}`, academic_year_id: 'year', class_id: `class-${name}`, class_name: name, section_id: name === '10' ? 'section-b' : 'section-a', section_name: name === '10' ? 'B' : 'A' })),
    ranking_method: 'competition',
  });
  await act(async () => { tree = create(<AccountsMarksExportScreen />); });
  // Read the offered class options by opening the actual dropdown.
  await act(async () => { tree.root.findAllByType(TouchableOpacity).find((node: any) => node.props.accessibilityLabel === 'Class: All classes').props.onPress(); });
  expect(tree.root.findAllByType(TouchableOpacity).filter((node: any) => node.props.accessibilityRole === 'radio').map(textOf)).toEqual(['All classes', '1', '2', '10']);
  await act(async () => { button('2').props.onPress(); });
  await selectOption('Section', 'A');
  await selectOption('Result status', 'Fail (incl. absent)');
  await act(async () => { button('Download filtered marks').props.onPress(); });
  expect(AccountsMarksService.exportSchoolMarks).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'fa1' }), { classId: 'class-2', sectionId: 'section-a', resultStatus: 'fail' });
  await act(async () => { button('Preview & print marks list').props.onPress(); });
  expect(AccountsMarksService.getPrintDocument).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'fa1' }), expect.objectContaining({ classId: 'class-2', sectionId: 'section-a', resultStatus: 'fail' }));
  await closePreview();
  await selectOption('Class', '10');
  expect(tree.root.findAllByType(TouchableOpacity).some((node: any) => node.props.accessibilityLabel === 'Section: All sections')).toBe(true);
  await selectOption('Section', 'B');
  await selectOption('Exam', 'FA-2 · 2026–27');
  await act(async () => { button('Preview & print marks list').props.onPress(); });
  expect(AccountsMarksService.getPrintDocument).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'fa2' }), { classId: undefined, sectionId: undefined, resultStatus: 'all', marksMode: 'original' });
  await closePreview();
  await selectOption('Printed marks', 'Passing criteria (36%)');
  await act(async () => { button('Reset filters').props.onPress(); });
  expect(tree.root.findAllByType(TouchableOpacity).some((node: any) => node.props.accessibilityLabel === 'Printed marks: Original marks')).toBe(true);
  await selectOption('Exam', 'W-4 · 2026–27');
  expect(button('Preview & print marks list')).toBeUndefined();
  expect(tree.root.findAllByType(TouchableOpacity).some((node: any) => node.props.accessibilityLabel?.startsWith('Printed marks: '))).toBe(false);
  expect(button('Download all classes & sections')).toBeDefined();
});
