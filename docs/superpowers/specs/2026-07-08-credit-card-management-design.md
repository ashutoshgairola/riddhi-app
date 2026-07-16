# Credit-card management + pay-bill/settlement (Slice B) — design

## Context

Second slice of the Riddhi money-management feature set (see
`docs/superpowers/specs/2026-07-07-payment-source-foundation-design.md` for the
slice decomposition A–E and the browser prototype `project/riddhi/MobileCards.jsx`
+ `MobileStore.jsx` that this UI follows). Slice A (payment-source foundation) is
built: every transaction carries a `paymentMethod`, credit cards are already
`Account`s of `type='credit'`, and the Activity screen splits Bank & UPI vs Cards.

Two facts from the existing app make this slice lean:

1. **A credit account's balance is already negative** = the total outstanding.
   The Accounts screen creates cards with `balance: -Math.abs(outstanding)`, and
   the existing `transactionBalanceDeltas` logic pushes it more negative on a
   card expense (swipe) and toward zero on a transfer in (payment).
2. **A card-bill payment is a `transfer`** (bank → card). Transfers already move
   both balances *and* are already excluded from expense totals, so
   "no double-count" needs **no new flag** — a transfer whose destination is a
   credit account *is* a card payment.

This lets most of the card view be **computed from the ledger** rather than
stored, with a small `CreditCard` entity holding config plus optional exact
statement figures.

## Consistency principle (applies to every slice)

Each slice keeps the rest of the app in sync as part of that slice (see the
Slice A spec). This slice carries its own "Cross-module consistency" section.

## Goal

Give each credit card a first-class management view: total outstanding &
available limit, this cycle's spends by category, the statement due amount /
minimum due / days-left countdown, cashback this cycle, a one-tap Pay bill that
settles the card without double-counting, and Munshi awareness of card dues.

## Non-goals (later slices)

Statement PDF import + SMS dedup (Slice C) — it will *populate* the optional
statement-override fields this slice defines, but the import UI/parsing is Slice
C. Subscriptions (Slice D). The Home "card bills due" widget (Slice E). Paying a
bill *through Munshi chat* (read-awareness only here).

## Design

### CreditCard entity (backend)

A new `credit_card` table, 1:1 with a credit `Account` (FK `accountId`, unique,
`onDelete: CASCADE`). A row is created when a credit account is created and
removed with it.

Config fields:

- `creditLimit: numeric` (₹)
- `statementDay: int` (1–28 — day of month the cycle closes)
- `graceDays: int` (default 18 — days from statement close to due date)
- `network: varchar | null` (e.g. "Visa")
- `last4: varchar(4) | null`
- `rewardRate: varchar | null` (display text, e.g. "2% cashback")

Optional statement-override cluster (all nullable; set by Slice C import or
manual entry to the bank's exact figures; when absent the summary computes):

- `statementDate: date | null` (the cycle-close date these figures are for)
- `statementBilled: numeric | null`
- `statementMinDue: numeric | null`
- `statementDueDate: date | null`
- `statementRewards: numeric | null` (cashback earned that cycle)

### Cycle math (backend service)

A `CreditCardService` computes a **card summary** from the entity + ledger. All
amounts in ₹, dates in the account/user timezone (use the same date handling as
the transactions repository).

- `outstanding = max(0, -account.balance)`
- `available = creditLimit - outstanding`
- `usedPct = clamp(round(outstanding / creditLimit * 100), 0, 100)` (0 when
  `creditLimit` is 0/absent)
- `lastStatementDate(statementDay, today)` = the most recent occurrence of
  `statementDay`: this month's `statementDay` if `today.day >= statementDay`,
  else the previous month's (clamp to valid day; `statementDay` ≤ 28 avoids
  month-length edge cases).
- `unbilled` = Σ |amount| of the card account's **expense** transactions dated ≥
  `lastStatementDate`.
- `cycleByCategory` = those same unbilled expenses grouped by category →
  `[{ categoryId, label, value, color }]`, sorted desc.
- `paymentsSince(date)` = Σ amount of **transfers whose `destinationAccountId` is
  this card** dated ≥ `date`.
- **Billed / minDue / dueDate:**
  - If a stored override exists and `statementDate === lastStatementDate`
    (the override is for the current billed cycle):
    - `billed = max(0, statementBilled - paymentsSince(statementDate))`
    - `minDue = min(statementMinDue ?? 0, billed)`
    - `dueDate = statementDueDate`
  - Else (computed):
    - `billed = max(0, outstanding - unbilled)`
    - `minDue = billed > 0 ? max(round(billed * 0.05), 100) : 0`
    - `dueDate = lastStatementDate + graceDays`
- `daysUntilDue = dueDate - today` (integer days; negative = overdue)
- `hasBill = billed > 0`
- `rewardsThisCycle = statementRewards ?? 0`

### Endpoints (backend)

- `GET /accounts/:id/card` → the computed card summary DTO (config + all computed
  fields + `cycleByCategory`). 404 if the account isn't a credit account or has
  no card row.
- `PATCH /accounts/:id/card` → edit config (`creditLimit`, `statementDay`,
  `graceDays`, `network`, `last4`, `rewardRate`) and/or the statement-override
  fields (so Slice C / manual can set exact figures). Validated DTO.
- `POST /accounts/:id/card/pay` `{ fromAccountId, amount }` → validates the
  source account belongs to the user and has `balance >= amount`, and that `:id`
  is a credit account; then creates a `transfer` transaction
  (`accountId = fromAccountId`, `destinationAccountId = :id`, `type = transfer`,
  `amount`, `paymentMethod = netbanking`, description "<Card name> — bill paid").
  Reuses the existing transaction-create path so both balances move atomically.
  Returns the created transaction. Rejects insufficient funds (400) and a
  non-credit `:id` (400).

Card-row creation: when `AccountsService.create` makes a `type='credit'`
account, it also creates a `CreditCard` row. `creditLimit`/`statementDay`/etc.
come from the create-account DTO (extended with optional card fields; sensible
defaults when omitted — `statementDay` defaults to 1, `graceDays` 18).

### CardDetail screen (mobile)

New nav kind `card-detail`. The Accounts screen branches on tap: a credit
account pushes `{ kind: 'card-detail', data: account }`, others keep
`account-detail`. Sections mirror `project/riddhi/MobileCards.jsx`:

- **Card visual** — outstanding (hero number), `bank`/`network`, usage bar
  (`usedPct`), `•••• last4`, "{available} available of {creditLimit}".
- **Statement due** — when `hasBill`: billed amount, `min due`, a days-left pill
  that is emerald (>7d) / amber (≤7d) / red (≤3d/overdue), and a **Pay bill**
  button. Else a "No dues — all paid" empty state with the next statement date.
- **This cycle by category** — stacked bar + per-category rows (value, %),
  total = `unbilled`.
- **Rewards** — `rewardsThisCycle` cashback + `rewardRate` text (hidden if both
  absent).
- **Card transactions** — the card's expenses (swipes) and transfers-in
  (payments), newest first, with an "unbilled" marker on this-cycle swipes.

`api.cards` resource: `get(accountId)`, `pay(accountId, {fromAccountId, amount})`,
`updateSettings(accountId, patch)`. Adapters map the summary DTO → a
`CardSummaryView`. A `PayBillSheet` component: mode full/min/custom (amount
computed client-side from the summary), a source-account picker (bank accounts
with sufficient balance), balance check, calls `api.cards.pay`.

**Add-credit-card flow:** the Accounts "Add credit card" sheet gains fields for
credit limit + statement day (required) and optional last4/network, passed to
the extended create-account call so the card can compute. The Accounts list
shows a small "due in Xd" hint on credit cards (from the summary).

### Cross-module consistency (Slice B)

- **Munshi** — the bank-vs-card snapshot line deferred from Slice A lands here:
  `prompt.ts` snapshot gains one card-dues line (total outstanding across cards +
  the soonest due date), plumbed through the chat prompt context assembly in
  `ai-chat.service.ts`. The accounts tool (`accounts.tools.ts`) includes the card
  computed fields (outstanding, available, minDue, dueDate) for credit accounts so
  Munshi can answer "how much do I owe / when's it due". Pay-bill via chat is a
  deferred future tool, not this slice.
- **Reports / Insights / Budgets** — verified **unchanged**: card swipes are real
  expenses (counted), bill payments are transfers (excluded from expense totals).
  No code change; a regression check that a card swipe still counts in
  budgets/reports and a bill payment does not.
- **Accounts screen** — credit accounts already render; this slice adds the
  card-detail nav branch, the due-in-Xd hint, and the extended add-card fields.

## Testing

- **Backend:** `CreditCardService` cycle-math units — `lastStatementDate` across a
  month boundary; `unbilled`/`billed`/`available`/`usedPct`; override-with-payments
  (`billed = statementBilled − paymentsSince`, `minDue` clamp); computed vs
  override branch selection; `cycleByCategory` grouping. Pay endpoint — creates a
  transfer that moves both balances, rejects insufficient funds and a non-credit
  destination, and the resulting transfer is excluded from expense totals.
- **Mobile:** card-summary adapter mapping (DTO → `CardSummaryView`), including the
  due-countdown color thresholds and the "no dues" branch.
- **Cross-module:** Munshi snapshot includes the card-dues line when a card has a
  balance; accounts tool returns card fields for credit accounts. Regression: a
  card-bill transfer does not appear in the expense/budget totals.

## Risks / edge cases

- **Override staleness** — a stored `statementDate` that isn't the current
  `lastStatementDate` is ignored (falls back to computed), so an old imported
  statement never shows stale figures.
- **Overpayment** — paying more than `billed` is allowed (reduces `unbilled`
  too / creates a credit balance); `outstanding`/`billed` clamp at 0, and a
  positive `account.balance` (credit balance) shows `outstanding = 0`.
- **creditLimit = 0 / absent** — `usedPct` and `available` guard against divide-by-
  zero; `available` may be negative if outstanding exceeds a low limit (shown as
  over-limit).
- **Timezone/day math** — reuse the transactions repository's date handling so
  cycle boundaries match how transactions are dated.
