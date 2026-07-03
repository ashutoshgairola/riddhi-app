/**
 * Liquid-glass primitives — RN port of `.m-card` / the generic glass
 * surface treatment from the web app's `mobile.css`.
 *
 * Source of truth: project/riddhi/mobile.css
 *  - `--glass-blur: blur(22px) saturate(150%)` (line 42)
 *  - `.m-card` (lines 442–451): background `var(--glass-bg)`, 1px border
 *    `var(--glass-brd)`, `border-radius: var(--r-xl)` (26), backdrop blur,
 *    `box-shadow: var(--glass-hi)` (inset top highlight), `padding: 18px`.
 *
 * `expo-blur`'s `BlurView` approximates the CSS `backdrop-filter: blur(22px)`
 * (there's no native `saturate()` knob, so we lean on a slightly higher
 * intensity to keep the frosted feel). The `glassHi` inset highlight has no
 * RN box-shadow equivalent, so it's emulated with a 1px absolutely
 * positioned View along the top inner edge.
 */
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView, type BlurTint } from 'expo-blur';

import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/tokens';

export interface GlassViewProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  /** BlurView intensity (1–100). Defaults to 30 — tuned to read like the
   * CSS `blur(22px) saturate(150%)` glass on top of `PageBackground`. */
  intensity?: number;
  /** Corner radius. Defaults to `radius.xl` (26), matching `.m-card`. */
  radius?: number;
  /** Inner padding. Defaults to 0 (bare glass surface — topbar/tabbar/
   * sheet/toast usages supply their own padding). */
  padding?: number;
}

export type GlassCardProps = Omit<GlassViewProps, 'padding'>;

/**
 * Bare glass surface: blurred backdrop + `glassBg` tint + `glassBrd` 1px
 * border + a top inset highlight emulating `glassHi`. No default padding —
 * used for topbar/tabbar/sheet/toast surfaces that manage their own insets.
 */
export function GlassView({ style, intensity = 30, radius: r = radius.xl, padding = 0, children }: GlassViewProps) {
  const { t, mode } = useTheme();
  const tint: BlurTint = mode === 'light' ? 'light' : 'dark';
  // `glassHi` is authored as a CSS shadow string (`inset 0 1px 0 <color>`);
  // RN has no inset-shadow primitive, so pull just the color out and render
  // it as a 1px highlight View along the top inner edge.
  const hiColor = t.glassHi.slice(t.glassHi.lastIndexOf(' ') + 1);

  return (
    <View style={[{ borderRadius: r, overflow: 'hidden' }, style]}>
      <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
      <View
        style={[
          styles.overlay,
          {
            borderRadius: r,
            padding,
            backgroundColor: t.glassBg,
            borderColor: t.glassBrd,
          },
        ]}
      >
        <View style={[styles.hiLight, { backgroundColor: hiColor }]} pointerEvents="none" />
        {children}
      </View>
    </View>
  );
}

/**
 * `.m-card` — `GlassView` with the card defaults: 18px padding, `xl` (26)
 * radius, and a slightly higher blur intensity (40 vs. `GlassView`'s
 * generic 30) — tuned closer to the CSS `blur(22px)` glass feel for the
 * card surface specifically. Thin wrapper so card and bare-glass usages
 * share one implementation.
 */
export function GlassCard({ style, children }: GlassCardProps) {
  return (
    <GlassView style={style} intensity={40} radius={radius.xl} padding={18}>
      {children}
    </GlassView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    borderWidth: 1,
  },
  hiLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
});
