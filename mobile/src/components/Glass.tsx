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
import { spacing } from '../theme/spacing';

export interface GlassViewProps extends PropsWithChildren {
  /** Styles the outer wrapper — placement props (margins, width/flex in a
   * parent row, overflow). Children render inside the inner overlay, so
   * content-layout props (flexDirection/alignItems/gap/padding overrides)
   * must go in `contentStyle` instead — on `style` they'd silently apply
   * to the wrapper, whose only children are the BlurView and the overlay. */
  style?: StyleProp<ViewStyle>;
  /** Styles the inner overlay that actually contains `children` — use for
   * content layout (row direction, alignment, gap) and padding overrides. */
  contentStyle?: StyleProp<ViewStyle>;
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
export function GlassView({ style, contentStyle, intensity = 30, radius: r = radius.xl, padding = 0, children }: GlassViewProps) {
  const { t, mode } = useTheme();
  const tint: BlurTint = mode === 'light' ? 'light' : 'dark';
  // `glassHi` is authored as a CSS shadow string (`inset 0 1px 0 <color>`);
  // RN has no inset-shadow primitive, so pull just the color out and render
  // it as a 1px highlight View along the top inner edge.
  const hiColor = t.glassHi.slice(t.glassHi.lastIndexOf(' ') + 1);

  return (
    // The 1px border lives on this outer wrapper, NOT the clipped overlay:
    // a border drawn at the same rounded rect the `overflow: 'hidden'` mask
    // clips against loses its outer half to the mask's antialiasing —
    // corners survive, straight edges mostly vanish ("broken" borders).
    <View
      style={[
        { borderRadius: r, borderWidth: 1, borderColor: t.glassBrd, overflow: 'hidden' },
        style,
      ]}
    >
      <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
      <View
        style={[
          styles.overlay,
          {
            borderRadius: r,
            padding,
            backgroundColor: t.glassBg,
          },
          contentStyle,
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
export function GlassCard({ style, contentStyle, children }: GlassCardProps) {
  return (
    <GlassView style={style} contentStyle={contentStyle} intensity={40} radius={radius.xl} padding={spacing.md}>
      {children}
    </GlassView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    // No `flex: 1` here: the overlay must size to its content. With a flex
    // basis of 0% it collapses to zero height whenever an ancestor imposes
    // a height constraint (e.g. DetectedCard's animated `maxHeight` wrap
    // rendered every card as a 2px sliver). Fixed-size hosts (IconButton)
    // pass explicit dimensions via `contentStyle` instead.
  },
  hiLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
});
