# Floating rounded TabBar — design

## Context

The UI design handover (`project/riddhi/mobile.css?v=4`) redesigned `.m-tabbar`
from a flat, edge-attached bar into a **floating rounded glass capsule**
(mobile.css:257–305). Our RN `mobile/src/app/TabBar.tsx` still renders the older
flat design (square, `borderTopWidth: 1` only, flush to the screen bottom). This
brings the RN bar in line with the handover's floating shape.

The `.m-tabbar` remains a `flex-shrink: 0` sibling of the page in the `.m-shell`
column — it is **not** absolutely positioned and does **not** overlap page
content; the page shrinks above it. Our `AppShell` (mobile/src/app/AppShell.tsx)
has the identical structure (stage `flex:1`, then `<TabBar/>`). So this port is
contained entirely to `TabBar.tsx` (plus one token note) — no cross-screen scroll
padding, no `AppShell` changes.

Relationship to the liquid-glass-skia pilot (docs/.../2026-07-10-liquid-glass-skia-design.md,
which names TabBar as its Skia-shader pilot surface): **land the floating shape now**
on the existing `expo-blur` glass. It becomes the substrate the Skia liquid-glass
pass later refracts through. No conflict; this is a natural first step.

## Goal

Port the handover's floating rounded `.m-tabbar` to `TabBar.tsx`, faithfully in
both light and dark themes, keeping the FAB centre tab and the RN-only glow/
highlight embellishments (adapted to the rounded shape).

## Design

### 1. Container geometry (`.m-tabbar`, mobile.css:257–273)

| Property | Now | New |
|---|---|---|
| margins | none (full-width, flush) | `marginHorizontal: 14`, `marginBottom: insets.bottom + 12`, `marginTop: 0` |
| height | `64 + padBottom` | fixed `70` |
| radius | `0` | `30` |
| border | `borderTopWidth: 1` | `borderWidth: 1` all sides, color `t.tabbarBorder` |
| padding | top `8` / horiz `12` | `paddingVertical: 8`, `paddingHorizontal: 10` |

The old `padBottom` / safe-area-as-internal-padding logic is removed — the safe
area inset now lives in `marginBottom` (mirrors the handover's
`margin: 0 14px calc(env(safe-area-inset-bottom) + 12px)`).

### 2. Layering (the crux)

Three RN constraints collide: (a) blur + tint must be clipped to the 30px rounded
shape; (b) the centre FAB must protrude ~24px **above** the bar's top edge;
(c) the handover's `0 12px 40px rgba(0,0,0,0.45)` drop shadow. On iOS
`overflow:'hidden'` sets `masksToBounds`, which **clips shadows**, and `BlurView`
samples ancestor backgrounds — so clip + shadow + FAB-escape cannot share one
view. Structure:

```
<View tabbar>                    // margins, height 70, radius 30, flexRow, padding
                                 // overflow VISIBLE  → FAB escapes the top edge
  <View glassClip>               // absoluteFill, radius 30, overflow HIDDEN → clips blur
     <BlurView/> <tint/> <fabGlow/> <topHighlight/>
  </View>
  <View chrome>                  // absoluteFill, radius 30, 1px border, tint-color body,
                                 // shadow props + elevation, overflow VISIBLE → shadow renders
  {TABS.map(...)}                // tab row, above glass; FAB slot marginTop:-29 pokes above bar
</View>
```

- The **drop shadow** rides the `chrome` layer (it has a colour silhouette for
  iOS to derive the shadow from, and is overflow-visible so its own shadow is not
  clipped). Verify on device that the shadow actually renders from a translucent
  body; bump `shadowOpacity` / add a faint solid backing if it does not.
- The **blur/tint** are clipped by the separate `glassClip` layer.
- The **FAB** escapes because the outer `tabbar` is overflow-visible.

This is the primary implementation risk and the first thing to verify on device
(FAB not clipped; shadow visible).

### 3. Embellishments — keep and adapt (decision: keep both)

- **fabGlow** — retained; its clip region changes from a rectangle to the 30px
  rounded pill (moves inside `glassClip`), and it is re-anchored so the bright
  band still pools under the centre FAB.
- **topHighlight** — retained, adapted to the rounded top: rendered as the
  handover's inset sheen (`inset 0 1.5px rgba(255,255,255,0.16)` top,
  faint `inset 0 -1px rgba(255,255,255,0.04)` bottom) approximated with thin
  highlight views that follow the corner radius, since RN has no inset box-shadow.

### 4. Active pill (`.m-tab.active::before`, mobile.css:294–305)

The handover recenters the pill on the full tab (`top:50%`, `52×42`, radius 16).
We **keep the existing icon-slot anchoring** — the current code deliberately
anchored the pill to the icon's box because on device the full-tab pill's bottom
edge cut through the label (documented at TabBar.tsx:224). Only the pill size is
bumped to `52×42` / radius `16` to match the handover. (Literal recenter was
considered and rejected to preserve the device fix.)

### 5. Token

`t.tabbarShadow` is a single inset-shadow string and cannot express the new
shadow (a drop shadow + two insets). The drop-shadow props are inlined in
`TabBar.tsx` as discrete `shadow*` / `elevation` props, and the insets become the
highlight views (§3). `tabbarBg` / `tabbarBorder` are unchanged — their values
already match the handover for both themes. `tabbarShadow` is repurposed to carry
the top-inset highlight colour (or removed if unused after the port); the plan
records which.

## Testing

- iOS simulator screenshot compared against the web prototype `project/riddhi`
  floating bar, in **both** light and dark themes.
- Explicitly verify: the centre FAB protrudes and is **not** clipped by any
  rounded layer; the drop shadow renders; the rounded corners clip the blur
  cleanly (no square blur bleed).
- Sanity-check Android `elevation` renders a comparable shadow.

## Out of scope

- The Skia liquid-glass shader (separate pilot spec).
- Any `AppShell` / per-screen scroll-padding changes (not needed — bar reserves
  its row).
- The Android `.m-navbar` (`NavBar.tsx`) — this port is the iOS `.m-tabbar` only.
