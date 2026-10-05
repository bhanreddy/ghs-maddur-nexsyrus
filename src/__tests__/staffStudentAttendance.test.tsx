/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { TouchableOpacity, FlatList, Text } from 'react-native';
import ManageStudents from '../../app/staff/manage-students';
import SwipeableStudentCard from '../components/SwipeableStudentCard';
import { AttendanceService } from '../services/attendanceService';
import { persistentQueryCache } from '../services/persistentQueryCache';
import { attendanceOfflineQueue } from '../services/attendanceOfflineQueue';
import { alertCompat } from '../utils/crossPlatformAlert';
const { create, act } = require('react-test-renderer');
const mockUser = { id: 'teacher-1', userId: 'teacher-1' };
let mockParams: Record<string, string> = { session: 'morning', date: '2026-10-03' };
let mockContext = { staffId: undefined as string | undefined, isViewingAsAdmin: false, viewAsName: '' };
let mockNetworkListener: (state: any) => void;
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void) => { require('react').useEffect(callback, [callback]); },
}));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: (callback: any) => { mockNetworkListener = callback; return () => {}; } } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }) }));
jest.mock('react-native-keyboard-controller', () => ({ KeyboardAwareScrollView: 'ScrollView' }));
jest.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../hooks/useTheme', () => ({ useTheme: () => ({ theme: require('../theme/types').defaultLightTheme, isDark: false }) }));
jest.mock('../hooks/useEffectiveStaffId', () => ({ useEffectiveStaffId: () => mockContext }));
jest.mock('../services/attendanceService', () => ({ AttendanceService: { getMyClass: jest.fn(), markAttendance: jest.fn(), clearDayAttendance: jest.fn() }, currentSession: () => 'morning', localAttendanceDate: () => '2026-10-03' }));
jest.mock('../services/persistentQueryCache', () => ({ persistentQueryCache: { read: jest.fn(), write: jest.fn() } }));
jest.mock('../services/attendanceOfflineQueue', () => ({ attendanceOfflineQueue: { readQueue: jest.fn(), flush: jest.fn(), enqueue: jest.fn() } }));
jest.mock('../utils/crossPlatformAlert', () => ({ alertCompat: jest.fn() }));
jest.mock('../components/StaffHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/SwipeableStudentCard', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/LogoLoader', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/ViewAsBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/AppDatePicker', () => ({ __esModule: true, default: 'DatePicker', parseYMD: (date: string) => new Date(`${date}T12:00:00`) }));
jest.mock('../components/attendance/AbsenceInsightBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('expo-haptics', () => ({ ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' }, NotificationFeedbackType: { Success: 'success', Warning: 'warning' }, impactAsync: jest.fn(), notificationAsync: jest.fn() }));

const roster = { class_section_id: 'class-1', class_name: '6', section_name: 'A', date: '2026-10-03', session: 'morning', students: [
  { student_id: 's-1', student_name: 'First Student', enrollment_id: 'e-1', roll_number: 1, morning_status: null, afternoon_status: null },
  { student_id: 's-2', student_name: 'Second Student', enrollment_id: 'e-2', roll_number: 2, morning_status: null, afternoon_status: null },
], total_students: 2 };
let tree: any;
async function renderScreen() { await act(async () => { tree = create(<ManageStudents />); }); }
function button(label: string) { return tree.root.findAllByType(TouchableOpacity).find((node: any) => node.props.accessibilityLabel === label); }
function cards() { return tree.root.findAllByType(SwipeableStudentCard); }
function text() {
  const content = (value: any): string => typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(content).join('') : value?.props ? content(value.props.children) : '';
  return tree.root.findAllByType(Text).map((node: any) => content(node.props.children)).join(' ');
}
async function markFirst() { await act(async () => { cards()[0].props.onStatusChange('s-1', 'present'); }); }
async function submitPartial() {
  await act(async () => { button('Submit 1 marked morning attendance record').props.onPress(); });
  const actions = jest.mocked(alertCompat).mock.calls.at(-1)?.[2];
  await act(async () => { actions?.find((action: any) => action.text === 'Submit Marked')?.onPress?.(); });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { session: 'morning', date: '2026-10-03' };
  mockContext = { staffId: undefined, isViewingAsAdmin: false, viewAsName: '' };
  jest.mocked(persistentQueryCache.read).mockResolvedValue(null);
  jest.mocked(persistentQueryCache.write).mockImplementation(() => undefined);
  jest.mocked(attendanceOfflineQueue.readQueue).mockResolvedValue([]);
  jest.mocked(attendanceOfflineQueue.flush).mockResolvedValue({ flushed: 0, remaining: 0, rejected: 0 });
  jest.mocked(AttendanceService.getMyClass).mockResolvedValue(roster as any);
  jest.mocked(AttendanceService.markAttendance).mockResolvedValue({ count: 1 });
  jest.mocked(attendanceOfflineQueue.enqueue).mockResolvedValue({} as any);
});
afterEach(() => { act(() => tree?.unmount()); });

it('requires a partial confirmation and submits only marked, enrolled students in the selected context', async () => {
  await renderScreen(); await markFirst(); await submitPartial();
  expect(AttendanceService.markAttendance).toHaveBeenCalledWith({ class_section_id: 'class-1', date: '2026-10-03', session: 'morning', records: [{ student_id: 's-1', status: 'present' }] });
  expect(text()).toContain('Server confirmed 1 morning record');
  expect(text()).toContain('1 student left unmarked');
});

it('reports a device queue separately from server confirmation after a network failure', async () => {
  jest.mocked(AttendanceService.markAttendance).mockRejectedValueOnce({ status: 503 });
  await renderScreen(); await markFirst(); await submitPartial();
  expect(attendanceOfflineQueue.enqueue).toHaveBeenCalled();
  expect(text()).toContain('server has not confirmed them');
  expect(text()).toContain('Waiting for sync');
});

it('keeps edits open when neither network submission nor local storage succeeds', async () => {
  jest.mocked(AttendanceService.markAttendance).mockRejectedValueOnce({ status: 503 });
  jest.mocked(attendanceOfflineQueue.enqueue).mockRejectedValueOnce(new Error('Disk full'));
  await renderScreen(); await markFirst(); await submitPartial();
  expect(text()).toContain('Could not store attendance');
  expect(cards()[0].props.student.status).toBe('present');
  expect(button('Submit 1 marked morning attendance record').props.disabled).toBe(false);
});

it('preserves local edits across refresh and session changes without applying them to another session', async () => {
  await renderScreen(); await markFirst();
  await act(async () => { tree.root.findByType(FlatList).props.onRefresh(); });
  expect(cards()[0].props.student.status).toBe('present');
  await act(async () => { button('Afternoon attendance session').props.onPress(); });
  expect(cards()[0].props.student.status).toBe('unmarked');
  await act(async () => { button('Morning attendance session').props.onPress(); });
  expect(cards()[0].props.student.status).toBe('present');
});

it('overlays the matching offline queue on cached records and retries when reconnected', async () => {
  jest.mocked(persistentQueryCache.read).mockResolvedValue({ data: roster, storedAt: Date.now() } as any);
  jest.mocked(attendanceOfflineQueue.readQueue).mockResolvedValue([{ payload: { class_section_id: 'class-1', date: '2026-10-03', session: 'morning', records: [{ student_id: 's-1', status: 'absent' }] } }] as any);
  await renderScreen();
  expect(cards()[0].props.student.status).toBe('absent');
  expect(cards()[0].props.disabled).toBe(true);
  await act(async () => { mockNetworkListener({ isConnected: false }); mockNetworkListener({ isConnected: true, isInternetReachable: true }); });
  expect(attendanceOfflineQueue.flush).toHaveBeenCalledTimes(2);
});

it('retains view-as staff context when loading class data', async () => {
  mockContext = { staffId: 'viewed-staff', isViewingAsAdmin: true, viewAsName: 'Viewed Teacher' };
  await renderScreen();
  expect(AttendanceService.getMyClass).toHaveBeenCalledWith('2026-10-03', 'viewed-staff', 'morning');
});

it('distinguishes a missing assignment from a network error', async () => {
  jest.mocked(AttendanceService.getMyClass).mockResolvedValueOnce(null);
  await renderScreen();
  expect(text()).toContain('No class assigned');
  expect(text()).not.toContain('Could not load attendance');
});


it('keeps a permission failure as an error and does not put it in the offline queue', async () => {
  jest.mocked(AttendanceService.markAttendance).mockRejectedValueOnce({ status: 403, message: 'Not permitted' });
  await renderScreen(); await markFirst(); await submitPartial();
  expect(attendanceOfflineQueue.enqueue).not.toHaveBeenCalled();
  expect(text()).toContain('Not permitted');
  expect(cards()[0].props.student.status).toBe('present');
});

it('shows an error for a failed class load instead of claiming that no class is assigned', async () => {
  jest.mocked(AttendanceService.getMyClass).mockRejectedValueOnce(new Error('Network failure'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await renderScreen();
  expect(text()).toContain('Could not load attendance');
  expect(text()).not.toContain('No class assigned');
  warn.mockRestore();
});

it('ignores a late class response after the session changes', async () => {
  let resolveOld!: (value: any) => void;
  jest.mocked(AttendanceService.getMyClass).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  await renderScreen();
  await act(async () => { button('Afternoon attendance session').props.onPress(); });
  expect(AttendanceService.getMyClass).toHaveBeenLastCalledWith('2026-10-03', undefined, 'afternoon');
  await act(async () => { resolveOld({ ...roster, class_name: 'Old class', students: [] }); });
  expect(cards()).toHaveLength(2);
  expect(text()).not.toContain('Old class');
});


it('honors a repeated Home shortcut after a manual session change', async () => {
  await renderScreen();
  await act(async () => { button('Afternoon attendance session').props.onPress(); });
  mockParams = { ...mockParams, contextRequest: 'new-home-request' };
  await act(async () => { tree.update(<ManageStudents />); });
  expect(AttendanceService.getMyClass).toHaveBeenLastCalledWith('2026-10-03', undefined, 'morning');
});

it('keeps edits when the server confirms fewer records than were submitted', async () => {
  jest.mocked(AttendanceService.markAttendance).mockResolvedValueOnce({ count: 0 });
  await renderScreen(); await markFirst(); await submitPartial();
  expect(text()).toContain('server confirmed 0 of 1 records');
  expect(text()).not.toContain('Submitted to the server');
  expect(cards()[0].props.student.status).toBe('present');
});
