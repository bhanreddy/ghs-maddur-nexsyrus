import {
  attendanceSourceLabel,
  buildAttendanceSaveBody,
  holidayOverrideNeedsConfirm,
  isHalfDayQuantity,
  isWholeQuantity,
  stepAttendanceCount,
  validateAttendanceForm,
} from './payrollAttendanceAdjust';
import { payslipAttendanceRows } from './payslipPdf';

const manualForm = {
  mode: 'MANUAL_SUMMARY' as const,
  clDays: '1.5',
  nonClDays: '0.5',
  lateCount: '4',
  holidayCount: '8',
  providerName: 'Biomax',
  reference: 'RPT-12',
  reason: 'Monthly biometric summary',
  verified: true,
};

describe('payroll attendance adjust form', () => {
  it('switches the attendance source label', () => {
    expect(attendanceSourceLabel('SYSTEM_DAILY')).toBe('SchoolIMS Attendance');
    expect(attendanceSourceLabel('MANUAL_SUMMARY')).toBe('Manual / Third-Party Summary');
  });

  it('accepts half-day leave totals and whole late and holiday counts', () => {
    expect(isHalfDayQuantity('0')).toBe(true);
    expect(isHalfDayQuantity('1')).toBe(true);
    expect(isHalfDayQuantity('0.5')).toBe(true);
    expect(isHalfDayQuantity('1.50')).toBe(true);
    expect(isHalfDayQuantity('0.25')).toBe(false);
    expect(isHalfDayQuantity('-1')).toBe(false);
    expect(isWholeQuantity('4')).toBe(true);
    expect(isWholeQuantity('4.5')).toBe(false);
  });

  it('steps leave by half days and lates by whole days', () => {
    expect(stepAttendanceCount('2', 1, 0.5)).toBe('2.5');
    expect(stepAttendanceCount('0.5', -1, 0.5)).toBe('0');
    expect(stepAttendanceCount('', -1, 1)).toBe('0');
    expect(stepAttendanceCount('3', 1, 1)).toBe('4');
  });

  it('asks for confirmation only when the shared holiday count changes', () => {
    expect(holidayOverrideNeedsConfirm(7, '7')).toBe(false);
    expect(holidayOverrideNeedsConfirm(7, '8')).toBe(true);
    expect(holidayOverrideNeedsConfirm(7, '8.5')).toBe(false);
  });

  it('requires a verified manual summary and builds a replace payload', () => {
    expect(validateAttendanceForm({ ...manualForm, verified: false }, 31)).toMatch(/verified/);
    expect(validateAttendanceForm({ ...manualForm, clDays: '0.2' }, 31)).toMatch(/0\.5/);
    expect(validateAttendanceForm({ ...manualForm, holidayCount: '40' }, 31)).toMatch(/calendar days/);
    expect(validateAttendanceForm(manualForm, 31)).toBeNull();

    const body = buildAttendanceSaveBody(manualForm, { summaryVersion: 2, holidayVersion: null }, true);
    expect(body.mode).toBe('MANUAL_SUMMARY');
    expect(body.cl_days).toBe('1.5');
    expect(body.non_cl_days).toBe('0.5');
    expect(body.late_count).toBe(4);
    expect(body.confirm_holiday_override).toBe(true);
    expect(body.expected_version).toBe(2);
    expect(body).not.toHaveProperty('salary_adjustment');
  });
});

describe('payslip attendance breakdown', () => {
  it('prints the attendance formula fields and hides audit identifiers', () => {
    const rows = payslipAttendanceRows({
      source: 'MANUAL_SUMMARY',
      sourceLabel: 'Manual / Third-Party Summary',
      calendarDays: 31,
      paidClEntitlement: '1',
      clUsed: '1.5',
      excessClDays: '0.5',
      nonClUnpaidDays: '0.5',
      totalLates: 4,
      permittedLates: 3,
      excessLates: 1,
      lateDeductionDays: '0.5',
      payrollHolidayCount: 7,
      attendanceBonusDays: '0',
      updatedBy: 'user-123',
      version: 9,
      id: 'summary-id',
      providerName: 'Biomax',
    });
    const text = rows.map((row) => `${row.label} ${row.value}`).join('\n');
    expect(text).toContain('Attendance source');
    expect(text).toContain('Manual / Third-Party Summary');
    expect(text).toContain('CL used');
    expect(text).toContain('Excess CL');
    expect(text).toContain('Non-CL unpaid leave');
    expect(text).toContain('Late-deduction days');
    expect(text).toContain('Payroll holiday count');
    expect(text).toContain('Attendance bonus');
    expect(text).not.toContain('user-123');
    expect(text).not.toContain('summary-id');
    expect(text).not.toContain('Biomax');
  });
});
