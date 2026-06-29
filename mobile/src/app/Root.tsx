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

import { GlassCard } from '../components/Glass';
import { PageBackground } from '../components/PageBackground';
import { FeedbackProvider, useFeedback } from '../feedback/FeedbackProvider';
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
        <FeedbackProvider>
          <NavigationContainer>
            {/* TODO(Task 3.1): replace placeholder with AppShell */}
            <Placeholder />
          </NavigationContainer>
        </FeedbackProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Placeholder() {
  const { t, toggle } = useTheme();
  // THROWAWAY: proves FeedbackProvider works end to end (Task 2.3). Remove
  // once AppShell (Task 3.1) lands and screens exercise toast()/sheet()
  // themselves.
  const { toast, sheet } = useFeedback();

  return (
    <View style={styles.placeholder}>
      <PageBackground />
      <GlassCard style={styles.demoCard}>
        <Text style={[styles.title, { color: t.text1, fontFamily: weight(700) }]}>Riddhi</Text>
        <Pressable style={[styles.toggleBtn, { backgroundColor: t.em }]} onPress={toggle}>
          <Text style={[styles.toggleLabel, { color: t.bg, fontFamily: weight(600) }]}>
            Toggle theme
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, { backgroundColor: t.glassBg2 }]}
          onPress={() => toast('Saved', '✓')}
        >
          <Text style={[styles.toggleLabel, { color: t.text1, fontFamily: weight(600) }]}>
            Demo: toast
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, { backgroundColor: t.glassBg2 }]}
          onPress={() =>
            sheet({
              title: 'Demo options',
              options: [
                { label: 'Edit', icon: '✏️', onPress: () => toast('Edited', '✓') },
                { label: 'Delete', icon: '🗑️', danger: true, onPress: () => toast('Deleted', '🗑️') },
              ],
            })
          }
        >
          <Text style={[styles.toggleLabel, { color: t.text1, fontFamily: weight(600) }]}>
            Demo: sheet
          </Text>
        </Pressable>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoCard: {
    alignItems: 'center',
    gap: 16,
    width: '80%',
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
