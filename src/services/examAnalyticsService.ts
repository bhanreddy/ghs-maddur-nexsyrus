import { api } from './apiClient';

export interface ExamAnalyticsClassSection {
  id: string;
  class_id: string;
  academic_year_id: string;
  class_name: string;
  section_name: string;
  academic_year: string;
  student_count: number;
}

export interface ExamAnalyticsExam {
  id: string;
  name: string;
  exam_type: string;
  start_date?: string | null;
  end_date?: string | null;
  results_published?: boolean;
}

export interface ExamAnalyticsStudent {
  id: string;
  admission_no: string;
  roll_number?: number | null;
  display_name: string;
  photo_url?: string | null;
}

export interface ExamAnalyticsContext {
  selected_class_section_id: string | null;
  class_sections: ExamAnalyticsClassSection[];
  exams: ExamAnalyticsExam[];
  students: ExamAnalyticsStudent[];
}

export interface ExamAnalyticsSubject {
  subject_id: string;
  subject_name: string;
  assessment_schema: 'component' | 'consolidated';
  max_marks: number;
  total_students: number;
  graded_students: number;
  lowest_score: number | null;
  highest_score: number | null;
  average_score: number | null;
  student_score: number | null;
  lowest_percentage: number | null;
  highest_percentage: number | null;
  average_percentage: number | null;
  student_percentage: number | null;
  student_status: 'graded' | 'missing' | 'absent' | null;
}

export interface ExamAnalyticsReport {
  class_section: ExamAnalyticsClassSection;
  exam: ExamAnalyticsExam;
  selected_student: ExamAnalyticsStudent | null;
  subjects: ExamAnalyticsSubject[];
  summary: {
    subject_count: number;
    student_count: number;
    graded_entries: number;
    possible_entries: number;
    completion_percentage: number;
    strongest_subject: string | null;
    focus_subject: string | null;
    student_average_percentage: number | null;
    student_above_class_average: number | null;
  };
}

export const ExamAnalyticsService = {
  getContext: (classSectionId?: string): Promise<ExamAnalyticsContext> =>
    api.get(
      '/results/exam-analytics/context',
      classSectionId ? { class_section_id: classSectionId } : undefined,
      { silent: true },
    ),

  getReport: (
    classSectionId: string,
    examId: string,
    studentId?: string,
  ): Promise<ExamAnalyticsReport> =>
    api.get(
      '/results/exam-analytics',
      {
        class_section_id: classSectionId,
        exam_id: examId,
        ...(studentId ? { student_id: studentId } : {}),
      },
      { silent: true },
    ),
};
