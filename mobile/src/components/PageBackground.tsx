/**
 * RN port of `.m-page` / `.m-page::before` from the web app's `mobile.css`
 * (lines 153–171, plus the light-theme overrides at lines 87–95).
 *
 * `.m-page` paints a vertical linear gradient; `.m-page::before` stacks
 * three radial-gradient "glow" blobs on top, each fading to transparent.
 * RN/`expo-linear-gradient` has no radial-gradient primitive, so each glow
 * is rendered as an absolutely-positioned `react-native-svg` ellipse using
 * `RadialGradient`, sized/positioned (as percentages of the page) to match
 * the CSS `radial-gradient(<rx>% <ry>% at <cx>% <cy>%, <color>, transparent <stop>%)`
 * call exactly.
 *
 * Source values (dark):
 *  background: linear-gradient(180deg, #1d1733 0%, #14101f 46%, #0b0912 100%)
 *  ::before:
 *    radial-gradient(95% 48% at 12% 6%,  rgba(150,120,240,0.22), transparent 60%)
 *    radial-gradient(70% 40% at 98% 26%, rgba(120,90,220,0.13),  transparent 62%)
 *    radial-gradient(80% 40% at 50% 104%, rgba(110,80,200,0.10), transparent 60%)
 *
 * Source values (light, mobile.css:87–95):
 *  background: linear-gradient(180deg, #e7e0fb 0%, #f1edfb 48%, #e9e4f6 100%)
 *  ::before: same rx/ry/cx/cy/transparent-stop geometry, colors swapped per
 *  `tokens.light.pageGlow`.
 *
 * `tokens.ts` keeps the flat gradient/glow colors (`pageGradient`,
 * `pageGlow`); the radial geometry (size %, position %, transparent stop)
 * is identical across themes and isn't tokenized, so it's transcribed here
 * directly from the CSS.
 */
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';

/** One `radial-gradient(<rx>% <ry>% at <cx>% <cy>%, color, transparent <stop>%)` blob. */
interface GlowSpec {
  /** Ellipse center, % of page width/height. */
  cx: number;
  cy: number;
  /** Ellipse radii, % of page width/height. */
  rx: number;
  ry: number;
  /** Stop position where the color fades to transparent, 0–1. */
  transparentStop: number;
}

// Geometry transcribed from `.m-page::before` (mobile.css:167–171) — identical
// for dark and light themes; only the colors (`pageGlow`) differ.
const GLOWS: GlowSpec[] = [
  { cx: 12, cy: 6, rx: 95, ry: 48, transparentStop: 0.6 }, // top-left
  { cx: 98, cy: 26, rx: 70, ry: 40, transparentStop: 0.62 }, // top-right
  { cx: 50, cy: 104, rx: 80, ry: 40, transparentStop: 0.6 }, // bottom-center
];

/**
 * Fills its parent with the `.m-page` base gradient + the three `::before`
 * radial glow blobs, switching colors by theme mode. Purely presentational
 * — render it absolutely behind page content (it fills via
 * `StyleSheet.absoluteFill`).
 */
export function PageBackground({ children }: PropsWithChildren = {}) {
  const { t, mode } = useTheme();
  const [stop0, stop46, stop100] = t.pageGradient;
  const [glowTL, glowTR, glowBC] = t.pageGlow;
  const glowColors = [glowTL, glowTR, glowBC];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[stop0, stop46, stop100]}
        locations={[0, mode === 'light' ? 0.48 : 0.46, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          {GLOWS.map((g, i) => (
            <RadialGradient
              key={i}
              id={`pageGlow${i}`}
              cx={`${g.cx}%`}
              cy={`${g.cy}%`}
              rx={`${g.rx}%`}
              ry={`${g.ry}%`}
              gradientUnits="objectBoundingBox"
            >
              <Stop offset={0} stopColor={glowColors[i]} stopOpacity={1} />
              <Stop offset={g.transparentStop} stopColor={glowColors[i]} stopOpacity={0} />
              <Stop offset={1} stopColor={glowColors[i]} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {GLOWS.map((g, i) => (
          <Ellipse
            key={i}
            cx={`${g.cx}%`}
            cy={`${g.cy}%`}
            rx={`${g.rx}%`}
            ry={`${g.ry}%`}
            fill={`url(#pageGlow${i})`}
          />
        ))}
      </Svg>
      {children}
    </View>
  );
}
