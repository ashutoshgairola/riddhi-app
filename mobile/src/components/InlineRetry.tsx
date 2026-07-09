/**
 * InlineRetry — compact "Couldn't load — tap to retry" banner for read-path
 * failures. The write path already has a floating toast for failures (see
 * `src/feedback/FeedbackProvider.tsx`, e.g. "Couldn't save — try again");
 * this is the read-path counterpart, but rendered inline (in normal layout
 * flow, above/within the list or summary it stands in for) rather than as a
 * floating/absolute overlay, since a failed GET should replace the section
 * that would have shown data, not cover the whole screen.
 *
 * Visual language matches that toast: same pill shape, `t.toastBg`/
 * `t.toastBorder`/`t.toastShadow` tokens, 13.5px/600 message text.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';

export interface InlineRetryProps {
  onRetry: () => void;
  /** Override the default copy, e.g. "Couldn't load transactions". */
  message?: string;
}

/** Toast shadow strings pack an inset highlight + an ambient drop-shadow as
 * two rgba() clauses — same parsing approach as `FeedbackProvider.tsx`'s
 * `ambientShadowColor` (and `BottomSheet.tsx`'s equivalent), reused here so
 * this banner's shadow is theme-correct instead of a hardcoded black. */
function ambientShadowColor(toastShadow: string): string {
  const match = toastShadow.match(/rgba\([^)]*\)/g);
  return match?.[1] ?? '#000000';
}

export function InlineRetry({ onRetry, message = "Couldn't load — tap to retry" }: InlineRetryProps) {
  const { t } = useTheme();
  return (
    <Pressable onPress={onRetry} hitSlop={4} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      <View
        style={[
          styles.banner,
          {
            backgroundColor: t.toastBg,
            borderColor: t.toastBorder,
            shadowColor: ambientShadowColor(t.toastShadow),
          },
        ]}
      >
        <Text style={styles.icon}>📡</Text>
        <Text style={[styles.msg, { color: t.text1, fontFamily: weight(600) }]} numberOfLines={1}>
          {message}
        </Text>
        <Text style={[styles.cta, { color: t.em, fontFamily: weight(700) }]}>Retry</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 99,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 10 },
    // Opacity is 1 because `shadowColor` is itself an rgba string carrying
    // its own alpha (see `ambientShadowColor` above).
    shadowOpacity: 1,
    shadowRadius: 30,
    elevation: 10,
  },
  icon: {
    fontSize: 15,
  },
  msg: {
    fontSize: 13.5,
    flex: 1,
  },
  cta: {
    fontSize: 13,
  },
});
