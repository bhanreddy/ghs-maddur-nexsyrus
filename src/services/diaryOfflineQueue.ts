import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { SCHOOL_ID } from '../constants/school';
import { SmartDiaryService } from './smartDiaryService';
import { getStaffPortalSession } from './staffPortalSession';
import { newDiaryId } from '../utils/smartDiary/ids';
import { retryDelayMs, shouldAttempt } from '../utils/smartDiary/queuePolicy';

export type QueueStatus = 'saved' | 'uploading' | 'processing' | 'synced' | 'failed';

export type DiaryQueueItem = {
  id: string;
  teacherId: string;
  payload: Record<string, unknown>;
  localUris: string[];
  status: QueueStatus;
  attempts: number;
  nextRetryAt: number;
  lastError?: string;
  createdAt: number;
};

const PENDING_CLASS = `smart_diary_class_pending_${SCHOOL_ID}_`;

export function pendingClassKey(teacherId: string) {
  return `${PENDING_CLASS}${teacherId}`;
}

export async function readPendingClassDiary(teacherId: string) {
  if (!teacherId) return null;
  try {
    const raw = await AsyncStorage.getItem(pendingClassKey(teacherId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function writePendingClassDiary(teacherId: string, value: Record<string, unknown> | null) {
  if (!teacherId) return;
  if (!value) {
    await AsyncStorage.removeItem(pendingClassKey(teacherId));
    return;
  }
  await AsyncStorage.setItem(pendingClassKey(teacherId), JSON.stringify(value));
}

const PREFIX = `smart_diary_queue_${SCHOOL_ID}_`;

export function queueKey(teacherId: string) {
  return `${PREFIX}${teacherId}`;
}

export { retryDelayMs, shouldAttempt };

export async function readQueue(teacherId: string): Promise<DiaryQueueItem[]> {
  if (!teacherId) return [];
  try {
    const raw = await AsyncStorage.getItem(queueKey(teacherId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(teacherId: string, items: DiaryQueueItem[]) {
  await AsyncStorage.setItem(queueKey(teacherId), JSON.stringify(items.slice(-40)));
}

export async function enqueueDiary(teacherId: string, payload: Record<string, unknown>, localUris: string[] = []) {
  const item: DiaryQueueItem = {
    id: String(payload.submission_id || newDiaryId()),
    teacherId,
    payload: { ...payload, submission_id: payload.submission_id || undefined },
    localUris,
    status: 'saved',
    attempts: 0,
    nextRetryAt: Date.now(),
    createdAt: Date.now(),
  };
  if (!item.payload.submission_id) item.payload.submission_id = item.id;
  const existing = await readQueue(teacherId);
  const next = [item, ...existing.filter((row) => row.id !== item.id)];
  await writeQueue(teacherId, next);
  return item;
}

export async function flushDiaryQueue(teacherId: string) {
  const portal = getStaffPortalSession();
  // An old screen's reconnect listener must not send another teacher's drafts.
  if (portal.staffId && portal.userId !== teacherId) {
    return { flushed: 0, remaining: (await readQueue(teacherId)).length };
  }
  const requestOptions = { _staffPortalId: portal.staffId || '' };
  const net = await NetInfo.fetch();
  const online = net.isConnected && net.isInternetReachable !== false;
  if (!online) return { flushed: 0, remaining: (await readQueue(teacherId)).length };

  const items = await readQueue(teacherId);
  let flushed = 0;
  const next: DiaryQueueItem[] = [];

  for (const item of items) {
    if (item.status === 'synced') continue;
    if (!shouldAttempt(item)) {
      next.push(item);
      continue;
    }

    const working: DiaryQueueItem = { ...item, status: 'uploading', attempts: item.attempts + 1 };
    try {
      let attachments = Array.isArray(working.payload.attachments) ? [...(working.payload.attachments as string[])] : [];
      if (working.localUris.length && attachments.length === 0) {
        const uploaded = await SmartDiaryService.uploadPhotos(working.localUris, requestOptions);
        attachments = uploaded.attachments || [];
      }
      if (working.payload.kind === 'class_diary') {
        if (working.payload.send_original) {
          await SmartDiaryService.publishClassDiary({
            ...working.payload,
            image_url: attachments[0],
            send_original: true,
          }, requestOptions);
        } else {
          const extracted = await SmartDiaryService.extractClassDiary(working.localUris[0], {
            class_section_id: String(working.payload.class_section_id || ''),
            entry_date: String(working.payload.entry_date || ''),
            submission_id: String(working.payload.submission_id || working.id),
          }, requestOptions);
          await writePendingClassDiary(teacherId, {
            ...extracted,
            submission_id: working.payload.submission_id || working.id,
            class_section_id: working.payload.class_section_id,
            local_status: extracted.entries?.length ? 'ready' : 'failed',
          });
        }
        flushed += 1;
        continue;
      }
      working.status = 'processing';
      await SmartDiaryService.publish({
        ...working.payload,
        attachments,
        extract_async: Boolean(working.payload.extract_async),
      }, requestOptions);
      flushed += 1;
    } catch (error: any) {
      next.push({
        ...working,
        status: 'failed',
        lastError: error?.message || 'sync_failed',
        nextRetryAt: Date.now() + retryDelayMs(working.attempts),
      });
    }
  }

  await writeQueue(teacherId, next);
  return { flushed, remaining: next.length };
}

let unsubscribe: (() => void) | null = null;
const listeners = new Set<string>();

export function startDiaryQueueListener(teacherId: string) {
  if (!teacherId) return () => {};
  listeners.add(teacherId);
  if (!unsubscribe) {
    unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        listeners.forEach((id) => {
          void flushDiaryQueue(id);
        });
      }
    });
  }
  void flushDiaryQueue(teacherId);
  return () => {
    listeners.delete(teacherId);
  };
}
