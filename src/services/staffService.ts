import { api } from './apiClient';

export interface Staff {
    id: string;
    person_id: string;
    staff_code: string;
    designation_id?: number;
    joining_date: string;
    status_id: number;
    salary?: number;
    // Joined fields
    first_name?: string;
    last_name?: string;
    display_name?: string;
    photo_url?: string;
    designation_name?: string;
    status_name?: string;
    /** API list rows use SQL aliases `designation` / `status` (same as designation_name / status_name). */
    designation?: string;
    status?: string;
    phone?: string;
    email?: string;
}

/** GET /staff returns a paginated envelope from the backend. */
export interface StaffListPage {
    data: Staff[];
    meta: {
        total: number;
        page: number;
        limit: number;
        total_pages: number;
    };
}

export interface StaffMyProfile {
    id: string;
    staff_code: string;
    joining_date?: string;
    first_name?: string;
    middle_name?: string | null;
    last_name?: string;
    display_name?: string;
    dob?: string | null;
    photo_url?: string | null;
    gender?: string | null;
    designation?: string | null;
    status?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    bus?: {
        id: string;
        bus_no: string;
        registration_no?: string | null;
        capacity?: number;
    } | null;
    routes?: Array<{ id: string; name: string; direction?: string | null }> | null;
}

export interface CreateStaffRequest {
    // Simplified flattened request for frontend convenience
    first_name: string;
    middle_name?: string;
    last_name: string;
    dob?: string;
    gender_id: number;
    email: string;
    phone: string;

    staff_code: string;
    designation_id?: number;
    joining_date: string;
    salary?: number;
    status_id?: number;

    password: string;
    role_code?: string;
}

// Legacy structure if needed, but easier to use flattened
export interface CreateStaffRequestLegacy {
    person: {
        first_name: string;
        middle_name?: string;
        last_name: string;
        dob?: string;
        gender_id: number;
        photo_url?: string;
    };
    staff: {
        staff_code: string;
        designation_id?: number;
        joining_date: string;
        salary?: number;
    };
    contacts?: Array<{
        contact_type: 'email' | 'phone' | 'address';
        contact_value: string;
        is_primary?: boolean;
    }>;
}

function staffRowsFromListResponse(res: Staff[] | StaffListPage): Staff[] {
    if (Array.isArray(res)) return res;
    if (res && typeof res === 'object' && Array.isArray((res as StaffListPage).data)) {
        return (res as StaffListPage).data;
    }
    return [];
}

export const StaffService = {
    getAll: async (params?: { status_id?: number; search?: string; limit?: number; page?: number }): Promise<Staff[]> => {
        const res = await api.get<Staff[] | StaffListPage>('/staff', params);
        return staffRowsFromListResponse(res);
    },

    getById: async (id: string): Promise<Staff> => {
        return api.get<Staff>(`/staff/${id}`);
    },

    create: async (data: CreateStaffRequest): Promise<Staff> => {
        return api.post<Staff>('/staff', data);
    },

    update: async (id: string, data: Partial<Staff & { password?: string }>): Promise<Staff> => {
        return api.put<Staff>(`/staff/${id}`, data);
    },

    delete: async (id: string): Promise<void> => {
        return api.delete<void>(`/staff/${id}`);
    },

    getClassTeacher: async (): Promise<Staff | null> => {
        // TODO: Implement when class-teacher mapping is available
        return null;
    },

    getTimetable: async (id: string, day?: string): Promise<any[]> => {
        return api.get<any[]>(`/staff/${id}/timetable`, { day });
    },

    getPayslips: async (id: string): Promise<any[]> => {
        return api.get<any[]>(`/staff/${id}/payslips`);
    },

    /** Current user's payslips; uses JWT → staff row (same data as accounts payroll). */
    getMyPayslips: async (): Promise<any[]> => {
        return api.get<any[]>('/staff/me/payslips');
    },

    /** Current staff member profile (personal + transport assignment for drivers). */
    getMyProfile: async (): Promise<StaffMyProfile> => {
        return api.get<StaffMyProfile>('/staff/me/profile');
    },

    /** Staff portal feature flags (payslips visibility, etc.). */
    getPortalConfig: async (): Promise<{ payslips_enabled: boolean }> => {
        return api.get<{ payslips_enabled: boolean }>('/staff/portal-config', undefined, { silent: true });
    },
};
