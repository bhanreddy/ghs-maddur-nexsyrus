import type { ResultRankingMethod } from '../assessmentGrading';

export type PrintNumber = number | string | null;
export interface PrintPaper {
  exam_subject_id: string;
  subject_id: string;
  subject_name: string;
  assessment_schema: 'component' | 'consolidated';
  max_marks: PrintNumber;
  passing_marks?: PrintNumber;
  participation_max_marks?: PrintNumber;
  written_work_max_marks?: PrintNumber;
  project_work_max_marks?: PrintNumber;
  slip_test_max_marks?: PrintNumber;
}
export interface PrintMark {
  exam_subject_id: string;
  mark_id: string | null;
  marks_obtained: PrintNumber;
  max_marks?: PrintNumber;
  passing_marks?: PrintNumber;
  is_absent?: boolean;
  participation_marks?: PrintNumber;
  written_work_marks?: PrintNumber;
  project_work_marks?: PrintNumber;
  slip_test_marks?: PrintNumber;
}
export interface PrintStudent {
  student_id: string;
  student_name: string;
  admission_no?: string;
  roll_number?: PrintNumber;
  attendance_percentage?: PrintNumber;
  subjects: PrintMark[];
}
export interface PrintSection {
  classSection: { id: string; class_name: string; section_name: string };
  teacherName?: string;
  papers: PrintPaper[];
  students: PrintStudent[];
}
export interface PrintFormativeSource extends PrintPaper, Omit<PrintMark, 'max_marks'> {
  class_section_id: string;
  student_id: string;
  exam_type: string;
  exam_name: string;
}
export interface AccountsAssessmentPrintData {
  print_data_version: 1;
  schoolName?: string;
  exam: { name: string; exam_type: string };
  sections: PrintSection[];
  formativeRows: PrintFormativeSource[];
  rankingMethod: ResultRankingMethod;
}
export interface PrintOptions {
  marksMode?: 'original' | 'passing_criteria';
  resultStatus?: 'all' | 'pass' | 'fail' | 'absent' | 'incomplete';
}
export interface PreparedPrintSection extends Omit<PrintSection, 'students'> {
  students: (PrintStudent & {
    total_obtained: number | null;
    total_max: number;
    percentage: number | null;
    rank: number | null;
    has_absence: boolean;
    result_status: string;
    is_complete?: boolean;
    summative_subjects?: {
      exam_subject_id: string;
      exam_marks: number | null;
      formative_contribution: number | null;
      total: number | null;
      maximum: number;
      is_complete: boolean;
    }[];
  })[];
  displayPapers: PrintPaper[];
}
export function prepareAccountsAssessmentPrint(data: AccountsAssessmentPrintData, options?: PrintOptions): PreparedPrintSection[];
export function buildAccountsAssessmentPrint(data: AccountsAssessmentPrintData, options?: PrintOptions): {
  html: string;
  page_count: number;
  student_count: number;
  marks_mode: 'original' | 'passing_criteria';
};
