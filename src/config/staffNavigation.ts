/** Shared destinations for the staff home shortcuts and tools drawer. */
export interface StaffDestination {
  key: string;
  title: string;
  subtitle: string;
  route: string;
  icon: 'checkbox-outline' | 'book-outline' | 'calendar-outline' | 'school-outline' | 'cloud-upload-outline' | 'eye-outline' | 'id-card-outline' | 'sparkles-outline' | 'list-outline' | 'scan-outline' | 'checkmark-circle-outline' | 'key-outline' | 'document-text-outline' | 'chatbubbles-outline' | 'megaphone-outline' | 'notifications-outline' | 'images-outline' | 'sunny-outline' | 'people-outline' | 'flag-outline' | 'cash-outline' | 'time-outline' | 'leaf-outline' | 'wallet-outline' | 'person-outline';
  group: 'Teaching' | 'Communication' | 'School operations' | 'My employment';
  quick?: boolean;
}

export const STAFF_DESTINATIONS: readonly StaffDestination[] = [
  { key: 'studentAttendance', title: 'Student Attendance', subtitle: 'Mark your class', route: '/staff/manage-students', icon: 'checkbox-outline', group: 'Teaching' },
  { key: 'diary', title: 'Diary', subtitle: 'Share homework', route: '/staff/diary', icon: 'book-outline', group: 'Teaching', quick: true },
  { key: 'timetable', title: 'Timetable', subtitle: 'Your class schedule', route: '/staff/timetable', icon: 'calendar-outline', group: 'Teaching', quick: true },
  { key: 'results', title: 'Results', subtitle: 'Enter and review marks', route: '/staff/results', icon: 'school-outline', group: 'Teaching', quick: true },
  { key: 'academic', title: 'Academic Today', subtitle: 'Today’s teaching plan', route: '/staff/academic-today', icon: 'book-outline', group: 'Teaching' },
  { key: 'lms', title: 'LMS', subtitle: 'Share learning resources', route: '/staff/lms-upload', icon: 'cloud-upload-outline', group: 'Teaching', quick: true },
  { key: 'anecdotes', title: 'Observations', subtitle: 'Record student observations', route: '/staff/anecdotes', icon: 'eye-outline', group: 'Teaching', quick: true },
  { key: 'portfolio', title: 'Student Portfolio', subtitle: 'View student profiles', route: '/staff/student-portfolio', icon: 'id-card-outline', group: 'Teaching', quick: true },
  { key: 'intelligence', title: 'Student Insights', subtitle: 'Review student progress', route: '/staff/student-intelligence', icon: 'sparkles-outline', group: 'Teaching' },
  { key: 'rollNumbers', title: 'Roll Numbers', subtitle: 'Set class order', route: '/staff/roll-numbers', icon: 'list-outline', group: 'Teaching' },
  { key: 'omrScanner', title: 'OMR Scanner', subtitle: 'Scan answer sheets', route: '/staff/omr-scanner', icon: 'scan-outline', group: 'Teaching' },
  { key: 'omrReview', title: 'OMR Review', subtitle: 'Review flagged sheets', route: '/staff/omr-review', icon: 'checkmark-circle-outline', group: 'Teaching' },
  { key: 'omrKeys', title: 'OMR Answer Keys', subtitle: 'Manage answer keys', route: '/staff/omr-answer-key', icon: 'key-outline', group: 'Teaching' },
  { key: 'progressCards', title: 'Progress Cards', subtitle: 'Prepare progress cards', route: '/staff/progress-card-assistant', icon: 'document-text-outline', group: 'Teaching' },
  { key: 'messages', title: 'Messages', subtitle: 'Open conversations', route: '/staff/messages', icon: 'chatbubbles-outline', group: 'Communication', quick: true },
  { key: 'notices', title: 'Notices', subtitle: 'Read school notices', route: '/staff/notices', icon: 'megaphone-outline', group: 'Communication', quick: true },
  { key: 'updates', title: 'Updates', subtitle: 'Read important updates', route: '/staff/updates', icon: 'notifications-outline', group: 'Communication', quick: true },
  { key: 'stories', title: 'School Stories', subtitle: 'School moments', route: '/staff/school-stories', icon: 'images-outline', group: 'Communication' },
  { key: 'daily', title: 'SchoolIMS Daily', subtitle: 'Thoughts and news', route: '/Screen/schoolDaily', icon: 'sunny-outline', group: 'Communication' },
  { key: 'calendar', title: 'Academic Calendar', subtitle: 'Dates and holidays', route: '/staff/calendar', icon: 'calendar-outline', group: 'School operations' },
  { key: 'events', title: 'Events', subtitle: 'Tasks and event attendance', route: '/staff/events', icon: 'calendar-outline', group: 'School operations' },
  { key: 'admissions', title: 'Admissions', subtitle: 'Manage enquiries', route: '/staff/admissions', icon: 'people-outline', group: 'School operations' },
  { key: 'complaints', title: 'Complaints', subtitle: 'Review student issues', route: '/staff/complaints', icon: 'flag-outline', group: 'School operations' },
  { key: 'fineRequest', title: 'Fine Request', subtitle: 'Request a fine', route: '/staff/fine-request', icon: 'cash-outline', group: 'School operations' },
  { key: 'attendance', title: 'My Attendance', subtitle: 'Check-in and history', route: '/staff/attendance', icon: 'time-outline', group: 'My employment' },
  { key: 'leaves', title: 'Leave', subtitle: 'Apply and track requests', route: '/staff/leaves', icon: 'leaf-outline', group: 'My employment', quick: true },
  { key: 'payslips', title: 'Payslips', subtitle: 'Salary documents', route: '/staff/payslip', icon: 'wallet-outline', group: 'My employment' },
  { key: 'profile', title: 'My Profile', subtitle: 'Staff details', route: '/staff/profile', icon: 'person-outline', group: 'My employment' },
];

export function getStaffDestinations(payslipsEnabled: boolean) {
  return STAFF_DESTINATIONS.filter(item => item.key !== 'payslips' || payslipsEnabled);
}

export const STAFF_QUICK_ACTIONS = STAFF_DESTINATIONS.filter(item => item.quick);
