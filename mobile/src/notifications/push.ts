import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';

import { api } from '../api';

/**
 * expo-notifications must NOT be imported statically. Its entry point
 * re-exports the `DevicePushTokenAutoRegistration.fx` side-effect module, whose
 * body calls `addPushTokenListener(...)` at import time — and that THROWS on
 * Android in Expo Go (remote push was removed from Expo Go in SDK 53+). A
 * static top-level import therefore crashes app startup in Expo Go, before any
 * runtime guard inside a function could ever run.
 *
 * Load it lazily behind this guard instead: `require` evaluates the module (and
 * its throwing side effect) only when actually called, and we never call it in
 * Expo Go. Returns null in Expo Go (push is unavailable there anyway) and the
 * real module in dev/production builds.
 */
type NotificationsModule = typeof import('expo-notifications');

function loadNotifications(): NotificationsModule | null {
  if (isRunningInExpoGo()) return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-notifications') as NotificationsModule;
}

/**
 * How notifications behave when one arrives while the app is foregrounded.
 * SDK 56 uses `shouldShowBanner`/`shouldShowList` (the old `shouldShowAlert`
 * is removed). No-op in Expo Go.
 */
export function configureNotificationHandler(): void {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function ensureAndroidChannel(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

/**
 * Requests notification permission and returns this device's Expo push token,
 * or null when running on a simulator/emulator (`!Device.isDevice`), in Expo Go
 * (remote push unavailable), or when permission is denied. Physical devices
 * need a dev/production build for remote push.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const Notifications = loadNotifications();
  if (!Notifications) return null;
  await ensureAndroidChannel(Notifications);

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  try {
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return token.data;
  } catch {
    // Token fetch can fail (unsupported runtime, offline, misconfigured
    // projectId). Degrade to no push rather than crashing app startup.
    return null;
  }
}

/**
 * Registers this device's push token with the backend so it can receive
 * notifications. Returns the token registered (for a later unregister on
 * logout), or null if no token could be obtained. Best-effort: a backend
 * failure is swallowed so it never blocks app startup.
 */
export async function registerDeviceWithBackend(): Promise<string | null> {
  const token = await registerForPushNotificationsAsync();
  if (!token) return null;
  try {
    await api.notifications.registerDevice(
      token,
      Platform.OS === 'ios' ? 'ios' : 'android',
    );
  } catch {
    // Backend may be unreachable; the token is still valid for a later retry.
  }
  return token;
}

/**
 * Subscribes to notification taps while the app is running (foreground or
 * background). `onData` receives the notification's `data` payload. Returns a
 * cleanup function. No-op in Expo Go.
 */
export function subscribeToNotificationResponses(
  onData: (data: unknown) => void,
): () => void {
  const Notifications = loadNotifications();
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((response) =>
    onData(response.notification.request.content.data),
  );
  return () => sub.remove();
}

/**
 * Handles a cold start where the app was launched by tapping a notification,
 * delivering that notification's `data` payload to `onData`. No-op in Expo Go.
 */
export function handleColdStartNotificationResponse(
  onData: (data: unknown) => void,
): void {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) onData(response.notification.request.content.data);
  });
}
