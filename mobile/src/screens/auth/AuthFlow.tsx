/**
 * AuthFlow — RN port of the AuthApp orchestrator (MobileAuth.jsx:279-304).
 * `.m-page-enter` transition (mobile.css:173-179) re-fires on each screen
 * change: translateX 100%->0, opacity .4->1, 0.32s ease.
 */
import { useEffect, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ease } from '../../theme/tokens';
import { BackendUrlCard } from '../BackendUrlCard';
import { Welcome } from './Welcome';
import { Login } from './Login';
import { Signup } from './Signup';
import { ResetPassword } from './ResetPassword';

type AuthScreen = 'welcome' | 'login' | 'signup' | 'reset';
const ENTER_MS = 320;

// Dev-only: expose the backend-URL override before sign-in. Session restore
// against a rotated (dead) ngrok URL bounces the user to this signed-out flow;
// without a reachable override here they could not repoint the app. Gated by the
// same flag as the Settings card, so it is stripped from production builds.
const SHOW_DEV = process.env['EXPO_PUBLIC_SHOW_DEV_SETTINGS'] === '1';

export function AuthFlow() {
  const [screen, setScreen] = useState<AuthScreen>('welcome');
  const [resetEmail, setResetEmail] = useState('');
  const [devOpen, setDevOpen] = useState(false);
  const [devMsg, setDevMsg] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const progress = useSharedValue(1);
  // Read on the JS thread; Dimensions.get is a host function and must not be
  // called inside the worklet (throws on the UI runtime → SIGABRT in Expo Go).
  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: ENTER_MS, easing: ease });
  }, [screen, progress]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + 0.6 * progress.value,
    transform: [{ translateX: (1 - progress.value) * screenWidth }],
  }));

  const render = () => {
    switch (screen) {
      case 'welcome':
        return <Welcome onSignup={() => setScreen('signup')} onLogin={() => setScreen('login')} />;
      case 'login':
        return (
          <Login
            onBack={() => setScreen('welcome')}
            onSignup={() => setScreen('signup')}
            onForgot={(email) => {
              setResetEmail(email);
              setScreen('reset');
            }}
          />
        );
      case 'signup':
        return <Signup onBack={() => setScreen('welcome')} onLogin={() => setScreen('login')} />;
      case 'reset':
        return (
          <ResetPassword
            initialEmail={resetEmail}
            onBack={() => setScreen('login')}
            onDone={() => setScreen('login')}
          />
        );
    }
  };

  return (
    <>
      <Animated.View style={[styles.page, enterStyle]}>{render()}</Animated.View>
      {SHOW_DEV && (
        <>
          <Pressable
            style={[styles.devBtn, { top: insets.top + 8 }]}
            hitSlop={8}
            onPress={() => {
              setDevMsg(null);
              setDevOpen(true);
            }}
            accessibilityLabel="Open backend URL settings"
          >
            <Text style={styles.devBtnText}>⚙︎ Backend URL</Text>
          </Pressable>
          <Modal
            visible={devOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setDevOpen(false)}
          >
            <Pressable style={styles.backdrop} onPress={() => setDevOpen(false)}>
              {/* Inner press swallows taps so touching the card doesn't dismiss. */}
              <Pressable style={styles.sheet} onPress={() => {}}>
                {/* Inline confirmation: the root toast host renders behind this
                    native Modal, so echo the result here instead. */}
                <BackendUrlCard onChanged={(url) => setDevMsg(`Now using ${url}`)} />
                {devMsg ? <Text style={styles.devMsg}>{devMsg}</Text> : null}
                <Pressable style={styles.closeBtn} onPress={() => setDevOpen(false)}>
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  // Dev-only affordance — deliberately unobtrusive, static colors (renders over
  // varied auth backgrounds, not part of the themed design surface).
  devBtn: {
    position: 'absolute',
    right: 14,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 99,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 999,
  },
  devBtnText: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  sheet: { width: '100%' },
  devMsg: { color: 'rgba(255,255,255,0.85)', fontSize: 12, textAlign: 'center', marginTop: 4 },
  closeBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20 },
  closeText: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
});
