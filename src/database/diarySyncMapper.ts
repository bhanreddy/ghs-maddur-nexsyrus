import { serializeDiaryAttachmentsForSync } from '../utils/smartDiary/attachments';

/** Match the WatermelonDB column types before raw sync sanitization runs. */
export function mapDiaryEntryForSync(d: any) {
  return {
    id: d.id,
    class_section_id: d.class_section_id,
    entry_date: new Date(d.entry_date).toISOString().split('T')[0],
    subject_id: d.subject_id,
    title: d.title,
    title_te: d.title_te,
    content: d.content,
    content_te: d.content_te,
    homework_due_date: d.homework_due_date,
    attachments: serializeDiaryAttachmentsForSync(d.attachments),
    subject_name: d.subject_name,
    created_by: d.created_by,
    created_at: new Date(d.created_at).getTime(),
    updated_at: new Date(d.updated_at || d.created_at).getTime(),
  };
}
