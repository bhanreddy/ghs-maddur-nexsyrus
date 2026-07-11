import { api } from './apiClient';
import {
    StudentFee,
    FeeTransaction,
    FeeResponse,
    AccountsDashboardStats,
    FeeReceipt,
    FeeStructure,
    FeeStructureListResponse,
    FeeMode,
    FeeType
} from '../types/models';

export { FeeType };
export type { FeeMode, FeeStructureListResponse };

function inferFeeMode(payload: any, structures: FeeStructure[]): FeeMode {
    if (payload?.fee_mode === 'per_section') return 'per_section';
    if (payload?.fee_mode === 'per_class') return 'per_class';
    if (structures.some((s) => s.section_id)) return 'per_section';
    return 'per_class';
}

function parseStructurePayload(result: any): FeeStructureListResponse {
    if (Array.isArray(result)) {
        return { fee_mode: inferFeeMode(null, result), structures: result };
    }
    const payload = result?.structures != null ? result : result?.data ?? result;
    if (Array.isArray(payload)) {
        return { fee_mode: inferFeeMode(null, payload), structures: payload };
    }
    const structures = payload?.structures ?? [];
    return {
        fee_mode: inferFeeMode(payload, structures),
        structures,
        missing_sections: payload?.missing_sections ?? [],
    };
}

export interface CollectFeeRequest {
    student_fee_id: string;
    amount: number;
    payment_method: 'cash' | 'card' | 'upi' | 'bank_transfer' | 'cheque' | 'online';
    transaction_ref?: string;
    remarks?: string;
    request_approval?: boolean;
}

export type CollectFeeResult =
    | { status: 'posted'; transaction: FeeTransaction }
    | { status: 'pending_approval'; message: string; approval_request: { id: string; type: string; payload: Record<string, unknown> } };

export interface CollectMultiFeeItem {
    student_fee_id: string;
    amount: number;
}

export interface CollectMultiFeeRequest {
    payment_method: 'cash' | 'card' | 'upi' | 'bank_transfer' | 'cheque' | 'online';
    transaction_ref: string;
    remarks?: string;
    items: CollectMultiFeeItem[];
}

/** One combined receipt line (a single fee type paid within the combined receipt). */
export interface CombinedReceiptLine {
    fee_type: string;
    fee_type_te?: string;
    academic_year?: string;
    amount: number;
}

export interface CollectMultiFeeResult {
    message: string;
    receipt: { id: string; receipt_no: string; total_amount: number | string } | null;
    /** Combined transaction shaped for receipt printing (carries line_items). */
    transaction: FeeTransaction & {
        line_items?: CombinedReceiptLine[];
        paid_fee_ids?: string[];
    };
}

export interface AdjustFeeRequest {
    student_fee_id: string;
    amount: number;
    reason: string;
    adjustment_type: 'waive' | 'add';
}

export type FeeSummaryStatus = 'Paid' | 'Partial' | 'Pending';

export interface FeeSummary {
    student_id: string;
    admission_no?: string;
    student_name: string;
    class_name?: string;
    father_name?: string;
    father_mobile?: string;
    student_gender?: string;
    total_amount: number | string;
    paid_amount: number | string;
    due_amount: number | string;
    status: FeeSummaryStatus;
}

export interface FeeSummaryParams {
    class_id?: string;
    academic_year_id?: string;
    search?: string;
    admission_no?: string;
    father_name?: string;
    mobile?: string;
    status?: FeeSummaryStatus;
    page?: number;
    limit?: number;
}

export interface FeeCollector {
    id: string;
    name: string;
}

export interface SchoolFeeType {
    id: string;
    name: string;
    code?: string;
    sort_order?: number;
}

export interface CollectionSummaryParams {
    date?: string;
    from_date?: string;
    to_date?: string;
    group_by?: 'day' | 'month';
    received_by?: string;
}

export interface TransactionListParams {
    from_date?: string;
    to_date?: string;
    payment_method?: string;
    received_by?: string;
    page?: number;
    limit?: number;
}

export interface TodayCollectionResponse {
    date?: string;
    collector_id?: string;
    transactions: FeeTransaction[];
    total_transactions: number;
    total_collected: number;
    by_payment_method?: Array<{
        payment_method: string;
        transaction_count: number;
        total_amount: number | string;
    }>;
}

export interface FeeSummaryResponse {
    data: FeeSummary[];
    meta?: {
        total: number;
        page: number;
        limit: number;
        total_pages: number;
        counts?: Record<'All' | FeeSummaryStatus, number>;
    };
}

export const FeeService = {
    getFeeMode: async (): Promise<FeeMode> => {
        const result = await api.get<{ fee_mode: FeeMode }>('/fees/fee-mode');
        return result?.fee_mode === 'per_section' ? 'per_section' : 'per_class';
    },

    setFeeMode: async (feeMode: FeeMode): Promise<{ fee_mode: FeeMode; seeded_count?: number; migration?: string }> => {
        return api.patch('/fees/fee-mode', { fee_mode: feeMode });
    },

    /**
     * Get fee structure for a class
     */
    getStructureByClass: async (classId: string, academicYearId?: string, sectionId?: string): Promise<FeeStructure[]> => {
        const result = await api.get<any>(`/fees/structure`, {
            class_id: classId,
            academic_year_id: academicYearId,
            ...(sectionId ? { section_id: sectionId } : {}),
        });
        return parseStructurePayload(result).structures;
    },

    /** List fee structures for the school (optionally filtered by academic year). */
    listStructures: async (academicYearId?: string): Promise<FeeStructureListResponse> => {
        const params = academicYearId ? { academic_year_id: academicYearId } : undefined;
        const result = await api.get<any>(`/fees/structure`, params);
        return parseStructurePayload(result);
    },

    /**
     * Create fee structure
     */
    createStructure: async (data: Partial<FeeStructure>): Promise<FeeStructure> => {
        const response = await api.post<{ structure: FeeStructure }>('/fees/structure', data);
        return response.structure;
    },

    /**
     * Delete a fee structure (soft delete). Blocked by the backend when
     * payments have already been collected against it.
     */
    deleteStructure: async (id: string): Promise<void> => {
        await api.delete(`/fees/structure/${id}`);
    },

    /**
     * Get student fees (Ledger)
     */
    getStudentFees: async (studentId: string, academicYearId?: string): Promise<FeeResponse> => {
        return api.get<FeeResponse>(`/fees/students/${studentId}`, { academic_year_id: academicYearId });
    },

    /** Tuition + transport outstanding balance (0 when fully paid). */
    getStudentOutstandingBalance: async (studentId: string, academicYearId?: string): Promise<number> => {
        const result = await api.get<FeeResponse & {
            summary?: FeeSummary & { total_balance?: number | string };
        }>(
            `/fees/students/${studentId}`,
            academicYearId ? { academic_year_id: academicYearId } : undefined,
            { silent: true },
        );
        const summary = result?.summary;
        return Number(summary?.total_balance ?? summary?.balance ?? 0);
    },

    /** Serial receipt number linked to a fee transaction (RCT-YYYYMMDD-####). */
    lookupReceiptNo: async (transactionId: string): Promise<string | null> => {
        const res = await api.get<{ receipt_no: string | null }>(
            `/fees/transactions/${transactionId}/receipt-no`,
            undefined,
            { silent: true },
        );
        return res?.receipt_no ?? null;
    },

    /**
     * Collect fee payment
     */
    collectFee: async (data: CollectFeeRequest): Promise<CollectFeeResult> => {
        const response = await api.post<{
            transaction?: FeeTransaction;
            status?: string;
            message?: string;
            approval_request?: { id: string; type: string; payload: Record<string, unknown> };
        }>('/fees/collect', data, { silent: true });

        if (response?.status === 'pending_approval') {
            return {
                status: 'pending_approval',
                message: response.message || 'Payment requires admin approval',
                approval_request: response.approval_request!,
            };
        }

        return { status: 'posted', transaction: response.transaction! };
    },

    /**
     * Collect several fee types in one action and generate a SINGLE receipt.
     * Each fee type still posts its own ledger transaction (balances stay
     * accurate) but they roll up into one receipt_no.
     */
    collectMultipleFees: async (data: CollectMultiFeeRequest): Promise<CollectMultiFeeResult> => {
        const response = await api.post<{
            message?: string;
            receipt?: { id: string; receipt_no: string; total_amount: number | string } | null;
            transaction?: FeeTransaction & { line_items?: CombinedReceiptLine[]; paid_fee_ids?: string[] };
        }>('/fees/collect-multi', data, { silent: true });

        return {
            message: response?.message || 'Combined payment collected successfully',
            receipt: response?.receipt ?? null,
            transaction: response!.transaction!,
        };
    },

    /**
     * Apply a direction-aware fee adjustment (waive or add)
     */
    adjustFee: async (data: AdjustFeeRequest): Promise<{ message: string; fee: StudentFee }> => {
        return api.post<{ message: string; fee: StudentFee }>('/fees/adjust', data);
    },

    /**
     * Get list of defaulters
     */
    getDefaulters: async (params?: { class_id?: string; academic_year_id?: string; min_days_overdue?: number }): Promise<any[]> => {
        return api.get<any[]>('/fees/defaulters', params);
    },

    /**
     * List receipts
     */
    getReceipts: async (params?: { student_id?: string; from_date?: string; to_date?: string }): Promise<FeeReceipt[]> => {
        return api.get<FeeReceipt[]>('/fees/receipts', params);
    },

    /**
     * Get receipt details
     */
    getReceipt: async (id: string): Promise<FeeReceipt> => {
        return api.get<FeeReceipt>(`/fees/receipts/${id}`);
    },

    /**
     * Get consolidated dashboard stats
     */
    getDashboardStats: async (options?: { forAccounts?: boolean }): Promise<AccountsDashboardStats> => {
        const params = options?.forAccounts ? { for_accounts: '1' } : undefined;
        return api.get<AccountsDashboardStats>('/fees/dashboard-stats', params);
    },

    /**
     * Admin Finance & Collection screen — full stats + recent transactions (not visibility-gated).
     */
    getAdminFinanceStats: async (params?: { date?: string }): Promise<{
        today_collection: number;
        monthly_collection: number;
        collected_total: number;
        pending_dues: number;
        defaulter_count: number;
        recent_transactions?: FeeTransaction[];
    }> => {
        return api.get('/admin/finance-stats', params);
    },

    /**
     * Get student summaries for list view
     */
    getStudentFeeSummaries: async (params?: FeeSummaryParams): Promise<FeeSummaryResponse> => {
        const result = await api.get<any>('/fees/summaries', params);
        // Backend returns { data: [...], meta: {...} } inside the sendSuccess envelope
        return Array.isArray(result)
            ? { data: result }
            : { data: result?.data ?? [], meta: result?.meta };
    },

    /**
     * List all transactions
     */
    getTransactions: async (params?: TransactionListParams): Promise<FeeTransaction[]> => {
        return api.get<FeeTransaction[]>('/fees/transactions', params);
    },

    /**
     * Fetch all matching transactions (paginates past the 100-row API cap).
     */
    getAllTransactions: async (params?: Omit<TransactionListParams, 'page' | 'limit'>): Promise<FeeTransaction[]> => {
        const all: FeeTransaction[] = [];
        let page = 1;
        const limit = 100;
        while (true) {
            const batch = await api.get<FeeTransaction[]>('/fees/transactions', { ...params, page, limit });
            const rows = Array.isArray(batch) ? batch : (batch as any)?.data ?? [];
            all.push(...rows);
            if (rows.length < limit) break;
            page += 1;
        }
        return all;
    },

    /**
     * List school-defined fee types (for filters and setup).
     */
    getFeeTypes: async (): Promise<SchoolFeeType[]> => {
        const result = await api.get<SchoolFeeType[]>('/fees/types');
        const rows = Array.isArray(result) ? result : (result as any)?.data ?? [];
        return [...rows].sort((a, b) =>
            (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
        );
    },

    reorderFeeTypes: async (typeIds: string[]): Promise<FeeType[]> => {
        return api.put<FeeType[]>('/fees/types/reorder', { type_ids: typeIds });
    },

    /**
     * Today's collections for the logged-in accountant only (server-enforced).
     */
    getTodayCollection: async (): Promise<TodayCollectionResponse> => {
        const result = await api.get<any>('/fees/today-collection');
        const payload = result?.transactions != null ? result : result?.data ?? result;
        const transactions = Array.isArray(payload?.transactions)
            ? payload.transactions
            : Array.isArray(payload)
              ? payload
              : [];
        return {
            date: payload?.date,
            collector_id: payload?.collector_id,
            transactions,
            total_transactions: Number(payload?.total_transactions ?? transactions.length),
            total_collected: Number(payload?.total_collected ?? 0),
            by_payment_method: payload?.by_payment_method ?? [],
        };
    },

    /**
     * List users who collect fees (for accountant attribution filters)
     */
    getCollectors: async (): Promise<FeeCollector[]> => {
        const result = await api.get<FeeCollector[]>('/fees/collectors');
        return Array.isArray(result) ? result : (result as any)?.data ?? [];
    },

    /**
     * Get recent transactions
     */
    getRecentTransactions: async (limit: number = 10): Promise<FeeTransaction[]> => {
        return api.get<FeeTransaction[]>('/fees/transactions', { limit }); // Assuming backend supports limit
    },

    /**
     * Get collection summary (daily/monthly range)
     */
    getCollectionSummary: async (params: CollectionSummaryParams): Promise<any> => {
        return api.get<any>('/fees/collection-summary', params);
    },

    /**
     * Get adjustments history list
     */
    getAdjustments: async (params?: { student_id?: string; student_fee_id?: string; page?: number; limit?: number }): Promise<any> => {
        return api.get<any>('/fees/adjustments', params);
    },

    /**
     * Get specific adjustment details
     */
    getAdjustment: async (id: string): Promise<any> => {
        return api.get<any>(`/fees/adjustments/${id}`);
    }
};
