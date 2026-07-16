import 'react-native-gesture-handler';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

import Root from './src/app/Root';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Root />
    </GestureHandlerRootView>
  );
}
