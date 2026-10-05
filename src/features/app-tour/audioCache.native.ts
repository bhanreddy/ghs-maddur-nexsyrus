import { Directory, File, Paths } from 'expo-file-system';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import type { AudioClip } from './types';
const directory = () => new Directory(Paths.document, 'schoolims-tour-audio');
let epoch = 0;
export async function checksum(data: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, data))).map(b => b.toString(16).padStart(2, '0')).join('');
}
function fileFor(clip: AudioClip) {
  if (!/^[a-f0-9]{64}$/.test(clip.sha256)) throw new Error('Invalid clip checksum');
  return new File(directory(), `${clip.sha256}.mp3`);
}
export async function cachedClip(clip: AudioClip): Promise<{ uri: string; dispose: () => void } | null> {
  try {
    const file = fileFor(clip);
    if (!file.exists) return null;
    const bytes = await file.bytes();
    if (bytes.length !== clip.bytes || await checksum(bytes) !== clip.sha256) { file.delete(); return null; }
    return { uri: file.uri, dispose: () => {} };
  } catch { return null; }
}
export async function downloadClip(clip: AudioClip): Promise<boolean> {
  const token = epoch;
  if (await cachedClip(clip)) return true;
  try {
    if (!clip.url.startsWith('https://') || clip.bytes > 8 * 1024 * 1024) return false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(clip.url, { signal: controller.signal });
      if (!response.ok) return false;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== clip.bytes || await checksum(bytes) !== clip.sha256 || token !== epoch) return false;
      directory().create({ intermediates: true, idempotent: true });
      fileFor(clip).write(bytes);
      return true;
    } finally { clearTimeout(timeout); }
  } catch { return false; }
}
export async function clearAudioCache() { epoch++; const dir = directory(); if (dir.exists) dir.delete(); }
