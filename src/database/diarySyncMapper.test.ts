import { mapDiaryEntryForSync } from './diarySyncMapper';
import { normalizeDiaryAttachments } from '../utils/smartDiary/attachments';

const entry = {
  id: 'diary-1', class_section_id: 'class-1', entry_date: '2026-09-27',
  title: 'Homework', content: 'Please view the attached diary photo.',
  created_by: 'teacher-1', created_at: '2026-09-27T10:00:00.000Z',
};

describe('parent diary sync mapping', () => {
  it('preserves new and legacy attachment shapes in the string column', () => {
    const urls = ['https://cdn.example/one.jpg', 'https://cdn.example/two.jpg'];
    for (const attachments of [urls, JSON.stringify(urls), urls.map((url) => ({ url }))]) {
      const mapped = mapDiaryEntryForSync({ ...entry, attachments });
      expect(typeof mapped.attachments).toBe('string');
      expect(normalizeDiaryAttachments(mapped.attachments)).toEqual(urls);
      expect(mapped.id).toBe(entry.id);
    }
  });

  it('keeps an entry without images readable', () => {
    const mapped = mapDiaryEntryForSync({ ...entry, attachments: null });
    expect(mapped.attachments).toBe('[]');
    expect(mapped.entry_date).toBe('2026-09-27');
    expect(mapped.updated_at).toBe(mapped.created_at);
  });
});
