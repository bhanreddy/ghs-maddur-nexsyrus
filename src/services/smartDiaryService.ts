import { Platform } from 'react-native';
import { api } from './apiClient';
import type { DiaryExtraction } from '../utils/smartDiary/compose';

// Freeze the selected staff identity across queued uploads and publishing.
type DiaryRequestOptions = { _staffPortalId?: string };

export type SmartCurrentClass = {
  class_section_id: string;
  class_name?: string;
  section_name?: string;
  subject_id?: string | null;
  subject_name?: string;
  period_number?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  display_class?: string;
  display_time?: string;
  source?: string;
  match?: string;
  today?: string;
};

export type SmartDiaryContext = {
  greeting_name?: string;
  today?: string;
  weekday?: string;
  now_minutes?: number;
  current: SmartCurrentClass | null;
  recent: SmartRecentEntry[];
  suggestion?: { type: string; diary_id: string; label: string; preview?: string } | null;
  timetable_count?: number;
  class_teacher_sections?: ClassTeacherSection[];
  can_upload_class_diary?: boolean;
};

export type ClassTeacherSection = {
  class_section_id: string;
  class_id?: string;
  class_name?: string;
  section_id?: string;
  section_name?: string;
};

export type ClassDiaryEntry = {
  subject: string;
  subject_id?: string | null;
  unknown?: boolean;
  rawName?: string;
  type?: string;
  classwork?: string;
  homework?: string;
  chapter?: string;
  reminders?: string[];
  dueDate?: string | null;
  confidence?: number;
  confidence_label?: string;
  selected?: boolean;
};

export type ClassDiaryExtractResult = {
  class_section_id: string;
  class_name?: string;
  section_name?: string;
  entry_date: string;
  submission_id?: string | null;
  image_url: string;
  subjects?: { id: string; name: string }[];
  entries: ClassDiaryEntry[];
  overall_confidence?: number;
  can_send_original?: boolean;
  message?: string | null;
};

export type SmartRecentEntry = {
  id: string;
  entry_date: string;
  title?: string;
  content?: string;
  class_section_id: string;
  subject_id?: string;
  subject_name?: string;
  class_name?: string;
  section_name?: string;
  attachments?: string[];
  homework_due_date?: string | null;
  entry_source?: string;
};

export type DiaryTemplate = {
  id: string;
  name: string;
  category?: string;
  content: string;
  variables?: { key: string; label: string; type?: string; default?: string }[];
  scope?: 'SYSTEM' | 'SCHOOL' | 'TEACHER';
  is_favourite?: boolean;
  usage_count?: number;
};

export type ExtractResult = {
  extraction: DiaryExtraction;
  preview: {
    title: string;
    content: string;
    structured?: DiaryExtraction | null;
    uncertain_fields?: string[];
    attachments?: string[];
  };
  ocr_status?: string;
  ai_status?: string;
  message?: string | null;
  can_send?: boolean;
  attachments?: string[];
  transcription?: string;
  detected_language?: string;
};

export const SmartDiaryService = {
  getContext: (options?: { silent?: boolean }) =>
    api.get<SmartDiaryContext>('/diary/smart/context', undefined, { silent: options?.silent ?? true }),

  getTemplates: (options?: { silent?: boolean }) =>
    api.get<{ mine: DiaryTemplate[]; school: DiaryTemplate[]; system: DiaryTemplate[]; favourites: DiaryTemplate[] }>(
      '/diary/smart/templates',
      undefined,
      { silent: options?.silent ?? true },
    ),

  createTemplate: (data: Partial<DiaryTemplate> & { name: string; content: string }) =>
    api.post<DiaryTemplate>('/diary/smart/templates', data),

  updateTemplate: (id: string, data: Partial<DiaryTemplate>) =>
    api.put<DiaryTemplate>(`/diary/smart/templates/${id}`, data),

  deleteTemplate: (id: string) => api.delete(`/diary/smart/templates/${id}`),

  renderTemplate: (id: string, values: Record<string, string>) =>
    api.post<{ content: string; name: string }>(`/diary/smart/templates/${id}/render`, { values }),

  uploadPhotos: async (uris: string[], options: DiaryRequestOptions = {}) => {
    const form = new FormData();
    for (let index = 0; index < uris.length; index += 1) {
      appendFile(form, 'photos', uris[index], `diary-${index}.jpg`, 'image/jpeg');
    }
    return api.uploadFormData<{ attachments: string[]; can_send: boolean }>('/diary/smart/upload', form, {
      ...options,
      silent: true,
      timeoutMs: 45000,
    });
  },

  extractPhotos: async (uris: string[], context: Record<string, string | number | null | undefined> = {}) => {
    const form = new FormData();
    appendContext(form, context);
    for (let index = 0; index < uris.length; index += 1) {
      appendFile(form, 'photos', uris[index], `diary-${index}.jpg`, 'image/jpeg');
    }
    return api.uploadFormData<ExtractResult>('/diary/smart/extract', form, { silent: true, timeoutMs: 90000 });
  },

  transcribe: async (uri: string, context: Record<string, string | number | null | undefined> = {}) => {
    const form = new FormData();
    appendContext(form, context);
    appendFile(form, 'audio', uri, 'diary-voice.m4a', 'audio/mp4');
    return api.uploadFormData<ExtractResult>('/diary/smart/transcribe', form, { silent: true, timeoutMs: 90000 });
  },

  publish: (data: Record<string, unknown>, options: DiaryRequestOptions = {}) =>
    api.post<{ message: string; entries: { id: string; class_section_id: string; createdNew?: boolean; duplicate?: boolean }[]; results: unknown[] }>(
      '/diary/smart/publish',
      data,
      { ...options, silent: true, timeoutMs: 45000 },
    ),

  copy: (data: { source_id: string; class_section_ids: string[]; submission_ids?: string[]; subject_id?: string }) =>
    api.post('/diary/smart/copy', data, { silent: true }),

  extractClassDiary: async (uri: string, context: Record<string, string | number | null | undefined> = {}, options: DiaryRequestOptions = {}) => {
    const form = new FormData();
    appendContext(form, context);
    appendFile(form, 'photos', uri, 'class-diary.jpg', 'image/jpeg');
    return api.uploadFormData<ClassDiaryExtractResult>('/diary/smart/class-diary/extract', form, {
      ...options,
      silent: true,
      timeoutMs: 90000,
    });
  },

  publishClassDiary: (data: Record<string, unknown>, options: DiaryRequestOptions = {}) =>
    api.post('/diary/smart/class-diary/publish', data, { ...options, silent: true, timeoutMs: 45000 }),
};

function appendContext(form: FormData, context: Record<string, string | number | null | undefined>) {
  Object.entries(context).forEach(([key, value]) => {
    if (value != null && value !== '') form.append(key, String(value));
  });
}

function appendFile(form: FormData, field: string, uri: string, name: string, type: string) {
  if (Platform.OS === 'web') {
    form.append(field, { uri, name, type } as any);
    return;
  }
  form.append(field, { uri, name, type } as any);
}
