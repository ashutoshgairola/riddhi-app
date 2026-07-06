/**
 * SVG charts: MSparkline, WeekChart, MGroupedBars, MDonut.
 *
 * Source of truth:
 *  - MSparkline   — project/riddhi/MobileCore.jsx:165–186
 *  - WeekChart    — project/riddhi/MobileHome.jsx:15–59 (incl. `smoothPath`,
 *    Catmull-Rom → cubic bezier, ported verbatim below)
 *  - MGroupedBars — project/riddhi/MobileScreens.jsx:31–50
 *  - MDonut       — project/riddhi/MobileScreens.jsx:52–76
 *
 * All geometry (viewBox sizes, padding, radii, stroke widths) and animation
 * timings (durations/delays/easing) are transcribed 1:1 from the web
 * prototype's CSS transitions/keyframes. RN has no DOM CSS transitions, so
 * each web `transition`/`animation` becomes a Reanimated `useSharedValue` +
 * `withTiming`/`withDelay` driving an animated SVG prop via
 * `createAnimatedComponent(Path|Circle|Rect)`, or — for the grouped bars,
 * which are plain `<div>` height transitions in source — a `View` height
 * animation, per the brief ("Bars can also animate via Reanimated heights on
 * Animated.View if simpler than SVG").
 *
 * Shared `ease` token (mobile.css `--ease`, tokens.ts `ease`) =
 * cubic-bezier(.32,.72,0,1), used everywhere the source says `var(--ease)`.
 */
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';
import { ease, weight } from '../theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Stable-enough unique id for SVG `<Defs>` so multiple chart instances on
 * the same screen don't clash gradient ids (mirrors the source's
 * `Math.random().toString(36)` suffix). */
let gradientSeq = 0;
function nextGradientId(prefix: string): string {
  gradientSeq += 1;
  return `${prefix}-${gradientSeq}`;
}

// ════════════════════════════════════════════════════════════════════════
// MSparkline — project/riddhi/MobileCore.jsx:165–186
// ════════════════════════════════════════════════════════════════════════

export interface MSparklineProps {
  data: number[];
  color: string;
  height?: number;
}

export function MSparkline({ data, color, height = 48 }: MSparklineProps) {
  const id = useMemo(() => nextGradientId('msp'), []);
  const w = 100;

  const { path, area } = useMemo(() => {
    const mn = Math.min(...data);
    const mx = Math.max(...data);
    const rng = mx - mn || 1;
    const xs = data.map((_, i) => (i / (data.length - 1)) * w);
    const ys = data.map((v) => height - 4 - ((v - mn) / rng) * (height - 8));
    const p = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ');
    const a = `${p} L${xs[xs.length - 1]},${height} L0,${height} Z`;
    return { path: p, area: a };
  }, [data, height]);

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill={`url(#${id})`} />
      <Path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ════════════════════════════════════════════════════════════════════════
// WeekChart — project/riddhi/MobileHome.jsx:15–59
// ════════════════════════════════════════════════════════════════════════

/** Catmull-Rom → cubic bezier smoothing. Ported verbatim from
 * project/riddhi/MobileHome.jsx:16–26. Do not "clean up" — keep identical
 * to the source so future diffs against the prototype stay obvious. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6,
      c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6,
      c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Approximate length of the same Catmull-Rom cubic-bezier chain `smoothPath`
 * emits, by flattening each segment into short straight-line samples and
 * summing their lengths. `react-native-svg` doesn't support the SVG
 * `pathLength` attribute (web's `pathLength="1"` normalization trick used by
 * the source isn't available here), so the line draw-in below drives
 * `strokeDasharray`/`strokeDashoffset` in real px units derived from this
 * estimate instead of a normalized 0–1 range — same visual effect. */
function estimatePathLength(pts: [number, number][], samplesPerSegment = 16): number {
  if (pts.length < 2) return 0;
  let total = 0;
  let prev = pts[0];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6,
      c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6,
      c2y = p2[1] - (p3[1] - p1[1]) / 6;
    for (let s = 1; s <= samplesPerSegment; s++) {
      const u = s / samplesPerSegment;
      const mt = 1 - u;
      const x =
        mt * mt * mt * p1[0] + 3 * mt * mt * u * c1x + 3 * mt * u * u * c2x + u * u * u * p2[0];
      const y =
        mt * mt * mt * p1[1] + 3 * mt * mt * u * c1y + 3 * mt * u * u * c2y + u * u * u * p2[1];
      total += Math.hypot(x - prev[0], y - prev[1]);
      prev = [x, y];
    }
  }
  return total;
}

export interface WeekChartDatum {
  d: string;
  v: number;
}

export interface WeekChartProps {
  data: WeekChartDatum[];
  peakIdx: number;
}

// Source timings (MobileHome.jsx:46–50 + mobile.css `fadeIn`/`.m-draw`):
//  - line draw-in: stroke-dashoffset 1 -> 0, .. ease, no delay (`.m-draw`)
//    duration taken as 1.4s per the brief ("over 1.4s ease").
//  - area fade-in: opacity 0 -> 1, .9s ease, .5s delay
//  - peak dot fade-in: opacity 0 -> 1, .4s ease, 1.4s delay (after the line
//    finishes drawing)
const LINE_DRAW_MS = 1400;
const AREA_FADE_MS = 900;
const AREA_FADE_DELAY_MS = 500;
const PEAK_FADE_MS = 400;
const PEAK_FADE_DELAY_MS = 1400;

export function WeekChart({ data, peakIdx }: WeekChartProps) {
  const { t } = useTheme();
  const gradId = useMemo(() => nextGradientId('wkFill'), []);

  const W = 320,
    H = 130,
    pad = 16;

  const { line, area, px, py, xs, len } = useMemo(() => {
    // `|| 1` guards the all-zero week (empty-state fallback): max would be 0
    // and 0/0 = NaN, which crashes RNSVGPathParser natively (InvalidNumber).
    // Same idiom as MSparkline's `rng` above.
    const max = Math.max(...data.map((d) => d.v)) || 1;
    const xsLocal = data.map((_, i) => pad + (i / (data.length - 1)) * (W - pad * 2));
    const ysLocal = data.map((d) => H - 26 - (d.v / max) * (H - 50));
    const pts: [number, number][] = xsLocal.map((x, i) => [x, ysLocal[i]]);
    const lineLocal = smoothPath(pts);
    const areaLocal = `${lineLocal} L ${xsLocal[xsLocal.length - 1]},${H - 12} L ${xsLocal[0]},${H - 12} Z`;
    return {
      line: lineLocal,
      area: areaLocal,
      px: xsLocal[peakIdx],
      py: ysLocal[peakIdx],
      xs: xsLocal,
      len: estimatePathLength(pts),
    };
  }, [data, peakIdx]);

  const lineProgress = useSharedValue(0);
  const areaOpacity = useSharedValue(0);
  const peakOpacity = useSharedValue(0);

  useEffect(() => {
    // Reset then re-run the draw-in sequence whenever the underlying data
    // changes (matches the source, where the animations are CSS keyframes
    // that play once on mount/re-mount).
    lineProgress.value = 0;
    areaOpacity.value = 0;
    peakOpacity.value = 0;
    lineProgress.value = withTiming(1, { duration: LINE_DRAW_MS, easing: ease });
    areaOpacity.value = withDelay(AREA_FADE_DELAY_MS, withTiming(1, { duration: AREA_FADE_MS, easing: ease }));
    peakOpacity.value = withDelay(PEAK_FADE_DELAY_MS, withTiming(1, { duration: PEAK_FADE_MS, easing: ease }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line]);

  const areaAnimatedProps = useAnimatedProps(() => ({
    opacity: areaOpacity.value,
  }));
  const lineAnimatedProps = useAnimatedProps(() => ({
    // Source uses `pathLength="1"` + `strokeDasharray 1` + `strokeDashoffset`
    // animated 1 -> 0 (normalized draw-in). `react-native-svg` has no
    // `pathLength` attribute, so we reproduce the same effect in real px
    // units: dasharray = full estimated length (one unbroken dash), offset
    // animates from `len` (fully hidden) -> 0 (fully revealed).
    strokeDashoffset: (1 - lineProgress.value) * len,
  }));
  const peakAnimatedProps = useAnimatedProps(() => ({
    opacity: peakOpacity.value,
  }));

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={t.em} stopOpacity={0.32} />
          <Stop offset="100%" stopColor={t.em} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <AnimatedPath d={area} fill={`url(#${gradId})`} animatedProps={areaAnimatedProps} />
      <AnimatedPath
        d={line}
        strokeDasharray={[len, len]}
        fill="none"
        stroke={t.em}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        animatedProps={lineAnimatedProps}
      />
      {/* peak marker */}
      <Line
        x1={px}
        y1={py + 6}
        x2={px}
        y2={H - 14}
        stroke={t.em}
        strokeWidth={1}
        strokeDasharray="2 3"
        opacity={0.5}
      />
      <AnimatedCircle
        cx={px}
        cy={py}
        r={5.5}
        fill={t.bg1}
        stroke={t.em}
        strokeWidth={3}
        animatedProps={peakAnimatedProps}
      />
      {/* labels */}
      {data.map((d, i) => (
        <SvgText
          key={i}
          x={xs[i]}
          y={H - 1}
          textAnchor="middle"
          fontSize={9.5}
          fill={i === peakIdx ? t.text1 : t.text3}
          fontFamily={weight(i === peakIdx ? 700 : 500)}
        >
          {d.d}
        </SvgText>
      ))}
    </Svg>
  );
}

// ════════════════════════════════════════════════════════════════════════
// MGroupedBars — project/riddhi/MobileScreens.jsx:31–50
// ════════════════════════════════════════════════════════════════════════

export interface MGroupedBarsProps {
  inc: number[];
  exp: number[];
  labels: string[];
  h?: number;
}

// Source: height transition `.7s var(--ease) ${i*0.05}s` (inc) /
// `${i*0.05+0.03}s` (exp) — mobile.css MobileScreens.jsx:38–41.
const BAR_DURATION_MS = 700;
const BAR_STAGGER_MS = 50; // i * 0.05s
const BAR_EXP_EXTRA_DELAY_MS = 30; // + 0.03s

function GroupedBar({
  targetHeight,
  delayMs,
  color,
  opacity,
}: {
  targetHeight: number;
  delayMs: number;
  color: string;
  opacity: number;
}) {
  const height = useSharedValue(3); // minHeight:3 (source) is also the initial value pre-animation.

  useEffect(() => {
    height.value = withDelay(delayMs, withTiming(targetHeight, { duration: BAR_DURATION_MS, easing: ease }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetHeight, delayMs]);

  const style = useAnimatedStyle(() => ({
    height: Math.max(3, height.value),
  }));

  return (
    <Animated.View
      style={[styles.bar, style, { backgroundColor: color, opacity }]}
    />
  );
}

export function MGroupedBars({ inc, exp, labels, h = 130 }: MGroupedBarsProps) {
  const { t } = useTheme();
  const max = Math.max(...inc, ...exp);

  return (
    <View>
      <View style={[styles.barsRow, { height: h }]}>
        {labels.map((l, i) => (
          <View key={l} style={styles.barGroup}>
            <GroupedBar
              targetHeight={(inc[i] / max) * (h - 10)}
              delayMs={i * BAR_STAGGER_MS}
              color={t.em}
              opacity={0.85}
            />
            <GroupedBar
              targetHeight={(exp[i] / max) * (h - 10)}
              delayMs={i * BAR_STAGGER_MS + BAR_EXP_EXTRA_DELAY_MS}
              color={t.red}
              opacity={0.75}
            />
          </View>
        ))}
      </View>
      <View style={[styles.barLabelsRow, { borderTopColor: t.border }]}>
        {labels.map((l) => (
          <Animated.Text key={l} style={[styles.barLabel, { color: t.text3, fontFamily: weight(400) }]}>
            {l}
          </Animated.Text>
        ))}
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════
// MDonut — project/riddhi/MobileScreens.jsx:52–76
// ════════════════════════════════════════════════════════════════════════

export interface MDonutDatum {
  label?: string;
  value: number;
  color: string;
}

export interface MDonutProps {
  data: MDonutDatum[];
  total: number;
  size?: number;
}

// Source: `transition: stroke-dasharray .8s var(--ease) ${i*0.05}s`
// (MobileScreens.jsx:67).
const SLICE_DURATION_MS = 800;
const SLICE_STAGGER_MS = 50; // i * 0.05s

function DonutSlice({
  r,
  size,
  circumference,
  targetLen,
  dashOffset,
  delayMs,
  color,
}: {
  r: number;
  size: number;
  circumference: number;
  targetLen: number;
  dashOffset: number;
  delayMs: number;
  color: string;
}) {
  const len = useSharedValue(0);

  useEffect(() => {
    len.value = 0;
    len.value = withDelay(delayMs, withTiming(targetLen, { duration: SLICE_DURATION_MS, easing: ease }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetLen, delayMs]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: [len.value, circumference - len.value],
  }));

  return (
    <AnimatedCircle
      cx={size / 2}
      cy={size / 2}
      r={r}
      stroke={color}
      strokeWidth={14}
      fill="none"
      strokeDashoffset={dashOffset}
      transform={`rotate(-90 ${size / 2} ${size / 2})`}
      animatedProps={animatedProps}
    />
  );
}

export function MDonut({ data, total, size = 140 }: MDonutProps) {
  const { t } = useTheme();
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;

  const slices = useMemo(() => {
    let off = 0;
    return data.map((d) => {
      const len = (d.value / total) * c;
      const dashoff = -off;
      off += len;
      return { ...d, len, dashoff };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, total, c]);

  return (
    <View style={[styles.donutWrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.bg3} strokeWidth={14} fill="none" />
        {slices.map((s, i) => (
          <DonutSlice
            key={i}
            r={r}
            size={size}
            circumference={c}
            targetLen={s.len}
            dashOffset={s.dashoff}
            delayMs={i * SLICE_STAGGER_MS}
            color={s.color}
          />
        ))}
      </Svg>
      <View style={styles.donutCenter} pointerEvents="none">
        <Animated.Text style={[styles.donutTotalLabel, { color: t.text3, fontFamily: weight(600) }]}>
          Total
        </Animated.Text>
        <Animated.Text style={[styles.donutTotalValue, { color: t.text1, fontFamily: weight(700) }]}>
          ₹{(total / 1000).toFixed(0)}K
        </Animated.Text>
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Styles
// ════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  barGroup: {
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    alignItems: 'flex-end',
  },
  bar: {
    flex: 1,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    minHeight: 3,
  },
  barLabelsRow: {
    flexDirection: 'row',
    gap: 6,
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 6,
  },
  barLabel: {
    flex: 1,
    fontSize: 10,
    textAlign: 'center',
  },
  donutWrap: {
    alignSelf: 'center',
    position: 'relative',
  },
  donutCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutTotalLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  donutTotalValue: {
    fontSize: 20,
    marginTop: 2,
  },
});
