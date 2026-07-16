# Slice E — Home Widgets (Bills due + Upcoming subscriptions)

**Date:** 2026-07-11
**Branch:** `feat/riddhi-build`
**Status:** Design approved; ready for plan.

The final money-management slice. Two read-only Home-screen sections surface money
coming due: **Bills due** (credit-card statement bills) and **Upcoming subscriptions**
(renewals in the next ~35 days). Each renders only when it has content. Card data
comes from a new backend aggregate endpoint; subscription data reuses the already-built
`GET /subscriptions` summary. No data-model changes, no migration.

## 1. Goals & non-goals

**Goals**
- Surface unpaid credit-card statement bills across all cards on Home, sorted soonest-first.
- Surface upcoming subscription renewals on Home, joined to their display name/icon.
- Reuse existing pure logic (`computeCardSummary`, `computeSubscriptionSummary`) — no new
  business rules, only aggregation + presentation.
- Keep a quiet Home quiet: a section (header included) is omitted entirely when empty.

**Non-goals**
- No new data model, entity, column, or migration.
- No write actions from the widgets (pay-bill/cancel live on their detail screens already).
- No combined/merged "due soon" list — two distinct sections routing to two destinations.
- No changes to budgets, reports, CSV, or SMS/statement sync (read-only composition).

## 2. Backend — card-bills aggregate endpoint

### Route
`GET /accounts/cards/due` on the existing `CreditCardController` (`@Controller('accounts')`).
Safe against the `:id` param routes because `:id` is guarded by `ParseUUIDPipe` (the literal
`cards` cannot be captured as a UUID) — same precedent as `GET /accounts/net-worth`.

### Behavior
1. Load the current user's credit accounts (`account.type === 'credit'`) plus their
   `credit_card` rows (accounts with no `credit_card` row are skipped — legacy, unconfigured).
2. For each, run the existing pure `computeCardSummary(config, txns, today)` — identical
   math to `GET /accounts/:id/card`.
3. Shape each into `{ account, bill }` where `bill = { billed, minDue, dueDate, daysUntilDue, hasBill }`.
4. **Filter** to cards with a real outstanding bill: `hasBill && billed > 0`.
5. **Sort** ascending by `daysUntilDue` (soonest first).

`account` reuses the same Account DTO the accounts endpoints already return (so the mobile
widget can pass it straight to the `card-detail` screen, which expects `entry.data` to be
an `Account`).

### Response shape
```ts
interface CardBillDue {
  account: Account;              // existing Account DTO (id, name, type, last4/network/color, …)
  bill: {
    billed: number;             // statement outstanding (post-payment)
    minDue: number;
    dueDate: string;            // YYYY-MM-DD
    daysUntilDue: number;
    hasBill: boolean;           // always true in this list (filtered), kept for shape parity
  };
}
// GET /accounts/cards/due -> CardBillDue[]
```

### Decomposition
- **Pure helper** `card-bills-due.ts` (`buildCardBillsDue(cards, today)` where each input is
  `{ account, config, txns }`): runs `computeCardSummary`, filters `hasBill && billed > 0`,
  sorts by `daysUntilDue`. RN/Nest-free, fully unit-tested.
- **Service method** on the credit-card service assembles inputs (loads accounts + card rows +
  cycle transactions) and delegates to the helper.
- **Controller** `@Get('cards/due')` with `@CurrentUser()` scoping.

### Tests
- `card-bills-due.spec.ts`: filters out `hasBill=false` and `billed<=0`; keeps and sorts a
  mix by `daysUntilDue`; empty in → empty out.
- Controller spec: route resolves, DI wired, userId-scoped, returns helper output.

## 3. Mobile — API layer

- **Wire type** `ApiCardBillDue` (mirrors the backend response) in `types.ts`.
- **View type** `CardBillView` (account + display-ready bill fields) in the cards view types.
- **Adapter** `toCardBillView` in `adapters.ts` (pure; no dup of existing card mappers).
- **`api.cards.dueSummary()`** → `GET /accounts/cards/due` → `CardBillView[]`.
- **Subscriptions**: reuse `api.subscriptions.list()` → `SubListView`. A pure helper
  `upcomingSubRows(list, cap = 4)` joins `summary.upcoming[]` (which carries only `subId`,
  `inDays`, `nextRenewalDate`, `amount`) to each `SubView` for `name`/`emoji`/`color`,
  drops any `subId` with no matching sub, and caps to the first `cap` (already sorted
  soonest-first by the summary). Returns `UpcomingSubRow[]`.

### Tests (ts-jest pure-logic harness)
- `toCardBillView` maps wire→view faithfully.
- `upcomingSubRows` joins by `subId`, preserves order, caps at 4, drops unmatched ids,
  returns `[]` for an empty upcoming list.

## 4. Mobile — Home sections

Placement: **directly under the hero (safe-to-spend), before "This week"** — obligations
first. Order: **Bills due**, then **Upcoming subscriptions**.

Each section:
- A `<Label>` header with a right-side action:
  - Bills due → `action="Cards →"` → `nav('accounts')`.
  - Upcoming → `action="See all →"` → `nav('subscriptions')`.
- A `LiquidGlass` card containing the rows, wrapped in `SpringIn` continuing the existing
  stagger (delays after the sync banner / before "This week").
- Fetched via `useApiData` with stable module-level empty-array fallbacks.
- **Omitted entirely (header + card) when its list is empty** — no empty placeholder.
- All ₹ amounts pass through the existing `hideBalances` mask (`masked(...)`).
- Both refetches join `refetchAll`; both feed the existing `showRetry` banner condition
  (error && still-on-empty-fallback).

**Bills-due row**
- Left: card name + `••1234` last4.
- Right: amount = `billed` (statement outstanding).
- Subtitle: `Min ₹X · Due in Nd` (or `Due <Mon D>` when `daysUntilDue` is large/negative).
- Tap → `push({ kind: 'card-detail', data: row.account })`.

**Upcoming-sub row**
- Left: icon (`AppIconBox`/emoji from the sub) + name.
- Right: amount.
- Subtitle: `in Nd` or the renewal date.
- Tap → `nav('subscriptions')`.

RN components are verified by `tsc` (the jest-expo harness is blocked on this repo).

## 5. Cross-module consistency (standing user directive)

These are read-only view widgets composing already-consistent data:
- **Munshi (ai-chat):** already surfaces card dues (Slice B snapshot) + subscription burn/
  renewals (Slice D). No change.
- **SMS-sync / statement-import / receipts:** unaffected — no writes.
- **Budgets / reports / insights:** unaffected — no data model or category change.
- **CSV export:** unaffected.
- **Notifications:** renewal reminders already exist (Slice D cron). No change.

No new sync surface is introduced by this slice; it is purely a read-composition over
Slices B and D.

## 6. Edge cases

- **No credit cards / no card rows:** endpoint returns `[]`; Bills-due section hidden.
- **Card with nothing owed** (`billed <= 0` or `hasBill=false`): omitted server-side.
- **No subscriptions / none upcoming:** `upcoming` empty; Upcoming section hidden.
- **`hideBalances` on:** amounts masked in both sections (subtitles too).
- **Overdue bill** (`daysUntilDue < 0`): still shown (soonest-first sort places it top);
  subtitle reads the date rather than "in Nd".
- **Transient load error:** section stays on its empty fallback and the existing top
  retry banner appears (no per-section error wall).

## 7. Testing summary

- **Backend:** `card-bills-due.spec.ts` (filter + sort + empty) and a controller spec
  (route/DI/userId scoping). Full backend jest stays green.
- **Mobile:** pure adapter + `upcomingSubRows` helper specs in the ts-jest harness; RN
  Home changes verified via `tsc --noEmit` (0 errors).

## 8. Out of scope / deferred

- Combined chronological "due soon" list (explicitly rejected — two destinations).
- Any write action from Home widgets.
- Per-section inline error states (reuses the screen-level retry banner).
