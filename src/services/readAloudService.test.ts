import * as Speech from 'expo-speech';
jest.mock('expo-speech', () => ({ stop: jest.fn().mockResolvedValue(undefined), speak: jest.fn(), getAvailableVoicesAsync: jest.fn().mockResolvedValue([{ language: 'en-IN', identifier: 'english', name: 'English' }]), VoiceQuality: { Enhanced: 'Enhanced' } }));
import { buildSpeechSegments, detectSpeechLanguage, readAloudService } from './readAloudService';

describe('readAloudService language selection', () => {
  it('selects an English India voice for English card content', () => {
    expect(detectSpeechLanguage('Complete exercise five by Monday.')).toBe('en-IN');
  });

  it('selects a Telugu India voice for Telugu card content', () => {
    expect(detectSpeechLanguage('సోమవారం లోపు ఐదవ అభ్యాసాన్ని పూర్తి చేయండి.')).toBe('te-IN');
  });

  it('keeps bilingual card fields as separate utterances', () => {
    expect(buildSpeechSegments([
      'Mathematics',
      'రేపటిలోగా పేజీ పది పూర్తి చేయండి.',
    ])).toEqual([
      { text: 'Mathematics', language: 'en-IN' },
      { text: 'రేపటిలోగా పేజీ పది పూర్తి చేయండి.', language: 'te-IN' },
    ]);
  });

  it('drops blank fields and normalizes whitespace', () => {
    expect(buildSpeechSegments(['  School   holiday tomorrow  ', '', null])).toEqual([
      { text: 'School holiday tomorrow', language: 'en-IN' },
    ]);
  });
});

test('late stop completion cannot erase a newer read-aloud request', async () => {
  await readAloudService.toggle('first', ['First reading.']);
  let resolve!: () => void;
  (Speech.stop as jest.Mock).mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
  const oldStop = readAloudService.stop('first');
  await readAloudService.toggle('second', ['Second reading.']);
  resolve(); await oldStop;
  expect(readAloudService.getSnapshot().activeId).toBe('second');
  await readAloudService.stop('second');
});
