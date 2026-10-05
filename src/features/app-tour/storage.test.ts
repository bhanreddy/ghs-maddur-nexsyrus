import AsyncStorage from '@react-native-async-storage/async-storage';
import { invitationSeen, markInvited, readPreferences, readProgress, saveProgress, savePreferences, progressKey, readTourAccess, saveTourAccess, identityKey, invitationKey } from './storage';
import { tourCatalog } from './catalog';
import { isDisposableVersionCacheKey } from '../../utils/updateCachePolicy';
import type { TourIdentity } from './types';
const identity: TourIdentity = { schoolId: 1, userId: 'family-a', contextId: 'child-a', portal: 'student' };
const tour = tourCatalog.find(t => t.id === 'student.welcome')!;
beforeEach(() => AsyncStorage.clear());
test('progress is isolated by school, account, child context, portal and content version', async () => {
  await saveProgress(identity, tour, { stepId: 'start', status: 'paused', skipped: [], updatedAt: 1 });
  expect((await readProgress(identity, tour))?.stepId).toBe('start');
  for (const changed of [{ schoolId: 2 }, { userId: 'family-b' }, { contextId: 'child-b' }, { portal: 'staff' as const }]) expect(await readProgress({ ...identity, ...changed }, tour)).toBeNull();
  expect(await readProgress(identity, { ...tour, version: 2 })).toBeNull();
  expect(isDisposableVersionCacheKey(progressKey(identity, tour))).toBe(false);
});
test('invalid progress and malformed preferences recover to safe defaults', async () => {
  await AsyncStorage.setItem(progressKey(identity, tour), '{broken'); expect(await readProgress(identity, tour)).toBeNull();
  await savePreferences(identity, { locale: 'te', narration: false, rate: 999, autoAdvance: false });
  expect(await readPreferences(identity)).toEqual({ locale: 'te', narration: false, rate: 1, autoAdvance: false });
  expect((await readPreferences({ ...identity, userId: 'screen-reader' }, false)).narration).toBe(false);
});
test('welcome invitations are remembered per school, user and portal across access contexts', async () => {
  await markInvited(identity); expect(await invitationSeen(identity)).toBe(true);
  expect(await invitationSeen({ ...identity, contextId: 'another-child' })).toBe(true);
  expect(isDisposableVersionCacheKey(invitationKey(identity))).toBe(false);
  for (const changed of [{ portal: 'staff' as const }, { userId: 'another-user' }, { schoolId: 2 }]) expect(await invitationSeen({ ...identity, ...changed })).toBe(false);
});

test('feature decisions expire and stay isolated across schools and accounts', async () => {
  await saveTourAccess(identity, { fees: { allowed: false, expiresAt: Date.now() + 60000 }, expired: { allowed: true, expiresAt: 1 } });
  expect(await readTourAccess(identity)).toEqual({ fees: expect.objectContaining({ allowed: false }) });
  expect(await readTourAccess({ ...identity, schoolId: 2 })).toEqual({});
  expect(await readTourAccess({ ...identity, userId: 'another-account' })).toEqual({});
});

test('complete walkthrough checkpoints persist real visited steps and filter obsolete IDs', async () => {
  const complete = tourCatalog.find(t => t.id === 'student.complete')!;
  await saveProgress(identity, complete, { stepId: complete.steps[3].id, status: 'paused', skipped: ['obsolete'], visited: [complete.steps[0].id, 'obsolete'], updatedAt: 2 });
  const saved = await readProgress(identity, complete);
  expect(saved?.visited).toEqual([complete.steps[0].id]); expect(saved?.skipped).toEqual([]);
  expect(await readProgress(identity, { ...complete, version: complete.version + 1 })).toBeNull();
});

test('legacy invitation dismissals migrate across child contexts without affecting progress', async () => {
  await AsyncStorage.setItem(`${identityKey(identity)}:invited`, '1');
  expect(await invitationSeen({ ...identity, contextId: 'new-child' })).toBe(true);
  expect(await AsyncStorage.getItem(invitationKey(identity))).toBe('1');
  expect(await readProgress(identity, tour)).toBeNull();
});
test('unreadable storage suppresses automatic invitations', async () => {
  (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('Unavailable'));
  expect(await invitationSeen(identity)).toBe(true);
});
