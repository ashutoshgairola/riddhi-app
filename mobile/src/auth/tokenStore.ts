/**
 * tokenStore — persistence for the session (AsyncStorage) and the app-lock
 * PIN (SecureStore; hashed, never plaintext). The PIN is a device-level app
 * lock, not an account credential, so it never leaves the phone (spec §
 * Biometric + PIN).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const ACCESS_KEY = 'riddhi.accessToken';
const REFRESH_KEY = 'riddhi.refreshToken';
const BIOMETRIC_KEY = 'riddhi.biometricEnabled';
const PIN_KEY = 'riddhi.pin';
const PIN_LEN_KEY = 'riddhi.pinLength';
// Set once the user declines the on-device app-lock setup prompt, so a
// returning user whose account "remembers" a lock isn't nagged every launch.
const LOCK_SETUP_DISMISSED_KEY = 'riddhi.lockSetupDismissed';

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await AsyncStorage.multiSet([
    [ACCESS_KEY, accessToken],
    [REFRESH_KEY, refreshToken],
  ]);
}

export async function loadTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  const pairs = await AsyncStorage.multiGet([ACCESS_KEY, REFRESH_KEY]);
  return { accessToken: pairs[0][1], refreshToken: pairs[1][1] };
}

export async function clearTokens(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_KEY, enabled ? '1' : '0');
  // Configuring a credential means the lock is now active on this device;
  // forget any earlier "not now" so future divergence can re-prompt.
  if (enabled) await AsyncStorage.removeItem(LOCK_SETUP_DISMISSED_KEY);
}

/** Whether the user declined setting up the app lock on this device. */
export async function getLockSetupDismissed(): Promise<boolean> {
  return (await AsyncStorage.getItem(LOCK_SETUP_DISMISSED_KEY)) === '1';
}

export async function setLockSetupDismissed(dismissed: boolean): Promise<void> {
  if (dismissed) await AsyncStorage.setItem(LOCK_SETUP_DISMISSED_KEY, '1');
  else await AsyncStorage.removeItem(LOCK_SETUP_DISMISSED_KEY);
}

export async function getBiometricEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(BIOMETRIC_KEY)) === '1';
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function savePin(pin: string): Promise<void> {
  const saltBytes = await Crypto.getRandomBytesAsync(16);
  const salt = Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hash = await hashPin(pin, salt);
  await SecureStore.setItemAsync(PIN_KEY, `${salt}:${hash}`);
  await AsyncStorage.setItem(PIN_LEN_KEY, String(pin.length));
  // A PIN now enforces the lock on this device — clear any prior dismissal.
  await AsyncStorage.removeItem(LOCK_SETUP_DISMISSED_KEY);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  return (await hashPin(pin, salt)) === hash;
}

export async function hasPin(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PIN_KEY)) != null;
}

/** Digit count of the stored PIN (drives the lock screen's dots/auto-submit). */
export async function getPinLength(): Promise<number | null> {
  const v = await AsyncStorage.getItem(PIN_LEN_KEY);
  const n = v ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 4 && n <= 6 ? n : null;
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
  await AsyncStorage.removeItem(PIN_LEN_KEY);
}
