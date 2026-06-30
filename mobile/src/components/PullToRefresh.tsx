/**
 * PullToRefresh — pull-down-to-refresh wrapper around a vertically
 * scrollable area.
 *
 * Source of truth: project/riddhi/MobileCore.jsx:116–163 (`PullToRefresh`) +
 * `.m-ptr*` / `ptrSpin` styles (project/riddhi/mobile.css:658–677).
 *
 * Behavior parity with the web component:
 *  - The pull gesture only engages while the scroller is at the top
 *    (`scrollTop <= 0` on web — here, the latest `onScroll` `contentOffset.y`
 *    tracked in a shared value, read inside the gesture's `shouldHandle`/
 *    `onChange`).
 *  - Pull distance is the vertical drag distance scaled down and capped:
 *    `pull = min(dy * 0.5, 90)` (web line 132).
 *  - While dragging, content is pushed down by `translateY(pull)` with no
 *    transition (web: `transition: startY.current ? 'none' : ...`) — the
 *    Reanimated equivalent is simply setting the shared value directly
 *    inside `onChange`, no `withTiming`.
 *  - On release (web `onTouchEnd`, lines 135–148):
 *     - `pull > 60` → enter `refreshing`, hold the spinner zone at 60,
 *       wait 900ms, then call `onRefresh` and animate back to 0.
 *     - otherwise → snap back to 0 (web: a same-frame `setPull(0)`; here
 *       animated with the shared `ease` curve, matching the "settle" feel
 *       of the content's `.transform .35s var(--ease)` transition that
 *       applies once the finger lifts).
 *  - Spinner (`.m-ptr-spinner`): 26x26 circle, 2.5px `emDim` border with an
 *    `em`-colored top border (the "notch" that reads as rotation), centered
 *    in an 80px-tall absolutely-positioned top zone (`.m-ptr`, lines
 *    659–668). Opacity tracks `pull / 60` (web line 153), clamped to 1.
 *    While dragging, rotation is `pull * 4` degrees (web line 155); while
 *    `refreshing`, it spins continuously — web's `ptrSpin` keyframe
 *    (360deg / 0.7s linear infinite), reproduced with
 *    `withRepeat(withTiming(360, { duration: 700, easing: Easing.linear }), -1)`.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeProvider';
import { ease } from '../theme/tokens';

/** Drag-to-pull scale factor — web parity (`dy * 0.5`). */
const PULL_FACTOR = 0.5;
/** Max pull distance (px) — web parity (`min(..., 90)`). */
const PULL_CAP = 90;
/** Pull distance past which a release triggers a refresh — web parity (`pull > 60`). */
const REFRESH_THRESHOLD = 60;
/** Simulated refresh duration (ms) before `onRefresh` fires and the spinner settles — web parity. */
const REFRESH_DURATION_MS = 900;
/** Settle/snap-back animation duration (ms) — web's content `transform .35s var(--ease)`. */
const SETTLE_DURATION_MS = 350;
/** Spinner zone height (px) — web `.m-ptr { height: 80px }`. */
const PTR_ZONE_HEIGHT = 80;
/** Spinner diameter (px) — web `.m-ptr-spinner { width/height: 26px }`. */
const SPINNER_SIZE = 26;
/** Spinner border width (px) — web `.m-ptr-spinner { border: 2.5px solid ... }`. */
const SPINNER_BORDER_WIDTH = 2.5;
/** Continuous-spin duration (ms) — web `ptrSpin 0.7s linear infinite`. */
const SPIN_DURATION_MS = 700;
/** Degrees of spinner rotation per pixel of pull while dragging — web parity (`pull * 4`). */
const DRAG_ROTATE_FACTOR = 4;

export interface PullToRefreshProps {
  onRefresh?: () => void;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** Forwarded scroll listener on the inner `ScrollView` — composes with the
   * gesture's own scroll tracking. Lets callers mirror the web's
   * `onScroll={e => setScrolled(e.target.scrollTop > 8)}` pattern (e.g.
   * MobileHome.jsx:95) for a topbar "scrolled" state. */
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

export function PullToRefresh({ onRefresh, children, contentStyle, onScroll }: PullToRefreshProps) {
  const { t } = useTheme();

  // Latest vertical scroll offset of the inner ScrollView — the pan gesture
  // only converts drag into `pull` while this is <= 0 (web: `scrollTop <= 0`).
  const scrollY = useSharedValue(0);
  // Pull distance, in px (0..PULL_CAP). Drives both the content translateY
  // and the spinner zone height/opacity/rotation.
  const pull = useSharedValue(0);
  // Continuous spin angle (degrees), looped via withRepeat while refreshing.
  const spinAngle = useSharedValue(0);
  // Mirrors `refreshing` state into worklet-land so the animated style can
  // pick rotation source (drag-driven vs. continuous spin) without a JS
  // round-trip.
  const refreshing = useSharedValue(false);
  // True while a finger is actively dragging — content translate has no
  // transition while this is set (web: `transition: startY.current ? 'none' : ...`).
  // Guards against a stale 900ms refresh timer resolving after a fast
  // pull-release-pull-release sequence re-enters the refreshing state.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending refresh timer if the wrapper unmounts mid-refresh
  // (e.g. navigating away during the 900ms window) so onRefresh and the
  // shared-value writes don't fire after unmount.
  useEffect(
    () => () => {
      if (refreshTimerRef.current != null) clearTimeout(refreshTimerRef.current);
    },
    [],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.value = e.nativeEvent.contentOffset.y;
      onScroll?.(e);
    },
    [scrollY, onScroll],
  );

  const startRefresh = useCallback(() => {
    if (refreshTimerRef.current != null) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshing.value = true;
    pull.value = withTiming(REFRESH_THRESHOLD, { duration: 150, easing: ease });
    spinAngle.value = 0;
    spinAngle.value = withRepeat(withTiming(360, { duration: SPIN_DURATION_MS, easing: Easing.linear }), -1);

    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      refreshing.value = false;
      cancelAnimation(spinAngle);
      spinAngle.value = 0;
      pull.value = withTiming(0, { duration: SETTLE_DURATION_MS, easing: ease });
      onRefresh?.();
    }, REFRESH_DURATION_MS);
  }, [onRefresh, pull, refreshing, spinAngle]);

  const settleClosed = useCallback(() => {
    pull.value = withTiming(0, { duration: SETTLE_DURATION_MS, easing: ease });
  }, [pull]);

  const pan = Gesture.Pan()
    // Only claim the gesture once the finger has moved >=10px downward; any
    // upward movement first fails the pan immediately so native ScrollView
    // bounce/scroll handles it instead. This, combined with the `scrollY`
    // guard below, is what lets the pan "coexist" with the ScrollView
    // without a simultaneous-gesture ref dance: most touches (taps, normal
    // scrolling, upward drags) never activate the pan at all.
    .activeOffsetY(10)
    .failOffsetY(-10)
    .onChange((e) => {
      // Only let the gesture push content while the scroller is pinned to
      // the top and the drag is downward — matches the web's combined
      // `dy > 0 && ref.current.scrollTop <= 0` guard.
      if (scrollY.value > 0) return;
      if (refreshing.value) return;
      const next = pull.value + e.changeY * PULL_FACTOR;
      if (next <= 0) {
        pull.value = 0;
        return;
      }
      pull.value = Math.min(next, PULL_CAP);
    })
    .onEnd(() => {
      if (refreshing.value) return;
      if (pull.value > REFRESH_THRESHOLD) {
        runOnJS(startRefresh)();
      } else {
        runOnJS(settleClosed)();
      }
    });

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pull.value }],
  }));

  const zoneAnimatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(pull.value / REFRESH_THRESHOLD, 1),
  }));

  const spinnerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${refreshing.value ? spinAngle.value : pull.value * DRAG_ROTATE_FACTOR}deg` }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.root}>
        <Animated.View style={[styles.ptrZone, zoneAnimatedStyle]} pointerEvents="none">
          <Animated.View
            style={[
              styles.spinner,
              spinnerAnimatedStyle,
              { borderColor: t.emDim, borderTopColor: t.em },
            ]}
          />
        </Animated.View>

        <Animated.View style={[styles.contentWrap, contentAnimatedStyle]}>
          <ScrollView
            contentContainerStyle={contentStyle}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  ptrZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: PTR_ZONE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  spinner: {
    width: SPINNER_SIZE,
    height: SPINNER_SIZE,
    borderRadius: SPINNER_SIZE / 2,
    borderWidth: SPINNER_BORDER_WIDTH,
  },
  contentWrap: {
    flex: 1,
  },
});
