import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';

export type AdminNavIconName = React.ComponentProps<typeof Ionicons>['name'];
export type AdminNavTier = 'PRIMARY' | 'FINANCE' | 'ACADEMIC' | 'OPS' | 'ADMIN';

export interface AdminNavAction {
  title: string;
  icon: AdminNavIconName;
  route: string;
  tier: AdminNavTier;
  gradient: [string, string];
  category: string;
  /** RBAC permission required to see this entry (optional). */
  permission?: string;
}

/**
 * Canonical admin navigation list — the single source of truth shared by the
 * dashboard quick-action grid and the persistent web sidebar (see
 * `useAdminSidebarItems`). Keep new admin sections here so both surfaces stay
 * in sync. Dynamic badges (diary count, access requests) are layered on by the
 * consumer, not stored here.
 */
export function buildAdminNavActions(t: TFunction): AdminNavAction[] {
  return [
    { title: 'Website Gallery', icon: 'images-outline', route: '/admin/website-gallery', tier: 'OPS', gradient: ['#0F766E', '#2563EB'], category: 'Website', permission: 'admin.manage' },
    { title: t('admin_dashboard_v2.academic_structure', 'Academics'), icon: 'school-outline', route: '/admin/academics', tier: 'PRIMARY', gradient: ['#172554', '#2563EB'], category: 'Academic' },
    { title: 'Class Diary', icon: 'book-outline', route: '/admin/diary/viewer', tier: 'PRIMARY', gradient: ['#0F3A5F', '#0284C7'], category: 'Academic' },
    { title: t('admin_dashboard_v2.timetable_manager', 'Timetable'), icon: 'calendar-outline', route: '/admin/timetable', tier: 'PRIMARY', gradient: ['#312E81', '#4F46E5'], category: 'Academic' },
    { title: 'Substitutions', icon: 'swap-horizontal-outline', route: '/admin/substitutions', tier: 'PRIMARY', gradient: ['#3730A3', '#06B6D4'], category: 'Academic', permission: 'academics.manage' },
    { title: t('admin_dashboard_v2.exams', 'Exams'), icon: 'clipboard-outline', route: '/admin/exams', tier: 'PRIMARY', gradient: ['#3730A3', '#0EA5E9'], category: 'Academic' },
    { title: 'Year Upgrade', icon: 'refresh-circle-outline', route: '/admin/academic-year-upgrade', tier: 'PRIMARY', gradient: ['#1E3A8A', '#7C3AED'], category: 'Academic' },
    { title: t('admin_dashboard_v2.certificates', 'Certs'), icon: 'ribbon-outline', route: '/admin/certificate-generator', tier: 'PRIMARY', gradient: ['#1E40AF', '#06B6D4'], category: 'Academic' },
    { title: t('admin_dashboard_v2.progress_reports', 'Progress'), icon: 'stats-chart-outline', route: '/admin/progress-report-generator', tier: 'PRIMARY', gradient: ['#4338CA', '#A855F7'], category: 'Academic' },
    { title: 'Student Portfolio', icon: 'id-card-outline', route: '/admin/student-portfolio', tier: 'PRIMARY', gradient: ['#0F766E', '#14B8A6'], category: 'Students' },
    { title: t('admin_dashboard_v2.expense_tracker', 'Expenses'), icon: 'receipt-outline', route: '/admin/expenses', tier: 'FINANCE', gradient: ['#14532D', '#22C55E'], category: 'Finance' },
    { title: 'Subscription', icon: 'card-outline', route: '/admin/subscription', tier: 'FINANCE', gradient: ['#0F766E', '#2563EB'], category: 'Finance' },
    { title: t('admin_dashboard_v2.fee_structure', 'Fee Setup'), icon: 'wallet-outline', route: '/admin/fees/set-class-fee', tier: 'FINANCE', gradient: ['#064E3B', '#14B8A6'], category: 'Finance' },
    { title: 'Fee Adjustments', icon: 'cut-outline', route: '/admin/fees/adjustments', tier: 'FINANCE', gradient: ['#365314', '#84CC16'], category: 'Finance' },
    { title: 'Fee Approvals', icon: 'shield-checkmark-outline', route: '/admin/fee-approvals', tier: 'FINANCE', gradient: ['#92400E', '#F59E0B'], category: 'Finance' },
    { title: 'UPI Settings', icon: 'qr-code-outline', route: '/admin/upi-settings', tier: 'FINANCE', gradient: ['#0F766E', '#06B6D4'], category: 'Finance' },
    { title: 'Dashboard Visibility', icon: 'eye-outline', route: '/admin/fees/visibility', tier: 'FINANCE', gradient: ['#166534', '#65A30D'], category: 'Finance' },
    { title: 'Payroll', icon: 'card-outline', route: '/admin/payroll', tier: 'FINANCE', gradient: ['#312E81', '#6366F1'], category: 'Finance' },
    { title: t('admin_dashboard_v2.view_reports', 'Reports'), icon: 'bar-chart-outline', route: '/admin/reports', tier: 'ACADEMIC', gradient: ['#581C87', '#7C3AED'], category: 'Analytics' },
    { title: 'Exam Analytics', icon: 'analytics-outline', route: '/admin/exam-analytics', tier: 'ACADEMIC', gradient: ['#3730A3', '#2563EB'], category: 'Analytics', permission: 'admin.manage' },
    { title: t('admin_dashboard_v2.smart_insights', 'Insights'), icon: 'bulb-outline', route: '/admin/smart-insights', tier: 'ACADEMIC', gradient: ['#4C1D95', '#2563EB'], category: 'AI' },
    { title: t('admin_dashboard_v2.notices', 'Notices'), icon: 'megaphone-outline', route: '/admin/notices', tier: 'OPS', gradient: ['#7C2D12', '#F97316'], category: 'Comms' },
    { title: t('messages.title', 'Messages'), icon: 'chatbubbles-outline', route: '/admin/messages', tier: 'OPS', gradient: ['#4F46E5', '#6366F1'], category: 'Comms' },
    { title: t('admin_dashboard_v2.complaints', 'Complaints'), icon: 'chatbubble-ellipses-outline', route: '/admin/complaints', tier: 'OPS', gradient: ['#991B1B', '#F59E0B'], category: 'Support' },
    { title: t('admin_dashboard_v2.transport', 'Transport'), icon: 'bus-outline', route: '/admin/transport', tier: 'OPS', gradient: ['#92400E', '#EAB308'], category: 'Ops' },
    { title: 'Hostel', icon: 'bed-outline', route: '/admin/hostel', tier: 'OPS', gradient: ['#312E81', '#6366F1'], category: 'Ops', permission: 'hostel.view' },
    { title: t('admin_dashboard_v2.leaves', 'Leaves'), icon: 'document-text-outline', route: '/admin/leaves', tier: 'OPS', gradient: ['#9A3412', '#FB923C'], category: 'HR' },
    { title: t('admin_dashboard_v2.manage_staff', 'Staff'), icon: 'people-outline', route: '/admin/manage-staff', tier: 'OPS', gradient: ['#7C3AED', '#EC4899'], category: 'HR' },
    { title: t('admin_dashboard_v2.add_staff', 'Add Staff'), icon: 'person-add-outline', route: '/admin/addStaff', tier: 'OPS', gradient: ['#6D28D9', '#8B5CF6'], category: 'HR', permission: 'staff.create' },
    { title: t('admin_dashboard_v2.add_accounts_staff', 'Accounts Portal'), icon: 'wallet-outline', route: '/admin/add-accounts-staff', tier: 'OPS', gradient: ['#BE123C', '#F97316'], category: 'HR' },
    { title: 'App Adoption', icon: 'phone-portrait-outline', route: '/admin/app-adoption', tier: 'ADMIN', gradient: ['#0F766E', '#14B8A6'], category: 'Security' },
    { title: 'Access Requests', icon: 'key-outline', route: '/admin/access-requests', tier: 'ADMIN', gradient: ['#881337', '#E11D48'], category: 'Security' },
  ];
}
