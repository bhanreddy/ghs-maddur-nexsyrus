import type { AdminNavIconName } from './adminNav.types';
import { buildAdminSidebarNavActions } from './adminSidebarNav';
import type { TFunction } from 'i18next';

export type AdminSearchKind = 'page' | 'action';

export interface AdminSearchEntry {
  id: string;
  title: string;
  subtitle?: string;
  route: string;
  params?: Record<string, string>;
  icon: AdminNavIconName;
  category: string;
  /** Extra terms matched during fuzzy/substring search. */
  keywords: string[];
  kind: AdminSearchKind;
  permission?: string;
}

/** Secondary admin destinations not listed in the primary nav grid. */
const EXTRA_PAGES: Omit<AdminSearchEntry, 'kind'>[] = [
  {
    id: 'page-students',
    title: 'Students',
    subtitle: 'Browse and manage student records',
    route: '/admin/students',
    icon: 'people-outline',
    category: 'Students',
    keywords: ['pupils', 'admission', 'enrollment', 'directory', 'class list'],
  },
  {
    id: 'page-add-student',
    title: 'Add Student',
    subtitle: 'Enroll a new student',
    route: '/admin/addStudent',
    icon: 'person-add-outline',
    category: 'Students',
    keywords: ['new student', 'admission', 'enroll', 'register'],
  },
  {
    id: 'page-bulk-student',
    title: 'Bulk Student Update',
    subtitle: 'Update many students at once',
    route: '/admin/bulk-student-update',
    icon: 'create-outline',
    category: 'Students',
    keywords: ['import', 'mass update', 'batch'],
  },
  {
    id: 'page-attendance',
    title: 'Attendance',
    subtitle: 'Student attendance overview',
    route: '/admin/attendance',
    icon: 'checkmark-circle-outline',
    category: 'Academic',
    keywords: ['present', 'absent', 'daily'],
  },
  {
    id: 'page-events',
    title: 'Events',
    subtitle: 'School events calendar',
    route: '/admin/events',
    icon: 'calendar-number-outline',
    category: 'Ops',
    keywords: ['calendar', 'functions', 'activities'],
  },
  {
    id: 'page-finance',
    title: 'Finance',
    subtitle: 'Fee and finance overview',
    route: '/admin/finance',
    icon: 'cash-outline',
    category: 'Finance',
    keywords: ['money', 'collections', 'revenue'],
  },
  {
    id: 'page-fee-reminders',
    title: 'Fee Reminders',
    subtitle: 'Send fee payment reminders',
    route: '/admin/fee-reminders',
    icon: 'alarm-outline',
    category: 'Finance',
    keywords: ['dues', 'pending fees', 'notify'],
  },
  {
    id: 'page-progress-tracker',
    title: 'Progress Tracker',
    subtitle: 'Track student academic progress',
    route: '/admin/student-progress-tracker',
    icon: 'trending-up-outline',
    category: 'Academic',
    keywords: ['marks', 'performance', 'growth'],
  },
  {
    id: 'page-settings',
    title: 'Settings',
    subtitle: 'Admin account and preferences',
    route: '/admin/settings',
    icon: 'settings-outline',
    category: 'Admin',
    keywords: ['preferences', 'profile', 'account'],
  },
  {
    id: 'page-notifications',
    title: 'Notifications',
    subtitle: 'View recent alerts',
    route: '/admin/notifications',
    icon: 'notifications-outline',
    category: 'Admin',
    keywords: ['alerts', 'inbox', 'bell'],
  },
  {
    id: 'page-policy',
    title: 'Policies',
    subtitle: 'School policy documents',
    route: '/admin/policy',
    icon: 'shield-outline',
    category: 'Admin',
    keywords: ['rules', 'terms', 'documents'],
  },
  {
    id: 'page-diary-history',
    title: 'Diary History',
    subtitle: 'Past class diary entries',
    route: '/admin/diary/history',
    icon: 'time-outline',
    category: 'Academic',
    keywords: ['homework', 'classwork', 'log'],
  },
  {
    id: 'page-transport-import',
    title: 'Transport Import',
    subtitle: 'Import transport data',
    route: '/admin/transport-import',
    icon: 'cloud-upload-outline',
    category: 'Ops',
    keywords: ['bus', 'routes', 'upload'],
  },
];

/** Suggested shortcuts shown when the query is empty. */
export const ADMIN_SEARCH_SUGGESTIONS: { title: string; query: string; icon: AdminNavIconName }[] = [
  { title: 'Students', query: 'students', icon: 'people-outline' },
  { title: 'Fees', query: 'fee', icon: 'wallet-outline' },
  { title: 'Timetable', query: 'timetable', icon: 'calendar-outline' },
  { title: 'Staff', query: 'staff', icon: 'person-outline' },
  { title: 'Reports', query: 'reports', icon: 'bar-chart-outline' },
  { title: 'Transport', query: 'transport', icon: 'bus-outline' },
];

/**
 * Full searchable catalogue for the admin web command palette.
 * Built from the sidebar catalogue plus secondary screens. Sidebar-only
 * destinations stay searchable even when they are not Quick Action cards.
 */
export function buildAdminSearchIndex(t: TFunction): AdminSearchEntry[] {
  const dashboard: AdminSearchEntry = {
    id: 'page-dashboard',
    title: t('Dashboard', 'Dashboard'),
    subtitle: 'Admin home overview',
    route: '/admin/dashboard',
    icon: 'grid-outline',
    category: 'Overview',
    keywords: ['home', 'overview', 'main'],
    kind: 'page',
  };

  const fromNav: AdminSearchEntry[] = buildAdminSidebarNavActions(t).map((item) => ({
    id: `nav-${item.route}`,
    title: item.title,
    subtitle: item.category,
    route: item.route,
    icon: item.icon,
    category: item.category,
    keywords: [item.category, item.tier, item.title],
    kind: 'page' as const,
    permission: item.permission,
  }));

  const extras: AdminSearchEntry[] = EXTRA_PAGES.map((p) => ({ ...p, kind: 'page' as const }));

  // Prefer nav titles when the same route appears in both lists.
  const byRoute = new Map<string, AdminSearchEntry>();
  for (const entry of [dashboard, ...fromNav, ...extras]) {
    if (!byRoute.has(entry.route)) byRoute.set(entry.route, entry);
  }
  return Array.from(byRoute.values());
}

export function scoreAdminSearchEntry(entry: AdminSearchEntry, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const title = entry.title.toLowerCase();
  const category = entry.category.toLowerCase();
  const subtitle = (entry.subtitle ?? '').toLowerCase();
  const keywords = entry.keywords.map((k) => k.toLowerCase());

  if (title === q) return 100;
  if (title.startsWith(q)) return 90;
  if (title.includes(q)) return 75;
  if (category.startsWith(q) || category.includes(q)) return 55;
  if (subtitle.includes(q)) return 45;
  if (keywords.some((k) => k === q || k.startsWith(q))) return 40;
  if (keywords.some((k) => k.includes(q))) return 30;

  // Token match: every query word must appear somewhere.
  const tokens = q.split(/\s+/).filter(Boolean);
  const haystack = [title, category, subtitle, ...keywords].join(' ');
  if (tokens.length > 1 && tokens.every((tok) => haystack.includes(tok))) return 35;

  return 0;
}
