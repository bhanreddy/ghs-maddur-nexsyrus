export type HallTicketClearancePreset = 'all' | 'full' | '75-plus' | '50-plus' | 'custom';

export interface HallTicketClearanceRange {
  min: number;
  max: number;
}

export const HALL_TICKET_CLEARANCE_PRESETS: {
  id: HallTicketClearancePreset;
  label: string;
  range?: HallTicketClearanceRange;
}[] = [
  { id: 'all', label: 'All', range: { min: 0, max: 100 } },
  { id: 'full', label: '100% cleared', range: { min: 100, max: 100 } },
  { id: '75-plus', label: '75%+', range: { min: 75, max: 100 } },
  { id: '50-plus', label: '50%+', range: { min: 50, max: 100 } },
  { id: 'custom', label: 'Custom' },
];

export function parseHallTicketPercent(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

export function validateHallTicketRange(minText: string, maxText: string): string | null {
  const min = parseHallTicketPercent(minText);
  const max = parseHallTicketPercent(maxText);
  if (min == null || max == null) return 'Enter percentages from 0 to 100, using at most two decimal places.';
  if (min > max) return 'Minimum clearance cannot be greater than maximum clearance.';
  return null;
}

export function presetForRange(min: number, max: number): HallTicketClearancePreset {
  return HALL_TICKET_CLEARANCE_PRESETS.find(
    (preset) => preset.range?.min === min && preset.range?.max === max,
  )?.id || 'custom';
}
