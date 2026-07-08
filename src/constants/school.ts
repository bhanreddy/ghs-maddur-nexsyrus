/**
 * Single Source of Truth for Build-time School Identity
 * This module ensures the app behaves as a single-tenant instance
 * compiled specifically for ONE school at build time.
 */

export const SCHOOL_ID: number = Number(process.env.EXPO_PUBLIC_SCHOOL_ID);
export const SCHOOL_CODE: string = process.env.EXPO_PUBLIC_SCHOOL_CODE ?? '';
export const SCHOOL_NAME: string = process.env.EXPO_PUBLIC_SCHOOL_NAME ?? 'School';
export const SCHOOL_LOGO: string = process.env.EXPO_PUBLIC_SCHOOL_LOGO ?? '';
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? '';
export const SUPABASE_URL: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function validateBuildConfig(): void {
  const errors: string[] = [];

  if (!SCHOOL_ID || isNaN(SCHOOL_ID) || SCHOOL_ID <= 0) {
    errors.push('EXPO_PUBLIC_SCHOOL_ID must be a valid positive number.');
  }
  if (!SCHOOL_CODE) {
    errors.push('EXPO_PUBLIC_SCHOOL_CODE is missing or empty.');
  }
  if (!API_URL) {
    errors.push('EXPO_PUBLIC_API_URL is missing or empty.');
  }
  if (!SUPABASE_URL) {
    errors.push('EXPO_PUBLIC_SUPABASE_URL is missing or empty.');
  }
  if (!SUPABASE_ANON_KEY) {
    errors.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing or empty.');
  }
  if (!process.env.EXPO_PUBLIC_SCHOOL_NAME) {
    errors.push('EXPO_PUBLIC_SCHOOL_NAME is missing in .env. Add it before building for a real school.');
  }

  // ── DEV code guard: prevent placeholder SCHOOL_CODE leaking into production ──
  if (SCHOOL_CODE === 'DEV' && !__DEV__) {
    throw new Error(
      '[FATAL] SCHOOL_CODE is still "DEV". You must set a real school code before building for production.'
    );
  }

  if (errors.length > 0) {
    const errorMsg = `[Build Config Validation Failed]\n\nPlease check your .env file:\n` + errors.map(e => `- ${e}`).join('\n');
    
    // In dev, throw to crash the app immediately and alert developers
    if (__DEV__) {
      throw new Error(errorMsg);
    } else {
      // In production, log and attempt to limp along. Expo sometimes strips empty variables, so a strict crash might kill prod users unexpectedly.
      console.error(errorMsg);
    }
  }
}
