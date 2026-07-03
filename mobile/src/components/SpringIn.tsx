/**
 * SpringIn — RN port of the `.m-spring` card-entrance animation.
 *
 * Source of truth: project/riddhi/mobile.css
 *  - `@keyframes springIn` (lines 635–638):
 *      0%   { opacity: 0; transform: translateY(14px) scale(0.96); }
 *      100% { opacity: 1; transform: translateY(0) scale(1); }
 *  - `.m-spring { animation: springIn .5s var(--spring) backwards; }`
 *    (lines 640–642) — `.5s` duration, `--spring` easing
 *    (`cubic-bezier(.34, 1.56, .64, 1)`, see `theme/tokens.ts`'s
 *    `spring`/`springBezier`), `backwards` fill-mode (element sits at the
 *    0% frame — opacity 0 — until its `animation-delay` elapses, so
 *    staggered siblings don't flash at their end state before their turn).
 *
 * Usage sites set a per-element `animationDelay` in seconds (e.g.
 * `animationDelay: '.06s'`, `` `${0.08 + gi * 0.04}s` ``) — this component's
 * `delay` prop is the RN equivalent in **milliseconds** (seconds * 1000),
 * applied via `withDelay`.
 *
 * RN has no `animation-fill-mode: backwards` — mimicked by initializing the
 * shared values at the 0% frame (opacity 0, translateY 14, scale 0.96) and
 * only starting the `withDelay(delay, withTiming(...))` tween on mount, so
 * the view is invisible until its delay elapses, matching the CSS behavior.
 */
import { useEffect } from 'react';
import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { spring } from '../theme/tokens';

// `.5s` (mobile.css:641).
const SPRING_IN_DURATION_MS = 500;

export interface SpringInProps extends PropsWithChildren {
  /** `animation-delay`, in milliseconds (CSS source values are in seconds
   * — multiply by 1000 when transcribing, e.g. `.06s` -> `60`). */
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

export function SpringIn({ delay = 0, style, children }: SpringInProps) {
  // 0% keyframe: opacity 0, translateY(14px) scale(0.96).
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: SPRING_IN_DURATION_MS, easing: spring }));
    // Mount-only: the entrance should play once, not re-trigger on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: 14 * (1 - progress.value) },
      { scale: 0.96 + 0.04 * progress.value },
    ],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
