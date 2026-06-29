import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { NavigationContainer } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';

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
        <NavigationContainer>
          {/* TODO(Task 3.1): replace placeholder with AppShell */}
          <Placeholder />
        </NavigationContainer>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Placeholder() {
  const { t, toggle } = useTheme();

  return (
    <View style={[styles.placeholder, { backgroundColor: t.bg }]}>
      <Text style={[styles.title, { color: t.text1, fontFamily: weight(700) }]}>Riddhi</Text>
      <Pressable style={[styles.toggleBtn, { backgroundColor: t.em }]} onPress={toggle}>
        <Text style={[styles.toggleLabel, { color: t.bg, fontFamily: weight(600) }]}>
          Toggle theme
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontSize: 28,
  },
  toggleBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
  },
  toggleLabel: {
    fontSize: 14,
  },
});
