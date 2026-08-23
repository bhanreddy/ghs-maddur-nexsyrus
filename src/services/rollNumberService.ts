import { api } from './apiClient';

export interface RollNumberStudent {
  enrollment_id: string;
  student_id: string;
  admission_no: string;
  roll_number: number | null;
  student_name: string;
  photo_url?: string | null;
}

export interface RollNumberRoster {
  class_section: {
    id: string;
    academic_year_id: string;
    class_name: string;
    section_name: string;
    academic_year: string;
    manual_roll_numbers: boolean;
    roll_number_start: number;
  };
  students: RollNumberStudent[];
  message?: string;
  range?: { start: number; end: number };
}

export const RollNumberService = {
  getRoster: (): Promise<RollNumberRoster> =>
    api.get('/staff/roll-numbers', undefined, { silent: true }),

  save: (assignments: { enrollment_id: string; roll_number: number }[]): Promise<RollNumberRoster> =>
    api.put('/staff/roll-numbers', { assignments }, { silent: true }),
};
