import { api } from './apiClient';

export type HostelSummary = {
  blocks: number;
  rooms: number;
  beds: number;
  occupied: number;
  pending_requests: number;
};

export type HostelBlock = {
  id: string;
  name: string;
  code?: string | null;
  room_count: number;
  total_capacity: number;
  occupied_beds: number;
  is_active: boolean;
};

export type HostelRoom = {
  id: string;
  block_id: string;
  block_name: string;
  room_no: string;
  floor?: number | null;
  capacity: number;
  occupied_beds: number;
  room_type: string;
  monthly_fee?: number | null;
  is_available: boolean;
};

export type HostelStudent = {
  id: string;
  admission_no: string;
  student_name: string;
  class_name?: string | null;
  section_name?: string | null;
  roll_number?: string | null;
  allocation_id?: string | null;
  room_id?: string | null;
  room_no?: string | null;
  block_name?: string | null;
  bed_no?: number | null;
};

export type HostelPermissionRequest = {
  id: string;
  student_id?: string;
  admission_no?: string;
  student_name?: string;
  block_name?: string | null;
  room_no?: string | null;
  request_type: 'outing' | 'overnight_leave' | 'late_return' | 'visitor' | 'other';
  reason: string;
  starts_on: string;
  ends_on: string;
  status: 'pending' | 'approved';
  admin_note?: string | null;
  reviewed_at?: string | null;
  created_at: string;
};

export type HostelProfile = {
  student_id: string;
  student_name: string;
  admission_no: string;
  is_allocated: boolean;
  allocation_id?: string | null;
  academic_year?: string | null;
  block_name?: string | null;
  block_code?: string | null;
  room_no?: string | null;
  floor?: number | null;
  bed_no?: number | null;
  room_type?: string | null;
  monthly_fee?: number | null;
  annual_fee?: number | null;
  warden_name?: string | null;
};

export const HostelService = {
  getSummary: () => api.get<HostelSummary>('/hostel/summary'),
  getCurrentAcademicYear: () => api.get<{ id: string; code: string }>('/hostel/academic-years/current'),
  getBlocks: () => api.get<HostelBlock[]>('/hostel/blocks'),
  getRooms: (blockId?: string) => api.get<HostelRoom[]>('/hostel/rooms', { block_id: blockId }),
  getStudents: (academicYearId: string, search?: string) =>
    api.get<{ academic_year_id: string; students: HostelStudent[] }>('/hostel/eligible-students', {
      academic_year_id: academicYearId,
      search,
    }),
  getRequests: (status: 'pending' | 'approved' | 'all' = 'all') =>
    api.get<HostelPermissionRequest[]>('/hostel/requests', { status }),
  createBlock: (input: { name: string; code?: string }) => api.post('/hostel/blocks', input),
  updateBlock: (id: string, input: { name: string; code?: string }) => api.put(`/hostel/blocks/${id}`, input),
  deleteBlock: (id: string) => api.delete(`/hostel/blocks/${id}`),
  createRoom: (input: {
    block_id: string;
    room_no: string;
    floor?: number | null;
    capacity: number;
    room_type: string;
    monthly_fee?: number | null;
  }) => api.post('/hostel/rooms', input),
  updateRoom: (id: string, input: {
    room_no: string;
    floor?: number | null;
    capacity: number;
    room_type: string;
    monthly_fee?: number | null;
  }) => api.put(`/hostel/rooms/${id}`, input),
  deleteRoom: (id: string) => api.delete(`/hostel/rooms/${id}`),
  assignStudent: (input: {
    student_id: string;
    room_id: string;
    academic_year_id: string;
    bed_no?: number | null;
  }) => api.post('/hostel/allocations', input),
  removeStudent: (allocationId: string) => api.delete(`/hostel/allocations/${allocationId}`),
  approveRequest: (id: string, adminNote?: string) =>
    api.patch(`/hostel/requests/${id}/approve`, { admin_note: adminNote }),
  deleteRequest: (id: string) => api.delete(`/hostel/requests/${id}`),
  getMyProfile: () => api.get<HostelProfile>('/hostel/me'),
  getMyRequests: () => api.get<HostelPermissionRequest[]>('/hostel/me/requests'),
  createMyRequest: (input: {
    request_type: HostelPermissionRequest['request_type'];
    reason: string;
    starts_on: string;
    ends_on: string;
  }) => api.post('/hostel/me/requests', input),
};
