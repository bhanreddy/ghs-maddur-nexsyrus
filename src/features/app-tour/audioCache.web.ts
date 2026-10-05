import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import type { AudioClip } from './types';
let epoch = 0;
async function checksum(data: ArrayBuffer) {
  return Array.from(new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, data))).map(b => b.toString(16).padStart(2, '0')).join('');
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Offline audio storage unavailable'));
    const req = indexedDB.open('schoolims-tour-audio', 1);
    let finished = false;
    const timer = setTimeout(() => { finished = true; reject(new Error('Audio storage busy')); }, 1500);
    req.onupgradeneeded = () => { if (finished) req.transaction?.abort(); else req.result.createObjectStore('clips'); };
    req.onsuccess = () => { clearTimeout(timer); if (finished) req.result.close(); else { finished = true; resolve(req.result); } };
    req.onerror = () => { finished = true; clearTimeout(timer); reject(req.error); };
    req.onblocked = () => { finished = true; clearTimeout(timer); reject(new Error('Audio storage blocked')); };
  });
}
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>, allowed?: () => boolean): Promise<T> {
  const db = await database();
  if (allowed && !allowed()) { db.close(); throw new Error('Audio download cancelled'); }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('clips', mode);
    const request = operation(tx.objectStore('clips'));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
export async function cachedClip(clip: AudioClip): Promise<{ uri: string; dispose: () => void } | null> {
  try {
    const buffer = await transaction<ArrayBuffer | undefined>('readonly', store => store.get(clip.sha256));
    if (!buffer) return null;
    if (buffer.byteLength !== clip.bytes || await checksum(buffer) !== clip.sha256) {
      await transaction('readwrite', store => store.delete(clip.sha256)); return null;
    }
    const uri = URL.createObjectURL(new Blob([buffer], { type: 'audio/mpeg' }));
    return { uri, dispose: () => URL.revokeObjectURL(uri) };
  } catch { return null; }
}
export async function downloadClip(clip: AudioClip): Promise<boolean> {
  const token = epoch;
  const cached = await cachedClip(clip);
  if (cached) { cached.dispose(); return true; }
  try {
    if (!clip.url.startsWith('https://') || clip.bytes > 8 * 1024 * 1024) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(clip.url, { signal: controller.signal });
      if (!res.ok) return false;
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength !== clip.bytes || await checksum(buffer) !== clip.sha256 || token !== epoch) return false;
      await transaction('readwrite', store => store.put(buffer, clip.sha256), () => token === epoch);
      return true;
    } finally { clearTimeout(timer); }
  } catch { return false; }
}
export async function clearAudioCache() { epoch++; await transaction('readwrite', store => store.clear()); }
