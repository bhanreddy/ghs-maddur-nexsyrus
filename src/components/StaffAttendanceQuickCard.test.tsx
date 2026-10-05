/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import StaffAttendanceQuickCard from './StaffAttendanceQuickCard';
import { staffAttendanceV2Client } from '../services/staffAttendanceV2Client';
const { create, act } = require('react-test-renderer');
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({ useNavigation: () => ({ navigate: mockNavigate }), useFocusEffect: (callback: () => void) => { require('react').useEffect(callback, [callback]); } }));
jest.mock('../hooks/useTheme', () => ({ useTheme: () => ({ theme: require('../theme/types').defaultLightTheme, isDark: false }) }));
jest.mock('../services/staffAttendanceV2Client', () => ({ staffAttendanceV2Client: { getTodayStatus: jest.fn() } }));
let tree: any;
beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { act(() => tree?.unmount()); });
it.each([
  { status: { device_registration_status: 'approved', can_check_in: true }, action: 'check_in' },
  { status: { device_registration_status: 'approved', can_check_out: true }, action: 'check_out' },
  { status: { device_registration_status: 'pending', can_check_in: true }, action: undefined },
])('uses the staff pager and respects service eligibility: %j', async ({ status, action }) => {
  jest.mocked(staffAttendanceV2Client.getTodayStatus).mockResolvedValue(status as any);
  await act(async () => { tree = create(<StaffAttendanceQuickCard isDark={false} />); });
  const buttons = tree.root.findAll((node: any) => node.props.accessibilityLabel?.endsWith('· My Attendance'));
  act(() => buttons[0].props.onPress({ stopPropagation: jest.fn() }));
  expect(mockNavigate).toHaveBeenCalledWith('attendance', { autoAction: action });
});
