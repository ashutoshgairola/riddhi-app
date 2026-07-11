# Goals: Clickable Cards + Transfer Savings to Goal

**Date:** 2026-07-12
**Status:** Approved

## Summary

Make each goal on the Goals screen tappable, opening a dedicated **Goal Detail**
screen, and add the ability to **transfer savings into a goal** — moving real
money from a source account into the goal's linked savings account. A goal's
progress is derived from its linked account's balance.

## Decisions (from brainstorming)

- **Transfer semantics:** move real money **into the goal's linked account**
  (source account debited, goal account credited) via the existing `transfer`
  transaction type.
- **Tap behavior:** open a full **Goal Detail screen** (consistent with
  AccountDetail / CardDetail), not a bottom sheet.
- **No-linked-account handling:** add account-linking to **goal creation**, so
  new goals always have a destination. Legacy goals without one get a
  "Link a savings account" action on the detail screen.
- **Progress source:** **derive from the linked account balance**
  (`progress = balance / target`). `currentAmount` becomes the fallback for
  goals with no linked account.
- **Account default:** goal creation **defaults to a dedicated account per
  goal** (named after the goal), so progress isn't distorted by a shared
  balance. Linking an existing account is allowed.

## Progress model

For a goal with a linked account:

```
saved       = account.balance
progressPct = min(100, max(0, saved / targetAmount * 100))
remaining   = max(targetAmount - saved, 0)
```

For a goal **without** a linked account (legacy), the current behavior is kept:
`saved = currentAmount`, and progress is computed from `currentAmount`.

**Caveat:** progress reflects the *whole* linked account balance. A shared
account over-counts, which is why creation defaults to a dedicated account.

## Backend changes

### `goals.service.ts`

- `computeGoalFields(goal, account?)` accepts the loaded linked `Account`. When
  present, compute `progressPct` / `saved` / `remaining` from `account.balance`;
  otherwise fall back to `currentAmount`.
- `findAll` / `findOne` load the `account` relation.

### New endpoint: `POST /goals/:id/contribute`

Body: `{ amount: number (positive), sourceAccountId: string (uuid) }`

Behavior:
1. Load the goal; 404 if not found for user.
2. Reject (400) if the goal has no linked account.
3. Reject (400) if `sourceAccountId === goal.accountId`.
4. Delegate to `TransactionsService.create` with:
   - `type: transfer`
   - `accountId: sourceAccountId` (source, debited)
   - `destinationAccountId: goal.accountId` (goal account, credited)
   - a transfer category/description (e.g. `"Savings → <goal name>"`)
   - `date`: today
   This moves both account balances atomically (existing `applyBalances`).
5. Recompute goal fields from the (now-updated) linked account balance.
6. Emit `GOAL_UPDATED` if `progressPct` crossed (reuse existing event).
7. Return the updated computed goal.

`GoalsService` gains a dependency on `TransactionsService` (and
`AccountsService` if needed to reload the balance).

No DB migration: `accountId` column and `CreateGoalDto.accountId` already exist.

## Mobile API layer

### Types (`types.ts`)

- `GoalView` gains: `id: string`, `accountId?: string`, `saved: number`,
  `remaining: number`. Existing `current` maps to `saved` for progress display.
- `NewGoalInput` gains `accountId?: string`.

### Adapter (`adapters.ts`)

- `toGoalView` maps `id`, `accountId`, and backend-computed `saved` /
  `remaining`; progress display uses `saved`.

### API (`api/index.ts`)

- `api.goals.get(id)` → `GET /goals/:id` → `toGoalView`.
- `api.goals.contribute(id, { amount, sourceAccountId })` →
  `POST /goals/:id/contribute`; calls `bumpData()` on success.
- `api.goals.create` passes `accountId` through.

## Goal creation: account picker

Add a `kind: 'select'` **"Savings account"** field to the New Goal form:

- Options = existing savings/cash accounts, **plus** a
  `＋ New account for this goal` option (the default).
- On submit:
  - If "new": create a savings account named after the goal via
    `api.accounts.create`, capture its id, then create the goal with that
    `accountId`.
  - Else: create the goal with the chosen `accountId`.
- Accounts are pre-fetched on the Goals screen (`useApiData`) so the select is
  populated synchronously when the form opens.

## Goal Detail screen (`goal-detail`)

- Register kind `'goal-detail'` in `navContext.ts` union and `screens.tsx`.
- Goals list: wrap each card in a `Pressable` →
  `push({ kind: 'goal-detail', data: goal })`.
- Screen chrome mirrors AccountDetail / CardDetail:
  - Header: emoji, name, target date, accent color.
  - Large progress bar.
  - Stat row: **Saved / Target / Remaining**.
  - Linked-account line; projected completion date (if available).
  - Primary **Transfer savings** button.
- **Transfer** opens a form (source-account `select` + `amount`) →
  `api.goals.contribute` → toast + refresh.
- **Legacy goals (no linked account):** show a **"Link a savings account"**
  action (same account picker) that sets `accountId` via `api.goals.update`,
  in place of the Transfer button.

## Error handling

- `contribute` rejects on: no linked account, `source === destination`,
  non-positive amount. The FormSheet keeps the sheet open and surfaces the
  thrown message.
- Transfer failure → toast "Couldn't transfer — try again"; list unchanged.
- Source account with insufficient balance: no new overdraft rule is added
  (matches existing transaction behavior).

## Testing

### Backend
- `goals.service.spec`:
  - progress derived from linked account balance;
  - `currentAmount` fallback when no linked account;
  - `contribute` moves both account balances and advances progress;
  - guards: no linked account (400), same source/destination (400),
    non-positive amount (400).
- Controller test for `POST /goals/:id/contribute`.

### Mobile
- `adapters` test: `toGoalView` maps `id`, `accountId`, `saved`.
- Goals list pushes `goal-detail` on card press.

## Out of scope

- Contribution history / ledger view on the goal.
- Recurring / scheduled auto-contributions.
- Withdrawing from a goal (reverse transfer).
- Multi-goal-per-account allocation accounting.
