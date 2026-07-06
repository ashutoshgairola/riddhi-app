import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { hydrateBaseUrl } from '../api/baseUrl';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { PageBackground } from '../components/PageBackground';
import { FeedbackProvider } from '../feedback/FeedbackProvider';
import { PrefsProvider } from '../prefs/PrefsProvider';
import { AuthFlow } from '../screens/auth/AuthFlow';
import { LockScreen } from '../screens/auth/LockScreen';
import { OnboardingWizard } from '../screens/onboarding/Wizard';
import { ThemeProvider } from '../theme/ThemeProvider';
import { AppShell } from './AppShell';
import { NavProvider } from './navContext';

function AuthGate() {
  const { status } = useAuth();
  switch (status) {
    case 'loading':
      // Bare page background as splash — fonts are loaded, session restoring.
      return (
        <View style={{ flex: 1 }}>
          <PageBackground />
        </View>
      );
    case 'signedOut':
      return <AuthFlow />;
    case 'onboarding':
      return <OnboardingWizard />;
    case 'locked':
      return <LockScreen />;
    case 'signedIn':
      return (
        <NavProvider>
          <AppShell />
        </NavProvider>
      );
  }
}

export default function Root() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const [urlReady, setUrlReady] = useState(false);
  useEffect(() => {
    hydrateBaseUrl().finally(() => setUrlReady(true));
  }, []);

  if (!fontsLoaded || !urlReady) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FeedbackProvider>
          <AuthProvider>
            <PrefsProvider>
              <AuthGate />
            </PrefsProvider>
          </AuthProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
