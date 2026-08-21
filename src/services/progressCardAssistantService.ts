import { api } from './apiClient';
import type { ResultRankingMethod } from '../utils/assessmentGrading';

export interface ProgressCardStudentOption {
  id: string;
  admission_no: string;
  roll_number?: number | null;
  display_name: string;
  photo_url?: string | null;
}

export interface ProgressCardExamOption {
  id: string;
  name: string;
  exam_type: string;
  start_date?: string | null;
  end_date?: string | null;
  results_published?: boolean;
}

export interface ProgressCardClassContext {
  class_section: {
    id: string;
    class_name: string;
    section_name: string;
    academic_year: string;
  } | null;
  students: ProgressCardStudentOption[];
  exams: ProgressCardExamOption[];
  ranking_method: ResultRankingMethod;
}

export interface ProgressCardSubjectResult {
  subject_id: string;
  subject_name: string;
  assessment_schema: 'component' | 'consolidated';
  max_marks: number;
  marks_obtained: number | null;
  consolidated_max_marks: number;
  consolidated_marks_obtained: number | null;
  participation_marks: number | null;
  written_work_marks: number | null;
  project_work_marks: number | null;
  slip_test_marks: number | null;
  component_total: number | null;
  weightage_20: number | null;
  percentage: number | null;
  entry_status: 'complete' | 'missing' | 'absent';
}

export interface ProgressCardAssistantReport {
  class_section: NonNullable<ProgressCardClassContext['class_section']>;
  student: ProgressCardStudentOption & { enrollment_id: string };
  exam: ProgressCardExamOption;
  subjects: ProgressCardSubjectResult[];
  summary: {
    total_obtained: number;
    total_max: number;
    percentage: number;
    rank: number | null;
    subject_count: number;
    completed_subjects: number;
    missing_subjects: number;
    ranking_method: ResultRankingMethod;
  };
  attendance: {
    working_days: number;
    days_present: number;
    percentage: number | null;
  };
}

export type FinalCalculationPeriod = 'summative_1' | 'summative_2' | 'annual';

export interface FinalSourceMark {
  status: 'graded' | 'missing' | 'absent';
  score: number | null;
  maximum: number | null;
  contribution: number | null;
}

export interface CalculatedPeriodResult {
  formative_contribution?: number | null;
  exam_contribution?: number | null;
  summative_contribution?: number | null;
  total: number | null;
  percentage: number | null;
  grade: string | null;
  gpa: number | null;
  status: 'complete' | 'incomplete';
  missing_sources: string[];
}

export interface FinalCalculatedSubject {
  subject_id: string;
  subject_name: string;
  sources: Record<'fa1' | 'fa2' | 'fa3' | 'fa4' | 'sa1' | 'sa2', FinalSourceMark>;
  summative_1: CalculatedPeriodResult;
  summative_2: CalculatedPeriodResult;
  annual: CalculatedPeriodResult;
}

export interface FinalCalculationSummary {
  status: 'complete' | 'incomplete';
  total_obtained: number | null;
  total_max: number;
  percentage: number | null;
  grade: string | null;
  gpa: number | null;
  completed_subjects: number;
  subject_count: number;
  missing_sources: string[];
  rank: number | null;
}

export interface FinalCalculationsReport {
  class_section: NonNullable<ProgressCardClassContext['class_section']>;
  student: ProgressCardStudentOption & {
    subjects: FinalCalculatedSubject[];
    summaries: Record<FinalCalculationPeriod, FinalCalculationSummary>;
  };
  ranking_method: ResultRankingMethod;
  formulas: Record<FinalCalculationPeriod, string>;
}

const staffParams = (staffId?: string) => staffId ? { staff_id: staffId } : undefined;

export const ProgressCardAssistantService = {
  getContext: (staffId?: string): Promise<ProgressCardClassContext> =>
    api.get('/results/progress-card-assistant/context', staffParams(staffId), { silent: true }),

  getStudentReport: (
    studentId: string,
    examId: string,
    staffId?: string,
  ): Promise<ProgressCardAssistantReport> =>
    api.get(
      `/results/progress-card-assistant/student/${studentId}`,
      { exam_id: examId, ...(staffId ? { staff_id: staffId } : {}) },
      { silent: true },
    ),

  getFinalCalculations: (
    studentId: string,
    staffId?: string,
  ): Promise<FinalCalculationsReport> =>
    api.get(
      `/results/progress-card-assistant/student/${studentId}/final-calculations`,
      staffParams(staffId),
      { silent: true },
    ),
};
