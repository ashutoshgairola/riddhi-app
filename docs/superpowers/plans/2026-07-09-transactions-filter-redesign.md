# Transactions Filter Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two stacked segmented controls on the Transactions screen with a single type segmented control in the body plus a combined Period + Source filter sheet opened from the topbar funnel.

**Architecture:** Extend the shared bottom-sheet (`FeedbackProvider`) with an optional `sections` config and a `selected` marker on options — a purely additive change that leaves all existing flat-`options` callers untouched. Then update the Transactions screen to drop its source segmented control and build the combined sheet.

**Tech Stack:** React Native, Expo SDK 56, TypeScript, react-native-reanimated. No component test harness exists (jest is used for pure-logic `.spec.ts` only), so verification is TypeScript typecheck + running the screen in Expo.

## Global Constraints

- Expo SDK **56** — consult https://docs.expo.dev/versions/v56.0.0/ before writing any Expo/RN API code (`mobile/AGENTS.md`).
- The `SheetConfig` change MUST be additive: ~23 existing `sheet({ options })` callers must keep working unchanged. `options` stays supported; `sections` is new and optional.
- Theme colors come from `useTheme()` (`t.text1`, `t.text3`, `t.em`, `t.glassBg`, `t.glassBg2`, `t.glassBrd`, `t.glassBrd2`); font weights via `weight(n)` from `theme/tokens`. Never hardcode colors.
- Git commits: no `Co-Authored-By` trailer; author email `gairola.ashutosh26@gmail.com`.

---

### Task 1: Extend the bottom-sheet with sections + selected marker

**Files:**
- Modify: `mobile/src/feedback/FeedbackProvider.tsx`

**Interfaces:**
- Consumes: existing `SheetOption`, `SheetConfig`, `SheetOptionRow`, `selectOption`, `BottomSheet`, `useTheme`, `weight`.
- Produces (for Task 2):
  - `SheetOption` gains optional `selected?: boolean`.
  - `SheetConfig` gains optional `sections?: SheetSection[]` where
    `SheetSection = { header?: string; options: SheetOption[] }`.
  - When `sections` is present the sheet renders each section's `header`
    followed by its option rows; when absent it renders the flat `options`
    list exactly as before. A `selected: true` option renders a highlighted
    row with a trailing `✓`.

- [ ] **Step 1: Add `selected` to `SheetOption` and the `SheetSection` type**

In the type block near the top of the file, change `SheetOption` and add `SheetSection`, and extend `SheetConfig`:

```ts
export interface SheetOption {
  label: string;
  /** Emoji/glyph shown before the label, matching the web's `o.icon` (a
   * plain string, e.g. an emoji) — not one of the `MI` SVG icon names. */
  icon?: string;
  danger?: boolean;
  /** Renders the row highlighted with a trailing check — used to mark the
   * currently-applied choice in a filter sheet. */
  selected?: boolean;
  onPress?: () => void;
}

export interface SheetSection {
  header?: string;
  options: SheetOption[];
}

export interface SheetConfig {
  title?: string;
  options?: SheetOption[];
  /** When present, rendered as labelled sections instead of `options`. */
  sections?: SheetSection[];
}
```

- [ ] **Step 2: Render the `selected` marker in `SheetOptionRow`**

Replace the `SheetOptionRow` return's `Pressable` contents so a selected row is highlighted and shows a trailing check. Change the `style` array's colors to switch on `option.selected`, and add the check `Text`:

```tsx
        style={[
          styles.optionRow,
          {
            backgroundColor: option.selected ? t.glassBg2 : t.glassBg,
            borderColor: option.selected ? t.glassBrd2 : t.glassBrd,
          },
        ]}
      >
        {option.icon ? <Text style={styles.optionIcon}>{option.icon}</Text> : null}
        <Text
          style={[
            styles.optionLabel,
            { color: option.danger ? t.red : t.text1, fontFamily: weight(600) },
          ]}
        >
          {option.label}
        </Text>
        {option.selected ? (
          <Text style={[styles.optionCheck, { color: t.em, fontFamily: weight(700) }]}>✓</Text>
        ) : null}
      </Pressable>
```

- [ ] **Step 3: Add a `SheetBody` component that renders sections or the flat list**

Add this component next to `SheetOptionRow` (it needs `useTheme`, which the `FeedbackProvider` function itself does not call):

```tsx
function SheetBody({
  config,
  onSelect,
}: {
  config: SheetConfig | null;
  onSelect: (option: SheetOption) => void;
}) {
  const { t } = useTheme();
  if (config?.sections) {
    return (
      <>
        {config.sections.map((section, si) => (
          <View key={si} style={si > 0 ? styles.sheetSection : undefined}>
            {section.header ? (
              <Text style={[styles.sheetSectionHeader, { color: t.text3, fontFamily: weight(600) }]}>
                {section.header}
              </Text>
            ) : null}
            <View style={styles.sheetOptions}>
              {section.options.map((option, i) => (
                <SheetOptionRow key={i} option={option} onSelect={() => onSelect(option)} />
              ))}
            </View>
          </View>
        ))}
      </>
    );
  }
  return (
    <View style={styles.sheetOptions}>
      {(config?.options ?? []).map((option, i) => (
        <SheetOptionRow key={i} option={option} onSelect={() => onSelect(option)} />
      ))}
    </View>
  );
}
```

- [ ] **Step 4: Use `SheetBody` in the provider's `BottomSheet`**

Replace the current sheet body (the `<View style={styles.sheetOptions}>…</View>` inside `<BottomSheet>` at ~line 151-157) with:

```tsx
      <BottomSheet open={sheetOpen} onClose={closeSheet} title={sheetConfig?.title ?? 'Options'}>
        <SheetBody config={sheetConfig} onSelect={selectOption} />
      </BottomSheet>
```

- [ ] **Step 5: Add the new styles**

In the `StyleSheet.create({ … })` block, add these three entries (keep the existing `optionRow`, `optionIcon`, `optionLabel`, `sheetOptions`):

```ts
  sheetSection: {
    marginTop: 6,
  },
  sheetSectionHeader: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  optionCheck: {
    marginLeft: 'auto',
    fontSize: 15,
  },
```

- [ ] **Step 6: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors (in particular, no errors from the ~23 existing `sheet({ options })` callers, since `options` is still supported).

- [ ] **Step 7: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add mobile/src/feedback/FeedbackProvider.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): add sections + selected marker to bottom sheet"
```

---

### Task 2: Move the source filter into the combined funnel sheet

**Files:**
- Modify: `mobile/src/screens/Txns.tsx`

**Interfaces:**
- Consumes from Task 1: `sheet({ title, sections: [{ header, options: [{ label, icon, selected, onPress }] }] })`.
- Produces: no exported surface — screen-internal change only.

- [ ] **Step 1: Add the `SOURCES` constant**

Directly below the existing `PERIODS` constant (~line 84-89), add:

```ts
const SOURCES: { value: SourceValue; label: string; icon: string }[] = [
  { value: 'all', label: 'All sources', icon: '🌐' },
  { value: 'bank', label: 'Bank & UPI', icon: '🏦' },
  { value: 'card', label: 'Cards', icon: '💳' },
];
```

- [ ] **Step 2: Rewrite `openFilterSheet` to a combined sectioned sheet**

Replace the whole `openFilterSheet` function (~lines 115-124) with:

```ts
  const openFilterSheet = () => {
    sheet({
      title: 'Filter',
      sections: [
        {
          header: 'Period',
          options: PERIODS.map((p) => ({
            label: p.label,
            icon: p.icon,
            selected: p.value === period,
            onPress: () => setPeriod(p.value),
          })),
        },
        {
          header: 'Source',
          options: SOURCES.map((s) => ({
            label: s.label,
            icon: s.icon,
            selected: s.value === source,
            onPress: () => setSource(s.value),
          })),
        },
      ],
    });
  };
```

- [ ] **Step 3: Add the active-filter dot to the funnel button**

Change the funnel `IconButton` (~line 151-153) to show `IconButton`'s existing `dot` when any non-default filter is applied:

```tsx
            <IconButton onPress={openFilterSheet} dot={period !== 'all' || source !== 'all'}>
              <MI.filter size={20} color={t.text1} />
            </IconButton>
```

- [ ] **Step 4: Remove the source segmented control from the body**

Delete this entire block (~lines 194-205), leaving the type seg above it untouched:

```tsx
        {/* Source seg — Bank & UPI / Cards filter, mirrors filter seg above */}
        <SpringIn delay={60} style={styles.segWrap}>
          <MSeg<SourceValue>
            options={[
              { value: 'all', label: 'All' },
              { value: 'bank', label: 'Bank & UPI' },
              { value: 'card', label: 'Cards' },
            ]}
            value={source}
            onChange={setSource}
          />
        </SpringIn>
```

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors. (`SourceValue`, `source`/`setSource`, `MSeg`, and `SpringIn` are all still referenced — `SourceValue` by state + `SOURCES`, `MSeg`/`SpringIn` by the remaining type seg.)

- [ ] **Step 6: Run the screen and verify visually**

Run: `cd mobile && npm run ios` (or `npm run android`), open the Transactions (Activity) tab, and confirm:
- The body shows a single segmented control (All / Income / Expense); the second Bank/Cards control is gone.
- Tapping the topbar funnel opens a sheet titled "Filter" with two labelled sections, **Period** and **Source**.
- The currently-applied period row and source row each show the highlight + trailing `✓`.
- Picking a source closes the sheet and the list refetches (via `useApiData`'s `source` dependency); picking a period re-filters.
- The funnel shows a dot when period ≠ `all` or source ≠ `all`, and the dot clears when both are back to their defaults.

- [ ] **Step 7: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add mobile/src/screens/Txns.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): combined period+source filter sheet on Transactions"
```

---

## Self-Review

**Spec coverage:**
- SheetConfig additive `sections` + `selected` → Task 1 (Steps 1-5). ✓
- Backward-compat for flat `options` callers → Task 1 Step 4 (`SheetBody` falls back to `options`) + Step 6 typecheck. ✓
- Remove source seg, keep type seg → Task 2 Step 4. ✓
- Combined Period + Source sheet from funnel → Task 2 Steps 1-2. ✓
- Funnel active-state dot → Task 2 Step 3. ✓
- Source still drives API, type still client-side, period unchanged → preserved (only the control moves; `source`/`period` state and `useApiData` deps untouched). ✓
- Testing/verification (visual + typecheck) → Task 1 Step 6, Task 2 Steps 5-6. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code. ✓

**Type consistency:** `SheetSection`, `selected`, `SOURCES` (`SourceValue`), `sections`/`options`/`onPress` names match across Task 1 and Task 2. `SheetBody` prop names (`config`, `onSelect`) are self-contained. ✓
