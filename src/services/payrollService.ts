import { supabase } from './supabaseConfig';
import { api, APIError } from './apiClient';
import { PayrollEntry } from '../types/payroll';

export type PayrollActionResult = { ok: true } | { ok: false; message: string };

export const PayrollService = {
  /**
   * Fetch payroll for a specific month/year.
   * Uses the 'generate_monthly_payroll' RPC to ensure data exists first.
   */
  async getPayrollForMonth(month: number, year: number): Promise<PayrollEntry[]> {
    try {
      const { error: rpcError } = await supabase.rpc('generate_monthly_payroll', {
        p_month: month,
        p_year: year
      });

      if (rpcError && __DEV__) {
        console.warn('[PayrollService.getPayrollForMonth] rpc', rpcError.message);
      }

      const { data, error } = await supabase
        .from('staff_payroll')
        .select(`
          *,
          staff:staff_id (
            staff_code,
            designation:designation_id ( name ),
            person:person_id (
              first_name,
              last_name,
              photo_url,
              display_name
            )
          )
        `)
        .eq('payroll_month', month)
        .eq('payroll_year', year)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as PayrollEntry[];
    } catch (err) {
      if (__DEV__) console.warn('[PayrollService.getPayrollForMonth]', err);
      return [];
    }
  },

  async getDistributionStatus(): Promise<{ blocked: boolean; accounts_blocked: boolean }> {
    try {
      const res = await api.get<{ blocked: boolean; accounts_blocked: boolean }>(
        '/payroll/distribution-status',
        { silent: true }
      );
      return {
        blocked: Boolean((res as any)?.blocked),
        accounts_blocked: Boolean((res as any)?.accounts_blocked),
      };
    } catch {
      return { blocked: false, accounts_blocked: false };
    }
  },

    async getAdminDistributionStatus(): Promise<boolean> {
    try {
      const res = await api.get<{ blocked: boolean }>('/admin/payroll-distribution', { silent: true });
      return Boolean((res as any)?.blocked);
    } catch {
      return false;
    }
  },

  async setAdminDistributionBlocked(blocked: boolean): Promise<PayrollActionResult> {
    try {
      await api.put('/admin/payroll-distribution', { blocked }, { silent: true });
      return { ok: true };
    } catch (err: unknown) {
      const message =
        err instanceof APIError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to update payroll distribution setting.';
      return { ok: false, message };
    }
  },

  async adjustSalary(
    id: string,
    salary_adjustment: number,
    remarks?: string
  ): Promise<PayrollActionResult & { payroll?: PayrollEntry }> {
    try {
      const res = await api.put<{ payroll: PayrollEntry }>(
        `/payroll/${id}/adjust`,
        { salary_adjustment, remarks },
        { silent: true }
      );
      return { ok: true, payroll: res?.payroll };
    } catch (err: unknown) {
      const message =
        err instanceof APIError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to save salary adjustment.';
      return { ok: false, message };
    }
  },

  async markAsPaid(id: string): Promise<PayrollActionResult> {
    try {
      await api.put(`/payroll/${id}/pay`, undefined, { silent: true });
      return { ok: true };
    } catch (err: unknown) {
      const message =
        err instanceof APIError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to update payment status.';
      if (__DEV__) {
        console.warn('[PayrollService.markAsPaid]', id, message);
      }
      return { ok: false, message };
    }
  }
};
