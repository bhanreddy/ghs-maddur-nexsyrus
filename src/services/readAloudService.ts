import * as Speech from 'expo-speech';
import { acquireAudio, releaseAudio } from './audioOwner';

export type ReadAloudStatus = 'idle' | 'loading' | 'speaking';
export type ReadAloudErrorCode = 'missing-telugu-voice' | 'speech-failed';

export type ReadAloudSnapshot = {
  activeId: string | null;
  status: ReadAloudStatus;
  error: null | {
    id: string;
    code: ReadAloudErrorCode;
    sequence: number;
  };
};

type SpeechLanguage = 'en-IN' | 'te-IN';

type SpeechSegment = {
  text: string;
  language: SpeechLanguage;
};

const TELUGU_CHARACTERS = /[\u0C00-\u0C7F]/g;
const LATIN_CHARACTERS = /[A-Za-z]/g;
const listeners = new Set<() => void>();
const voiceCache = new Map<SpeechLanguage, string | null>();
const confirmedMissingVoices = new Set<SpeechLanguage>();

let operationSequence = 0;
let errorSequence = 0;
let snapshot: ReadAloudSnapshot = {
  activeId: null,
  status: 'idle',
  error: null,
};

function publish(next: ReadAloudSnapshot) {
  snapshot = next;
  listeners.forEach(listener => listener());
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function detectSpeechLanguage(text: string): SpeechLanguage {
  const teluguCount = text.match(TELUGU_CHARACTERS)?.length ?? 0;
  const latinCount = text.match(LATIN_CHARACTERS)?.length ?? 0;

  // Telugu text often contains English abbreviations and names. If Telugu script is
  // present and is at least as common as Latin script, a Telugu voice is less likely
  // to mangle the sentence than an English voice.
  return teluguCount > 0 && teluguCount >= latinCount ? 'te-IN' : 'en-IN';
}

function splitLongText(text: string): string[] {
  const platformLimit = Number.isFinite(Speech.maxSpeechInputLength)
    ? Speech.maxSpeechInputLength
    : 4000;
  const maxLength = Math.max(250, Math.min(platformLimit - 50, 3500));

  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    const candidate = remaining.slice(0, maxLength);
    const sentenceBreak = Math.max(
      candidate.lastIndexOf('. '),
      candidate.lastIndexOf('? '),
      candidate.lastIndexOf('! '),
      candidate.lastIndexOf('। ')
    );
    const wordBreak = candidate.lastIndexOf(' ');
    const breakAt = sentenceBreak > maxLength * 0.5
      ? sentenceBreak + 1
      : wordBreak > maxLength * 0.5
        ? wordBreak
        : maxLength;

    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function buildSpeechSegments(
  parts: readonly (string | null | undefined)[]
): SpeechSegment[] {
  return parts
    .map(part => normalizeText(part ?? ''))
    .filter(Boolean)
    .flatMap(part => splitLongText(part).map(text => ({
      text,
      language: detectSpeechLanguage(text),
    })));
}

async function resolveVoice(language: SpeechLanguage): Promise<string | undefined> {
  if (voiceCache.has(language)) return voiceCache.get(language) ?? undefined;

  let voices: Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>;
  try {
    voices = await Speech.getAvailableVoicesAsync();
  } catch {
    // Some web engines populate voices late. Passing only the BCP-47 language lets
    // the platform retry its own lookup instead of making speech fail completely.
    return undefined;
  }

  if (voices.length === 0) return undefined;

  const languagePrefix = language.slice(0, 2).toLowerCase();
  const matchingVoices = voices.filter(voice => {
    const matchesLanguage = voice.language
      .replace('_', '-')
      .toLowerCase()
      .startsWith(languagePrefix);
    if (!matchesLanguage) return false;

    // Browsers expose this directly. Google TTS identifies Android network-only
    // voices in the voice name; excluding them prevents a feature advertised as
    // offline from silently depending on a connection.
    if ('localService' in voice && voice.localService === false) return false;
    return !/network/i.test(`${voice.identifier} ${voice.name}`);
  });

  matchingVoices.sort((a, b) => {
    const aLocal = 'localService' in a && a.localService ? 1 : 0;
    const bLocal = 'localService' in b && b.localService ? 1 : 0;
    if (aLocal !== bLocal) return bLocal - aLocal;
    const aExact = a.language.replace('_', '-').toLowerCase() === language.toLowerCase() ? 1 : 0;
    const bExact = b.language.replace('_', '-').toLowerCase() === language.toLowerCase() ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return a.quality === Speech.VoiceQuality.Enhanced ? -1 : 1;
  });

  const identifier = matchingVoices[0]?.identifier ?? null;
  if (identifier) confirmedMissingVoices.delete(language);
  else confirmedMissingVoices.add(language);
  voiceCache.set(language, identifier);
  return identifier ?? undefined;
}

async function stopCurrent(activeId?: string) {
  if (activeId && snapshot.activeId !== activeId) return;
  if (!snapshot.activeId) return;
  const sequence = ++operationSequence;
  await Speech.stop().catch(() => undefined);
  if (sequence !== operationSequence) return;
  releaseAudio('read-aloud');
  publish({ activeId: null, status: 'idle', error: null });
}

async function toggle(
  id: string,
  parts: readonly (string | null | undefined)[]
) {
  if (snapshot.activeId === id && snapshot.status !== 'idle') {
    await stopCurrent(id);
    return;
  }

  const segments = buildSpeechSegments(parts);
  if (segments.length === 0) return;

  releaseAudio('read-aloud');
  const sequence = ++operationSequence;
  publish({ activeId: id, status: 'loading', error: null });
  const ownsAudio = await acquireAudio('read-aloud', () => stopCurrent());
  if (!ownsAudio || sequence !== operationSequence) { if (ownsAudio?.()) releaseAudio('read-aloud'); return; }
  await Speech.stop().catch(() => undefined);
  if (sequence !== operationSequence) return;

  const languages = [...new Set(segments.map(segment => segment.language))];
  const voiceEntries = await Promise.all(
    languages.map(async language => [language, await resolveVoice(language)] as const)
  );
  if (sequence !== operationSequence) return;

  const voiceByLanguage = new Map(voiceEntries);
  if (languages.includes('te-IN') && confirmedMissingVoices.has('te-IN')) {
    releaseAudio('read-aloud');
    publish({
      activeId: null,
      status: 'idle',
      error: { id, code: 'missing-telugu-voice', sequence: ++errorSequence },
    });
    return;
  }

  const speakSegment = (index: number) => {
    if (sequence !== operationSequence) return;
    const segment = segments[index];
    if (!segment) {
      releaseAudio('read-aloud');
      publish({ activeId: null, status: 'idle', error: null });
      return;
    }

    Speech.speak(segment.text, {
      language: segment.language,
      voice: voiceByLanguage.get(segment.language),
      rate: segment.language === 'te-IN' ? 0.88 : 0.92,
      pitch: 1,
      onStart: () => {
        if (sequence === operationSequence) {
          publish({ activeId: id, status: 'speaking', error: null });
        }
      },
      onDone: () => speakSegment(index + 1),
      onStopped: () => {
        if (sequence === operationSequence) {
          releaseAudio('read-aloud');
          publish({ activeId: null, status: 'idle', error: null });
        }
      },
      onError: () => {
        if (sequence === operationSequence) {
          operationSequence += 1;
          releaseAudio('read-aloud');
          publish({
            activeId: null,
            status: 'idle',
            error: { id, code: 'speech-failed', sequence: ++errorSequence },
          });
        }
      },
    });
  };

  speakSegment(0);
}

export const readAloudService = {
  getSnapshot: () => snapshot,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  toggle,
  stop: stopCurrent,
};
