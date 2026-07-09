/**
 * Design tokens ported verbatim from the web app's `mobile.css`.
 *
 * Source of truth:
 *  - project/riddhi/mobile.css  :root            (lines 7–54)   -> `dark`
 *  - project/riddhi/mobile.css  [data-theme=light] (lines 57–124) -> `light`
 *
 * This is a pure data module — no React, no native APIs beyond the
 * `Easing` curve helpers from react-native-reanimated (data only, not
 * components), so it is safe to import from anywhere (including
 * non-component utility code).
 */
import { Easing, type EasingFunctionFactory } from 'react-native-reanimated';

/** Numeric font weights we have static @expo-google-fonts families for. */
export type FontWeight = 400 | 500 | 600 | 700 | 800;

export interface Tokens {
  // ── Surfaces ──────────────────────────────────────────────
  bg: string;
  bg1: string;
  bg2: string;
  bg3: string;
  bg4: string;

  // ── Glass (generic) ──────────────────────────────────────
  glass: string;
  glassHov: string;

  // ── Borders ───────────────────────────────────────────────
  border: string;
  borderStr: string;

  // ── Text ──────────────────────────────────────────────────
  text1: string;
  text2: string;
  text3: string;

  // ── Emphasis / accent ────────────────────────────────────
  em: string;
  emDim: string;
  emGlow: string;

  // ── Semantic colors ──────────────────────────────────────
  red: string;
  redDim: string;
  amber: string;
  amberDim: string;
  blue: string;
  blueDim: string;
  violet: string;
  violetDim: string;
  cyan: string;
  cyanDim: string;

  // ── Liquid glass (surface-specific) ──────────────────────
  glassBg: string;
  glassBg2: string;
  glassBrd: string;
  glassBrd2: string;
  /** `inset 0 1px 0 rgba(...)` highlight — kept as a CSS-style shadow
   * string; RN consumers should parse/translate as needed for
   * platform shadow props. */
  glassHi: string;

  // ── Liquid glass (refraction shader knobs) ───────────────
  /** Edge-lensing displacement strength, in normalized surface units. */
  refraction: number;
  /** Specular rim-light color (rgba/hex). */
  specularColor: string;
  /** Specular rim width, 0–1 (fraction of surface half-min-dimension). */
  specularWidth: number;
  /** Chromatic dispersion at the rim, in normalized units (0 disables). */
  chromatic: number;

  // ── Surface extras (theme-specific composites) ───────────
  /** `.m-page` background gradient stops, top -> bottom. */
  pageGradient: string[];
  /** `.m-page::before` radial-gradient overlay colors (decorative blobs),
   * in source order: top-left, top-right, bottom-center. Each is the
   * inner (visible) color of a `radial-gradient(..., color, transparent ...)`. */
  pageGlow: string[];
  /** `.m-card` / `.m-list-card` box-shadow (theme default). */
  cardShadow: string;
  /** `.m-tabbar` background. */
  tabbarBg: string;
  /** `.m-tabbar` border-top color. */
  tabbarBorder: string;
  /** `.m-tabbar` box-shadow (inset top highlight). */
  tabbarShadow: string;
  /** `.m-topbar.scrolled` background. */
  topbarScrolledBg: string;
  /** `.m-topbar.scrolled` border-bottom color. */
  topbarScrolledBorder: string;
  /** `.m-sheet` background. */
  sheetBg: string;
  /** `.m-sheet` border-top color. */
  sheetBorder: string;
  /** `.m-sheet` box-shadow. */
  sheetShadow: string;
  /** `.m-fab-action` background. */
  fabActionBg: string;
  /** `.m-fab-action` border color. */
  fabActionBorder: string;
  /** `.m-toast` background. */
  toastBg: string;
  /** `.m-toast` border color. */
  toastBorder: string;
  /** `.m-toast` box-shadow. */
  toastShadow: string;
  /** `.m-sheet-backdrop` background. */
  sheetBackdropBg: string;
}

// ── Radii (`--r-*`, mobile.css:45–50) — identical for both themes ──
export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 26,
  xl2: 32,
  xl3: 38,
} as const;

// ── Easing (`--ease` / `--spring`, mobile.css:52–53) ────────────────
// Raw cubic-bezier control points, exactly as authored in the CSS.
export const easeBezier: [number, number, number, number] = [0.32, 0.72, 0, 1];
export const springBezier: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

// Convenience Easing curves for react-native-reanimated `withTiming`.
export const ease: EasingFunctionFactory = Easing.bezier(
  easeBezier[0],
  easeBezier[1],
  easeBezier[2],
  easeBezier[3],
);
export const spring: EasingFunctionFactory = Easing.bezier(
  springBezier[0],
  springBezier[1],
  springBezier[2],
  springBezier[3],
);

// ── Fonts (`--font-ui` / `--font-num`, mobile.css:8–9) ──────────────
// Both point at the same family in the CSS ('Plus Jakarta Sans').
// In RN the loaded @expo-google-fonts family names ARE the fontFamily
// strings (registered via useFonts in src/app/Root.tsx).
export const fontRegular = 'PlusJakartaSans_400Regular';
export const fontMedium = 'PlusJakartaSans_500Medium';
export const fontSemiBold = 'PlusJakartaSans_600SemiBold';
export const fontBold = 'PlusJakartaSans_700Bold';
export const fontExtraBold = 'PlusJakartaSans_800ExtraBold';

export const fonts = {
  ui: 'PlusJakartaSans',
  num: 'PlusJakartaSans',
} as const;

/** Returns the @expo-google-fonts family name for a given numeric weight. */
export function weight(w: FontWeight): string {
  switch (w) {
    case 400:
      return fontRegular;
    case 500:
      return fontMedium;
    case 600:
      return fontSemiBold;
    case 700:
      return fontBold;
    case 800:
      return fontExtraBold;
  }
}

// ── Dark theme (mobile.css :root, lines 7–54, plus defaults from
// .m-page / .m-card / .m-tabbar / .m-topbar.scrolled / .m-sheet /
// .m-fab-action / .m-toast / .m-sheet-backdrop, lines 153–171,
// 198–203, 255–269, 343–364, 376–400, 442–451, 687–700) ────────────
export const dark: Tokens = {
  bg: '#0b0812',
  bg1: '#17131f',
  bg2: '#1f1a2c',
  bg3: '#2a2339',
  bg4: '#342c45',
  glass: 'rgba(255,255,255,0.04)',
  glassHov: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.06)',
  borderStr: 'rgba(255,255,255,0.12)',
  text1: '#f3f0fb',
  text2: '#9a90b5',
  text3: '#635a7a',
  em: '#b6a4f3',
  emDim: 'rgba(182,164,243,0.14)',
  emGlow: 'rgba(182,164,243,0.25)',
  red: '#ff6b85',
  redDim: 'rgba(255,107,133,0.14)',
  amber: '#ffc24b',
  amberDim: 'rgba(255,194,75,0.14)',
  blue: '#6ea8ff',
  blueDim: 'rgba(110,168,255,0.14)',
  violet: '#a78bfa',
  violetDim: 'rgba(167,139,250,0.14)',
  cyan: '#5ee0d8',
  cyanDim: 'rgba(94,224,216,0.14)',

  glassBg: 'rgba(255,255,255,0.055)',
  glassBg2: 'rgba(255,255,255,0.09)',
  glassBrd: 'rgba(255,255,255,0.10)',
  glassBrd2: 'rgba(255,255,255,0.18)',
  glassHi: 'inset 0 1px 0 rgba(255,255,255,0.10)',

  refraction: 0.045,
  specularColor: 'rgba(255,255,255,0.55)',
  specularWidth: 0.12,
  chromatic: 0.006,

  // .m-page background: linear-gradient(180deg, #1d1733 0%, #14101f 46%, #0b0912 100%)
  pageGradient: ['#181328', '#100c18', '#08060d'],
  // .m-page::before radial-gradient overlay colors (top-left, top-right, bottom-center).
  // The alpha here is the peak glow opacity; PageBackground lifts it into the
  // SVG stop's stopOpacity (react-native-svg ignores alpha baked into stopColor).
  pageGlow: ['rgba(150,120,240,0.28)', 'rgba(120,90,220,0.17)', 'rgba(110,80,200,0.13)'],
  // .m-card / .m-list-card box-shadow: var(--glass-hi) (no extra ambient shadow in dark)
  cardShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
  // .m-tabbar background
  tabbarBg: 'rgba(24,19,34,0.55)',
  // .m-tabbar border: 1px solid var(--glass-brd)
  tabbarBorder: 'rgba(255,255,255,0.10)',
  // .m-tabbar box-shadow top inset sheen: inset 0 1.5px 0 rgba(255,255,255,0.16)
  tabbarShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.16)',
  // .m-topbar.scrolled background
  topbarScrolledBg: 'rgba(23,19,31,0.8)',
  // .m-topbar.scrolled border-bottom-color: var(--glass-brd)
  topbarScrolledBorder: 'rgba(255,255,255,0.10)',
  // .m-sheet background
  sheetBg: 'rgba(28,22,40,0.82)',
  // .m-sheet border-top: 1px solid var(--glass-brd-2)
  sheetBorder: 'rgba(255,255,255,0.18)',
  // .m-sheet box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 -12px 48px rgba(0,0,0,0.5)
  sheetShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 -12px 48px rgba(0,0,0,0.5)',
  // .m-fab-action background
  fabActionBg: 'rgba(30,24,42,0.6)',
  // .m-fab-action border: 1px solid var(--glass-brd-2)
  fabActionBorder: 'rgba(255,255,255,0.18)',
  // .m-toast background
  toastBg: 'rgba(36,28,52,0.72)',
  // .m-toast border: 1px solid var(--glass-brd-2)
  toastBorder: 'rgba(255,255,255,0.18)',
  // .m-toast box-shadow: var(--glass-hi), 0 10px 30px rgba(0,0,0,0.45)
  toastShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 10px 30px rgba(0,0,0,0.45)',
  // .m-sheet-backdrop background (dark default): rgba(0,0,0,0.55)
  sheetBackdropBg: 'rgba(0,0,0,0.55)',
};

// ── Light theme (mobile.css [data-theme="light"], lines 57–124) ────
export const light: Tokens = {
  bg: '#ece7f8',
  bg1: '#ffffff',
  bg2: '#f3f0fb',
  bg3: '#e8e3f5',
  bg4: '#ddd6f0',
  // --glass / --glass-hov have no light override in mobile.css; keep dark values.
  glass: dark.glass,
  glassHov: dark.glassHov,
  border: 'rgba(26,18,38,0.08)',
  borderStr: 'rgba(26,18,38,0.14)',
  text1: '#1a1226',
  text2: '#6b6385',
  text3: '#9c95b3',
  em: '#7c5cf0',
  emDim: 'rgba(124,92,240,0.12)',
  emGlow: 'rgba(124,92,240,0.20)',
  red: '#e0365a',
  redDim: 'rgba(224,54,90,0.10)',
  amber: '#cd8a2a',
  amberDim: 'rgba(205,138,42,0.12)',
  blue: '#4f6dd0',
  blueDim: 'rgba(79,109,208,0.12)',
  violet: '#7c5cf0',
  violetDim: 'rgba(124,92,240,0.12)',
  cyan: '#3aa9a2',
  cyanDim: 'rgba(58,169,162,0.12)',

  glassBg: 'rgba(255,255,255,0.55)',
  glassBg2: 'rgba(255,255,255,0.82)',
  glassBrd: 'rgba(255,255,255,0.75)',
  glassBrd2: 'rgba(255,255,255,0.95)',
  glassHi: 'inset 0 1px 0 rgba(255,255,255,0.9)',

  refraction: 0.04,
  specularColor: 'rgba(255,255,255,0.9)',
  specularWidth: 0.1,
  chromatic: 0.004,

  // [data-theme="light"] .m-page background:
  // linear-gradient(180deg, #e7e0fb 0%, #f1edfb 48%, #e9e4f6 100%)
  pageGradient: ['#e7e0fb', '#f1edfb', '#e9e4f6'],
  // [data-theme="light"] .m-page::before radial-gradient overlay colors.
  // Alpha = peak glow opacity (PageBackground lifts it into stopOpacity, since
  // react-native-svg ignores alpha in stopColor). Bumped ~25% in step with the
  // dark theme; the light ground itself is left as designed (darkening a
  // near-white background would only muddy it).
  pageGlow: ['rgba(126,96,220,0.23)', 'rgba(140,110,230,0.15)', 'rgba(150,120,240,0.13)'],
  // [data-theme="light"] .m-card, .m-list-card box-shadow:
  // 0 6px 22px rgba(80,60,160,0.08), var(--glass-hi)
  cardShadow: '0 6px 22px rgba(80,60,160,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
  // [data-theme="light"] .m-tabbar background
  tabbarBg: 'rgba(255,255,255,0.62)',
  // [data-theme="light"] .m-tabbar border-color
  tabbarBorder: 'rgba(255,255,255,0.9)',
  // [data-theme="light"] .m-tabbar box-shadow top inset sheen: inset 0 1.5px 0 rgba(255,255,255,0.95)
  tabbarShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.95)',
  // [data-theme="light"] .m-topbar.scrolled background
  topbarScrolledBg: 'rgba(255,255,255,0.85)',
  // [data-theme="light"] .m-topbar.scrolled border-bottom-color
  topbarScrolledBorder: 'rgba(26,18,38,0.06)',
  // [data-theme="light"] .m-sheet background
  sheetBg: 'rgba(248,245,255,0.86)',
  // [data-theme="light"] .m-sheet border-top-color
  sheetBorder: 'rgba(255,255,255,0.95)',
  // [data-theme="light"] .m-sheet box-shadow:
  // inset 0 1px 0 rgba(255,255,255,0.95), 0 -12px 48px rgba(80,60,160,0.18)
  sheetShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), 0 -12px 48px rgba(80,60,160,0.18)',
  // [data-theme="light"] .m-fab-action background
  fabActionBg: 'rgba(255,255,255,0.72)',
  // [data-theme="light"] .m-fab-action border-color
  fabActionBorder: 'rgba(255,255,255,0.95)',
  // [data-theme="light"] .m-toast background
  toastBg: 'rgba(255,255,255,0.85)',
  // [data-theme="light"] .m-toast border-color
  toastBorder: 'rgba(255,255,255,0.95)',
  // [data-theme="light"] .m-toast box-shadow: var(--glass-hi), 0 10px 30px rgba(80,60,160,0.2)
  toastShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 10px 30px rgba(80,60,160,0.2)',
  // [data-theme="light"] .m-sheet-backdrop background
  sheetBackdropBg: 'rgba(40,30,70,0.35)',
};
