import { api } from './apiClient';
import type {
    Student,
    StudentEnrollment,
    AttendanceResponse,
    FeeResponse,
    Parent,
    AttendanceSummary,
} from '../types/models';

/** Aggregated payload from GET /student/dashboard (one HTTP call for the student home tab). */
export interface StudentDashboardResponse {
    profile: Student;
    notices: unknown[];
    attendance: {
        summary: AttendanceSummary | null;
        latest_record: { attendance_date: string; status: string } | null;
    };
    upcoming_fee: unknown | null;
    timetable_today: unknown[];
}

// API Request/Response types matching Backend logic
export interface CreateStudentRequest {
    first_name: string;
    middle_name?: string;
    last_name?: string | null;
    dob?: string;
    gender_id: number;
    admission_no: string;
    pen_number?: string;
    apar_number?: string | null;
    admission_date: string;
    status_id: number;
    category_id: number;
    religion_id: number;
    blood_group_id: number;
    email?: string;
    phone?: string;
    password?: string;
    role_code?: string;
    class_id: string;
    section_id: string;
    academic_year_id: string;
    parents?: Parent[];
}

export interface UpdateStudentRequest {
    first_name?: string;
    middle_name?: string;
    last_name?: string | null;
    dob?: string;
    gender_id?: number;
    admission_no?: string;
    pen_number?: string;
    apar_number?: string | null;
    admission_date?: string;
    status_id?: number;
    category_id?: number;
    religion_id?: number;
    blood_group_id?: number;
    phone?: string;
    email?: string;
    password?: string;
    role_code?: string;
    class_id?: string;
    section_id?: string;
    academic_year_id?: string;
    parents?: Parent[];
}

export const StudentService = {
    /**
     * Get paginated list of students
     */
    getAll: async <T = Student>(params?: {
        search?: string;
        limit?: number;
        page?: number;
        class_id?: string;
        section_id?: string;
        status_id?: number | string;
        sort_by?: 'name' | 'roll_number' | 'admission_no';
        sort_order?: 'asc' | 'desc';
    }): Promise<{ data: T[]; meta?: { total: number; page: number; limit: number; total_pages: number } }> => {
        return api.get<{ data: T[]; meta?: any }>('/students', params);
    },

    /**
     * Get all available student statuses
     */
    getStatuses: async (): Promise<{ id: number; name: string }[]> => {
        return api.get<{ id: number; name: string }[]>('/students/statuses');
    },

    /**
     * Search students by name or admission number
     */
    search: async (query: string, limit = 5): Promise<Student[]> => {
        const response = await api.get<{ data: Student[] }>('/students', { search: query, limit });
        // Handle both array response and { data: [] } response formats from paginated API
        if (Array.isArray(response)) return response;
        return response.data || [];
    },

    /**
     * Resolve a student from a name, admission number, or UUID.
     * Returns null when ambiguous (multiple partial matches).
     */
    resolveByQuery: async (query: string): Promise<Student | null> => {
        const resolution = await StudentService.resolveSearchQuery(query);
        return resolution.status === 'found' ? resolution.student : null;
    },

    /**
     * Resolve a search query, distinguishing exact matches from ambiguous ones.
     */
    resolveSearchQuery: async (
        query: string,
    ): Promise<
        | { status: 'found'; student: Student }
        | { status: 'ambiguous'; students: Student[] }
        | { status: 'not_found' }
    > => {
        const trimmed = query.trim();
        if (!trimmed) return { status: 'not_found' };

        const results = await StudentService.search(trimmed);
        if (results.length > 0) {
            const normalized = trimmed.toLowerCase();
            const exactAdmissionMatches = results.filter((s) => s.admission_no === trimmed);
            if (exactAdmissionMatches.length === 1) {
                return { status: 'found', student: exactAdmissionMatches[0] };
            }
            if (exactAdmissionMatches.length > 1) {
                return { status: 'ambiguous', students: exactAdmissionMatches };
            }

            const exactNameMatches = results.filter((s) => {
                const displayName = s.display_name?.toLowerCase() ?? '';
                const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ').trim().toLowerCase();
                return displayName === normalized || fullName === normalized;
            });
            if (exactNameMatches.length === 1) {
                return { status: 'found', student: exactNameMatches[0] };
            }
            if (exactNameMatches.length > 1) {
                return { status: 'ambiguous', students: exactNameMatches };
            }

            if (results.length === 1) return { status: 'found', student: results[0] };

            return { status: 'ambiguous', students: results };
        }

        try {
            const student = await StudentService.getById(trimmed);
            return { status: 'found', student };
        } catch {
            return { status: 'not_found' };
        }
    },

    /**
     * Get single student with full details
     */
    /** Get single student with full details (silent for certificate flows). */
    getById: async (id: string, options?: { silent?: boolean }): Promise<Student> => {
        return api.get<Student>(`/students/${id}`, undefined, options);
    },

    /**
     * Get current student profile (My Profile)
     */
    getProfile: async (): Promise<Student> => {
        return api.get<Student>('/students/profile/me');
    },

    getDashboard: async (): Promise<StudentDashboardResponse> => {
        return api.get<StudentDashboardResponse>('/student/dashboard');
    },

    /**
     * Create new student
     */
    create: async (data: CreateStudentRequest): Promise<Student> => {
        return api.post<Student>('/students', data);
    },

    /**
     * Update student
     */
    update: async (id: string, data: UpdateStudentRequest): Promise<{ message?: string; student?: Student; success?: boolean }> => {
        return api.put<{ message?: string; student?: Student; success?: boolean }>(`/students/${id}`, data);
    },

    /**
     * Get student enrollments
     */
    getEnrollments: async (id: string, options?: { silent?: boolean }): Promise<StudentEnrollment[]> => {
        return api.get<StudentEnrollment[]>(`/students/${id}/enrollments`, undefined, options);
    },

    getParents: async (id: string, options?: { silent?: boolean }): Promise<Parent[]> => {
        return api.get<Parent[]>(`/students/${id}/parents`, undefined, options);
    },

    /**
     * Get student attendance with summary
     */
    getAttendance: async (
        id: string,
        params?: { from_date?: string; to_date?: string; limit?: number }
    ): Promise<AttendanceResponse> => {
        return api.get<AttendanceResponse>(`/students/${id}/attendance`, params);
    },

    /**
     * Get student fees
     */
    getFees: async (id: string, params?: { page?: number; limit?: number; academic_year_id?: string }): Promise<FeeResponse & { meta?: { total: number; page: number; limit: number; total_pages: number } }> => {
        return api.get(`/students/${id}/fees`, params);
    },

    /**
     * Get students without active enrollment
     */
    getUnenrolledStudents: async (academicYearId?: number): Promise<Student[]> => {
        let url = '/students/unenrolled';
        if (academicYearId) {
            url += `?academic_year_id=${academicYearId}`;
        }
        return api.get<Student[]>(url);
    },

    /**
     * Manuall Enroll Student
     */
    enrollStudent: async (studentId: number, data: { class_id: number, section_id: number, academic_year_id?: number }): Promise<any> => {
        return api.post<any>(`/students/${studentId}/enrollments`, data);
    },

    /**
     * Delete a student
     */
    delete: async (id: string): Promise<any> => {
        return api.delete(`/students/${id}`);
    },

    /**
     * PERMANENTLY delete a student and ALL of their data (fees, receipts, marks,
     * attendance, transport, parent links, login accounts…). Irreversible.
     * Requires explicit confirmation — the caller must have run the multi-step
     * confirmation flow before invoking this.
     */
    hardDelete: async (id: string): Promise<{ stats?: Record<string, number>; authFailures?: unknown[] }> => {
        return api.post(`/students/${id}/hard-delete`, { confirm: true });
    },

    /**
     * Get student results (Typed as any for now, strict type available in backend check)
     */
    getResults: async (id: string): Promise<any> => {
        return api.get<any>(`/students/${id}/results`);
    },
};
