/**
 * baseUrl — single source of truth for the backend origin.
 *
 * A standalone build bakes EXPO_PUBLIC_API_URL at build time. To repoint the
 * app at a new backend (e.g. a fresh ngrok URL) without rebuilding, an override
 * is persisted in AsyncStorage and overlaid on the baked default. getBaseUrl()
 * is synchronous for the request hot path; hydrateBaseUrl() loads the override
 * into the in-memory cache at startup (call before the first API request).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const OVERRIDE_KEY = 'riddhi.backendUrlOverride';

const BAKED_DEFAULT = (process.env['EXPO_PUBLIC_API_URL'] ?? '').replace(/\/$/, '');

let current = BAKED_DEFAULT;

function normalize(url: string): string {
  return url.trim().replace(/\/$/, '');
}

/** Sync accessor for the request hot path: override if set, else baked default. */
export function getBaseUrl(): string {
  return current;
}

/** The compile-time EXPO_PUBLIC_API_URL, for the "reset to default" affordance. */
export function getBakedDefault(): string {
  return BAKED_DEFAULT;
}

/** Persist an override (or clear with null/empty) and update the in-memory cache. */
export async function setBaseUrl(url: string | null): Promise<void> {
  const next = url == null ? '' : normalize(url);
  if (next === '') {
    current = BAKED_DEFAULT;
    await AsyncStorage.removeItem(OVERRIDE_KEY);
    return;
  }
  current = next;
  await AsyncStorage.setItem(OVERRIDE_KEY, next);
}

/** Load any persisted override into the cache. Call once at startup. */
export async function hydrateBaseUrl(): Promise<void> {
  const stored = await AsyncStorage.getItem(OVERRIDE_KEY);
  if (stored) current = normalize(stored);
}
