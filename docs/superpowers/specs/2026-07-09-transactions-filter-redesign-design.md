# Transactions filter redesign — combined Period + Source sheet

**Date:** 2026-07-09
**Screen:** `mobile/src/screens/Txns.tsx`
**Status:** Design approved (visual companion, Option B → topbar-funnel variant)

## Problem

The Transactions screen stacks two visually identical full-width `MSeg`
segmented controls in the body ([Txns.tsx:182-205](../../../mobile/src/screens/Txns.tsx#L182-L205)):

1. **Type** — All / Income / Expense (filters client-side)
2. **Source** — All / Bank & UPI / Cards (drives the API `source` param)

Two identical controls with no hierarchy read as flat repetition and give
no signal of which dimension is primary.

## Decision

Keep **only the type segmented control** in the body. Move the **source**
filter into the existing topbar funnel sheet, which becomes a single
**combined filter sheet** with two sections: **Period** and **Source**.

- Body surface is maximally clean — one segmented control.
- Period (already in the funnel sheet) and Source live together, grouped
  under section headers.
- The funnel `IconButton` shows a state dot when any non-default filter is
  active, so hidden filter state is still signalled on the main screen.

Behavior is otherwise unchanged: type still filters client-side, source
still drives `api.transactions.list({ source })`, period still drives its
`period` param. Selecting an option closes the sheet and applies it (same
single-select-and-close model as today); changing both period and source
means opening the sheet twice, which is acceptable for an infrequent action.

## Changes

### 1. `SheetConfig` gains optional sections (additive, backward-compatible)

File: `mobile/src/feedback/FeedbackProvider.tsx`

~23 callers across the app pass the flat `options` array. The change must
not touch them. Add, alongside the existing fields:

```ts
export interface SheetOption {
  label: string;
  icon?: string;
  danger?: boolean;
  selected?: boolean; // NEW — renders active styling + trailing check
  onPress?: () => void;
}

export interface SheetSection {
  header?: string;
  options: SheetOption[];
}

export interface SheetConfig {
  title?: string;
  options?: SheetOption[];   // now optional; existing flat callers unchanged
  sections?: SheetSection[]; // NEW — when present, rendered instead of options
}
```

Render logic in `FeedbackProvider`'s `BottomSheet` body:

- If `sheetConfig.sections` is present, render each section as an uppercase
  `text3` header row (matching the summary-card label style: ~10px,
  letter-spacing, `weight(600)`) followed by its `SheetOptionRow`s.
- Otherwise render the flat `options` list exactly as today.

`SheetOptionRow` renders the active marker when `option.selected`:
- Background `t.glassBg2` (instead of `t.glassBg`) and border `t.glassBrd2`.
- A trailing `✓` in `t.em`, pushed to the row's right edge.

This replaces the current `' · current'` label-suffix hack (used by the
period sheet) with a real visual mark — the marker the approved mockup showed.

### 2. Txns screen: drop the source seg, build the combined sheet

File: `mobile/src/screens/Txns.tsx`

- **Remove** the source `MSeg` block and its `SpringIn`/`segWrap`
  ([Txns.tsx:194-205](../../../mobile/src/screens/Txns.tsx#L194-L205)). The
  type seg ([Txns.tsx:182-192](../../../mobile/src/screens/Txns.tsx#L182-L192))
  stays.
- Keep the `source` state and the `useApiData` dependency on it — only the
  control that sets it moves.
- Add a `SOURCES` constant mirroring `PERIODS`:

  ```ts
  const SOURCES: { value: SourceValue; label: string; icon: string }[] = [
    { value: 'all',  label: 'All sources', icon: '🌐' },
    { value: 'bank', label: 'Bank & UPI',  icon: '🏦' },
    { value: 'card', label: 'Cards',       icon: '💳' },
  ];
  ```

- Rewrite `openFilterSheet` to pass `sections` instead of flat `options`,
  dropping the `' · current'` suffix in favour of the new `selected` flag:

  ```ts
  const openFilterSheet = () => {
    sheet({
      title: 'Filter',
      sections: [
        {
          header: 'Period',
          options: PERIODS.map((p) => ({
            label: p.label, icon: p.icon,
            selected: p.value === period,
            onPress: () => setPeriod(p.value),
          })),
        },
        {
          header: 'Source',
          options: SOURCES.map((s) => ({
            label: s.label, icon: s.icon,
            selected: s.value === source,
            onPress: () => setSource(s.value),
          })),
        },
      ],
    });
  };
  ```

- Signal active filters on the funnel button by reusing `IconButton`'s
  existing `dot` prop
  ([ui.tsx:109-110](../../../mobile/src/components/ui.tsx#L109-L110)):

  ```tsx
  <IconButton onPress={openFilterSheet} dot={period !== 'all' || source !== 'all'}>
    <MI.filter size={20} color={t.text1} />
  </IconButton>
  ```

## Out of scope

- No change to how type/source/period filtering executes.
- No change to the other ~23 `sheet()` callers (flat `options` path preserved).
- No new sheet component; the existing `BottomSheet` is extended in place.

## Testing / verification

- Type seg still filters All / Income / Expense and updates the summary cards.
- Funnel sheet shows two labelled sections; the active period and source rows
  show the check + highlight.
- Picking a period or source closes the sheet, applies the filter, and
  (for source) refetches via `useApiData`.
- Funnel dot appears when period ≠ all or source ≠ all, and clears when both
  are back to their defaults.
- Spot-check one existing flat-`options` sheet caller (e.g. a swipe/action
  sheet) still renders unchanged.
