# Top search button on every screen — design

## Goal

Add a search button to the top bar of every screen that has one, so the
user can reach the full-screen `Search` command palette from anywhere.
Home and Txns already have this button; this work brings the rest of the
app in line.

## Scope

**Screens that get a search button (all screens with a topbar):**

Top-level tab screens (use `<Topbar>`):
- Budgets — currently right slot = `+` (only when `isCurrentMonth`)
- Goals — right slot = `+`
- Invest — right slot = `+`
- Reports — right slot = filter
- Chat — right slot currently empty

Pushed screens (use `MPageShell`, which forwards a `right` slot):
- Accounts — right slot = `+`
- Notifications — right slot = existing action
- Sync — right slot = existing action
- Settings — right slot currently empty
- AccountDetail — right slot currently empty
- CategoryDetail — right slot currently empty
- TxCategories — right slot currently empty
- TxDetail — right slot currently empty

**No change:**
- Home, Txns — already have the search button.

**Explicitly skipped:**
- Search — it *is* the search screen.

For any screen above whose current right-slot state differs from these
notes when the work is done, the implementer confirms the actual slot
contents and applies the same rule: search is the leftmost icon in the
right group.

## Navigation

`nav('search')` is the correct call. `search` is not in `PRIMARY_TABS`
(navContext.tsx), so `nav` **pushes** it onto the stack rather than
resetting to root; the Search screen's back button then `pop`s back to
the originating screen. This matches what Home and Txns already do. No
changes to `navContext`, the screen registry, or routing are needed —
the `search` kind and the `Search` screen already exist.

## Components

### `SearchButton` (new, in `mobile/src/components/ui.tsx`)

Factors out the repeated snippet so it is not duplicated ~12 times.

```tsx
export function SearchButton() {
  const { t } = useTheme();
  const { nav } = useNav();
  return (
    <IconButton onPress={() => nav('search')}>
      <MI.search size={20} color={t.text1} />
    </IconButton>
  );
}
```

- Depends on: `useTheme`, `useNav`, `IconButton`, `MI.search` — all
  already imported/available in `ui.tsx` or trivially importable.
- Does one thing: renders the standard 20px search icon button that
  navigates to the Search screen.
- If importing `useNav` into `ui.tsx` creates a circular import, fall
  back to keeping `SearchButton` inline per-screen using the existing
  `IconButton`/`MI.search` (the implementer verifies the import graph
  first; the reusable component is preferred).

### `TopbarActions` (new, in `mobile/src/components/ui.tsx`)

A thin horizontal row wrapper for screens that render **search + an
existing action**. Replaces the per-screen `styles.topbarActions` that
Txns currently defines locally, so the row layout lives in one place.

```tsx
export function TopbarActions({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{children}</View>;
}
```

The exact `gap` is transcribed from Txns' existing `topbarActions` style
(the implementer reads the real value and reuses it, rather than the
placeholder `4` above).

## Per-screen change pattern

**Screen with an existing right action** — wrap both in `TopbarActions`,
search first:

```tsx
right={
  <TopbarActions>
    <SearchButton />
    {/* existing action, e.g. */}
    <IconButton onPress={openNewGoalSheet}>
      <MI.plus size={20} color={t.text1} />
    </IconButton>
  </TopbarActions>
}
```

For Budgets, whose existing `+` is conditional on `isCurrentMonth`, the
search button always renders; the `+` remains conditional inside the row.

**Screen with an empty right slot** — set `right={<SearchButton />}`.

## Testing / verification

No automated test infrastructure change is assumed. Verification is by
building the app and confirming, on each in-scope screen:

1. A search icon appears in the top-right (leftmost when there is another
   action beside it).
2. Tapping it opens the Search screen.
3. The Search screen's back button returns to the originating screen.

The implementer runs the app (or typechecks + a representative screen)
per the repo's `verify`/`run` conventions before claiming completion.

## Out of scope

- Any change to the Search screen's own behavior or contents.
- A search entry point on the Search screen itself.
- Changing the search icon glyph, size, or the `Topbar`/`MPageShell`
  APIs (both already expose the `right` slot this design uses).
