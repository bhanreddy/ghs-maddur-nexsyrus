import { synchronize } from '@nozbe/watermelondb/sync';
import { Q } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from './index';
import { api } from '../services/apiClient';
import { mapDiaryEntryForSync } from './diarySyncMapper';

/** Match server DIARY_RETENTION_DAYS: keep today + prior (n-1) days in local DB. */
const DIARY_LOCAL_RETENTION_DAYS = 15;

/**
 * Which account's diary currently occupies the local DB.
 *
 * WatermelonDB is a single device-wide store, but a parent using the multi-account
 * switcher runs several students through it. Without this marker the store accumulates
 * the union of every class ever synced on the device, and one sibling's homework shows
 * up in the other sibling's portal. We wipe the diary whenever the owner changes so the
 * local store only ever holds the account that is actually signed in.
 */
const DIARY_OWNER_KEY = 'diary_sync_owner_v1';

/** @param graceDays extra days to keep, to stay clear of server/device timezone edges. */
function diaryLocalCutoffYmd(graceDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - (DIARY_LOCAL_RETENTION_DAYS - 1) - graceDays);
  return d.toISOString().split('T')[0];
}

/** Fingerprint shape shared by the server probe and the local mirror of it. */
export type DiaryFingerprint = { count: number; lastUpdatedAt: number };

/**
 * Fingerprint of what the device currently holds for this class, computed the same
 * way the server computes its own. Deriving it from the DB rather than caching it in
 * AsyncStorage means it can never drift out of step with the rows it describes.
 */
async function localDiaryFingerprint(classSectionId: string): Promise<DiaryFingerprint> {
  // Deliberately no date filter. Reconciliation already makes the local rows for this
  // class an exact mirror of the server's window, so re-deriving a window here could
  // only introduce drift: the server bounds it with CURRENT_DATE in the server's
  // timezone while the device would bound it in its own, and a one-day disagreement
  // at the edge would leave the counts permanently unequal — an endless auto-sync.
  const rows = await database.collections
    .get<any>('diary_entries')
    .query(Q.where('class_section_id', classSectionId))
    .fetch();

  let lastUpdatedAt = 0;
  for (const row of rows) {
    const ts = Math.max(Number(row.updatedAt ?? 0) || 0, Number(row.createdAt ?? 0) || 0);
    if (ts > lastUpdatedAt) lastUpdatedAt = ts;
  }
  return { count: rows.length, lastUpdatedAt };
}

/** Resolve the signed-in account's class, rejecting a profile for a different account. */
async function resolveActiveProfile(activeUserId?: string | null) {
  let userProfile: any = null;
  try {
    userProfile = await api.get<any>('/auth/me', undefined, { silent: true });
  } catch {
    return { userProfile: null, classSectionId: null, mismatched: false };
  }

  // switchAccount swaps the Supabase session under us, so /auth/me can answer for the
  // account we just left. Those rows must never reach this student's local store.
  const profileUserId = userProfile?.id ?? userProfile?.userId ?? null;
  if (activeUserId && profileUserId && String(profileUserId) !== String(activeUserId)) {
    return { userProfile: null, classSectionId: null, mismatched: true };
  }

  return {
    userProfile,
    classSectionId: (userProfile?.class_section_id || userProfile?.classId || null) as string | null,
    mismatched: false,
  };
}

/**
 * Does the server hold anything the device doesn't? One tiny request, no row payload.
 *
 * Used to gate the automatic refresh: we only spend a full pull when the live diary
 * has actually moved. When it hasn't, the parent's manual pull-to-refresh is still
 * free to force a sync.
 */
export async function hasRemoteDiaryChanges(
  activeUserId?: string | null,
  knownClassSectionId?: string | null
): Promise<boolean> {
  // Callers that already hold the class (the diary screen reads it off the session)
  // pass it in so the probe costs exactly one small request. Falling back to /auth/me
  // would double the round-trips on the very connections this check exists to spare.
  const classSectionId =
    knownClassSectionId || (await resolveActiveProfile(activeUserId)).classSectionId;
  if (!classSectionId) return false;

  let remote: DiaryFingerprint;
  try {
    const res = await api.get<any>('/diary/sync-state', { class_section_id: classSectionId }, { silent: true });
    remote = { count: Number(res?.count ?? 0), lastUpdatedAt: Number(res?.last_updated_at ?? 0) };
  } catch {
    // Probe failed (offline / slow link). Report "nothing new" so we don't kick off a
    // heavy pull that is just as likely to fail; the user can still pull to refresh.
    return false;
  }

  const local = await localDiaryFingerprint(classSectionId);
  return remote.count !== local.count || remote.lastUpdatedAt !== local.lastUpdatedAt;
}

async function wipeLocalDiary(): Promise<void> {
  await database.write(async () => {
    const rows = await database.collections.get('diary_entries').query().fetch();
    await Promise.all(rows.map((row) => row.destroyPermanently()));
  });
}

/** Drop diary rows left behind by a different account before pulling this one's. */
async function ensureDiaryOwner(activeUserId?: string | null): Promise<void> {
  if (!activeUserId) return;
  let previous: string | null = null;
  try {
    previous = await AsyncStorage.getItem(DIARY_OWNER_KEY);
  } catch {
    // A storage read failure must not be treated as "same account" — that is the
    // case that leaks. Fall through and wipe.
  }
  if (previous === activeUserId) return;
  await wipeLocalDiary();
  try {
    await AsyncStorage.setItem(DIARY_OWNER_KEY, activeUserId);
  } catch {
    /* best effort — a missed write only costs one extra wipe next sync */
  }
}

export async function sync(activeUserId?: string | null) {
  await ensureDiaryOwner(activeUserId);

  await synchronize({
    database,
    pullChanges: async ({ lastPulledAt }) => {
      // 1. Fetch changes from backend
      try {await api.post('/log', { msg: 'Sync: pullChanges started', lastPulledAt }, { silent: true });} catch (e) {}
      // We need an endpoint that returns { changes: { diary_entries: { created, updated, deleted } }, timestamp }
      // We need an endpoint that returns { changes: { diary_entries: { created, updated, deleted } }, timestamp }
      // Since we might not have a dedicated sync endpoint yet, we will construct a valid response
      // from standard endpoints for now (or minimal implementation).

      const timestamp = Date.now();

      // Fetch User (Self) first to get class_section_id
      const { userProfile, classSectionId, mismatched } = await resolveActiveProfile(activeUserId);
      if (mismatched) {
        return { changes: {}, timestamp };
      }

      // Always full-pull the retention window (updated_since = 0) instead of an
      // incremental delta. The dataset is tiny (~15 days for one class), and an
      // incremental sync silently drops entries whenever the client/server clocks
      // skew, a sync fires in the gap around an entry's creation, or the local DB
      // was cleared while lastPulledAt persisted — which showed up as diary
      // history appearing empty even though the entries exist on the server.
      // Upserting the full window every time is idempotent and self-healing.
      let diaryEntries: any[] = [];
      // Tracks whether the snapshot below is trustworthy. Only a successful response
      // may drive deletions — a failed request must never be read as "server is empty".
      let diaryPulled = false;
      // Only ever pull a class-scoped window. Sending /diary without class_section_id
      // falls through to the server's "teacher's own entries" branch, which returns
      // nothing for a parent — that is what made the diary look empty when /auth/me
      // failed on a slow connection. No class resolved means no pull, and the rows
      // already on the device are left untouched.
      if (classSectionId) {
        try {
          const res = await api.get<any[]>('/diary', {
            updated_since: '0',
            is_sync: 'true',
            class_section_id: classSectionId,
          });
          if (Array.isArray(res)) {
            diaryEntries = res;
            diaryPulled = true;
          }
        } catch (e) {

        }
      }

      // Reconcile deletions by set difference.
      //
      // The server hard-DELETEs diary rows, so there is no tombstone to pull and the
      // old `deleted: []` meant a removed or reassigned entry stayed on the device
      // forever. Because the pull above is an authoritative full snapshot of the
      // window for this class, anything the device holds in that window that the
      // server did not return no longer exists and must go. Rows carrying a different
      // class_section_id are swept too — that is residue from a switched account.
      //
      // Skipped entirely when the pull failed or the class is unknown: an empty
      // `diaryEntries` would otherwise read as "the server has nothing" and wipe a
      // perfectly good offline cache.
      let deletedIds: string[] = [];
      if (classSectionId && Array.isArray(diaryEntries) && diaryPulled) {
        const serverIds = new Set(diaryEntries.map((d) => String(d.id)));
        // Every local row, unbounded by date — the server snapshot is the sole
        // authority on what should remain, so rows that have aged out of its window
        // are dropped here too rather than waiting on the retention sweep.
        const localRows = await database.collections.get<any>('diary_entries').query().fetch();
        // Membership in the snapshot is the only test. Filtering on class as well
        // would put a re-assigned entry — one a teacher moved to another section, so
        // it still carries the old class locally but comes back under the new one —
        // into `deleted` and `updated` at once, which WatermelonDB rejects. Rows left
        // by a previously switched account simply aren't in the snapshot, so this
        // sweeps them anyway.
        deletedIds = localRows
          .filter((row) => !serverIds.has(String(row.id)))
          .map((row) => String(row.id));
      }

      return {
        changes: {
          diary_entries: {
            created: [], // If we can't distinguish, we can treat all as updated (upsert)
            updated: Array.isArray(diaryEntries) ? diaryEntries.map(mapDiaryEntryForSync) : [],
            deleted: deletedIds
          },
          users: {
            created: [],
            updated: userProfile ? [{
              id: userProfile.id,
              email: userProfile.email,
              first_name: userProfile.first_name,
              last_name: userProfile.last_name,
              display_name: userProfile.display_name,
              role: userProfile.role || userProfile.roles && userProfile.roles[0],
              photo_url: userProfile.photo_url,
              permissions: userProfile.permissions,
              class_section_id: userProfile.class_section_id || userProfile.classId
            }] : [],
            deleted: []
          }
        },
        timestamp
      };
    },
    pushChanges: async ({ changes }) => {
      // Push changes to backend
      // changes = { diary_entries: { created: [], updated: [], deleted: [] } }

      const { diary_entries } = changes as any;

      if (diary_entries) {
        // created
        for (const entry of diary_entries.created) {
          await api.post('/diary', entry);
        }
        // updated
        for (const entry of diary_entries.updated) {
          await api.put(`/diary/${entry.id}`, entry);
        }
        // deleted
        for (const id of diary_entries.deleted) {
          await api.delete(`/diary/${id}`);
        }
      }

      // Users are typically read-only or handled separately
    },
    // migrationsEnabledAtVersion: 1,
    sendCreatedAsUpdated: true
  });

  // Safety net only. Reconciliation above is what normally keeps the window exact;
  // this catches rows left behind when no successful pull has happened in a while
  // (offline, or no class resolved). It is deliberately a day more lenient than the
  // server's window so it can never delete a row the server still counts — that would
  // hold the two fingerprints permanently apart and re-trigger sync on every probe.
  const minYmd = diaryLocalCutoffYmd(1);
  await database.write(async () => {
    const diary = database.collections.get('diary_entries');
    const stale = await diary.query(Q.where('entry_date', Q.lt(minYmd))).fetch();
    await Promise.all(stale.map((row) => row.destroyPermanently()));
  });
}
