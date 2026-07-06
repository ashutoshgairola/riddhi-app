/**
 * useAppLockSetup — reconciles the account's synced lock preference with this
 * device's local state.
 *
 * The app lock is enforced from *device-local* secrets (a PIN in SecureStore,
 * a biometric flag in AsyncStorage). The `biometricEnabled` account preference
 * is synced across devices and defaults to on. A returning user who logs in on
 * a fresh install therefore carries "lock on" in their account but has no PIN
 * or biometric flag on the new device — so the app would silently never lock,
 * even though Settings (now fixed) knows it's off.
 *
 * When the account wants a lock but nothing enforces it here, prompt the user —
 * once per install — to set a PIN on this device. Declining sets a device-local
 * flag so they aren't nagged again; they can still set it up later in Settings.
 */
import { useEffect, useRef } from 'react';

import { useFeedback } from '../feedback/FeedbackProvider';
import { usePrefs } from '../prefs/PrefsProvider';
import {
  getBiometricEnabled,
  getLockSetupDismissed,
  hasPin,
  savePin,
  setLockSetupDismissed,
} from './tokenStore';

export function useAppLockSetup(): void {
  const { prefs, loaded } = usePrefs();
  const { sheet, form, toast } = useFeedback();
  const handled = useRef(false);

  useEffect(() => {
    // Wait for the real account preference before acting — the default is
    // `true`, so acting early would prompt users who opted out.
    if (!loaded || !prefs.biometricEnabled || handled.current) return;
    handled.current = true;
    let cancelled = false;

    const openPinForm = () =>
      form({
        title: 'Set PIN',
        fields: [
          { key: 'pin', label: 'New PIN (4–6 digits)' },
          { key: 'confirm', label: 'Confirm new PIN' },
        ],
        submitLabel: 'Set PIN',
        onSubmit: async (v) => {
          if (!/^\d{4,6}$/.test(v['pin'] ?? '')) throw new Error('PIN must be 4–6 digits');
          if (v['pin'] !== v['confirm']) throw new Error("PINs don't match");
          await savePin(v['pin']!);
          toast('App lock is on for this device', '🔒');
        },
      });

    const prompt = () =>
      sheet({
        title: 'Secure Riddhi on this device',
        options: [
          { label: 'Set a PIN', icon: '🔑', onPress: openPinForm },
          { label: 'Not now', onPress: () => void setLockSetupDismissed(true) },
        ],
      });

    void (async () => {
      const [pinSet, bioSet, dismissed] = await Promise.all([
        hasPin(),
        getBiometricEnabled(),
        getLockSetupDismissed(),
      ]);
      // Already locked locally, or the user has declined before — nothing to do.
      if (cancelled || pinSet || bioSet || dismissed) return;
      prompt();
    })();

    return () => {
      cancelled = true;
    };
  }, [loaded, prefs.biometricEnabled, sheet, form, toast]);
}
