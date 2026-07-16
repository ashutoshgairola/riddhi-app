import { useEffect, useRef } from 'react';

import { useNav } from '../app/navContext';
import {
  configureNotificationHandler,
  registerDeviceWithBackend,
  subscribeToNotificationResponses,
  handleColdStartNotificationResponse,
} from './push';
import { mapNotificationToScreen } from './deepLink';

// Foreground presentation behaviour is process-global; set it once at module
// load. Safe in Expo Go (no-op there) because it never imports
// expo-notifications statically — see push.ts loadNotifications().
configureNotificationHandler();

/**
 * Registers this device for push on mount and wires notification taps to the
 * nav stack. A tap (foreground, background, or cold-start launch) deep-links
 * to the screen named in the notification's `data` payload. Must be mounted
 * inside <NavProvider> so `useNav()` is available. All notification work
 * no-ops in Expo Go.
 */
export function usePushNotifications(): void {
  const { nav } = useNav();
  const coldStartHandled = useRef(false);

  useEffect(() => {
    void registerDeviceWithBackend();

    const goto = (data: unknown): void => {
      const target = mapNotificationToScreen(data);
      if (target) nav(target.kind, target.data);
    };

    const unsubscribe = subscribeToNotificationResponses(goto);

    // Cold start: the app was launched by tapping a notification.
    if (!coldStartHandled.current) {
      coldStartHandled.current = true;
      handleColdStartNotificationResponse(goto);
    }

    return unsubscribe;
  }, [nav]);
}
