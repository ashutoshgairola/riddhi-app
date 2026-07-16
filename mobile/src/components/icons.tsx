/**
 * MI icon set — RN port of the inline SVG icons from the web app.
 *
 * Source of truth: project/riddhi/MobileCore.jsx:189–205 (`const MI = {...}`)
 * for the 15 core icons (home, txns, budget, goals, invest, bell, search,
 * back, plus, filter, more, arrow, eye, eyeOff, sparkle), plus a handful of
 * inline `<svg>` icons used by individual screens that don't otherwise have
 * a home:
 *  - sms     — project/riddhi/MobileHome.jsx:134
 *  - camera  — project/riddhi/MobileChat.jsx:179 / :231 (image/rect+circle+path)
 *  - send    — project/riddhi/MobileChat.jsx:246
 *  - check   — project/riddhi/MobileChat.jsx:100 (polyline 20 6 9 17 4 12)
 *  - trash   — project/riddhi/MobileTxns.jsx:57
 *  - edit    — project/riddhi/MobileTxns.jsx:62
 *  - refresh — project/riddhi/MobileSync.jsx:129
 *  - close   — project/riddhi/MobileApp.jsx:164 (X, two lines)
 *  - info    — project/riddhi/MobileSync.jsx:199 (circle + i)
 *
 * Every `<path>`/`<polyline>`/`<circle>`/`<line>` is transcribed verbatim
 * from its source `d`/`points`/attribute values — only the element names
 * and prop casing changed for `react-native-svg`. The original web icons use
 * `stroke="currentColor"`; RN has no `currentColor`, so each icon component
 * takes an explicit `color` prop (default `#f3f0fb`, matching `t.text1` in
 * the dark theme — see src/theme/tokens.ts:179) and threads it through to
 * `stroke` (and to `fill` only where the source used `fill="currentColor"`:
 * the `more` dots and the `goals` inner circle).
 */
import type { JSX } from 'react';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const DEFAULT_SIZE = 24;
const DEFAULT_COLOR = '#f3f0fb';
const DEFAULT_STROKE_WIDTH = 2;

export type IconName =
  | 'home'
  | 'txns'
  | 'budget'
  | 'goals'
  | 'invest'
  | 'bell'
  | 'search'
  | 'back'
  | 'plus'
  | 'filter'
  | 'more'
  | 'arrow'
  | 'eye'
  | 'eyeOff'
  | 'sparkle'
  | 'sms'
  | 'camera'
  | 'send'
  | 'check'
  | 'trash'
  | 'edit'
  | 'refresh'
  | 'close'
  | 'info';

export const MI: Record<IconName, (p: IconProps) => JSX.Element> = {
  // MobileCore.jsx:190
  home: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 12 12 3l9 9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M5 10v10a1 1 0 0 0 1 1h3v-7h6v7h3a1 1 0 0 0 1-1V10"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  ),

  // MobileCore.jsx:191
  txns: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  ),

  // MobileCore.jsx:192
  budget: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 8v4l3 3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),

  // MobileCore.jsx:193 — inner circle uses fill="currentColor" stroke="none" in source
  goals: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="12" r="6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="12" r="2" fill={color} stroke="none" />
    </Svg>
  ),

  // MobileCore.jsx:194
  invest: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="22 7 13.5 15.5 8.5 10.5 2 17"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Polyline points="16 7 22 7 22 13" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),

  // MobileCore.jsx:195
  bell: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),

  // MobileCore.jsx:196
  search: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="m21 21-4.35-4.35" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),

  // MobileCore.jsx:197
  back: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),

  // MobileCore.jsx:198
  plus: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="12" y1="5" x2="12" y2="19" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),

  // MobileCore.jsx:199
  filter: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polygon
        points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  ),

  // MobileCore.jsx:200 — all three dots use fill="currentColor" in source (no explicit stroke="none", but fill wins visually; keep stroke off paths consistent with source's lack of a stroke override by passing stroke={color} too, matching original `stroke="currentColor"` inherited from parent <svg>)
  more: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="5" r="1.5" fill={color} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx="12" cy="12" r="1.5" fill={color} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx="12" cy="19" r="1.5" fill={color} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  ),

  // MobileCore.jsx:201
  arrow: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),

  // MobileCore.jsx:202
  eye: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),

  // MobileCore.jsx:203
  eyeOff: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="1" y1="1" x2="23" y2="23" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),

  // MobileCore.jsx:204
  sparkle: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  ),

  // MobileHome.jsx:134 (chat bubble)
  sms: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  ),

  // MobileChat.jsx:179 / :231 (image/camera: rect + circle + path)
  camera: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="18" height="18" rx="2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="8.5" cy="8.5" r="1.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="m21 15-5-5L5 21" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),

  // MobileChat.jsx:246
  send: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="12" y1="19" x2="12" y2="5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="5 12 12 5 19 12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),

  // MobileChat.jsx:100
  check: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline points="20 6 9 17 4 12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),

  // MobileTxns.jsx:57
  trash: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline points="3 6 5 6 21 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M10 11v6M14 11v6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  ),

  // MobileTxns.jsx:62
  edit: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 20h9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  ),

  // MobileSync.jsx:129
  refresh: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M3 3v5h5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M16 16h5v5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),

  // MobileApp.jsx:164 (X)
  close: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="18" y1="6" x2="6" y2="18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="6" y1="6" x2="18" y2="18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  ),

  // MobileSync.jsx:199
  info: ({ size = DEFAULT_SIZE, color = DEFAULT_COLOR, strokeWidth = DEFAULT_STROKE_WIDTH }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 16v-4M12 8h.01" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
};
