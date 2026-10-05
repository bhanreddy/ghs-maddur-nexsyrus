import React from 'react';
import StaffToolsDrawer from './StaffToolsDrawer';
import MenuOverlay from './MenuOverlay';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer');
const mockNavigate = jest.fn();
const mockPush = jest.fn();
let mockConfig = { payslipsEnabled: true, loading: false };
let mockContext: Record<string, unknown> = { isViewingAsAdmin: false };

jest.mock('expo-router', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('../hooks/useStaffPortalConfig', () => ({ useStaffPortalConfig: () => mockConfig }));
jest.mock('../hooks/useEffectiveStaffId', () => ({ useEffectiveStaffId: () => mockContext }));
jest.mock('./MenuOverlay', () => ({ __esModule: true, default: () => null }));

let tree: any;
function renderDrawer() {
  act(() => { tree = create(<StaffToolsDrawer onClose={jest.fn()} />); });
  return tree.root.findByType(MenuOverlay).props;
}

afterEach(() => { act(() => tree?.unmount()); jest.clearAllMocks(); });
beforeEach(() => {
  mockConfig = { payslipsEnabled: true, loading: false };
  mockContext = { isViewingAsAdmin: false };
});

it('keeps sidebar-only tools reachable through the staff pager', () => {
  const props = renderDrawer();
  const admission = props.menuItems.find((item: any) => item.key === 'admissions');
  props.onNavigate(admission.link);
  expect(mockNavigate).toHaveBeenCalledWith('admissions', undefined);
  expect(mockPush).not.toHaveBeenCalled();
});

it('preserves the viewed staff member and actor when opening a secondary tool', () => {
  mockContext = { isViewingAsAdmin: true, staffId: 'staff-1', viewAsName: 'Teacher', userId: 'user-1', actorUserId: 'admin-1' };
  renderDrawer().onNavigate('/staff/omr-review');
  expect(mockNavigate).toHaveBeenCalledWith('omr-review', {
    staffId: 'staff-1', viewAsName: 'Teacher', viewAsUserId: 'user-1', viewAsActorId: 'admin-1',
  });
});

it('opens destinations outside the staff pager with the router', () => {
  renderDrawer().onNavigate('/Screen/schoolDaily');
  expect(mockPush).toHaveBeenCalledWith('/Screen/schoolDaily');
  expect(mockNavigate).not.toHaveBeenCalled();
});

it.each([
  { payslipsEnabled: false, loading: false },
  { payslipsEnabled: true, loading: true },
])('hides payslips when disabled or still loading: %j', config => {
  mockConfig = config;
  expect(renderDrawer().menuItems.some((item: any) => item.key === 'payslips')).toBe(false);
});

it('shows payslips when the school enables them', () => {
  expect(renderDrawer().menuItems.some((item: any) => item.key === 'payslips')).toBe(true);
});
