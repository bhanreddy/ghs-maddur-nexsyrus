import { SubstitutionPeriod, SubstitutionSlot } from '../services/substitutionService';
import { isNonTeachingPeriod } from './substitutionPeriodNumbering';
import { isEligibleManualPickerSlot } from './manualSubstitutionSlots';

export type PlanningSlotStatus = 'scheduled' | 'needs_cover' | 'covered' | 'unavailable';

export type PlanningViewMode = 'period' | 'class';

export interface PlanningFilterState {
  query: string;
  className: string;
  sectionName: string;
  periodSortOrder: number | null;
  teacherId: string;
  subject: string;
  status: PlanningSlotStatus | 'all';
}

export interface PlanningPeriod {
  id?: string;
  sort_order: number;
  name?: string;
  start_time?: string;
  end_time?: string;
  is_break?: boolean | null;
  slot_type?: string | null;
}

export const EMPTY_PLANNING_FILTERS: PlanningFilterState = {
  query: '',
  className: '',
  sectionName: '',
  periodSortOrder: null,
  teacherId: '',
  subject: '',
  status: 'all',
};

const STATUS_LABEL: Record<PlanningSlotStatus, string> = {
  scheduled: 'scheduled',
  needs_cover: 'needs cover',
  covered: 'covered',
  unavailable: 'unavailable',
};

export function formatTimetableClock(value?: string | null): string {
  if (!value) return '';
  const [hourRaw, minute = '00'] = value.split(':');
  const hour = Number(hourRaw);
  if (Number.isNaN(hour)) return value.slice(0, 5);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute.slice(0, 2)} ${suffix}`;
}

export function formatTimeRange(start?: string | null, end?: string | null): string {
  const from = formatTimetableClock(start);
  const to = formatTimetableClock(end);
  if (from && to) return `${from} – ${to}`;
  return from || to;
}

function sortPeriods(periods: PlanningPeriod[]): PlanningPeriod[] {
  return [...periods].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return String(a.start_time || '').localeCompare(String(b.start_time || ''));
  });
}

/** Period rows used only to keep teaching numbers continuous. */
export function numberingPeriods(
  periods: Array<SubstitutionPeriod | PlanningPeriod> = [],
  slots: SubstitutionSlot[] = [],
): PlanningPeriod[] {
  const official = sortPeriods(periods);
  if (official.length > 0) return official;
  return synthesizePeriods(slots);
}

/**
 * Every configured period, plus any scheduled slot whose period is missing
 * from the period list so a class is never dropped from the planner.
 */
export function planningTimelinePeriods(
  periods: Array<SubstitutionPeriod | PlanningPeriod> = [],
  slots: SubstitutionSlot[] = [],
): PlanningPeriod[] {
  const official = sortPeriods(periods);
  const known = new Set(official.map((period) => period.sort_order));
  const extras = synthesizePeriods(slots).filter((period) => !known.has(period.sort_order));
  return sortPeriods([...official, ...extras]);
}

function synthesizePeriods(slots: SubstitutionSlot[]): PlanningPeriod[] {
  const byOrder = new Map<number, PlanningPeriod>();
  for (const slot of slots) {
    const sortOrder = slot.period_number;
    const existing = byOrder.get(sortOrder);
    if (!existing) {
      byOrder.set(sortOrder, {
        sort_order: sortOrder,
        name: slot.period_name || undefined,
        start_time: slot.start_time,
        end_time: slot.end_time,
        is_break: slot.is_break,
      });
      continue;
    }
    if (!existing.is_break && isNonTeachingPeriod(slot)) existing.is_break = true;
  }
  return sortPeriods([...byOrder.values()]);
}

export function planningSlotStatus(slot: SubstitutionSlot): PlanningSlotStatus {
  if (isNonTeachingPeriod(slot)) return 'unavailable';
  if (!slot.regular_teacher_id) return 'unavailable';
  if (slot.substitution_id) return 'covered';
  const sources = slot.unavailability_sources || [];
  if (sources.includes('leave') || sources.includes('attendance')) return 'needs_cover';
  return 'scheduled';
}

export function planningDisabledReason(slot: SubstitutionSlot): string | null {
  if (isEligibleManualPickerSlot(slot)) return null;
  if (isNonTeachingPeriod(slot)) {
    return 'Non-teaching period. Cover can only be assigned to a class with a regular teacher.';
  }
  if (!slot.regular_teacher_id) {
    return 'No regular teacher is assigned in the timetable, so a substitute cannot be selected.';
  }
  if (slot.substitution_id) {
    return 'Cover is already assigned for this date. Change or cancel it from the substitutions overview.';
  }
  return 'This period is not available for a new manual substitution.';
}

export function countActivePlanningFilters(filters: PlanningFilterState): number {
  let count = 0;
  if (filters.query.trim()) count += 1;
  if (filters.className) count += 1;
  if (filters.sectionName) count += 1;
  if (filters.periodSortOrder != null) count += 1;
  if (filters.teacherId) count += 1;
  if (filters.subject) count += 1;
  if (filters.status !== 'all') count += 1;
  return count;
}

export function planningClassOptions(slots: SubstitutionSlot[]): string[] {
  return uniqueSorted(
    slots
      .filter((slot) => !isNonTeachingPeriod(slot) && slot.class_name)
      .map((slot) => slot.class_name),
  );
}

export function planningSectionOptions(slots: SubstitutionSlot[], className: string): string[] {
  if (!className) return [];
  return uniqueSorted(
    slots
      .filter((slot) => !isNonTeachingPeriod(slot) && slot.class_name === className && slot.section_name)
      .map((slot) => slot.section_name),
  );
}

export function planningSubjectOptions(slots: SubstitutionSlot[]): string[] {
  return uniqueSorted(
    slots
      .filter((slot) => !isNonTeachingPeriod(slot) && slot.subject_name)
      .map((slot) => slot.subject_name),
  );
}

export function planningTeacherOptions(slots: SubstitutionSlot[]): { id: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const slot of slots) {
    if (!slot.regular_teacher_id || !slot.regular_teacher_name) continue;
    if (!byId.has(slot.regular_teacher_id)) byId.set(slot.regular_teacher_id, slot.regular_teacher_name);
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

export function isPlanningBreakVisible(
  period: PlanningPeriod,
  info: { isBreak: boolean; displayLabel: string; name: string },
  filters: PlanningFilterState,
): boolean {
  if (!info.isBreak) return false;
  if (filters.className || filters.sectionName || filters.teacherId || filters.subject) return false;
  if (filters.periodSortOrder != null && filters.periodSortOrder !== period.sort_order) return false;
  if (filters.status !== 'all' && filters.status !== 'unavailable') return false;
  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  const haystack = [info.displayLabel, info.name, period.name, 'break', 'non-teaching', 'unavailable']
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function filterPlanningSlots(
  slots: SubstitutionSlot[],
  filters: PlanningFilterState,
  periodTextFor?: (slot: SubstitutionSlot) => string,
): SubstitutionSlot[] {
  return slots.filter((slot) => slotMatchesPlanningFilters(slot, filters, periodTextFor?.(slot) || ''));
}

export function slotMatchesPlanningFilters(
  slot: SubstitutionSlot,
  filters: PlanningFilterState,
  periodText = '',
): boolean {
  if (isNonTeachingPeriod(slot)) return false;
  if (filters.className && slot.class_name !== filters.className) return false;
  if (filters.sectionName && slot.section_name !== filters.sectionName) return false;
  if (filters.periodSortOrder != null && slot.period_number !== filters.periodSortOrder) return false;
  if (filters.teacherId && slot.regular_teacher_id !== filters.teacherId) return false;
  if (filters.subject && slot.subject_name !== filters.subject) return false;
  const status = planningSlotStatus(slot);
  if (filters.status !== 'all' && status !== filters.status) return false;
  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  const classSection = `${slot.class_name || ''}-${slot.section_name || ''}`;
  const haystack = [
    slot.class_name,
    slot.section_name,
    classSection,
    `${slot.class_name || ''} ${slot.section_name || ''}`,
    slot.subject_name,
    slot.regular_teacher_name,
    slot.substitute_teacher_name,
    slot.room_no,
    slot.period_name,
    periodText,
    slot.period_number != null ? `period ${slot.period_number}` : '',
    STATUS_LABEL[status],
    slot.unavailability_label,
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

export interface ClassTimelineBreak<T> {
  sortOrder: number;
  period: T;
}

export function interleaveClassBreaks<T>(
  slots: SubstitutionSlot[],
  breaks: Array<ClassTimelineBreak<T>>,
): Array<{ kind: 'slot'; slot: SubstitutionSlot } | { kind: 'break'; period: T }> {
  const sorted = [...slots].sort((a, b) => a.period_number - b.period_number);
  const orderedBreaks = [...breaks].sort((a, b) => a.sortOrder - b.sortOrder);
  const items: Array<{ kind: 'slot'; slot: SubstitutionSlot } | { kind: 'break'; period: T }> = [];
  let breakIndex = 0;

  const pushBreaksBefore = (periodNumber: number) => {
    while (breakIndex < orderedBreaks.length && orderedBreaks[breakIndex].sortOrder < periodNumber) {
      items.push({ kind: 'break', period: orderedBreaks[breakIndex].period });
      breakIndex += 1;
    }
  };

  for (const slot of sorted) {
    pushBreaksBefore(slot.period_number);
    items.push({ kind: 'slot', slot });
  }
  pushBreaksBefore(Number.POSITIVE_INFINITY);
  return items;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}
