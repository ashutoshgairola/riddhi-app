import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { PageBackground } from '../components/PageBackground';
import { FeedbackProvider } from '../feedback/FeedbackProvider';
import { AuthFlow } from '../screens/auth/AuthFlow';
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

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FeedbackProvider>
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
