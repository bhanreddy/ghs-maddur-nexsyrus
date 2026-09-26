export type AttendanceSourceMode = 'SYSTEM_DAILY' | 'MANUAL_SUMMARY';

export function attendanceSourceLabel(mode: string | null | undefined): string {
  return mode === 'MANUAL_SUMMARY' ? 'Manual / Third-Party Summary' : 'SchoolIMS Attendance';
}

export function isHalfDayQuantity(text: string): boolean {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return false;
  const fraction = trimmed.split('.')[1] || '';
  return fraction === '' || fraction === '0' || fraction === '00' || fraction === '5' || fraction === '50';
}

export function isWholeQuantity(text: string): boolean {
  return /^\d+$/.test(text.trim());
}

export function stepAttendanceCount(value: string, direction: 1 | -1, step: 0.5 | 1): string {
  const parsed = Number(value);
  const base = Number.isFinite(parsed) ? parsed : 0;
  const scale = step === 0.5 ? 2 : 1;
  const units = Math.round(base * scale) + direction;
  const next = Math.max(0, units) / scale;
  return Number.isInteger(next) ? String(next) : next.toFixed(1);
}

export function holidayOverrideNeedsConfirm(current: number | null | undefined, next: string): boolean {
  if (!isWholeQuantity(next)) return false;
  if (current == null || Number.isNaN(Number(current))) return false;
  return Number(next) !== Number(current);
}

export type AttendanceAdjustForm = {
  mode: AttendanceSourceMode;
  clDays: string;
  nonClDays: string;
  lateCount: string;
  holidayCount: string;
  providerName: string;
  reference: string;
  reason: string;
  verified: boolean;
};

export function validateAttendanceForm(form: AttendanceAdjustForm, calendarDays: number | null): string | null {
  if (!form.reason.trim()) return 'Enter a reason for this attendance adjustment.';
  if (!isWholeQuantity(form.holidayCount)) return 'Holiday count must be a whole number.';
  if (calendarDays != null && Number(form.holidayCount) > calendarDays) {
    return `Holiday count cannot exceed ${calendarDays} calendar days.`;
  }
  if (form.mode === 'SYSTEM_DAILY') return null;
  if (!form.verified) return 'Confirm that the attendance totals were verified.';
  if (!isHalfDayQuantity(form.clDays)) return 'CL days must be in 0.5 day increments.';
  if (!isHalfDayQuantity(form.nonClDays)) return 'Non-CL leave days must be in 0.5 day increments.';
  if (!isWholeQuantity(form.lateCount)) return 'Late count must be a whole number.';
  return null;
}

export function buildAttendanceSaveBody(
  form: AttendanceAdjustForm,
  versions: { summaryVersion: number | null; holidayVersion: number | null },
  confirmHoliday: boolean,
) {
  return {
    mode: form.mode,
    cl_days: form.mode === 'MANUAL_SUMMARY' ? form.clDays.trim() : '0',
    non_cl_days: form.mode === 'MANUAL_SUMMARY' ? form.nonClDays.trim() : '0',
    late_count: form.mode === 'MANUAL_SUMMARY' ? Number(form.lateCount) : 0,
    holiday_count: Number(form.holidayCount),
    provider_name: form.providerName.trim() || null,
    supporting_reference: form.reference.trim() || null,
    reason: form.reason.trim(),
    verified: form.mode === 'MANUAL_SUMMARY' ? form.verified : false,
    expected_version: versions.summaryVersion,
    expected_holiday_version: versions.holidayVersion,
    confirm_holiday_override: confirmHoliday,
    origin: 'MANUAL',
  };
}
