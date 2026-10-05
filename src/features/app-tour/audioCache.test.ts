import { createHash } from 'node:crypto';
import { cachedClip, clearAudioCache, downloadClip } from './audioCache.native';
import type { AudioClip } from './types';

const mockFiles = new Map<string, Uint8Array>();
let mockDirectoryExists = false;
const mockWrite = jest.fn();
jest.mock('expo-file-system', () => ({
  Paths: { document: '/documents' },
  Directory: class {
    get exists() { return mockDirectoryExists; }
    create() { mockDirectoryExists = true; }
    delete() { mockDirectoryExists = false; mockFiles.clear(); }
  },
  File: class {
    uri: string;
    constructor(_directory: unknown, name: string) { this.uri = name; }
    get exists() { return mockFiles.has(this.uri); }
    async bytes() { return mockFiles.get(this.uri); }
    delete() { mockFiles.delete(this.uri); }
    write(bytes: Uint8Array) { mockWrite(); mockFiles.set(this.uri, bytes); }
  },
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: jest.fn(async (_algorithm, bytes) => Uint8Array.from(require('node:crypto').createHash('sha256').update(bytes).digest()).buffer),
}));
const bytes = Uint8Array.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 1]);
const clip: AudioClip = { hash: 'a'.repeat(64), sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, url: 'https://example.test/clip.mp3' };
beforeEach(async () => { await clearAudioCache(); mockFiles.clear(); mockWrite.mockClear(); });

test('cached audio is usable only after its bytes and checksum match the manifest', async () => {
  mockFiles.set(`${clip.sha256}.mp3`, bytes);
  expect(await cachedClip(clip)).toEqual(expect.objectContaining({ uri: `${clip.sha256}.mp3` }));
  mockFiles.set(`${clip.sha256}.mp3`, new Uint8Array(bytes.length));
  expect(await cachedClip(clip)).toBeNull();
  expect(mockFiles.size).toBe(0);
});
test('corrupt downloads never become cached clips', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new Uint8Array(bytes.length).buffer });
  expect(await downloadClip(clip)).toBe(false);
  expect(mockWrite).not.toHaveBeenCalled();
});
test('cache removal cancels an in-flight download before any filesystem write', async () => {
  let resolve!: (value: ArrayBuffer) => void;
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, arrayBuffer: () => new Promise<ArrayBuffer>(done => { resolve = done; }) });
  const pending = downloadClip(clip);
  await new Promise<void>(done => setImmediate(done));
  await clearAudioCache(); resolve(bytes.buffer);
  expect(await pending).toBe(false);
  expect(mockWrite).not.toHaveBeenCalled();
});
