import type { ScreenEntry } from '../../app/navContext';
import { View, Text } from 'react-native';

export function Events({ entry }: { entry: ScreenEntry }) {
  return (
    <View>
      <Text>Events Screen</Text>
    </View>
  );
}
