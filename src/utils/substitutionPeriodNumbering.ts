/**
 * Centralized period display numbering for Daily Substitutions and Reports.
 *
 * Rules:
 * 1. Only actual teaching/class periods increment the period number.
 * 2. Breaks, lunch, assembly, recess, and other non-teaching timetable slots must NOT increment it.
 * 3. Teaching periods must be numbered continuously: Period 1, Period 2, Period 3, etc.
 * 4. If non-teaching slots are included, label them by their configured name or leave their period number blank.
 * 5. Do not modify timetable slot IDs, ordering, stored data, or time ranges. This is a display/export correction.
 * 6. Uses an explicit timetable slot type or existing "is_break" flag.
 */

export interface PeriodInfo {
  id?: string;
  name?: string;
  sort_order: number;
  is_break?: boolean | null;
  slot_type?: string | null;
  start_time?: string;
  end_time?: string;
}

export interface SlotPeriodLike {
  period_number?: number;
  sort_order?: number;
  is_break?: boolean | null;
  slot_type?: string | null;
  period_name?: string | null;
  name?: string | null;
  start_time?: string;
  end_time?: string;
}

export interface DisplayPeriodResult {
  /** The 1-based continuous teaching period index (1, 2, 3...), or null for breaks */
  teachingPeriodNumber: number | null;
  /** Full label, e.g. "Period 1" or "Lunch" */
  displayLabel: string;
  /** Short label for compact tables, e.g. "P1" or "Lunch" */
  shortLabel: string;
  /** Whether this period is a break / non-teaching slot */
  isBreak: boolean;
  /** Configured period name */
  name: string;
}

/**
 * Checks if a period or slot represents a non-teaching slot.
 * Explicitly prefers `is_break` or `slot_type`.
 */
export function isNonTeachingPeriod(period: { is_break?: boolean | null; slot_type?: string | null }): boolean {
  if (period.is_break === true) return true;
  if (period.slot_type) {
    const type = String(period.slot_type).toLowerCase().trim();
    if (type === 'break' || type === 'non_teaching' || type === 'recess' || type === 'lunch') {
      return true;
    }
  }
  return false;
}

/**
 * Compiles a sorted array of periods into a lookup map of continuous display numbers.
 * Breaks are skipped and do NOT increment the teaching period counter.
 */
export function buildPeriodDisplayMap(periods: PeriodInfo[] = []): Map<number, DisplayPeriodResult> {
  const map = new Map<number, DisplayPeriodResult>();

  // Sort periods chronologically: sort_order asc, then start_time asc
  const sorted = [...periods].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return String(a.start_time || '').localeCompare(String(b.start_time || ''));
  });

  let teachingCounter = 0;

  for (const period of sorted) {
    const isBreak = isNonTeachingPeriod(period);
    const configuredName = (period.name || '').trim();

    if (isBreak) {
      map.set(period.sort_order, {
        teachingPeriodNumber: null,
        displayLabel: configuredName || 'Break',
        shortLabel: configuredName || 'Break',
        isBreak: true,
        name: configuredName,
      });
    } else {
      teachingCounter += 1;
      const label = `Period ${teachingCounter}`;
      const short = `P${teachingCounter}`;
      map.set(period.sort_order, {
        teachingPeriodNumber: teachingCounter,
        displayLabel: label,
        shortLabel: short,
        isBreak: false,
        name: configuredName || label,
      });
    }
  }

  return map;
}

/**
 * Get display period information for a slot or period.
 * If periodMap is provided, uses the centralized map.
 * Otherwise, falls back to raw slot data.
 */
export function getSlotDisplayInfo(
  slot: SlotPeriodLike,
  periodMap?: Map<number, DisplayPeriodResult>
): DisplayPeriodResult {
  const periodNumber = slot.period_number ?? slot.sort_order ?? 0;
  if (periodMap && periodMap.has(periodNumber)) {
    return periodMap.get(periodNumber)!;
  }

  // Fallback if periodMap is not available or doesn't have the period
  const isBreak = isNonTeachingPeriod(slot);
  const name = (slot.period_name || slot.name || '').trim();

  if (isBreak) {
    return {
      teachingPeriodNumber: null,
      displayLabel: name || 'Break',
      shortLabel: name || 'Break',
      isBreak: true,
      name,
    };
  }

  return {
    teachingPeriodNumber: periodNumber,
    displayLabel: `Period ${periodNumber}`,
    shortLabel: `P${periodNumber}`,
    isBreak: false,
    name: name || `Period ${periodNumber}`,
  };
}
