/* eslint-disable import/first, @typescript-eslint/no-require-imports */
jest.mock('../constants/school', () => ({
  SCHOOL_ID: 12,
  SCHOOL_NAME: 'Test School',
}));

jest.mock('./secureTokenStore', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    SecureTokenStore: {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    },
  };
});

jest.mock('./supabaseConfig', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      verifyOtp: jest.fn(),
      signInWithPassword: jest.fn(),
      updateUser: jest.fn(),
      refreshSession: jest.fn(),
      signOut: jest.fn(async () => {}),
      setSession: jest.fn(),
    },
  },
}));

jest.mock('./apiClient', () => {
  class APIError extends Error {
    statusCode?: number;
    constructor(message: string, statusCode?: number) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  return {
    APIError,
    api: { post: jest.fn() },
    registerSessionRecoveryCallback: jest.fn(),
  };
});

jest.mock('./accountVault', () => ({
  addAccount: jest.fn(async () => {}),
  buildVaultAccount: jest.fn((session) => session),
  getBackupRefreshTokenForUser: jest.fn(async () => null),
  getLoginRecoveryCredential: jest.fn(async () => null),
  saveLoginRecoveryCredential: jest.fn(async () => {}),
  removeLoginRecoveryCredential: jest.fn(async () => {}),
  getQrRecoveryCredential: jest.fn(async () => null),
  saveQrRecoveryCredential: jest.fn(async () => {}),
  removeQrRecoveryCredential: jest.fn(async () => {}),
  listAccounts: jest.fn(async () => []),
  getActiveAccountId: jest.fn(async () => null),
  setActiveAccountId: jest.fn(async () => {}),
}));

jest.mock('./pushFanout', () => ({
  refreshAccessTokenStandalone: jest.fn(async () => null),
}));

import { AuthService, isInternalSessionSwap } from './authService';
import { Platform } from 'react-native';

const { supabase } = require('./supabaseConfig');
const { api, APIError } = require('./apiClient');
const secureTokenStore = require('./secureTokenStore');
const accountVault = require('./accountVault');

function savedSession() {
  return {
    supabaseSession: {
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'user-1', email: 'admin@example.com' },
    },
    validatedUser: {
      userId: 'user-1',
      schoolId: 12,
      role: { code: 'admin' },
    },
    tokenExpiresAt: Date.now() + 3_600_000,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  secureTokenStore.__store.clear();
  supabase.auth.signOut.mockResolvedValue({});
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
});

describe('AuthService security boundaries', () => {
  it('reauthenticates with the current password before changing it', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: {
        session: { user: { id: 'user-1', email: 'admin@example.com' } },
      },
    });
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        session: { user: { id: 'user-1', email: 'admin@example.com' } },
      },
      error: null,
    });
    supabase.auth.updateUser.mockResolvedValue({ error: null });

    await AuthService.changePassword('current-secret', 'new-secret');

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'current-secret',
    });
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'new-secret' });
    expect(accountVault.saveLoginRecoveryCredential).toHaveBeenCalledWith(
      'user-1',
      'admin@example.com',
      'new-secret'
    );
    expect(isInternalSessionSwap()).toBe(false);
  });

  it('does not update the password when current-password verification fails', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: {
        session: { user: { id: 'user-1', email: 'admin@example.com' } },
      },
    });
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: new Error('invalid credentials'),
    });

    await expect(
      AuthService.changePassword('wrong-secret', 'new-secret')
    ).rejects.toThrow('Current password is incorrect.');
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    expect(isInternalSessionSwap()).toBe(false);
  });

  it('clears cached authority after a confirmed backend 403', async () => {
    secureTokenStore.__store.set('auth_session', JSON.stringify(savedSession()));
    supabase.auth.refreshSession.mockResolvedValue({
      data: { session: savedSession().supabaseSession },
      error: null,
    });
    api.post.mockRejectedValue(new APIError('account locked', 403));

    await expect(AuthService.refreshSession()).resolves.toBeNull();
    expect(secureTokenStore.SecureTokenStore.removeItem).toHaveBeenCalledWith(
      'auth_session'
    );
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('preserves cached identity when refresh rejection has no saved-login recovery', async () => {
    secureTokenStore.__store.set('auth_session', JSON.stringify(savedSession()));
    supabase.auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: {
        status: 400,
        code: 'refresh_token_not_found',
        message: 'Invalid Refresh Token',
      },
    });

    await expect(AuthService.refreshSession()).resolves.toBeNull();
    expect(secureTokenStore.SecureTokenStore.removeItem).not.toHaveBeenCalledWith(
      'auth_session'
    );
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('rebuilds a rejected refresh session with the Keystore-saved login', async () => {
    const prior = savedSession();
    const recoveredSupabaseSession = {
      ...prior.supabaseSession,
      access_token: 'recovered-access',
      refresh_token: 'recovered-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 7200,
    };
    secureTokenStore.__store.set('auth_session', JSON.stringify(prior));
    supabase.auth.refreshSession.mockResolvedValue({
      data: { session: null },
      error: {
        status: 400,
        code: 'refresh_token_not_found',
        message: 'Invalid Refresh Token',
      },
    });
    accountVault.getLoginRecoveryCredential.mockResolvedValue({
      email: 'admin@example.com',
      password: 'saved-secret',
      updatedAt: Date.now(),
    });
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { session: recoveredSupabaseSession },
      error: null,
    });
    api.post.mockResolvedValue(prior.validatedUser);

    const recovered = await AuthService.refreshSession();

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'saved-secret',
    });
    expect(recovered?.supabaseSession.access_token).toBe('recovered-access');
    expect(secureTokenStore.SecureTokenStore.setItem).toHaveBeenCalledWith(
      'auth_session',
      expect.stringContaining('recovered-access')
    );
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('returns an expired cached identity immediately for the boot hydrator', async () => {
    const expired = {
      ...savedSession(),
      tokenExpiresAt: Date.now() - 1000,
    };
    secureTokenStore.__store.set('auth_session', JSON.stringify(expired));

    await expect(AuthService.getSession()).resolves.toEqual(expired);
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it('rehydrates a missing live client from the persisted Android session', async () => {
    const prior = savedSession();
    const hydratedSupabaseSession = {
      ...prior.supabaseSession,
      access_token: 'hydrated-access',
      refresh_token: 'hydrated-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 7200,
    };
    secureTokenStore.__store.set('auth_session', JSON.stringify(prior));
    supabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    supabase.auth.setSession.mockResolvedValue({
      data: {
        user: hydratedSupabaseSession.user,
        session: hydratedSupabaseSession,
      },
      error: null,
    });

    const restored = await AuthService.restorePersistedSession();

    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
    });
    expect(restored?.supabaseSession.access_token).toBe('hydrated-access');
    expect(secureTokenStore.SecureTokenStore.setItem).toHaveBeenCalledWith(
      'auth_session',
      expect.stringContaining('hydrated-refresh')
    );
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(isInternalSessionSwap()).toBe(false);
  });

  it('uses the saved web login when reload tokens are no longer accepted', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    const prior = savedSession();
    const recoveredSupabaseSession = {
      ...prior.supabaseSession,
      access_token: 'cold-start-recovered-access',
      refresh_token: 'cold-start-recovered-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 7200,
    };
    secureTokenStore.__store.set('auth_session', JSON.stringify(prior));
    supabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    supabase.auth.setSession.mockResolvedValue({
      data: { user: null, session: null },
      error: {
        status: 400,
        code: 'refresh_token_not_found',
        message: 'Invalid Refresh Token',
      },
    });
    accountVault.getLoginRecoveryCredential.mockResolvedValue({
      email: 'admin@example.com',
      password: 'saved-secret',
      updatedAt: Date.now(),
    });
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: recoveredSupabaseSession.user,
        session: recoveredSupabaseSession,
      },
      error: null,
    });

    const restored = await AuthService.restorePersistedSession();

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'saved-secret',
    });
    expect(restored?.supabaseSession.access_token).toBe(
      'cold-start-recovered-access'
    );
    expect(secureTokenStore.SecureTokenStore.removeItem).not.toHaveBeenCalledWith(
      'auth_session'
    );
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(isInternalSessionSwap()).toBe(false);
  });

  it('single-flights concurrent cold-start repair requests', async () => {
    const prior = savedSession();
    const hydratedSupabaseSession = {
      ...prior.supabaseSession,
      access_token: 'single-flight-access',
      refresh_token: 'single-flight-refresh',
    };
    secureTokenStore.__store.set('auth_session', JSON.stringify(prior));
    supabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    supabase.auth.setSession.mockResolvedValue({
      data: {
        user: hydratedSupabaseSession.user,
        session: hydratedSupabaseSession,
      },
      error: null,
    });

    const [first, second] = await Promise.all([
      AuthService.restorePersistedSession(),
      AuthService.restorePersistedSession(),
    ]);

    expect(first?.supabaseSession.access_token).toBe('single-flight-access');
    expect(second?.supabaseSession.access_token).toBe('single-flight-access');
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(1);
    expect(supabase.auth.setSession).toHaveBeenCalledTimes(1);
  });

  it('adopts an SDK-refreshed token without rotating it a second time', async () => {
    const prior = savedSession();
    const sdkRefreshed = {
      ...prior.supabaseSession,
      access_token: 'sdk-refreshed-access',
      refresh_token: 'sdk-refreshed-refresh',
      user: { id: 'user-1', email: 'admin@example.com' },
    };
    secureTokenStore.__store.set('auth_session', JSON.stringify(prior));

    const adopted = await AuthService.adoptRefreshedSession(
      sdkRefreshed as any
    );

    expect(adopted?.supabaseSession.access_token).toBe(
      'sdk-refreshed-access'
    );
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
    expect(secureTokenStore.SecureTokenStore.setItem).toHaveBeenCalledWith(
      'auth_session',
      expect.stringContaining('sdk-refreshed-refresh')
    );
  });
});
