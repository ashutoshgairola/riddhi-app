/**
 * LockScreen — app-lock enforcement (spec 2026-07-06-app-lock-design.md).
 * PIN dots + keypad reuse the onboarding Secure step's visual language
 * (project/riddhi/MobileOnboard.jsx OBSecure); biometric button matches the
 * Login screen's glass Face ID button (MobileAuth.jsx:172-179).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthProvider';
import { useBiometricLabel } from '../../auth/biometricLabel';
import { needsPinBackfill, type LockMethods } from '../../auth/lockPolicy';
import { getBiometricEnabled, getPinLength, hasPin, savePin } from '../../auth/tokenStore';
import { PageBackground } from '../../components/PageBackground';
import { useFeedback } from '../../feedback/FeedbackProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space, weight } from '../../theme/tokens';
import { OBKeypad } from '../onboarding/obUi';
import { FaceIdGlyph, PressableScale, SpringIn, Wordmark } from './authUi';

const MAX_ATTEMPTS = 5;

export function LockScreen() {
  const { t } = useTheme();
  const { toast, sheet } = useFeedback();
  const { user, unlockWithBiometric, authenticateBiometric, finishUnlock, unlockWithPin, logout } =
    useAuth();
  const insets = useSafeAreaInsets();
  const bioLabel = useBiometricLabel();

  const [methods, setMethods] = useState<LockMethods | null>(null);
  const [pinLength, setPinLength] = useState(4);
  const [pin, setPin] = useState('');
  const attempts = useRef(0);
  const checking = useRef(false);
  const autoPrompted = useRef(false);

  // Backfill mode for biometric-only devices: after biometric auth we make the
  // user create a 4-digit backup PIN before entering the app (spec § invariant).
  const [backfill, setBackfill] = useState<'off' | 'create' | 'confirm'>('off');
  const firstPin = useRef('');
  const BACKFILL_LEN = 4;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [pinSet, bio, len] = await Promise.all([
        hasPin(),
        getBiometricEnabled(),
        getPinLength(),
      ]);
      if (cancelled) return;
      if (len) setPinLength(len);
      setMethods({ pin: pinSet, biometric: bio });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const promptBiometric = useCallback(async () => {
    // Biometric-only device: authenticate, then require a backup PIN instead
    // of unlocking straight into the app.
    if (methods && needsPinBackfill(methods)) {
      const ok = await authenticateBiometric();
      if (ok) {
        setPin('');
        firstPin.current = '';
        setBackfill('create');
      } else {
        toast(`${bioLabel} didn't match — try again`, '⚠️');
      }
      return;
    }
    const ok = await unlockWithBiometric();
    if (!ok && methods?.pin) toast(`${bioLabel} didn't match — use your PIN`, '⚠️');
    else if (!ok) toast(`${bioLabel} didn't match — try again`, '⚠️');
  }, [unlockWithBiometric, authenticateBiometric, methods, bioLabel, toast]);

  // One automatic prompt as soon as we know biometric is enabled.
  useEffect(() => {
    if (!methods?.biometric || autoPrompted.current) return;
    autoPrompted.current = true;
    void promptBiometric();
  }, [methods, promptBiometric]);

  const submit = useCallback(
    async (candidate: string) => {
      checking.current = true;
      const ok = await unlockWithPin(candidate);
      checking.current = false;
      if (ok) return;
      attempts.current += 1;
      setPin('');
      if (attempts.current >= MAX_ATTEMPTS) {
        toast('Too many attempts — please log in again', '🔒');
        await logout();
        return;
      }
      toast(`Incorrect PIN — ${MAX_ATTEMPTS - attempts.current} tries left`, '⚠️');
    },
    [unlockWithPin, logout, toast],
  );

  const onKey = (k: string) => {
    if (checking.current) return;
    const len = backfill === 'off' ? pinLength : BACKFILL_LEN;
    setPin((p) => {
      if (k === 'del') return p.slice(0, -1);
      if (k === '.') return p;
      if (p.length >= len) return p;
      const next = p + k;
      if (next.length === len) {
        if (backfill === 'off') void submit(next);
        else void onBackfillComplete(next);
      }
      return next;
    });
  };

  const onBackfillComplete = async (candidate: string) => {
    if (backfill === 'create') {
      firstPin.current = candidate;
      setPin('');
      setBackfill('confirm');
      return;
    }
    // confirm
    if (candidate !== firstPin.current) {
      toast("PINs don't match — try again", '⚠️');
      firstPin.current = '';
      setPin('');
      setBackfill('create');
      return;
    }
    try {
      await savePin(candidate);
    } catch {
      toast("Couldn't save your PIN — try again", '⚠️');
      firstPin.current = '';
      setPin('');
      setBackfill('create');
      return;
    }
    finishUnlock();
  };

  const confirmLogout = () =>
    sheet({
      title: 'Log out of Riddhi?',
      options: [
        { label: 'Log out', icon: '🚪', danger: true, onPress: () => void logout() },
        { label: 'Cancel' },
      ],
    });

  const firstName = user?.name?.split(/\s+/)[0];

  if (!methods) {
    // Avoid a flash of the wrong unlock UI while the stored flags load.
    return (
      <View style={{ flex: 1 }}>
        <PageBackground />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <PageBackground />
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 64,
          paddingBottom: insets.bottom + space[16],
          paddingHorizontal: space[28],
        }}
      >
        <SpringIn style={{ alignItems: 'center' }}>
          <Wordmark size={40} />
          <Text style={[styles.title, { color: t.text1, fontFamily: weight(800) }]}>
            Welcome back{firstName ? `, ${firstName}` : ''}
          </Text>
          <Text style={[styles.sub, { color: t.text2, fontFamily: weight(500) }]}>
            {backfill === 'create'
              ? 'Create a backup PIN'
              : backfill === 'confirm'
                ? 'Confirm your backup PIN'
                : methods.pin
                  ? 'Enter your PIN to unlock'
                  : `Unlock with ${bioLabel}`}
          </Text>
        </SpringIn>

        <SpringIn delay={50} style={{ marginTop: 'auto' }}>
          {methods.pin || backfill !== 'off' ? (
            <>
              {/* PIN dots (MobileOnboard.jsx:281-286) */}
              <View style={styles.dots}>
                {Array.from({ length: backfill === 'off' ? pinLength : BACKFILL_LEN }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        backgroundColor: i < pin.length ? t.em : 'transparent',
                        borderColor: i < pin.length ? t.em : t.borderStr,
                        transform: [{ scale: i < pin.length ? 1.1 : 1 }],
                      },
                    ]}
                  />
                ))}
              </View>
              <OBKeypad onKey={onKey} />
            </>
          ) : null}

          {methods.biometric && backfill === 'off' ? (
            <PressableScale onPress={() => void promptBiometric()}>
              <View style={[styles.bioBtn, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
                <FaceIdGlyph color={t.text1} />
                <Text style={{ fontSize: 14, color: t.text1, fontFamily: weight(600) }}>
                  Use {bioLabel}
                </Text>
              </View>
            </PressableScale>
          ) : null}

          <Pressable onPress={confirmLogout} style={styles.logout}>
            <Text style={{ fontSize: 13.5, color: t.text3, fontFamily: weight(600) }}>Log out</Text>
          </Pressable>
        </SpringIn>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 22,
    letterSpacing: -0.66, // -0.03em of 22px
    marginTop: space[24],
  },
  sub: {
    fontSize: 14,
    marginTop: space[6],
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space[16],
    paddingBottom: space[28],
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  bioBtn: {
    height: 50,
    marginTop: space[14],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[10],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  logout: {
    alignItems: 'center',
    paddingVertical: space[8],
    marginTop: space[14],
  },
});
