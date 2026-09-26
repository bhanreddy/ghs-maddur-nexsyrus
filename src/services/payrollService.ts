import { api, APIError } from './apiClient';
import { PayrollEntry } from '../types/payroll';
import { AttendanceAdjustForm, buildAttendanceSaveBody, isWholeQuantity } from '../utils/payrollAttendanceAdjust';

export type PayrollActionResult = { ok: true } | { ok: false; message: string };

export type AttendancePreview = {
  replacesSystemAttendance: boolean;
  summaryVersion: number | null;
  holidayVersion: number | null;
  payrollHolidayCount: number | null;
  calendarHolidayCount: number | null;
  calculation: {
    blocked: boolean;
    validation: { severity: string; code: string; message: string }[];
    perDaySalary: string | null;
    netSalary: string | null;
    totalDeductions: string | null;
    grossContract: string | null;
    grossEarnings?: string | null;
    attendanceBonus: string | null;
    calendarDays: number | null;
    attendance: Record<string, string | number | null> | null;
    lineItems: { code?: string; name: string; kind?: string; amount?: string | null; explanation?: string | null }[];
  };
  system: {
    clUsed: string;
    nonClUnpaidDays: string;
    otherPaidLeave: string;
    fullDayAbsences: string;
    halfDayAbsences: string;
    totalLates: number;
    officialHolidays: number;
  };
};

export type AttendanceSaveResult = {
  summaryVersion: number | null;
  holidayVersion: number | null;
  recalculated: { id: string; blocked?: boolean }[];
  blocked: { id: string; validation?: string[] }[];
  skipped: { id: string; reason: string; workflowStatus?: string }[];
  payroll?: {
    netSalary?: string | null;
    totalDeductions?: string | null;
    grossContract?: string | null;
    grossEarnings?: string | null;
    perDaySalary?: string | null;
    blocked?: boolean;
    validation?: AttendancePreview['calculation']['validation'];
    attendance?: AttendancePreview['calculation']['attendance'];
    lineItems?: AttendancePreview['calculation']['lineItems'];
  };
};

export const PayrollService = {
  /**
   * Fetch payroll for a month. Teacher rows are prepared through the salary API.
   * Legacy rows stay on the legacy calculator and are only adjusted by amount.
   */
  async getPayrollForMonth(month: number, year: number): Promise<PayrollEntry[]> {
    try {
      try {
        await api.post('/payroll/teacher/prepare-period', { month, year }, { silent: true });
      } catch (err) {
        if (!(err instanceof APIError) || (err.statusCode !== 403 && err.statusCode !== 401)) {
          if (__DEV__) console.warn('[PayrollService.getPayrollForMonth] prepare', err);
        }
      }
      const period = await api.get<{ payrolls: PayrollEntry[] }>(
        '/payroll/teacher',
        { month, year },
        { silent: true },
      );
      return period?.payrolls || [];
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

  async previewAttendanceSummary(id: string, form: AttendanceAdjustForm): Promise<AttendancePreview> {
    const body = buildAttendanceSaveBody(form, { summaryVersion: null, holidayVersion: null }, false);
    const payload = isWholeQuantity(form.holidayCount)
      ? body
      : { ...body, holiday_count: undefined };
    return api.post<AttendancePreview>(
      `/payroll/teacher/${id}/attendance-summary/preview`,
      payload,
      { silent: true },
    );
  },

  async saveAttendanceSummary(
    id: string,
    form: AttendanceAdjustForm,
    versions: { summaryVersion: number | null; holidayVersion: number | null },
    confirmHoliday: boolean,
  ): Promise<AttendanceSaveResult> {
    return api.put<AttendanceSaveResult>(
      `/payroll/teacher/${id}/attendance-summary`,
      buildAttendanceSaveBody(form, versions, confirmHoliday),
      { silent: true },
    );
  },

  async revertAttendanceSummary(
    id: string,
    reason: string,
    expectedVersion: number | null,
  ): Promise<AttendanceSaveResult> {
    return api.post<AttendanceSaveResult>(
      `/payroll/teacher/${id}/attendance-summary/revert`,
      { reason, expected_version: expectedVersion },
      { silent: true },
    );
  },

  async addTeacherAdjustment(
    id: string,
    body: { kind: 'EARNING' | 'DEDUCTION'; name: string; amount: string; reason: string },
  ): Promise<PayrollActionResult> {
    try {
      await api.post(`/payroll/teacher/${id}/adjustments`, body, { silent: true });
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Failed to save adjustment.';
      return { ok: false, message };
    }
  },

  async markAsPaid(
    id: string,
    options?: { engine?: string | null; paymentReference?: string; force?: boolean },
  ): Promise<PayrollActionResult> {
    try {
      if (options?.force) {
        await api.post(`/payroll/teacher/${id}/force-pay`, {}, { silent: true });
        return { ok: true };
      }
      if (options?.engine === 'teacher-salary-v1') {
        const today = new Date().toISOString().slice(0, 10);
        await api.post(`/payroll/teacher/${id}/pay`, {
          payment_date: today,
          payment_reference: options.paymentReference,
        }, { silent: true });
        return { ok: true };
      }
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
