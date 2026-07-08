import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'notification-sync/app-toggles';

/** Per-app enable/disable map (packageName -> enabled). An absent key means
 * "default on" — callers (resolveAllowlist) treat only `false` as disabled. */
export async function getToggles(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export async function setToggle(pkg: string, enabled: boolean): Promise<void> {
  const current = await getToggles();
  current[pkg] = enabled;
  await AsyncStorage.setItem(KEY, JSON.stringify(current));
}
