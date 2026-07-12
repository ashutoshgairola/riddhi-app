# Riddhi App Logo — Design

**Date:** 2026-07-12
**Status:** Approved (design), pending implementation plan

## Goal

Apply the existing Riddhi brand kit (in `logo/logos/*.svg`) across the mobile
app in three places: the **app icon**, the **splash screen**, and the **in-app
brand wordmark** on the auth/Welcome screen.

## Context

- Expo v56 app (`mobile/`), managed / Continuous Native Generation workflow —
  `/android` and `/ios` are gitignored, so `app.json` is the source of truth and
  native projects are regenerated at build/prebuild time.
- `react-native-svg` + `react-native-svg-transformer` are already configured
  (`metro.config.js`), so `.svg` files import as React components.
- Brand kit lives in `logo/logos/`:
  - `1a-app-icon.svg` — rounded-tile app icon (R mark on dark-purple gradient)
  - `1a-logomark.svg` — the "R" glyph alone
  - `1a-wordmark.svg` — "Riddhi" wordmark (custom R + text)
  - `1a-lockup.svg` — icon tile + wordmark
- Brand palette (`#9678f0` / `#b6a4f3` accents, `#1d1733`→`#14101f` dark
  background) matches the app's existing hero-glow and `PageBackground` tokens.
- Current state: `app.json` points `icon` at a placeholder `assets/icon.png`;
  **no splash screen is configured**; the in-app `Wordmark`
  (`src/screens/auth/authUi.tsx:73`) is a **text placeholder** (`₹iddhi` in the
  app font), used by `Welcome.tsx:85`.

Expo requires **PNG** for icons and splash — SVG cannot be consumed there — so
the brand SVGs must be rasterized.

## Decisions

- **Rasterization tooling:** add `@resvg/resvg-js` as a **devDependency** plus a
  committed generator script `mobile/scripts/gen-icons.mjs`. Regenerates every
  PNG deliverable from SVG sources. Reproducible when the brand changes.
- **Onboarding wizard:** out of scope — logo goes to icon, splash, and the
  auth wordmark only.

## Deliverables

### 1. Rasterization pipeline

- Add dev dependency `@resvg/resvg-js`.
- Author small SVG source variants under `mobile/assets/brand/` (derived from the
  brand kit, kept in-repo as the rasterization inputs):
  - `icon-square.svg` — 1024-target, **full-bleed** dark gradient + centered R
    mark, **square corners, no alpha** (iOS-safe; iOS masks its own rounding).
  - `adaptive-foreground.svg` — R mark only, transparent, sized into the Android
    safe zone (~66% of canvas).
  - `adaptive-background.svg` — brand dark-purple gradient, full square.
  - `adaptive-monochrome.svg` — white R silhouette on transparent (Android
    themed icons).
  - `splash.svg` — the logomark (from `1a-logomark.svg`) for the splash image.
- `scripts/gen-icons.mjs`: rasterize the above into `mobile/assets/`:
  - `icon.png` (1024×1024)
  - `android-icon-foreground.png`, `android-icon-background.png`,
    `android-icon-monochrome.png`
  - `favicon.png` (48×48, from `icon-square.svg`)
  - `splash-icon.png` (logomark)
- Add an npm script, e.g. `"gen:icons": "node scripts/gen-icons.mjs"`.

### 2. App icon (`app.json`)

- `expo.icon` continues to point at `./assets/icon.png` (now the brand icon).
- Update `expo.android.adaptiveIcon.backgroundColor` from `#E6F4FE` to the brand
  dark (e.g. `#14101f`) — foreground/background/monochrome images regenerated as
  above.
- Regenerate `favicon.png` for web.

### 3. Splash screen

- Install `expo-splash-screen`.
- Add its config plugin to `app.json` `plugins`:
  ```json
  ["expo-splash-screen", {
    "backgroundColor": "#14101f",
    "image": "./assets/splash-icon.png",
    "imageWidth": 200
  }]
  ```
- Applies automatically on next prebuild/EAS build (CNG workflow).

### 4. In-app wordmark

- Add a brand component module (e.g. `mobile/src/components/brand.tsx`) exposing:
  - `BrandWordmark` — renders `logo/logos/1a-wordmark.svg` (imported via
    svg-transformer), sized by a `size`/height prop.
  - `BrandLogomark` — renders `1a-logomark.svg` (available for reuse; not wired
    into onboarding this pass).
  - SVG sources referenced from the transformer must be importable from
    `mobile/` — copy the two needed SVGs into `mobile/assets/brand/` so metro can
    resolve them (avoids importing across the repo root).
- Replace the **body** of the existing `Wordmark` export in
  `src/screens/auth/authUi.tsx:73` so it renders `BrandWordmark` internally,
  keeping the same export name and `{ size }` signature — `Welcome.tsx:85` then
  needs no change. Colors as-authored (near-white text + purple R) read on the
  dark hero gradient.

## Out of scope

- Munshi chatbot artwork and bank logos — untouched.
- Onboarding wizard header logo.
- Any change to `userInterfaceStyle` or theme tokens.

## Verification

- Run `npm run gen:icons`; confirm all PNGs regenerate with expected dimensions
  and no alpha on `icon.png`.
- `npx expo prebuild --clean` (or an EAS/dev build) shows the new launcher icon
  and splash.
- Launch the app: Welcome screen renders the brand wordmark in place of the old
  `₹iddhi` text.
- Typecheck / existing tests still pass.
