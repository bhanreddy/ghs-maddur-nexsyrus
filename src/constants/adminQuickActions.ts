import type { TFunction } from 'i18next';
import type { AdminNavAction } from './adminNav.types';

/**
 * Dashboard Quick Action cards.
 *
 * Quick Action visibility is intentionally independent of the admin sidebar
 * (`adminSidebarNav.ts`). Editing this list does not add or remove a sidebar
 * entry. A new card requires an explicit entry here.
 */
export function buildAdminQuickActions(t: TFunction): AdminNavAction[] {
  return [
    { title: 'School Stories', icon: 'ellipse-outline', route: '/admin/school-stories', tier: 'OPS', gradient: ['#92400E', '#F59E0B'], category: 'Comms' },
    { title: 'Class Diary', icon: 'book-outline', route: '/admin/diary/viewer', tier: 'PRIMARY', gradient: ['#0F3A5F', '#0284C7'], category: 'Academic' },
    { title: t('admin_dashboard_v2.timetable_manager', 'Timetable'), icon: 'calendar-outline', route: '/admin/timetable', tier: 'PRIMARY', gradient: ['#312E81', '#4F46E5'], category: 'Academic' },
    { title: 'Substitutions', icon: 'swap-horizontal-outline', route: '/admin/substitutions', tier: 'PRIMARY', gradient: ['#3730A3', '#06B6D4'], category: 'Academic', permission: 'academics.manage' },
    { title: 'Attendance Risk', icon: 'warning-outline', route: '/admin/attendance-risk', tier: 'PRIMARY', gradient: ['#991B1B', '#EA580C'], category: 'Academic', permission: 'attendance.manage' },
    { title: t('admin_dashboard_v2.exams', 'Exams'), icon: 'clipboard-outline', route: '/admin/exams', tier: 'PRIMARY', gradient: ['#3730A3', '#0EA5E9'], category: 'Academic' },
    { title: t('admin_dashboard_v2.certificates', 'Certs'), icon: 'ribbon-outline', route: '/admin/certificate-generator', tier: 'PRIMARY', gradient: ['#1E40AF', '#06B6D4'], category: 'Academic' },
    { title: t('admin_dashboard_v2.progress_reports', 'Progress'), icon: 'stats-chart-outline', route: '/admin/progress-report-generator', tier: 'PRIMARY', gradient: ['#4338CA', '#A855F7'], category: 'Academic' },
    { title: 'Student Portfolio', icon: 'id-card-outline', route: '/admin/student-portfolio', tier: 'PRIMARY', gradient: ['#0F766E', '#14B8A6'], category: 'Students' },
    { title: 'Admissions Pipeline', icon: 'person-add-outline', route: '/admin/admissions', tier: 'PRIMARY', gradient: ['#1E3A8A', '#0D9488'], category: 'Students', permission: 'admissions.view' },
    { title: 'Student Login QR Codes', icon: 'qr-code-outline', route: '/admin/student-login-qr', tier: 'PRIMARY', gradient: ['#5B21B6', '#8B5CF6'], category: 'Students' },
    { title: t('admin_dashboard_v2.expense_tracker', 'Expenses'), icon: 'receipt-outline', route: '/admin/expenses', tier: 'FINANCE', gradient: ['#14532D', '#22C55E'], category: 'Finance' },
    { title: 'Fee Adjustments', icon: 'cut-outline', route: '/admin/fees/adjustments', tier: 'FINANCE', gradient: ['#365314', '#84CC16'], category: 'Finance' },
    { title: 'Fines & Penalties', icon: 'shield-checkmark-outline', route: '/accounts/fines', tier: 'FINANCE', gradient: ['#D97706', '#F59E0B'], category: 'Finance', permission: 'fees.view' },
    { title: 'Fee Approvals', icon: 'shield-checkmark-outline', route: '/admin/fee-approvals', tier: 'FINANCE', gradient: ['#92400E', '#F59E0B'], category: 'Finance' },
    { title: 'Payroll', icon: 'card-outline', route: '/admin/payroll', tier: 'FINANCE', gradient: ['#312E81', '#6366F1'], category: 'Finance' },
    { title: t('admin_dashboard_v2.view_reports', 'Reports'), icon: 'bar-chart-outline', route: '/admin/reports', tier: 'ACADEMIC', gradient: ['#581C87', '#7C3AED'], category: 'Analytics' },
    { title: 'Exam Analytics', icon: 'analytics-outline', route: '/admin/exam-analytics', tier: 'ACADEMIC', gradient: ['#3730A3', '#2563EB'], category: 'Analytics', permission: 'admin.manage' },
    { title: 'School Intelligence', icon: 'sparkles-outline', route: '/admin/school-intelligence', tier: 'PRIMARY', gradient: ['#4338CA', '#6366F1'], category: 'Analytics', permission: 'admin.manage' },
    { title: t('admin_dashboard_v2.smart_insights', 'Insights'), icon: 'bulb-outline', route: '/admin/smart-insights', tier: 'ACADEMIC', gradient: ['#4C1D95', '#2563EB'], category: 'AI' },
    { title: t('admin_dashboard_v2.notices', 'Notices'), icon: 'megaphone-outline', route: '/admin/notices', tier: 'OPS', gradient: ['#7C2D12', '#F97316'], category: 'Comms' },
    { title: 'Popup Manager', icon: 'albums-outline', route: '/admin/popup-manager', tier: 'OPS', gradient: ['#6D28D9', '#8B5CF6'], category: 'Comms', permission: 'popups.create' },
    { title: t('messages.title', 'Messages'), icon: 'chatbubbles-outline', route: '/admin/messages', tier: 'OPS', gradient: ['#4F46E5', '#6366F1'], category: 'Comms' },
    { title: 'Updates', icon: 'notifications-circle-outline', route: '/updates', tier: 'OPS', gradient: ['#1E3A8A', '#6366F1'], category: 'Comms' },
    { title: t('admin_dashboard_v2.complaints', 'Complaints'), icon: 'chatbubble-ellipses-outline', route: '/admin/complaints', tier: 'OPS', gradient: ['#991B1B', '#F59E0B'], category: 'Support' },
    { title: 'Help Desk', icon: 'headset-outline', route: '/admin/helpdesk', tier: 'OPS', gradient: ['#0D9488', '#0284C7'], category: 'Support', permission: 'support.view' },
    { title: t('admin_dashboard_v2.leaves', 'Leaves'), icon: 'document-text-outline', route: '/admin/leaves', tier: 'OPS', gradient: ['#9A3412', '#FB923C'], category: 'HR' },
    { title: 'App Adoption', icon: 'phone-portrait-outline', route: '/admin/app-adoption', tier: 'ADMIN', gradient: ['#0F766E', '#14B8A6'], category: 'Security' },
    { title: 'Visitor Management', icon: 'shield-checkmark-outline', route: '/admin/visitors', tier: 'OPS', gradient: ['#047857', '#10B981'], category: 'Security', permission: 'visitors.view' },
  ];
}
