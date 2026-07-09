import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'notification-sync/app-toggles';

/** Per-app enable/disable map (packageName -> enabled). An absent key means
 * "default on" — callers (resolveAllowlist) treat only `false` as disabled. */
export async function getToggles(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
    return {};
  } catch {
    return {};
  }
}

export async function setToggle(pkg: string, enabled: boolean): Promise<void> {
  const current = await getToggles();
  current[pkg] = enabled;
  await AsyncStorage.setItem(KEY, JSON.stringify(current));
}
