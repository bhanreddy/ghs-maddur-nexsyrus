export function normalizeDiaryAttachments(raw: unknown): string[] {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      return isRemoteImageUrl(trimmed) ? [trimmed] : [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object' && 'url' in item) {
        return String((item as { url?: unknown }).url || '').trim();
      }
      return '';
    })
    .filter(isRemoteImageUrl);
}

/** WatermelonDB sync writes raw columns, so its string column needs JSON text. */
export function serializeDiaryAttachmentsForSync(raw: unknown): string {
  return JSON.stringify(normalizeDiaryAttachments(raw));
}

export function isRemoteImageUrl(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

export function isPhotoFallbackContent(text?: string | null): boolean {
  return /attached diary photo/i.test(String(text || ''));
}
