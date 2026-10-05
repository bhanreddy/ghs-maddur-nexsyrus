import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { SCHOOL_ID } from '../constants/school';
import { AttendanceService, MarkAttendanceRequest } from './attendanceService';

export interface QueuedAttendanceSubmission {
  id: string;
  teacherId: string;
  payload: MarkAttendanceRequest;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

const QUEUE_PREFIX = `@app_${SCHOOL_ID}_attendance_queue_`;

// A refresh and reconnect can flush together. Serialize mutations per teacher
// so an in-flight flush cannot erase a newly queued submission.
const queueOperations = new Map<string, Promise<unknown>>();
function serialize<T>(teacherId: string, operation: () => Promise<T>): Promise<T> {
  const next = (queueOperations.get(teacherId) || Promise.resolve()).catch(() => {}).then(operation);
  queueOperations.set(teacherId, next);
  void next.finally(() => {
    if (queueOperations.get(teacherId) === next) queueOperations.delete(teacherId);
  }).catch(() => {});
  return next;
}

export function attendanceQueueKey(teacherId: string): string {
  return `${QUEUE_PREFIX}${teacherId || 'global'}`;
}

export const attendanceOfflineQueue = {
  /**
   * Read all queued attendance submissions for a teacher
   */
  async readQueue(teacherId: string): Promise<QueuedAttendanceSubmission[]> {
    if (!teacherId) return [];
    const raw = await AsyncStorage.getItem(attendanceQueueKey(teacherId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('The attendance queue could not be read.');
    return parsed;
  },

  /**
   * Save queue to storage
   */
  async writeQueue(teacherId: string, items: QueuedAttendanceSubmission[]): Promise<void> {
    if (!teacherId) throw new Error('A staff identity is required to save attendance offline.');
    // Only a completed storage write permits the UI to say "saved on device".
    if (items.length > 50) throw new Error('Offline attendance queue is full. Sync pending records before submitting another session.');
    await AsyncStorage.setItem(attendanceQueueKey(teacherId), JSON.stringify(items));
  },

  /**
   * Enqueue an attendance submission
   */
  async enqueue(teacherId: string, payload: MarkAttendanceRequest): Promise<QueuedAttendanceSubmission> {
    return serialize(teacherId, async () => {
      const item: QueuedAttendanceSubmission = {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        teacherId,
        payload,
        createdAt: Date.now(),
        attempts: 0,
      };
      const existing = await this.readQueue(teacherId);
      // Replace any existing queued submission for the same class_section_id, date, and session
      const filtered = existing.filter(
        (q) =>
          !(
            q.payload.class_section_id === payload.class_section_id &&
            q.payload.date === payload.date &&
            q.payload.session === payload.session
          )
      );
      const next = [item, ...filtered];
      await this.writeQueue(teacherId, next);
      return item;
    });
  },

  /**
   * Flush queued submissions when back online
   */
  async flush(teacherId: string): Promise<{ flushed: number; remaining: number; rejected: number }> {
    return serialize(teacherId, async () => {
      const net = await NetInfo.fetch();
      const online = net.isConnected && net.isInternetReachable !== false;
      if (!online) {
        const items = await this.readQueue(teacherId);
        return { flushed: 0, remaining: items.length, rejected: 0 };
      }

      const items = await this.readQueue(teacherId);
      if (items.length === 0) return { flushed: 0, remaining: 0, rejected: 0 };

      let flushed = 0;
      let rejected = 0;
      const remaining: QueuedAttendanceSubmission[] = [];

      for (const item of items) {
        try {
          const result = await AttendanceService.markAttendance(item.payload);
          if (result.success === false || !Number.isFinite(result.count) || result.count !== item.payload.records.length) {
            throw new Error('The server did not confirm attendance submission.');
          }
          flushed++;
        } catch (err: any) {
          // If client error (4xx not 408/429), drop or keep with error note
          if (err?.status && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
            console.warn('[attendanceOfflineQueue] Dropping unrecoverable failed item:', err.message);
            rejected++;
          } else {
            item.attempts += 1;
            item.lastError = err?.message || 'Network error';
            remaining.push(item);
          }
        }
      }

      await this.writeQueue(teacherId, remaining);
      return { flushed, remaining: remaining.length, rejected };
    });
  },

  /**
   * Clear the queue for a teacher
   */
  async clear(teacherId: string): Promise<void> {
    return serialize(teacherId, async () => {
      if (!teacherId) return;
      try {
        await AsyncStorage.removeItem(attendanceQueueKey(teacherId));
      } catch {}
    });
  },
};

