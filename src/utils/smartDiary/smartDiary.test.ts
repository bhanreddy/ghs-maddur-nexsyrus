import { detectCurrentClass, formatClock } from './currentClass';
import { composeDiaryContent, composeHomeworkLine, mergeTemplateCatalog, renderTemplateContent, SYSTEM_TEMPLATES } from './compose';
import { isPhotoFallbackContent, normalizeDiaryAttachments, serializeDiaryAttachmentsForSync } from './attachments';
import { retryDelayMs, shouldAttempt } from './queuePolicy';

describe('smart diary current class', () => {
  const slots = [
    {
      class_section_id: 'cs-7a',
      class_name: '7',
      section_name: 'A',
      subject_id: 'math',
      subject_name: 'Mathematics',
      period_number: 5,
      start_time: '14:00:00',
      end_time: '14:45:00',
      day_of_week: 'friday',
    },
    {
      class_section_id: 'cs-8b',
      class_name: '8',
      section_name: 'B',
      subject_id: 'math',
      subject_name: 'Mathematics',
      period_number: 6,
      start_time: '14:45:00',
      end_time: '15:30:00',
      day_of_week: 'friday',
    },
  ];

  it('selects period 5 at 2:15 PM', () => {
    const found = detectCurrentClass(slots, { weekday: 'friday', minutes: 14 * 60 + 15 });
    expect(found.slot?.class_section_id).toBe('cs-7a');
    expect(formatClock(14 * 60 + 15)).toBe('2:15 PM');
  });

  it('selects period 6 after period 6 starts', () => {
    const found = detectCurrentClass(slots, { weekday: 'friday', minutes: 14 * 60 + 50 });
    expect(found.slot?.class_section_id).toBe('cs-8b');
  });
});

describe('smart diary templates and compose', () => {
  it('renders complete exercise without placeholders', () => {
    const content = renderTemplateContent('Complete Exercise {exercise}, Questions {questions}.', {
      exercise: '4.2',
      questions: '1–10',
    });
    expect(content).toBe('Complete Exercise 4.2, Questions 1–10.');
  });

  it('keeps a photo fallback when extraction is empty', () => {
    expect(composeDiaryContent({}, { hasPhoto: true })).toMatch(/attached diary photo/i);
    expect(isPhotoFallbackContent(composeDiaryContent({}, { hasPhoto: true }))).toBe(true);
    expect(composeHomeworkLine({ exercise: '4.2', questions: '1-10' })).toMatch(/Exercise 4\.2/);
  });

  it('normalizes diary photo attachments from arrays, objects, and json strings', () => {
    expect(normalizeDiaryAttachments(['https://cdn.example/diary.jpg'])).toEqual(['https://cdn.example/diary.jpg']);
    expect(normalizeDiaryAttachments([{ url: 'https://cdn.example/diary.jpg' }])).toEqual(['https://cdn.example/diary.jpg']);
    expect(normalizeDiaryAttachments(JSON.stringify(['https://cdn.example/diary.jpg']))).toEqual(['https://cdn.example/diary.jpg']);
    expect(normalizeDiaryAttachments('not-a-url')).toEqual([]);
  });

  it('serializes API attachments for the WatermelonDB string column', () => {
    const urls = ['https://cdn.example/one.jpg', 'https://cdn.example/two.jpg'];
    for (const value of [urls, JSON.stringify(urls), urls.map((url) => ({ url }))]) {
      const stored = serializeDiaryAttachmentsForSync(value);
      expect(typeof stored).toBe('string');
      expect(normalizeDiaryAttachments(stored)).toEqual(urls);
    }
    expect(serializeDiaryAttachmentsForSync(null)).toBe('[]');
    expect(serializeDiaryAttachmentsForSync('not-a-url')).toBe('[]');
  });

  it('replaces local system template ids with server uuids by name', () => {
    const merged = mergeTemplateCatalog(SYSTEM_TEMPLATES as any, {
      system: [{
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Complete Exercise',
        content: 'Complete Exercise {exercise}, Questions {questions}.',
        variables: [{ key: 'exercise', label: 'Exercise' }, { key: 'questions', label: 'Questions' }],
      }],
      mine: [{
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Corrections + Signature',
        content: 'Complete classwork corrections and get parent signature.',
      }],
    });
    const exercise = merged.find((item) => item.name === 'Complete Exercise');
    expect(exercise?.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(merged.some((item) => item.name === 'Corrections + Signature')).toBe(true);
  });
});

describe('offline diary queue retry', () => {
  it('uses exponential backoff and does not retry uploading items', () => {
    expect(retryDelayMs(0)).toBe(8000);
    expect(retryDelayMs(1)).toBe(16000);
    expect(retryDelayMs(8)).toBe(5 * 60 * 1000);
    const item = {
      status: 'failed' as const,
      nextRetryAt: Date.now() - 10,
    };
    expect(shouldAttempt(item)).toBe(true);
    expect(shouldAttempt({ ...item, status: 'uploading' })).toBe(false);
    expect(shouldAttempt({ ...item, status: 'synced' })).toBe(false);
  });
});
