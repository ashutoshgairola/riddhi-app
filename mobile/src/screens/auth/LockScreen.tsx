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
import { getBiometricEnabled, getPinLength, hasPin } from '../../auth/tokenStore';
import { PageBackground } from '../../components/PageBackground';
import { useFeedback } from '../../feedback/FeedbackProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, weight } from '../../theme/tokens';
import { OBKeypad } from '../onboarding/obUi';
import { FaceIdGlyph, PressableScale, SpringIn, Wordmark } from './authUi';

const MAX_ATTEMPTS = 5;

interface LockMethods {
  pin: boolean;
  biometric: boolean;
}

export function LockScreen() {
  const { t } = useTheme();
  const { toast, sheet } = useFeedback();
  const { user, unlockWithBiometric, unlockWithPin, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const bioLabel = useBiometricLabel();

  const [methods, setMethods] = useState<LockMethods | null>(null);
  const [pinLength, setPinLength] = useState(4);
  const [pin, setPin] = useState('');
  const attempts = useRef(0);
  const checking = useRef(false);
  const autoPrompted = useRef(false);

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
    const ok = await unlockWithBiometric();
    if (!ok && methods?.pin) toast(`${bioLabel} didn't match — use your PIN`, '⚠️');
    else if (!ok) toast(`${bioLabel} didn't match — try again`, '⚠️');
  }, [unlockWithBiometric, methods, bioLabel, toast]);

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
    setPin((p) => {
      if (k === 'del') return p.slice(0, -1);
      if (k === '.') return p;
      if (p.length >= pinLength) return p;
      const next = p + k;
      if (next.length === pinLength) void submit(next);
      return next;
    });
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
          paddingBottom: insets.bottom + 16,
          paddingHorizontal: 26,
        }}
      >
        <SpringIn style={{ alignItems: 'center' }}>
          <Wordmark size={40} />
          <Text style={[styles.title, { color: t.text1, fontFamily: weight(800) }]}>
            Welcome back{firstName ? `, ${firstName}` : ''}
          </Text>
          <Text style={[styles.sub, { color: t.text2, fontFamily: weight(500) }]}>
            {methods.pin ? 'Enter your PIN to unlock' : `Unlock with ${bioLabel}`}
          </Text>
        </SpringIn>

        <SpringIn delay={50} style={{ marginTop: 'auto' }}>
          {methods.pin ? (
            <>
              {/* PIN dots (MobileOnboard.jsx:281-286) */}
              <View style={styles.dots}>
                {Array.from({ length: pinLength }).map((_, i) => (
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

          {methods.biometric ? (
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
    marginTop: 24,
  },
  sub: {
    fontSize: 14,
    marginTop: 6,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingBottom: 26,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  bioBtn: {
    height: 50,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  logout: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 14,
  },
});
