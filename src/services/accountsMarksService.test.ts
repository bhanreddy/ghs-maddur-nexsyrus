import { AccountsMarksExam, AccountsMarksPrintFilters, AccountsMarksService } from './accountsMarksService';
import { api } from './apiClient';

jest.mock('./apiClient', () => ({ api: { get: jest.fn(), downloadFile: jest.fn() } }));
const exam = { id: 'exam-1', name: 'FA 1', exam_type: 'fa_results' } as AccountsMarksExam;

describe('accounts marks print requests', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches a print document with the same class, section and result filters as Excel', async () => {
    (api.get as jest.Mock).mockResolvedValue({ html: '<html></html>', page_count: 1, student_count: 20 });
    await AccountsMarksService.getPrintDocument(exam, { classId: 'class-4', sectionId: 'section-a', resultStatus: 'absent' });
    expect(api.get).toHaveBeenCalledWith('/results/accounts/exams/exam-1/marks/export?result_status=absent&class_id=class-4&section_id=section-a&format=print', undefined, { silent: true });
  });

  it('keeps the existing Excel export endpoint and download behavior', async () => {
    await AccountsMarksService.exportSchoolMarks(exam, { resultStatus: 'all' });
    expect(api.downloadFile).toHaveBeenCalledWith('/results/accounts/exams/exam-1/marks/export?result_status=all', 'FA-1-filtered-marks.xlsx');
  });

  it('sends the selected mode only to the print endpoint, and can switch back to original', async () => {
    await AccountsMarksService.getPrintDocument(exam, { resultStatus: 'all', marksMode: 'passing_criteria' });
    expect(api.get).toHaveBeenLastCalledWith('/results/accounts/exams/exam-1/marks/export?result_status=all&format=print&marks_mode=passing_criteria', undefined, { silent: true });
    await AccountsMarksService.getPrintDocument(exam, { resultStatus: 'all', marksMode: 'original' });
    expect(api.get).toHaveBeenLastCalledWith('/results/accounts/exams/exam-1/marks/export?result_status=all&format=print&marks_mode=original', undefined, { silent: true });
    const filters: AccountsMarksPrintFilters = { resultStatus: 'all', marksMode: 'passing_criteria' };
    await AccountsMarksService.exportSchoolMarks(exam, filters);
    expect(api.downloadFile).toHaveBeenLastCalledWith('/results/accounts/exams/exam-1/marks/export?result_status=all', 'FA-1-filtered-marks.xlsx');
  });
});
