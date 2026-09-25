/* eslint-disable import/first, @typescript-eslint/no-require-imports */
jest.mock('../constants/school', () => ({
  SCHOOL_ID: 17,
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
      getSession: jest.fn(async () => ({ data: { session: null } })),
      verifyOtp: jest.fn(),
      setSession: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(async () => {}),
    },
  },
}));

jest.mock('./apiClient', () => {
  class APIError extends Error {
    statusCode?: number;
    code?: string;
    constructor(message: string, statusCode?: number, _errors?: unknown, _requestId?: string, code?: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
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
  getQrRecoveryCredential: jest.fn(async () => null),
  saveQrRecoveryCredential: jest.fn(async () => {}),
  listAccounts: jest.fn(async () => []),
  getActiveAccountId: jest.fn(async () => null),
  setActiveAccountId: jest.fn(async () => {}),
}));

jest.mock('./pushFanout', () => ({
  refreshAccessTokenStandalone: jest.fn(async () => null),
}));

jest.mock('./staffBiometricService', () => ({
  staffBiometricService: {
    getStoredRegistration: jest.fn(async () => ({
      status: 'unregistered',
      personId: null,
    })),
  },
}));

jest.mock('./staffPortalSession', () => ({
  clearStaffPortalSession: jest.fn(),
  getStaffPortalSession: jest.fn(() => ({})),
}));

import { AuthService } from './authService';

const { supabase } = require('./supabaseConfig');
const { api, APIError } = require('./apiClient');
const accountVault = require('./accountVault');

const qrPayload = JSON.stringify({
  type: 'SCHOOLIMS_LOGIN',
  version: 1,
  schoolId: 17,
  payload: `123e4567-e89b-42d3-a456-426614174000.${'A'.repeat(43)}`,
});

const supabaseSession = {
  access_token: 'qr-access',
  refresh_token: 'qr-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'user-17' },
};

const validatedUser = {
  userId: 'user-17',
  schoolId: 17,
  role: { code: 'student' },
  has_student_profile: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  supabase.auth.signOut.mockResolvedValue({});
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
});

describe('AuthService QR login', () => {
  it('logs in a valid QR after the backend returns a session', async () => {
    api.post
      .mockResolvedValueOnce({
        token: 'qr-access',
        refresh_token: 'qr-refresh',
        expires_at: supabaseSession.expires_at,
      })
      .mockResolvedValueOnce(validatedUser);
    supabase.auth.setSession.mockResolvedValue({
      data: { session: supabaseSession, user: supabaseSession.user },
      error: null,
    });

    const result = await AuthService.signInWithQr(qrPayload);

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      '/auth/qr/resolve',
      { qrPayload },
      expect.objectContaining({ omitAuth: true, silent: true }),
    );
    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'qr-access',
      refresh_token: 'qr-refresh',
    });
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
    expect(accountVault.saveQrRecoveryCredential).toHaveBeenCalledWith(
      'user-17',
      qrPayload,
    );
    expect(result.session?.validatedUser.userId).toBe('user-17');
    expect(result.error).toBeUndefined();
  });

  it('falls back to email OTP verification for older tokenHash responses', async () => {
    api.post
      .mockResolvedValueOnce({ tokenHash: 'hashed-token', type: 'magiclink' })
      .mockResolvedValueOnce(validatedUser);
    supabase.auth.setSession.mockResolvedValue({ data: { session: null }, error: new Error('missing tokens') });
    supabase.auth.verifyOtp.mockResolvedValue({
      data: { session: supabaseSession, user: supabaseSession.user },
      error: null,
    });

    const result = await AuthService.signInWithQr(qrPayload);

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'hashed-token',
      type: 'email',
    });
    expect(result.session?.validatedUser.userId).toBe('user-17');
  });

  it('maps expired, revoked, school-mismatch, and inactive codes without signing in', async () => {
    api.post.mockRejectedValueOnce(new APIError('expired', 401, undefined, undefined, 'QR_TOKEN_EXPIRED'));
    await expect(AuthService.signInWithQr(qrPayload)).resolves.toMatchObject({
      code: 'QR_TOKEN_EXPIRED',
    });

    api.post.mockRejectedValueOnce(new APIError('revoked', 401, undefined, undefined, 'QR_TOKEN_REVOKED'));
    await expect(AuthService.signInWithQr(qrPayload)).resolves.toMatchObject({
      code: 'QR_TOKEN_REVOKED',
    });

    api.post.mockRejectedValueOnce(new APIError('other school', 401, undefined, undefined, 'QR_SCHOOL_MISMATCH'));
    await expect(AuthService.signInWithQr(qrPayload)).resolves.toMatchObject({
      code: 'QR_SCHOOL_MISMATCH',
    });

    api.post.mockRejectedValueOnce(new APIError('inactive', 401, undefined, undefined, 'QR_USER_INACTIVE'));
    await expect(AuthService.signInWithQr(qrPayload)).resolves.toMatchObject({
      code: 'QR_USER_INACTIVE',
    });

    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it('maps backend unavailability and timeouts distinctly from invalid QRs', async () => {
    api.post.mockRejectedValueOnce(new APIError('offline', 0, undefined, undefined, 'NETWORK_ERROR'));
    await expect(AuthService.signInWithQr(qrPayload)).resolves.toMatchObject({
      code: 'NETWORK_ERROR',
    });

    api.post.mockRejectedValueOnce(new APIError('slow', 408, undefined, undefined, 'QR_SERVER_ERROR'));
    await expect(AuthService.signInWithQr(qrPayload)).resolves.toMatchObject({
      code: 'QR_SERVER_ERROR',
    });

    api.post.mockRejectedValueOnce(new APIError('random', 400, undefined, undefined, 'QR_INVALID'));
    await expect(AuthService.signInWithQr(qrPayload)).resolves.toMatchObject({
      code: 'QR_INVALID',
    });
  });

  it('does not create a local session when school validation fails after OTP exchange', async () => {
    api.post
      .mockResolvedValueOnce({
        token: 'qr-access',
        refresh_token: 'qr-refresh',
      })
      .mockResolvedValueOnce({ ...validatedUser, schoolId: 99 });
    supabase.auth.setSession.mockResolvedValue({
      data: { session: supabaseSession, user: supabaseSession.user },
      error: null,
    });

    const result = await AuthService.signInWithQr(qrPayload);
    expect(result.session).toBeUndefined();
    expect(result.code).toBe('QR_SCHOOL_MISMATCH');
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('restores a QR account from its saved QR when the refresh token is dead', async () => {
    const expiredSession = {
      ...supabaseSession,
      access_token: 'expired-access',
      refresh_token: 'expired-refresh',
      expires_at: Math.floor(Date.now() / 1000) - 60,
    };
    accountVault.listAccounts.mockResolvedValueOnce([{
      userId: 'user-17',
      displayName: 'Student',
      photoUrl: null,
      admissionNo: 'A-17',
      supabaseSession: expiredSession,
      validatedUser,
    }]);
    accountVault.getQrRecoveryCredential.mockResolvedValueOnce({
      qrPayload,
      updatedAt: Date.now(),
    });
    api.post
      .mockResolvedValueOnce({
        token: 'qr-recovered-access',
        refresh_token: 'qr-recovered-refresh',
      })
      .mockResolvedValueOnce(validatedUser);
    const recoveredSession = {
      ...supabaseSession,
      access_token: 'qr-recovered-access',
      refresh_token: 'qr-recovered-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    supabase.auth.setSession.mockResolvedValue({
      data: { session: recoveredSession, user: recoveredSession.user },
      error: null,
    });

    const result = await AuthService.switchAccount('user-17');

    expect(api.post).toHaveBeenNthCalledWith(
      1,
      '/auth/qr/resolve',
      { qrPayload },
      expect.objectContaining({ omitAuth: true, silent: true }),
    );
    expect(result.error).toBeUndefined();
    expect(result.session?.supabaseSession.access_token).toBe('qr-recovered-access');
    expect(accountVault.setActiveAccountId).toHaveBeenCalledWith('user-17');
  });
});
