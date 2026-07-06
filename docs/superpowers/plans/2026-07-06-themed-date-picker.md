# Themed Date Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native `@react-native-community/datetimepicker` in the FormSheet date field with a custom, fully themed calendar popover.

**Architecture:** A standalone `CalendarPicker` component renders a floating card over a scrim inside a transparent RN `Modal` (so it layers above the FormSheet's in-tree sheet overlay). It speaks only in `Date`; `DateField` in `FormSheet` adapts to/from the stored `YYYY-MM-DD` string. A calendar month grid plus Today/Yesterday quick chips, `‹ ›` month arrows, a tap-the-title month/year jump view, and future-date blocking.

**Tech Stack:** React Native (Expo v56), TypeScript, react-native design tokens (`src/theme/tokens.ts`), `PlusJakartaSans`.

## Global Constraints

- Expo SDK v56 — read `https://docs.expo.dev/versions/v56.0.0/` before writing native-adjacent code (per `mobile/AGENTS.md`).
- No new npm dependencies. `@react-native-community/datetimepicker` stays installed; only its use in `FormSheet` is removed.
- All colors/spacing/fonts from `src/theme/tokens.ts` via `useTheme()`. Never hard-code palette colors (shadow black is allowed).
- Honor the app `mode` (dark/light from `ThemeProvider`), never the OS color scheme.
- Stored value format is unchanged: `YYYY-MM-DD`, parsed/formatted with the existing `parseYMD` / `toYMD` (local-time, no UTC day-shift).
- Block future dates: nothing strictly after "today" is selectable; forward navigation is capped at the current month/year.
- Week starts Sunday; English month abbreviations (matches existing `MONTHS` in `FormSheet`). No locale library.
- Commits: no `Co-Authored-By` trailer; author email `gairola.ashutosh26@gmail.com`.
- Verification: repo has no jest/vitest runner and no typecheck script — per-task check is `npx tsc --noEmit` run from `mobile/`; final task drives the app.

---

## File Structure

- **Create** `mobile/src/components/CalendarPicker.tsx` — the entire picker: pure date helpers (`buildMonthMatrix`, `isSameDay`, `addDays`, `isAfterDay`), the `CalendarPicker` popover component, and an internal `JumpView`. One responsibility: pick a `Date`.
- **Modify** `mobile/src/components/FormSheet.tsx` — `DateField` only: drop the native picker, measure the row for an anchor, render `CalendarPicker`. No changes to field specs, validation, submit, or the YMD helpers.

---

### Task 1: `CalendarPicker` component

**Files:**
- Create: `mobile/src/components/CalendarPicker.tsx`

**Interfaces:**
- Consumes: `useTheme()` from `../theme/ThemeProvider` (`{ t, mode }`), `radius`/`weight` from `../theme/tokens`, `Chip` from `./ui`.
- Produces (used by Task 2):
  - `type Anchor = { x: number; y: number; w: number; h: number }`
  - `function CalendarPicker(props: { visible: boolean; value: Date; maxDate?: Date; anchor?: Anchor | null; onSelect: (d: Date) => void; onClose: () => void }): JSX.Element`
  - Pure exports (available for future tests): `buildMonthMatrix(year: number, month: number): (Date | null)[][]`, `isSameDay(a: Date, b: Date): boolean`, `addDays(d: Date, n: number): Date`, `isAfterDay(a: Date, b: Date): boolean`.

- [ ] **Step 1: Create the file with the full component**

Create `mobile/src/components/CalendarPicker.tsx`:

```tsx
/**
 * CalendarPicker — a themed, cross-platform date picker rendered as a floating
 * popover over a scrim. Replaces the native @react-native-community/datetimepicker
 * so the picker matches the app palette (tokens.ts) and honors the app `mode`
 * instead of the OS colour scheme.
 *
 * Speaks only in `Date`; callers adapt to/from their own storage format.
 * Layering: a transparent RN Modal (same pattern as AuthFlow.tsx) floats above
 * the FormSheet's in-tree sheet overlay (the sheet is NOT a native Modal).
 */
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { Chip } from './ui';
import { useTheme } from '../theme/ThemeProvider';
import { radius, weight } from '../theme/tokens';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export type Anchor = { x: number; y: number; w: number; h: number };

// ── Pure date helpers ────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
/** true when `a` falls on a strictly later calendar day than `b`. */
export function isAfterDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() > startOfDay(b).getTime();
}
/** 6×7 grid, Sunday-first; null marks a cell outside `month` (0-11). */
export function buildMonthMatrix(year: number, month: number): (Date | null)[][] {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length < 42) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let r = 0; r < 6; r++) rows.push(cells.slice(r * 7, r * 7 + 7));
  return rows;
}

// ── Layout constants ─────────────────────────────────────────────────
const CARD_MAX_W = 340;
const CARD_H_EST = 430;
const MARGIN = 12;

export function CalendarPicker({
  visible,
  value,
  maxDate,
  anchor,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: Date;
  maxDate?: Date;
  anchor?: Anchor | null;
  onSelect: (d: Date) => void;
  onClose: () => void;
}) {
  const { t, mode } = useTheme();
  const win = useWindowDimensions();
  const [view, setView] = useState<{ year: number; month: number }>({
    year: value.getFullYear(),
    month: value.getMonth(),
  });
  const [jump, setJump] = useState(false);

  const cardW = Math.min(CARD_MAX_W, win.width - MARGIN * 2);
  const pos = useMemo(() => {
    if (!anchor) {
      return {
        top: Math.max(MARGIN, (win.height - CARD_H_EST) / 2),
        left: (win.width - cardW) / 2,
      };
    }
    let left = anchor.x + anchor.w - cardW;
    left = Math.min(Math.max(MARGIN, left), win.width - cardW - MARGIN);
    let top = anchor.y + anchor.h + 8;
    if (top + CARD_H_EST > win.height - MARGIN) {
      top = Math.max(MARGIN, anchor.y - CARD_H_EST - 8);
    }
    return { top, left };
  }, [anchor, cardW, win.width, win.height]);

  const today = useMemo(() => startOfDay(new Date()), []);
  const matrix = useMemo(() => buildMonthMatrix(view.year, view.month), [view]);

  const canGoNext =
    !maxDate ||
    view.year < maxDate.getFullYear() ||
    (view.year === maxDate.getFullYear() && view.month < maxDate.getMonth());

  const step = (delta: number) => {
    setView((v) => {
      const m = v.month + delta;
      const year = v.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });
  };

  const pick = (d: Date) => {
    if (maxDate && isAfterDay(d, maxDate)) return;
    onSelect(d);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={[styles.scrim, { backgroundColor: t.sheetBackdropBg }]} onPress={onClose}>
        {/* Inner press swallows taps so touching the card doesn't dismiss. */}
        <Pressable
          onPress={() => {}}
          style={[
            styles.card,
            {
              width: cardW,
              top: pos.top,
              left: pos.left,
              backgroundColor: t.sheetBg,
              borderColor: t.borderStr,
            },
          ]}
        >
          {jump ? (
            <JumpView
              year={view.year}
              maxDate={maxDate}
              onPickMonth={(month) => {
                setView((v) => ({ ...v, month }));
                setJump(false);
              }}
              onStepYear={(d) => setView((v) => ({ ...v, year: v.year + d }))}
            />
          ) : (
            <>
              <View style={styles.chipsRow}>
                <Chip onPress={() => pick(today)}>Today</Chip>
                <Chip onPress={() => pick(addDays(today, -1))}>Yesterday</Chip>
              </View>

              <View style={styles.header}>
                <Pressable hitSlop={10} onPress={() => step(-1)}>
                  <Text style={[styles.arrow, { color: t.em }]}>‹</Text>
                </Pressable>
                <Pressable hitSlop={8} onPress={() => setJump(true)}>
                  <Text style={[styles.title, { color: t.text1, fontFamily: weight(700) }]}>
                    {MONTHS_FULL[view.month]} {view.year}
                  </Text>
                </Pressable>
                <Pressable hitSlop={10} onPress={() => canGoNext && step(1)} disabled={!canGoNext}>
                  <Text style={[styles.arrow, { color: canGoNext ? t.em : t.text3 }]}>›</Text>
                </Pressable>
              </View>

              <View style={styles.weekRow}>
                {WEEKDAYS.map((w, i) => (
                  <Text
                    key={i}
                    style={[styles.weekday, { color: t.text3, fontFamily: weight(600) }]}
                  >
                    {w}
                  </Text>
                ))}
              </View>

              {matrix.map((row, ri) => (
                <View key={ri} style={styles.weekRow}>
                  {row.map((cell, ci) => {
                    if (!cell) return <View key={ci} style={styles.cell} />;
                    const selected = isSameDay(cell, value);
                    const isToday = isSameDay(cell, today);
                    const disabled = !!maxDate && isAfterDay(cell, maxDate);
                    return (
                      <Pressable
                        key={ci}
                        style={styles.cell}
                        disabled={disabled}
                        onPress={() => pick(cell)}
                        accessibilityRole="button"
                        accessibilityLabel={`${cell.getDate()} ${MONTHS[cell.getMonth()]} ${cell.getFullYear()}`}
                        accessibilityState={{ selected, disabled }}
                      >
                        <View
                          style={[
                            styles.cellInner,
                            selected && { backgroundColor: t.emDim },
                            isToday && !selected ? { borderColor: t.em, borderWidth: 1 } : null,
                          ]}
                        >
                          <Text
                            style={{
                              color: disabled ? t.text3 : selected ? t.em : t.text1,
                              fontFamily: weight(selected ? 700 : 600),
                              fontSize: 14,
                            }}
                          >
                            {cell.getDate()}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function JumpView({
  year,
  maxDate,
  onPickMonth,
  onStepYear,
}: {
  year: number;
  maxDate?: Date;
  onPickMonth: (month: number) => void;
  onStepYear: (delta: number) => void;
}) {
  const { t } = useTheme();
  const canGoNextYear = !maxDate || year < maxDate.getFullYear();
  const monthDisabled = (m: number) =>
    !!maxDate &&
    (year > maxDate.getFullYear() || (year === maxDate.getFullYear() && m > maxDate.getMonth()));

  return (
    <View>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => onStepYear(-1)}>
          <Text style={[styles.arrow, { color: t.em }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.text1, fontFamily: weight(700) }]}>{year}</Text>
        <Pressable
          hitSlop={10}
          onPress={() => canGoNextYear && onStepYear(1)}
          disabled={!canGoNextYear}
        >
          <Text style={[styles.arrow, { color: canGoNextYear ? t.em : t.text3 }]}>›</Text>
        </Pressable>
      </View>
      <View style={styles.monthGrid}>
        {MONTHS.map((m, i) => {
          const disabled = monthDisabled(i);
          return (
            <Pressable
              key={i}
              disabled={disabled}
              onPress={() => onPickMonth(i)}
              style={styles.monthCell}
            >
              <View style={styles.monthInner}>
                <Text
                  style={{
                    color: disabled ? t.text3 : t.text1,
                    fontFamily: weight(600),
                    fontSize: 14,
                  }}
                >
                  {m}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1 },
  card: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  arrow: { fontSize: 26, lineHeight: 28, paddingHorizontal: 8 },
  title: { fontSize: 15 },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, paddingVertical: 6 },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: '25%', paddingVertical: 8, alignItems: 'center' },
  monthInner: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.sm },
});
```

- [ ] **Step 2: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors referencing `CalendarPicker.tsx`. (Pre-existing errors elsewhere, if any, are out of scope — confirm none are in this new file.)

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/CalendarPicker.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): themed CalendarPicker component"
```

---

### Task 2: Integrate into `DateField` and remove the native picker

**Files:**
- Modify: `mobile/src/components/FormSheet.tsx` (the `DateField` function ~lines 78-143, its imports ~lines 21-27, and the `iosPickerWrap` style ~line 431)

**Interfaces:**
- Consumes: `CalendarPicker`, `type Anchor` from `./CalendarPicker` (Task 1). Existing `parseYMD`, `toYMD`, `displayDate` in the same file. `useRef` from `react`.
- Produces: none (leaf integration).

- [ ] **Step 1: Update imports**

In `mobile/src/components/FormSheet.tsx`, remove the native picker import block:

```tsx
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
```

Add `useRef` to the React import and add the `CalendarPicker` import. The React import becomes:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
```

Add alongside the other local component imports (e.g. next to `import { BottomSheet } from './BottomSheet';`):

```tsx
import { CalendarPicker, type Anchor } from './CalendarPicker';
```

Note: `Platform` and `Keyboard` are still imported from `react-native`; leave that import line as-is (both are used — `Keyboard` below, `Platform` elsewhere in the file). If `tsc` later flags `Platform` as unused, remove only `Platform` from the `react-native` import.

- [ ] **Step 2: Replace the `DateField` function body**

Replace the entire `DateField` function (the one starting `function DateField({` and ending at its closing `}` before the `BankField` doc comment) with:

```tsx
/**
 * Date field: a tappable row showing the picked date that opens a themed
 * calendar popover (CalendarPicker) anchored to the row. Future dates are
 * blocked. The value stays a 'YYYY-MM-DD' string so the rest of the form
 * (validation, submit) is unchanged.
 */
function DateField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (ymd: string) => void;
}) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const rowRef = useRef<View>(null);
  const current = parseYMD(value) ?? new Date();
  const label = displayDate(value);

  const openPicker = () => {
    Keyboard.dismiss();
    if (rowRef.current) {
      rowRef.current.measureInWindow((x, y, w, h) => {
        setAnchor({ x, y, w, h });
        setOpen(true);
      });
    } else {
      setAnchor(null);
      setOpen(true);
    }
  };

  return (
    <View>
      <Pressable
        ref={rowRef}
        onPress={openPicker}
        style={[
          styles.input,
          styles.dateRow,
          { backgroundColor: t.bg2, borderColor: open ? t.em : t.border },
        ]}
      >
        <Text
          style={[styles.dateText, { color: label ? t.text1 : t.text3, fontFamily: weight(600) }]}
        >
          {label ?? placeholder ?? 'Select date'}
        </Text>
        <Text style={styles.dateIcon}>📅</Text>
      </Pressable>

      <CalendarPicker
        visible={open}
        value={current}
        maxDate={new Date()}
        anchor={anchor}
        onSelect={(d) => {
          onChange(toYMD(d));
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
```

- [ ] **Step 3: Remove the now-unused `iosPickerWrap` style**

In the `StyleSheet.create({ ... })` at the bottom of `FormSheet.tsx`, delete the `iosPickerWrap` entry (the block starting `iosPickerWrap: {`). Leave `dateRow`, `dateText`, `dateIcon`, and all other styles untouched.

- [ ] **Step 4: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors. If `Platform` is now reported unused, remove `Platform` from the `react-native` import line and re-run.

- [ ] **Step 5: Drive the app and verify end-to-end**

Start the app (`npx expo start`, open iOS simulator and/or Android). Open any create/edit form with a date field (e.g. the Add Transaction sheet). Verify:
1. Tapping the date row opens the themed popover anchored near the row (over a scrim); tapping the scrim dismisses it.
2. Colors match the app theme in **both** dark and light `mode` (toggle in Settings) — surface, text, selected day (`em` on `emDim`), today ring.
3. `Today` and `Yesterday` chips commit the correct date and close.
4. `‹ ›` arrows change months; the `›` arrow is disabled on the current month; tapping the title opens the month/year jump view; picking a month returns to the grid.
5. Future days are dimmed and non-tappable; the year `›` in jump view is disabled at the current year.
6. Selecting a day commits and the row label updates (e.g. "6 Jul 2026"); reopening shows that day selected.
7. Cross a month boundary (pick the 1st and last of a month) and confirm the saved value has no off-by-one day shift.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/FormSheet.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): use themed CalendarPicker for date fields"
```

---

## Self-Review

**Spec coverage:**
- Custom themed picker replacing native → Tasks 1 & 2. ✓
- Calendar month grid + quick chips (Today/Yesterday) → Task 1 days view + `chipsRow`. ✓
- Popover over scrim, anchored near field with center fallback + clamping → Task 1 `Modal` + `pos`. ✓
- `‹ ›` arrows + tap-title jump (month grid + year stepper) → Task 1 header + `JumpView`. ✓
- Block future dates (dimmed days, capped nav) → `pick` guard, `canGoNext`, `monthDisabled`, `canGoNextYear`. ✓
- `Date`-typed component; `DateField` adapts via `parseYMD`/`toYMD` → Task 2. ✓
- Remove native picker imports/state/style; dependency stays installed → Task 2 Steps 1 & 3. ✓
- Theming from tokens, honor app `mode` → `useTheme()` throughout; `sheetBg`/`borderStr`/`emDim`/`em`/`text*`. ✓
- No YMD/validation/submit changes → Task 2 keeps helpers, only `DateField` internals change. ✓
- Sunday-first, English abbreviations, no locale lib → `WEEKDAYS`, `MONTHS`. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete. ✓

**Type consistency:** `Anchor`, `CalendarPicker`, `buildMonthMatrix`, `isAfterDay`, `isSameDay`, `addDays` names/signatures match between Task 1 (produced) and Task 2 (consumed). `useRef<View>` matches `measureInWindow` usage. ✓
