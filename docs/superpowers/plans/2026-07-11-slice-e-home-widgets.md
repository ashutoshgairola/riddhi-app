# Slice E — Home Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two read-only Home-screen sections — "Bills due" (credit-card statement bills) and "Upcoming subscriptions" (renewals in the next ~35 days) — each hidden when empty.

**Architecture:** A new backend aggregate endpoint `GET /accounts/cards/due` reuses the pure `computeCardSummary` to return each credit account's outstanding bill, filtered/sorted by a pure helper. The mobile client adds `api.cards.dueSummary()` + a pure `upcomingSubRows` join over the existing `GET /subscriptions` summary, then renders two `LiquidGlass` sections on Home under the hero.

**Tech Stack:** NestJS + TypeORM (backend jest), Expo/React Native (mobile ts-jest pure-logic harness; RN components verified by `tsc`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-11-slice-e-home-widgets-design.md`. Every task's requirements implicitly include it.
- Branch `feat/riddhi-build` is SHARED and parallel-hot. Stage EXACT paths only — never `git add -A`. Never commit `mobile/.env` or `.superpowers/`.
- Commit author email `gairola.ashutosh26@gmail.com`, NO Co-Authored-By trailer, `--no-verify`:
  `git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "..."`.
- Backend DB uses `synchronize: true` — no migration needed (this slice adds no columns anyway).
- No data-model changes. Read-only endpoints only. No changes to budgets/reports/CSV/SMS/receipts.
- Munshi persona is "Munshi" (never "Riddhi").
- Do NOT touch `mobile/tsconfig.json`. Watch for case-collision `tsc` errors (`.tsx` vs `.ts` of same basename).
- Backend baseline: `cd backend && npx jest` = 302 green; `npx tsc --noEmit` clean except ONE pre-existing `auth/auth.service.spec.ts` error (not ours). Mobile: `cd mobile && npx tsc --noEmit` = 0 errors; run mobile jest FOCUSED (full suite has a pre-existing failing `src/theme/tokens.spec.ts`).

---

### Task 1: Backend — card-bills-due pure helper

**Files:**
- Create: `backend/src/credit-card/card-bills-due.ts`
- Test: `backend/src/credit-card/card-bills-due.spec.ts`

**Interfaces:**
- Consumes: `computeCardSummary`, `CardConfig`, `CardTxn` from `./card-summary`.
- Produces:
  - `interface CardBill { billed: number; minDue: number; dueDate: string; daysUntilDue: number; hasBill: boolean }`
  - `interface CardBillInput<A> { account: A; config: CardConfig; balance: number; txns: CardTxn[] }`
  - `interface CardBillDue<A> { account: A; bill: CardBill }`
  - `selectDueBills<A>(cards: CardBillDue<A>[]): CardBillDue<A>[]` — filters `hasBill && billed > 0`, sorts ascending by `daysUntilDue`.
  - `buildCardBillsDue<A>(inputs: CardBillInput<A>[], today: Date): CardBillDue<A>[]` — runs `computeCardSummary` per input, then `selectDueBills`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/credit-card/card-bills-due.spec.ts`:

```ts
import { selectDueBills, buildCardBillsDue, CardBillDue } from './card-bills-due';
import { CardConfig, CardTxn } from './card-summary';

const bill = (over: Partial<CardBillDue<string>['bill']> = {}): CardBillDue<string>['bill'] => ({
  billed: 1000, minDue: 100, dueDate: '2026-07-20', daysUntilDue: 9, hasBill: true, ...over,
});

describe('selectDueBills', () => {
  it('drops cards with no bill and sorts the rest soonest-due first', () => {
    const cards: CardBillDue<string>[] = [
      { account: 'far', bill: bill({ daysUntilDue: 20 }) },
      { account: 'nobill', bill: bill({ billed: 0, hasBill: false, daysUntilDue: 2 }) },
      { account: 'soon', bill: bill({ daysUntilDue: 3 }) },
    ];
    const out = selectDueBills(cards);
    expect(out.map((c) => c.account)).toEqual(['soon', 'far']);
  });

  it('returns [] when nothing has a bill', () => {
    expect(selectDueBills([{ account: 'x', bill: bill({ billed: 0, hasBill: false }) }])).toEqual([]);
  });
});

describe('buildCardBillsDue', () => {
  const config = (over: Partial<CardConfig> = {}): CardConfig => ({
    creditLimit: 100000, statementDay: 1, graceDays: 18,
    statementDate: null, statementBilled: null, statementMinDue: null,
    statementDueDate: null, statementRewards: null, ...over,
  });
  const today = new Date('2026-07-11T00:00:00Z');

  it('includes a card carrying an outstanding balance and excludes a settled one', () => {
    const inputs = [
      { account: 'owes', config: config(), balance: -5000, txns: [] as CardTxn[] },
      { account: 'settled', config: config(), balance: 0, txns: [] as CardTxn[] },
    ];
    const out = buildCardBillsDue(inputs, today);
    expect(out.map((c) => c.account)).toEqual(['owes']);
    expect(out[0].bill.billed).toBe(5000);
    expect(out[0].bill.hasBill).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest card-bills-due`
Expected: FAIL — "Cannot find module './card-bills-due'".

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/credit-card/card-bills-due.ts`:

```ts
import { CardConfig, CardTxn, computeCardSummary } from './card-summary';

export interface CardBill {
  billed: number;
  minDue: number;
  dueDate: string;
  daysUntilDue: number;
  hasBill: boolean;
}

export interface CardBillInput<A> {
  account: A;
  config: CardConfig;
  balance: number;
  txns: CardTxn[];
}

export interface CardBillDue<A> {
  account: A;
  bill: CardBill;
}

/** Keeps only cards with a real outstanding statement bill and sorts them
 * soonest-due first. (`hasBill` is `billed > 0`; both are checked for clarity.) */
export function selectDueBills<A>(cards: CardBillDue<A>[]): CardBillDue<A>[] {
  return cards
    .filter((c) => c.bill.hasBill && c.bill.billed > 0)
    .sort((a, b) => a.bill.daysUntilDue - b.bill.daysUntilDue);
}

/** Runs the existing pure card-summary math per credit account (categories are
 * irrelevant to the bill fields, so an empty map is passed), then filters and
 * sorts via `selectDueBills`. Generic over the account shape — `account` is
 * passed through untouched so the caller can attach any DTO it likes. */
export function buildCardBillsDue<A>(inputs: CardBillInput<A>[], today: Date): CardBillDue<A>[] {
  const summarized: CardBillDue<A>[] = inputs.map((input) => {
    const s = computeCardSummary(input.config, input.balance, input.txns, new Map(), today);
    return {
      account: input.account,
      bill: {
        billed: s.billed,
        minDue: s.minDue,
        dueDate: s.dueDate,
        daysUntilDue: s.daysUntilDue,
        hasBill: s.hasBill,
      },
    };
  });
  return selectDueBills(summarized);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest card-bills-due`
Expected: PASS (2 suites of behavior, 3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/credit-card/card-bills-due.ts backend/src/credit-card/card-bills-due.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): pure card-bills-due helper (filter+sort outstanding bills)"
```

---

### Task 2: Backend — bills-due service method + endpoint

**Files:**
- Modify: `backend/src/credit-card/credit-card.service.ts`
- Modify: `backend/src/credit-card/credit-card.controller.ts`
- Modify: `backend/src/credit-card/credit-card.controller.spec.ts` (or the existing controller spec; create if absent)

**Interfaces:**
- Consumes: `buildCardBillsDue`, `CardBillInput`, `CardBillDue` from `./card-bills-due`; `AccountType` from `../common/enums`; `Account` from `../accounts/account.entity`.
- Produces:
  - `CreditCardService.getBillsDue(userId: string): Promise<CardBillDue<Account>[]>`
  - Route `GET /accounts/cards/due` → `CreditCardController.getBillsDue(user)`.
- Refactor: extract `private loadCardCycle(accountId, userId): Promise<{ swipes: Transaction[]; paymentsIn: Transaction[]; txns: CardTxn[] }>` reused by both `getSummary` and `getBillsDue` (single query per card, no double-fetch). `getSummary` behavior must stay identical (its existing tests still pass).

> ⚠️ `credit-card.service.ts` / `getSummary` may carry concurrent WIP on the shared branch. Re-read the file before editing; keep the `getSummary` refactor minimal and additive.

- [ ] **Step 1: Write the failing controller test**

Add to the credit-card controller spec (`backend/src/credit-card/credit-card.controller.spec.ts`). If the file doesn't exist, create it mirroring the module's other controller specs. Add:

```ts
it('GET /accounts/cards/due returns the user-scoped bills-due list', async () => {
  const rows = [{ account: { id: 'a1' }, bill: { billed: 5000, minDue: 250, dueDate: '2026-07-20', daysUntilDue: 9, hasBill: true } }];
  const service = { getBillsDue: jest.fn(async () => rows) } as any;
  const controller = new CreditCardController(service);
  const result = await controller.getBillsDue({ userId: 'u1', email: 'e' });
  expect(service.getBillsDue).toHaveBeenCalledWith('u1');
  expect(result).toBe(rows);
});
```

(If the spec constructs the controller through the Nest testing module instead of `new`, follow that file's existing pattern — assert the route delegates to `service.getBillsDue(user.userId)`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest credit-card.controller`
Expected: FAIL — `controller.getBillsDue is not a function` (or a TS compile error on the missing method).

- [ ] **Step 3: Implement the service refactor + method**

In `backend/src/credit-card/credit-card.service.ts`:

1. Add imports at the top (near the existing `computeCardSummary` import):
```ts
import { buildCardBillsDue, CardBillInput, CardBillDue } from './card-bills-due';
import { Account } from '../accounts/account.entity';
```

2. Add the shared loader as a private method (place above `getSummary`):
```ts
private async loadCardCycle(
  accountId: string,
  userId: string,
): Promise<{ swipes: Transaction[]; paymentsIn: Transaction[]; txns: CardTxn[] }> {
  const [swipes, paymentsIn] = await Promise.all([
    this.txRepo.find({ where: { userId, accountId, type: TransactionType.EXPENSE } }),
    this.txRepo.find({ where: { userId, destinationAccountId: accountId, type: TransactionType.TRANSFER } }),
  ]);
  const toCardTxn = (t: Transaction, isPaymentIn: boolean): CardTxn => ({
    amount: Math.abs(t.amount),
    date: new Date(t.date).toISOString(),
    type: t.type as CardTxn['type'],
    categoryId: t.categoryId,
    isPaymentIn,
  });
  const txns: CardTxn[] = [
    ...swipes.map((t) => toCardTxn(t, false)),
    ...paymentsIn.map((t) => toCardTxn(t, true)),
  ];
  return { swipes, paymentsIn, txns };
}
```

3. In `getSummary`, REPLACE the existing inline swipes/paymentsIn `Promise.all` + `toCardTxn` + `txns` block with:
```ts
const { swipes, paymentsIn, txns } = await this.loadCardCycle(accountId, userId);
```
(Leave the `ledger` construction from `swipes`/`paymentsIn` and everything below unchanged.)

4. Add the new method (place after `getSummary`):
```ts
/** Home "Bills due" widget: every credit account that still owes a statement
 * bill, soonest-due first. Reuses the same per-card math as getSummary. */
async getBillsDue(userId: string): Promise<CardBillDue<Account>[]> {
  const accounts = (await this.accountsService.findAll(userId)).filter(
    (a) => a.type === AccountType.CREDIT,
  );
  const cards = await this.cardRepo.find({ where: { userId } });
  const cardByAccount = new Map(cards.map((c) => [c.accountId, c]));

  const inputs: CardBillInput<Account>[] = [];
  for (const account of accounts) {
    const card = cardByAccount.get(account.id);
    if (!card) continue; // legacy credit account, not yet configured
    const { txns } = await this.loadCardCycle(account.id, userId);
    inputs.push({
      account,
      config: {
        creditLimit: card.creditLimit,
        statementDay: card.statementDay,
        graceDays: card.graceDays,
        statementDate: card.statementDate,
        statementBilled: card.statementBilled,
        statementMinDue: card.statementMinDue,
        statementDueDate: card.statementDueDate,
        statementRewards: card.statementRewards,
      },
      balance: account.balance,
      txns,
    });
  }
  return buildCardBillsDue(inputs, new Date());
}
```

- [ ] **Step 4: Implement the controller route**

In `backend/src/credit-card/credit-card.controller.ts`, add this method **before** the `@Get(':id/card')` handler (so the literal `cards` segment is matched before the `:id` param — belt-and-suspenders alongside `ParseUUIDPipe`):

```ts
@Get('cards/due')
getBillsDue(@CurrentUser() user: { userId: string; email: string }) {
  return this.creditCardService.getBillsDue(user.userId);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest credit-card`
Expected: PASS — the new controller test passes AND every existing credit-card suite (getSummary/pay/updateConfig) stays green.

- [ ] **Step 6: Full backend gate**

Run: `cd backend && npx jest && npx tsc --noEmit`
Expected: all suites green; `tsc` clean except the one pre-existing `auth/auth.service.spec.ts` error.

- [ ] **Step 7: Commit**

```bash
git add backend/src/credit-card/credit-card.service.ts backend/src/credit-card/credit-card.controller.ts backend/src/credit-card/credit-card.controller.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): GET /accounts/cards/due bills-due aggregate endpoint"
```

---

### Task 3: Mobile — API layer (cards.dueSummary + upcomingSubRows)

**Files:**
- Modify: `mobile/src/api/types.ts` (add `ApiCardBillDue`, `CardBillView`)
- Modify: `mobile/src/api/adapters.ts` (add `toCardBillView`)
- Modify: `mobile/src/api/index.ts` (add `api.cards.dueSummary`)
- Modify: `mobile/src/api/subscriptions.ts` (add `UpcomingSubRow`, `upcomingSubRows`)
- Modify: `mobile/src/api/cardAdapter.spec.ts` (test `toCardBillView`)
- Modify: `mobile/src/api/subscriptions.spec.ts` (test `upcomingSubRows`)

**Interfaces:**
- Consumes: `ApiAccount`, `AccountView` (types.ts); `toAccountView` (adapters.ts); `ACCOUNT_GRADIENTS` (index.ts, module-private); `SubListView`, `SubView` (subscriptions.ts).
- Produces:
  - `interface ApiCardBillDue { account: ApiAccount; bill: { billed: number; minDue: number; dueDate: string; daysUntilDue: number; hasBill: boolean } }`
  - `interface CardBillView { account: AccountView; billed: number; minDue: number; dueDate: string; daysUntilDue: number }`
  - `toCardBillView(account: AccountView, bill: ApiCardBillDue['bill']): CardBillView`
  - `api.cards.dueSummary(): Promise<CardBillView[]>` → `GET /accounts/cards/due`
  - `interface UpcomingSubRow { subId: string; name: string; emoji: string; color: string; amount: number; inDays: number; nextRenewalDate: string }`
  - `upcomingSubRows(list: SubListView, cap?: number): UpcomingSubRow[]`

- [ ] **Step 1: Write the failing pure-logic tests**

Add to `mobile/src/api/subscriptions.spec.ts`:

```ts
import { upcomingSubRows, SubListView } from './subscriptions';

describe('upcomingSubRows', () => {
  const list: SubListView = {
    monthlyBurn: 0, yearlyProjection: 0, activeCount: 2, flags: [],
    upcoming: [
      { subId: 's1', nextRenewalDate: '2026-07-14', inDays: 3, amount: 649 },
      { subId: 's2', nextRenewalDate: '2026-07-20', inDays: 9, amount: 149 },
      { subId: 'gone', nextRenewalDate: '2026-07-25', inDays: 14, amount: 99 },
    ],
    subscriptions: [
      { id: 's1', name: 'Netflix', emoji: '🎬', color: '#c97d8c', amount: 649, cycle: 'monthly', status: 'active', nextRenewalDate: '2026-07-14', firstSeenDate: '2025-01-01', priceHistory: null, accountId: null, paymentMethod: null },
      { id: 's2', name: 'Spotify', emoji: '🎧', color: '#5fbf77', amount: 149, cycle: 'monthly', status: 'active', nextRenewalDate: '2026-07-20', firstSeenDate: '2025-01-01', priceHistory: null, accountId: null, paymentMethod: null },
    ],
  };

  it('joins upcoming items to their subscription and preserves order', () => {
    const rows = upcomingSubRows(list);
    expect(rows.map((r) => r.name)).toEqual(['Netflix', 'Spotify']);
    expect(rows[0]).toMatchObject({ subId: 's1', emoji: '🎬', color: '#c97d8c', amount: 649, inDays: 3 });
  });

  it('drops upcoming items whose subscription is missing', () => {
    const rows = upcomingSubRows(list);
    expect(rows.find((r) => r.subId === 'gone')).toBeUndefined();
  });

  it('caps the number of rows', () => {
    expect(upcomingSubRows(list, 1).map((r) => r.name)).toEqual(['Netflix']);
  });

  it('returns [] when nothing is upcoming', () => {
    expect(upcomingSubRows({ ...list, upcoming: [] })).toEqual([]);
  });
});
```

Add to `mobile/src/api/cardAdapter.spec.ts`:

```ts
import { toCardBillView } from './adapters';
import { AccountView } from './types';

describe('toCardBillView', () => {
  it('passes the account through and maps the bill fields', () => {
    const account = { id: 'a1', name: 'HDFC', type: 'credit', sub: 'Credit card', bal: -5000, gradient: ['#1', '#2'], logo: 'H', bank: 'HDFC', change: 0 } as AccountView;
    const view = toCardBillView(account, { billed: 5000, minDue: 250, dueDate: '2026-07-20', daysUntilDue: 9, hasBill: true });
    expect(view).toEqual({ account, billed: 5000, minDue: 250, dueDate: '2026-07-20', daysUntilDue: 9 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && npx jest api/subscriptions api/cardAdapter`
Expected: FAIL — `upcomingSubRows`/`toCardBillView` are not exported.

- [ ] **Step 3: Add the wire + view types**

In `mobile/src/api/types.ts`, near `ApiCardSummary` / `CardSummaryView`:

```ts
export interface ApiCardBillDue {
  account: ApiAccount;
  bill: {
    billed: number;
    minDue: number;
    dueDate: string;
    daysUntilDue: number;
    hasBill: boolean;
  };
}

/** Home "Bills due" row: the full account (for card-detail navigation) plus
 * the outstanding-bill figures. */
export interface CardBillView {
  account: AccountView;
  billed: number;
  minDue: number;
  dueDate: string;
  daysUntilDue: number;
}
```

- [ ] **Step 4: Add the adapter**

In `mobile/src/api/adapters.ts`, add the `ApiCardBillDue` / `CardBillView` names to the existing type imports from `./types`, then add:

```ts
/** Maps a bills-due wire item onto an already-mapped AccountView. The account
 * mapping (gradient/logo) is done by the caller via `toAccountView`, so this
 * stays a pure field pick. */
export function toCardBillView(account: AccountView, bill: ApiCardBillDue['bill']): CardBillView {
  return {
    account,
    billed: bill.billed,
    minDue: bill.minDue,
    dueDate: bill.dueDate,
    daysUntilDue: bill.daysUntilDue,
  };
}
```

- [ ] **Step 5: Add the `upcomingSubRows` helper**

In `mobile/src/api/subscriptions.ts`, after `mapSubList`:

```ts
export interface UpcomingSubRow {
  subId: string;
  name: string;
  emoji: string;
  color: string;
  amount: number;
  inDays: number;
  nextRenewalDate: string;
}

/** Joins the summary's `upcoming` items (which carry only `subId`) to their
 * subscription for display, drops any whose sub is missing, and caps the list.
 * `upcoming` is already sorted soonest-first by the backend summary. */
export function upcomingSubRows(list: SubListView, cap = 4): UpcomingSubRow[] {
  const byId = new Map(list.subscriptions.map((s) => [s.id, s]));
  const rows: UpcomingSubRow[] = [];
  for (const u of list.upcoming) {
    const s = byId.get(u.subId);
    if (!s) continue;
    rows.push({
      subId: u.subId,
      name: s.name,
      emoji: s.emoji,
      color: s.color,
      amount: u.amount,
      inDays: u.inDays,
      nextRenewalDate: u.nextRenewalDate,
    });
  }
  return rows.slice(0, cap);
}
```

- [ ] **Step 6: Add `api.cards.dueSummary`**

In `mobile/src/api/index.ts`, inside the `cards: { ... }` block (after `get`), add:

```ts
async dueSummary(): Promise<CardBillView[]> {
  const raw = await apiClient.get<ApiCardBillDue[]>('/accounts/cards/due');
  return raw.map((item) =>
    toCardBillView(
      toAccountView(item.account, ACCOUNT_GRADIENTS['credit'] ?? ACCOUNT_GRADIENTS['other'], 0),
      item.bill,
    ),
  );
}
```

Ensure `ApiCardBillDue`, `CardBillView` are imported from `./types` and `toCardBillView` from `./adapters` at the top of `index.ts` (add to the existing import lists). Also export `CardBillView` from the api barrel if the file re-exports view types (follow the existing `CardSummaryView` export pattern).

- [ ] **Step 7: Run tests + tsc to verify green**

Run: `cd mobile && npx jest api/subscriptions api/cardAdapter && npx tsc --noEmit`
Expected: all listed specs PASS; `tsc` reports 0 errors.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/api/types.ts mobile/src/api/adapters.ts mobile/src/api/index.ts mobile/src/api/subscriptions.ts mobile/src/api/cardAdapter.spec.ts mobile/src/api/subscriptions.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(mobile): api.cards.dueSummary + upcomingSubRows join helper"
```

---

### Task 4: Mobile — Home "Bills due" + "Upcoming subscriptions" sections

**Files:**
- Modify: `mobile/src/screens/Home.tsx`

**Interfaces:**
- Consumes: `api.cards.dueSummary` → `CardBillView[]`; `api.subscriptions.list` + `upcomingSubRows` → `UpcomingSubRow[]`; existing Home helpers `Label`, `SpringIn`, `LiquidGlass`, `useApiData`, `masked`, `fmt`, `nav`, `push`, `AppIconBox`; `radius` tokens.
- Produces: two new local components rendered on Home; two new `useApiData` queries folded into `refetchAll` + `showRetry`.

> ⚠️ `Home.tsx` is parallel-hot (liquid-glass / icon WIP). Re-read the current file before editing. Match the existing section idiom (`<Label>` + `<SpringIn>` + `<LiquidGlass>`).

- [ ] **Step 1: Add module-level empty fallbacks**

Near the existing `EMPTY_RECENT` / `EMPTY_NOTIFS` constants in `Home.tsx`:

```ts
const EMPTY_BILLS: CardBillView[] = [];
const EMPTY_UPCOMING: UpcomingSubRow[] = [];
```

Add imports: `import { CardBillView, UpcomingSubRow, upcomingSubRows } from "../api";` (or the exact barrel paths the file already uses for `api` types — follow existing import lines; `upcomingSubRows` lives in `../api/subscriptions`, re-exported by the barrel).

- [ ] **Step 2: Add the two queries + wire into refetch/retry**

Inside `Home()`, next to the existing `useApiData` calls:

```ts
const {
  data: bills,
  error: billsError,
  refetch: refetchBills,
} = useApiData(() => api.cards.dueSummary(), EMPTY_BILLS);
const {
  data: subList,
  error: subsError,
  refetch: refetchSubs,
} = useApiData(() => api.subscriptions.list(), null);
const upcoming = subList ? upcomingSubRows(subList) : EMPTY_UPCOMING;
```

Add `refetchBills(); refetchSubs();` to the `refetchAll` body. Add to `showRetry`:

```ts
(Boolean(billsError) && bills === EMPTY_BILLS) ||
(Boolean(subsError) && subList === null) ||
```

- [ ] **Step 3: Add the two section components**

Add these local components in `Home.tsx` (near `RecentRow`). Reuse `styles` where sensible; add minimal new styles to the `StyleSheet`:

```tsx
function BillsDueSection({
  bills,
  hide,
  onOpen,
}: {
  bills: CardBillView[];
  hide: boolean;
  onOpen: (b: CardBillView) => void;
}) {
  const { t } = useTheme();
  if (bills.length === 0) return null;
  return (
    <>
      <Label>Bills due</Label>
      <SpringIn delay={40} style={styles.recentList}>
        {bills.map((b) => (
          <Pressable key={String(b.account.id)} onPress={() => onOpen(b)}>
            <View style={styles.dueRow}>
              <View style={styles.dueRowMain}>
                <Text style={[styles.dueTitle, { color: t.text1, fontFamily: weight(700) }]}>
                  {b.account.name}
                </Text>
                <Text style={[styles.dueSub, { color: t.text3, fontFamily: weight(500) }]}>
                  {`Min ${hide ? MASKED_AMOUNT : fmt(b.minDue)} · ${dueLabel(b.daysUntilDue, b.dueDate)}`}
                </Text>
              </View>
              <Text style={[styles.dueAmount, { color: t.text1, fontFamily: weight(800) }]}>
                {hide ? MASKED_AMOUNT : fmt(b.billed)}
              </Text>
            </View>
          </Pressable>
        ))}
      </SpringIn>
    </>
  );
}

function UpcomingSubsSection({
  rows,
  hide,
  onSeeAll,
}: {
  rows: UpcomingSubRow[];
  hide: boolean;
  onSeeAll: () => void;
}) {
  const { t } = useTheme();
  if (rows.length === 0) return null;
  return (
    <>
      <Label action="See all →" onAction={onSeeAll}>
        Upcoming subscriptions
      </Label>
      <SpringIn delay={50} style={styles.recentList}>
        {rows.map((r) => (
          <Pressable key={r.subId} onPress={onSeeAll}>
            <View style={styles.dueRow}>
              <AppIconBox value={r.emoji} color={r.color} size={42} iconSize={19} />
              <View style={[styles.dueRowMain, { marginLeft: 12 }]}>
                <Text style={[styles.dueTitle, { color: t.text1, fontFamily: weight(700) }]}>
                  {r.name}
                </Text>
                <Text style={[styles.dueSub, { color: t.text3, fontFamily: weight(500) }]}>
                  {dueLabel(r.inDays, r.nextRenewalDate)}
                </Text>
              </View>
              <Text style={[styles.dueAmount, { color: t.text1, fontFamily: weight(800) }]}>
                {hide ? MASKED_AMOUNT : fmt(r.amount)}
              </Text>
            </View>
          </Pressable>
        ))}
      </SpringIn>
    </>
  );
}
```

Add a small date-label helper near `fmt` in `Home.tsx`:

```ts
/** "Due in 3d" / "Renews today" style label; falls back to a short date when
 * the day count is large or the renewal has slipped past. */
function dueLabel(inDays: number, isoDate: string): string {
  if (inDays < 0 || inDays > 30) {
    return new Date(isoDate + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }
  if (inDays === 0) return "Due today";
  return `Due in ${inDays}d`;
}
```

Add styles to the `StyleSheet.create({...})` block:

```ts
dueRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14 },
dueRowMain: { flex: 1 },
dueTitle: { fontSize: 15 },
dueSub: { fontSize: 12.5, marginTop: 2 },
dueAmount: { fontSize: 15 },
```

- [ ] **Step 4: Render the sections under the hero**

In the Home JSX, immediately AFTER the hero `SpringIn`/`</SpringIn>` block and BEFORE the sync banner (or, if placement reads better after the sync banner, keep it directly before the "This week" `<Label>` — match whichever keeps the visual rhythm), insert:

```tsx
<BillsDueSection bills={bills} hide={hide} onOpen={(b) => push({ kind: "card-detail", data: b.account })} />
<UpcomingSubsSection rows={upcoming} hide={hide} onSeeAll={() => nav("subscriptions")} />
```

Confirm `push` is destructured from `useNav()` in `Home` (add it if only `nav` is currently pulled).

- [ ] **Step 5: Verify tsc (RN components are tsc-verified, jest-expo is blocked)**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors. (No case-collision — no new file basenames introduced.)

- [ ] **Step 6: Re-run the focused mobile pure specs**

Run: `cd mobile && npx jest api/subscriptions api/cardAdapter`
Expected: still green (no regressions from the Home wiring).

- [ ] **Step 7: Commit**

```bash
git add mobile/src/screens/Home.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(mobile): Home bills-due + upcoming-subscriptions widgets"
```

---

## Self-Review

**Spec coverage:**
- §2 aggregate endpoint (route, filter `hasBill && billed>0`, sort by `daysUntilDue`, `computeCardSummary` reuse, pure helper) → Tasks 1 + 2. ✓
- §3 mobile API (`ApiCardBillDue`, `CardBillView`, `toCardBillView`, `api.cards.dueSummary`, `upcomingSubRows` join + cap 4) → Task 3. ✓
- §4 Home sections (placement under hero, `<Label>`+`LiquidGlass`, hide-when-empty, `hideBalances` mask, `refetchAll`/`showRetry`, row tap targets → card-detail / subscriptions) → Task 4. ✓
- §5 cross-module consistency (read-only, no new sync surface) → no task needed; asserted in spec. ✓
- §6 edge cases (no cards → `[]`; nothing owed → filtered; nothing upcoming → hidden; `hideBalances`; overdue shows date; transient error → retry banner) → covered by Task 1 filter tests, Task 3 empty-list test, Task 4 hide-when-empty + `dueLabel` fallback + `showRetry`. ✓
- §7 testing (backend helper + controller specs; mobile pure specs; RN via tsc) → Tasks 1–4. ✓

**Placeholder scan:** No TBD/TODO; every code step carries full code. ✓

**Type consistency:** `CardBillDue<A>` / `CardBill` / `CardBillInput<A>` (Task 1) reused verbatim in Task 2. `ApiCardBillDue.bill` shape (Task 3 wire) matches the backend `CardBill` fields (Task 1). `CardBillView` (Task 3) consumed in Task 4. `UpcomingSubRow` (Task 3) consumed in Task 4. `getBillsDue(userId)` signature consistent across service + controller + test. ✓

**Note on `dueLabel` reuse:** defined once in `Home.tsx` (Task 4) and used by both sections — no duplication.
