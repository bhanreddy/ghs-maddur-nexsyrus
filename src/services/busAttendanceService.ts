import { api } from './apiClient';

export interface BusStopStudent {
  student_id: string;
  admission_no: string;
  student_name: string;
  photo_url: string | null;
  class_name: string | null;
  section_name: string | null;
  attendance_id: string | null;
  attendance_status: 'present' | 'absent' | null;
  marked_at: string | null;
}

export interface MarkBusAttendanceRequest {
  trip_id: string;
  stop_id: string;
  route_id: string;
  date: string;
  attendance: Array<{
    student_id: string;
    status: 'present' | 'absent';
  }>;
}

export interface BusStopSummary {
  stop_id: string;
  stop_name: string;
  present_count: number;
  absent_count: number;
  total_assigned: number;
}

export interface StudentBusAttendanceRecord {
  id: string;
  attendance_date: string;
  status: 'present' | 'absent';
  marked_at: string;
  stop_name: string;
  route_name: string;
}

export const BusAttendanceService = {
  isEnabled: async (): Promise<{ enabled: boolean }> => {
    return api.get<{ enabled: boolean }>('/transport/driver/bus-attendance/settings');
  },

  getStopStudents: async (
    stopId: string,
    tripId?: string,
    date?: string
  ): Promise<BusStopStudent[]> => {
    return api.get<BusStopStudent[]>(`/transport/driver/bus-attendance/stop/${stopId}/students`, {
      trip_id: tripId,
      date,
    });
  },

  markAttendance: async (data: MarkBusAttendanceRequest): Promise<{ success: boolean; count: number }> => {
    return api.post<{ success: boolean; count: number }>('/transport/driver/bus-attendance/mark', data);
  },

  getSummary: async (tripId: string): Promise<BusStopSummary[]> => {
    return api.get<BusStopSummary[]>('/transport/driver/bus-attendance/summary', { trip_id: tripId });
  },

  getMyAttendance: async (): Promise<StudentBusAttendanceRecord[]> => {
    return api.get<StudentBusAttendanceRecord[]>('/transport/my-attendance');
  },
};
