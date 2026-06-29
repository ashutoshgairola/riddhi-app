/**
 * MSeg — sliding segmented control.
 *
 * Source of truth: project/riddhi/MobileCore.jsx:81–113 (`MSeg`) +
 * `.m-seg*` styles (project/riddhi/mobile.css:551–585).
 *
 * Web behavior: an absolutely-positioned `.m-seg-indicator` pill animates
 * `transform: translateX(...)` + `width` to the active button's measured
 * rect (`getBoundingClientRect`), with `transition: transform .35s
 * var(--spring), width .35s var(--spring)`. Labels sit above the indicator
 * (`z-index: 2` vs. `1`) and switch color `text2` -> `text1` when active
 * (`.25s` color transition — not reproduced as an animation here, RN just
 * swaps the color, which is visually indistinguishable for a 250ms tint
 * change on a small label).
 *
 * RN port: there's no DOM rect measurement, so each button reports its own
 * `x`/`width` via `onLayout` (relative to the `.m-seg` container, since
 * buttons are direct flex children of it — `onLayout`'s `x` is already
 * parent-relative). Once the active button's layout is known, the
 * indicator's `translateX`/`width` shared values animate to it via
 * `withTiming(..., { duration: 350, easing: spring })`, matching the CSS
 * `.35s var(--spring)` (spring = `cubic-bezier(.34,1.56,.64,1)`, see
 * `theme/tokens.ts`).
 *
 * First-paint handling: the indicator starts with `width: 0` and is only
 * rendered (`opacity`) once at least one layout has been measured, so it
 * never visibly animates in from `x=0` before any button has reported its
 * real position — the first measurement snaps the indicator into place
 * instantly (no animation), and only subsequent `value`/options changes
 * animate.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeProvider';
import { radius, spring, weight } from '../theme/tokens';

/** `.m-seg-indicator` / `.m-seg-btn` transition duration (mobile.css:570,583 — `.35s`). */
const INDICATOR_DURATION_MS = 350;

export type MSegOption<T extends string> = T | { value: T; label: string };

export interface MSegProps<T extends string> {
  options: MSegOption<T>[];
  value: T;
  onChange: (v: T) => void;
}

function optionValue<T extends string>(o: MSegOption<T>): T {
  return typeof o === 'string' ? o : o.value;
}

function optionLabel<T extends string>(o: MSegOption<T>): string {
  return typeof o === 'string' ? o : o.label;
}

export function MSeg<T extends string>({ options, value, onChange }: MSegProps<T>) {
  const { t } = useTheme();

  // Measured per-button layout (x, width), keyed by index — `onLayout`'s
  // `x` is already relative to the `.m-seg` flex container since buttons
  // are its direct children.
  const layoutsRef = useRef<Map<number, { x: number; width: number }>>(new Map());
  const measuredOnceRef = useRef(false);

  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const [indicatorReady, setIndicatorReady] = useState(false);

  const activeIndex = options.findIndex((o) => optionValue(o) === value);

  const applyIndicator = useCallback((index: number, animate: boolean) => {
    const layout = layoutsRef.current.get(index);
    if (!layout) return;
    if (animate) {
      indicatorX.value = withTiming(layout.x, { duration: INDICATOR_DURATION_MS, easing: spring });
      indicatorWidth.value = withTiming(layout.width, { duration: INDICATOR_DURATION_MS, easing: spring });
    } else {
      indicatorX.value = layout.x;
      indicatorWidth.value = layout.width;
    }
    setIndicatorReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLayout = useCallback(
    (index: number) => (e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      layoutsRef.current.set(index, { x, width });
      if (index === activeIndex) {
        // First-ever measurement: snap with no animation so the pill never
        // visibly slides in from x=0 on mount.
        applyIndicator(index, measuredOnceRef.current);
        measuredOnceRef.current = true;
      }
    },
    [activeIndex, applyIndicator],
  );

  // `value`/`options` changing without a fresh `onLayout` (e.g. the active
  // option is switched programmatically, or by a tap — flex children don't
  // relayout just because a sibling's text color changed) still needs to
  // move the indicator to the new active button's already-cached layout.
  useEffect(() => {
    if (activeIndex < 0) return;
    applyIndicator(activeIndex, measuredOnceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, applyIndicator]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
    opacity: indicatorReady ? 1 : 0,
  }));

  return (
    <View style={[styles.seg, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
      <Animated.View
        style={[
          styles.indicator,
          indicatorStyle,
          { backgroundColor: t.glassBg2, borderColor: t.glassBrd2 },
        ]}
        pointerEvents="none"
      />
      {options.map((o, index) => {
        const v = optionValue(o);
        const l = optionLabel(o);
        const active = v === value;
        return (
          <Text
            key={v}
            onLayout={handleLayout(index)}
            onPress={() => onChange(v)}
            style={[
              styles.btn,
              {
                color: active ? t.text1 : t.text2,
                fontFamily: weight(600),
              },
            ]}
            numberOfLines={1}
          >
            {l}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: {
    flexDirection: 'row',
    position: 'relative',
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
  },
  btn: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 13.5,
    zIndex: 2,
  },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: 11,
    borderWidth: 1,
    zIndex: 1,
    // `glassHi` (inset highlight) has no RN box-shadow equivalent — see
    // `Glass.tsx`'s `hiLight` pattern. Skipped here since the indicator is
    // a small pill and the 1px `glassBrd2` border already reads as a subtle
    // raised edge; revisit if visual parity needs the highlight strip too.
    elevation: 2,
  },
});
