/**
 * 8-point grid spacing scale — single source of truth for margins,
 * paddings and gaps. Base unit = 8 (0.5× the 16px smallest body font).
 *
 * Named "friendship" tokens encode intent, not just size:
 *   xxs (4)  icon↔label gaps, tightest pairs, dense chip internals
 *   xs  (8)  "best friends" — heading↔subtitle, label↔input, icon↔text
 *   sm  (12) rare — only where 8 is too tight and 16 too loose in dense UI
 *   md  (16) "friends" — rows in a card, fields in a group; default screen gutter
 *   lg  (24) card padding, gaps between sibling cards in a list
 *   xl  (32) section breaks between unrelated groups
 *   xxl (48) screen-level top/bottom breathing room, hero areas
 *
 * `as const` makes this the allow-list: TypeScript rejects any value not on
 * the scale, which is what enforces the 8pt grid going forward.
 */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** A concrete pixel value drawn from the 8pt scale. */
export type Spacing = (typeof spacing)[keyof typeof spacing];

/** A spacing token name (`'md'`, `'lg'`, …). */
export type SpacingToken = keyof typeof spacing;
