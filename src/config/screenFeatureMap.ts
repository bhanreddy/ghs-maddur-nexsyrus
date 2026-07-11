import type { FeatureKey } from './featureFlags';

/** Maps expo-router pathnames to the feature flag that gates them (student/parent only). */
export const SCREEN_FEATURE_MAP: Record<string, FeatureKey> = {
  '/Screen/dcgd': 'menu.dcgd',
  '/Screen/aiChat': 'menu.ai_doubt_assist',
  '/Screen/insurance': 'menu.insurance',
  '/Screen/moneyScience': 'menu.money_science',
  '/Screen/announcements': 'quick.announcements',
  '/Screen/complaints': 'quick.complaints',
  '/Screen/lifeValues': 'quick.life_values',
  '/Screen/busMap': 'quick.transport',
  '/Screen/busTracker': 'quick.transport',
  '/Screen/scienceProjects': 'quick.science_projects',
  '/Screen/profile': 'quick.profile',
  '/Screen/diary': 'topbar.diary',
  '/Screen/lms': 'topbar.lms',
  '/Screen/timetable': 'nav.time_table',
  '/Screen/fees': 'nav.fees',
  '/Screen/attendance': 'home.todays_snapshot',
};
