import { api, APIOptions } from './apiClient';
import { Notice, NoticeAudience, Complaint } from '../types/models';
import { StorageService } from './storageService';
import { supabase } from './supabaseConfig';

export { Notice, NoticeAudience, Complaint };

// ============================================================================
// COMPLAINTS
// ============================================================================

export interface CreateComplaintRequest {
    title: string;
    description: string;
    category?: string;
    priority?: string;
    raised_for_student_id?: string;
}

export interface BulkCreateComplaintRequest {
    title: string;
    description: string;
    category?: string;
    priority?: string;
    raised_for_student_ids: string[];
}

export const ComplaintService = {
    getAll: async (params?: { status?: string }): Promise<Complaint[]> => {
        return api.get<Complaint[]>('/complaints', params);
    },

    getById: async (id: string): Promise<Complaint> => {
        return api.get<Complaint>(`/complaints/${id}`);
    },

    getStudentComplaints: async (studentId: string): Promise<Complaint[]> => {
        const complaints = await api.get<any[]>('/complaints', { raised_for_student_id: studentId });

        return complaints.map((complaint) => ({
            ...complaint,
            description:
                complaint.description ??
                complaint.details ??
                complaint.remark ??
                complaint.complaint_text ??
                complaint.body ??
                complaint.note ??
                '',
        })) as Complaint[];
    },

    create: async (data: CreateComplaintRequest): Promise<Complaint> => {
        return api.post<Complaint>('/complaints', data);
    },

    createBulk: async (data: BulkCreateComplaintRequest): Promise<{ count: number; complaints: Complaint[] }> => {
        return api.post<{ count: number; complaints: Complaint[] }>('/complaints/bulk', data);
    },

    update: async (id: string, data: Partial<Complaint>): Promise<Complaint> => {
        return api.put<Complaint>(`/complaints/${id}`, data);
    },

    delete: async (id: string): Promise<void> => {
        return api.delete<void>(`/complaints/${id}`);
    },
};

// ============================================================================
// NOTICES
// ============================================================================



export interface CreateNoticeRequest {
    title: string;
    content: string;
    audience?: NoticeAudience;
    audiences?: NoticeAudience[];
    target_class_id?: string;
    priority?: string;
    is_pinned?: boolean;
    publish_at?: string;
    expires_at?: string;
}

export const NoticeService = {
    getAll: async (params?: { audience?: NoticeAudience; userId?: string | null }): Promise<Notice[]> => {
        let userId = params?.userId ?? null;
        if (!userId) {
            const { data: { session } } = await supabase.auth.getSession();
            userId = session?.user?.id ?? null;
        }
        const cacheKey = `notices_${params?.audience || 'all'}`;

        // 1. Return cached data immediately if available (Offline-First)
        if (userId) {
            const cached = await StorageService.get<Notice>(userId, cacheKey);
            if (cached && cached.data) {
                // Kick off background fetch to sync data silently
                api.get<Notice[]>('/notices', params).then(freshData => {
                    StorageService.set<Notice>(userId, cacheKey, freshData);
                }).catch(() => { });
                return cached.data;
            }
        }

        // 2. Fetch fresh if no cache
        const freshData = await api.get<Notice[]>('/notices', params);
        if (userId) {
            await StorageService.set<Notice>(userId, cacheKey, freshData);
        }
        return freshData;
    },

    getById: async (id: string): Promise<Notice> => {
        return api.get<Notice>(`/notices/${id}`);
    },

    create: async (data: CreateNoticeRequest): Promise<Notice> => {
        return api.post<Notice>('/notices', data);
    },

    update: async (id: string, data: Partial<Notice>): Promise<Notice> => {
        return api.put<Notice>(`/notices/${id}`, data);
    },

    delete: async (id: string): Promise<void> => {
        return api.delete<void>(`/notices/${id}`);
    },
};

// ============================================================================
// LEAVES
// ============================================================================

export interface LeaveApplication {
    id: string;
    leave_type: 'casual' | 'sick' | 'earned' | 'maternity' | 'paternity' | 'unpaid' | 'other';
    start_date: string;
    end_date: string;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    applied_by?: string;
    approved_by?: string;
    total_days?: number;
    created_at: string;
    reviewed_at?: string | null;
    review_remarks?: string | null;
    applicant_name?: string;
    applicant_role?: string;
    reviewed_by_name?: string | null;
}

export interface CreateLeaveRequest {
    leave_type: string;
    start_date: string;
    end_date: string;
    reason: string;
}

export const LeaveService = {
    getAll: async (params?: { status?: string; page?: number; limit?: number; leave_type?: string; from_date?: string; to_date?: string }, options?: APIOptions): Promise<LeaveApplication[]> => {
        return api.get<LeaveApplication[]>('/leaves', params, options);
    },

    getById: async (id: string): Promise<LeaveApplication> => {
        return api.get<LeaveApplication>(`/leaves/${id}`);
    },

    create: async (data: CreateLeaveRequest): Promise<LeaveApplication> => {
        return api.post<LeaveApplication>('/leaves', data);
    },

    approve: async (id: string): Promise<LeaveApplication> => {
        return api.put<LeaveApplication>(`/leaves/${id}`, { status: 'approved' });
    },

    reject: async (id: string, review_remarks?: string): Promise<LeaveApplication> => {
        return api.put<LeaveApplication>(`/leaves/${id}`, { status: 'rejected', review_remarks });
    },

    cancel: async (id: string): Promise<void> => {
        return api.delete<void>(`/leaves/${id}`);
    },
};

// ============================================================================
// DIARY
// ============================================================================

export interface DiaryEntry {
    id: string;
    class_section_id: string;
    entry_date: string;
    subject_id?: string;
    title?: string;
    title_te?: string;
    content: string;
    content_te?: string;
    homework_due_date?: string;
    attachments?: string[];
    subject_name?: string;
    subject_name_te?: string;
    class_name?: string;
    section_name?: string;
    created_by: string;
    created_at: string;
    updated_at?: string;
}

export type DiaryWritePayload = Partial<Omit<DiaryEntry, 'id' | 'created_at'>> & {
    // 'auto' = backend detects Telugu vs English from the text and translates.
    input_language?: 'te' | 'en' | 'auto';
};

export const DiaryService = {
    getAll: async (params: {
        class_section_id?: string;
        entry_date?: string;
        subject_id?: string;
        from_date?: string;
        to_date?: string;
        page?: number;
        limit?: number;
    }): Promise<DiaryEntry[]> => {
        return api.get<DiaryEntry[]>('/diary', params);
    },

    create: async (data: Omit<DiaryEntry, 'id' | 'created_at'> & { input_language?: 'te' | 'en' | 'auto' }): Promise<DiaryEntry> => {
        return api.post<DiaryEntry>('/diary', data);
    },

    update: async (id: string, data: DiaryWritePayload): Promise<DiaryEntry> => {
        return api.put<DiaryEntry>(`/diary/${id}`, data);
    },

    delete: async (id: string): Promise<void> => {
        return api.delete<void>(`/diary/${id}`);
    },
};

// ============================================================================
// EVENTS
// ============================================================================

export interface EventItem {
    id: string;
    title: string;
    title_te?: string;
    description: string;
    description_te?: string;
    event_type: string;
    start_date: string;
    end_date: string;
    start_time: string;
    end_time: string;
    location: string;
    is_all_day: boolean;
}

export const EventService = {
    getAll: async (params?: { upcoming_only?: boolean; to_date?: string }): Promise<EventItem[]> => {
        return api.get<EventItem[]>('/events', params);
    },
};

// ============================================================================
// TRANSPORT
// ============================================================================

export interface BusItem {
    id: string;
    route_name: string;
    route_id?: string | null;
    route_count?: number;
    driver_id?: string | null;
    driver_name: string;
    driver_phone: string;
    registration_no: string;
    bus_no: string;
    capacity: number;
    is_active: boolean;
}

export const TransportService = {
    getAllBuses: async (): Promise<BusItem[]> => {
        return api.get<BusItem[]>('/transport/buses');
    },

    updateBus: async (
        id: string,
        data: { bus_no?: string; registration_no?: string; capacity?: number; is_active?: boolean; driver_id?: string | null },
    ): Promise<void> => {
        await api.put(`/transport/buses/${id}`, data);
    },

    assignBus: async (
        id: string,
        data: { driver_id?: string | null; route_id?: string | null },
    ): Promise<BusItem> => {
        const res = await api.put<{ message: string; bus: BusItem }>(`/transport/buses/${id}/assignment`, data);
        return res.bus;
    },

    deleteBus: async (id: string): Promise<void> => {
        return api.delete<void>(`/transport/buses/${id}`);
    },
};

export interface Subject {
    id: string;
    name: string;
    name_te?: string;
    code?: string;
    description?: string;
}

export interface Exam {
    id: string;
    name: string;
    name_te?: string;
    academic_year_id: string;
    academic_year?: string;
    exam_type: string;
    start_date?: string;
    end_date?: string;
    status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
    timetable_published?: boolean;
    results_published?: boolean;
    results_published_at?: string | null;
}

export interface ResultEntry {
    student_id: string;
    marks: number;
    max_marks?: number;
    participation_marks?: number;
    written_work_marks?: number;
    project_work_marks?: number;
    slip_test_marks?: number;
}

export interface ExamResultUpload {
    class_section_id: string;
    exam_category: string;
    sub_exam: string;
    subject_id?: string;
    max_marks?: number;
    assessment_schema?: 'component' | 'consolidated';
    component_maximums?: {
        participation: number;
        written_work: number;
        project_work: number;
        slip_test: number;
    };
    results: ResultEntry[];
}

export interface StoredAssessmentMark {
    student_id: string;
    marks_obtained: number | null;
    consolidated_marks_obtained: number | null;
    participation_marks: number | null;
    written_work_marks: number | null;
    project_work_marks: number | null;
    slip_test_marks: number | null;
    is_absent: boolean;
    remarks?: string | null;
}

export interface AssessmentMarksResponse {
    marks: StoredAssessmentMark[];
    attendance: { student_id: string; attendance_percentage: number | null }[];
    max_marks: number;
    consolidated_max_marks: number;
    assessment_schema: 'component' | 'consolidated';
    component_maximums?: {
        participation: number;
        written_work: number;
        project_work: number;
        slip_test: number;
    };
}

export const ResultService = {
    // Subjects
    getSubjects: async (): Promise<Subject[]> => {
        return api.get<Subject[]>('/results/subjects');
    },
    createSubject: async (data: { name: string; code?: string; description?: string; name_te?: string }): Promise<Subject> => {
        return api.post<Subject>('/results/subjects', data);
    },
    deleteSubject: async (id: string): Promise<void> => {
        return api.delete(`/results/subjects/${id}`);
    },

    // Exams
    getExams: async (params?: { academic_year_id?: string; status?: string }): Promise<Exam[]> => {
        return api.get<Exam[]>('/results/exams', params);
    },
    createExam: async (data: { name: string; academic_year_id: string; exam_type: string; start_date?: string; end_date?: string; status?: string }): Promise<Exam> => {
        return api.post<Exam>('/results/exams', data);
    },
    updateExam: async (id: string, data: Partial<Exam>): Promise<Exam> => {
        return api.put<Exam>(`/results/exams/${id}`, data);
    },
    deleteExam: async (id: string, force = false): Promise<void> => {
        return api.delete(`/results/exams/${id}${force ? '?force=true' : ''}`);
    },

    upload: async (data: ExamResultUpload): Promise<{ success: boolean }> => {
        return api.post<{ success: boolean }>('/results/upload', data);
    },

    getMarks: async (params: { class_section_id: string; exam_category: string; sub_exam: string; subject_id: string }): Promise<AssessmentMarksResponse> => {
        return api.get<AssessmentMarksResponse>('/results/marks', params);
    }
};

export interface TeacherClassAssignment {
    class_section_id: string;
    class_id: string; // Added for LMS
    class_name: string;
    section_id: string;
    section_name: string;
    subject_id: string;
    subject_name: string;
    assignment_id: string;
}

export const TeacherService = {
    getMyClasses: async (): Promise<TeacherClassAssignment[]> => {
        return api.get<TeacherClassAssignment[]>('/teachers/me/classes');
    }
};
