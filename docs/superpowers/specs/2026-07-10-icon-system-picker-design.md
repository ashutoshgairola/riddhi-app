# Icon System Port + Picker Rollout — Design

**Date:** 2026-07-10
**Status:** Approved (brainstorming)

## Problem

The UI design handover (`project/riddhi/MobileCore.jsx`) introduces a full
liquid-glass icon system that the real Expo/React Native app does not yet have:

- **`MICONS`** — ~90 named content/category SVG icons (24×24 stroke).
- **`M_EMOJI`** — legacy map: old emoji/glyph → new icon name (render-time safety net).
- **`mIcon(v, size, sw)`** — universal resolver (name | emoji | element → SVG, text fallback).
- **`MICON_LIST`** — curated `[name, label]` list that populates the picker grid.
- **`MIconPickerHost` + `mPickIcon(cfg)`** — glass bottom-sheet picker (search + 5-col grid).

Today the RN app (`mobile/src/components/icons.tsx`) only has the **15-icon chrome
set** (`MI.search`, `MI.bell`, …) used as named components. Content/category icons are
free-text **emoji** fields (e.g. TxCategories `{ key: 'icon', placeholder: '🏷' }`,
rendered `<Text>{c.icon}</Text>`). Emoji glyphs appear across ~40 files.

Goal: port the handover's icon system into RN and replace **all** rendered icons/emoji
with it, wiring an icon picker into every icon-selection surface — **except the Munshi ji
logo** (`assets/munshi.png`, rendered via `<Image>`).

## Decisions (from brainstorming)

- **Scope:** foundation + full rollout, one spec, executed in slices.
- **Picker surfaces:** everywhere an icon is selectable.
- **Legacy data:** render-time fallback only (`M_EMOJI`). Picker writes icon **names**
  going forward. No backend migration.
- **Picker integration (Approach A):** declarative `kind: 'icon'` field in `FormSheet`
  for form-driven surfaces; reusable `<IconPickerSheet>` + `useIconPicker()` hook for
  custom sheets. No global `window`-style event bus.
- **Library organization:** keep existing `MI` chrome set untouched; add the content set
  as a **new module** rather than ballooning the 325-line `icons.tsx`.

## Architecture

### 1. Icon library — `mobile/src/components/contentIcons.tsx` (new)

- Port the ~90 `MICONS` as `Record<ContentIconName, (p: IconProps) => JSX.Element>` RN
  components. Every `<path>/<polyline>/<circle>/<line>/<rect>` transcribed **verbatim**
  from the source `d`/`points`/attribute values into `react-native-svg`; only element
  names and prop casing change. `stroke="currentColor"` → explicit `color` prop (default
  `#f3f0fb`/`t.text1`), threaded to `stroke`, and to `fill` only where the source used
  `fill="currentColor"`.
- Port `M_EMOJI` (emoji/glyph → name) and `ICON_LIST` (`[name, label]`) verbatim.
- **Resolver:** `<AppIcon value size color strokeWidth />` — accepts an icon **name** or a
  legacy **emoji**; resolves via `MICONS` then `M_EMOJI`; renders the SVG. Unknown value
  falls back to `<Text>{value}</Text>` so unmapped stored data never crashes.
- **`<AppIconBox value color size />`** — the standard **prominent** presentation wrapper
  (see Visual prominence). Renders `<AppIcon>` centered in a tinted rounded box. Used for
  every content/category/source/budget/goal/event icon so prominence is consistent and
  DRY, instead of each screen re-implementing the box.
- Reuses `IconProps` from `icons.tsx`.

### 2. Picker — `mobile/src/components/IconPickerSheet.tsx` (new)

- `<IconPickerSheet open value color onPick onClose />` built on the existing
  `BottomSheet`. Search `TextInput` + 5-column grid rendered from `ICON_LIST`; the
  currently-selected icon is highlighted using the accent `color`. Tapping an icon calls
  `onPick(name)` and closes.
- `useIconPicker()` hook: returns `{ pick(cfg), sheet }` for imperative open from custom
  sheets that don't go through `FormSheet`. Local state per consumer — no global singleton.

### 3. FormSheet integration — `mobile/src/components/FormSheet.tsx`

- Add field `kind: 'icon'` to the field discriminated union (alongside
  `text | amount | date | bank | select`), with optional `color`.
- Renders a tappable icon chip (via `<AppIcon>`); opening it presents `IconPickerSheet`;
  the chosen **name** is stored as the field value. Every `form({...})` surface opts in by
  changing its icon field to `{ kind: 'icon', key: 'icon', color? }`.

### 4. Rollout — slices (execution order)

- **Slice 0 — Foundation:** items 1–3 above + wire **TxCategories** as the reference
  surface (`{ key:'icon' }` → `{ kind:'icon' }`; `<Text>{c.icon}</Text>` → `<AppIcon
  value={c.icon}>`; seed defaults become names, e.g. `'tag'`/`'coins'`) + unit tests.
- **Slice A — Money:** Accounts, AccountDetail, CardDetail, Budgets, Goals, Invest,
  payment sources.
- **Slice B — Transactions:** Txns, TxDetail, CategoryDetail, AddTxSheet, ChatTxCard, Search.
- **Slice C — Events & subs:** `screens/events/*`, subscriptions.
- **Slice D — Home/Chat/chrome:** Home, Chat, Notifications, Sync, Reports, TabBar, NavBar,
  FabActions, MoreSheet, ProfileSheet, PayBillSheet.
- **Slice E — Onboarding/auth/settings:** `screens/onboarding/*`, `screens/auth/*`, Settings.

Each slice: category/source/budget/goal/event icons → `<AppIconBox>` (prominent, colored —
see Visual prominence); other rendered emoji glyphs → `<AppIcon>`/named icons; wire pickers
where a selection exists.

## Visual prominence (icons must be prominent & clearly visible)

Content icons must read as colored, deliberate marks — never faint, tiny, or gray.
Codified via `<AppIconBox>` so every surface is consistent (matching the handover:
`MobileScreens.jsx:579`, `MobileHome.jsx:215`):

- **Icon box:** square `40–44`px, radius `12–14`, `background = color + '22'` (subtle
  accent tint). Icon centered inside.
- **Icon color = the entity's accent color** (category/source `color`), **not** muted
  `text-3`/gray, so it stands out on the tinted box. Fallback accent `t.em` when no color.
- **Icon size:** `18–20` inside the box (`19–20` for primary rows/detail headers,
  `18` for compact rows). Stroke width `2` (the handover default) for a clean, legible weight.
- **Inline icons** (chips, list meta, buttons): minimum `16` for readability; use the
  relevant semantic/accent color, never gray-on-gray.
- **Picker grid:** icon tiles at `20`, selected tile highlighted in the accent `color`
  (already the handover behavior).
- No content icon is rendered at `< 16`px or in a low-contrast muted color for a primary
  display role.

## Guardrails

- **Never touch** `assets/munshi.png` `<Image>` usages (FabActions, Settings,
  Notifications, Chat, home/AiInsightsStrip).
- **Do not replace** emoji that are not rendered UI:
  - `*.spec.ts` fixtures and comments.
  - Logic/data strings where the emoji is semantically matched or is source-of-truth data:
    `lib/smsSyncMap.ts`, `lib/pluralize.ts`, `lib/catalogSource.ts`, `api/adapters.ts`
    mapping tables, `assets/bankLogos.ts`. Each slice audits render-vs-data before swapping.
- **No backend change** — resolver handles legacy emoji at render; picker writes names.
- Existing `MI` chrome set stays as-is.

## Testing

- **Unit** (`contentIcons.spec.tsx`): resolver returns SVG for a known name; maps a legacy
  emoji via `M_EMOJI`; falls back to `<Text>` for an unknown value. Assert every `M_EMOJI`
  target and every `ICON_LIST` name exists in `MICONS` (no dangling references).
- **Per slice:** `tsc` clean + existing suites pass.
- **Before finishing:** `verify` skill to drive affected surfaces (category create with
  picker, a screen with migrated glyphs) and confirm render.

## Out of scope

- Backend data migration of stored emoji values.
- Redesign of the `MI` chrome set.
- Any change to the Munshi ji logo/avatar.
