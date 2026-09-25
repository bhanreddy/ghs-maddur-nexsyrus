/** Normalized path (no trailing slash) → header title for accounts web shell. */
const EXACT: Record<string, string> = {
  '/accounts/dashboard': 'Dashboard',
  '/accounts/fees': 'Fee Management',
  '/accounts/fees/today-collection': "Today's Collection",
  '/accounts/fees/collect': 'Collect Fee',
  '/accounts/fees/adjust': 'Issue Waiver',
  '/accounts/fees/details': 'Fee Ledger',
  '/accounts/receipts': 'Receipts',
  '/accounts/fines': 'Fines & Adjustments',
  '/accounts/event-collections': 'Event Collections',
  '/accounts/defaulters': 'Defaulters',
  '/accounts/transport-fees': 'Transport Fees',
  '/accounts/hostel': 'Hostel Students',
  '/accounts/invoices': 'Invoices',
  '/accounts/marks': 'School Marks Export',
  '/accounts/exams': 'Exams',
  '/accounts/omr-answer-key': 'OMR Answer Keys',
  '/accounts/omr-print': 'Print OMR Sheets',
  '/accounts/certificate-generator': 'Certificates',
  '/accounts/expenses': 'Expense Tracker',
  '/accounts/payroll': 'Staff Payroll',
  '/accounts/addStaff': 'Add Staff',
  '/accounts/addStudent': 'Add Student',
  '/accounts/addAdmin': 'Add Admin',
  '/accounts/pending-enrollments': 'Pending Enrollments',
  '/accounts/manage-users': 'Users & Clients',
  '/accounts/student-login-qr': 'Student Login QR Codes',
  '/accounts/settings': 'Settings',
  '/accounts/updates': 'Updates',
};

export function normalizeAccountsPath(pathname: string): string {
  if (!pathname) return '/accounts/dashboard';
  const p = pathname.split('?')[0].replace(/\/$/, '') || '/accounts/dashboard';
  return p;
}

export function getAccountsShellTitle(pathname: string): string {
  const p = normalizeAccountsPath(pathname);
  if (EXACT[p]) return EXACT[p];
  if (p.startsWith('/accounts/fines')) return 'Fines & Adjustments';
  if (p.startsWith('/accounts/fees/')) return 'Fees';
  return 'Accounts';
}

export function isAccountsDashboardPath(pathname: string): boolean {
  return normalizeAccountsPath(pathname) === '/accounts/dashboard';
}
