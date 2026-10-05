import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TourProvider, useAppTour } from './TourProvider';
import { registerTarget, emitTourEvent, setTourBlocked, setTourCondition } from './registry';
import { tourNarration } from './narration';
import { releaseOverlay, acquireOverlay } from '../popups/overlayLock';
const { create, act } = require('react-test-renderer');
let mockRoute = '/home';
let mockUserId = 'family-a';
let mockRole = 'student';
let mockFeatureState = { features: {} as Record<string, boolean> };
jest.mock('../../services/featuresStore', () => ({ subscribe: () => () => {}, getSnapshot: () => mockFeatureState }));
const mockPush = jest.fn();
const mockRouter = { push: mockPush };
jest.mock('expo-router', () => ({ usePathname: () => mockRoute, useRouter: () => mockRouter }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ authChecked: true, loading: false, user: { userId: mockUserId, schoolId: 1, permissions: [], roles: [mockRole] }, role: mockRole, schoolId: 1 }) }));
jest.mock('../../services/staffService', () => ({ StaffService: { getPortalConfig: jest.fn().mockResolvedValue({ payslips_enabled: true }) } }));
jest.mock('./narration', () => ({ tourNarration: { stop: jest.fn(), play: jest.fn() } }));
jest.mock('../feature-access/services/featureAccessApi', () => ({ FeatureAccessApi: { fetchFeatureAccess: jest.fn().mockResolvedValue({ allowed: true }) } }));
let latest: ReturnType<typeof useAppTour>;
function Capture() { latest = useAppTour(); return null; }
let tree: any;
const targets: (() => void)[] = [];
function target(route: string, id: string) { targets.push(registerTarget({ route, id, host: 'root', measure: async () => ({ x: 12, y: 90, width: 200, height: 70 }) })); }
beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }); mockRoute = '/home'; mockUserId = 'family-a'; mockRole = 'student'; mockFeatureState = { features: {} }; mockPush.mockClear(); await AsyncStorage.clear();
  await act(async () => { tree = create(<TourProvider><Capture /></TourProvider>); });
});
afterEach(async () => {
  await act(async () => tree.unmount()); targets.splice(0).forEach(remove => remove()); releaseOverlay('tour'); releaseOverlay('popup'); setTourCondition('driver.active-trip', false); setTourBlocked('test', false); jest.useRealTimers();
});
test('starts only after measuring the current control and cancels on account switching', async () => {
  target('/home', 'student.launcher');
  await act(async () => latest.start('student.welcome'));
  expect(latest.state.phase).toBe('presenting');
  mockUserId = 'family-b';
  await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  expect(latest.state.phase).toBe('idle'); expect(tourNarration.stop).toHaveBeenCalled();
});
test('a missing control times out with a recoverable state after eight seconds', async () => {
  await act(async () => latest.start('student.welcome'));
  await act(async () => jest.advanceTimersByTimeAsync(8200));
  expect(latest.state.phase).toBe('missing'); expect(latest.state.reason).toBe('target');
  target('/home', 'student.launcher'); await act(async () => latest.retry());
  expect(latest.state.phase).toBe('presenting');
});
test('task steps require their explicit action and ignore unrelated events', async () => {
  mockRoute = '/fees'; await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  target('/fees', 'student.fees.summary'); target('/fees', 'student.fees.history'); target('/fees', 'student.fees.content');
  await act(async () => latest.start('student.fees'));
  await act(async () => latest.next()); expect(latest.state.phase).toBe('action');
  await act(async () => emitTourEvent('unrelated')); expect(latest.state.index).toBe(1);
  await act(async () => emitTourEvent('student.fees.history')); expect(latest.state.index).toBe(2);
});
test('security interruptions stop narration, retain progress, and prevent restarting while locked', async () => {
  target('/home', 'student.launcher'); await act(async () => latest.start('student.welcome'));
  await act(async () => setTourBlocked('test', true)); expect(latest.state.phase).toBe('paused');
  await act(async () => latest.start('student.welcome')); expect(latest.state.phase).toBe('paused');
  expect(tourNarration.stop).toHaveBeenCalled();
});

test('completed guides remain completed after reopening Help and exiting', async () => {
  target('/home', 'student.launcher'); target('/home', 'student.navigation');
  await act(async () => latest.start('student.welcome'));
  await act(async () => latest.next());
  await act(async () => latest.next());
  expect(latest.state.phase).toBe('completed');
  await act(async () => latest.open());
  expect(latest.progress['student.welcome']?.status).toBe('completed');
  await act(async () => latest.exit());
  expect(latest.progress['student.welcome']?.status).toBe('completed');
});

test('first-use invitations wait behind existing popups', async () => {
  acquireOverlay('popup');
  await act(async () => jest.advanceTimersByTimeAsync(2400));
  expect(latest.invitation).toBeNull();
  await act(async () => releaseOverlay('popup'));
  await act(async () => jest.advanceTimersByTimeAsync(1600));
  expect(latest.invitation).toBe('student');
});
test('driver invitations wait until an active trip ends', async () => {
  mockRole = 'driver'; mockRoute = '/driver/dashboard'; setTourCondition('driver.active-trip', true);
  await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  await act(async () => jest.advanceTimersByTimeAsync(2500));
  expect(latest.invitation).toBeNull();
  await act(async () => setTourCondition('driver.active-trip', false));
  await act(async () => jest.advanceTimersByTimeAsync(1600));
  expect(latest.invitation).toBe('driver');
});

test('disabled school feature flags hide guides and prevent direct navigation', async () => {
  mockFeatureState = { features: { 'nav.fees': false } };
  await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  expect(latest.guides.some(guide => guide.id === 'student.fees')).toBe(false);
  await act(async () => latest.start('student.fees'));
  expect(latest.state.reason).toBe('access');
  expect(mockPush).not.toHaveBeenCalled();
});

test('complete walkthroughs freeze chapter order and save completed feature chapters immediately', async () => {
  target('/home', 'screen.home.overview'); target('/home', 'screen.home.workspace');
  await act(async () => latest.start('student.complete'));
  const count = latest.tour!.steps.length;
  mockFeatureState = { features: { 'nav.fees': false } };
  await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  expect(latest.tour!.steps.length).toBe(count);
  expect(latest.guides.find(t => t.id === 'student.complete')!.steps.length).toBeLessThan(count);
  await act(async () => latest.next()); await act(async () => latest.next()); await act(async () => latest.next());
  expect(latest.progress['student.feature-dashboard']?.status).toBe('completed');
  expect(latest.state.phase).toBe('missing'); expect(latest.state.reason).toBe('access');
  expect(mockPush).not.toHaveBeenCalled();
  expect(latest.progress['student.complete']?.status).toBe('paused');
});
test('chapter jumping cancels pending navigation and resumes the saved chapter after exit', async () => {
  target('/home', 'screen.home.overview'); target('/home', 'screen.home.workspace');
  await act(async () => latest.start('student.complete'));
  await act(async () => latest.jumpToChapter('student.feature-calendar'));
  const staleGeneration = latest.state.generation;
  await act(async () => latest.jumpToChapter('student.feature-settings'));
  expect(latest.state.generation).toBeGreaterThan(staleGeneration);
  expect(latest.step?.chapterId).toBe('student.feature-settings');
  await act(async () => jest.advanceTimersByTimeAsync(8200));
  expect(latest.step?.chapterId).toBe('student.feature-settings');
  await act(async () => latest.exit());
  expect(latest.progress['student.complete']?.status).toBe('paused');
  await act(async () => latest.start('student.complete'));
  expect(latest.step?.chapterId).toBe('student.feature-settings');
  expect(latest.progress['student.feature-insurance']).toBeNull();
});
test('an admin guide retains its identity on the shared accounts fines screen', async () => {
  mockRole = 'admin'; mockRoute = '/admin/dashboard';
  await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  await act(async () => latest.start('admin.feature-fines'));
  mockRoute = '/accounts/fines'; target(mockRoute, 'screen.accounts-fines.overview');
  await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  expect(latest.state.phase).toBe('presenting');
  expect(latest.tour?.portal).toBe('admin');
  await act(async () => latest.open()); expect(latest.hub).toBe('admin');
});
test('a teacher guide can narrate shared daily content without switching to the family portal', async () => {
  mockRole = 'teacher'; mockRoute = '/staff/dashboard';
  await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  await act(async () => latest.start('staff.feature-daily'));
  mockRoute = '/Screen/schoolDaily'; target(mockRoute, 'screen.screen-school-daily.overview');
  await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  expect(latest.state.phase).toBe('presenting');
  expect(latest.guides.every(t => t.portal === 'staff')).toBe(true);
});
test('manual next cannot bypass a required safe action', async () => {
  mockRoute = '/fees'; await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  target('/fees', 'student.fees.summary'); target('/fees', 'student.fees.history');
  await act(async () => latest.start('student.fees')); await act(async () => latest.next());
  const index = latest.state.index;
  await act(async () => latest.next()); expect(latest.state.index).toBe(index);
});

test('staff payslip visibility matches the existing school portal configuration', async () => {
  const { StaffService } = require('../../services/staffService');
  StaffService.getPortalConfig.mockResolvedValueOnce({ payslips_enabled: false });
  mockRole = 'teacher'; mockRoute = '/staff/dashboard';
  await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  expect(latest.guides.some(t => t.id === 'staff.feature-payslips')).toBe(false);
  expect(latest.guides.find(t => t.id === 'staff.complete')?.steps.some(s => s.chapterId === 'staff.feature-payslips')).toBe(false);
  await act(async () => latest.start('staff.feature-payslips'));
  expect(latest.state.reason).toBe('access'); expect(mockPush).not.toHaveBeenCalled();
});
test('view-as staff progress and navigation remain isolated for the actual administrator', async () => {
  const { setStaffPortalSession, clearStaffPortalSession } = require('../../services/staffPortalSession');
  mockRole = 'admin'; mockRoute = '/staff/dashboard';
  await act(async () => { setStaffPortalSession('staff-one', 'First', 'teacher-one', mockUserId); tree.update(<TourProvider><Capture /></TourProvider>); });
  target('/staff/dashboard', 'staff.launcher');
  await act(async () => latest.start('staff.welcome')); await act(async () => latest.exit());
  expect(latest.progress['staff.welcome']?.status).toBe('paused');
  await act(async () => setStaffPortalSession('staff-two', 'Second', 'teacher-two', mockUserId));
  expect(latest.progress['staff.welcome']).toBeNull();
  await act(async () => latest.start('staff.feature-diary'));
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/staff/diary', params: expect.objectContaining({ staffId: 'staff-two', viewAsActorId: mockUserId }) }));
  await act(async () => clearStaffPortalSession());
});

test('late progress reads cannot replace a newer guide selection', async () => {
  let resolveRead!: (value: string | null) => void;
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = latest.start('student.welcome'); });
  target('/home', 'screen.home.overview');
  await act(async () => latest.start('student.feature-dashboard'));
  await act(async () => { resolveRead(null); await pending; });
  expect(latest.tour?.id).toBe('student.feature-dashboard');
  expect(latest.state.phase).toBe('presenting');
});
test('closing Help cancels a guide selection still reading saved progress', async () => {
  let resolveRead!: (value: string | null) => void;
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = latest.start('student.welcome'); });
  await act(async () => latest.close());
  await act(async () => { resolveRead(null); await pending; });
  expect(latest.state.phase).toBe('idle');
  expect(latest.hub).toBeNull();
});

test.each([
  ['student', '/home'], ['teacher', '/staff/dashboard'], ['admin', '/admin/dashboard'],
  ['accountant', '/accounts/dashboard'], ['driver', '/driver/dashboard'],
  ['gate_keeper', '/gatekeeper/dashboard'], ['applicant', '/admission/dashboard'],
])('dismissed invitations do not repeat for %s after returning or remounting', async (role, dashboard) => {
  mockRole = role; mockRoute = dashboard;
  await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  await act(async () => jest.advanceTimersByTimeAsync(2400));
  expect(latest.invitation).not.toBeNull();
  await act(async () => latest.dismissInvite());
  mockRoute = '/notifications'; await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  mockRoute = dashboard; await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  await act(async () => jest.advanceTimersByTimeAsync(2600));
  expect(latest.invitation).toBeNull();
  await act(async () => { tree.unmount(); });
  await act(async () => { tree = create(<TourProvider><Capture /></TourProvider>); });
  await act(async () => jest.advanceTimersByTimeAsync(2600));
  expect(latest.invitation).toBeNull();
});
test('session memory prevents repeat invitations when their storage write fails', async () => {
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('Unavailable'));
  await act(async () => jest.advanceTimersByTimeAsync(2400));
  expect(latest.invitation).toBe('student');
  await act(async () => latest.dismissInvite());
  mockRoute = '/fees'; await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  mockRoute = '/home'; await act(async () => tree.update(<TourProvider><Capture /></TourProvider>));
  await act(async () => jest.advanceTimersByTimeAsync(2600));
  expect(latest.invitation).toBeNull();
});
