/**
 * Minimal jest mock for `react-native-reanimated`.
 *
 * This jest project runs pure-logic (`.spec.ts`) tests only — no RN
 * component rendering — so we don't need reanimated's real native/JS
 * runtime. Several non-component modules (e.g. `src/theme/tokens.ts`)
 * import `Easing` purely to precompute bezier-curve config objects at
 * module scope, so this stub only needs to cover that surface.
 *
 * Kept local to this repo (rather than pointing at
 * `react-native-reanimated/mock.js`) because that package's own mock
 * transitively requires `react-native`, which uses Flow syntax our
 * `tsx?`-only ts-jest transform doesn't parse.
 */
const identity = (value) => value;

const Easing = {
  linear: identity,
  ease: identity,
  quad: identity,
  cubic: identity,
  poly: identity,
  sin: identity,
  circle: identity,
  exp: identity,
  elastic: identity,
  back: identity,
  bounce: identity,
  bezier: () => ({ factory: identity }),
  bezierFn: identity,
  steps: identity,
  in: identity,
  out: identity,
  inOut: identity,
};

module.exports = {
  Easing,
  default: {},
};
