import { api } from './apiClient';

// --- Types ---

export type RiskLevel = 'SAFE' | 'WARNING' | 'CRITICAL';

export interface StudentRiskProfile {
    id: string;
    name: string;
    class: string;
    riskLevel: RiskLevel;
    /** Composite urgency 0–100 (higher = contact sooner) */
    riskScore?: number;
    attendancePct?: number;
    failedCount?: number;
    factors: string[]; // e.g., ["Attendance 67%", "Marks ↓ 15%"]
    primaryFactor?: string;
    recommendation?: string;
    trend: number[]; // Last 5 test scores, oldest → newest
}

export interface HeatmapData {
    classes: string[];
    subjects: string[];
    data: Record<string, Record<string, number>>;
}

export interface AdminDashboardStats {
    totalStudents: number;
    staffPresent: number;
    totalStaff: number;
    collection: number;
    complaints: number;
    // Add other relevant stats
}

export interface AdminQuickActionUsage {
    usageDate: string | null;
    counts: Record<string, number>;
}

export interface AdminQuickActionClickResult {
    actionKey: string;
    clickCount: number;
    usageDate: string;
}
export type AppAdoptionStatus = 'all' | 'detected' | 'not_detected';

export interface AppAdoptionUser {
    user_id: string;
    display_name: string;
    photo_url?: string | null;
    email?: string | null;
    phone?: string | null;
    roles: string[];
    last_login_at?: string | null;
    account_created_at: string;
    admission_no?: string | null;
    class_name?: string | null;
    section_name?: string | null;
    device_count: number;
    last_detected_at?: string | null;
    platforms: string[];
    app_detected: boolean;
}

export interface AppAdoptionReport {
    users: AppAdoptionUser[];
    summary: {
        total: number;
        detected: number;
        not_detected: number;
    };
    meta: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
    };
}

export interface AccountsPortalStaffMember {
    staff_id: string;
    first_name?: string;
    last_name?: string;
    display_name?: string;
    staff_code?: string;
    designation?: string | null;
    email?: string | null;
    user_id?: string | null;
    has_login: boolean;
    has_accounts_access: boolean;
    is_elevated: boolean;
}

export interface AccountsStaffCreationSetting {
    enabled: boolean;
    message?: string;
}

export interface PartialFeePaymentSetting {
    enabled: boolean;
    message?: string;
}

export interface PartialFeeDirectCollectSetting {
    enabled: boolean;
    message?: string;
}

export interface AdminFinanceStats {
    today_collection: number;
    monthly_collection: number;
    collected_total: number;
    pending_dues: number;
    defaulter_count: number;
    recent_transactions?: {
        id: string;
        amount: number;
        payment_method?: string;
        paid_at?: string;
        student_name?: string;
        father_name?: string;
        admission_no?: string;
        class_name?: string;
        section_name?: string;
        fee_type?: string;
        receipt_no?: string;
        remarks?: string;
        transaction_ref?: string;
        received_by?: string;
        received_by_id?: string;
        student_id?: string;
        student_fee_id?: string;
        academic_year?: string;
    }[];
}

export interface ParentVisit {
    id: string;
    student_id: string;
    parent_id?: string | null;
    parent_name: string;
    relationship?: string | null;
    purpose: string;
    notes?: string | null;
    visited_at: string;
    created_at: string;
    admission_no: string;
    student_name: string;
    class_name?: string | null;
    section_name?: string | null;
    recorded_by_name?: string | null;
}

export interface ParentVisitList {
    visits: ParentVisit[];
    summary: {
        total_visits: number;
        visits_this_month: number;
        students_visited: number;
    };
    meta: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
    };
}

export interface StudentInsightMark {
    id: string;
    marks_obtained: number | string | null;
    is_absent: boolean;
    subject_name: string;
    subject_name_te?: string | null;
    max_marks: number | string;
    passing_marks: number | string;
    exam_name: string;
    exam_name_te?: string | null;
    exam_type?: string | null;
    academic_year?: string | null;
}

// --- Mock Data (Temporary until Backend Endpoints are ready) ---



export interface TalkingPointsResult {
    points: string[];
    source: 'calculated' | 'ai' | 'fallback';
    language?: 'te';
    summary?: {
        app?: {
            detected: boolean;
            device_count: number;
            student_device_count: number;
            parent_device_count: number;
            last_detected_at: string | null;
        };
        attendance: {
            total_days: number;
            present_days: number;
            full_present_days: number;
            half_days: number;
            absent_days: number;
            percentage: number | null;
        };
        complaints: {
            total: number;
            open: number;
            behaviour: number;
            open_behaviour: number;
            serious: number;
        };
        parent_visits: {
            total: number;
            last_visited_on: string | null;
        };
        result: {
            trend: 'improved' | 'declined' | 'unchanged' | 'insufficient_data';
            change_points: number | null;
            latest_exam: {
                exam_id: string;
                exam_name: string;
                exam_name_te?: string | null;
                exam_date?: string | null;
                avg_pct: number;
            } | null;
            previous_exam: {
                exam_id: string;
                exam_name: string;
                exam_name_te?: string | null;
                exam_date?: string | null;
                avg_pct: number;
            } | null;
            weak_subjects: {
                name: string;
                current_pct: number | null;
                previous_pct: number | null;
                is_absent: boolean;
            }[];
        };
    };
}

export const AdminService = {
    /**
     * Get main dashboard statistics
     */
    getDashboardStats: async (options?: any): Promise<AdminDashboardStats> => {
        return api.get<AdminDashboardStats>('/admin/dashboard-stats', undefined, options);
    },

    /** Today's click totals shared by every admin in this school. */
    getQuickActionUsage: async (): Promise<AdminQuickActionUsage> => {
        return api.get<AdminQuickActionUsage>(
            '/admin/quick-action-usage',
            undefined,
            { silent: true }
        );
    },

    /** Atomically count one quick-action open for the school's current day. */
    recordQuickActionClick: async (actionKey: string): Promise<AdminQuickActionClickResult> => {
        return api.post<AdminQuickActionClickResult>(
            '/admin/quick-action-usage',
            { action_key: actionKey },
            { silent: true }
        );
    },
    getAppAdoption: async (params?: {
        page?: number;
        limit?: number;
        search?: string;
        status?: AppAdoptionStatus;
        role?: string;
    }): Promise<AppAdoptionReport> => {
        return api.get<AppAdoptionReport>('/admin/app-adoption', params, { silent: true });
    },

    /**
     * Finance summary for /admin/finance — always returns full stats (not visibility-gated).
     */
    getFinanceStats: async (): Promise<AdminFinanceStats> => {
        return api.get<AdminFinanceStats>('/admin/finance-stats');
    },

    /**
     * Get Student Risk Analysis
     */
    getRiskProfiles: async (filters?: any): Promise<StudentRiskProfile[]> => {
        return api.get<StudentRiskProfile[]>('/analytics/risk', filters);
    },

    /**
     * Get Academic Performance Heatmap
     */
    getAcademicHeatmap: async (): Promise<HeatmapData> => {
        return api.get<HeatmapData>('/analytics/heatmap');
    },

    /**
     * Generate AI Talking Points for a student (Telugu)
     */
    generateTalkingPoints: async (studentId: string): Promise<TalkingPointsResult> => {
        const data = await api.get<TalkingPointsResult | string[]>(`/analytics/talking-points/${studentId}`);
        if (Array.isArray(data)) {
            const isFallback = data[0]?.startsWith('[Rule-based') || data[0]?.startsWith('[విశ్లేషణ]');
            return { points: data, source: isFallback ? 'fallback' : 'ai' };
        }
        return data;
    },

    getParentVisits: async (params?: {
        search?: string;
        student_id?: string;
        page?: number;
        limit?: number;
    }): Promise<ParentVisitList> => {
        return api.get<ParentVisitList>('/admin/parent-visits', params, { silent: true });
    },

    recordParentVisit: async (data: {
        student_id: string;
        parent_id?: string;
        parent_name: string;
        relationship?: string;
        purpose: string;
        notes?: string;
        visited_at?: string;
    }): Promise<{ visit: ParentVisit; student_visit_count: number; message: string }> => {
        return api.post('/admin/parent-visits', data, { silent: true });
    },

    removeParentVisit: async (id: string): Promise<{ message: string }> => {
        return api.delete(`/admin/parent-visits/${id}`);
    },

    getStudentInsightMarks: async (studentId: string): Promise<StudentInsightMark[]> => {
        return api.get<StudentInsightMark[]>(
            `/results/marks/student/${studentId}`,
            undefined,
            { silent: true },
        );
    },

    /**
     * Get accounts dashboard visibility config
     */
    getAccountsDashboardConfig: async (): Promise<{ config: Record<string, boolean> }> => {
        return api.get<{ config: Record<string, boolean> }>('/admin/accounts-dashboard-config');
    },

    /**
     * Update accounts dashboard visibility config
     */
    updateAccountsDashboardConfig: async (config: Record<string, boolean>): Promise<{ config: Record<string, boolean> }> => {
        return api.put<{ config: Record<string, boolean> }>('/admin/accounts-dashboard-config', { config });
    },

    getAccountsPortalStaff: async (): Promise<AccountsPortalStaffMember[]> => {
        const res = await api.get<{ staff: AccountsPortalStaffMember[] }>('/admin/accounts-portal-staff');
        return Array.isArray(res?.staff) ? res.staff : [];
    },

    setAccountsPortalAccess: async (
        staffId: string,
        enabled: boolean,
    ): Promise<{ staff_id: string; has_accounts_access: boolean; message: string }> => {
        return api.put<{ staff_id: string; has_accounts_access: boolean; message: string }>(
            `/admin/accounts-portal-staff/${staffId}`,
            { enabled },
        );
    },

    getAccountsStaffCreationSetting: async (): Promise<AccountsStaffCreationSetting> => {
        return api.get<AccountsStaffCreationSetting>('/admin/accounts-staff-creation');
    },

    setAccountsStaffCreationEnabled: async (enabled: boolean): Promise<AccountsStaffCreationSetting> => {
        return api.put<AccountsStaffCreationSetting>('/admin/accounts-staff-creation', { enabled });
    },

    getPartialFeePaymentSetting: async (): Promise<PartialFeePaymentSetting> => {
        return api.get<PartialFeePaymentSetting>('/admin/partial-fee-payment');
    },

    setPartialFeePaymentEnabled: async (enabled: boolean): Promise<PartialFeePaymentSetting> => {
        return api.put<PartialFeePaymentSetting>('/admin/partial-fee-payment', { enabled });
    },

    getPartialFeeDirectCollectSetting: async (): Promise<PartialFeeDirectCollectSetting> => {
        return api.get<PartialFeeDirectCollectSetting>('/admin/partial-fee-direct-collect');
    },

    setPartialFeeDirectCollectEnabled: async (enabled: boolean): Promise<PartialFeeDirectCollectSetting> => {
        return api.put<PartialFeeDirectCollectSetting>('/admin/partial-fee-direct-collect', { enabled });
    },

    getStaffPayslipsSetting: async (): Promise<{ enabled: boolean }> => {
        return api.get<{ enabled: boolean }>('/admin/staff-payslips');
    },

    setStaffPayslipsEnabled: async (enabled: boolean): Promise<{ enabled: boolean; message?: string }> => {
        return api.put<{ enabled: boolean; message?: string }>('/admin/staff-payslips', { enabled });
    },
};
