/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Text } from 'react-native';
import StaffDashboard from '../../app/staff/dashboard';
import StaffHero from '../components/staff-hero/StaffHero';
import StaffAttendanceQuickCard from '../components/StaffAttendanceQuickCard';
const { create, act } = require('react-test-renderer');
const mockNavigate = jest.fn();
const mockRefetch = jest.fn();
const mockUser = { userId: 'staff-user', displayName: 'Sample Teacher', role: { name: 'Teacher' } };
let mockContext: Record<string, unknown> = { isViewingAsAdmin: false };
let mockMetrics: any = { totalStudents: 2, presentToday: 1, absentToday: 0, pendingLeaves: 0, classId: 'class-1', className: '6', sectionName: 'A', date: '2026-10-03', session: 'morning' };
let mockError: Error | null = null;
jest.mock('expo-router', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (callback: () => void) => { require('react').useEffect(callback, [callback]); },
}));
jest.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../hooks/useTheme', () => ({ useTheme: () => ({ theme: require('../theme/types').defaultLightTheme, isDark: false }) }));
jest.mock('../hooks/useEffectiveStaffId', () => ({ useEffectiveStaffId: () => mockContext }));
jest.mock('../hooks/usePersistedSWR', () => ({ usePersistedSWR: ({ cacheKey }: any) => ({ data: cacheKey.startsWith('staff-dashboard') ? mockMetrics : [], loading: false, error: cacheKey.startsWith('staff-dashboard') ? mockError : null, isRefreshing: false, refetch: mockRefetch }) }));
jest.mock('../services/attendanceService', () => ({ AttendanceService: {}, currentSession: () => 'morning', localAttendanceDate: () => '2026-10-03' }));
jest.mock('../services/commonServices', () => ({ LeaveService: {} }));
jest.mock('../services/staffService', () => ({ StaffService: { getById: jest.fn().mockResolvedValue(null) } }));
jest.mock('../services/schoolHeroSlidesService', () => ({ schoolHeroSlidesService: {} }));
jest.mock('../services/schoolStoriesService', () => ({ schoolStoriesService: {} }));
jest.mock('../features/popups/popupUnreadStore', () => ({ usePopupUnreadCount: () => 2 }));
jest.mock('../components/StaffHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/staff-hero/StaffHero', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/StaffAttendanceQuickCard', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/AcademicTodayCard', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/StaffToolsDrawer', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/ViewAsBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/calendar/UpcomingEventsWidget', () => ({ UpcomingEventsWidget: () => null }));
jest.mock('../components/content/DailySparkWidget', () => ({ DailySparkWidget: () => null }));
let tree: any;
async function renderHome() { await act(async () => { tree = create(<StaffDashboard />); }); }
function strings() {
  const content = (value: any): string => typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(content).join('') : value?.props ? content(value.props.children) : '';
  return tree.root.findAllByType(Text).map((node: any) => content(node.props.children)).join(' ');
}
function openAttendance() { tree.root.findAll((node: any) => node.props.accessibilityLabel === "Open student attendance for today's session")[0].props.onPress(); }
beforeEach(() => { jest.clearAllMocks(); mockContext = { isViewingAsAdmin: false }; mockError = null; mockMetrics = { totalStudents: 2, presentToday: 1, absentToday: 0, pendingLeaves: 0, classId: 'class-1', className: '6', sectionName: 'A', date: '2026-10-03', session: 'morning' }; });
afterEach(() => { act(() => tree?.unmount()); });

it('shows actionable class progress before secondary school content', async () => {
  await renderHome();
  expect(strings()).toContain('1 student still unmarked');
  expect(strings()).toContain('1/2 marked');
  expect(strings()).toContain('Teaching');
  expect(strings()).toContain('Communication');
  expect(strings().indexOf('Student attendance')).toBeLessThan(strings().indexOf('AROUND SCHOOL'));
  expect(tree.root.findAllByType(StaffHero)).toHaveLength(1);
  expect(tree.root.findAllByType(StaffAttendanceQuickCard)).toHaveLength(1);
  openAttendance();
  expect(mockNavigate).toHaveBeenCalledWith('manage-students', { date: '2026-10-03', session: 'morning', contextRequest: expect.any(String) });
});

it('retains view-as identity and actor alongside attendance date and session', async () => {
  mockContext = { isViewingAsAdmin: true, staffId: 'viewed-staff', viewAsName: 'Viewed Teacher', userId: 'viewed-user', actorUserId: 'admin-user' };
  await renderHome(); openAttendance();
  expect(mockNavigate).toHaveBeenCalledWith('manage-students', { date: '2026-10-03', session: 'morning', contextRequest: expect.any(String), staffId: 'viewed-staff', viewAsName: 'Viewed Teacher', viewAsUserId: 'viewed-user', viewAsActorId: 'admin-user' });
  expect(tree.root.findAllByType(StaffAttendanceQuickCard)).toHaveLength(0);
});

it('reports unavailable status without inventing empty or successful counts', async () => {
  mockMetrics = null; mockError = new Error('Offline');
  await renderHome();
  expect(strings()).toContain('Class status unavailable');
  expect(strings()).not.toContain('No class assigned');
  expect(strings()).not.toContain('All students marked');
});
