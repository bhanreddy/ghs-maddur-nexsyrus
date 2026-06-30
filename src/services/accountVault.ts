import type { Session } from '@supabase/supabase-js';
import { SecureTokenStore, getBackupRefreshToken } from './secureTokenStore';
import { AuthSession, ValidatedUser } from '../types/auth';

/**
 * accountVault.ts — Phase 1 multi-account ("Instagram-style") session vault.
 *
 * PURPOSE
 *   Provide additive, multi-session storage *underneath* the existing
 *   single-session Supabase client. A user who never adds a second account
 *   is transparently "a vault of one" — there is ZERO behaviour change for
 *   them. No switching, no setSession, no FCM, no useAuth changes happen here
 *   — those are later phases and are out of scope.
 *
 * STORAGE STRATEGY (reusing existing crypto — no new crypto introduced)
 *   All vault blobs are persisted through the existing `SecureTokenStore`
 *   adapter (which encrypts via the SecureStore-backed key). We do NOT import
 *   the private encrypt/decrypt helpers (they are not exported); routing through
 *   SecureTokenStore.getItem/setItem reuses the exact same primitives.
 *
 *   Namespaced keys (clearly separated from the single-session keys
 *   `auth_session` / `supabase_session_enc` / `sb_secure_refresh_token`):
 *     - vault_accounts_v1          → the list of accounts
 *     - vault_active_user_id_v1    → the active-account pointer
 *     - vault_refresh_tokens_v1    → per-userId backup refresh-token MAP
 *     - vault_migration_v1_done    → one-time migration flag
 *
 * TWO ADAPTER QUIRKS THIS MODULE DEFENDS AGAINST
 *   1. SecureTokenStore.getItem() returns a synthetic `{refresh_token:...}`
 *      JSON as a last resort when a key is missing. Every value we store is
 *      wrapped in a `{ __vault: <marker> }` envelope, and reads reject any
 *      payload lacking the matching marker — so that fallback can never be
 *      mistaken for vault data.
 *   2. SecureTokenStore.removeItem() calls clearBackupRefreshToken(), which
 *      deletes the ACTIVE account's `sb_secure_refresh_token`. We therefore
 *      NEVER call removeItem for vault keys — "delete" overwrites with an
 *      empty envelope instead.
 */

// ── Namespaced storage keys ──────────────────────────────────────────────
const VAULT_ACCOUNTS_KEY = 'vault_accounts_v1';
const VAULT_ACTIVE_KEY = 'vault_active_user_id_v1';
const VAULT_REFRESH_MAP_KEY = 'vault_refresh_tokens_v1';
const VAULT_LOGIN_CREDENTIALS_KEY = 'vault_login_credentials_v1';
const VAULT_MIGRATION_FLAG_KEY = 'vault_migration_v1_done';

/** The existing single-session key written by authService (source for migration). */
const LEGACY_SESSION_KEY = 'auth_session';

// ── Public type ──────────────────────────────────────────────────────────
export interface VaultAccount {
  userId: string;
  displayName: string | null;
  photoUrl: string | null;
  admissionNo: string | null;
  /** Full Supabase session (access + refresh tokens, expiry, user). */
  supabaseSession: Session;
  /** Backend-validated user profile. */
  validatedUser: ValidatedUser;
}

// ── Envelope types (marker guards against the adapter's synthetic fallback) ──
interface AccountsEnvelope {
  __vault: 'accounts_v1';
  accounts: VaultAccount[];
}
interface ActiveEnvelope {
  __vault: 'active_v1';
  activeUserId: string | null;
}
interface RefreshMapEnvelope {
  __vault: 'refresh_v1';
  tokens: Record<string, string>;
}
interface LoginCredentialsEnvelope {
  __vault: 'login_credentials_v1';
  credentials: Record<string, { email: string; password: string }>;
}
interface MigrationEnvelope {
  __vault: 'migration_v1';
  done: boolean;
}

// ── Low-level envelope read/write (NO migration trigger — used internally) ──
async function readEnvelope<T extends { __vault: string }>(
  key: string,
  marker: T['__vault']
): Promise<T | null> {
  try {
    const raw = await SecureTokenStore.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Reject the adapter's synthetic `{refresh_token}` fallback and any
    // legacy/foreign blob that lacks our marker.
    if (!parsed || parsed.__vault !== marker) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

async function writeEnvelope(key: string, value: object): Promise<void> {
  // SecureTokenStore.setItem encrypts and (harmlessly) tries to extract a
  // top-level `refresh_token` for its own backup — our envelopes have none at
  // the top level, so the active account's single backup token is never
  // overwritten by a vault write.
  await SecureTokenStore.setItem(key, JSON.stringify(value));
}

// ── Internal accessors (no migration side effects) ───────────────────────
async function _readAccounts(): Promise<VaultAccount[]> {
  const env = await readEnvelope<AccountsEnvelope>(VAULT_ACCOUNTS_KEY, 'accounts_v1');
  return Array.isArray(env?.accounts) ? env!.accounts : [];
}
async function _writeAccounts(accounts: VaultAccount[]): Promise<void> {
  await writeEnvelope(VAULT_ACCOUNTS_KEY, { __vault: 'accounts_v1', accounts });
}
async function _readActive(): Promise<string | null> {
  const env = await readEnvelope<ActiveEnvelope>(VAULT_ACTIVE_KEY, 'active_v1');
  return env?.activeUserId ?? null;
}
async function _writeActive(activeUserId: string | null): Promise<void> {
  await writeEnvelope(VAULT_ACTIVE_KEY, { __vault: 'active_v1', activeUserId });
}
async function _readRefreshMap(): Promise<Record<string, string>> {
  const env = await readEnvelope<RefreshMapEnvelope>(VAULT_REFRESH_MAP_KEY, 'refresh_v1');
  return env?.tokens && typeof env.tokens === 'object' ? env.tokens : {};
}
async function _writeRefreshMap(tokens: Record<string, string>): Promise<void> {
  await writeEnvelope(VAULT_REFRESH_MAP_KEY, { __vault: 'refresh_v1', tokens });
}
async function _readLoginCredentials(): Promise<Record<string, { email: string; password: string }>> {
  const env = await readEnvelope<LoginCredentialsEnvelope>(VAULT_LOGIN_CREDENTIALS_KEY, 'login_credentials_v1');
  return env?.credentials && typeof env.credentials === 'object' ? env.credentials : {};
}
async function _writeLoginCredentials(
  credentials: Record<string, { email: string; password: string }>
): Promise<void> {
  await writeEnvelope(VAULT_LOGIN_CREDENTIALS_KEY, { __vault: 'login_credentials_v1', credentials });
}
async function _readMigrationFlag(): Promise<boolean> {
  const env = await readEnvelope<MigrationEnvelope>(VAULT_MIGRATION_FLAG_KEY, 'migration_v1');
  return env?.done === true;
}
async function _writeMigrationFlag(done: boolean): Promise<void> {
  await writeEnvelope(VAULT_MIGRATION_FLAG_KEY, { __vault: 'migration_v1', done });
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a VaultAccount from a fully-formed AuthSession (single source of mapping). */
export function buildVaultAccount(session: AuthSession): VaultAccount {
  const u = session.validatedUser;
  return {
    userId: u.userId,
    displayName: u.displayName ?? u.display_name ?? null,
    photoUrl: u.photoUrl ?? null,
    admissionNo: u.admission_no ?? null,
    supabaseSession: session.supabaseSession,
    validatedUser: u,
  };
}

// ── One-time migration ───────────────────────────────────────────────────
//
// Converts pre-existing single-session storage into the vault and turns the
// single backup refresh token into the per-userId map. Idempotent: a persisted
// flag short-circuits future runs, and an in-memory promise de-dupes
// concurrent calls within a process. Safe to call on every app boot:
//   - never had a session            → no-op, marks done
//   - already migrated               → flag short-circuits
//   - has a live single session      → migrates it once
//
// NOTE: This is exported so a later phase can wire it explicitly at app boot
// (before any auth check). In Phase 1 it is also invoked lazily by every public
// vault operation, so pre-existing users are migrated on first vault access
// without us having to touch useAuth/_layout (out of scope for this phase).
let migrationPromise: Promise<void> | null = null;

export async function runVaultMigrationIfNeeded(): Promise<void> {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    try {
      if (await _readMigrationFlag()) return; // already migrated on this install

      // Read the existing single-session blob (written by authService via
      // SecureTokenStore.setItem('auth_session', ...)).
      let migratedAccount: VaultAccount | null = null;
      const legacyRaw = await SecureTokenStore.getItem(LEGACY_SESSION_KEY);
      if (legacyRaw) {
        try {
          const legacy = JSON.parse(legacyRaw) as AuthSession;
          // Guard against the adapter's synthetic `{refresh_token}` fallback:
          // a real session must carry a validated user + supabase session.
          if (legacy?.validatedUser?.userId && legacy?.supabaseSession) {
            migratedAccount = buildVaultAccount(legacy);
          }
        } catch {
          /* malformed legacy blob — treat as nothing to migrate */
        }
      }

      if (migratedAccount) {
        // Upsert into accounts (idempotent — dedupe by userId).
        const accounts = await _readAccounts();
        if (!accounts.some((a) => a.userId === migratedAccount!.userId)) {
          accounts.push(migratedAccount);
          await _writeAccounts(accounts);
        }

        // Seed the active pointer only if not already set.
        if (!(await _readActive())) {
          await _writeActive(migratedAccount.userId);
        }

        // Convert the single backup refresh token → per-userId map entry.
        const tokens = await _readRefreshMap();
        const token =
          migratedAccount.supabaseSession?.refresh_token ||
          (await getBackupRefreshToken()) ||
          null;
        if (token && !tokens[migratedAccount.userId]) {
          tokens[migratedAccount.userId] = token;
          await _writeRefreshMap(tokens);
        }
      }

      await _writeMigrationFlag(true);
      if (__DEV__) {
        console.log(
          `[accountVault] migration complete (migrated=${migratedAccount ? 1 : 0} account)`
        );
      }
    } catch (e) {
      // On failure, allow a retry on the next call (don't cache a failed run).
      if (__DEV__) console.error('[accountVault] migration failed:', e);
      migrationPromise = null;
      throw e;
    }
  })();

  return migrationPromise;
}

/** Lazy guard so any public op runs migration first (idempotent). */
async function ensureMigrated(): Promise<void> {
  try {
    await runVaultMigrationIfNeeded();
  } catch {
    /* migration errors must never block vault reads/writes */
  }
}

// ── Per-userId backup refresh-token map (invariant 4) ────────────────────
export async function setBackupRefreshTokenForUser(
  userId: string,
  token: string
): Promise<void> {
  await ensureMigrated();
  const tokens = await _readRefreshMap();
  tokens[userId] = token;
  await _writeRefreshMap(tokens);
}

export async function getBackupRefreshTokenForUser(
  userId: string
): Promise<string | null> {
  await ensureMigrated();
  const tokens = await _readRefreshMap();
  return tokens[userId] ?? null;
}

export async function removeBackupRefreshTokenForUser(userId: string): Promise<void> {
  await ensureMigrated();
  const tokens = await _readRefreshMap();
  if (userId in tokens) {
    delete tokens[userId];
    await _writeRefreshMap(tokens);
  }
}

export async function setLoginCredentialsForUser(
  userId: string,
  email: string,
  password: string
): Promise<void> {
  await ensureMigrated();
  if (!userId || !email || !password) return;
  const credentials = await _readLoginCredentials();
  credentials[userId] = { email, password };
  await _writeLoginCredentials(credentials);
}

export async function getLoginCredentialsForUser(
  userId: string
): Promise<{ email: string; password: string } | null> {
  await ensureMigrated();
  const credentials = await _readLoginCredentials();
  return credentials[userId] ?? null;
}

export async function removeLoginCredentialsForUser(userId: string): Promise<void> {
  await ensureMigrated();
  const credentials = await _readLoginCredentials();
  if (userId in credentials) {
    delete credentials[userId];
    await _writeLoginCredentials(credentials);
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────

/**
 * Add (or upsert) an account into the vault.
 * Does NOT change the active pointer — the caller decides that.
 * Also records the account's refresh token into the per-userId backup map.
 */
export async function addAccount(account: VaultAccount): Promise<void> {
  await ensureMigrated();
  const accounts = await _readAccounts();
  const idx = accounts.findIndex((a) => a.userId === account.userId);
  if (idx >= 0) {
    accounts[idx] = account; // refresh stored session/profile
  } else {
    accounts.push(account);
  }
  await _writeAccounts(accounts);

  const refresh = account.supabaseSession?.refresh_token;
  if (refresh) {
    const tokens = await _readRefreshMap();
    tokens[account.userId] = refresh;
    await _writeRefreshMap(tokens);
  }
}

/**
 * Remove an account from the vault entirely. If it was the active account, the
 * pointer is cleared to null — we deliberately do NOT auto-select a replacement
 * active account, because choosing what becomes active next is a Phase 4 UX
 * decision (out of scope here). Also drops its backup refresh token.
 * (Uses overwrite-with-empty semantics — never removeItem.)
 */
export async function removeAccount(userId: string): Promise<void> {
  await ensureMigrated();
  const accounts = await _readAccounts();
  const next = accounts.filter((a) => a.userId !== userId);
  await _writeAccounts(next);

  const active = await _readActive();
  if (active === userId) {
    // Clear the pointer; never fall back to a sibling (Phase 4 decides next active).
    await _writeActive(null);
  }

  await removeBackupRefreshTokenForUser(userId);
  await removeLoginCredentialsForUser(userId);
}

/** List all accounts in the vault (empty array if none). */
export async function listAccounts(): Promise<VaultAccount[]> {
  await ensureMigrated();
  return _readAccounts();
}

/** Return the currently-active account, or null. */
export async function getActiveAccount(): Promise<VaultAccount | null> {
  await ensureMigrated();
  const active = await _readActive();
  if (!active) return null;
  const accounts = await _readAccounts();
  return accounts.find((a) => a.userId === active) ?? null;
}

/** Return just the active-account id pointer, or null. */
export async function getActiveAccountId(): Promise<string | null> {
  await ensureMigrated();
  return _readActive();
}

/**
 * Update the active-account pointer ONLY.
 * Does NOT call supabase.auth.setSession — switching the live Supabase session
 * is Phase 2 and is out of scope here. No-ops (with a warning) if the userId is
 * not present in the vault, to avoid a dangling pointer.
 */
export async function setActiveAccountId(userId: string): Promise<void> {
  await ensureMigrated();
  const accounts = await _readAccounts();
  if (!accounts.some((a) => a.userId === userId)) {
    if (__DEV__) {
      console.warn(
        `[accountVault] setActiveAccountId: ${userId} not in vault — pointer unchanged`
      );
    }
    return;
  }
  await _writeActive(userId);
}
