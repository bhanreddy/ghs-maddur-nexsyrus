import { api } from './apiClient';

export interface SubstitutionPeriod {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  sort_order: number;
  is_break?: boolean | null;
  slot_type?: string | null;
}

export interface SubstitutionSlot {
  slot_id: string;
  class_section_id: string;
  period_number: number;
  is_break?: boolean | null;
  period_name?: string | null;
  start_time: string;
  end_time: string;
  room_no?: string | null;
  class_name: string;
  section_name: string;
  subject_id: string;
  subject_name: string;
  regular_teacher_id?: string | null;
  regular_teacher_name?: string | null;
  substitution_id?: string | null;
  substitute_teacher_id?: string | null;
  substitute_teacher_name?: string | null;
  reason?: string | null;
  assigned_at?: string | null;
  is_auto_suggested?: boolean | null;
  leave_application_id?: string | null;
  unavailability_sources?: ('leave' | 'attendance' | 'manual')[];
  unavailability_label?: string | null;
}

export interface UnavailableTeacher {
  id: string;
  teacher_name: string;
  staff_code?: string | null;
  sources: ('leave' | 'attendance')[];
  source_label: string;
  leave_status?: string | null;
  attendance_status?: string | null;
  affected_slots_count: number;
}

export interface SubstitutionBoard {
  date: string;
  academic_year_id: string | null;
  timetable_day: string;
  timetable_mode: 'uniform' | 'per_day';
  periods: SubstitutionPeriod[];
  slots: SubstitutionSlot[];
  teachers: { id: string; teacher_name: string }[];
  unavailable_teachers?: UnavailableTeacher[];
  attendance_recorded?: boolean;
  summary: {
    total_slots: number;
    covered_slots: number;
    uncovered_slots: number;
    unavailable_teachers_count?: number;
  };
}

export interface SubstituteCandidate {
  id: string;
  staff_code?: string;
  teacher_name: string;
  photo_url?: string | null;
  subject_name: string;
  subject_match: boolean;
  class_familiarity: boolean;
  is_class_teacher: boolean;
  daily_load: number;
  adjacent_load: number;
  recent_substitution_count: number;
  attendance_status?: string | null;
  score: number;
  recommendation: 'Best match' | 'Great fit' | 'Available';
  reasons: string[];
}

export interface CandidateResponse {
  date: string;
  target: {
    slot_id: string;
    class_section_id: string;
    period_number: number;
    start_time: string;
    end_time: string;
    class_name: string;
    section_name: string;
    subject_name: string;
    absent_teacher_name: string;
  };
  candidates: SubstituteCandidate[];
}

export interface MySubstitution {
  id: string;
  substitution_date: string;
  period_number: number;
  period_name?: string | null;
  timetable_slot_id: string;
  class_section_id: string;
  subject_id: string;
  attendance_session?: 'morning' | 'afternoon' | null;
  reason?: string | null;
  start_time: string;
  end_time: string;
  room_no?: string | null;
  class_name: string;
  section_name: string;
  subject_name: string;
  absent_teacher_name: string;
}

export const SubstitutionService = {
  getBoard(date: string): Promise<SubstitutionBoard> {
    return api.get<SubstitutionBoard>('/substitutions/board', { date });
  },

  getCandidates(date: string, slotId: string): Promise<CandidateResponse> {
    return api.get<CandidateResponse>('/substitutions/candidates', {
      date,
      slot_id: slotId,
    });
  },

  assign(data: {
    date: string;
    slot_id: string;
    substitute_teacher_id: string;
    reason?: string;
  }): Promise<{ message: string; substitution: unknown }> {
    return api.post('/substitutions', data, { silent: true });
  },

  cancel(id: string): Promise<{ message: string }> {
    return api.delete(`/substitutions/${id}`, { silent: true });
  },

  getMine(date: string): Promise<MySubstitution[]> {
    return api.get<MySubstitution[]>('/substitutions/mine', { date }, { silent: true });
  },
};
