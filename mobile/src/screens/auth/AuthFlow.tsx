import { Text, View } from 'react-native';
import { PageBackground } from '../../components/PageBackground';
import { useTheme } from '../../theme/ThemeProvider';
import { weight } from '../../theme/tokens';

export function AuthFlow() {
  const { t } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <PageBackground />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.text1, fontFamily: weight(700) }}>Auth flow — Tasks 6–8</Text>
      </View>
    </View>
  );
}
