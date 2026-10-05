import * as Speech from 'expo-speech';
import type { AudioPlayer } from 'expo-audio';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { acquireAudio, releaseAudio, audioOwnedBy } from '../../services/audioOwner';
import rawManifest from './content/audio-manifest.json';
import { cachedClip, downloadClip, clearAudioCache } from './audioCache';
import type { AudioManifest, TourDefinition, TourLocale, TourStep } from './types';
const manifest = rawManifest as AudioManifest;
// Load only when needed: older native binaries can still use device speech.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const loadPremiumAudio = () => require('expo-audio') as typeof import('expo-audio');
export const voices = { en: 'en-IN-Chirp3-HD-Achernar', te: 'te-IN-Chirp3-HD-Achernar' };
export const clipKey = (tour: TourDefinition, step: TourStep, locale: TourLocale, index: number) => `${step.audioSource?.tourId ?? tour.id}:${step.audioSource?.version ?? tour.version}:${step.audioSource?.stepId ?? step.id}:${locale}:${index}`;
export const audioHashInput = (text: string, locale: TourLocale, narrationVersion: number) => JSON.stringify([text, `${locale}-IN`, voices[locale], narrationVersion]);
type Snapshot = { status: 'idle' | 'loading' | 'speaking' | 'paused' | 'unavailable' | 'done'; sentence: number };
let snapshot: Snapshot = { status: 'idle', sentence: 0 };
const listeners = new Set<() => void>();
const publish = (status: Snapshot['status'], sentence = snapshot.sentence) => { snapshot = { status, sentence }; listeners.forEach(fn => fn()); };
let generation = 0;
let player: AudioPlayer | null = null;
let pendingCancel: (() => void) | null = null;
let request: { tour: TourDefinition; step: TourStep; locale: TourLocale; rate: number; done: () => void } | null = null;
function stopPlayback() {
  const ownsSpeech = audioOwnedBy('tour') || pendingCancel !== null;
  generation++;
  pendingCancel?.(); pendingCancel = null;
  try { player?.remove(); } catch { /* player already disposed */ }
  player = null;
  if (ownsSpeech) void Speech.stop().catch(() => undefined);
}
function stop() { stopPlayback(); request = null; releaseAudio('tour'); publish('idle', 0); }
async function premium(uri: string, token: number, rate: number): Promise<boolean> {
  let createAudioPlayer: typeof import('expo-audio').createAudioPlayer;
  try { ({ createAudioPlayer } = loadPremiumAudio()); } catch { return false; }
  if (token !== generation) return false;
  return new Promise(resolve => {
    let settled = false;
    let started = false;
    const finish = (success: boolean) => {
      if (settled) return;
      settled = true; clearInterval(watchdog); subscription?.remove();
      if (pendingCancel === cancel) pendingCancel = null;
      try { localPlayer?.remove(); } catch { /* disposed */ }
      if (player === localPlayer) player = null;
      resolve(success);
    };
    const cancel = () => finish(false);
    let localPlayer: AudioPlayer | null = null;
    let subscription: { remove: () => void } | null = null;
    let beganAt = Date.now();
    const watchdog = setInterval(() => {
      if (token !== generation) finish(false);
      // Handles browser autoplay rejection, unavailable audio and missing events.
      else if (!started && Date.now() - beganAt > 5000) finish(false);
      else if (Date.now() - beganAt > 120000) finish(false);
    }, 200);
    pendingCancel = cancel;
    try {
      localPlayer = createAudioPlayer({ uri }, { updateInterval: 100 }); player = localPlayer;
      localPlayer.setPlaybackRate(rate);
      subscription = localPlayer.addListener('playbackStatusUpdate', status => {
        if (token !== generation) return finish(false);
        if (status.playing) { started = true; publish('speaking'); }
        if (status.didJustFinish) finish(true);
      });
      localPlayer.play();
    } catch { finish(false); }
  });
}
async function device(text: string, locale: TourLocale, rate: number, token: number): Promise<boolean> {
  let list: Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>;
  try { list = await Speech.getAvailableVoicesAsync(); } catch { return false; }
  if (token !== generation) return false;
  // Never pronounce Telugu with an English voice. Prefer a local exact locale.
  const matching = list.filter(v => v.language.replace('_', '-').toLowerCase().split('-')[0] === locale
    && !('localService' in v && v.localService === false) && !/network/i.test(`${v.identifier} ${v.name}`));
  matching.sort((a, b) => Number(b.language === `${locale}-IN`) - Number(a.language === `${locale}-IN`));
  const voice = matching[0]; if (!voice) return false;
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => finish(false), 120000);
    const finish = (ok: boolean) => { if (settled) return; settled = true; clearTimeout(timer); if (pendingCancel === cancel) pendingCancel = null; resolve(ok); };
    const cancel = () => finish(false); pendingCancel = cancel;
    try {
      Speech.speak(text, { language: `${locale}-IN`, voice: voice.identifier, rate: rate * (locale === 'te' ? 0.88 : 0.92),
        onStart: () => { if (token === generation) publish('speaking'); }, onDone: () => finish(true), onStopped: () => finish(false), onError: () => finish(false) });
    } catch { finish(false); }
  });
}
async function play(tour: TourDefinition, step: TourStep, locale: TourLocale, rate: number, done: () => void, from = 0) {
  stopPlayback();
  releaseAudio('tour');
  request = { tour, step, locale, rate, done };
  const token = generation;
  const owns = await acquireAudio('tour', () => { stopPlayback(); publish('paused'); });
  if (!owns || token !== generation) return;
  try { await loadPremiumAudio().setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, allowsRecording: false, interruptionMode: 'duckOthers' }); } catch { /* device speech remains available */ }
  await Speech.stop().catch(() => undefined);
  if (!owns() || token !== generation) return;
  for (let index = from; index < step.narration[locale].length; index++) {
    if (token !== generation || !owns()) return;
    publish('loading', index);
    const text = step.narration[locale][index];
    const expectedHash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, audioHashInput(text, locale, step.audioSource?.narrationVersion ?? tour.narrationVersion));
    if (token !== generation || !owns()) return;
    const clip = manifest.clips[clipKey(tour, step, locale, index)];
    let played = false;
    if (clip?.hash === expectedHash) {
      const cached = await cachedClip(clip);
      if (token !== generation || !owns()) { cached?.dispose(); return; }
      if (cached) { played = await premium(cached.uri, token, rate); cached.dispose(); }
      if (!played && token === generation && owns()) {
        void downloadClip(clip);
        played = await premium(clip.url, token, rate);
      }
    }
    if (token !== generation || !owns()) return;
    if (!played) played = await device(text, locale, rate, token);
    if (token !== generation || !owns()) return;
    if (!played) { publish('unavailable'); releaseAudio('tour'); return; }
  }
  publish('done'); releaseAudio('tour'); done();
}
export const tourNarration = {
  getSnapshot: () => snapshot,
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  play, stop,
  // Restart at the current sentence on all platforms for predictable fallback.
  pause: () => { stopPlayback(); releaseAudio('tour'); publish('paused'); },
  resume: () => { if (request) void play(request.tour, request.step, request.locale, request.rate, request.done, snapshot.sentence); },
};
export const hasPremiumAudio = () => Object.keys(manifest.clips).length > 0;
export async function downloadLanguagePack(locale: TourLocale, progress: (done: number, total: number) => void, signal?: AbortSignal) {
  const clips = [...new Map(Object.entries(manifest.clips).filter(([key]) => key.includes(`:${locale}:`)).map(([, clip]) => [clip.sha256, clip])).values()];
  let successful = 0;
  for (let i = 0; i < clips.length; i++) {
    if (signal?.aborted) return false;
    if (await downloadClip(clips[i])) successful++;
    progress(i + 1, clips.length);
  }
  return clips.length > 0 && successful === clips.length;
}
export { clearAudioCache };
