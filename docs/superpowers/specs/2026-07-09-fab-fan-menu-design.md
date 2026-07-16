# FAB Fan Menu — Design

**Date:** 2026-07-09
**Scope:** `mobile/src/app/FabActions.tsx` (rewrite) + stacking tweak on `TabBar.tsx` / `NavBar.tsx`

## Goal

Restyle the FAB speed-dial into the target mockup: single-line rounded "pills"
that **fan out of the FAB** on open and **fan back into it** on close, while the
bottom navbar stays fully visible (unblurred, tappable) instead of being covered
by the dim/blur backdrop.

## Content & Layout

The mockup, read top → bottom, is: Ask Munshi anything, Plan a big event, Log an
expense, Add income, Transfer.

The existing `bottom = base + i·step` formula places **index 0 closest to the
FAB** (lowest) and higher indices higher up. To match the mockup (Transfer at the
bottom, Ask Munshi at the top) with that same formula, order the array
**FAB-outward** — index 0 = the bottom-most pill:

| i | Label | Icon | Color | Action | Position |
|---|-------|------|-------|--------|----------|
| 0 | Transfer | 🔄 | blue | (openAdd) | closest to FAB (bottom) |
| 1 | Add income | 💰 | em | (openAdd) | |
| 2 | Log an expense | 💸 | red | (openAdd) | |
| 3 | Plan a big event | 🎉 | violet | `plan-event` | |
| 4 | Ask Munshi anything | 💬 | violet | `chat` | farthest (top) |

- Drop the `desc` field and its second text line — **single line labels only**.
- Each item is a **content-width, fully-rounded pill** (borderRadius ~999) with a
  **circular** icon badge (was a 12px rounded square).
- iOS: pills centered. Android: right-aligned (unchanged).

## Fan Motion (core change)

Each card animates on a single Reanimated `progress` shared value (0 = closed,
1 = open), with the FAB as the transform origin:

- **translateY:** `(restBottom(i) − fabBottom) → 0`. When closed, every card is
  collapsed at the FAB's vertical point; on open each rises to its slot.
- **scale:** `~0.3 → 1`.
- **opacity:** `0 → 1` (may ramp faster than scale so pills don't linger faint).

`fabBottom` is an approximate constant for the FAB center's bottom offset
(distinct per platform; Android FAB floats above the nav bar, iOS FAB sits in the
tab bar). Origin also differs horizontally: bottom-center (iOS) vs bottom-right
(Android) — reuse the existing `actionIos` / `actionAndroid` alignment.

**Stagger, both directions:**
- Open: card `i` delayed `i·40ms` → unfurls from the FAB outward.
- Close: reverse (`(N−1−i)·40ms`) → folds back in, farthest-first, zipping into
  the button.

(Current code staggers only on open and does a plain fade on close; this replaces
the translateY(20)+scale(0.5) in-place rise.)

## Unblurred Navbar

The full-screen backdrop (`styles.backdrop`, `zIndex 60` / `elevation 4`)
currently paints **over** the tab/nav bar, blurring it. Fix: raise `TabBar` /
`NavBar` above the backdrop via `zIndex` (iOS) and `elevation` (Android) greater
than the backdrop's, so:

- The navbar stays crisp, opaque, and tappable.
- The dim/blur only covers the stage above the navbar.
- The FAB button (X) already stacks on top and stays tappable to close.

The action pills (`zIndex 61` / `elevation 5`) must still sit above the backdrop
but can render behind the navbar chrome — they animate in the region above it, so
no visible conflict.

## Non-goals

- No new dependencies (Reanimated + expo-blur already used).
- No change to what the actions *do* (`chat` / `plan-event` / `openAdd`).
- No change to the FAB button itself or its 45° rotate-on-open.

## Testing

- Manual: open/close on iOS and Android layouts — verify fan-out, fan-in reverse
  stagger, and that the navbar remains sharp and tappable throughout.
- Existing typecheck must pass.
