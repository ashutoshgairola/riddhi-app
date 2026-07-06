# Themed Date Picker — Design Spec

**Date:** 2026-07-06
**Status:** Approved (design)
**Area:** mobile / `FormSheet` date field

## Problem

The date field in `mobile/src/components/FormSheet.tsx` (`DateField`) opens the
**native** `@react-native-community/datetimepicker`:

- iOS: inline `display="spinner"` wheel wrapped in a themed `View`.
- Android: `DateTimePickerAndroid.open(...)` system dialog (no theme props passed).

The native picker renders with OS/system colors — plain white/black wheel text,
system background — rather than the app's custom purple-tinted palette
(`text1: #f3f0fb`, `bg2: #1f1a2c`, `em: #b6a4f3`, `PlusJakartaSans`). `themeVariant`
and `accentColor` only get partway, and the Android dialog stays fully generic. The
picker visibly clashes with the app theme, and the app's own `mode` (dark/light,
persisted independent of the OS scheme) is not reflected.

## Goal

Replace the native picker with a **custom themed calendar picker** built entirely
from the app's design tokens, identical on iOS and Android, honoring the app `mode`.

## Decisions (from brainstorming)

- **Form:** calendar month grid **+ quick chips** (Today, Yesterday).
- **Placement:** **popover overlay** — a floating card over a scrim, anchored near
  the field (not inline expansion, not a nested bottom sheet).
- **Navigation:** `‹ ›` month arrows **plus** tap-the-title to a month/year jump view.
- **Date range:** **block future dates** — days after today are dimmed/non-tappable;
  forward navigation is capped at the current month.
- **Architecture:** Approach A — a standalone `CalendarPicker` component that speaks
  in `Date`; `DateField` adapts to/from the stored `YYYY-MM-DD` string.

## Architecture

### New component: `mobile/src/components/CalendarPicker.tsx`

Self-contained and `Date`-typed. Knows nothing about the form or the `YYYY-MM-DD`
string format.

```ts
CalendarPicker({
  visible: boolean,
  value: Date,                     // currently-selected date (seeds the view month)
  maxDate?: Date,                  // block anything strictly after this (we pass "today")
  anchor?: { x: number; y: number; w: number; h: number } | null,
  onSelect: (d: Date) => void,     // fired on day / quick-chip tap; parent commits + closes
  onClose: () => void,             // scrim tap / Android back
})
```

**Layering.** Renders a transparent React Native `Modal`
(`transparent animationType="fade" onRequestClose={onClose}`) with a tappable scrim,
following the existing pattern in `mobile/src/screens/auth/AuthFlow.tsx:93`
(outer `Pressable` scrim closes; inner `Pressable` swallows taps so touching the card
does not dismiss). Using a native `Modal` guarantees the popover floats above the
`FormSheet`'s in-tree `absoluteFill` sheet overlay (the sheet is NOT a native modal).

**Positioning.** The card is placed from `anchor` — below the field row and
right-aligned to it — then **clamped** to stay within screen bounds (horizontal and
vertical, using `Dimensions`). If `anchor` is null, the card is **centered** as a
graceful fallback.

**Internal state.**
- `viewMonth: { year: number; month: number }` — the month currently shown, seeded
  from `value`.
- `mode: 'days' | 'jump'` — grid vs month/year jump view.

### Days view

- **Quick chips row:** `Today`, `Yesterday`, built with the existing `Chip` from
  `components/ui.tsx`. Each commits immediately (`onSelect`). `Yesterday` = today − 1 day.
- **Header:** `‹  July 2026  ›`. Arrows step one month. The title is a `Pressable`
  that switches to `mode: 'jump'`.
- **Weekday header:** `S M T W T F S` in `text3`. Week starts Sunday (matches
  `MONTHS`-style local formatting already in the file; no locale library).
- **Day grid:** 6 rows built from `buildMonthMatrix`. Cells outside the current month
  are blank. Today gets a subtle ring/dot. The selected day is filled `em` text on an
  `emDim` background. Days strictly after `maxDate` render in `text3` and are
  non-tappable (`disabled`). The `›` arrow is disabled when `viewMonth` is the current
  month (no navigating into future months).
- Tapping a day → `onSelect(thatDate)`.

### Jump view (tap the title)

- Month grid Jan–Dec (selected month highlighted with `em`/`emDim`); months after the
  current month in the current year are disabled when `maxDate` is today.
- `‹ 2026 ›` year stepper; the `›` is disabled at the current year (future blocked).
- Picking a month returns to `mode: 'days'` on that month/year.

### Pure helper

```ts
// Pure, no rendering. 6x7 matrix; null = cell outside the month.
function buildMonthMatrix(year: number, month: number): (Date | null)[][]
```

Kept pure so the grid logic is correct-by-inspection and unit-testable later. The repo
has **no jest/vitest runner configured**, so behavioral verification is by driving the
app (see Testing).

## Changes to `mobile/src/components/FormSheet.tsx`

`DateField` is refactored:

- **Remove** `@react-native-community/datetimepicker` usage entirely — both the iOS
  `DateTimePicker` spinner and `DateTimePickerAndroid`. Remove those imports, the
  `showIOS` state, `onIOSChange`, and the now-unused `iosPickerWrap` style.
- Keep the same tappable row (label + 📅). Add a `ref` to the row and, on press, call
  `measureInWindow` to capture the anchor rect; `Keyboard.dismiss()` as today.
- Render `<CalendarPicker visible={open} value={parseYMD(value) ?? new Date()}
  maxDate={new Date()} anchor={rect} onSelect={d => { onChange(toYMD(d)); close() }}
  onClose={close} />`.
- **No change** to `FormFieldSpec`, validation, submit, or the stored `YYYY-MM-DD`
  format — `DateField` continues to own the string↔`Date` conversion via the existing
  `parseYMD` / `toYMD` helpers.

The `@react-native-community/datetimepicker` **npm dependency stays installed** for
now (only unused import removed); dropping the package is out of scope.

## Theming

All from `mobile/src/theme/tokens.ts` via `useTheme()`; identical structure in light &
dark, honoring the app `mode` (never the OS scheme):

- Card surface: `sheetBg` / `bg1`; border `borderStr`; radius `radius.lg`; elevation
  shadow.
- Scrim: `sheetBackdropBg`.
- Text: `text1` (day numbers, title), `text2` (secondary), `text3` (weekday header,
  disabled/out-of-range days).
- Selected day / month: `em` on `emDim`. Today marker: ring in `border`/`em`.
- Accent for arrows/chips: `em`.
- Font: `PlusJakartaSans` via `weight()`.

## Behavior parity & edge cases

- Any date selectable **except** strictly future (per decision).
- Keyboard dismissed when the popover opens.
- Android hardware back closes the popover (`onRequestClose`).
- Empty field value → picker seeds on today's month, nothing pre-selected as "chosen"
  beyond the default `value`.
- Local-time correctness preserved by reusing `parseYMD`/`toYMD` (no UTC day-shift).

## Testing / Verification

- No jest/vitest runner exists, so no automated unit test is added now; `buildMonthMatrix`
  is written pure so a test can be added if a runner lands.
- Verify by driving the app (`verify` skill): open a create/edit form with a date
  field, confirm the popover matches the theme in both dark and light `mode`, quick
  chips work, month arrows + title-jump navigate, future days/months are blocked, and
  the committed `YYYY-MM-DD` value is correct across a month boundary and across a DST/
  local edge (e.g. 1st of month).

## Out of scope

- Removing the `@react-native-community/datetimepicker` npm dependency.
- Time-of-day selection (date-only, as today).
- Locale/first-day-of-week configuration (Sunday-first, English month abbreviations,
  matching current formatting).
- Reusing `CalendarPicker` elsewhere (built reusable, but no other call sites added now).
