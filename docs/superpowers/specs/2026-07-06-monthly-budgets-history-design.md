# Monthly Budgets with History — Design

**Date:** 2026-07-06
**Status:** Approved, ready for implementation planning

## Problem

The backend models a `Budget` as a row per user with `name`, `startDate`,
`endDate`, `income`, and a set of `categories`, and fully supports *many*
budgets per user (`findAll` returns all, newest-first). The mobile UI, however,
silently collapses to a single budget: `api.budgets.list()` fetches
`/budgets?current=true` and uses only `raw[0]` (the most recent row). There is
no way to view or switch to any other month, and the `?current=true` query
param is ignored by the controller entirely.

This mismatch also hides a latent bug: both `upsertCategory` and
`currentSummary` treat `raw[0]` (newest budget) as "the current month". If the
newest budget is June's and it is now July, `upsertCategory` silently edits
**June** instead of creating July, and Home's hero shows June's numbers.

## Decision

Lock the model to **one budget per calendar month**, and add month-history
browsing to the Budgets screen. This matches how the code already behaves and
is the smallest, cleanest change.

### Key product decisions

- **View-only history.** Only the *current* month's allocations are editable.
  Past months render read-only.
- **Actuals stay live.** `spent` is never stored — it is computed at read time
  from transactions whose `date` falls in the budget's `[startDate, endDate]`
  range (`budgets.repository.ts:65-99`). A back-dated transaction added later
  therefore flows into that month's `spent` automatically. Freezing past-month
  *allocations* loses no accuracy; the *actuals* remain live. This is precisely
  why view-only history is correct.
- **Carry-forward.** Setting up a fresh month copies the most recent prior
  month's categories + allocations as a starting point (spent resets to live).

## Architecture

### 1. Data model (backend)

No entity change. A `Budget` remains one row per month (`startDate` = 1st of
month, `endDate` = last day, auto `name` like `"July 2026"`).

Formalize the invariant: **at most one budget per `(userId, calendar month)`**,
enforced in `BudgetsService`.

### 2. Backend API

- **`GET /budgets?month=YYYY-MM`** — returns the single `ComputedBudget` for
  that month (matched by `startDate`'s month), or `null`. Add a
  `QueryBudgetsDto` with an optional, validated `month` param.
- **`GET /budgets`** (no param) — unchanged: all budgets newest-first. The
  client uses this to compute the switcher's range (earliest budget month →
  current month). The ignored `?current=true` param is retired.
- **`POST /budgets`** — before insert, if a budget already exists for that
  month, reject with `409 Conflict` (a guard; the client should not normally
  hit it). Auto-name from `startDate`.
- No dedicated `/budgets/current` route — the client asks `?month=<thisMonth>`
  (YAGNI).

### 3. Client API layer (`mobile/src/api/index.ts`)

- `list(month?)` → `GET /budgets?month=…`, defaulting to the current month;
  returns that month's `BudgetCategoryView[]`.
- `listMonths()` → `GET /budgets`; returns the sorted set of months that have
  budgets (drives switcher bounds).
- `currentSummary()` → fetch the **current month** explicitly, not `raw[0]`.
  **Fixes the Home hero bug.**
- `upsertCategory()` → operate on the **current month** explicitly; create the
  current month's budget if none exists (with carry-forward, §5). **Fixes the
  June-edit bug.**
- `setupMonth(fromPreviousMonth)` → carry-forward creation helper.

### 4. Budgets screen (`mobile/src/screens/Budgets.tsx`)

- **Month switcher** under the topbar: `◀ July 2026 ▶`. Left steps back through
  history to the earliest budget month; right stops at the current month (no
  future budgeting). New state: `viewMonth`.
- Data source becomes `api.budgets.list(viewMonth)`; the overall ring and
  category cards render for `viewMonth`.
- **Current month** → "+" and edit affordances active (existing behavior).
- **Past month with a budget** → hide "+"/edit; cards render read-only with
  live `spent`.
- **Past month, no budget** → empty state: "No budget was set for {month}."
- **Current month, no budget** → carry-forward setup prompt (§5).

### 5. Carry-forward

When the current month has no budget and the user taps "Set up budget":

- If a prior month's budget exists, pre-fill categories + allocations from the
  most recent prior month (spent resets to live). User confirms/edits, then it
  is created.
- If no prior budget exists, fall through to the existing blank "New category
  budget" flow.

## Data flow

1. Screen mounts → `viewMonth` = current month → `api.budgets.list(viewMonth)`
   → `GET /budgets?month=YYYY-MM` → `ComputedBudget | null`.
2. `listMonths()` (from `GET /budgets`) establishes switcher bounds.
3. Tapping ◀/▶ changes `viewMonth`, re-fetches, and re-gates edit affordances.
4. Editing (current month only) → `upsertCategory` targets the current month,
   creating it via carry-forward if absent → `bumpData()` refresh.

## Error handling

- `?month=` with no matching budget → `null` (not an error); screen shows the
  appropriate empty/setup state.
- `POST /budgets` for an already-budgeted month → `409 Conflict`; the client
  never intends to create a duplicate, so this is a guard, surfaced as a toast
  if it ever occurs.
- Switcher never advances past the current month and never before the earliest
  budget month.

## Testing

- **Backend** (`budgets.service.spec.ts`): `?month=` matching, one-per-month
  guard (409), current-month resolution, carry-forward copy, and that a
  back-dated transaction is reflected in a past month's `spent`.
- **Client**: switcher bounds (no future, stops at earliest), current-vs-past
  edit gating, carry-forward pre-fill.

## Out of scope (YAGNI)

- Arbitrary named / overlapping budgets.
- Editing past months.
- Category `rollover` behavior.
- `income`-based planning.
