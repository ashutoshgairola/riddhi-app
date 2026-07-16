import React, { useEffect } from 'react';
import { View, Text, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

export default function MinimalReanimated() {
  const p = useSharedValue(0);
  useEffect(() => { p.value = withTiming(1, { duration: 500 }); }, []);
  // Reproduce AuthFlow.tsx:29 — Dimensions.get() called INSIDE the worklet
  const s = useAnimatedStyle(() => ({
    opacity: 0.4 + 0.6 * p.value,
    transform: [{ translateX: (1 - p.value) * Dimensions.get('window').width }],
  }));
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' }}>
      <Animated.View style={[{ width: 120, height: 120, backgroundColor: '#b6a4f3' }, s]} />
      <Text style={{ color: '#fff', marginTop: 20 }}>dims-in-worklet test</Text>
    </View>
  );
}
