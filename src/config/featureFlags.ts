/**
 * STUDENT feature-flag keys + fail-safe defaults (client mirror of the backend
 * FEATURE_REGISTRY). Used as the baseline when /me/features can't be fetched.
 * Absent/unknown key => treated as enabled (matches backend absent=default).
 *
 * Keep keys in sync with SchoolIMS-Backend/utils/featureRegistry.js.
 */
export const FEATURE_DEFAULTS = {
  'menu.dcgd': true,
  'menu.ai_doubt_assist': true,
  'menu.insurance': true,
  'menu.money_science': true,
  'quick.announcements': true,
  'quick.complaints': true,
  'quick.life_values': true,
  'quick.transport': true,
  'quick.science_projects': true,
  'quick.profile': true,
  'topbar.diary': true,
  'topbar.lms': true,
  'home.todays_snapshot': true,
  'home.academic_advisor': true,
  'nav.time_table': true,
  'nav.fees': true,
  'nav.results': true,
  'nav.home': true,
  'comm.messenger': true,
} as const;

export type FeatureKey = keyof typeof FEATURE_DEFAULTS;
export type FeatureMap = Record<string, boolean>;
