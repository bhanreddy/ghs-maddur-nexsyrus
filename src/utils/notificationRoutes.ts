/**
 * Role-aware notification deep-link resolver.
 *
 * Inbox rows and FCM payloads store a single `action_url` / `deepLink`. Historically
 * those paths were student-portal URLs (and some never existed, e.g. `/Screen/access`).
 * Pushing them from another login lands on Expo Router's +not-found screen.
 *
 * Resolve with the signed-in role, strip query strings out of the pathname, and
 * navigate with `{ pathname, params }` so calendar/daily/popup links match real files.
 */

export type NotificationPortal =
  | 'parent'
  | 'staff'
  | 'admin'
  | 'accounts'
  | 'driver'
  | 'gatekeeper'
  | 'applicant';

export type ResolvedNotificationRoute = {
  pathname: string;
  params?: Record<string, string>;
};

const HOME: Record<NotificationPortal, string> = {
  parent: '/(tabs)/home',
  staff: '/staff/dashboard',
  admin: '/admin/dashboard',
  accounts: '/accounts/dashboard',
  driver: '/driver/dashboard',
  gatekeeper: '/gatekeeper/dashboard',
  applicant: '/admission/dashboard',
};

const LEGACY_PATHS: Record<string, string> = {
  '/student/attendance': '/Screen/attendance',
  '/student/diary': '/Screen/diary',
  '/student/results': '/(tabs)/results',
  '/student/complaints': '/Screen/complaints',
  '/student/lms': '/Screen/lms',
  '/student/timetable': '/(tabs)/timetable',
  '/student/notices': '/Screen/announcements',
  '/student/fees': '/Screen/fees',
  '/staff/payroll': '/staff/payslip',
  '/admin/support': '/admin/helpdesk',
  '/student/helpdesk': '/Screen/helpdesk',
  '/results': '/(tabs)/results',
  '/Screen/timetable': '/(tabs)/timetable',
  '/Screen/access': '/accounts/dashboard',
};

type PortalRoutes = Partial<Record<NotificationPortal, string>>;

const SCREENS = {
  attendance: {
    parent: '/Screen/attendance',
    staff: '/staff/manage-students',
    admin: '/admin/attendance',
  } satisfies PortalRoutes,
  diary: {
    parent: '/Screen/diary',
    staff: '/staff/diary',
    admin: '/admin/diary/history',
  } satisfies PortalRoutes,
  results: {
    parent: '/(tabs)/results',
    staff: '/staff/results',
    admin: '/admin/exams',
    accounts: '/accounts/exams',
  } satisfies PortalRoutes,
  complaints: {
    parent: '/Screen/complaints',
    staff: '/staff/complaints',
    admin: '/admin/complaints',
  } satisfies PortalRoutes,
  lms: {
    parent: '/Screen/lms',
    staff: '/staff/lms-upload',
  } satisfies PortalRoutes,
  timetable: {
    parent: '/(tabs)/timetable',
    staff: '/staff/timetable',
    admin: '/admin/timetable',
  } satisfies PortalRoutes,
  notices: {
    parent: '/Screen/announcements',
    staff: '/staff/notices',
    admin: '/admin/notices',
    accounts: '/accounts/updates',
    driver: '/driver/updates',
  } satisfies PortalRoutes,
  fees: {
    parent: '/Screen/fees',
    accounts: '/accounts/fees',
    admin: '/admin/finance',
  } satisfies PortalRoutes,
  feeApprovals: {
    admin: '/admin/fee-approvals',
    accounts: '/accounts/receipts',
  } satisfies PortalRoutes,
  receipts: {
    accounts: '/accounts/receipts',
    admin: '/admin/fee-approvals',
  } satisfies PortalRoutes,
  profile: {
    parent: '/Screen/profile',
    staff: '/staff/profile',
    admin: '/admin/settings',
    accounts: '/accounts/settings',
    driver: '/driver/profile',
  } satisfies PortalRoutes,
  leavesAdmin: {
    admin: '/admin/leaves',
    accounts: '/accounts/leaves',
    staff: '/staff/leaves',
  } satisfies PortalRoutes,
  leavesStaff: {
    staff: '/staff/leaves',
    admin: '/admin/leaves',
  } satisfies PortalRoutes,
  expensesAdmin: {
    admin: '/admin/expenses',
    accounts: '/accounts/expenses',
  } satisfies PortalRoutes,
  expensesAccounts: {
    accounts: '/accounts/expenses',
    admin: '/admin/expenses',
  } satisfies PortalRoutes,
  payslip: {
    staff: '/staff/payslip',
    driver: '/driver/payslip',
    admin: '/admin/payroll',
  } satisfies PortalRoutes,
  access: {
    accounts: '/accounts/dashboard',
    admin: '/admin/access-requests',
  } satisfies PortalRoutes,
  bus: {
    parent: '/Screen/busTracker',
    driver: '/driver/trip',
    admin: '/admin/live-bus-tracking',
  } satisfies PortalRoutes,
  messages: {
    parent: '/Screen/messages',
    staff: '/staff/messages',
    admin: '/admin/messages',
  } satisfies PortalRoutes,
  attendanceRisk: {
    parent: '/Screen/attendance',
    staff: '/staff/manage-students',
    admin: '/admin/attendance-risk',
  } satisfies PortalRoutes,
  substitution: {
    staff: '/staff/timetable',
    admin: '/admin/substitutions',
  } satisfies PortalRoutes,
  transportSafety: {
    admin: '/admin/live-bus-tracking',
    driver: '/driver/trip',
    parent: '/Screen/busTracker',
  } satisfies PortalRoutes,
  helpdesk: {
    parent: '/Screen/helpdesk',
    admin: '/admin/helpdesk',
    staff: '/staff/dashboard',
  } satisfies PortalRoutes,
  helpdeskAdmin: {
    admin: '/admin/helpdesk',
    parent: '/Screen/helpdesk',
  } satisfies PortalRoutes,
  updates: {
    parent: '/updates',
    staff: '/staff/updates',
    accounts: '/accounts/updates',
    driver: '/driver/updates',
    admin: '/admin/notifications',
  } satisfies PortalRoutes,
  visitorApprovals: {
    admin: '/admin/visitors/approvals',
    gatekeeper: '/gatekeeper/expected',
  } satisfies PortalRoutes,
  visitorPass: {
    parent: '/Screen/visitorPass',
  } satisfies PortalRoutes,
  visitSchool: {
    parent: '/Screen/visitSchool',
  } satisfies PortalRoutes,
  visitorLive: {
    admin: '/admin/visitors/live',
    gatekeeper: '/gatekeeper/inside',
  } satisfies PortalRoutes,
  deliveries: {
    gatekeeper: '/gatekeeper/deliveries',
    admin: '/admin/visitors',
  } satisfies PortalRoutes,
  pickup: {
    parent: '/Screen/studentPickup',
    gatekeeper: '/gatekeeper/pickup',
  } satisfies PortalRoutes,
  security: {
    admin: '/admin/visitors',
    gatekeeper: '/gatekeeper/emergency',
  } satisfies PortalRoutes,
  calendar: {
    parent: '/Screen/calendar',
    staff: '/staff/calendar',
    admin: '/admin/calendar',
    accounts: '/accounts/calendar',
    driver: '/driver/calendar',
    gatekeeper: '/gatekeeper/calendar',
  } satisfies PortalRoutes,
  events: {
    parent: '/Screen/events',
    staff: '/staff/events',
    admin: '/admin/events',
    accounts: '/accounts/event-collections',
    gatekeeper: '/gatekeeper/event-verify',
  } satisfies PortalRoutes,
  criticalIncident: {
    admin: '/admin/events',
    staff: '/staff/events',
    gatekeeper: '/gatekeeper/emergency',
  } satisfies PortalRoutes,
  admissionApplicant: {
    applicant: '/admission/dashboard',
    parent: '/admission/dashboard',
    admin: '/admin/admissions',
    staff: '/staff/admissions',
  } satisfies PortalRoutes,
  admissionAdmin: {
    admin: '/admin/admissions',
    staff: '/staff/admissions',
    applicant: '/admission/dashboard',
  } satisfies PortalRoutes,
  intelligence: {
    staff: '/staff/student-intelligence',
    admin: '/admin/school-intelligence',
  } satisfies PortalRoutes,
  anecdotes: {
    staff: '/staff/anecdotes',
    admin: '/admin/school-intelligence',
  } satisfies PortalRoutes,
  daily: {
    parent: '/Screen/schoolDaily',
    staff: '/Screen/schoolDaily',
    admin: '/admin/content',
    accounts: '/Screen/schoolDaily',
    driver: '/Screen/schoolDaily',
  } satisfies PortalRoutes,
} as const;

/** Every backend notification type → portal screen. Missing portal falls back to that login's home. */
export const NOTIFICATION_TYPE_ROUTES: Record<string, PortalRoutes> = {
  ATTENDANCE_ABSENT: SCREENS.attendance,
  ATTENDANCE_PRESENT: SCREENS.attendance,
  DIARY_UPDATED: SCREENS.diary,
  RESULT_RELEASED: SCREENS.results,
  COMPLAINT_CREATED: SCREENS.complaints,
  COMPLAINT_RESPONSE: SCREENS.complaints,
  LMS_CONTENT: SCREENS.lms,
  TIMETABLE_UPDATED: SCREENS.timetable,
  NOTICE_ADMIN_STUDENT: SCREENS.notices,
  FEE_REMINDER: SCREENS.fees,
  ARREARS_REMINDER: SCREENS.fees,
  FEE_COLLECTED: SCREENS.fees,
  FEE_PAYMENT_DELETION_REQUESTED: SCREENS.feeApprovals,
  FEE_PAYMENT_DELETION_APPROVED: SCREENS.receipts,
  FEE_PAYMENT_DELETION_REJECTED: SCREENS.receipts,
  FEE_ADJUSTED: SCREENS.fees,
  FINE_CREATED: SCREENS.fees,
  FINE_INCREASED: SCREENS.fees,
  FINE_APPROVED: SCREENS.fees,
  FINE_WARNING: SCREENS.fees,
  FINE_WAIVED: SCREENS.fees,
  FINE_CANCELLED: SCREENS.fees,
  FINE_PAID: SCREENS.fees,
  FINE_DISPUTE_UPDATED: SCREENS.fees,
  ADMISSION_DOCUMENT_REMINDER: SCREENS.profile,
  LEAVE_SUBMITTED: SCREENS.leavesAdmin,
  LEAVE_APPROVED: SCREENS.leavesStaff,
  LEAVE_REJECTED: SCREENS.leavesStaff,
  EXPENSE_CREATED: SCREENS.expensesAdmin,
  EXPENSE_APPROVED: SCREENS.expensesAccounts,
  EXPENSE_REJECTED: SCREENS.expensesAccounts,
  PAYROLL_SUCCESS: SCREENS.payslip,
  ACCESS_RESPONSE: SCREENS.access,
  BUS_STOP_REACHED: SCREENS.bus,
  BUS_TRIP_COMPLETED: SCREENS.bus,
  TRANSPORT_TRIP_STARTED: SCREENS.bus,
  TRANSPORT_BUS_APPROACHING: SCREENS.bus,
  TRANSPORT_BUS_RUNNING_LATE: SCREENS.bus,
  TRANSPORT_BUS_DEPARTED: SCREENS.bus,
  TRANSPORT_TRIP_CANCELLED: SCREENS.bus,
  STUDENT_BUS_PRESENT: SCREENS.bus,
  STUDENT_BUS_ABSENT: SCREENS.bus,
  MESSAGE_RECEIVED: SCREENS.messages,
  ATTENDANCE_RISK_WARNING: SCREENS.attendanceRisk,
  ATTENDANCE_RISK_CRITICAL: SCREENS.attendanceRisk,
  SUBSTITUTION_ASSIGNED: SCREENS.substitution,
  TRANSPORT_OVERSPEED_ALERT: SCREENS.transportSafety,
  TRANSPORT_SOS_ALERT: SCREENS.transportSafety,
  TRANSPORT_SAFEGUARDING_ANOMALY: SCREENS.transportSafety,
  SUPPORT_TICKET_CREATED: SCREENS.helpdeskAdmin,
  SUPPORT_TICKET_REPLIED: SCREENS.helpdesk,
  SUPPORT_TICKET_RESOLVED: SCREENS.helpdesk,
  POPUP_ANNOUNCEMENT: SCREENS.updates,
  VISITOR_REQUEST_PENDING: SCREENS.visitorApprovals,
  VISITOR_REQUEST_APPROVED: SCREENS.visitorPass,
  VISITOR_REQUEST_REJECTED: SCREENS.visitSchool,
  VISITOR_ARRIVED: SCREENS.visitorLive,
  VISITOR_WAITING_AT_GATE: SCREENS.visitorApprovals,
  VISITOR_OVERSTAYED: SCREENS.visitorLive,
  DELIVERY_RECEIVED: SCREENS.deliveries,
  STUDENT_RELEASED: SCREENS.pickup,
  SECURITY_ALERT: SCREENS.security,
  CALENDAR_EVENT_PUBLISHED: SCREENS.calendar,
  CALENDAR_EVENT_REMINDER: SCREENS.calendar,
  CALENDAR_EVENT_UPDATED: SCREENS.calendar,
  CALENDAR_EVENT_CANCELLED: SCREENS.calendar,
  HOLIDAY_ANNOUNCED: SCREENS.calendar,
  EVENT_PUBLISHED: SCREENS.events,
  EVENT_CONSENT_PENDING: SCREENS.events,
  EVENT_PAYMENT_PENDING: SCREENS.events,
  CRITICAL_INCIDENT: SCREENS.criticalIncident,
  ADMISSION_APPLICATION_SUBMITTED: SCREENS.admissionApplicant,
  ADMISSION_DOC_VERIFIED: SCREENS.admissionApplicant,
  ADMISSION_DOC_REJECTED: SCREENS.admissionApplicant,
  ADMISSION_INTERVIEW_SCHEDULED: SCREENS.admissionApplicant,
  ADMISSION_APPROVED: SCREENS.admissionApplicant,
  ADMISSION_CONFIRMED: SCREENS.admissionApplicant,
  ADMISSION_SLA_BREACH: SCREENS.admissionAdmin,
  ADMISSION_REMINDER: SCREENS.admissionApplicant,
  ADMISSION_WAITLISTED: SCREENS.admissionApplicant,
  ADMISSION_REJECTED: SCREENS.admissionApplicant,
  INTELLIGENCE_PATTERN_DETECTED: SCREENS.intelligence,
  ANECDOTE_FOLLOWUP_DUE: SCREENS.anecdotes,
  INTERVENTION_REVIEW_DUE: SCREENS.intelligence,
  DAILY_THOUGHT: SCREENS.daily,
  DAILY_NEWS: SCREENS.daily,
};

const PATH_PORTAL_ROUTES: Record<string, PortalRoutes> = {
  '/Screen/attendance': SCREENS.attendance,
  '/Screen/diary': SCREENS.diary,
  '/(tabs)/results': SCREENS.results,
  '/Screen/complaints': SCREENS.complaints,
  '/Screen/lms': SCREENS.lms,
  '/(tabs)/timetable': SCREENS.timetable,
  '/Screen/announcements': SCREENS.notices,
  '/Screen/fees': SCREENS.fees,
  '/admin/fee-approvals': SCREENS.feeApprovals,
  '/accounts/receipts': SCREENS.receipts,
  '/Screen/profile': SCREENS.profile,
  '/Screen/access': SCREENS.access,
  '/admin/leaves': SCREENS.leavesAdmin,
  '/accounts/leaves': SCREENS.leavesAdmin,
  '/staff/leaves': SCREENS.leavesStaff,
  '/admin/expenses': SCREENS.expensesAdmin,
  '/accounts/expenses': SCREENS.expensesAccounts,
  '/staff/payslip': SCREENS.payslip,
  '/driver/payslip': SCREENS.payslip,
  '/admin/access-requests': SCREENS.access,
  '/Screen/busTracker': SCREENS.bus,
  '/Screen/messages': SCREENS.messages,
  '/staff/messages': SCREENS.messages,
  '/admin/messages': SCREENS.messages,
  '/admin/attendance-risk': SCREENS.attendanceRisk,
  '/staff/timetable': SCREENS.timetable,
  '/admin/substitutions': SCREENS.substitution,
  '/admin/transport': SCREENS.transportSafety,
  '/admin/live-bus-tracking': SCREENS.transportSafety,
  '/Screen/helpdesk': SCREENS.helpdesk,
  '/admin/helpdesk': SCREENS.helpdeskAdmin,
  '/updates': SCREENS.updates,
  '/staff/updates': SCREENS.updates,
  '/accounts/updates': SCREENS.updates,
  '/driver/updates': SCREENS.updates,
  '/admin/visitors/approvals': SCREENS.visitorApprovals,
  '/Screen/visitorPass': SCREENS.visitorPass,
  '/Screen/visitSchool': SCREENS.visitSchool,
  '/admin/visitors/live': SCREENS.visitorLive,
  '/gatekeeper/deliveries': SCREENS.deliveries,
  '/Screen/studentPickup': SCREENS.pickup,
  '/admin/visitors': SCREENS.security,
  '/Screen/calendar': SCREENS.calendar,
  '/staff/calendar': SCREENS.calendar,
  '/admin/calendar': SCREENS.calendar,
  '/accounts/calendar': SCREENS.calendar,
  '/driver/calendar': SCREENS.calendar,
  '/gatekeeper/calendar': SCREENS.calendar,
  '/Screen/events': SCREENS.events,
  '/staff/events': SCREENS.events,
  '/admin/events': SCREENS.events,
  '/Screen/schoolDaily': SCREENS.daily,
  '/admin/content': SCREENS.daily,
  '/admission/dashboard': SCREENS.admissionApplicant,
  '/admin/admissions': SCREENS.admissionAdmin,
  '/staff/admissions': SCREENS.admissionAdmin,
  '/staff/student-intelligence': SCREENS.intelligence,
  '/staff/anecdotes': SCREENS.anecdotes,
  '/Screen/eventDetails': SCREENS.events,
};

const PARAM_FAMILY_LEAVES = new Set([
  'calendar',
  'events',
  'eventDetails',
  'schoolDaily',
  'updates',
  'helpdesk',
  'messages',
  'visitorPass',
  'visitSchool',
]);

export const ALL_NOTIFICATION_TYPES = Object.keys(NOTIFICATION_TYPE_ROUTES);

export const ALL_NOTIFICATION_PORTALS: NotificationPortal[] = [
  'parent',
  'staff',
  'admin',
  'accounts',
  'driver',
  'gatekeeper',
  'applicant',
];

export function notificationPortalForRole(role: string | null | undefined): NotificationPortal {
  const code = String(role || '').toLowerCase();
  if (code === 'admin' || code === 'principal') return 'admin';
  if (code === 'staff' || code === 'teacher') return 'staff';
  if (code === 'accountant' || code === 'accounts') return 'accounts';
  if (code === 'driver') return 'driver';
  if (code === 'gate_keeper' || code === 'gatekeeper') return 'gatekeeper';
  if (code === 'applicant') return 'applicant';
  return 'parent';
}

export function parseNotificationHref(raw: string | null | undefined): {
  pathname: string;
  params: Record<string, string>;
} {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { pathname: '', params: {} };

  const withoutScheme = trimmed.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/+/, '');
  const withSlash = withoutScheme.startsWith('/') ? withoutScheme : `/${withoutScheme}`;
  const qIndex = withSlash.indexOf('?');
  const pathPart = qIndex >= 0 ? withSlash.slice(0, qIndex) : withSlash;
  const queryPart = qIndex >= 0 ? withSlash.slice(qIndex + 1) : '';
  const pathname = `/${pathPart.replace(/^\/+/, '').replace(/\/+$/, '')}`.replace(/^\/$/, '/');

  const params: Record<string, string> = {};
  if (queryPart) {
    for (const chunk of queryPart.split('&')) {
      if (!chunk) continue;
      const [key, ...rest] = chunk.split('=');
      if (!key) continue;
      try {
        params[decodeURIComponent(key)] = decodeURIComponent(rest.join('=') || '');
      } catch {
        params[key] = rest.join('=') || '';
      }
    }
  }
  return { pathname, params };
}

function leafName(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function pickPortalRoute(table: PortalRoutes | undefined, portal: NotificationPortal): string | null {
  if (!table) return null;
  return table[portal] || null;
}

function shouldKeepParams(fromPath: string, toPath: string): boolean {
  if (!fromPath || !toPath) return false;
  const fromLeaf = leafName(fromPath);
  const toLeaf = leafName(toPath);
  return fromLeaf === toLeaf || (PARAM_FAMILY_LEAVES.has(fromLeaf) && PARAM_FAMILY_LEAVES.has(toLeaf));
}

function belongsToPortal(pathname: string, portal: NotificationPortal): boolean {
  if (!pathname || pathname === '/') return false;
  if (pathname.startsWith('/Screen/') || pathname.startsWith('/(tabs)/') || pathname === '/updates') {
    return portal === 'parent' || pathname === '/Screen/schoolDaily';
  }
  if (pathname.startsWith('/staff/')) return portal === 'staff';
  if (pathname.startsWith('/admin/')) return portal === 'admin';
  if (pathname.startsWith('/accounts/')) return portal === 'accounts';
  if (pathname.startsWith('/driver/')) return portal === 'driver';
  if (pathname.startsWith('/gatekeeper/')) return portal === 'gatekeeper';
  if (pathname.startsWith('/admission/')) return portal === 'applicant' || portal === 'parent';
  return false;
}

export function notificationHomeForRole(role: string | null | undefined): string {
  return HOME[notificationPortalForRole(role)];
}

export function toNotificationHref(resolved: ResolvedNotificationRoute | null | undefined): string {
  if (!resolved?.pathname) return '/(tabs)/home';
  const entries = Object.entries(resolved.params || {}).filter(([, value]) => value != null && value !== '');
  if (entries.length === 0) return resolved.pathname;
  const query = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${resolved.pathname}?${query}`;
}

export function pushNotificationRoute(
  router: { push: (href: any) => void },
  resolved: ResolvedNotificationRoute | null | undefined,
): void {
  if (!resolved?.pathname) return;
  const params = resolved.params && Object.keys(resolved.params).length > 0 ? resolved.params : undefined;
  if (params) {
    router.push({ pathname: resolved.pathname, params });
    return;
  }
  router.push(resolved.pathname);
}

export function resolveNotificationRoute(
  data: Record<string, any> | null | undefined,
  role?: string | null,
): ResolvedNotificationRoute | null {
  const portal = notificationPortalForRole(role);
  const parsed = parseNotificationHref(data?.deepLink || data?.actionUrl || '');
  let pathname = parsed.pathname;
  if (pathname && LEGACY_PATHS[pathname]) pathname = LEGACY_PATHS[pathname];

  const type = String(data?.type || '').trim();
  const byType = pickPortalRoute(NOTIFICATION_TYPE_ROUTES[type], portal);
  if (byType) {
    return {
      pathname: byType,
      params: shouldKeepParams(pathname || byType, byType) ? parsed.params : undefined,
    };
  }

  const byPath = pickPortalRoute(PATH_PORTAL_ROUTES[pathname], portal);
  if (byPath) {
    return {
      pathname: byPath,
      params: shouldKeepParams(pathname, byPath) ? parsed.params : undefined,
    };
  }

  if (pathname && belongsToPortal(pathname, portal)) {
    return { pathname, params: parsed.params };
  }

  return { pathname: HOME[portal] };
}
