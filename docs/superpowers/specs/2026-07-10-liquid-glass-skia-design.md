# Real Liquid Glass UI (Skia) — Design

**Date:** 2026-07-10
**Status:** Approved (design), pending spec review
**Scope:** `mobile/` (Expo SDK 56, RN 0.85, React 19.2, Reanimated 4.3)

---

## 1. Goal

Replace the app's current **frosted glass** (`expo-blur`) with **real, refractive liquid
glass** — edge lensing, specular rim-light, subtle chromatic dispersion, adaptive tint —
rendered **identically on iOS and Android** via a single GPU shader backend.

Current state: [`mobile/src/components/Glass.tsx`](../../../mobile/src/components/Glass.tsx)
wraps `expo-blur`'s `BlurView` + a tint overlay + a 1px border + a faked top highlight
line. That is frosted glass: blur only, no refraction, no specular. This design supersedes
it for "chrome + hero" surfaces while keeping it as a cheap tier for dense lists.

## 2. Decisions (locked)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Unified Skia** (`@shopify/react-native-skia`) on both platforms | User pick. One SkSL shader → pixel-matched iOS/Android; avoids the iOS<26 fallback gap of `expo-glass-effect` and Android's lack of any native glass. |
| D2 | **True refraction on chrome + hero surfaces**; dense list rows/chips/inputs keep the existing `expo-blur` cheap tier | User pick. One Skia canvas per chrome element is affordable; a canvas per list row is the Android perf trap. |
| D3 | **Ambient refraction** as the default backdrop model | Skia `BackdropFilter` only samples same-canvas content; per-frame native snapshots are the perf trap. The page backdrop is already a procedural gradient+glow field (`pageGradient`/`pageGlow` tokens), so we reconstruct and refract *that field* in-shader — cheap, unified, and the dominant visual cue of glass. |
| D4 | **Content-snapshot refraction on the bottom sheet only** | The sheet is the highest-attention glass surface and the page is frozen while it's open, so a single `makeImageFromView` snapshot on open gives real content-behind bending at near-zero cost (not per-frame). |
| D5 | **Chromatic aberration: included, subtle, token-gated** | Faint edge dispersion reads premium; strength kept low and exposed as a token so it can be tuned/disabled. |

## 3. Architecture

### 3.1 The shader — `liquidGlass.sksl`
A single SkSL runtime shader is the heart of the system. Uniforms are fed from theme
tokens + layout. Per fragment it computes, against a **rounded-rect signed distance
field (SDF)**:

1. **Edge displacement / lensing** — sample the ambient field with UVs displaced
   proportional to proximity to the edge (`refraction` strength token) → the backdrop
   bends at the rim, flat in the center. This is what separates liquid from frosted.
2. **Specular rim-light** — a bright, thin highlight along the top / upper-left rim,
   derived from the SDF normal (`specularColor`, `specularWidth` tokens). The Apple
   "wet glass" edge.
3. **Chromatic dispersion** — subtle R/B channel offset at the rim only (`chromatic`
   token, low default).
4. **Tint + saturation** — `glassBg` tint composited over a saturation-boosted sample
   (mirrors the CSS `saturate(180%)`).

The "ambient field" is reconstructed in-shader from the same `pageGradient` +
`pageGlow` values `PageBackground` already uses, passed as uniforms — so glass refracts
exactly the backdrop the page paints, with no view capture.

### 3.2 Components — a tiered system

**`<LiquidGlass>`** (new, `mobile/src/components/LiquidGlass.tsx`) — premium tier.
- Renders a Skia `<Canvas>` (via `<Fill>`/`<RoundedRect>` + the runtime shader) sized to
  the surface; children render as normal RN views layered on top.
- Props: `radius`, `tint?`, `intensity?`, `specular?` (bool), `chromatic?` (bool),
  `interactive?` (press shifts the specular origin), `backdropImage?` (SkImage — the
  sheet snapshot path), plus `style` / `contentStyle` matching the current `Glass.tsx`
  wrapper/overlay split.
- Animation driver: Skia `useClock` for the idle specular shimmer. **If** Skia ↔
  Reanimated 4 interop is clean on this stack, press/interactive uniforms come from a
  shared value; if not, `useClock` + Skia state is the fallback (verified in Task 0).

**`<GlassView>` / `<GlassCard>`** (existing `expo-blur`) — **retained unchanged** as the
cheap tier for list rows, chips, inputs. Long scrolling screens keep current perf.

### 3.3 Sheet snapshot path (D4)
`BottomSheet`/`FormSheet` on open: capture the frozen page view to an `SkImage`
(`makeImageFromView`), pass it as `backdropImage`; the shader refracts the real snapshot
instead of the ambient field. Snapshot is released on close. One capture per open.

### 3.4 Tokens
Add to `mobile/src/theme/tokens.ts` `Tokens` (both themes):
`refraction: number`, `specularColor: string`, `specularWidth: number`,
`chromatic: number`. Existing `glassBg`/`glassBrd`/`glassBrd2`/`glassHi` continue to
drive tint/border/highlight. Values transcribed per theme (dark = brighter specular on
dark field; light = softer).

## 4. Surfaces converted to `LiquidGlass`

Chrome + hero only (D2):
- `mobile/src/app/TabBar.tsx` (floating tab bar) — **pilot surface** (built + device-tested first)
- `mobile/src/app/NavBar.tsx` (topbar, `.scrolled` state)
- `mobile/src/components/BottomSheet.tsx` + `FormSheet.tsx` (+ snapshot path, D4)
- `mobile/src/app/FabActions.tsx` (fan action pills)
- Toast surface
- Hero/summary cards: home `AiInsightsStrip`, account/budget summary headers

**Not converted** (stay `expo-blur`): transaction/account/category list rows, filter
chips, form inputs.

## 5. Dependencies

- Add `@shopify/react-native-skia` (latest, RN ≥0.79 / React ≥19 / New Arch — compatible)
  + its Expo config plugin. Already on EAS dev builds (custom native modules
  `sms-reader`, `notification-listener` present) → no Expo Go regression.
- Per `mobile/AGENTS.md`: consult exact `https://docs.expo.dev/versions/v56.0.0/` docs
  before writing native-touching code.

## 6. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Skia ↔ Reanimated 4 / `react-native-worklets` 0.8 interop unproven on this stack | **Task 0** spike verifies before conversion; fallback = Skia `useClock` (no Reanimated dependency for the shader). Not a blocker. |
| Android GPU cost | Scope limited to few chrome canvases (D2); shader kept branch-light; device-tested on mid Android at the TabBar pilot before rollout. |
| Rounded-rect clip + shader seams | RoundedRect SDF in-shader (not a separate clip layer) so edges are AA'd by the shader itself. |
| `makeImageFromView` API/perf | Sheet-only, once per open; if capture is unavailable/janky on a platform, sheet gracefully falls back to ambient refraction (D3). |

## 7. Testing / verification

- Task 0 spike: Skia canvas + trivial shader renders on iOS + Android dev build.
- Visual: TabBar pilot compared against the web prototype `project/riddhi` liquid glass
  and against `expo-glass-effect` on an iOS 26 device as a fidelity reference.
- Perf: scroll a long list with the converted TabBar/NavBar present on a mid Android
  device; confirm 60fps.
- Existing component tests unaffected (cheap tier unchanged); add a render/smoke test for
  `LiquidGlass` (mounts, accepts props, children render).

## 8. Out of scope (v1)

- Content-snapshot refraction on non-sheet surfaces (ambient field only).
- `expo-glass-effect` native path (rejected in favor of unified Skia, D1).
- Converting list-tier surfaces to Skia.

## 9. Rollout order

1. Task 0 — deps + Skia/Reanimated interop spike.
2. `liquidGlass.sksl` + `LiquidGlass` component + tokens.
3. TabBar pilot → device test.
4. Roll across NavBar, sheets (+ snapshot), FAB, toast, hero cards.
5. Cleanup: confirm cheap tier retained where intended; docs note in `Glass.tsx`.
