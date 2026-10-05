import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { attendanceOfflineQueue } from './attendanceOfflineQueue';
import { AttendanceService, type MarkAttendanceRequest } from './attendanceService';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true, default: { fetch: jest.fn(), addEventListener: jest.fn() },
}));
jest.mock('./attendanceService', () => ({ AttendanceService: { markAttendance: jest.fn() } }));

const payload: MarkAttendanceRequest = { class_section_id: 'class-1', date: '2026-10-03', session: 'morning', records: [{ student_id: 'student-1', status: 'present' }] };
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.mocked(NetInfo.fetch).mockResolvedValue({ isConnected: true, isInternetReachable: true } as any);
  jest.mocked(AttendanceService.markAttendance).mockResolvedValue({ count: 1 });
});

it('does not acknowledge a local save if device storage fails', async () => {
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Disk full'));
  await expect(attendanceOfflineQueue.enqueue('teacher-1', payload)).rejects.toThrow('Disk full');
  expect(await attendanceOfflineQueue.readQueue('teacher-1')).toEqual([]);
});

it('keeps queued records offline and flushes only after server confirmation', async () => {
  await attendanceOfflineQueue.enqueue('teacher-1', payload);
  jest.mocked(NetInfo.fetch).mockResolvedValueOnce({ isConnected: false } as any);
  expect(await attendanceOfflineQueue.flush('teacher-1')).toEqual({ flushed: 0, remaining: 1, rejected: 0 });
  expect(AttendanceService.markAttendance).not.toHaveBeenCalled();
  expect(await attendanceOfflineQueue.flush('teacher-1')).toEqual({ flushed: 1, remaining: 0, rejected: 0 });
});

it('retains retryable failures without calling them synced', async () => {
  await attendanceOfflineQueue.enqueue('teacher-1', payload);
  jest.mocked(AttendanceService.markAttendance).mockRejectedValueOnce({ status: 503, message: 'Unavailable' });
  expect(await attendanceOfflineQueue.flush('teacher-1')).toEqual({ flushed: 0, remaining: 1, rejected: 0 });
  expect((await attendanceOfflineQueue.readQueue('teacher-1'))[0].attempts).toBe(1);
});

it('reports a permanent rejection separately from successful syncs', async () => {
  await attendanceOfflineQueue.enqueue('teacher-1', payload);
  jest.mocked(AttendanceService.markAttendance).mockRejectedValueOnce({ status: 403, message: 'Not permitted' });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await attendanceOfflineQueue.flush('teacher-1')).toEqual({ flushed: 0, remaining: 0, rejected: 1 });
  warn.mockRestore();
});

it('does not send the same queued record twice during concurrent refreshes', async () => {
  await attendanceOfflineQueue.enqueue('teacher-1', payload);
  await Promise.all([attendanceOfflineQueue.flush('teacher-1'), attendanceOfflineQueue.flush('teacher-1')]);
  expect(AttendanceService.markAttendance).toHaveBeenCalledTimes(1);
});

it('preserves a newer offline submission made during an in-flight flush', async () => {
  await attendanceOfflineQueue.enqueue('teacher-1', payload);
  let complete!: (value: { count: number }) => void;
  let started!: () => void;
  const sending = new Promise<void>(resolve => { started = resolve; });
  jest.mocked(AttendanceService.markAttendance).mockImplementationOnce(() => {
    started();
    return new Promise(resolve => { complete = resolve; });
  });
  const flushing = attendanceOfflineQueue.flush('teacher-1');
  await sending;
  const newer = { ...payload, records: [{ student_id: 'student-1', status: 'absent' as const }] };
  const adding = attendanceOfflineQueue.enqueue('teacher-1', newer);
  complete({ count: 1 });
  await Promise.all([flushing, adding]);
  expect((await attendanceOfflineQueue.readQueue('teacher-1'))[0].payload).toEqual(newer);
});

it('never overwrites the queue when storage cannot be read', async () => {
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(attendanceOfflineQueue.enqueue('teacher-1', payload)).rejects.toThrow('Storage unavailable');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

it('preserves all existing submissions and rejects a new session when the device queue is full', async () => {
  const entries = Array.from({ length: 50 }, (_, index) => ({ id: `q-${index}`, teacherId: 'teacher-1', payload: { ...payload, class_section_id: `class-${index}` }, createdAt: index, attempts: 0 }));
  await attendanceOfflineQueue.writeQueue('teacher-1', entries);
  await expect(attendanceOfflineQueue.enqueue('teacher-1', { ...payload, class_section_id: 'new-class' })).rejects.toThrow('queue is full');
  expect(await attendanceOfflineQueue.readQueue('teacher-1')).toEqual(entries);
  // Correcting a session already in the queue still replaces it at capacity.
  await attendanceOfflineQueue.enqueue('teacher-1', { ...payload, class_section_id: 'class-0' });
  expect(await attendanceOfflineQueue.readQueue('teacher-1')).toHaveLength(50);
});
