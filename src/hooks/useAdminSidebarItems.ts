import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from './usePermissions';
import { buildAdminSidebarNavActions } from '../constants/adminSidebarNav';
import type { WebSidebarActionItem } from '../components/DashboardWebSidebar';

export interface AdminNavBadges {
  /** Diary entries logged today → badge on the Academics entry. */
  diaryToday?: number;
  /** Pending access requests → badge on the Access Requests entry. */
  pendingRequests?: number;
}

const ADMIN_DASHBOARD_SIDEBAR_ITEM: WebSidebarActionItem = {
  title: 'Dashboard',
  icon: 'grid-outline',
  route: '/admin/dashboard',
  gradient: ['#3B82F6', '#1D4ED8'],
  category: 'Overview',
};

/**
 * Overview metric shortcuts — mirrors the top three dashboard Overview cards
 * (Students, Staff Present, Collection) so they are one click away in the sidebar.
 */
const OVERVIEW_METRIC_ITEMS: WebSidebarActionItem[] = [
  {
    title: 'Students',
    icon: 'people-outline',
    route: '/admin/students',
    gradient: ['#3B82F6', '#1D4ED8'],
    category: 'Overview',
  },
  {
    title: 'Staff Present',
    icon: 'checkmark-circle-outline',
    route: '/admin/attendance',
    gradient: ['#10B981', '#047857'],
    category: 'Overview',
  },
  {
    title: 'Collection',
    icon: 'wallet-outline',
    route: '/admin/finance',
    gradient: ['#F59E0B', '#B45309'],
    category: 'Overview',
  },
];

/**
 * Builds the persistent web-sidebar entries for the admin portal from the
 * sidebar catalogue, filtered by RBAC and decorated with live badges. Shared
 * by the admin layout shell (see `app/admin/_layout.tsx`). Quick Actions are
 * a separate list and are not used here.
 */
export function useAdminSidebarItems(badges?: AdminNavBadges): WebSidebarActionItem[] {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();

  return useMemo<WebSidebarActionItem[]>(
    () => [
      {
        ...ADMIN_DASHBOARD_SIDEBAR_ITEM,
        title: t('Dashboard', 'Dashboard'),
      },
      ...OVERVIEW_METRIC_ITEMS.map((item) => ({
        ...item,
        title:
          item.route === '/admin/students'
            ? t('admin_dashboard_v2.total_students', 'Students')
            : item.route === '/admin/attendance'
              ? t('admin_dashboard_v2.staff_present', 'Staff Present')
              : t('admin_dashboard_v2.collection', 'Collection'),
      })),
      ...buildAdminSidebarNavActions(t)
        .filter((item) => !item.permission || hasPermission(item.permission))
        .map((item) => ({
          title: item.title,
          icon: item.icon,
          route: item.route,
          gradient: item.gradient,
          category: item.category,
          badge:
            item.route === '/admin/academics'
              ? badges?.diaryToday
              : item.route === '/admin/access-requests'
                ? badges?.pendingRequests
                : undefined,
        })),
    ],
    [t, hasPermission, badges?.diaryToday, badges?.pendingRequests],
  );
}
