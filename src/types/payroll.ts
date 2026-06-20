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
    remarks: string | null;
    created_at: string;
    updated_at: string;

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
