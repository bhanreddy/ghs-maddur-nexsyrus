export type PayrollStatus = 'pending' | 'paid';

export interface PayrollEntry {
    id: string;
    staff_id: string;
    base_salary: number;
    bonus: number;
    salary_adjustment: number;
    deductions: number;
    net_salary: number;
    status: PayrollStatus;
    payment_date: string | null;
    payroll_month: number;
    payroll_year: number;
    payment_method: string | null;
    payment_reference?: string | null;
    remarks: string | null;
    created_at: string;
    updated_at: string;
    calculation_engine?: string | null;
    workflow_status?: string | null;
    requires_review?: boolean;
    review_reason?: string | null;
    attendance_summary?: {
        input_mode: 'SYSTEM_DAILY' | 'MANUAL_SUMMARY';
        cl_days: string | null;
        non_cl_days: string | null;
        late_count: number | null;
        provider_name?: string | null;
        supporting_reference?: string | null;
        reason?: string | null;
        verified?: boolean;
        version: number;
    } | null;
    holiday_override?: {
        holiday_count: number;
        source?: string | null;
        provider_name?: string | null;
        supporting_reference?: string | null;
        reason?: string | null;
        version: number;
    } | null;

    // Relations
    staff?: {
        staff_code: string;
        designation?: { name: string };
        person?: {
            first_name: string;
            last_name: string;
            photo_url: string | null;
            display_name?: string | null;
        };
    };
}

export interface PayrollSummary {
    total_paid: number;
    total_pending: number;
    count_paid: number;
    count_pending: number;
}
