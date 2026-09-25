import { PlanningSlotStatus } from '../../../utils/manualPlanningSlots';

export function planningColors(isDark: boolean) {
  return {
    page: isDark ? '#080C16' : '#F3F5FA',
    card: isDark ? '#111827' : '#FFFFFF',
    cardAlt: isDark ? '#172033' : '#F8FAFC',
    text: isDark ? '#F8FAFC' : '#0F172A',
    subtext: isDark ? '#CBD5E1' : '#334155',
    muted: isDark ? '#94A3B8' : '#64748B',
    border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
    indigo: '#4F46E5',
    indigoSoft: isDark ? 'rgba(79,70,229,0.20)' : '#EEF2FF',
    teal: isDark ? '#2DD4BF' : '#0F766E',
    tealSoft: isDark ? 'rgba(45,212,191,0.16)' : '#F0FDFA',
    amber: isDark ? '#FBBF24' : '#B45309',
    amberSoft: isDark ? 'rgba(245,158,11,0.16)' : '#FFFBEB',
    slate: isDark ? '#CBD5E1' : '#475569',
    slateSoft: isDark ? '#1E293B' : '#F1F5F9',
    danger: '#DC2626',
    dangerSoft: isDark ? 'rgba(220,38,38,0.16)' : '#FEF2F2',
    shadow: isDark ? '#000000' : '#64748B',
    focus: '#4F46E5',
  };
}

export type PlanningColors = ReturnType<typeof planningColors>;

export function statusVisual(status: PlanningSlotStatus, c: PlanningColors) {
  switch (status) {
    case 'scheduled':
      return {
        label: 'Scheduled',
        icon: 'calendar-outline' as const,
        color: c.slate,
        soft: c.slateSoft,
        accent: c.slate,
      };
    case 'needs_cover':
      return {
        label: 'Needs cover',
        icon: 'alert-circle-outline' as const,
        color: c.amber,
        soft: c.amberSoft,
        accent: c.amber,
      };
    case 'covered':
      return {
        label: 'Covered',
        icon: 'checkmark-circle-outline' as const,
        color: c.teal,
        soft: c.tealSoft,
        accent: c.teal,
      };
    default:
      return {
        label: 'Unavailable',
        icon: 'remove-circle-outline' as const,
        color: c.slate,
        soft: c.slateSoft,
        accent: c.border,
      };
  }
}
