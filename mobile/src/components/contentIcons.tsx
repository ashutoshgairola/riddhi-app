/**
 * MICONS icon set — RN port of the content-icon library used for
 * categories/budgets/goals (payment sources, spend categories, etc).
 *
 * Source of truth: project/riddhi/MobileCore.jsx:235-313 (`const MICONS = {...}`),
 * plus the resolver (`mIcon`, :332-346) reimplemented here as `AppIcon`/`AppIconBox`.
 *
 * Every `<path>`/`<polyline>`/`<circle>`/`<rect>`/`<line>`/`<ellipse>` is
 * transcribed verbatim from its source `d`/`points`/attribute values — only
 * the element names and prop casing changed for `react-native-svg`. The
 * original web icons use `stroke="currentColor"` on the wrapping `<svg>`
 * (inherited by children); RN has no `currentColor`, so `base()` below
 * threads an explicit `color` prop to `stroke` at the `<Svg>` root (also
 * inherited by `react-native-svg` children), and to `fill` only on the
 * individual elements where the source used `fill="currentColor"` (the
 * inner marks in train, wallet, piggy, target, party, lock, dot).
 */
import type { JSX } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Polyline, Rect } from 'react-native-svg';
import type { IconProps } from './icons';
import { type ContentIconName, resolveIconName } from './contentIcons.data';

const DEFAULT_SIZE = 20;
const DEFAULT_COLOR = '#f3f0fb';
const DEFAULT_STROKE_WIDTH = 2;

function base(size?: number, color?: string, sw?: number) {
  return {
    width: size ?? DEFAULT_SIZE,
    height: size ?? DEFAULT_SIZE,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: color ?? DEFAULT_COLOR,
    strokeWidth: sw ?? DEFAULT_STROKE_WIDTH,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export const MICONS: Record<ContentIconName, (p: IconProps) => JSX.Element> = {
  // MobileCore.jsx:236
  home2: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M3 12 12 3l9 9" />
      <Path d="M5 10v10a1 1 0 0 0 1 1h3v-7h6v7h3a1 1 0 0 0 1-1V10" />
    </Svg>
  ),
  // MobileCore.jsx:237
  food: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M7 3v7a2 2 0 0 0 2 2h0V3M5 3v4M9 3v4M7 12v9" />
      <Path d="M17 3c-1.7 0-3 2-3 5s1.3 5 3 5v8M17 3v10" />
    </Svg>
  ),
  // MobileCore.jsx:238
  cart: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="9" cy="20" r="1.4" />
      <Circle cx="17" cy="20" r="1.4" />
      <Path d="M2 3h2.5l2.2 11.2A2 2 0 0 0 8.7 16h8.8a2 2 0 0 0 2-1.6L21 7H5" />
    </Svg>
  ),
  // MobileCore.jsx:239
  bag: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M6 7h12l1.2 12a2 2 0 0 1-2 2.2H6.8a2 2 0 0 1-2-2.2L6 7z" />
      <Path d="M9 10V6a3 3 0 0 1 6 0v4" />
    </Svg>
  ),
  // MobileCore.jsx:240
  car: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M5.5 11 7 6.8A2 2 0 0 1 8.9 5.5h6.2A2 2 0 0 1 17 6.8L18.5 11" />
      <Path d="M4 11h16a1 1 0 0 1 1 1v4.5h-2.6M3 16.5V12a1 1 0 0 1 1-1M5.6 16.5h12.8" />
      <Circle cx="7.4" cy="16.5" r="1.9" />
      <Circle cx="16.6" cy="16.5" r="1.9" />
    </Svg>
  ),
  // MobileCore.jsx:241
  train: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Rect x="5" y="3" width="14" height="14" rx="3" />
      <Path d="M5 10.5h14M12 3v7.5" />
      <Circle cx="9" cy="13.8" r=".6" fill={color ?? DEFAULT_COLOR} stroke="none" />
      <Circle cx="15" cy="13.8" r=".6" fill={color ?? DEFAULT_COLOR} stroke="none" />
      <Path d="m8.5 21 1.4-4M15.5 21l-1.4-4" />
    </Svg>
  ),
  // MobileCore.jsx:242
  plane: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M10.5 13.5 3.7 9.6a.8.8 0 0 1 .1-1.4l1.4-.6a2 2 0 0 1 1.5 0l3.8 1.5 5-4.6c.9-.8 2.2-1 3.3-.5.5 1.1.3 2.4-.5 3.3l-4.6 5 1.5 3.8a2 2 0 0 1 0 1.5l-.6 1.4a.8.8 0 0 1-1.4.1l-3.9-6.8z" />
      <Path d="m6 18 2-2M4.5 15.5 6 14M8.5 19.5 10 18" />
    </Svg>
  ),
  // MobileCore.jsx:243
  bolt: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2z" />
    </Svg>
  ),
  // MobileCore.jsx:244
  pill: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Rect x="3.2" y="8.8" width="17.6" height="6.4" rx="3.2" transform="rotate(-45 12 12)" />
      <Path d="m8.5 8.5 7 7" />
    </Svg>
  ),
  // MobileCore.jsx:245
  film: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Rect x="3" y="4" width="18" height="16" rx="2" />
      <Path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
    </Svg>
  ),
  // MobileCore.jsx:246
  gradCap: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="m12 4 10 5-10 5L2 9l10-5z" />
      <Path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v5" />
    </Svg>
  ),
  // MobileCore.jsx:247
  briefcase: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Rect x="3" y="7" width="18" height="13" rx="2" />
      <Path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12.5h18" />
    </Svg>
  ),
  // MobileCore.jsx:248
  laptop: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Rect x="4" y="5" width="16" height="11" rx="1.5" />
      <Path d="M2 19h20" />
    </Svg>
  ),
  // MobileCore.jsx:249
  undo: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M9 14 4 9l5-5" />
      <Path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </Svg>
  ),
  // MobileCore.jsx:250
  gift: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Rect x="3" y="8" width="18" height="4" />
      <Path d="M12 8v13M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
      <Path d="M12 8c-1.5 0-4.5-.5-4.5-2.8C7.5 3.5 9 3 10 3.5c1.5.8 2 3 2 4.5zM12 8c1.5 0 4.5-.5 4.5-2.8C16.5 3.5 15 3 14 3.5c-1.5.8-2 3-2 4.5z" />
    </Svg>
  ),
  // MobileCore.jsx:251
  bank2: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M3 21h18M4 10h16M5 10v11M19 10v11M9 10v11M15 10v11M12 3 3 7.5h18L12 3z" />
    </Svg>
  ),
  // MobileCore.jsx:252
  card2: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Rect x="2" y="5" width="20" height="14" rx="2.5" />
      <Path d="M2 10h20" />
    </Svg>
  ),
  // MobileCore.jsx:253
  wallet: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M19 7H5a2 2 0 0 1 0-4h12v4" />
      <Path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2" />
      <Circle cx="16" cy="14" r="1" fill={color ?? DEFAULT_COLOR} stroke="none" />
    </Svg>
  ),
  // MobileCore.jsx:254
  cash: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Rect x="2" y="6" width="20" height="12" rx="2" />
      <Circle cx="12" cy="12" r="2.5" />
      <Path d="M6 12h.01M18 12h.01" />
    </Svg>
  ),
  // MobileCore.jsx:255
  coins: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="9" cy="10" r="5.5" />
      <Path d="M13.4 5.7a5.5 5.5 0 1 1 .4 10.6M9 8v4M7.5 10h3" />
    </Svg>
  ),
  // MobileCore.jsx:256
  piggy: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M19.5 10.5c1 .3 1.5 1 1.5 1.8 0 .8-.5 1.4-1.5 1.7" />
      <Ellipse cx="11" cy="13" rx="7.5" ry="5.8" />
      <Path d="M8 18.4V20.5M14 18.4V20.5M8.6 8.4c1.5-.6 3.3-.6 4.8 0" />
      <Circle cx="14.5" cy="11.5" r=".5" fill={color ?? DEFAULT_COLOR} stroke="none" />
    </Svg>
  ),
  // MobileCore.jsx:257
  trendUp: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <Polyline points="16 7 22 7 22 13" />
    </Svg>
  ),
  // MobileCore.jsx:258
  trendDown: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
      <Polyline points="16 17 22 17 22 11" />
    </Svg>
  ),
  // MobileCore.jsx:259
  chart: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <Path d="M8 16v-5M13 16V8M18 16v-8" />
    </Svg>
  ),
  // MobileCore.jsx:260
  target: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="12" r="9" />
      <Circle cx="12" cy="12" r="5" />
      <Circle cx="12" cy="12" r="1.4" fill={color ?? DEFAULT_COLOR} stroke="none" />
    </Svg>
  ),
  // MobileCore.jsx:261
  ledger: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Rect x="5" y="3" width="15" height="18" rx="2" />
      <Path d="M9.5 3v18M13.5 8.5h3M13.5 12.5h3" />
    </Svg>
  ),
  // MobileCore.jsx:262
  sync: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
      <Path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
      <Path d="M3 21v-5h5M21 3v5h-5" />
    </Svg>
  ),
  // MobileCore.jsx:263
  repeat2: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M17 2l4 4-4 4" />
      <Path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <Path d="M7 22l-4-4 4-4" />
      <Path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </Svg>
  ),
  // MobileCore.jsx:264
  transfer: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="m17 3 4 4-4 4M21 7H8M7 13l-4 4 4 4M3 17h13" />
    </Svg>
  ),
  // MobileCore.jsx:265
  party: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M5.4 11.3 3 21l9.7-2.4-7.3-7.3z" />
      <Path d="M11.8 8.2c1.4-1.4 3-1.4 4.4 0M13.5 3c.4 1.4 1.8 2.4 3.3 2M19 9.5c1 .2 1.7.9 2 1.9" />
      <Circle cx="15.5" cy="13" r=".5" fill={color ?? DEFAULT_COLOR} stroke="none" />
      <Circle cx="19" cy="4.5" r=".5" fill={color ?? DEFAULT_COLOR} stroke="none" />
    </Svg>
  ),
  // MobileCore.jsx:266
  cake: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M4 21h16M5 21v-5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5" />
      <Path d="M5 17c1.5 1.1 2.8.2 2.8-.6 0 .8 1.9 1.7 3.2.6 1.3 1.1 3.2.2 3.2-.6 0 .8 1.3 1.7 2.8.6" />
      <Path d="M12 14v-3" />
      <Path d="M12 8.5c.9-.9.9-2.2 0-3.2-.9 1-.9 2.3 0 3.2z" />
    </Svg>
  ),
  // MobileCore.jsx:267
  ring: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="14.5" r="5.5" />
      <Path d="m9.5 5.5 2.5 3 2.5-3L13 3.5h-2L9.5 5.5z" />
    </Svg>
  ),
  // MobileCore.jsx:268
  flame: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3 2.5.5 5 2.5 5 6a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.5 1.5.7 2.5 1.5 4z" />
      <Path d="M12 2.5c2 2.5 5 5.5 5 9" opacity="0" />
    </Svg>
  ),
  // MobileCore.jsx:269
  drink: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M6.5 3h11l-1.3 9a4.2 4.2 0 0 1-8.4 0L6.5 3z" />
      <Path d="M12 16v5M8.5 21h7M7.1 7.5h9.8" />
    </Svg>
  ),
  // MobileCore.jsx:270
  trophy: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4z" />
      <Path d="M7 6H4a1 1 0 0 0-1 1c0 2 1.6 3.4 4 3.5M17 6h3a1 1 0 0 1 1 1c0 2-1.6 3.4-4 3.5" />
    </Svg>
  ),
  // MobileCore.jsx:271
  ball: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="12" r="9" />
      <Path d="m12 8 3.6 2.6-1.4 4.2h-4.4L8.4 10.6 12 8z" />
      <Path d="M12 3v5M4 9l4.4 1.6M20 9l-4.4 1.6M6.5 19l3.3-4.2M17.5 19l-3.3-4.2" />
    </Svg>
  ),
  // MobileCore.jsx:272
  music: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M9 18V5l10-2v13" />
      <Circle cx="6.5" cy="18" r="2.5" />
      <Circle cx="16.5" cy="16" r="2.5" />
    </Svg>
  ),
  // MobileCore.jsx:273
  headphones: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M4 14a8 8 0 0 1 16 0" />
      <Rect x="3" y="14" width="4" height="6" rx="1.8" />
      <Rect x="17" y="14" width="4" height="6" rx="1.8" />
    </Svg>
  ),
  // MobileCore.jsx:274
  play: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="12" r="9" />
      <Path d="m10 8.5 5 3.5-5 3.5v-7z" />
    </Svg>
  ),
  // MobileCore.jsx:275
  pause: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M10 9v6M14 9v6" />
    </Svg>
  ),
  // MobileCore.jsx:276
  package: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <Path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </Svg>
  ),
  // MobileCore.jsx:277
  cloud: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M17.5 18.5a4.5 4.5 0 0 0 .6-9A6 6 0 0 0 6.3 11 4 4 0 0 0 7 18.5h10.5z" />
    </Svg>
  ),
  // MobileCore.jsx:278
  dumbbell: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="m7.4 7.4 9.2 9.2" />
      <Rect x="2.2" y="6.2" width="7" height="3.4" rx="1.2" transform="rotate(45 5.7 7.9)" />
      <Rect x="14.8" y="14.4" width="7" height="3.4" rx="1.2" transform="rotate(45 18.3 16.1)" />
    </Svg>
  ),
  // MobileCore.jsx:279
  apple: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M12 7.2C9.2 5.4 5 7 5 12c0 4 3 8.5 5 8.5 1 0 1.4-.6 2-.6s1 .6 2 .6c2 0 5-4.5 5-8.5 0-5-4.2-6.6-7-4.8z" />
      <Path d="M12 7c0-2 1.2-3.6 3-4.2" />
    </Svg>
  ),
  // MobileCore.jsx:280
  tree: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M12 3 7.5 9h2L6 14h3l-2.5 4.5h11L15 14h3l-3.5-5h2L12 3z" />
      <Path d="M12 18.5V21.5" />
    </Svg>
  ),
  // MobileCore.jsx:281
  plant: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M12 21.5V13" />
      <Path d="M12 13C12 9 9.2 6.8 5 6.8c0 4.2 3 6.2 7 6.2z" />
      <Path d="M12 11c0-3.4 2.6-5.2 6.2-5.2 0 3.6-2.6 5.2-6.2 5.2z" />
    </Svg>
  ),
  // MobileCore.jsx:282
  scissors: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="6" cy="6" r="2.5" />
      <Circle cx="6" cy="18" r="2.5" />
      <Path d="M8.1 7.6 20 19M8.1 16.4 20 5" />
    </Svg>
  ),
  // MobileCore.jsx:283
  lifebuoy: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="12" r="9" />
      <Circle cx="12" cy="12" r="4" />
      <Path d="m5.7 5.7 3.4 3.4M14.9 14.9l3.4 3.4M18.3 5.7l-3.4 3.4M9.1 14.9l-3.4 3.4" />
    </Svg>
  ),
  // MobileCore.jsx:284
  umbrella: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M12 3a9 9 0 0 1 9 9.5H3A9 9 0 0 1 12 3z" />
      <Path d="M12 12.5V19a2 2 0 0 0 4 0" />
    </Svg>
  ),
  // MobileCore.jsx:285
  phone: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <Path d="M10.5 18.5h3" />
    </Svg>
  ),
  // MobileCore.jsx:286
  calendar2: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Rect x="3" y="4" width="18" height="18" rx="2" />
      <Path d="M16 2v4M8 2v4M3 10h18" />
    </Svg>
  ),
  // MobileCore.jsx:287
  users: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="9" cy="8" r="3.5" />
      <Path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <Path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18.2 14.6c2 .8 3.3 2.7 3.3 5.4" />
    </Svg>
  ),
  // MobileCore.jsx:288
  trash: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" />
      <Path d="M6 7l1 13a2 2 0 0 0 2 1.8h6A2 2 0 0 0 17 20l1-13M10 11.5v5M14 11.5v5" />
    </Svg>
  ),
  // MobileCore.jsx:289
  pencil: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </Svg>
  ),
  // MobileCore.jsx:290
  plus2: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Line x1="12" y1="5" x2="12" y2="19" />
      <Line x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  ),
  // MobileCore.jsx:291
  sun: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="12" r="4.5" />
      <Path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" />
    </Svg>
  ),
  // MobileCore.jsx:292
  moon: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />
    </Svg>
  ),
  // MobileCore.jsx:293
  globe: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M3 12h18M12 3a14.5 14.5 0 0 1 0 18M12 3a14.5 14.5 0 0 0 0 18" />
    </Svg>
  ),
  // MobileCore.jsx:294
  eye2: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <Circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  // MobileCore.jsx:295
  lock: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Rect x="4.5" y="10.5" width="15" height="10.5" rx="2" />
      <Path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <Circle cx="12" cy="15.7" r="1" fill={color ?? DEFAULT_COLOR} stroke="none" />
    </Svg>
  ),
  // MobileCore.jsx:296
  key: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="8" cy="15.5" r="4.5" />
      <Path d="m11.2 12.3 8.3-8.3M17 6.5l2.5 2.5M14 9.5l2 2" />
    </Svg>
  ),
  // MobileCore.jsx:297
  logout: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Path d="m16 17 5-5-5-5M21 12H9" />
    </Svg>
  ),
  // MobileCore.jsx:298
  mail: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Rect x="2.5" y="5" width="19" height="14" rx="2" />
      <Path d="m3.5 7 8.5 6 8.5-6" />
    </Svg>
  ),
  // MobileCore.jsx:299
  export: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M12 15V3M7 8l5-5 5 5" />
      <Path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </Svg>
  ),
  // MobileCore.jsx:300
  help: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="12" r="9.5" />
      <Path d="M9.2 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" />
      <Path d="M12 17.5h.01" />
    </Svg>
  ),
  // MobileCore.jsx:301
  check: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="12" r="9.5" />
      <Path d="m8 12.5 2.5 2.5L16 9.5" />
    </Svg>
  ),
  // MobileCore.jsx:302
  warn: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M12 3.5 2.7 19.5h18.6L12 3.5z" />
      <Path d="M12 10v4M12 17h.01" />
    </Svg>
  ),
  // MobileCore.jsx:303
  doc: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8L14 2.5z" />
      <Path d="M14 2.5V8h5.5M9 13h6M9 17h6" />
    </Svg>
  ),
  // MobileCore.jsx:304
  sparkle2: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18l-1.8-5.4L4.7 10.8 10.2 9 12 3.5z" />
      <Path d="M19 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" strokeWidth="1.5" />
    </Svg>
  ),
  // MobileCore.jsx:305
  star: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="m12 3 2.7 5.6 6.1.9-4.4 4.2 1 6.1L12 17l-5.4 2.8 1-6.1L3.2 9.5l6.1-.9L12 3z" />
    </Svg>
  ),
  // MobileCore.jsx:306
  heart: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M12 20.5S3.5 15 3.5 9.5a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2c0 5.5-8.5 11-8.5 11z" />
    </Svg>
  ),
  // MobileCore.jsx:307
  fuel: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M3 21.5h10M4 21.5V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v16.5" />
      <Path d="M12 10h2l2 2v5.5a1.5 1.5 0 0 0 3 0V10l-2.5-2.5M5.5 8.5h5" />
    </Svg>
  ),
  // MobileCore.jsx:308
  settings2: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56h.08a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z" />
    </Svg>
  ),
  // MobileCore.jsx:309
  tag: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M3 3h8l10 10-8 8L3 11V3z" />
      <Circle cx="8" cy="8" r="1.4" />
    </Svg>
  ),
  // MobileCore.jsx:310
  bell3: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  ),
  // MobileCore.jsx:311
  search2: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="11" cy="11" r="8" />
      <Path d="m21 21-4.35-4.35" />
    </Svg>
  ),
  // MobileCore.jsx:312
  dot: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Circle cx="12" cy="12" r="3.5" fill={color ?? DEFAULT_COLOR} stroke="none" />
    </Svg>
  ),
};

// Universal icon resolver: name | emoji → SVG icon | text fallback.
// MobileCore.jsx:332-346 (`mIcon`)
export function AppIcon({
  value,
  size = DEFAULT_SIZE,
  color = DEFAULT_COLOR,
  strokeWidth = DEFAULT_STROKE_WIDTH,
}: {
  value: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}): JSX.Element | null {
  if (value == null || value === '') return null;
  const name = resolveIconName(value);
  if (name) {
    const Cmp = MICONS[name];
    return <Cmp size={size} color={color} strokeWidth={strokeWidth} />;
  }
  return <Text style={{ fontSize: Math.round(size * 0.85), lineHeight: size }}>{value}</Text>;
}

// Prominent tinted box wrapper (list rows, detail headers).
export function AppIconBox({
  value,
  color,
  size = 42,
  iconSize = 20,
}: {
  value: string;
  color: string;
  size?: number;
  iconSize?: number;
}): JSX.Element {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 13,
        backgroundColor: color + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppIcon value={value} size={iconSize} color={color} />
    </View>
  );
}
