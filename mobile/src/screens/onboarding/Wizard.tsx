import { Text, View } from 'react-native';
import { PageBackground } from '../../components/PageBackground';
import { useTheme } from '../../theme/ThemeProvider';
import { weight } from '../../theme/tokens';

export function OnboardingWizard() {
  const { t } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <PageBackground />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.text1, fontFamily: weight(700) }}>Onboarding — Tasks 9–10</Text>
      </View>
    </View>
  );
}
