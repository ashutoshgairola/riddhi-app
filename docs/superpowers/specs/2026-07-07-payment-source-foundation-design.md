# Payment-source foundation — design

## Context

The Riddhi money-management feature set (see `project/riddhi/` browser
prototype — `MobileCards.jsx`, `MobileSubs.jsx`, `MobileStore.jsx`) teaches the
app how money actually flows in India: UPI from a bank, credit-card swipes
settled later as one bill, auto-debits (ACH/SIP), and recurring subscriptions.

That prototype models everything client-side in a single flat ledger with ad-hoc
fields (`method`, `acct`, `cardId`, `settlement`). The real app is a NestJS
backend + Expo/React Native mobile app where **credit cards are already
`Account`s** (`AccountType.CREDIT`) and **transfers are already excluded from
expense totals**. This lets us model the prototype's intent more cleanly than the
prototype itself did.

The full feature set is too large for one spec. It is decomposed into slices,
each with its own spec → plan → build cycle:

- **A. Payment-source foundation** *(this spec)* — payment-method tag on every
  transaction, Bank-vs-Cards filter, Add-Transaction source picker. Foundation
  that B–E build on.
- **B. Credit-card management + pay-bill/settlement** — card fields on `Account`
  (limit, statement day, due date, min due, billed, rewards), billing-cycle math,
  Card Detail screen, pay-bill modeled as a transfer.
- **C. Statement PDF import + SMS dedup.**
- **D. Subscriptions** — new entity; monthly burn / yearly projection / upcoming
  timeline / price-hike & unused flags / pause-cancel-remind. **Auto-detection
  works purely from recurring debits already in Riddhi (transactions/SMS)** — no
  Gmail parsing and no Google Play API (Google exposes no public API to list a
  user's Play subscriptions). Not Play-specific.
- **E. Home widgets** — "card bills due" and "upcoming subscriptions".

## Consistency principle (applies to every slice)

Each slice **keeps the rest of the app in sync as part of that slice** — the app
must be correct and consistent after every slice, never left half-wired. Concretely,
whenever a slice changes the transaction/account/subscription model, that same
slice updates every module that reads or writes those records: SMS-sync, receipt
scanning, events, budgets, categories, reports/insights, CSV export, and the
Munshi AI-chat tools + snapshot. Each slice spec carries its own
"Cross-module consistency" section listing exactly what it touches.

## Goal

Give every transaction a queryable payment source so the app can show *how* you
paid at a glance, split Activity into **Bank & UPI** vs **Cards**, and let the
user pick what they paid with when logging an expense — without inventing a
redundant data model, and without requiring a data migration of existing rows.

## Non-goals (handled by later slices)

Card limits / due dates / statement-cycle math, the Card Detail screen,
pay-bill / settlement transactions, statement PDF import, subscriptions, and the
Home widgets. This slice only establishes the payment-source tag, the filter, and
the Add-Transaction account picker.

## Design

### Data model

The payment source is `accountId` (the *what* — a bank account or a credit-card
account, already on `Transaction`) plus a new small enum for the *rail* (the
*how*). We do **not** add the prototype's separate `cardId` (the account already
identifies the card) or `settlement` flag (Slice B models bill payment as a
`transfer`, which the app already excludes from expense totals).

**New enum** in `backend/src/common/enums.ts`:

```ts
export enum PaymentMethod {
  UPI = 'upi',
  CARD = 'card',
  NETBANKING = 'netbanking',
  AUTOPAY = 'autopay',
  CASH = 'cash',
}
```

**`Transaction` entity** — add one nullable column:

```ts
@Column({ type: 'enum', enum: PaymentMethod, nullable: true })
paymentMethod: PaymentMethod | null;
```

Nullable by design: **existing rows need no backfill.** A `null` reads as "derive
from the account at display time" (see label derivation). New rows get a
persisted value so the `source` filter is exact.

### Derivation (create path)

`TransactionsService` on create: if the client sends `paymentMethod`, use it.
Otherwise derive a default from the linked account:

- account `type === 'credit'` → `card`
- any other account type → `upi`
- no `accountId` → `cash`

The derived value is persisted (not left null) so newly created rows are exactly
filterable. `null` remains only for pre-existing historical rows.

### Filtering — `GET /transactions?source=bank|card`

Add an optional `source` query param on the transactions list endpoint:

- `source=card` → transactions whose account is `type = 'credit'`
- `source=bank` → all other transactions (bank / UPI / cash, incl. no account)
- omitted → no source filtering (current behaviour)

Implemented in the repository via the existing account join
(`account.type = 'credit'`), so the Bank-vs-Cards split is a real backend filter,
not client-side guessing. Rows with no account fall under `bank`. This keys off
account type rather than `paymentMethod` so the historical `null`-method rows
still filter correctly.

### DTOs & validation

`CreateTransactionDto` / `UpdateTransactionDto` accept an optional
`paymentMethod` validated against the `PaymentMethod` enum. The list query DTO
accepts optional `source: 'bank' | 'card'`.

### Mobile — types & adapter

- `ApiTransaction` (`mobile/src/api/types.ts`) gains `paymentMethod?:
  PaymentMethod`.
- `TxView` gains `source: { kind: 'upi' | 'card' | 'bank' | 'autopay' | 'cash';
  label: string; autopay?: boolean }`.
- The **adapter** (`mobile/src/api/adapters.ts`) derives `source` from
  `paymentMethod` + the transaction's account (institution short-name),
  centralizing the prototype's `srcMeta` logic in one place. Label mapping:

  | method (or derived) | account | label example |
  |---|---|---|
  | `card` | credit account | `ICICI CC` |
  | `upi` | bank account | `HDFC UPI` |
  | `netbanking` | bank account | `HDFC` |
  | `autopay` | bank/credit | `HDFC ACH` + `· auto` marker |
  | `cash` | none | `Cash` |

  When `paymentMethod` is `null`, the adapter derives kind the same way the
  backend create-path does — credit account → `card`, any other account →
  `upi`, no account → `cash` — so old rows still get a correct tag. (`netbanking`
  and `autopay` only ever appear when explicitly stored, e.g. from SMS sync.)

### Mobile — UI

- **`SourceTag`** — a small pill component (icon + label), rendered in
  transaction list rows (`Txns`), `TxDetail`, and Home's recent list. Icons reuse
  the existing icon set (card / bank / upi).
- **Activity (`Txns`) screen** — a segmented control **All / Bank & UPI /
  Cards** that passes `source=bank|card` to the API (via the existing
  transactions query hook). "All" omits the param.
- **`AddTxSheet`** — an **account picker** listing bank accounts *and* credit
  cards. Picking a credit card tags the spend `card`; a bank account tags it
  `upi`. `NewTxInput` already carries `accountId`; add optional `paymentMethod`
  (defaults follow the account type, matching the backend derivation).

## Cross-module consistency (Slice A)

Modules this slice must update so the whole app understands payment source:

- **SMS-sync** (`sms-sync.service.ts`) — it already matches an account by the
  last-4 digits it parses. Set `paymentMethod` on the created transaction from
  that match: matched account `type=credit` → `card`; otherwise `upi` (or
  `autopay` when the SMS reads as an auto-debit/ACH/SIP mandate). This is what
  makes real synced spends carry the correct tag.
- **Munshi AI-chat** — `transactions.tools.ts` `toModelItem`/`toViewItem` include
  `paymentMethod` (and the derived source label) so the assistant can answer
  "how much did I spend on my card this month". `list_transactions` accepts an
  optional `source: 'bank' | 'card'` filter mirroring the API. The financial
  snapshot in `prompt.ts` gains a one-line bank-vs-card spend split so Munshi is
  source-aware without a tool call.
- **Receipt scanning** (`receipts.service.ts`) — created transactions get a
  default `paymentMethod` derived from the chosen account (same rule as the
  create path); no schema change.
- **Events** (`events.service.ts`) — event-linked expense transactions keep
  deriving their method from their account (typically none → `cash`); no
  behavioural change, verified not broken.
- **CSV export** (mobile `lib/exportCsv.ts`) — add a "Source" column from the
  derived tag label.

Modules that need **no change** in Slice A (amounts are unaffected by the tag):
budgets, categories, reports/insights, goals. Their settlement-exclusion
correctness is handled in Slice B (bill payment modeled as a `transfer`, already
excluded from expense totals).

## Testing

- **Backend:** unit tests for create-path derivation (credit → card, bank → upi,
  no account → cash), and for the `source=bank|card` repository filter including
  the no-account (→ bank) and historical-`null`-method (filter by account type)
  cases.
- **Mobile:** adapter tests mapping `(paymentMethod, account)` → `source`
  including the `null`-method derivation and the autopay marker.
- **Cross-module:** sms-sync test asserting a credit-card SMS produces a
  `card`-tagged transaction and a UPI SMS a `upi`-tagged one; Munshi
  `transactions.tools` test asserting `paymentMethod` is returned and the
  `source` filter narrows results.

## Risks / edge cases

- **Historical `null` rows** — covered by deriving at display time and filtering
  by account type rather than stored method.
- **Cash / no-account rows** — deterministic: `cash` kind, grouped under
  Bank & UPI in the filter.
- **Autopay vs UPI** — SMS-sync may set `autopay`; Add-Transaction only ever
  produces `upi` or `card`. Both are valid; the tag reflects whatever is stored.
