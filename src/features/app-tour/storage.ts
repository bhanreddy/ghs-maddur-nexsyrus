import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TourDefinition, TourIdentity, TourPreferences, TourProgress } from './types';
// Deliberately outside @app_: ordinary app updates must not erase onboarding history.
export const TOUR_STORAGE_PREFIX = 'schoolims_tours_v1:';
export function identityKey(identity: TourIdentity): string {
  return TOUR_STORAGE_PREFIX + [identity.schoolId, identity.userId, identity.contextId, identity.portal].map(v => encodeURIComponent(String(v))).join(':');
}
export function progressKey(identity: TourIdentity, tour: TourDefinition) { return `${identityKey(identity)}:progress:${tour.id}:${tour.version}`; }
export async function readProgress(identity: TourIdentity, tour: TourDefinition): Promise<TourProgress | null> {
  try {
    const parsed = JSON.parse(await AsyncStorage.getItem(progressKey(identity, tour)) || 'null');
    if (!parsed || !tour.steps.some(s => s.id === parsed.stepId) || !['paused', 'completed'].includes(parsed.status)) return null;
    return { stepId: parsed.stepId, status: parsed.status, skipped: Array.isArray(parsed.skipped) ? parsed.skipped.filter((id: unknown) => tour.steps.some(s => s.id === id)) : [], ...(Array.isArray(parsed.visited) ? { visited: parsed.visited.filter((id: unknown) => tour.steps.some(s => s.id === id)) } : {}), updatedAt: Number(parsed.updatedAt) || 0 };
  } catch { return null; }
}
export const saveProgress = (identity: TourIdentity, tour: TourDefinition, progress: TourProgress) => AsyncStorage.setItem(progressKey(identity, tour), JSON.stringify(progress)).catch(() => undefined);
export async function readPreferences(identity: TourIdentity, narration = true): Promise<TourPreferences> {
  const defaults: TourPreferences = { locale: null, narration, rate: 1, autoAdvance: false };
  try {
    const v = JSON.parse(await AsyncStorage.getItem(`${identityKey(identity)}:preferences`) || '{}');
    return { locale: ['en', 'te'].includes(v.locale) ? v.locale : null, narration: typeof v.narration === 'boolean' ? v.narration : narration, rate: [0.75, 1, 1.25, 1.5].includes(v.rate) ? v.rate : 1, autoAdvance: v.autoAdvance === true };
  } catch { return defaults; }
}
export const savePreferences = (identity: TourIdentity, prefs: TourPreferences) => AsyncStorage.setItem(`${identityKey(identity)}:preferences`, JSON.stringify(prefs)).catch(() => undefined);
// Invitations belong to the school/account/portal, not a selected child or viewed staff member.
export function invitationKey(identity: TourIdentity) {
  return TOUR_STORAGE_PREFIX + 'invitation:' + [identity.schoolId, identity.userId, identity.portal].map(v => encodeURIComponent(String(v))).join(':');
}
export async function invitationSeen(identity: TourIdentity): Promise<boolean> {
  try {
    if (await AsyncStorage.getItem(invitationKey(identity))) return true;
    // Preserve dismissals from the earlier access-context-scoped invitation keys.
    const prefix = TOUR_STORAGE_PREFIX + [identity.schoolId, identity.userId].map(v => encodeURIComponent(String(v))).join(':') + ':';
    const suffix = `:${identity.portal}:invited`;
    const legacy = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(prefix) && key.endsWith(suffix));
    if (legacy.length && (await AsyncStorage.multiGet(legacy)).some(([, value]) => !!value)) {
      await markInvited(identity);
      return true;
    }
    return false;
  } catch { return true; } // Do not interrupt the dashboard when persistence is unavailable.
}
export const markInvited = (identity: TourIdentity) => AsyncStorage.setItem(invitationKey(identity), '1').catch(() => undefined);
export async function readTourAccess(identity: TourIdentity): Promise<Record<string, { allowed: boolean; expiresAt: number }>> {
  try {
    const data = JSON.parse(await AsyncStorage.getItem(`${identityKey(identity)}:access`) || '{}');
    return Object.fromEntries(Object.entries(data).filter(([, value]) => {
      const record = value as { allowed?: unknown; expiresAt?: unknown };
      return typeof record?.allowed === 'boolean' && typeof record.expiresAt === 'number' && record.expiresAt > Date.now();
    })) as Record<string, { allowed: boolean; expiresAt: number }>;
  } catch { return {}; }
}
export const saveTourAccess = (identity: TourIdentity, access: Record<string, { allowed: boolean; expiresAt: number }>) => AsyncStorage.setItem(`${identityKey(identity)}:access`, JSON.stringify(access)).catch(() => undefined);
