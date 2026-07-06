/**
 * AuthFlow — RN port of the AuthApp orchestrator (MobileAuth.jsx:279-304).
 * `.m-page-enter` transition (mobile.css:173-179) re-fires on each screen
 * change: translateX 100%->0, opacity .4->1, 0.32s ease.
 */
import { useEffect, useState } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ease } from '../../theme/tokens';
import { Welcome } from './Welcome';
import { Login } from './Login';
import { Signup } from './Signup';

type AuthScreen = 'welcome' | 'login' | 'signup';
const ENTER_MS = 320;

export function AuthFlow() {
  const [screen, setScreen] = useState<AuthScreen>('welcome');
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
        return <Login onBack={() => setScreen('welcome')} onSignup={() => setScreen('signup')} />;
      case 'signup':
        return <Signup onBack={() => setScreen('welcome')} onLogin={() => setScreen('login')} />;
    }
  };

  return <Animated.View style={[styles.page, enterStyle]}>{render()}</Animated.View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
});
