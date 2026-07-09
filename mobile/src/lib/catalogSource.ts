import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { DEFAULT_ALLOWLIST } from '../../modules/notification-listener';
import type { CatalogEntry } from './allowlistResolver';

const CACHE_KEY = 'notification-sync/catalog-v1';

/** Last-resort catalog when the backend has never been reached: the retained
 * DEFAULT_ALLOWLIST seed, given a neutral 'merchant' category and a
 * package-derived display name so the UI still renders something sensible. */
function seedCatalog(): CatalogEntry[] {
  return DEFAULT_ALLOWLIST.map((packageName) => ({
    packageName,
    displayName: packageName.split('.').pop() ?? packageName,
    category: 'merchant' as const,
  }));
}

/** Fetch the app catalog: live backend first (cached on success), else the last
 * cached copy, else the bundled seed. Never throws. */
export async function fetchCatalog(): Promise<CatalogEntry[]> {
  try {
    const remote = await apiClient.get<CatalogEntry[]>('/notification-sync/catalog');
    if (Array.isArray(remote) && remote.length > 0) {
      try {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(remote));
      } catch {
        // cache best-effort — a fresh fetch still wins even if caching fails
      }
      return remote;
    }
  } catch {
    // fall through to cache / seed
  }
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as unknown;
      if (Array.isArray(parsed)) return parsed as CatalogEntry[];
    }
  } catch {
    // fall through to seed
  }
  return seedCatalog();
}
