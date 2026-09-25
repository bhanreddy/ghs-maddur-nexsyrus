import type { Session } from '@supabase/supabase-js';
import { SecureTokenStore, getBackupRefreshToken } from './secureTokenStore';
import { AuthSession, ValidatedUser } from '../types/auth';
import { SCHOOL_ID } from '../constants/school';
import { disableFingerprintForAccount } from './biometricService';

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
 * STORAGE STRATEGY
 *   All vault blobs are persisted through `SecureTokenStore`, which chunks
 *   values into the native OS keychain/Keystore (AsyncStorage on web). A
 *   recovery credential matching the login method (email + password or the
 *   school-issued QR bearer payload) is kept so a revoked/expired refresh
 *   token can silently re-authenticate. It is used only when normal refresh-
 *   token rotation can no longer recover the session — never as the primary
 *   switch path.
 *
 *   Namespaced keys (clearly separated from the single-session keys
 *   `auth_session` / `supabase_session_enc` / `sb_secure_refresh_token`):
 *     - vault_accounts_v1          → the list of accounts
 *     - vault_active_user_id_v1    → the active-account pointer
 *     - vault_refresh_tokens_v1    → per-userId backup refresh-token MAP
 *     - vault_login_credentials_v1 → recovery credentials (all platforms)
 *     - vault_qr_credentials_v1    → per-userId QR recovery credentials
 *     - vault_migration_v1_done    → one-time migration flag
 *
 * Every value is wrapped in a `{ __vault: <marker> }` envelope so malformed,
 * foreign, or partially migrated data cannot be mistaken for a valid vault.
 */

// ── Namespaced storage keys ──────────────────────────────────────────────
const VAULT_ACCOUNTS_KEY = 'vault_accounts_v1';
const VAULT_ACTIVE_KEY = 'vault_active_user_id_v1';
const VAULT_REFRESH_MAP_KEY = 'vault_refresh_tokens_v1';
const VAULT_LOGIN_CREDENTIALS_KEY = 'vault_login_credentials_v1';
const VAULT_QR_CREDENTIALS_KEY = 'vault_qr_credentials_v1';
const VAULT_MIGRATION_FLAG_KEY = 'vault_migration_v1_done';

/** The existing single-session key written by authService (source for migration). */
const LEGACY_SESSION_KEY = 'auth_session';

// ── Public type ──────────────────────────────────────────────────────────
export interface VaultAccount {
  userId: string;
  displayName: string | null;
  photoUrl: string | null;
  admissionNo: string | null;
  /** Cached class label for quick-switch UI (e.g. "Class 10 · Sec A"). */
  classLabel?: string | null;
  /** Cached school name for quick-switch UI. */
  schoolName?: string | null;
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
export interface LoginRecoveryCredential {
  email: string;
  password: string;
  updatedAt: number;
}
interface LoginCredentialsEnvelope {
  // Keep the historic logical marker as the canonical format so credentials
  // written by older builds migrate without a schema break.
  __vault: 'login_credentials_v1';
  credentials: Record<string, LoginRecoveryCredential>;
}
export interface QrRecoveryCredential {
  qrPayload: string;
  updatedAt: number;
}
interface QrCredentialsEnvelope {
  __vault: 'qr_credentials_v1';
  credentials: Record<string, QrRecoveryCredential>;
}
interface InterimLoginCredentialsEnvelope {
  // Briefly used by a newer build. Read and migrate it so no update path loses
  // a credential merely because the envelope marker changed.
  __vault: 'credentials_v1';
  credentials: Record<string, LoginRecoveryCredential>;
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
async function _readLoginCredentials(): Promise<Record<string, LoginRecoveryCredential>> {
  const historic = await readEnvelope<LoginCredentialsEnvelope>(
    VAULT_LOGIN_CREDENTIALS_KEY,
    'login_credentials_v1'
  );
  if (historic?.credentials && typeof historic.credentials === 'object') {
    return Object.fromEntries(
      Object.entries(historic.credentials)
        .filter(([, value]) => value?.email && value?.password)
        .map(([userId, value]) => [
          userId,
          {
            email: value.email.trim().toLowerCase(),
            password: value.password,
            updatedAt: Number.isFinite(value.updatedAt)
              ? value.updatedAt
              : Date.now(),
          },
        ])
    );
  }

  const interim = await readEnvelope<InterimLoginCredentialsEnvelope>(
    VAULT_LOGIN_CREDENTIALS_KEY,
    'credentials_v1'
  );
  if (!interim?.credentials || typeof interim.credentials !== 'object') {
    return {};
  }

  const migrated = Object.fromEntries(
    Object.entries(interim.credentials)
      .filter(([, value]) => value?.email && value?.password)
      .map(([userId, value]) => [
        userId,
        {
          email: value.email.trim().toLowerCase(),
          password: value.password,
          updatedAt: Number.isFinite(value.updatedAt)
            ? value.updatedAt
            : Date.now(),
        },
      ])
  );
  await _writeLoginCredentials(migrated);
  return migrated;
}
async function _writeLoginCredentials(
  credentials: Record<string, LoginRecoveryCredential>
): Promise<void> {
  await writeEnvelope(VAULT_LOGIN_CREDENTIALS_KEY, {
    __vault: 'login_credentials_v1',
    credentials,
  });
}
async function _readQrCredentials(): Promise<Record<string, QrRecoveryCredential>> {
  const env = await readEnvelope<QrCredentialsEnvelope>(
    VAULT_QR_CREDENTIALS_KEY,
    'qr_credentials_v1'
  );
  if (!env?.credentials || typeof env.credentials !== 'object') return {};
  return Object.fromEntries(
    Object.entries(env.credentials)
      .filter(([, value]) => typeof value?.qrPayload === 'string' && value.qrPayload.trim())
      .map(([userId, value]) => [
        userId,
        {
          qrPayload: value.qrPayload.trim(),
          updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : Date.now(),
        },
      ])
  );
}
async function _writeQrCredentials(
  credentials: Record<string, QrRecoveryCredential>
): Promise<void> {
  await writeEnvelope(VAULT_QR_CREDENTIALS_KEY, {
    __vault: 'qr_credentials_v1',
    credentials,
  });
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

// ── Login credential recovery ────────────────────────────────────────────

/**
 * Save the one credential capable of rebuilding a revoked/expired refresh
 * session. Persisted via SecureTokenStore (Keystore/Keychain on native,
 * AsyncStorage on web) so account switching keeps working indefinitely
 * without asking the user to re-enter a password.
 */
export async function saveLoginRecoveryCredential(
  userId: string,
  email: string,
  password: string
): Promise<void> {
  if (!userId || !email || !password) return;
  await ensureMigrated();
  const credentials = await _readLoginCredentials();
  credentials[userId] = {
    email: email.trim().toLowerCase(),
    password,
    updatedAt: Date.now(),
  };
  await _writeLoginCredentials(credentials);
}

export async function getLoginRecoveryCredential(
  userId: string
): Promise<LoginRecoveryCredential | null> {
  if (!userId) return null;
  await ensureMigrated();
  const credentials = await _readLoginCredentials();
  const credential = credentials[userId];
  if (!credential?.email || !credential?.password) return null;
  return credential;
}

export async function removeLoginRecoveryCredential(userId: string): Promise<void> {
  if (!userId) return;
  await ensureMigrated();
  const credentials = await _readLoginCredentials();
  if (!(userId in credentials)) return;
  delete credentials[userId];
  await _writeLoginCredentials(credentials);
}

/**
 * Save the school-issued QR bearer credential as a last-resort session recovery
 * mechanism. Native builds keep it in the OS Keychain/Keystore through
 * SecureTokenStore. The payload is never placed inside VaultAccount metadata,
 * logs, or UI state after the scan completes.
 */
export async function saveQrRecoveryCredential(
  userId: string,
  qrPayload: string
): Promise<void> {
  if (!userId || !qrPayload?.trim()) return;
  await ensureMigrated();
  const credentials = await _readQrCredentials();
  credentials[userId] = {
    qrPayload: qrPayload.trim(),
    updatedAt: Date.now(),
  };
  await _writeQrCredentials(credentials);
}

export async function getQrRecoveryCredential(
  userId: string
): Promise<QrRecoveryCredential | null> {
  if (!userId) return null;
  await ensureMigrated();
  const credentials = await _readQrCredentials();
  const credential = credentials[userId];
  return credential?.qrPayload ? credential : null;
}

export async function removeQrRecoveryCredential(userId: string): Promise<void> {
  if (!userId) return;
  await ensureMigrated();
  const credentials = await _readQrCredentials();
  if (!(userId in credentials)) return;
  delete credentials[userId];
  await _writeQrCredentials(credentials);
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
  await removeLoginRecoveryCredential(userId);
  await removeQrRecoveryCredential(userId);
  // This is the single choke point for account removal (manual logout and the
  // "remove saved login" UI both reach it), so it is where the account's
  // fingerprint opt-in record is dropped. Scoped to this userId — siblings
  // keep their own opt-in.
  const biometricRemoved = await disableFingerprintForAccount(SCHOOL_ID, userId);
  if (!biometricRemoved && __DEV__) {
    console.warn('[accountVault] fingerprint cleanup failed for removed account');
  }
}

/** List all accounts in the vault (empty array if none). */
export async function listAccounts(): Promise<VaultAccount[]> {
  await ensureMigrated();
  return _readAccounts();
}

/**
 * Patch display metadata on a vaulted account (class / school labels for quick-switch UI).
 * No-ops if the account is not in the vault.
 */
export async function patchAccountMetadata(
  userId: string,
  meta: { classLabel?: string | null; schoolName?: string | null }
): Promise<void> {
  await ensureMigrated();
  const accounts = await _readAccounts();
  const idx = accounts.findIndex((a) => a.userId === userId);
  if (idx < 0) return;
  accounts[idx] = {
    ...accounts[idx],
    ...(meta.classLabel !== undefined ? { classLabel: meta.classLabel } : {}),
    ...(meta.schoolName !== undefined ? { schoolName: meta.schoolName } : {}),
  };
  await _writeAccounts(accounts);
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
