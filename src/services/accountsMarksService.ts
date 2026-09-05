import { api } from './apiClient';
import type { ResultRankingMethod } from '../utils/assessmentGrading';

export interface AccountsMarksExam {
  id: string;
  academic_year_id: string;
  name: string;
  exam_type: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  results_published: boolean;
  academic_year: string;
  subject_papers: number;
  class_count: number;
  section_count: number;
  class_ids: string[];
}

export interface AccountsMarksClassSection {
  id: string;
  class_id: string;
  section_id: string;
  academic_year_id: string;
  class_name: string;
  section_name: string;
}

export type AccountsMarksResultFilter = 'all' | 'pass' | 'fail' | 'absent' | 'incomplete';

export interface AccountsMarksExportFilters {
  classId?: string;
  sectionId?: string;
  resultStatus: AccountsMarksResultFilter;
}

export interface AccountsMarksContext {
  exams: AccountsMarksExam[];
  class_sections: AccountsMarksClassSection[];
  ranking_method: ResultRankingMethod;
}

export const AccountsMarksService = {
  getContext: (): Promise<AccountsMarksContext> =>
    api.get('/results/accounts/marks-export/context', undefined, { silent: true }),

  exportSchoolMarks: async (
    exam: AccountsMarksExam,
    filters: AccountsMarksExportFilters,
  ): Promise<void> => {
    const safeExam = exam.name.replace(/[^A-Za-z0-9_-]+/g, '-');
    const params = new URLSearchParams({ result_status: filters.resultStatus });
    if (filters.classId) params.set('class_id', filters.classId);
    if (filters.sectionId) params.set('section_id', filters.sectionId);
    return api.downloadFile(
      `/results/accounts/exams/${exam.id}/marks/export?${params.toString()}`,
      `${safeExam || 'exam'}-filtered-marks.xlsx`,
    );
  },
};
