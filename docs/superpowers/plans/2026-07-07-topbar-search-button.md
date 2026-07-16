# Top Search Button on Every Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a search button to the top bar of every screen that has one, navigating to the existing full-screen `Search` command palette.

**Architecture:** Introduce two small reusable components in `ui.tsx` — `SearchButton` (the standard search `IconButton` that calls `nav('search')`) and `TopbarActions` (a horizontal row wrapper for search + an existing action). Then set each in-scope screen's topbar `right` slot to include `<SearchButton />`, always as the leftmost icon.

**Tech Stack:** React Native, Expo (SDK 56), TypeScript. Nav via the app's `useNav()` context.

## Global Constraints

- **No TDD unit cycle:** the mobile app has **no test framework** (no `test`/`jest` script; only `expo start`). Per the spec, verification is `npx tsc --noEmit` plus a manual app run. Every task below ends with a typecheck + commit rather than a red/green test cycle.
- **Search is always the leftmost icon** in a topbar's right group.
- **`nav('search')`** is the navigation call (not `push`). `search` is not a `PRIMARY_TABS` entry, so `nav` pushes it and its back button pops — verified in `mobile/src/app/navContext.tsx:145-153`.
- **Commit prefs:** author `Ashutosh <gairola.ashutosh26@gmail.com>`; **no** `Co-Authored-By` trailer; do not sign commits (`git -c commit.gpgsign=false`). Specs/plans under `docs/` are force-added (`git add -f`).
- **Do not touch** the `Search` screen, `Home`, or `Txns` — Home and Txns already have the button.

---

## File Structure

- **Modify** `mobile/src/components/ui.tsx` — add `SearchButton` + `TopbarActions` (Task 1). No import cycle: `ui.tsx` → `./icons` and `ui.tsx` → `../app/navContext`; neither of those imports `ui.tsx` (verified).
- **Modify** these screens' topbar `right` slot to add `<SearchButton />`:
  - Top-level `<Topbar>` screens: `Budgets`, `Goals`, `Invest`, `Reports` (Task 2).
  - `MPageShell` screens with an existing right action: `Accounts`, `Notifications`, `Sync`, `AccountDetail`, `TxCategories`, `TxDetail` (Task 3).
  - Screens with an empty right slot: `Settings`, `CategoryDetail` (Task 4).
  - Custom-topbar screen: `Chat` (Task 5).

---

### Task 1: Add `SearchButton` and `TopbarActions` to `ui.tsx`

**Files:**
- Modify: `mobile/src/components/ui.tsx`

**Interfaces:**
- Consumes: `IconButton` (already in `ui.tsx`), `MI` from `./icons`, `useNav` from `../app/navContext`, `useTheme` from `../theme/ThemeProvider` (already imported), `View` from `react-native` (already imported).
- Produces:
  - `SearchButton(): JSX.Element` — a search `IconButton` that calls `nav('search')`.
  - `TopbarActions({ children }: { children: React.ReactNode }): JSX.Element` — a `flexDirection: 'row'` wrapper, `alignItems: 'center'`, `gap: 8`, `flexShrink: 0` (values copied from Txns' existing `topbarActions` style).

- [ ] **Step 1: Add the two imports** near the top of `mobile/src/components/ui.tsx`, after the existing `import { useTheme } from '../theme/ThemeProvider';` line (line 33):

```tsx
import { MI } from './icons';
import { useNav } from '../app/navContext';
```

- [ ] **Step 2: Append the two components** at the end of `mobile/src/components/ui.tsx` (after the last existing export, before or after the trailing `StyleSheet` — place them just before the file's closing content, as standalone exports):

```tsx
/** Standard topbar search button — navigates to the full-screen Search
 * palette. `search` is not a primary tab, so `nav` pushes it and its back
 * button pops (navContext.tsx). */
export function SearchButton() {
  const { t } = useTheme();
  const { nav } = useNav();
  return (
    <IconButton onPress={() => nav('search')}>
      <MI.search size={20} color={t.text1} />
    </IconButton>
  );
}

/** Horizontal row for a topbar's right slot when it holds more than one
 * action (e.g. SearchButton + a plus/filter/more IconButton). Search goes
 * first. Values mirror the former per-screen `topbarActions` style. */
export function TopbarActions({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      {children}
    </View>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors referencing `ui.tsx` (a clean exit, or the same pre-existing baseline errors as before the change).

- [ ] **Step 4: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add mobile/src/components/ui.tsx
git -c commit.gpgsign=false commit -m "feat(mobile): add reusable SearchButton and TopbarActions" --author="Ashutosh <gairola.ashutosh26@gmail.com>"
```

---

### Task 2: Add search to the four top-level `<Topbar>` screens

**Files:**
- Modify: `mobile/src/screens/Budgets.tsx` (right slot ~line 207)
- Modify: `mobile/src/screens/Goals.tsx` (right slot ~line 134)
- Modify: `mobile/src/screens/Invest.tsx` (right slot ~line 130)
- Modify: `mobile/src/screens/Reports.tsx` (right slot ~line 219)

**Interfaces:**
- Consumes: `SearchButton`, `TopbarActions` from `../components/ui` (Task 1).

Each screen already imports `IconButton` and `MI` from its usual sources. Add `SearchButton, TopbarActions` to the existing `from '../components/ui'` import in each file.

- [ ] **Step 1: Budgets** — update the import from `../components/ui` to include `SearchButton, TopbarActions`, then replace the `right={...}` block (currently `mobile/src/screens/Budgets.tsx:207`):

Replace:
```tsx
        right={
          isCurrentMonth ? (
            <IconButton onPress={openCreateSheet}>
              <MI.plus size={20} color={t.text1} />
            </IconButton>
          ) : undefined
        }
```
With:
```tsx
        right={
          <TopbarActions>
            <SearchButton />
            {isCurrentMonth ? (
              <IconButton onPress={openCreateSheet}>
                <MI.plus size={20} color={t.text1} />
              </IconButton>
            ) : null}
          </TopbarActions>
        }
```

- [ ] **Step 2: Goals** — add `SearchButton, TopbarActions` to the `../components/ui` import, then replace the `right={...}` block (`mobile/src/screens/Goals.tsx:134`):

Replace:
```tsx
        right={
          <IconButton onPress={openNewGoalSheet}>
            <MI.plus size={20} color={t.text1} />
          </IconButton>
        }
```
With:
```tsx
        right={
          <TopbarActions>
            <SearchButton />
            <IconButton onPress={openNewGoalSheet}>
              <MI.plus size={20} color={t.text1} />
            </IconButton>
          </TopbarActions>
        }
```

- [ ] **Step 3: Invest** — add `SearchButton, TopbarActions` to the `../components/ui` import, then replace the `right={...}` block (`mobile/src/screens/Invest.tsx:130`):

Replace:
```tsx
        right={
          <IconButton onPress={openAddHoldingSheet}>
            <MI.plus size={20} color={t.text1} />
          </IconButton>
        }
```
With:
```tsx
        right={
          <TopbarActions>
            <SearchButton />
            <IconButton onPress={openAddHoldingSheet}>
              <MI.plus size={20} color={t.text1} />
            </IconButton>
          </TopbarActions>
        }
```

- [ ] **Step 4: Reports** — add `SearchButton, TopbarActions` to the `../components/ui` import, then replace the `right={...}` block (`mobile/src/screens/Reports.tsx:219`):

Replace:
```tsx
        right={
          <IconButton onPress={openPeriodSheet}>
            <MI.filter size={20} color={t.text1} />
          </IconButton>
        }
```
With:
```tsx
        right={
          <TopbarActions>
            <SearchButton />
            <IconButton onPress={openPeriodSheet}>
              <MI.filter size={20} color={t.text1} />
            </IconButton>
          </TopbarActions>
        }
```

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add mobile/src/screens/Budgets.tsx mobile/src/screens/Goals.tsx mobile/src/screens/Invest.tsx mobile/src/screens/Reports.tsx
git -c commit.gpgsign=false commit -m "feat(mobile): add topbar search to Budgets, Goals, Invest, Reports" --author="Ashutosh <gairola.ashutosh26@gmail.com>"
```

---

### Task 3: Add search to `MPageShell` screens that already have a right action

**Files:**
- Modify: `mobile/src/screens/Accounts.tsx` (right slot ~line 132)
- Modify: `mobile/src/screens/Notifications.tsx` (right slot ~line 115)
- Modify: `mobile/src/screens/Sync.tsx` (right slot ~line 280)
- Modify: `mobile/src/screens/AccountDetail.tsx` (right slot ~line 155)
- Modify: `mobile/src/screens/TxCategories.tsx` (right slot ~line 105)
- Modify: `mobile/src/screens/TxDetail.tsx` (right slot ~line 147)

**Interfaces:**
- Consumes: `SearchButton`, `TopbarActions` from `../components/ui` (Task 1).

For each file: add `SearchButton, TopbarActions` to its existing `from '../components/ui'` import, then wrap the existing right-slot `IconButton` in `<TopbarActions>` with `<SearchButton />` first.

- [ ] **Step 1: Accounts** — replace the `right={...}` block:
```tsx
      right={
        <IconButton onPress={openAddAccountSheet}>
          <MI.plus size={20} color={t.text1} />
        </IconButton>
      }
```
With:
```tsx
      right={
        <TopbarActions>
          <SearchButton />
          <IconButton onPress={openAddAccountSheet}>
            <MI.plus size={20} color={t.text1} />
          </IconButton>
        </TopbarActions>
      }
```

- [ ] **Step 2: Notifications** — replace:
```tsx
      right={
        <IconButton onPress={openMoreSheet}>
          <MI.more size={20} color={t.text1} />
        </IconButton>
      }
```
With:
```tsx
      right={
        <TopbarActions>
          <SearchButton />
          <IconButton onPress={openMoreSheet}>
            <MI.more size={20} color={t.text1} />
          </IconButton>
        </TopbarActions>
      }
```

- [ ] **Step 3: Sync** — replace:
```tsx
      right={
        <IconButton onPress={openMoreSheet}>
          <MI.more size={20} color={t.text1} />
        </IconButton>
      }
```
With:
```tsx
      right={
        <TopbarActions>
          <SearchButton />
          <IconButton onPress={openMoreSheet}>
            <MI.more size={20} color={t.text1} />
          </IconButton>
        </TopbarActions>
      }
```

- [ ] **Step 4: AccountDetail** — replace:
```tsx
      right={
        <IconButton onPress={openMoreSheet}>
          <MI.more size={20} color={t.text1} />
        </IconButton>
      }
```
With:
```tsx
      right={
        <TopbarActions>
          <SearchButton />
          <IconButton onPress={openMoreSheet}>
            <MI.more size={20} color={t.text1} />
          </IconButton>
        </TopbarActions>
      }
```

- [ ] **Step 5: TxCategories** — replace:
```tsx
      right={
        <IconButton onPress={openNewCategorySheet}>
          <MI.plus size={20} color={t.text1} />
        </IconButton>
      }
```
With:
```tsx
      right={
        <TopbarActions>
          <SearchButton />
          <IconButton onPress={openNewCategorySheet}>
            <MI.plus size={20} color={t.text1} />
          </IconButton>
        </TopbarActions>
      }
```

- [ ] **Step 6: TxDetail** — replace:
```tsx
      right={
        <IconButton onPress={openMoreSheet}>
          <MI.more size={20} color={t.text1} />
        </IconButton>
      }
```
With:
```tsx
      right={
        <TopbarActions>
          <SearchButton />
          <IconButton onPress={openMoreSheet}>
            <MI.more size={20} color={t.text1} />
          </IconButton>
        </TopbarActions>
      }
```

- [ ] **Step 7: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add mobile/src/screens/Accounts.tsx mobile/src/screens/Notifications.tsx mobile/src/screens/Sync.tsx mobile/src/screens/AccountDetail.tsx mobile/src/screens/TxCategories.tsx mobile/src/screens/TxDetail.tsx
git -c commit.gpgsign=false commit -m "feat(mobile): add topbar search to Accounts, Notifications, Sync, and detail screens" --author="Ashutosh <gairola.ashutosh26@gmail.com>"
```

---

### Task 4: Add search to `MPageShell` screens with an empty right slot

**Files:**
- Modify: `mobile/src/screens/Settings.tsx` (`MPageShell` at line 294 — currently no `right`)
- Modify: `mobile/src/screens/CategoryDetail.tsx` (`MPageShell` at line 173 — currently no `right`)

**Interfaces:**
- Consumes: `SearchButton` from `../components/ui` (Task 1). No `TopbarActions` needed — single action.

- [ ] **Step 1: Settings** — add `SearchButton` to the existing `from '../components/ui'` import, then add a `right` prop to the `MPageShell`:

Replace:
```tsx
    <MPageShell title="Settings" onBack={pop}>
```
With:
```tsx
    <MPageShell title="Settings" onBack={pop} right={<SearchButton />}>
```

- [ ] **Step 2: CategoryDetail** — add `SearchButton` to the existing `from '../components/ui'` import, then add a `right` prop:

Replace:
```tsx
    <MPageShell title={name} onBack={pop}>
```
With:
```tsx
    <MPageShell title={name} onBack={pop} right={<SearchButton />}>
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add mobile/src/screens/Settings.tsx mobile/src/screens/CategoryDetail.tsx
git -c commit.gpgsign=false commit -m "feat(mobile): add topbar search to Settings and CategoryDetail" --author="Ashutosh <gairola.ashutosh26@gmail.com>"
```

---

### Task 5: Add search to Chat's custom topbar

**Files:**
- Modify: `mobile/src/screens/Chat.tsx` (custom topbar, lines 406-436)

**Interfaces:**
- Consumes: `SearchButton`, `TopbarActions` from `../components/ui` (Task 1).

Chat does not use `Topbar`/`MPageShell`; it hand-rolls a topbar with a back button (left), a middle avatar/title block, and a single right `IconButton` (history/sms). Add `<SearchButton />` before that right button, wrapped in `<TopbarActions>`.

- [ ] **Step 1:** Add `SearchButton, TopbarActions` to Chat's existing `from '../components/ui'` import. (Chat already imports `IconButton` from there.)

- [ ] **Step 2:** Replace the trailing right button of the topbar (`mobile/src/screens/Chat.tsx:433-435`):

Replace:
```tsx
        <IconButton onPress={() => setHistoryOpen(true)}>
          <MI.sms size={18} color={t.text1} />
        </IconButton>
```
With:
```tsx
        <TopbarActions>
          <SearchButton />
          <IconButton onPress={() => setHistoryOpen(true)}>
            <MI.sms size={18} color={t.text1} />
          </IconButton>
        </TopbarActions>
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification** — start the app (`cd mobile && npx expo start`) and confirm on a representative sample (one `<Topbar>` screen e.g. Goals, one `MPageShell` screen e.g. Accounts, one empty-slot screen e.g. Settings, and Chat):
  1. Search icon appears top-right, leftmost when another action sits beside it.
  2. Tapping it opens the Search screen.
  3. Search's back button returns to the originating screen.

- [ ] **Step 5: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add mobile/src/screens/Chat.tsx
git -c commit.gpgsign=false commit -m "feat(mobile): add topbar search to Chat" --author="Ashutosh <gairola.ashutosh26@gmail.com>"
```

---

## Self-Review Notes

- **Spec coverage:** Every in-scope screen from the spec maps to a task — Budgets/Goals/Invest/Reports (T2), Accounts/Notifications/Sync/AccountDetail/TxCategories/TxDetail (T3), Settings/CategoryDetail (T4), Chat (T5). Reusable components (T1). Home/Txns/Search excluded per spec.
- **`nav` vs `push`:** resolved to `nav('search')` (spec + navContext verified).
- **Import-cycle caveat from the spec:** resolved — `ui.tsx` importing `MI`/`useNav` creates no cycle (neither `icons.tsx` nor `navContext.tsx` imports `ui.tsx`). The inline fallback is therefore not needed.
- **Type consistency:** `SearchButton` and `TopbarActions` names are used identically in every task.
- **Deviation from TDD:** justified — no mobile test framework exists; verification is `npx tsc --noEmit` + manual run, per the spec's testing section.
