/**
 * ToolStatusChip — small inline chip shown while (and after) a tool runs
 * during a chat turn: "Looking up transactions…" with a pulsing dot while
 * running, a check/cross once finished.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { MI } from '../../components/icons';
import { useTheme } from '../../theme/ThemeProvider';
import { weight } from '../../theme/tokens';

export function ToolStatusChip({
  label,
  done,
  ok,
}: {
  label: string;
  done: boolean;
  ok?: boolean;
}) {
  const { t } = useTheme();
  const pulse = useSharedValue(0.4);

  useEffect(() => {
    if (!done) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = 1;
    }
    // pulse is a stable shared value ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={[styles.chip, { backgroundColor: t.bg1, borderColor: t.border }]}>
      {done ? (
        ok ? (
          <MI.check size={11} color={t.em} strokeWidth={3} />
        ) : (
          <MI.close size={16} color={t.red} strokeWidth={3} />
        )
      ) : (
        <Animated.View style={[styles.dot, { backgroundColor: t.em }, dotStyle]} />
      )}
      <Text style={[styles.label, { color: t.text3, fontFamily: weight(500) }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 13,
    borderWidth: 1,
    marginTop: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 11.5,
    flexShrink: 1,
  },
});
