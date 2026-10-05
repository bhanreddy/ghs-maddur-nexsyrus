import AsyncStorage from '@react-native-async-storage/async-storage';
import { SmartDiaryService } from './smartDiaryService';
import { enqueueDiary, flushDiaryQueue, readQueue } from './diaryOfflineQueue';
import { clearStaffPortalSession, setStaffPortalSession } from './staffPortalSession';

jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })) }));
jest.mock('./smartDiaryService', () => ({ SmartDiaryService: { uploadPhotos: jest.fn(), publish: jest.fn(), publishClassDiary: jest.fn(), extractClassDiary: jest.fn() } }));
beforeEach(async () => { jest.clearAllMocks(); clearStaffPortalSession(); await AsyncStorage.clear(); });
afterEach(() => clearStaffPortalSession());

it('leaves another teacher queue pending while an admin manages a staff portal', async () => {
  await enqueueDiary('teacher-a', { content: 'A', submission_id: 'a' });
  setStaffPortalSession('staff-b', 'B', 'teacher-b', 'admin');
  expect(await flushDiaryQueue('teacher-a')).toEqual({ flushed: 0, remaining: 1 });
  expect(SmartDiaryService.publish).not.toHaveBeenCalled();
  expect(await readQueue('teacher-a')).toHaveLength(1);
});

it('uses the selected staff identity through an upload even if the portal changes', async () => {
  setStaffPortalSession('staff-a', 'A', 'teacher-a', 'admin');
  await enqueueDiary('teacher-a', { content: 'A', submission_id: 'a' }, ['file://photo']);
  (SmartDiaryService.uploadPhotos as jest.Mock).mockImplementation(async () => {
    setStaffPortalSession('staff-b', 'B', 'teacher-b', 'admin');
    return { attachments: ['photo-url'] };
  });
  expect(await flushDiaryQueue('teacher-a')).toEqual({ flushed: 1, remaining: 0 });
  expect(SmartDiaryService.uploadPhotos).toHaveBeenCalledWith(['file://photo'], { _staffPortalId: 'staff-a' });
  expect(SmartDiaryService.publish).toHaveBeenCalledWith(expect.objectContaining({ content: 'A', attachments: ['photo-url'] }), { _staffPortalId: 'staff-a' });
});

it('keeps a regular staff flush in its own identity if an admin portal opens mid-upload', async () => {
  await enqueueDiary('teacher-a', { content: 'A', submission_id: 'a' }, ['file://photo']);
  (SmartDiaryService.uploadPhotos as jest.Mock).mockImplementation(async () => {
    setStaffPortalSession('staff-b', 'B', 'teacher-b', 'admin');
    return { attachments: ['photo-url'] };
  });
  await flushDiaryQueue('teacher-a');
  expect(SmartDiaryService.publish).toHaveBeenCalledWith(expect.objectContaining({ content: 'A' }), { _staffPortalId: '' });
});
