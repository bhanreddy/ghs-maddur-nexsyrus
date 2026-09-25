/* eslint-disable import/first -- jest.mock() calls are written above the imports they replace. */
jest.mock('../constants/school', () => ({ SCHOOL_ID: 12 }));

jest.mock('./biometricService', () => ({
  disableFingerprintForAccount: jest.fn(async () => true),
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
    getBackupRefreshToken: jest.fn(async () => null),
  };
});

import * as accountVault from './accountVault';
import type { VaultAccount } from './accountVault';
import { Platform } from 'react-native';

/* Handles on the mocks above, for assertions. */
/* eslint-disable @typescript-eslint/no-require-imports */
const biometricService = require('./biometricService');
const secureTokenStore = require('./secureTokenStore');
/* eslint-enable @typescript-eslint/no-require-imports */

const SCHOOL = 12;

function account(userId: string, roleCode: string): VaultAccount {
  return {
    userId,
    displayName: userId,
    photoUrl: null,
    admissionNo: null,
    supabaseSession: { refresh_token: `refresh-${userId}` } as any,
    validatedUser: { userId, role: { code: roleCode } } as any,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  secureTokenStore.__store.clear();
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
});

describe('accountVault.removeAccount fingerprint cleanup', () => {
  it('deletes the removed account\'s fingerprint opt-in and nothing else', async () => {
    await accountVault.addAccount(account('admin-1', 'admin'));
    await accountVault.addAccount(account('staff-2', 'staff'));

    await accountVault.removeAccount('admin-1');

    expect(biometricService.disableFingerprintForAccount).toHaveBeenCalledTimes(1);
    expect(biometricService.disableFingerprintForAccount).toHaveBeenCalledWith(SCHOOL, 'admin-1');
  });

  it('leaves the sibling account and its tokens in the vault', async () => {
    await accountVault.addAccount(account('admin-1', 'admin'));
    await accountVault.addAccount(account('staff-2', 'staff'));

    await accountVault.removeAccount('admin-1');

    const remaining = await accountVault.listAccounts();
    expect(remaining.map((a) => a.userId)).toEqual(['staff-2']);
    await expect(accountVault.getBackupRefreshTokenForUser('staff-2')).resolves.toBe(
      'refresh-staff-2'
    );
    await expect(accountVault.getBackupRefreshTokenForUser('admin-1')).resolves.toBeNull();
  });

  it('runs the cleanup for an account that never opted in', async () => {
    await accountVault.addAccount(account('student-3', 'student'));
    await accountVault.removeAccount('student-3');

    expect(biometricService.disableFingerprintForAccount).toHaveBeenCalledWith(SCHOOL, 'student-3');
  });

  it('persists recovery credentials securely and deletes only the removed account credential', async () => {
    await accountVault.addAccount(account('admin-1', 'admin'));
    await accountVault.addAccount(account('staff-2', 'staff'));
    await accountVault.saveLoginRecoveryCredential(
      'admin-1',
      'ADMIN@example.com',
      'admin-secret'
    );
    await accountVault.saveLoginRecoveryCredential(
      'staff-2',
      'staff@example.com',
      'staff-secret'
    );

    await accountVault.removeAccount('admin-1');

    await expect(
      accountVault.getLoginRecoveryCredential('admin-1')
    ).resolves.toBeNull();
    await expect(
      accountVault.getLoginRecoveryCredential('staff-2')
    ).resolves.toEqual(
      expect.objectContaining({
        email: 'staff@example.com',
        password: 'staff-secret',
      })
    );
  });

  it('persists recovery credentials on web so dormant accounts can be restored', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    await accountVault.saveLoginRecoveryCredential(
      'accounts-1',
      'accounts@example.com',
      'accounts-secret'
    );
    await expect(
      accountVault.getLoginRecoveryCredential('accounts-1')
    ).resolves.toEqual(
      expect.objectContaining({
        email: 'accounts@example.com',
        password: 'accounts-secret',
      })
    );
  });

  it('persists a QR recovery credential and deletes only the removed account QR', async () => {
    await accountVault.addAccount(account('student-1', 'student'));
    await accountVault.addAccount(account('student-2', 'student'));
    await accountVault.saveQrRecoveryCredential('student-1', '  qr-payload-1  ');
    await accountVault.saveQrRecoveryCredential('student-2', 'qr-payload-2');

    await accountVault.removeAccount('student-1');

    await expect(accountVault.getQrRecoveryCredential('student-1')).resolves.toBeNull();
    await expect(accountVault.getQrRecoveryCredential('student-2')).resolves.toEqual(
      expect.objectContaining({ qrPayload: 'qr-payload-2' })
    );
  });

  it('reads July legacy credential envelopes after an app update', async () => {
    secureTokenStore.__store.set(
      'vault_login_credentials_v1',
      JSON.stringify({
        __vault: 'login_credentials_v1',
        credentials: {
          'legacy-user': {
            email: 'LEGACY@example.com',
            password: 'legacy-secret',
          },
        },
      })
    );

    await expect(
      accountVault.getLoginRecoveryCredential('legacy-user')
    ).resolves.toEqual(
      expect.objectContaining({
        email: 'legacy@example.com',
        password: 'legacy-secret',
        updatedAt: expect.any(Number),
      })
    );
  });

  it('migrates the interim credential marker to the backward-compatible marker', async () => {
    secureTokenStore.__store.set(
      'vault_login_credentials_v1',
      JSON.stringify({
        __vault: 'credentials_v1',
        credentials: {
          'interim-user': {
            email: 'interim@example.com',
            password: 'interim-secret',
            updatedAt: 123,
          },
        },
      })
    );

    await expect(
      accountVault.getLoginRecoveryCredential('interim-user')
    ).resolves.toEqual({
      email: 'interim@example.com',
      password: 'interim-secret',
      updatedAt: 123,
    });
    expect(
      JSON.parse(
        secureTokenStore.__store.get('vault_login_credentials_v1')
      ).__vault
    ).toBe('login_credentials_v1');
  });
});
