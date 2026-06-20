import { api } from './apiClient';

// --- Types ---

export type RiskLevel = 'SAFE' | 'WARNING' | 'CRITICAL';

export interface StudentRiskProfile {
    id: string;
    name: string;
    class: string;
    riskLevel: RiskLevel;
    factors: string[]; // e.g., ["Marks ↓ 15%", "Attendance < 75%"]
    trend: number[]; // Last 5 test scores for tiny graph
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
    }[];
}

// --- Mock Data (Temporary until Backend Endpoints are ready) ---



export const AdminService = {
    /**
     * Get main dashboard statistics
     */
    getDashboardStats: async (options?: any): Promise<AdminDashboardStats> => {
        return api.get<AdminDashboardStats>('/admin/dashboard-stats', undefined, options);
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
     * Generate AI Talking Points for a student
     */
    generateTalkingPoints: async (studentId: string): Promise<string[]> => {
        return api.get<string[]>(`/analytics/talking-points/${studentId}`);
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
};
