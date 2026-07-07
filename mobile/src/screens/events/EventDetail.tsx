import type { ScreenEntry } from '../../app/navContext';
import { View, Text } from 'react-native';

export function EventDetail({ entry }: { entry: ScreenEntry }) {
  return (
    <View>
      <Text>Event Detail Screen</Text>
    </View>
  );
}
