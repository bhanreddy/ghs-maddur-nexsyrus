import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../services/supabaseConfig';
import { AuthService, clearAuthState, isInternalSessionSwap } from '../services/authService';
import { AuthSession, ValidatedUser } from '../types/auth';
import { SCHOOL_ID } from '../constants/school';
import { registerLogoutCallback } from '../services/apiClient';
import { isStudentRole, isPersistentSessionRole } from '../utils/roleHelpers';
import { getBackupRefreshToken, clearBackupRefreshToken } from '../services/secureTokenStore';
import { SessionPolicy } from '../services/sessionPolicyService';
import { notificationManager } from '../services/notificationManager';
import * as accountVault from '../services/accountVault';

interface AuthContextType {
  session: AuthSession | null;
  loading: boolean;
  user: ValidatedUser | null;
  role: string | null;
  isStudent: boolean;
  schoolId: number | null;

  signIn: typeof AuthService.signIn;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  /** Phase 2 — seamlessly switch the live + active account (no password prompt). */
  switchAccount: (userId: string) => Promise<{ session?: AuthSession; error?: string }>;
  /** Phase 1/2 — add another account to the vault; active account stays unchanged. */
  addAccount: (email: string, password: string) => Promise<{ session?: AuthSession; error?: string }>;
  authChecked: boolean;
  isAppLocked?: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  user: null,
  role: null,
  isStudent: false,
  schoolId: null,

  signIn: async () => ({ error: 'Not initialized' }),
  signOut: async () => {},
  refreshSession: async () => {},
  switchAccount: async () => ({ error: 'Not initialized' }),
  addAccount: async () => ({ error: 'Not initialized' }),
  authChecked: false,
  isAppLocked: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  const backoffDelay = useRef(1000); // Start at 1s
  const justSignedIn = useRef(false); // Guard against TOKEN_REFRESHED race after sign-in
  // Raised only during an explicit user-initiated signOut(). The Supabase
  // SIGNED_OUT event also fires when a refresh token is rejected — we must NOT
  // honor that for persistent roles, only when the user actually tapped Logout.
  const manualSignOut = useRef(false);
  const sessionRef = useRef<AuthSession | null>(null);
  sessionRef.current = session;

  const user = session?.validatedUser || null;
  const role = user?.role?.code || null;
  const isStudent = isStudentRole(role);
  const schoolId = user ? SCHOOL_ID : null;

  const signOut = async () => {
    console.log('[AUTH_OUT]', 'manual_logout', new Date().toISOString());
    // Mark this as a deliberate logout so the onAuthStateChange SIGNED_OUT
    // handler is allowed to clear state. Reset shortly after the supabase
    // signOut()'s event has been processed.
    manualSignOut.current = true;
    setTimeout(() => { manualSignOut.current = false; }, 5000);
    setLoading(true);
    // Capture the signing-out account's userId BEFORE the session is cleared —
    // this is the exact key the vault is stored under (buildVaultAccount uses
    // validatedUser.userId). sessionRef.current is always the latest session
    // (the 401 logout-callback closure may otherwise be stale).
    const signingOutUserId = sessionRef.current?.validatedUser?.userId ?? null;

    // Phase 3a stopgap (two independent, best-effort cleanups — each in its own
    // try/catch so a failure in one never skips the other, and neither blocks logout):
    //
    //  (1) Remove THIS account's push-token registration from the backend. The
    //      /notifications/unregister route derives user_id from the bearer and
    //      deletes WHERE user_id = <this user> AND fcm_token — siblings untouched.
    //      Must run BEFORE AuthService.signOut() clears the session, else there is
    //      no bearer and the DELETE is skipped.
    //
    //  (2) Remove THIS account from the local vault entirely. Without this, a later
    //      fan-out re-trigger (cold start / FCM rotation / addAccount) would rebuild
    //      the registration we just deleted in (1), because the signed-out account
    //      would still be sitting in the vault. removeAccount() is scoped to this one
    //      userId only — never the whole vault, never siblings.
    //
    // This is intentionally NARROWER than full Phase 3b (account-removal UX): it just
    // means "this device is no longer logged into this specific account at all". Wired
    // ONLY here — never in switchAccount/addAccount, which stay purely additive.
    try {
      await notificationManager.unregisterPushToken();
    } catch (e) {
      if (__DEV__) console.warn('[useAuth] push unregister on sign-out failed (non-fatal):', e);
    }
    if (signingOutUserId) {
      try {
        await accountVault.removeAccount(signingOutUserId);
      } catch (e) {
        if (__DEV__) console.warn('[useAuth] vault removeAccount on sign-out failed (non-fatal):', e);
      }
    }

    await AuthService.signOut();
    // Clear student backup keys on explicit sign-out
    await clearBackupRefreshToken();
    setSession(null);

    setLoading(false);
  };

  // Persistent roles (parent/student, admin, driver, staff) NEVER auto-logout on
  // a failed refresh — they retry forever with capped backoff and keep the
  // cached session untouched. Only `accountant` (Accounts dept) is cleared after
  // a few retries, preserving its school-hours restriction. See
  // isPersistentSessionRole().
  const handleRefreshFailure = (currentRole: string | null) => {
    if (isPersistentSessionRole(currentRole)) {
      // Infinite retry, capped at 60s. Session is preserved untouched.
      const nextDelay = Math.min(backoffDelay.current * 2, 60000);
      backoffDelay.current = nextDelay;
      console.warn(`[useAuth] Refresh failed for persistent role "${currentRole}". Retrying in ${nextDelay}ms (session preserved, no logout)...`);
      setTimeout(() => handleRefresh(currentRole), nextDelay);
    } else if (backoffDelay.current <= 4000) {
      // accountant: retry a few times, then clear.
      const nextDelay = backoffDelay.current * 2;
      backoffDelay.current = nextDelay;
      console.warn(`[useAuth] Refresh failed for "${currentRole}". Retrying in ${nextDelay}ms...`);
      setTimeout(() => handleRefresh(currentRole), nextDelay);
    } else {
      // Retries exhausted for non-persistent role — clear session.
      void (async () => {
        await clearAuthState();
        setSession(null);
        backoffDelay.current = 1000; // Reset for next login
      })();
    }
  };

  // Core refresh logic invoked internally or explicitly.
  const handleRefresh = async (currentRole: string | null) => {
    try {
      const newSession = await AuthService.refreshSession();
      if (newSession) {
        setSession(newSession);
        backoffDelay.current = 1000; // Reset on success
      } else {
        // Refresh returned null — could be transient or fatal.
        // AuthService.refreshSession already differentiates: it only returns
        // null after clearing auth state for fatal errors OR on transient
        // failures where no prior session exists.
        handleRefreshFailure(currentRole);
      }
    } catch {
      handleRefreshFailure(currentRole);
    }
  };

  useEffect(() => {
    // Register the API client's logout callback so 401 Unauthorized triggers logout
    registerLogoutCallback(signOut);

    // ── Layer A: AppState listener for Supabase auto-refresh ──
    // CRITICAL FIX: Without this, when Android kills the app process and the
    // user reopens, the Supabase SDK's internal setInterval-based auto-refresh
    // is dead. Calling startAutoRefresh() on 'active' re-arms it.
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        supabase.auth.startAutoRefresh();
      } else if (nextState === 'background' || nextState === 'inactive') {
        supabase.auth.stopAutoRefresh();
      }
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
    // Start auto-refresh immediately (app is active on mount)
    supabase.auth.startAutoRefresh();

    const initializeAuth = async () => {
      // ── Layer A: Improved cold-start session restoration ──
      // Instead of racing getSession() against a 10-second timeout (which
      // forces a login screen when the backend is slow), we do a two-phase
      // approach:
      //   Phase 1: Read stored session from local storage (fast, no network)
      //   Phase 2: Validate/refresh in background (no timeout pressure)
      let storedSession: AuthSession | null = null;
      try {
        // Phase 1: Fast local read — getSession() reads from SecureTokenStore.
        // If the token is NOT expired, this returns immediately with no network call.
        // If the token IS expired, it triggers refreshSession() which needs network.
        // We give it a generous timeout but DO NOT log out on timeout.
        const AUTH_INIT_TIMEOUT = 15000; // 15 seconds (generous for Render cold start)
        storedSession = await Promise.race([
          AuthService.getSession(),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), AUTH_INIT_TIMEOUT)
          ),
        ]);
        
        if (storedSession) {
          setSession(storedSession);
          // Re-seed the role into SessionPolicy on cold start so the student
          // 401-suppression guard is active immediately, before any refresh.
          const restoredRole = storedSession.validatedUser?.role?.code;
          if (restoredRole && !(await SessionPolicy.getStoredRole())) {
            await SessionPolicy.startSession(restoredRole as any);
          }
        } else {
          // ── Layer B: Student silent restore from SecureStore backup ──
          // If getSession() returned null (storage cleared or timeout),
          // attempt to recover using the backup refresh token in SecureStore.
          // This only helps if a prior session existed — the backup refresh
          // token is written by SecureTokenStore.setItem() on every session write.
          const backupToken = await getBackupRefreshToken();
          if (backupToken) {
            if (__DEV__) console.log('[useAuth] Attempting silent restore from backup refresh token...');
            try {
              const { data, error } = await supabase.auth.refreshSession({
                refresh_token: backupToken,
              });
              if (!error && data.session) {
                if (__DEV__) console.log('[useAuth] Silent restore succeeded');
                // Re-validate with backend (non-blocking — if it fails, we still have the supabase session)
                const restoredSession = await AuthService.refreshSession();
                if (restoredSession) {
                  setSession(restoredSession);
                } else {
                  // Supabase session is valid but backend validation failed — use supabase session data
                  // This keeps the user logged in while backend may be waking up
                  if (__DEV__) console.warn('[useAuth] Silent restore: backend validation pending, using cached session');
                }
              } else {
                if (__DEV__) console.log('[useAuth] Silent restore failed — token invalid, routing to login');
                await clearBackupRefreshToken();
                setSession(null);
              }
            } catch (restoreErr) {
              if (__DEV__) console.error('[useAuth] Silent restore error:', restoreErr);
              setSession(null);
            }
          } else {
            setSession(null);
          }
        }
      } catch (e) {
        console.error('[AUTH_BOOT_FAIL]', e);
        if (__DEV__) console.warn('[useAuth] Auth initialization failed:', e);
        // Don't force logout on init failure — try backup restore for student
        const backupToken = await getBackupRefreshToken();
        if (backupToken) {
          try {
            const { data, error } = await supabase.auth.refreshSession({
              refresh_token: backupToken,
            });
            if (!error && data.session) {
              const restoredSession = await AuthService.refreshSession();
              if (restoredSession) setSession(restoredSession);
            }
          } catch {
            // Silent — will fall through to login screen
          }
        }
        setSession(null);
      } finally {
        setLoading(false);
        setAuthChecked(true);
      }

      // 4. Subscribe to auth state changes from Supabase directly
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
        // Phase 2: suppress events fired as a side effect of OUR OWN internal
        // setSession()/signInWithPassword() during switchAccount / addAccount-
        // restore. Without this, an expired-token setSession emits TOKEN_REFRESHED
        // which would trigger handleRefresh mid-switch (a stray refresh + state
        // write that fights the switch). The guard is a module-level counter held
        // for the exact duration of the swap, so it is precise (no arbitrary
        // timer) and stays raised across rapid/nested swaps until the last ends.
        if (isInternalSessionSwap()) {
          if (__DEV__) console.log(`[useAuth] Suppressing ${event} during internal session swap`);
          return;
        }
        if (event === 'SIGNED_OUT') {
          // Supabase fires SIGNED_OUT both on a real user logout AND when it
          // gives up on a rejected/expired refresh token. We must only honor it
          // when the user actually tapped Logout (manualSignOut). For persistent
          // roles (parent/admin/driver/staff) an unsolicited SIGNED_OUT is
          // treated as a transient token problem: keep the cached session and
          // let handleRefresh's infinite backoff recover it — never evict.
          const roleCode = sessionRef.current?.validatedUser?.role?.code || null;
          if (manualSignOut.current || !isPersistentSessionRole(roleCode)) {
            await clearAuthState();
            setSession(null);
          } else {
            console.warn(`[useAuth] Ignoring unsolicited SIGNED_OUT for persistent role "${roleCode}" — preserving session, scheduling recovery.`);
            void handleRefresh(roleCode);
          }
        } else if (event === 'TOKEN_REFRESHED') {
          // Skip if we just signed in — Supabase fires TOKEN_REFRESHED
          // immediately after sign-in which races with the sign-in flow
          if (justSignedIn.current) {
            if (__DEV__) console.log('[useAuth] Skipping TOKEN_REFRESHED — just signed in');
            return;
          }
          // Do not run async work inside setState — use ref for latest role
          const roleCode = sessionRef.current?.validatedUser?.role?.code || null;
          void handleRefresh(roleCode);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    };

    initializeAuth();

    return () => {
      appStateSubscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  const signIn = async (email: string, pass: string) => {
    setLoading(true);
    // Set guard — suppress TOKEN_REFRESHED for 5 seconds after sign-in
    justSignedIn.current = true;
    setTimeout(() => { justSignedIn.current = false; }, 5000);
    try {
      const result = await AuthService.signIn(email, pass);
      if (result.session) {
        setSession(result.session);
        // Record the role so the role-based session policy + the student
        // 401-suppression guard in apiClient/sessionManager work. Without this
        // the policy layer stays empty and parents (student role) get evicted
        // on the first transient 401.
        const roleCode = result.session.validatedUser?.role?.code;
        if (roleCode) {
          await SessionPolicy.startSession(roleCode as any);
        }
      }
      return result;
    } finally {
      setLoading(false);
    }
  };

  const refreshSession = async () => {
    await handleRefresh(role);
  };

  // Phase 2 — seamless account switch. The heavy lifting (setSession, silent
  // refresh-token recovery, vault pointer update, auth_session persistence,
  // serialization, and event suppression) lives in AuthService.switchAccount.
  // Here we only mirror the result into the provider's in-memory state. We do
  // NOT toggle global `loading` — that would gate the router/_layout and cause a
  // full-screen flash, defeating the "seamless" goal; the session swap itself is
  // what the UI re-renders against.
  const switchAccount = async (userId: string) => {
    const result = await AuthService.switchAccount(userId);
    if (result.session) {
      setSession(result.session);
      const roleCode = result.session.validatedUser?.role?.code;
      if (roleCode) {
        await SessionPolicy.startSession(roleCode as any);
      }
    }
    // NOTE: cold start / login / switch already re-trigger push fan-out via
    // useNotifications' [user] dependency (session change → user change). No
    // explicit fan-out needed here.
    return result;
  };

  // Phase 3a — adding an account does NOT change the active `user`, so
  // useNotifications won't re-fire. Trigger the multi-account push fan-out
  // explicitly (fire-and-forget) so the newly-added child starts receiving
  // notifications immediately. AuthService.addAccount itself is unchanged.
  const addAccount = async (email: string, password: string) => {
    const result = await AuthService.addAccount(email, password);
    if (result.session) {
      void notificationManager.fanOutRegister();
    }
    return result;
  };

  return (
    <AuthContext.Provider value={{ session, loading, authChecked, isAppLocked: false, user, role, isStudent, schoolId, signIn, signOut, refreshSession, switchAccount, addAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}