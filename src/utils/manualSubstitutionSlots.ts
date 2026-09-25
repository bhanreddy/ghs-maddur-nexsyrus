import { SubstitutionSlot } from '../services/substitutionService';
import { isNonTeachingPeriod } from './substitutionPeriodNumbering';

export const MANUAL_SUBSTITUTION_REASON_MIN_LENGTH = 3;

export function hasManualSubstitutionReason(reason: string): boolean {
  return reason.trim().length >= MANUAL_SUBSTITUTION_REASON_MIN_LENGTH;
}

/** Cover created while the regular teacher is not on leave or marked absent. */
export function isManualSubstitution(slot: {
  unavailability_sources?: Array<'leave' | 'attendance' | 'manual'> | null;
}): boolean {
  const sources = slot.unavailability_sources || [];
  return sources.includes('manual')
    && !sources.includes('leave')
    && !sources.includes('attendance');
}

export function regularTeacherMetaLabel(slot: {
  substitution_id?: string | null;
  unavailability_sources?: Array<'leave' | 'attendance' | 'manual'> | null;
}): string {
  if (isManualSubstitution(slot)) return 'REGULAR TEACHER';
  if (slot.substitution_id) return 'REGULAR TEACHER (UNAVAILABLE)';
  return 'UNAVAILABLE TEACHER';
}

/**
 * Teaching slots an admin can choose for a new one-day cover.
 * Breaks, unassigned periods, and slots that already have cover are omitted.
 */
export function isEligibleManualPickerSlot(slot: SubstitutionSlot): boolean {
  if (isNonTeachingPeriod(slot)) return false;
  if (!slot.regular_teacher_id) return false;
  if (slot.substitution_id) return false;
  return true;
}

export function filterManualPickerSlots(
  slots: SubstitutionSlot[],
  query: string,
  periodLabelFor?: (slot: SubstitutionSlot) => string,
): SubstitutionSlot[] {
  const q = query.trim().toLowerCase();
  return slots.filter((slot) => {
    if (!isEligibleManualPickerSlot(slot)) return false;
    if (!q) return true;
    const periodLabel = periodLabelFor?.(slot) || '';
    const classSection = `${slot.class_name || ''}-${slot.section_name || ''}`;
    const haystack = [
      slot.class_name,
      slot.section_name,
      classSection,
      `${slot.class_name || ''} ${slot.section_name || ''}`,
      slot.subject_name,
      slot.period_name,
      periodLabel,
      slot.period_number != null ? String(slot.period_number) : '',
      slot.period_number != null ? `period ${slot.period_number}` : '',
      slot.regular_teacher_name,
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}
