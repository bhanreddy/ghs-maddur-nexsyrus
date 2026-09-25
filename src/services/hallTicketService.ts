import { api } from './apiClient';
import type { ExamHallTicketData } from './examService';
import type { HallTicketsPerPage } from '../utils/hallTicketPdf';

export interface HallTicketEligibilityFilters {
  class_id: string;
  section_id: string;
  min_clearance_percent: number;
  max_clearance_percent: number;
  exclude_previously_downloaded: boolean;
}

export interface HallTicketEligibilitySummary {
  total_active_students: number;
  within_fee_range: number;
  previously_downloaded: number;
  temporarily_reserved: number;
  ready_to_download: number;
}

export interface HallTicketClearanceSnapshot {
  id: string;
  display_name: string;
  father_name?: string | null;
  photo_url?: string | null;
  admission_no: string;
  roll_number?: string | number | null;
  payable_amount: number;
  paid_amount: number;
  clearance_percent: number;
  no_fee_record: boolean;
  previously_downloaded: boolean;
  temporarily_reserved: boolean;
  within_range: boolean;
}

export interface HallTicketRecentBatch {
  id: string;
  min_clearance_percent: number;
  max_clearance_percent: number;
  exclude_previously_downloaded: boolean;
  tickets_per_page: HallTicketsPerPage;
  show_roll_numbers: boolean;
  student_count: number;
  operator_name: string | null;
  completed_at: string | null;
}

export interface HallTicketPreview extends ExamHallTicketData {
  eligibility_summary: HallTicketEligibilitySummary;
  applied_filters: Omit<HallTicketEligibilityFilters, 'class_id' | 'section_id'>;
  clearance_snapshots: HallTicketClearanceSnapshot[];
  recent_batches: HallTicketRecentBatch[];
}

export interface PreparedHallTicketBatch extends HallTicketPreview {
  batch_id: string;
  expires_at: string;
  tickets_per_page: HallTicketsPerPage;
  show_roll_numbers: boolean;
}

export interface HallTicketBatchRequest extends HallTicketEligibilityFilters {
  tickets_per_page: HallTicketsPerPage;
  show_roll_numbers: boolean;
}

export const HallTicketService = {
  preview: async (examId: string, filters: HallTicketEligibilityFilters): Promise<HallTicketPreview> =>
    api.get<HallTicketPreview>(`/hall-tickets/exams/${examId}/preview`, filters),

  prepare: async (examId: string, request: HallTicketBatchRequest): Promise<PreparedHallTicketBatch> =>
    api.post<PreparedHallTicketBatch>(`/hall-tickets/exams/${examId}/batches`, request),

  complete: async (examId: string, batchId: string): Promise<void> => {
    await api.post(`/hall-tickets/exams/${examId}/batches/${batchId}/complete`);
  },

  fail: async (examId: string, batchId: string): Promise<void> => {
    await api.post(`/hall-tickets/exams/${examId}/batches/${batchId}/fail`);
  },
};
