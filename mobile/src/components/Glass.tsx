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
 * RN box-shadow equivalent, so it's emulated with a 1px SVG path stroked
 * along the rounded-rect top edge — it curves around the top corners and,
 * via a horizontal gradient stroke, fades gradually toward both ends.
 */
import { useId, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView, type BlurTint } from 'expo-blur';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

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
  // RN has no inset-shadow primitive, so pull just the color out and stroke
  // it along the top edge as a 1px SVG path. The path traces the actual
  // rounded-rect top (arc → straight → arc), so the sheen curves around the
  // top-left/top-right corners; a horizontal gradient stroke (transparent →
  // colour → colour → transparent) makes it brightest across the middle and
  // fade gradually toward both ends. Needs the surface width, so it renders
  // once `onLayout` reports it.
  const hiColor = t.glassHi.slice(t.glassHi.lastIndexOf(' ') + 1);
  const [hiW, setHiW] = useState(0);
  const gradId = 'glassHi-' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const onHiLayout = (e: LayoutChangeEvent) => setHiW(e.nativeEvent.layout.width);
  // Clamp corner radius so narrow surfaces (icon buttons) don't produce a
  // reversed straight segment; there the two arcs simply meet.
  const rr = Math.min(r, hiW / 2);
  const hiPath = `M0.5 ${rr} A ${rr} ${rr} 0 0 1 ${rr} 0.5 L ${hiW - rr} 0.5 A ${rr} ${rr} 0 0 1 ${hiW - 0.5} ${rr}`;

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
        <View style={[styles.hiLight, { height: r }]} pointerEvents="none" onLayout={onHiLayout}>
          {hiW > 0 && (
            <Svg width={hiW} height={r} pointerEvents="none">
              <Defs>
                <SvgGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={hiColor} stopOpacity={0} />
                  <Stop offset="0.12" stopColor={hiColor} stopOpacity={0.2} />
                  <Stop offset="0.88" stopColor={hiColor} stopOpacity={0.2} />
                  <Stop offset="1" stopColor={hiColor} stopOpacity={0} />
                </SvgGradient>
              </Defs>
              <Path d={hiPath} stroke={`url(#${gradId})`} strokeWidth={1} fill="none" />
            </Svg>
          )}
        </View>
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
    // Host for the top-edge SVG sheen. Spans the full width and just the
    // top-corner band (height set inline to the radius) so the stroked path
    // has room to curve around both top corners. `height` is applied inline.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
