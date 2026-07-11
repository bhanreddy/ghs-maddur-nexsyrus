import { SUPABASE_URL } from '../constants/school';

/**
 * Resolve a stored media reference (e.g. a person's `photo_url`) into a URL
 * that an <Image source={{ uri }} /> can load.
 *
 * The backend normalises uploads and returns fully-qualified public URLs, so in
 * practice this is a null-safe passthrough. As a convenience it also handles a
 * couple of shapes that show up in older/mixed data:
 *   - `null` / `undefined` / '' → '' (caller decides on a placeholder)
 *   - absolute `http(s)://` or `data:` URIs → returned unchanged
 *   - a bare storage object path → prefixed with the Supabase storage base
 */
export function getMediaUrl(ref?: string | null): string {
  if (!ref) return '';
  const trimmed = ref.trim();
  if (!trimmed) return '';
  if (/^(https?:|data:|file:|blob:)/i.test(trimmed)) return trimmed;

  // Relative storage path — build a public Supabase Storage URL.
  if (!SUPABASE_URL) return trimmed;
  const base = SUPABASE_URL.replace(/\/+$/, '');
  const path = trimmed.replace(/^\/+/, '');
  return `${base}/storage/v1/object/public/${path}`;
}
