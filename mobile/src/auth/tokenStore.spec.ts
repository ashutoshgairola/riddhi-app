/**
 * reconcileDeviceLockOwner — the device app-lock (PIN + biometric) belongs to
 * one account. A different account signing in on the same device must not
 * inherit the previous owner's lock; the same returning account must keep it
 * (so logging out and back in never forces a fresh PIN).
 */
const asyncStore: Record<string, string> = {};
const secureStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => asyncStore[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      asyncStore[k] = v;
    }),
    removeItem: jest.fn(async (k: string) => {
      delete asyncStore[k];
    }),
    multiSet: jest.fn(async (pairs: [string, string][]) => {
      pairs.forEach(([k, v]) => {
        asyncStore[k] = v;
      });
    }),
    multiGet: jest.fn(async (keys: string[]) => keys.map((k) => [k, asyncStore[k] ?? null])),
    multiRemove: jest.fn(async (keys: string[]) => {
      keys.forEach((k) => delete asyncStore[k]);
    }),
  },
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (k: string, v: string) => {
    secureStore[k] = v;
  }),
  getItemAsync: jest.fn(async (k: string) => secureStore[k] ?? null),
  deleteItemAsync: jest.fn(async (k: string) => {
    delete secureStore[k];
  }),
}));

jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn(async () => 'hash'),
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(16)),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
}));

import {
  getBiometricEnabled,
  getLockSetupDismissed,
  hasPin,
  reconcileDeviceLockOwner,
  savePin,
  setBiometricEnabled,
  setLockSetupDismissed,
} from './tokenStore';

beforeEach(() => {
  for (const k of Object.keys(asyncStore)) delete asyncStore[k];
  for (const k of Object.keys(secureStore)) delete secureStore[k];
});

describe('reconcileDeviceLockOwner', () => {
  it('keeps the PIN when the same account signs back in', async () => {
    await savePin('1234');
    await reconcileDeviceLockOwner('user-a'); // first sign-in tags ownership
    await reconcileDeviceLockOwner('user-a'); // returning after logout

    expect(await hasPin()).toBe(true);
  });

  it("clears the previous owner's PIN, biometric flag, and dismissal when a different account signs in", async () => {
    await savePin('1234');
    await setBiometricEnabled(true);
    await setLockSetupDismissed(true);
    await reconcileDeviceLockOwner('user-a');

    await reconcileDeviceLockOwner('user-b');

    expect(await hasPin()).toBe(false);
    expect(await getBiometricEnabled()).toBe(false);
    expect(await getLockSetupDismissed()).toBe(false);
  });

  it('adopts a pre-existing untagged PIN for the first account to sign in (migration)', async () => {
    await savePin('1234'); // set before ownership tracking existed

    await reconcileDeviceLockOwner('user-a');

    expect(await hasPin()).toBe(true);
  });
});
