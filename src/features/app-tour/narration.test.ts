import { acquireAudio, releaseAudio } from '../../services/audioOwner';
import * as Speech from 'expo-speech';
import { createAudioPlayer } from 'expo-audio';
import { tourNarration } from './narration';
import { cachedClip } from './audioCache';
import type { TourDefinition } from './types';
jest.mock('expo-speech', () => ({ stop: jest.fn().mockResolvedValue(undefined), speak: jest.fn(), getAvailableVoicesAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: jest.fn(async (_algorithm, value) => require('node:crypto').createHash('sha256').update(value).digest('hex')) }));
jest.mock('./audioCache', () => ({ cachedClip: jest.fn().mockResolvedValue(null), downloadClip: jest.fn().mockResolvedValue(true), clearAudioCache: jest.fn() }));
jest.mock('./content/audio-manifest.json', () => ({ schemaVersion: 1, clips: {
  'student.test:1:start:en:0': { hash: require('node:crypto').createHash('sha256').update(JSON.stringify(['Hello school.', 'en-IN', 'en-IN-Chirp3-HD-Achernar', 1])).digest('hex'), url: 'https://example.test/audio.mp3', sha256: 'a'.repeat(64), bytes: 10 },
} }));
const guide: TourDefinition = { id: 'student.test', portal: 'student', kind: 'welcome', version: 1, narrationVersion: 1, title: { en: 'Test', te: 'పరీక్ష' }, description: { en: 'Test', te: 'పరీక్ష' }, steps: [{ id: 'start', route: '/home', target: 'student.launcher', title: { en: 'Test', te: 'పరీక్ష' }, body: { en: 'Hello school.', te: 'పాఠశాలకు స్వాగతం.' }, narration: { en: ['Hello school.'], te: ['పాఠశాలకు స్వాగతం.'] } }] };
const flush = async () => { await new Promise<void>(resolve => setImmediate(resolve)); };
beforeEach(() => { jest.clearAllMocks(); (Speech.getAvailableVoicesAsync as jest.Mock).mockResolvedValue([{ language: 'en-IN', identifier: 'english', name: 'English' }]); });
afterEach(() => { tourNarration.stop(); jest.useRealTimers(); });
test('missing Telugu voices retain readable instructions rather than speaking Telugu with English', async () => {
  const done = jest.fn(); await tourNarration.play(guide, guide.steps[0], 'te', 1, done);
  expect(Speech.speak).not.toHaveBeenCalled(); expect(tourNarration.getSnapshot().status).toBe('unavailable'); expect(done).not.toHaveBeenCalled();
});
test('a cancelled voice lookup cannot start narration for a departed step', async () => {
  let resolve!: (voices: unknown[]) => void;
  (Speech.getAvailableVoicesAsync as jest.Mock).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const playback = tourNarration.play(guide, guide.steps[0], 'te', 1, jest.fn());
  await flush(); tourNarration.stop(); resolve([{ language: 'te-IN', identifier: 'telugu', name: 'Telugu' }]); await playback;
  expect(Speech.speak).not.toHaveBeenCalled(); expect(tourNarration.getSnapshot().status).toBe('idle');
});
test('device fallback honors the selected locale and completes only after speech finishes', async () => {
  (Speech.getAvailableVoicesAsync as jest.Mock).mockResolvedValue([{ language: 'te-IN', identifier: 'telugu', name: 'Telugu' }]);
  const done = jest.fn(); const playback = tourNarration.play(guide, guide.steps[0], 'te', 1.25, done); await flush();
  expect(Speech.speak).toHaveBeenCalledWith('పాఠశాలకు స్వాగతం.', expect.objectContaining({ language: 'te-IN', voice: 'telugu' }));
  expect(done).not.toHaveBeenCalled(); (Speech.speak as jest.Mock).mock.calls[0][1].onDone(); await playback;
  expect(done).toHaveBeenCalledTimes(1);
});
test('cached premium playback is preferred and late completion events are ignored after exit', async () => {
  (cachedClip as jest.Mock).mockResolvedValueOnce({ uri: 'file:///cached.mp3', dispose: jest.fn() });
  let listener!: (value: any) => void;
  (createAudioPlayer as jest.Mock).mockReturnValueOnce({ setPlaybackRate: jest.fn(), play: jest.fn(), remove: jest.fn(), addListener: (_event: string, fn: typeof listener) => { listener = fn; return { remove: jest.fn() }; } });
  const done = jest.fn(); const playback = tourNarration.play(guide, guide.steps[0], 'en', 1, done); await flush();
  expect(createAudioPlayer).toHaveBeenCalledWith({ uri: 'file:///cached.mp3' }, expect.anything());
  tourNarration.stop(); listener({ didJustFinish: true }); await playback;
  expect(done).not.toHaveBeenCalled(); expect(Speech.speak).not.toHaveBeenCalled();
});
test('failed premium playback falls back to a matching installed device voice', async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  (createAudioPlayer as jest.Mock).mockImplementationOnce(() => { throw new Error('Offline'); });
  const done = jest.fn(); const playback = tourNarration.play(guide, guide.steps[0], 'en', 1, done); await flush();
  expect(Speech.speak).toHaveBeenCalled(); (Speech.speak as jest.Mock).mock.calls[0][1].onDone(); await playback;
  expect(done).toHaveBeenCalledTimes(1);
});

test('pausing device speech resumes at the current sentence and ignores the old callback', async () => {
  const step = { ...guide.steps[0], narration: { en: ['First.', 'Second.'], te: ['మొదట.', 'తరువాత.'] } };
  const done = jest.fn();
  const playback = tourNarration.play(guide, step, 'en', 1, done); await flush();
  (Speech.speak as jest.Mock).mock.calls[0][1].onDone(); await flush();
  expect((Speech.speak as jest.Mock).mock.calls[1][0]).toBe('Second.');
  const oldCallback = (Speech.speak as jest.Mock).mock.calls[1][1].onDone;
  tourNarration.pause(); await playback;
  tourNarration.resume(); await flush(); oldCallback();
  expect((Speech.speak as jest.Mock).mock.calls[2][0]).toBe('Second.');
  expect(done).not.toHaveBeenCalled();
  (Speech.speak as jest.Mock).mock.calls[2][1].onDone(); await flush();
  expect(done).toHaveBeenCalledTimes(1);
});

test('an idle tour cleanup does not stop another read-aloud owner', async () => {
  await acquireAudio('read-aloud', () => {});
  (Speech.stop as jest.Mock).mockClear();
  tourNarration.stop();
  expect(Speech.stop).not.toHaveBeenCalled();
  releaseAudio('read-aloud');
});

test('a complete-guide sentence reuses its verified feature narration asset', async () => {
  const step = { ...guide.steps[0], id: 'feature-start', audioSource: { tourId: guide.id, version: guide.version, stepId: 'start', narrationVersion: 1 } };
  const full = { ...guide, id: 'student.complete', version: 2, narrationVersion: 2, kind: 'complete' as const, steps: [step] };
  (cachedClip as jest.Mock).mockResolvedValueOnce({ uri: 'file:///feature-sentence.mp3', dispose: jest.fn() });
  let listener!: (value: any) => void;
  (createAudioPlayer as jest.Mock).mockReturnValueOnce({ setPlaybackRate: jest.fn(), play: jest.fn(), remove: jest.fn(), addListener: (_event: string, fn: typeof listener) => { listener = fn; return { remove: jest.fn() }; } });
  const playback = tourNarration.play(full, step, 'en', 1, jest.fn()); await flush();
  expect(createAudioPlayer).toHaveBeenCalledWith({ uri: 'file:///feature-sentence.mp3' }, expect.anything());
  listener({ didJustFinish: true }); await playback;
  expect(Speech.speak).not.toHaveBeenCalled();
});
