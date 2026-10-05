import data from './content/catalog.json';
import extended from './content/extended-catalog.json';
import categories from './content/categories.json';
import type { TourDefinition, TourPortal } from './types';
export const tourCatalog = [...data, ...extended] as TourDefinition[];
export const tourCategories: Record<string, { en: string; te: string }> = categories;
export const TOUR_ENABLED = process.env.EXPO_PUBLIC_APP_TOUR_ENABLED === 'true' || (__DEV__ && process.env.EXPO_PUBLIC_APP_TOUR_ENABLED !== 'false');
export function portalForRoute(route: string): TourPortal | null {
  if (/^\/(home|fees|results|timetable)$/.test(route) || route.startsWith('/Screen/')) return 'student';
  for (const portal of ['staff', 'admin', 'accounts', 'driver', 'gatekeeper'] as const) if (route.startsWith(`/${portal}/`)) return portal;
  return route.startsWith('/admission/dashboard') ? 'applicant' : null;
}
export const portalRoles: Record<TourPortal, string[]> = {
  student: ['student', 'students', 'parent'], staff: ['staff', 'teacher', 'principal', 'admin'], admin: ['admin'],
  accounts: ['accountant', 'accounts', 'admin', 'principal'], driver: ['driver', 'admin'], gatekeeper: ['gate_keeper', 'gatekeeper', 'admin', 'principal'], applicant: ['applicant'],
};
export function portalAllowed(portal: TourPortal, roles: readonly string[]) { return roles.some(role => portalRoles[portal].includes(role)); }

/** A complete guide contains only chapters visible in the same feature library.
 * Freeze this result on start so entitlement refreshes cannot shift a live step index. */
export function availableTourDefinitions(portal: TourPortal | null, eligible: (tour: TourDefinition) => boolean): TourDefinition[] {
  const individual = tourCatalog.filter(t => t.portal === portal && t.kind !== 'complete' && eligible(t));
  const ids = new Set(individual.map(t => t.id));
  const full = tourCatalog.find(t => t.portal === portal && t.kind === 'complete');
  const steps = full?.steps.filter(s => s.chapterId && ids.has(s.chapterId)) ?? [];
  return steps.length && full ? [...individual, { ...full, steps }] : individual;
}
const sharedRoutes = new Set(['/notifications', '/updates', '/change-password', '/verify-certificate', '/why-ads', '/Screen/schoolDaily']);
export function portalForContextRoute(route: string, roles: readonly string[], previous: TourPortal | null, active?: { portal: TourPortal; route?: string } | null): TourPortal | null {
  if (active?.route && canonicalTourRoute(active.route) === canonicalTourRoute(route) && portalAllowed(active.portal, roles)) return active.portal;
  if (sharedRoutes.has(route)) {
    if (previous && portalAllowed(previous, roles)) return previous;
    return (['student', 'admin', 'accounts', 'staff', 'driver', 'gatekeeper', 'applicant'] as const).find(p => portalAllowed(p, roles)) ?? null;
  }
  return portalForRoute(route);
}
function canonicalTourRoute(route: string) { return route.replace('/(tabs)', '').replace(/\/$/, ''); }
