/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import ManageStaff from '../../app/admin/manage-staff';
import { StaffService } from '../services/staffService';
import { getStaffPortalSession, clearStaffPortalSession } from '../services/staffPortalSession';
import { alertCompat } from '../utils/crossPlatformAlert';
const { create, act } = require('react-test-renderer');
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void) => { require('react').useEffect(callback, [callback]); },
}));
jest.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { userId: 'admin-user', role: { code: 'admin' } } }) }));
jest.mock('../hooks/usePermissions', () => ({ usePermissions: () => ({ hasPermission: () => true }) }));
jest.mock('../hooks/useTheme', () => ({ useTheme: () => ({ theme: require('../theme/themes').lightTheme, isDark: false }) }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../components/AdminHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../services/staffPortalExit', () => ({ endStaffPortalAccess: jest.fn() }));
jest.mock('../services/staffService', () => ({ StaffService: {
  getAllPages: jest.fn(async () => [{ id: 'staff-1', display_name: 'Sample Teacher', status: 'Present' }]),
  getById: jest.fn(),
} }));
jest.mock('../utils/crossPlatformAlert', () => ({ alertCompat: jest.fn() }));
let tree: any;
beforeEach(() => {
  jest.clearAllMocks(); clearStaffPortalSession();
  (StaffService.getById as jest.Mock).mockResolvedValue({ user_id: 'teacher-user', account_status: 'active' });
});
afterEach(() => { act(() => tree?.unmount()); clearStaffPortalSession(); });
async function openDiary() {
  await act(async () => { tree = create(<ManageStaff />); });
  const shortcut = tree.root.findAll((node: any) => node.props.accessibilityLabel === 'Write diary for Sample Teacher' && node.props.onPress)[0];
  expect(shortcut).toBeDefined();
  await act(async () => { await shortcut.props.onPress(); });
}

it('opens the diary with the selected staff identity and the real admin actor', async () => {
  await openDiary();
  expect(getStaffPortalSession()).toEqual({ staffId: 'staff-1', viewAsName: 'Sample Teacher', userId: 'teacher-user', actorUserId: 'admin-user' });
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/staff/diary', params: { staffId: 'staff-1', viewAsName: 'Sample Teacher', viewAsUserId: 'teacher-user', viewAsActorId: 'admin-user' } });
});

it('keeps the active staff login requirement for the write shortcut', async () => {
  (StaffService.getById as jest.Mock).mockResolvedValue({ account_status: 'inactive' });
  await openDiary();
  expect(mockPush).not.toHaveBeenCalled();
  expect(getStaffPortalSession()).toEqual({});
  expect(alertCompat).toHaveBeenCalledWith('Staff Login Required', expect.any(String));
});
