import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getApiBaseUrl } from './apiClient';
import * as accountVault from './accountVault';
import type { VaultAccount } from './accountVault';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SCHOOL_ID } from '../constants/school';

/**
 * pushFanout.ts — Phase 3a: register the device's single FCM token under EVERY
 * vaulted account so a parent receives notifications for all logged-in children,
 * regardless of which account is currently active.
 *
 * This module reads the vault to build a fan-out batch and writes per-account
 * token refreshes back into individual entries. It NEVER changes which account is
 * active, NEVER touches the active `auth_session` slot, and NEVER calls the live
 * global Supabase client or Phase 2's switch/suppression machinery.
 *
 * Phase 3b (added below) also owns explicit unregister-on-removal for a
 * BACKGROUNDED account — authenticating as that account via raw fetch, never via
 * apiClient (which would attach the active account's bearer). The active-account
 * removal path stays in useAuth.signOut() and is only refused here.
 */

/** Refresh ahead of true expiry so an about-to-expire token isn't sent stale. */
const EXPIRY_SKEW_SECONDS = 60;

/**
 * refreshAccessTokenStandalone — raw fetch to Supabase Auth's token endpoint,
 * completely bypassing the SDK's global client.
 *
 * INVARIANT 2 (proof, not claim): this function calls NO supabase.auth.* method.
 * It is a plain `fetch` to `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
 * so it cannot mutate the live client's session, cannot emit onAuthStateChange,
 * and cannot touch Phase 2's suppression counter / swap queue / auth_session key.
 * The caller is responsible for writing the result into ONE account's vault entry
 * — never the active-session slot.
 *
 * @returns { access_token, refresh_token, expires_at } or null on any failure.
 */
export async function refreshAccessTokenStandalone(
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string; expires_at: number } | null> {
  if (!refreshToken) return null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!resp.ok) {
      if (__DEV__) console.warn('[pushFanout] standalone refresh failed:', resp.status);
      return null;
    }

    const data: any = await resp.json();
    if (!data?.access_token || !data?.refresh_token) return null;

    const nowS = Math.floor(Date.now() / 1000);
    const expires_at =
      typeof data.expires_at === 'number'
        ? data.expires_at
        : typeof data.expires_in === 'number'
        ? nowS + data.expires_in
        : 0;

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at,
    };
  } catch (e) {
    if (__DEV__) console.warn('[pushFanout] standalone refresh error:', e);
    return null;
  }
}

/**
 * ensureFreshAccessTokens — for every vaulted account, return { userId, accessToken }
 * with a usable access token, refreshing in place when the stored token is expired
 * or within EXPIRY_SKEW_SECONDS of expiry. This is the shared primitive behind both
 * the push fan-out batch and the unread-counts batch.
 *
 * Behavior + side effects are exactly the original buildFanOutBatch loop:
 *   - staleness check (expired / near-expiry / missing token → refresh);
 *   - refresh via refreshAccessTokenStandalone using that account's OWN refresh
 *     token (falling back to the per-userId backup map);
 *   - on success, write the new tokens back into ONLY that account's vault entry
 *     via accountVault.addAccount (in-place upsert — never touches the active
 *     pointer or the active auth_session slot);
 *   - on failure (dead/revoked token), keep the stale stored token (empty string
 *     if none) and log loudly.
 *
 * Returns exactly one entry per vaulted account, in vault order.
 */
export async function ensureFreshAccessTokens(): Promise<{ userId: string; accessToken: string }[]> {
  const accounts = await accountVault.listAccounts();
  const nowS = Math.floor(Date.now() / 1000);
  const result: { userId: string; accessToken: string }[] = [];

  for (const acct of accounts) {
    let accessToken = acct.supabaseSession?.access_token ?? '';
    const expiresAt = acct.supabaseSession?.expires_at ?? 0; // epoch seconds
    const needsRefresh = !accessToken || !expiresAt || expiresAt <= nowS + EXPIRY_SKEW_SECONDS;

    if (needsRefresh) {
      const refreshToken =
        acct.supabaseSession?.refresh_token ??
        (await accountVault.getBackupRefreshTokenForUser(acct.userId)) ??
        '';
      const refreshed = refreshToken ? await refreshAccessTokenStandalone(refreshToken) : null;

      if (refreshed) {
        accessToken = refreshed.access_token;
        // Write ONLY this account's entry back. addAccount upserts by userId and
        // does NOT touch the active pointer or the active auth_session slot.
        const updated: VaultAccount = {
          ...acct,
          supabaseSession: {
            ...acct.supabaseSession,
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            expires_at: refreshed.expires_at,
            expires_in: Math.max(0, refreshed.expires_at - nowS),
          },
        };
        await accountVault.addAccount(updated);
      } else if (__DEV__) {
        // Could not refresh (e.g. dead/revoked refresh token). Callers keep the
        // (stale) stored token; the backend reports a per-account reason.
        console.warn(
          `[pushFanout] could not refresh account ${acct.userId}; using stored token as-is (backend will report).`
        );
      }
    }

    result.push({ userId: acct.userId, accessToken });
  }

  return result;
}

/**
 * buildFanOutBatch — push-registration batch: exactly one `{ accessToken }` per
 * vaulted account, in vault order (empty string for an account with no usable
 * token), so the backend's same-order `results` map cleanly back to accounts.
 *
 * Thin adapter over ensureFreshAccessTokens — identical output ordering, identical
 * side effects (the refresh + vault write-backs happen inside ensureFreshAccessTokens,
 * exactly as the original inline loop did).
 */
export async function buildFanOutBatch(): Promise<{ accessToken: string }[]> {
  const fresh = await ensureFreshAccessTokens();
  return fresh.map(({ accessToken }) => ({ accessToken }));
}

/**
 * registerAllVaultedAccountsForPush — build the batch and POST it to the backend
 * fan-out endpoint, logging any per-account failure loudly. Never auto-removes
 * anything from the vault (Phase 3b owns removal/unregistration).
 */
export async function registerAllVaultedAccountsForPush(fcmToken: string): Promise<void> {
  if (!fcmToken) {
    if (__DEV__) console.warn('[pushFanout] no fcmToken provided; skipping fan-out');
    return;
  }

  // Capture labels (display/userId) in vault order BEFORE building the batch so
  // we can map the same-order `results` back to accounts for logging.
  const accountsBefore = await accountVault.listAccounts();
  if (accountsBefore.length === 0) {
    if (__DEV__) console.log('[pushFanout] vault empty; nothing to register');
    return;
  }

  const batch = await buildFanOutBatch();

  let languageCode = 'en';
  try {
    languageCode = (await AsyncStorage.getItem('appLanguage')) || 'en';
  } catch {
    /* default 'en' */
  }

  try {
    const resp = await api.post<any>(
      '/notifications/register-multi',
      {
        fcmToken,
        accounts: batch,
        platform: Platform.OS,
        language_code: languageCode,
      },
      { silent: true }
    );

    // apiClient unwraps the { success, school_id, data } envelope → resp === data.
    const results: Array<{ success?: boolean; userId?: string; reason?: string }> =
      resp?.results ?? resp?.data?.results ?? [];

    let okCount = 0;
    results.forEach((r, i) => {
      const acct = accountsBefore[i];
      const label = acct?.displayName || acct?.userId || `#${i}`;
      if (r?.success) {
        okCount += 1;
        if (__DEV__) console.log(`[pushFanout] registered ${label} (${r.userId})`);
      } else {
        // Expected when a background account's saved refresh token is dead.
        console.warn(
          `[pushFanout] FAN-OUT FAILED for account "${label}": ${r?.reason || 'unknown'} ` +
            `— account NOT removed from vault (removal is Phase 3b).`
        );
      }
    });

    if (__DEV__) {
      console.log(`[pushFanout] fan-out complete: ${okCount}/${batch.length} accounts registered`);
    }
  } catch (e) {
    console.error('[pushFanout] register-multi request failed:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 3b — unregister-on-removal for a BACKGROUNDED (non-active) account.
//
// The whole reason this lives here as raw fetches (NOT apiClient): apiClient
// attaches the ACTIVE account's bearer + auto-injects school_id. To unregister a
// *backgrounded* account we must authenticate as THAT account — so we build the
// requests by hand with that account's own token, replicating exactly what
// apiClient does for school_id (inject the compile-time SCHOOL_ID into the POST
// body) and for the host (reusing apiClient's exported getApiBaseUrl()).
//
// PROOF OBLIGATION (invariant 2): nothing below calls a supabase.auth.* method,
// touches the live Supabase client, the active session/auth_session slot, the
// active pointer, switchAccount, or anything that emits onAuthStateChange. The
// only network calls are bare `fetch`es; the only vault writes happen in the
// caller's final accountVault.removeAccount(), which — for a backgrounded account
// (userId !== active) — does NOT mutate the active pointer.
// ─────────────────────────────────────────────────────────────────────────

/**
 * unregisterVaultedAccountStandalone — best-effort backend cleanup for ONE
 * specific (backgrounded) account, authenticating as that account via raw fetch.
 * Each of (a)/(b)/(c) is independently best-effort: logs loudly on failure,
 * never throws, never lets one step block another. Does NOT remove the account
 * from the local vault — that is the caller's responsibility and must run
 * regardless of what happens here.
 */
export async function unregisterVaultedAccountStandalone(account: VaultAccount): Promise<void> {
  // (a) Ensure a usable access token for THIS account — same staleness check +
  //     standalone refresh pattern as buildFanOutBatch (using this account's OWN
  //     refresh token). We do NOT write a refreshed token back to the vault: the
  //     account is about to be removed.
  const nowS = Math.floor(Date.now() / 1000);
  let accessToken = account.supabaseSession?.access_token ?? '';
  const expiresAt = account.supabaseSession?.expires_at ?? 0;
  const needsRefresh = !accessToken || !expiresAt || expiresAt <= nowS + EXPIRY_SKEW_SECONDS;

  if (needsRefresh) {
    const refreshToken =
      account.supabaseSession?.refresh_token ??
      (await accountVault.getBackupRefreshTokenForUser(account.userId)) ??
      '';
    const refreshed = refreshToken ? await refreshAccessTokenStandalone(refreshToken) : null;
    if (refreshed) {
      accessToken = refreshed.access_token;
    } else {
      // Dead/revoked refresh token — can't authenticate as this account. Skip the
      // backend unregister + Supabase revoke. The caller STILL removes it locally.
      console.warn(
        `[pushFanout] unregister: no usable token for ${account.userId} (dead/revoked refresh token) — ` +
          `skipping backend unregister + Supabase revoke; local vault removal still proceeds.`
      );
      return;
    }
  }

  // (b) Raw fetch to the backend /notifications/unregister as THIS account.
  //     - Authorization: this account's bearer (so the route's req.user.id, and
  //       therefore the DELETE WHERE user_id = ..., resolves to THIS account).
  //     - Body school_id: the compile-time SCHOOL_ID, exactly as apiClient injects
  //       (the route's requireSchoolId reads it from req.body).
  //     - fcm_token: the device's currently cached token (same source as notificationManager).
  try {
    const fcmToken =
      (await AsyncStorage.getItem('last_fcm_token')) ||
      (await AsyncStorage.getItem('fcm_token_last_synced'));
    if (fcmToken) {
      const resp = await fetch(`${getApiBaseUrl()}/notifications/unregister`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ school_id: String(SCHOOL_ID), fcm_token: fcmToken }),
      });
      if (!resp.ok) {
        console.warn(
          `[pushFanout] unregister: backend /notifications/unregister returned ${resp.status} for ${account.userId}`
        );
      }
    } else if (__DEV__) {
      console.log('[pushFanout] unregister: no cached FCM token; nothing to unregister on the backend');
    }
  } catch (e) {
    console.warn(`[pushFanout] unregister: backend /notifications/unregister failed for ${account.userId}:`, e);
  }

  // (c) Revoke THIS account's Supabase session — raw fetch to the Auth REST
  //     endpoint with this account's bearer (zero SDK, same technique as
  //     refreshAccessTokenStandalone). Default scope mirrors the active-account
  //     sign-out (supabase.auth.signOut() with no scope = global), so an
  //     explicitly removed account doesn't leave a live refresh token server-side.
  //     (If per-device-only revoke is ever wanted, the lever is `?scope=local`.)
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!resp.ok && __DEV__) {
      console.warn(`[pushFanout] unregister: Supabase logout returned ${resp.status} for ${account.userId}`);
    }
  } catch (e) {
    console.warn(`[pushFanout] unregister: Supabase logout failed for ${account.userId}:`, e);
  }
}

/**
 * removeVaultedAccount — public entry point Phase 4's "Remove account" UI will
 * call. Routes by active vs backgrounded:
 *   - not in vault → warn + no-op.
 *   - the ACTIVE account → REFUSE (do not remove here). Active-account removal
 *     must go through useAuth.signOut(), which already does the correct
 *     unregister-via-live-bearer + global Supabase revoke + local vault removal.
 *     We refuse rather than delegate because pushFanout is a service module and
 *     importing the useAuth React hook here would be a layering inversion AND a
 *     circular import (useAuth → notificationManager → pushFanout). Phase 4's UI,
 *     which already holds useAuth, is responsible for calling signOut() instead.
 *   - a BACKGROUNDED account → best-effort standalone backend cleanup, THEN
 *     unconditional local vault removal (invariant 4: local removal runs even if
 *     every backend call failed).
 */
export async function removeVaultedAccount(userId: string): Promise<void> {
  const accounts = await accountVault.listAccounts();
  const account = accounts.find((a) => a.userId === userId);
  if (!account) {
    if (__DEV__) console.warn(`[pushFanout] removeVaultedAccount: ${userId} not in vault — no-op`);
    return;
  }

  const activeId = await accountVault.getActiveAccountId();
  if (userId === activeId) {
    console.warn(
      `[pushFanout] removeVaultedAccount: ${userId} is the ACTIVE account — refusing. ` +
        `Route active-account removal through useAuth.signOut() (it handles unregister + ` +
        `Supabase revoke + local removal for the active account). Nothing removed here.`
    );
    return;
  }

  // Backgrounded account: best-effort backend cleanup first…
  try {
    await unregisterVaultedAccountStandalone(account);
  } catch (e) {
    // unregisterVaultedAccountStandalone is already internally best-effort, but
    // guard anyway so nothing can stop the local removal below.
    console.warn(`[pushFanout] removeVaultedAccount: standalone unregister threw for ${userId} (continuing):`, e);
  }

  // …then ALWAYS remove locally (invariant 4). For a backgrounded account this
  // never touches the active pointer (accountVault.removeAccount only clears it
  // when the removed id === active, which it is not here).
  await accountVault.removeAccount(userId);
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 4a — per-account unread-count badges (notifications only).
// ─────────────────────────────────────────────────────────────────────────
//
// Phase 4a-continued (CASE B): The original product concept included a separate
// "chat unread count" badge alongside notifications. No chat/messaging feature
// exists in the codebase to back it — this helper reflects notifications only
// via POST /notifications/unread-counts. Revisit when/if a chat feature is built
// (extend the endpoint response and the return type here).
//
// Phase 4b UI contract (no UI exists yet): render the notification badge only
// when count > 0 — standard zero-state badge behavior, not a workaround.

/**
 * getUnreadCountsForAllVaultedAccounts — fetch the unread notification count for
 * EVERY vaulted account (the switcher's per-account badges). Builds the batch via
 * the shared ensureFreshAccessTokens() (no userId is ever sent — identity is
 * derived server-side per token, same as register-multi), POSTs to the read-only
 * /notifications/unread-counts endpoint, and maps the same-order results back into
 * a userId→count record. Accounts whose token failed are omitted from the record
 * (logged loudly, never thrown).
 *
 * Uses apiClient here (unlike the standalone-fetch paths): this batches the ACTIVE
 * device's request and the per-account identity is still derived solely from each
 * body token by the backend, so the active account's bearer being attached by
 * apiClient is harmless.
 */
export async function getUnreadCountsForAllVaultedAccounts(): Promise<Record<string, number>> {
  const fresh = await ensureFreshAccessTokens();
  const counts: Record<string, number> = {};
  if (fresh.length === 0) return counts;

  try {
    const resp = await api.post<any>(
      '/notifications/unread-counts',
      { accounts: fresh.map(({ accessToken }) => ({ accessToken })) },
      { silent: true }
    );

    // apiClient unwraps the { success, school_id, data } envelope → resp === data.
    const results: Array<{ success?: boolean; userId?: string; count?: number; reason?: string }> =
      resp?.results ?? resp?.data?.results ?? [];

    // Map by index (same-order contract), keyed on OUR userId so a failure entry
    // (which may omit userId) is still attributable for logging.
    results.forEach((r, i) => {
      const userId = fresh[i]?.userId;
      if (!userId) return;
      if (r?.success && typeof r.count === 'number') {
        counts[userId] = r.count;
      } else {
        console.warn(
          `[pushFanout] unread-counts FAILED for ${userId}: ${r?.reason || 'unknown'} — omitted from badge map.`
        );
      }
    });
  } catch (e) {
    console.error('[pushFanout] unread-counts request failed:', e);
  }

  return counts;
}
