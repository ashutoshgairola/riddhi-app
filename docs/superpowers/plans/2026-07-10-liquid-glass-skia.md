# Real Liquid Glass UI (Skia) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's frosted-glass (`expo-blur`) chrome with real refractive liquid glass — edge lensing, specular rim-light, subtle chromatic dispersion — rendered identically on iOS and Android via one Skia SkSL shader.

**Architecture:** A new `<LiquidGlass>` Skia component renders a rounded-rect runtime shader that refracts the app's *ambient* backdrop (the procedural violet gradient + glow field already defined in tokens), reconstructed in-shader from uniforms so no per-frame native view capture is needed. The bottom sheet additionally snapshots the frozen page once on open (`makeImageFromView`) and refracts the real content. Only chrome + hero surfaces use it; dense list rows keep the existing `expo-blur` cheap tier untouched.

**Tech Stack:** Expo SDK 56, React Native 0.85, React 19.2, `@shopify/react-native-skia`, react-native-reanimated 4.3, react-native-svg, expo-blur (retained for the cheap tier).

## Global Constraints

- Target workspace: `mobile/` only.
- Per `mobile/AGENTS.md`: **read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ and the installed `@shopify/react-native-skia` docs before writing native-touching code.** Verify every Skia API name against the installed version — this plan's Skia API usage (`Skia.RuntimeEffect.Make`, `<Canvas>/<Fill>/<Shader>`, `makeImageFromView`, `<ImageShader>`) must be confirmed against the resolved package version in Task 0 and corrected inline if names differ.
- Source of visual truth for tint/border/highlight values: `project/riddhi/mobile.css` and the ported `mobile/src/theme/tokens.ts`. Do not invent new colors; add only the new refraction/specular tokens defined in Task 1.
- Git: commit after each task. Author email `gairola.ashutosh26@gmail.com`; **no `Co-Authored-By` trailer**. `docs/` is gitignored — force-add (`git add -f`) any docs.
- Cheap tier is sacred: `GlassView`/`GlassCard` in `mobile/src/components/Glass.tsx` and all list-row/chip/input usages must remain on `expo-blur` and behave identically after this work.
- Never place a Skia `<Canvas>` per list row. `LiquidGlass` is for the enumerated chrome/hero surfaces only.

---

### Task 0: Skia dependency + dev-build spike

**Files:**
- Modify: `mobile/package.json` (dependency), `mobile/app.json` (config plugin if required by the resolved version)
- Create: `mobile/src/components/__skiaSpike.tsx` (throwaway, deleted at end of task)

**Interfaces:**
- Produces: a confirmed-working `@shopify/react-native-skia` install; a written note (in the commit body) of (a) the resolved version, (b) exact import names for `Canvas`, `Fill`, `Shader`, `Skia.RuntimeEffect.Make`, `makeImageFromView`, `ImageShader`, and (c) whether Reanimated shared values can drive Skia uniforms on this stack or the `useClock`/Skia-state fallback is needed.

- [ ] **Step 1: Install Skia**

Run: `cd mobile && npx expo install @shopify/react-native-skia`
Expected: dependency added to `package.json`. If Expo prompts for a config plugin, add it to `app.json` `plugins` per the printed instructions.

- [ ] **Step 2: Read the docs (constraint)**

Open https://docs.expo.dev/versions/v56.0.0/sdk/skia/ and the installed package's README/types (`mobile/node_modules/@shopify/react-native-skia`). Confirm the exact export names listed in the Interfaces block above. Note any differences — later tasks must use the confirmed names.

- [ ] **Step 3: Write a minimal spike component**

Create `mobile/src/components/__skiaSpike.tsx`:

```tsx
import { StyleSheet } from 'react-native';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';

const source = Skia.RuntimeEffect.Make(`
uniform float2 uSize;
vec4 main(vec2 pos) {
  float2 uv = pos / uSize;
  return vec4(uv.x, uv.y, 1.0, 1.0);
}`)!;

export function SkiaSpike() {
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Fill>
        <Shader source={source} uniforms={{ uSize: [200, 200] }} />
      </Fill>
    </Canvas>
  );
}
```

- [ ] **Step 4: Render it on a dev build (both platforms)**

Temporarily mount `<SkiaSpike/>` on the Home screen. Build/run a dev client:
Run: `cd mobile && npx expo run:ios` and `npx expo run:android` (or EAS dev build if simulators unavailable).
Expected: a red↘blue gradient square renders on **both** iOS and Android. If the shader/`RuntimeEffect.Make` API differs, fix imports per Step 2 until it renders.

- [ ] **Step 5: Remove the spike, keep the dependency**

Delete `mobile/src/components/__skiaSpike.tsx` and un-mount it from Home.

- [ ] **Step 6: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add mobile/package.json mobile/package-lock.json mobile/app.json
git -c user.email=gairola.ashutosh26@gmail.com commit -m "build(mobile): add react-native-skia for liquid glass"
```
Include the resolved version + confirmed API names + reanimated-interop finding in the commit body.

---

### Task 1: Liquid-glass tokens

**Files:**
- Modify: `mobile/src/theme/tokens.ts` (add fields to `Tokens`, `dark`, `light`)
- Test: `mobile/src/theme/tokens.spec.ts` (create)

**Interfaces:**
- Produces: `Tokens.refraction: number`, `Tokens.specularColor: string`, `Tokens.specularWidth: number`, `Tokens.chromatic: number` on both `dark` and `light` exports.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/theme/tokens.spec.ts`:

```ts
import { dark, light } from './tokens';

describe('liquid glass tokens', () => {
  it('dark theme exposes refraction/specular/chromatic knobs', () => {
    expect(dark.refraction).toBeGreaterThan(0);
    expect(dark.specularColor).toMatch(/^(#|rgba?\()/);
    expect(dark.specularWidth).toBeGreaterThan(0);
    expect(dark.chromatic).toBeGreaterThanOrEqual(0);
  });
  it('light theme exposes the same knobs', () => {
    expect(light.refraction).toBeGreaterThan(0);
    expect(light.specularColor).toMatch(/^(#|rgba?\()/);
    expect(light.specularWidth).toBeGreaterThan(0);
    expect(light.chromatic).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest src/theme/tokens.spec.ts`
Expected: FAIL — `refraction`/`specularColor`/etc. are `undefined`.

- [ ] **Step 3: Add the fields to the `Tokens` interface**

In `mobile/src/theme/tokens.ts`, inside `interface Tokens`, after the `glassHi` field (~line 64), add:

```ts
  // ── Liquid glass (refraction shader knobs) ───────────────
  /** Edge-lensing displacement strength, in normalized surface units. */
  refraction: number;
  /** Specular rim-light color (rgba/hex). */
  specularColor: string;
  /** Specular rim width, 0–1 (fraction of surface half-min-dimension). */
  specularWidth: number;
  /** Chromatic dispersion at the rim, in normalized units (0 disables). */
  chromatic: number;
```

- [ ] **Step 4: Add values to `dark`**

In the `dark` object, after `glassHi` (~line 200):

```ts
  refraction: 0.045,
  specularColor: 'rgba(255,255,255,0.55)',
  specularWidth: 0.12,
  chromatic: 0.006,
```

- [ ] **Step 5: Add values to `light`**

In the `light` object, after `glassHi` (~line 273):

```ts
  refraction: 0.04,
  specularColor: 'rgba(255,255,255,0.9)',
  specularWidth: 0.1,
  chromatic: 0.004,
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd mobile && npx jest src/theme/tokens.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors (all `Tokens` consumers still satisfy the interface — new fields are additive).

- [ ] **Step 8: Commit**

```bash
git add mobile/src/theme/tokens.ts mobile/src/theme/tokens.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): add liquid-glass refraction/specular tokens"
```

---

### Task 2: `liquidGlass.sksl` shader + `LiquidGlass` component (ambient mode)

**Files:**
- Create: `mobile/src/components/liquidGlass.ts` (SkSL source string + compiled effect + uniform builder)
- Create: `mobile/src/components/LiquidGlass.tsx` (component)
- Test: `mobile/src/components/LiquidGlass.spec.tsx` (create)

**Interfaces:**
- Consumes: `Tokens` (Task 1), `useTheme` from `../theme/ThemeProvider`, `radius` from `../theme/tokens`, `PageBackground` gradient/glow token values.
- Produces:
  - `liquidGlass.ts` exports `AMBIENT_SHADER: SkRuntimeEffect` and `buildAmbientUniforms(args): Record<string, unknown>`.
  - `LiquidGlass.tsx` exports `function LiquidGlass(props: LiquidGlassProps)` where
    ```ts
    interface LiquidGlassProps {
      children?: React.ReactNode;
      style?: StyleProp<ViewStyle>;        // outer wrapper (placement, size, radius)
      contentStyle?: StyleProp<ViewStyle>; // inner overlay (content layout/padding)
      radius?: number;                     // default radius.xl (26)
      padding?: number;                    // default 0
      specular?: boolean;                  // default true
      chromatic?: boolean;                 // default true
      tint?: string;                       // override glassBg tint
    }
    ```
  - Later tasks rely on these exact names.

- [ ] **Step 1: Write the shader source + uniform builder**

Create `mobile/src/components/liquidGlass.ts`. The shader draws a rounded-rect SDF; outside the rect it returns transparent. Inside, it reconstructs the page's ambient gradient+glow at the surface's page-space position, displaces the sample UV near the edges (refraction), samples with a small R/B split (chromatic), then composites the glass tint and a specular rim.

```ts
import { Skia } from '@shopify/react-native-skia';

/**
 * Ambient liquid-glass shader. Reconstructs the app's page backdrop
 * (linear violet gradient + one dominant glow blob) procedurally from
 * uniforms, so it can refract "what's behind" without capturing any
 * native view. Coordinates are in surface-local pixels; uOffset/uPageSize
 * place the surface within the full page so the sampled gradient lines up
 * with PageBackground.
 */
export const AMBIENT_SKSL = `
uniform float2 uSize;        // surface size (px)
uniform float  uRadius;      // corner radius (px)
uniform float2 uOffset;      // surface top-left in page space (px)
uniform float2 uPageSize;    // full page size (px)
uniform float4 uG0;          // gradient stop 0 (top) rgba 0..1
uniform float4 uG1;          // gradient stop mid rgba
uniform float4 uG2;          // gradient stop bottom rgba
uniform float4 uGlow;        // glow color rgba (a = peak opacity)
uniform float2 uGlowC;       // glow center in page space (px)
uniform float  uGlowR;       // glow radius (px)
uniform float4 uTint;        // glass tint rgba (glassBg)
uniform float  uRefraction;  // edge displacement strength (0..1 of half-min)
uniform float4 uSpec;        // specular color rgba
uniform float  uSpecW;       // specular width (0..1 of half-min)
uniform float  uChroma;      // chromatic split (0..1 of half-min)

// Signed distance to a rounded rect centered at origin with half-size b, radius r.
float sdRoundRect(float2 p, float2 b, float r) {
  float2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// Ambient page backdrop color at an absolute page-space point (px).
float4 backdrop(float2 pagePt) {
  float ty = clamp(pagePt.y / max(uPageSize.y, 1.0), 0.0, 1.0);
  float4 base = ty < 0.5
    ? mix(uG0, uG1, ty / 0.5)
    : mix(uG1, uG2, (ty - 0.5) / 0.5);
  float d = distance(pagePt, uGlowC) / max(uGlowR, 1.0);
  float g = uGlow.a * (1.0 - smoothstep(0.0, 1.0, d));
  return float4(mix(base.rgb, uGlow.rgb, g), 1.0);
}

vec4 main(vec2 pos) {
  float2 half = uSize * 0.5;
  float2 p = pos - half;                 // surface-centered coords
  float hm = min(half.x, half.y);
  float dist = sdRoundRect(p, half, uRadius);

  // Antialiased rounded-rect mask.
  float aa = 1.0 - smoothstep(-1.0, 1.0, dist);
  if (aa <= 0.0) return vec4(0.0);

  // Edge factor: 0 in the flat center, →1 at the rim.
  float edge = smoothstep(-hm * 0.9, 0.0, dist);
  float2 dir = length(p) > 0.0 ? normalize(p) : float2(0.0);

  // Refraction: push the sample point outward near the edges (lensing).
  float2 disp = dir * edge * uRefraction * hm;
  float2 base = pos + uOffset;           // page-space sample point
  float2 chroma = dir * edge * uChroma * hm;

  float4 col;
  col.r = backdrop(base + disp + chroma).r;
  col.g = backdrop(base + disp).g;
  col.b = backdrop(base + disp - chroma).b;
  col.a = 1.0;

  // Glass tint over the refracted backdrop.
  col.rgb = mix(col.rgb, uTint.rgb, uTint.a);

  // Specular rim on the top / upper-left edge.
  float rim = 1.0 - smoothstep(0.0, uSpecW * hm, abs(dist));
  float topbias = clamp(0.5 - (p.y / uSize.y) - (p.x / uSize.x) * 0.3, 0.0, 1.0);
  float spec = rim * topbias * uSpec.a;
  col.rgb += uSpec.rgb * spec;

  return col * aa;
}`;

export const AMBIENT_SHADER = Skia.RuntimeEffect.Make(AMBIENT_SKSL)!;

function rgba(str: string): [number, number, number, number] {
  const m = str.trim().match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }
  const r = str.match(/rgba?\(([^)]+)\)/i);
  if (!r) return [0, 0, 0, 0];
  const parts = r[1].split(',').map((s) => parseFloat(s.trim()));
  return [parts[0] / 255, parts[1] / 255, parts[2] / 255, parts[3] ?? 1];
}

export interface AmbientUniformArgs {
  size: [number, number];
  radius: number;
  offset: [number, number];
  pageSize: [number, number];
  gradient: [string, string, string]; // pageGradient
  glow: string;                        // dominant pageGlow color (rgba, a=peak)
  glowCenter: [number, number];        // page-space px
  glowRadius: number;                  // page-space px
  tint: string;                        // glassBg
  refraction: number;
  specularColor: string;
  specularWidth: number;
  chromatic: number;
}

export function buildAmbientUniforms(a: AmbientUniformArgs): Record<string, unknown> {
  return {
    uSize: a.size,
    uRadius: a.radius,
    uOffset: a.offset,
    uPageSize: a.pageSize,
    uG0: rgba(a.gradient[0]),
    uG1: rgba(a.gradient[1]),
    uG2: rgba(a.gradient[2]),
    uGlow: rgba(a.glow),
    uGlowC: a.glowCenter,
    uGlowR: a.glowRadius,
    uTint: rgba(a.tint),
    uRefraction: a.refraction,
    uSpec: rgba(a.specularColor),
    uSpecW: a.specularWidth,
    uChroma: a.chromatic,
  };
}
```

- [ ] **Step 2: Write the component**

Create `mobile/src/components/LiquidGlass.tsx`. It measures its own size via `onLayout` and its page-space offset via `measureInWindow`, feeds uniforms, renders the Skia canvas behind the children.

```tsx
import { useState, type PropsWithChildren } from 'react';
import { Dimensions, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, Fill, Shader } from '@shopify/react-native-skia';

import { useTheme } from '../theme/ThemeProvider';
import { radius as R } from '../theme/tokens';
import { AMBIENT_SHADER, buildAmbientUniforms } from './liquidGlass';

export interface LiquidGlassProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  radius?: number;
  padding?: number;
  specular?: boolean;
  chromatic?: boolean;
  tint?: string;
}

export function LiquidGlass({
  children, style, contentStyle, radius: r = R.xl, padding = 0,
  specular = true, chromatic = true, tint,
}: LiquidGlassProps) {
  const { t } = useTheme();
  const [size, setSize] = useState<[number, number]>([0, 0]);
  const [offset, setOffset] = useState<[number, number]>([0, 0]);
  const page: [number, number] = [Dimensions.get('window').width, Dimensions.get('window').height];

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize([width, height]);
    // Page-space offset: measure once laid out. `measure` on the ref via
    // callback ref would also work; measureInWindow keeps it simple.
    e.currentTarget.measureInWindow?.((x, y) => setOffset([x, y]));
  };

  const uniforms = buildAmbientUniforms({
    size,
    radius: r,
    offset,
    pageSize: page,
    gradient: [t.pageGradient[0], t.pageGradient[1], t.pageGradient[2]],
    glow: t.pageGlow[0],
    // Glow center/radius transcribed from PageBackground GLOWS[0] (top-left,
    // cx 12% cy 6%, rx 95% ry 48%) → page-space px.
    glowCenter: [page[0] * 0.12, page[1] * 0.06],
    glowRadius: page[0] * 0.95,
    tint: tint ?? t.glassBg,
    refraction: t.refraction,
    specularColor: specular ? t.specularColor : 'rgba(0,0,0,0)',
    specularWidth: t.specularWidth,
    chromatic: chromatic ? t.chromatic : 0,
  });

  return (
    <View style={[{ borderRadius: r, borderWidth: 1, borderColor: t.glassBrd, overflow: 'hidden' }, style]} onLayout={onLayout}>
      {size[0] > 0 && (
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill>
            <Shader source={AMBIENT_SHADER} uniforms={uniforms} />
          </Fill>
        </Canvas>
      )}
      <View style={[{ borderRadius: r, padding }, contentStyle]}>{children}</View>
    </View>
  );
}
```

> Note (verify in Task 0 findings): if `measureInWindow` off the layout event's `currentTarget` is unavailable on this RN version, attach a `ref` and call `ref.current?.measureInWindow(...)` inside `onLayout` instead. Offset only affects gradient alignment; a `[0,0]` fallback still renders valid glass.

- [ ] **Step 3: Write the smoke test**

Create `mobile/src/components/LiquidGlass.spec.tsx`. Mock Skia (native canvas can't render under jest) and assert the component mounts and renders children.

```tsx
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('@shopify/react-native-skia', () => ({
  Canvas: ({ children }: any) => children,
  Fill: ({ children }: any) => children,
  Shader: () => null,
  Skia: { RuntimeEffect: { Make: () => ({}) } },
}));

import { ThemeProvider } from '../theme/ThemeProvider';
import { LiquidGlass } from './LiquidGlass';

it('renders children inside the glass surface', () => {
  const { getByText } = render(
    <ThemeProvider>
      <LiquidGlass><Text>hi</Text></LiquidGlass>
    </ThemeProvider>,
  );
  expect(getByText('hi')).toBeTruthy();
});
```

> If `@testing-library/react-native` is not a dependency, check `jest.config.js`/existing specs for the project's render helper and mirror it. (Existing `*.spec.tsx` files show the established pattern — follow it; do not add a new test lib without cause.)

- [ ] **Step 4: Run the test**

Run: `cd mobile && npx jest src/components/LiquidGlass.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/liquidGlass.ts mobile/src/components/LiquidGlass.tsx mobile/src/components/LiquidGlass.spec.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): LiquidGlass Skia component + ambient refraction shader"
```

---

### Task 3: TabBar pilot conversion + device fidelity gate

**Files:**
- Modify: `mobile/src/app/TabBar.tsx:76-90` (replace the `BlurView` + tint + top-highlight background layers with a `LiquidGlass` backdrop)

**Interfaces:**
- Consumes: `LiquidGlass` (Task 2).

- [ ] **Step 1: Swap the background layers**

In `mobile/src/app/TabBar.tsx`, replace the three background layers (the `<BlurView .../>` at lines 78–83, the tint `<View .../>` at 84–87, and the `{highlight && ...}` strip at 88–90) with a single absolutely-filled `LiquidGlass`:

```tsx
      {/* Real liquid glass backdrop (replaces expo-blur + tint + highlight). */}
      <LiquidGlass
        radius={0}
        specular
        chromatic
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
```

Add the import at the top: `import { LiquidGlass } from '../components/LiquidGlass';` and remove the now-unused `BlurView` import if nothing else in the file uses it (the `fabGlow` SVG and gradient stay). Keep `borderTopColor`/`borderTopWidth` on the outer `styles.tabbar` View. Remove the now-dead `highlight` const (line 55) if unused.

> `LiquidGlass` currently accepts no `pointerEvents` prop — add `pointerEvents?: ViewProp` passthrough to `LiquidGlassProps` and spread it onto the outer `View`, OR wrap it: `<View pointerEvents="none" style={StyleSheet.absoluteFill}><LiquidGlass .../></View>`. Prefer adding the passthrough prop (one line) so other chrome surfaces can reuse it.

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run existing tests**

Run: `cd mobile && npx jest`
Expected: PASS (no TabBar unit test exists; nothing regresses).

- [ ] **Step 4: DEVICE FIDELITY GATE (human checkpoint)**

Run on a dev build (both platforms): `cd mobile && npx expo run:ios` / `npx expo run:android`.
Verify on the tab bar:
- The violet gradient visibly **bends** at the bar's edges (refraction), not just blurs.
- A bright **specular line** sits along the top rim.
- No seams/aliasing at the rounded region; 60fps when scrolling a list underneath.
- Light and dark themes both read correctly (toggle in Settings).

**STOP and get human sign-off on the look before rolling out to other surfaces.** Tune `refraction`/`specularWidth`/`chromatic` tokens (Task 1) if needed and re-verify. Record the final tuned values.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/app/TabBar.tsx mobile/src/components/LiquidGlass.tsx mobile/src/theme/tokens.ts
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): real liquid glass on iOS tab bar (pilot)"
```

---

### Task 4: Android NavBar → liquid glass

**Files:**
- Modify: `mobile/src/app/NavBar.tsx:54-60` (the `styles.navbar` container currently uses solid `t.bg1`)

**Interfaces:**
- Consumes: `LiquidGlass` (Task 2).

> Design note: the Android nav bar is currently opaque Material 3 (`backgroundColor: t.bg1`). Per the goal ("liquid glass throughout for both platforms") it becomes glass too. Keep the pill indicators and MFab exactly as-is; only the bar background changes.

- [ ] **Step 1: Wrap the bar background in LiquidGlass**

In `mobile/src/app/NavBar.tsx`, change the outer `<View style={[styles.navbar, {...}]}>` so the solid `backgroundColor: t.bg1` is replaced by an absolutely-filled `LiquidGlass` behind the destinations. Keep the `borderTopColor`, `zIndex`, `elevation`, and padding on the container View; add the glass as its first child:

```tsx
    <View style={[styles.navbar, { borderTopColor: t.border, paddingBottom: 12 + insets.bottom }]}>
      <LiquidGlass radius={0} specular chromatic pointerEvents="none" style={StyleSheet.absoluteFill} />
      {DESTS.map((dest) => { /* unchanged */ })}
    </View>
```

Remove `backgroundColor: t.bg1` from the inline style. Add `import { LiquidGlass } from '../components/LiquidGlass';` and `import { StyleSheet } from 'react-native';` (StyleSheet is already imported). Ensure the destinations render above the canvas (they're later siblings, so they do).

- [ ] **Step 2: Typecheck + tests**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: PASS.

- [ ] **Step 3: Device check (Android)**

Run: `npx expo run:android`. Confirm the nav bar now refracts the backdrop with a specular rim, pills/MFab unaffected, 60fps.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/app/NavBar.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): liquid glass on Android nav bar"
```

---

### Task 5: BottomSheet → liquid glass (ambient) — upgrades FormSheet + toast provider sheet

**Files:**
- Modify: `mobile/src/components/BottomSheet.tsx:166-169` (replace the `BlurView` + `sheetBg` surface + `hiLight` with `LiquidGlass`)

**Interfaces:**
- Consumes: `LiquidGlass` (Task 2). `FormSheet` (`mobile/src/components/FormSheet.tsx:391`) and `FeedbackProvider` (`mobile/src/feedback/FeedbackProvider.tsx:161`) both render through `BottomSheet`, so they inherit this automatically.

- [ ] **Step 1: Swap the sheet surface**

In `mobile/src/components/BottomSheet.tsx`, inside `styles.surfaceClip`, replace the `<BlurView .../>` (line 167) and the `<View style={[styles.surface, { backgroundColor: t.sheetBg }]}>` wrapper + `hiLight` (168–169) so the surface is a `LiquidGlass` filling the clip, with the handle/head/body as its children:

```tsx
        <View style={[styles.surfaceClip, { borderTopColor: t.sheetBorder }]}>
          <LiquidGlass
            radius={radius.xl2}
            specular
            chromatic
            tint={t.sheetBg}
            style={StyleSheet.absoluteFill}
            contentStyle={styles.surface}
          >
            {/* handle zone, head, ScrollView body — unchanged children */}
          </LiquidGlass>
        </View>
```

Because the clip already rounds only the top corners, pass `radius={radius.xl2}` for the specular/refraction math but keep the top-corner clipping on `surfaceClip` (bottom corners are offscreen). Remove the `BlurView` import if now unused. The `hiLight` strip is superseded by the shader's specular rim — delete it and `topHighlightColor` usage for the surface (keep `ambientShadowColor` for the ambient drop shadow on `styles.sheet`).

- [ ] **Step 2: Typecheck + tests**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: PASS. (BottomSheet has behavior tests only around drag/open — verify they still pass; the surface swap is presentational.)

- [ ] **Step 3: Device check**

Open any sheet (e.g. Add Transaction via the FAB). Confirm the sheet surface refracts + has a specular top rim, drag-to-dismiss still works, and content is readable on both themes.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/BottomSheet.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): liquid glass on bottom sheet (covers FormSheet + toast sheet)"
```

---

### Task 6: Bottom sheet content-snapshot refraction

**Files:**
- Create: `mobile/src/components/liquidGlassImage.ts` (image-sampling shader variant)
- Modify: `mobile/src/components/LiquidGlass.tsx` (accept optional `backdropImage`)
- Modify: `mobile/src/components/BottomSheet.tsx` (capture page snapshot on open, pass to sheet's LiquidGlass)

**Interfaces:**
- Consumes: `makeImageFromView` from `@shopify/react-native-skia` (exact name confirmed in Task 0), `LiquidGlass` (Task 2/5).
- Produces: `LiquidGlassProps.backdropImage?: SkImage` and `IMAGE_SHADER`/`buildImageUniforms` in `liquidGlassImage.ts`. When `backdropImage` is set, `LiquidGlass` refracts the image instead of the procedural ambient field.

- [ ] **Step 1: Write the image-sampling shader**

Create `mobile/src/components/liquidGlassImage.ts` mirroring `liquidGlass.ts` but with `uniform shader image;` and sampling `image.eval(displacedPagePoint)` for R/G/B instead of the procedural `backdrop()`:

```ts
import { Skia } from '@shopify/react-native-skia';

export const IMAGE_SKSL = `
uniform shader image;        // snapshot of the frozen page, page-space px
uniform float2 uSize;
uniform float  uRadius;
uniform float2 uOffset;      // surface top-left in page space (px)
uniform float4 uTint;
uniform float  uRefraction;
uniform float4 uSpec;
uniform float  uSpecW;
uniform float  uChroma;

float sdRoundRect(float2 p, float2 b, float r) {
  float2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

vec4 main(vec2 pos) {
  float2 half = uSize * 0.5;
  float2 p = pos - half;
  float hm = min(half.x, half.y);
  float dist = sdRoundRect(p, half, uRadius);
  float aa = 1.0 - smoothstep(-1.0, 1.0, dist);
  if (aa <= 0.0) return vec4(0.0);

  float edge = smoothstep(-hm * 0.9, 0.0, dist);
  float2 dir = length(p) > 0.0 ? normalize(p) : float2(0.0);
  float2 disp = dir * edge * uRefraction * hm;
  float2 chroma = dir * edge * uChroma * hm;
  float2 base = pos + uOffset;

  vec4 col;
  col.r = image.eval(base + disp + chroma).r;
  col.g = image.eval(base + disp).g;
  col.b = image.eval(base + disp - chroma).b;
  col.a = 1.0;
  col.rgb = mix(col.rgb, uTint.rgb, uTint.a);

  float rim = 1.0 - smoothstep(0.0, uSpecW * hm, abs(dist));
  float topbias = clamp(0.5 - (p.y / uSize.y) - (p.x / uSize.x) * 0.3, 0.0, 1.0);
  col.rgb += uSpec.rgb * (rim * topbias * uSpec.a);
  return col * aa;
}`;

export const IMAGE_SHADER = Skia.RuntimeEffect.Make(IMAGE_SKSL)!;
```

The image is supplied to the shader as a child `<ImageShader>` (bound to the `image` uniform). Uniform values reuse the `rgba`/token plumbing from `liquidGlass.ts` — export a shared `rgba` helper from `liquidGlass.ts` and import it here (DRY; do not duplicate the parser).

- [ ] **Step 2: Extend LiquidGlass to accept a backdrop image**

In `mobile/src/components/LiquidGlass.tsx`, add `backdropImage?: SkImage` to `LiquidGlassProps`. When present, render the `IMAGE_SHADER` with an `<ImageShader image={backdropImage} .../>` child and image uniforms; otherwise the ambient path (unchanged). Keep the branch minimal and both paths sharing size/offset measurement.

```tsx
      {size[0] > 0 && (
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill>
            {backdropImage ? (
              <Shader source={IMAGE_SHADER} uniforms={imageUniforms}>
                <ImageShader image={backdropImage} fit="none" x={-offset[0]} y={-offset[1]} />
              </Shader>
            ) : (
              <Shader source={AMBIENT_SHADER} uniforms={uniforms} />
            )}
          </Fill>
        </Canvas>
      )}
```

> `ImageShader` positioning (`fit`/`x`/`y`/`rect`) must be confirmed against the installed Skia API (Task 0). The intent: the shader samples the page snapshot in page-space coordinates so refraction lines up with the real content behind the sheet.

- [ ] **Step 3: Capture the snapshot in BottomSheet on open**

In `mobile/src/components/BottomSheet.tsx`: add a `pageRef` (a `ref` on the app root / the view under the sheet — pass it in as a prop `captureRef?: RefObject<View>` from `AppShell`, OR use the sheet's own parent). On the `open` transition (in the existing `useEffect`), call `makeImageFromView(captureRef.current)` → store the `SkImage` in state; clear it on close. Pass it as `backdropImage` to the sheet's `LiquidGlass`.

```tsx
  const [snap, setSnap] = useState<SkImage | null>(null);
  useEffect(() => {
    if (open && captureRef?.current) {
      makeImageFromView(captureRef.current).then(setSnap).catch(() => setSnap(null));
    } else {
      setSnap(null);
    }
  }, [open]);
```

Pass `backdropImage={snap ?? undefined}` to the sheet surface's `LiquidGlass`. If `snap` is null (capture failed / not wired on a platform), the ambient path renders — graceful fallback (design D3/D4).

> Wiring `captureRef`: `AppShell` renders the page content and the sheet siblings. Add a `ref` to the page-content container and thread it to `BottomSheet` via context or prop. Keep it optional so `BottomSheet` still works without it (ambient fallback).

- [ ] **Step 4: Typecheck + tests**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: PASS (update the Skia jest mock to stub `makeImageFromView` → `Promise.resolve(null)` and `ImageShader` → `null`).

- [ ] **Step 5: Device check**

Open a sheet over a content-rich screen (e.g. Transactions). Confirm the **real content** behind the sheet is visibly bent/refracted at the sheet's top edge (not just the gradient). Confirm no jank on open (single capture) and correct release on close.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/liquidGlassImage.ts mobile/src/components/LiquidGlass.tsx mobile/src/components/BottomSheet.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): content-snapshot refraction behind bottom sheet"
```

---

### Task 7: FAB fan action pills → liquid glass

**Files:**
- Modify: `mobile/src/app/FabActions.tsx:182-240` (the two `BlurView` surfaces at 188 and 238)

**Interfaces:**
- Consumes: `LiquidGlass` (Task 2).

- [ ] **Step 1: Read the file and identify the two glass surfaces**

Read `mobile/src/app/FabActions.tsx`. The pill at ~line 182 uses `t.fabActionBg`/`t.fabActionBorder` with a `BlurView` (line 188); there is a second `BlurView` at line 238 (verify what it backs — likely the fan/dial variant). Each is a rounded glass surface.

- [ ] **Step 2: Replace each BlurView-backed surface with LiquidGlass**

For each pill surface, replace the `BlurView` + tint layer with `<LiquidGlass radius={<the pill's radius>} tint={t.fabActionBg} specular chromatic style={StyleSheet.absoluteFill} pointerEvents="none" />`, keeping the pill's border, layout, icon, and label children unchanged. Use the existing radius of each pill (fan pill is `99` per mobile.css `.m-fab-fan`; action pill is `18`). Remove the `BlurView` import if now unused.

- [ ] **Step 3: Typecheck + tests**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: PASS.

- [ ] **Step 4: Device check**

Open the FAB speed-dial. Confirm each action pill is refractive glass with a specular rim; open/close animation and taps still work.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/app/FabActions.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): liquid glass on FAB action pills"
```

---

### Task 8: Toast → liquid glass

**Files:**
- Modify: `mobile/src/feedback/FeedbackProvider.tsx` (the toast surface around line 224, `backgroundColor: t.toastBg`)

**Interfaces:**
- Consumes: `LiquidGlass` (Task 2).

- [ ] **Step 1: Read the toast render**

Read `mobile/src/feedback/FeedbackProvider.tsx` around lines 220–350. Identify the toast pill: `t.toastBg` background + `t.toastBorder` + its `BlurView` (if present) + `hiLight` strip.

- [ ] **Step 2: Replace the toast surface with LiquidGlass**

Wrap the toast content in `<LiquidGlass radius={99} tint={t.toastBg} specular chromatic style={StyleSheet.absoluteFill} pointerEvents="none" />` behind the icon/text row, keeping the toast's entrance animation (`toastIn`) and layout. Remove the superseded `hiLight` strip and unused `BlurView` import.

- [ ] **Step 3: Typecheck + tests**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: PASS.

- [ ] **Step 4: Device check**

Trigger a toast (e.g. save a transaction). Confirm the pill is refractive glass, animates in correctly, and text stays legible.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/feedback/FeedbackProvider.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): liquid glass on toast"
```

---

### Task 9: Home AI-insights hero card → liquid glass

**Files:**
- Modify: `mobile/src/screens/home/AiInsightsStrip.tsx:56-91` (currently `GlassView`)

**Interfaces:**
- Consumes: `LiquidGlass` (Task 2).

- [ ] **Step 1: Swap GlassView → LiquidGlass on the hero card**

In `mobile/src/screens/home/AiInsightsStrip.tsx`, replace `<GlassView style={styles.card} padding={14} radius={radius.lg}>...</GlassView>` (lines 56–91) with `<LiquidGlass style={styles.card} padding={14} radius={radius.lg} specular chromatic>...</LiquidGlass>`. Update the import from `../../components/Glass` to `../../components/LiquidGlass`. Children unchanged.

> This is the one hero content-card on liquid glass. All other `GlassView`/`GlassCard` usages (list rows, etc.) stay on the cheap `expo-blur` tier per the design.

- [ ] **Step 2: Typecheck + tests**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: PASS.

- [ ] **Step 3: Device check**

Home screen: confirm the AI-insights card refracts the backdrop with a specular rim, and the horizontal-scroll strip still scrolls smoothly (it's one card, not a per-row canvas).

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/home/AiInsightsStrip.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): liquid glass on Home AI-insights hero card"
```

---

### Task 10: Cleanup, guardrails, and full verification

**Files:**
- Modify: `mobile/src/components/Glass.tsx` (doc note only)

- [ ] **Step 1: Add a tier note to Glass.tsx**

At the top doc comment of `mobile/src/components/Glass.tsx`, add a line: this is the **cheap tier** (`expo-blur`) for dense list rows/chips/inputs; the **premium tier** for chrome/hero surfaces is `LiquidGlass` (`./LiquidGlass.tsx`, Skia refraction). Do not convert list-tier surfaces to Skia.

- [ ] **Step 2: Grep for any leftover chrome BlurView**

Run: `cd mobile && grep -rn "BlurView" src/app src/components/BottomSheet.tsx src/feedback`
Expected: only intended remaining usages (if any) — confirm no chrome surface was missed.

- [ ] **Step 3: Full typecheck + test suite**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: PASS, all suites.

- [ ] **Step 4: Perf pass on mid Android**

On a mid-range Android dev build, scroll Transactions and Home fast with the glass TabBar/NavBar visible. Confirm sustained ~60fps (use the perf monitor). If a specific surface janks, reduce its shader cost (drop `chromatic`, lower blur) rather than reverting.

- [ ] **Step 5: Final commit**

```bash
git add mobile/src/components/Glass.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "docs(mobile): note liquid glass tier split in Glass.tsx"
```

---

## Self-Review Notes

- **Spec coverage:** D1 unified Skia → Tasks 0,2. D2 chrome+hero scope → Tasks 3,4,5,7,8,9 (list tier untouched, Task 10 guardrail). D3 ambient refraction → Task 2. D4 sheet snapshot → Task 6. D5 chromatic token → Task 1, gated in Task 2. All spec surfaces (TabBar, NavBar, sheets, FAB, toast, hero) have tasks. FormSheet + toast-sheet covered transitively via Task 5.
- **Type consistency:** `LiquidGlass`/`LiquidGlassProps`, `AMBIENT_SHADER`/`buildAmbientUniforms`, `IMAGE_SHADER`, `backdropImage`, `rgba` helper names are used consistently across Tasks 2/3/5/6.
- **Known verify-points (flagged inline, not placeholders):** exact Skia export/API names (Task 0 gates this), `measureInWindow` availability, `ImageShader` positioning, jest render helper — each has a concrete fallback in-task.
