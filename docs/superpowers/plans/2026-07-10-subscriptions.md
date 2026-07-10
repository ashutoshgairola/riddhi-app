# Slice D — Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-detect subscriptions from recurring debits already in Riddhi, let the user confirm them into persisted rows, and surface monthly burn / yearly projection / upcoming-renewal timeline / price-hike + renewal-soon + possibly-forgotten flags / pause-cancel-remind — with live renewal reminders through the existing notifications module.

**Architecture:** New backend `subscriptions/` module mirroring `credit-card/` (entity + pure compute fns with specs + service + controller + module + dtos). Detection is a pure deterministic function (`detect-subscriptions.ts`); the summary/flags are a pure function (`subscription-summary.ts`); naming is catalog-first with an optional injected LLM fallback for display polish only. Mobile ports `project/riddhi/MobileSubs.jsx` and consumes a new `api.subscriptions` surface. Reminders piggyback on `notifications.scheduler.ts`.

**Tech Stack:** NestJS + TypeORM (`synchronize: true`, no migrations), real jest (TDD). Expo/React Native mobile with a ts-jest pure-logic harness; RN screens verified by `npx tsc --noEmit`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-10-subscriptions-design.md`. Every task's requirements implicitly include it.
- Backend uses `synchronize: true` → new entities and nullable columns need **NO migration**.
- Detection judgment is **100% deterministic**; the LLM is consulted only for display name/emoji on unknown descriptors, behind an injected function, with graceful fallback. LLM never decides "is this a subscription."
- **Hard exclusions:** NO Gmail parsing, NO Google Play API. Investment SIPs excluded from detection.
- Chatbot persona is **Munshi** (never rename to Riddhi).
- Commit prefs: author `gairola.ashutosh26@gmail.com`; **NO Co-Authored-By trailer**; `docs/` is gitignored → force-add specs/plans. Commit with `git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify`. NEVER `git add -A` — stage exact paths only (the tree has heavy uncommitted parallel WIP). Never commit `mobile/.env` or anything under `.superpowers/`.
- Do NOT touch `mobile/tsconfig.json`.
- Money columns use the shared numeric transformer pattern (see `credit-card.entity.ts` `num`).

## File Structure

**Backend (`backend/src/subscriptions/`):**
- `subscription.entity.ts` — the `Subscription` TypeORM entity.
- `detect-subscriptions.ts` + `.spec.ts` — pure detection (grouping/cadence/amount/hike).
- `subscription-summary.ts` + `.spec.ts` — pure burn/projection/upcoming/flags.
- `subscription-catalog.ts` — deterministic merchant → name/emoji/color map + `resolveName`.
- `subscriptions.service.ts` + `.spec.ts` — orchestration (detect, confirm, list, patch, delete, ignore-list, reverse-linking).
- `subscriptions.controller.ts` — REST endpoints.
- `subscriptions.module.ts` — module wiring.
- `dto/create-subscription.dto.ts`, `dto/update-subscription.dto.ts`, `dto/dismiss-candidate.dto.ts`.
- `subscription-ignore.entity.ts` — persisted per-descriptor dismiss list.

**Backend edits:**
- `transactions/transaction.entity.ts` — add nullable `subscriptionId`.
- `common/enums.ts` — add `NotificationType.SUBSCRIPTION_RENEWAL`.
- `app.module.ts` — register `SubscriptionsModule`.
- `notifications/notifications.scheduler.ts` (+ module) — daily renewal-reminder pass.
- `ai-chat/tools/subscriptions.tools.ts` (+ `tools/index.ts`, `tools/types.ts`, `ai-chat.service.ts`) — Munshi `list_subscriptions` tool.
- `sms-sync` + `statements` import paths — attribute newly created recurring charges to existing subs (reverse-linking).

**Mobile (`mobile/src/`):**
- `api/subscriptions.ts` + `.spec.ts` — `api.subscriptions` surface + adapters.
- `screens/subscriptions.ts` + `.spec.ts` — pure view helpers (candidate mapping, formatting).
- `screens/Subscriptions.tsx` — main screen (burn hero, flags, upcoming, list, tabs).
- `screens/SubDetailSheet.tsx` — detail sheet (pause/resume/remind/cancel).
- `screens/SubscriptionsReview.tsx` — detection review + manual add + dismiss.
- `app/screens.tsx` + `app/navContext.tsx` — register `'subscriptions'` + `'subscriptions-review'` screen kinds.

---

## Task 1: Subscription entity + Transaction.subscriptionId + module scaffold

**Files:**
- Create: `backend/src/subscriptions/subscription.entity.ts`
- Create: `backend/src/subscriptions/subscription-ignore.entity.ts`
- Create: `backend/src/subscriptions/subscriptions.module.ts`
- Modify: `backend/src/transactions/transaction.entity.ts` (add `subscriptionId`)
- Modify: `backend/src/app.module.ts` (register module)

**Interfaces:**
- Produces: `Subscription` entity (table `subscription`), `SubscriptionIgnore` entity (table `subscription_ignore`), `SubscriptionsModule`. `Transaction.subscriptionId: string | null`.

- [ ] **Step 1: Create the `Subscription` entity**

```ts
// backend/src/subscriptions/subscription.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { Account } from '../accounts/account.entity';
import { User } from '../users/user.entity';
import { PaymentMethod } from '../common/enums';

const num = {
  type: 'numeric' as const, precision: 18, scale: 2,
  transformer: { to: (v: number) => v, from: (v: string | null) => (v == null ? null : parseFloat(v)) },
};

export type SubscriptionCycle = 'monthly' | 'yearly';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';
export interface PriceHistoryEntry { amount: number; since: string }

@Entity('subscription')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 200 })
  merchantDescriptor: string;

  @Column({ type: 'varchar', length: 16, default: '🔁' })
  emoji: string;

  @Column({ type: 'varchar', length: 20, default: '#a78bfa' })
  color: string;

  @Column({ ...num, default: 0 })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'monthly' })
  cycle: SubscriptionCycle;

  @Column({ type: 'date' })
  nextRenewalDate: string;

  @Column({ type: 'date' })
  firstSeenDate: string;

  @Column({ type: 'varchar', length: 10, default: 'active' })
  status: SubscriptionStatus;

  @Column({ type: 'uuid', nullable: true })
  accountId: string | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'accountId' })
  account: Account | null;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod: PaymentMethod | null;

  @Column({ type: 'uuid', nullable: true })
  categoryId: string | null;

  @Column({ type: 'int', nullable: true })
  reminderDays: number | null;

  @Column({ type: 'jsonb', nullable: true })
  priceHistory: PriceHistoryEntry[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  detailOpenedAt: Date | null;

  @Column({ type: 'date', nullable: true })
  lastReminderSentFor: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Create the `SubscriptionIgnore` entity** (persisted dismiss list)

```ts
// backend/src/subscriptions/subscription-ignore.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

@Entity('subscription_ignore')
@Index(['userId', 'merchantDescriptor'], { unique: true })
export class SubscriptionIgnore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 200 })
  merchantDescriptor: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 3: Add `subscriptionId` to the Transaction entity**

In `backend/src/transactions/transaction.entity.ts`, after the `importFingerprint` column (around line 99), add:

```ts
  /** Set when this transaction is a charge for a confirmed Subscription
   * (subscriptions/subscription.entity.ts). Null for everything else. */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  subscriptionId: string | null;
```

- [ ] **Step 4: Create the module (empty for now, entities registered)**

```ts
// backend/src/subscriptions/subscriptions.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from './subscription.entity';
import { SubscriptionIgnore } from './subscription-ignore.entity';
import { Transaction } from '../transactions/transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, SubscriptionIgnore, Transaction])],
})
export class SubscriptionsModule {}
```

- [ ] **Step 5: Register the module in `app.module.ts`**

Add the import near the other module imports (after the `StatementsModule` import, line ~26):

```ts
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
```

And add `SubscriptionsModule,` to the `imports:` array (after `StatementsModule,`).

- [ ] **Step 6: Verify it compiles and the app boots**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep -v "auth.service.spec.ts" | grep "subscriptions\|transaction.entity\|app.module"`
Expected: no output (the only pre-existing tsc error is in `auth.service.spec.ts`, unrelated).

Run: `cd backend && npx jest 2>&1 | tail -4`
Expected: still `232 passed` (nothing broken; new entities don't affect existing suites).

- [ ] **Step 7: Commit**

```bash
git add backend/src/subscriptions/subscription.entity.ts backend/src/subscriptions/subscription-ignore.entity.ts backend/src/subscriptions/subscriptions.module.ts backend/src/transactions/transaction.entity.ts backend/src/app.module.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): subscription entity + Transaction.subscriptionId + module scaffold"
```

---

## Task 2: Pure detection — `detect-subscriptions.ts`

**Files:**
- Create: `backend/src/subscriptions/detect-subscriptions.ts`
- Test: `backend/src/subscriptions/detect-subscriptions.spec.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `normalizeDescriptor(desc: string): string`
  - `addCycle(isoDate: string, cycle: 'monthly' | 'yearly'): string`
  - `detectSubscriptions(txns: DetectTxn[], ignoredOrExisting: Set<string>, today: Date): SubscriptionCandidate[]`
  - types `DetectTxn`, `SubscriptionCandidate`, `PriceHistoryEntry` (re-export from entity).

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/subscriptions/detect-subscriptions.spec.ts
import { detectSubscriptions, normalizeDescriptor, DetectTxn } from './detect-subscriptions';

const tx = (over: Partial<DetectTxn>): DetectTxn => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-01-01',
  description: 'NETFLIX.COM',
  amount: 649,
  categoryId: 'cat-ent',
  categoryName: 'Entertainment',
  accountId: 'acc-1',
  paymentMethod: 'card',
  isRecurring: false,
  ...over,
});

describe('normalizeDescriptor', () => {
  it('strips ref numbers/case/whitespace so variants collapse', () => {
    expect(normalizeDescriptor('NETFLIX.COM 12345')).toBe(normalizeDescriptor('netflix.com  billdesk'));
  });
});

describe('detectSubscriptions', () => {
  const today = new Date('2026-05-01T00:00:00Z');

  it('detects a monthly subscription from 3 regular charges', () => {
    const txns = [
      tx({ date: '2026-02-02', amount: 649 }),
      tx({ date: '2026-03-02', amount: 649 }),
      tx({ date: '2026-04-02', amount: 649 }),
    ];
    const [c] = detectSubscriptions(txns, new Set(), today);
    expect(c.cycle).toBe('monthly');
    expect(c.amount).toBe(649);
    expect(c.occurrences).toBe(3);
    expect(c.firstSeenDate).toBe('2026-02-02');
    expect(c.nextRenewalDate).toBe('2026-05-02');
    expect(c.transactionIds).toHaveLength(3);
  });

  it('keeps a yearly price hike as ONE stream (autopay renewal) and records the hike', () => {
    const txns = [
      tx({ description: 'AMAZON PRIME', amount: 999, date: '2024-09-14', paymentMethod: 'autopay' }),
      tx({ description: 'AMAZON PRIME', amount: 1499, date: '2025-09-14', paymentMethod: 'autopay' }),
    ];
    const [c] = detectSubscriptions(txns, new Set(), today);
    expect(c.cycle).toBe('yearly');
    expect(c.amount).toBe(1499);
    expect(c.priceHistory).toEqual([
      { amount: 999, since: '2024-09-14' },
      { amount: 1499, since: '2025-09-14' },
    ]);
  });

  it('splits an aggregator descriptor into per-service streams by cadence', () => {
    // Both billed as "GOOGLE PLAY" on the same account, both autopay:
    // Truecaller ₹99/yr and a ₹299/mo service. Must become TWO candidates.
    const txns = [
      tx({ description: 'GOOGLE PLAY', amount: 99, date: '2024-07-08', paymentMethod: 'autopay' }),
      tx({ description: 'GOOGLE PLAY', amount: 99, date: '2025-07-08', paymentMethod: 'autopay' }),
      tx({ description: 'GOOGLE PLAY', amount: 299, date: '2026-02-10', paymentMethod: 'autopay' }),
      tx({ description: 'GOOGLE PLAY', amount: 299, date: '2026-03-10', paymentMethod: 'autopay' }),
      tx({ description: 'GOOGLE PLAY', amount: 299, date: '2026-04-10', paymentMethod: 'autopay' }),
    ];
    const cands = detectSubscriptions(txns, new Set(), today);
    expect(cands).toHaveLength(2);
    expect(cands.find((c) => c.amount === 99)?.cycle).toBe('yearly');
    expect(cands.find((c) => c.amount === 299)?.cycle).toBe('monthly');
  });

  it('surfaces a single autopay mandate immediately as monthly (editable at confirm)', () => {
    const [c] = detectSubscriptions(
      [tx({ description: 'GOOGLE PLAY', amount: 99, date: '2026-04-08', paymentMethod: 'autopay' })],
      new Set(),
      today,
    );
    expect(c.cycle).toBe('monthly');
    expect(c.occurrences).toBe(1);
    expect(c.nextRenewalDate).toBe('2026-05-08');
  });

  it('does NOT detect from a single non-autopay charge', () => {
    expect(detectSubscriptions([tx({})], new Set(), today)).toHaveLength(0);
  });

  it('excludes descriptors already persisted/ignored', () => {
    const txns = [tx({ date: '2026-03-02' }), tx({ date: '2026-04-02' }), tx({ date: '2026-05-02' })];
    const seen = new Set([normalizeDescriptor('NETFLIX.COM')]);
    expect(detectSubscriptions(txns, seen, today)).toHaveLength(0);
  });

  it('rejects two coincidental same-merchant buys (no autopay, weak evidence)', () => {
    const txns = [
      tx({ description: 'AMAZON', amount: 200, date: '2026-03-02' }),
      tx({ description: 'AMAZON', amount: 120, date: '2026-04-02' }),
    ];
    expect(detectSubscriptions(txns, new Set(), today)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest detect-subscriptions -v`
Expected: FAIL ("Cannot find module './detect-subscriptions'").

- [ ] **Step 3: Write the implementation**

```ts
// backend/src/subscriptions/detect-subscriptions.ts
import { PriceHistoryEntry, SubscriptionCycle } from './subscription.entity';

export { PriceHistoryEntry };

export interface DetectTxn {
  id: string;
  date: string; // ISO (YYYY-MM-DD or full)
  description: string;
  amount: number; // positive magnitude of the expense
  categoryId: string;
  categoryName: string;
  accountId: string | null;
  paymentMethod: string | null;
  isRecurring: boolean;
}

export interface SubscriptionCandidate {
  merchantDescriptor: string; // normalized key
  rawDescription: string; // representative raw descriptor
  amount: number; // latest charge
  cycle: SubscriptionCycle;
  nextRenewalDate: string; // ISO date
  firstSeenDate: string; // ISO date
  accountId: string | null;
  paymentMethod: string | null;
  categoryId: string;
  priceHistory: PriceHistoryEntry[];
  transactionIds: string[];
  occurrences: number;
}

// Categories whose recurring debits are NOT subscriptions (investments/income/SIPs).
const EXCLUDED_CATEGORIES = new Set(['income', 'investments', 'investment', 'transfer', 'transfers']);
const BOOST_CATEGORY = 'subscriptions';

const dayOnly = (s: string): string => s.slice(0, 10);

export function normalizeDescriptor(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\d{4,}/g, ' ') // long ref numbers
    .replace(/\b(billdesk|autopay|ach|upi|payment|ref|txn|pos|ecom|mandate)\b/g, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Adds one billing cycle to an ISO date (calendar-correct). */
export function addCycle(isoDate: string, cycle: SubscriptionCycle): string {
  const d = new Date(dayOnly(isoDate) + 'T00:00:00Z');
  if (cycle === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(dayOnly(b) + 'T00:00:00Z').getTime() - new Date(dayOnly(a) + 'T00:00:00Z').getTime()) / 86400000,
  );
}

/** Two amounts are "the same service" if within a factor of each other. */
function amountClose(a: number, b: number, factor = 2): boolean {
  return a <= b * factor && b <= a * factor;
}

/** Classify an inter-charge gap as a monthly/yearly cadence (or neither).
 * Bands widen for the boosted (autopay/recurring/subscriptions-category) case. */
function gapBand(g: number, boosted: boolean): SubscriptionCycle | null {
  const m: [number, number] = boosted ? [24, 35] : [26, 33];
  const y: [number, number] = boosted ? [340, 390] : [350, 380];
  if (g >= m[0] && g <= m[1]) return 'monthly';
  if (g >= y[0] && g <= y[1]) return 'yearly';
  return null;
}

function buildPriceHistory(sorted: DetectTxn[]): PriceHistoryEntry[] {
  const out: PriceHistoryEntry[] = [];
  for (const t of sorted) {
    const last = out[out.length - 1];
    if (!last || last.amount !== t.amount) out.push({ amount: t.amount, since: dayOnly(t.date) });
  }
  return out;
}

/**
 * Extract cadence-coherent recurring streams from one descriptor+account
 * group. A bank debit descriptor like "GOOGLE PLAY" covers MANY services
 * (the SMS names the aggregator, not the service), so a single group can
 * hold several independent subscriptions. Greedy chronological assignment
 * separates them: a charge joins an existing stream only if its amount is
 * close (×2) to that stream's latest charge AND the gap is a plausible
 * monthly/yearly cadence. This keeps a ₹499→₹649 hike together (the same
 * cadence continues) while splitting a ₹99/yr and a ₹299/mo sub that merely
 * share the "GOOGLE PLAY" descriptor.
 */
function extractStreams(group: DetectTxn[], boosted: boolean): DetectTxn[][] {
  const sorted = [...group].sort((a, b) => (a.date < b.date ? -1 : 1));
  const streams: DetectTxn[][] = [];
  for (const t of sorted) {
    let placed = false;
    for (const s of streams) {
      const prev = s[s.length - 1];
      if (amountClose(t.amount, prev.amount) && gapBand(daysBetween(prev.date, t.date), boosted)) {
        s.push(t);
        placed = true;
        break;
      }
    }
    if (!placed) streams.push([t]);
  }
  return streams;
}

export function detectSubscriptions(
  txns: DetectTxn[],
  ignoredOrExisting: Set<string>,
  today: Date,
): SubscriptionCandidate[] {
  const groups = new Map<string, DetectTxn[]>();
  for (const t of txns) {
    if (t.amount <= 0) continue;
    if (EXCLUDED_CATEGORIES.has(t.categoryName.toLowerCase())) continue;
    const key = `${normalizeDescriptor(t.description)}::${t.accountId ?? ''}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  const candidates: SubscriptionCandidate[] = [];
  for (const [, group] of groups) {
    const descriptor = normalizeDescriptor(group[0].description);
    if (ignoredOrExisting.has(descriptor)) continue;

    // `paymentMethod === 'autopay'` (set by the SMS/notification parse for
    // mandate/SIP/ACH/NACH/standing-instruction debits) is the primary
    // recurring signal — NOT the never-populated `isRecurring` boolean.
    const boosted =
      group.some((t) => t.paymentMethod === 'autopay' || t.isRecurring) ||
      group[0].categoryName.toLowerCase() === BOOST_CATEGORY;

    for (const stream of extractStreams(group, boosted)) {
      const autopay = stream.some((t) => t.paymentMethod === 'autopay');

      let cycle: SubscriptionCycle | null = null;
      if (stream.length >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < stream.length; i++) gaps.push(daysBetween(stream[i - 1].date, stream[i].date));
        cycle = gapBand(median(gaps), boosted);
      } else if (stream.length === 1 && autopay) {
        cycle = 'monthly'; // brand-new mandate: surface now, editable at confirm
      }
      if (!cycle) continue;

      // Precision guard against two coincidental same-merchant buys: weak
      // evidence (2 non-autopay charges) needs tight amount agreement.
      const qualifies =
        autopay || stream.length >= 3 || (stream.length === 2 && amountClose(stream[0].amount, stream[1].amount, 1.5));
      if (!qualifies) continue;

      const last = stream[stream.length - 1];
      candidates.push({
        merchantDescriptor: descriptor,
        rawDescription: last.description,
        amount: last.amount,
        cycle,
        nextRenewalDate: addCycle(last.date, cycle),
        firstSeenDate: dayOnly(stream[0].date),
        accountId: last.accountId,
        paymentMethod: last.paymentMethod,
        categoryId: last.categoryId,
        priceHistory: buildPriceHistory(stream),
        transactionIds: stream.map((t) => t.id),
        occurrences: stream.length,
      });
    }
  }
  return candidates.sort((a, b) => b.amount - a.amount);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest detect-subscriptions -v`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/subscriptions/detect-subscriptions.ts backend/src/subscriptions/detect-subscriptions.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): pure subscription detection (grouping/cadence/hike)"
```

---

## Task 3: Pure summary + flags — `subscription-summary.ts`

**Files:**
- Create: `backend/src/subscriptions/subscription-summary.ts`
- Test: `backend/src/subscriptions/subscription-summary.spec.ts`

**Interfaces:**
- Consumes: `PriceHistoryEntry` from the entity.
- Produces:
  - constants `RENEWAL_SOON_DAYS = 14`, `FORGOTTEN_MIN_AGE_DAYS = 180`, `FORGOTTEN_MIN_YEARLY = 1000`, `UPCOMING_WINDOW_DAYS = 35`.
  - `monthlyEquiv(sub: SummarySub): number`
  - `computeSubscriptionSummary(subs: SummarySub[], today: Date): SubscriptionSummary`
  - types `SummarySub`, `SubFlag`, `UpcomingItem`, `SubscriptionSummary`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/subscriptions/subscription-summary.spec.ts
import { computeSubscriptionSummary, SummarySub } from './subscription-summary';

const sub = (over: Partial<SummarySub>): SummarySub => ({
  id: 's1', name: 'Netflix', emoji: '🎬', color: '#c97d8c',
  amount: 649, cycle: 'monthly', nextRenewalDate: '2026-05-10',
  firstSeenDate: '2025-01-01', status: 'active', priceHistory: null,
  detailOpenedAt: null, accountId: 'a1',
  ...over,
});

describe('computeSubscriptionSummary', () => {
  const today = new Date('2026-05-01T00:00:00Z');

  it('sums monthly burn and yearly projection over active subs only', () => {
    const r = computeSubscriptionSummary(
      [sub({ amount: 649, cycle: 'monthly' }), sub({ id: 's2', amount: 1200, cycle: 'yearly' }), sub({ id: 's3', status: 'paused', amount: 999 })],
      today,
    );
    expect(r.monthlyBurn).toBe(649 + 100); // 1200/12
    expect(r.yearlyProjection).toBe(649 * 12 + 1200);
    expect(r.activeCount).toBe(2);
  });

  it('lists upcoming charges within the window, sorted by date', () => {
    const r = computeSubscriptionSummary(
      [sub({ id: 's2', nextRenewalDate: '2026-05-20' }), sub({ id: 's1', nextRenewalDate: '2026-05-05' }), sub({ id: 's3', nextRenewalDate: '2026-09-01' })],
      today,
    );
    expect(r.upcoming.map((u) => u.subId)).toEqual(['s1', 's2']);
    expect(r.upcoming[0].inDays).toBe(4);
  });

  it('flags a price hike', () => {
    const r = computeSubscriptionSummary(
      [sub({ priceHistory: [{ amount: 499, since: '2025-01-01' }, { amount: 649, since: '2026-02-01' }] })],
      today,
    );
    expect(r.flags.find((f) => f.kind === 'hike')).toMatchObject({ subId: 's1', from: 499, to: 649 });
  });

  it('flags a big annual renewing soon', () => {
    const r = computeSubscriptionSummary([sub({ cycle: 'yearly', amount: 1499, nextRenewalDate: '2026-05-08' })], today);
    expect(r.flags.some((f) => f.kind === 'renewal_soon')).toBe(true);
  });

  it('flags possibly-forgotten only when never-opened + old + costly', () => {
    const r = computeSubscriptionSummary(
      [sub({ cycle: 'yearly', amount: 1499, firstSeenDate: '2024-01-01', detailOpenedAt: null, nextRenewalDate: '2026-12-01' })],
      today,
    );
    expect(r.flags.some((f) => f.kind === 'forgotten')).toBe(true);

    const opened = computeSubscriptionSummary(
      [sub({ cycle: 'yearly', amount: 1499, firstSeenDate: '2024-01-01', detailOpenedAt: new Date('2026-01-01'), nextRenewalDate: '2026-12-01' })],
      today,
    );
    expect(opened.flags.some((f) => f.kind === 'forgotten')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest subscription-summary -v`
Expected: FAIL ("Cannot find module './subscription-summary'").

- [ ] **Step 3: Write the implementation**

```ts
// backend/src/subscriptions/subscription-summary.ts
import { PriceHistoryEntry, SubscriptionCycle, SubscriptionStatus } from './subscription.entity';

export const RENEWAL_SOON_DAYS = 14;
export const FORGOTTEN_MIN_AGE_DAYS = 180;
export const FORGOTTEN_MIN_YEARLY = 1000;
export const UPCOMING_WINDOW_DAYS = 35;

export interface SummarySub {
  id: string;
  name: string;
  emoji: string;
  color: string;
  amount: number;
  cycle: SubscriptionCycle;
  nextRenewalDate: string;
  firstSeenDate: string;
  status: SubscriptionStatus;
  priceHistory: PriceHistoryEntry[] | null;
  detailOpenedAt: Date | null;
  accountId: string | null;
}

export interface UpcomingItem { subId: string; nextRenewalDate: string; inDays: number; amount: number }

export type SubFlag =
  | { subId: string; name: string; kind: 'hike'; from: number; to: number; pct: number; extraYearly: number }
  | { subId: string; name: string; kind: 'renewal_soon'; inDays: number; amount: number }
  | { subId: string; name: string; kind: 'forgotten'; yearlyCost: number };

export interface SubscriptionSummary {
  monthlyBurn: number;
  yearlyProjection: number;
  activeCount: number;
  upcoming: UpcomingItem[];
  flags: SubFlag[];
}

const dayOnly = (s: string): string => s.slice(0, 10);
const startOfDay = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const daysUntil = (iso: string, today: Date): number =>
  Math.round((new Date(dayOnly(iso) + 'T00:00:00Z').getTime() - startOfDay(today)) / 86400000);

export const monthlyEquiv = (s: SummarySub): number => (s.cycle === 'yearly' ? s.amount / 12 : s.amount);
const yearlyCost = (s: SummarySub): number => (s.cycle === 'yearly' ? s.amount : s.amount * 12);

export function computeSubscriptionSummary(subs: SummarySub[], today: Date): SubscriptionSummary {
  const active = subs.filter((s) => s.status === 'active');

  const monthlyBurn = active.reduce((sum, s) => sum + monthlyEquiv(s), 0);
  const yearlyProjection = active.reduce((sum, s) => sum + yearlyCost(s), 0);

  const upcoming: UpcomingItem[] = active
    .map((s) => ({ subId: s.id, nextRenewalDate: dayOnly(s.nextRenewalDate), inDays: daysUntil(s.nextRenewalDate, today), amount: s.amount }))
    .filter((u) => u.inDays >= 0 && u.inDays <= UPCOMING_WINDOW_DAYS)
    .sort((a, b) => a.inDays - b.inDays);

  const flags: SubFlag[] = [];
  for (const s of active) {
    if (s.priceHistory && s.priceHistory.length >= 2) {
      const from = s.priceHistory[0].amount;
      const to = s.priceHistory[s.priceHistory.length - 1].amount;
      if (to > from) {
        flags.push({
          subId: s.id, name: s.name, kind: 'hike', from, to,
          pct: Math.round(((to - from) / from) * 100),
          extraYearly: (s.cycle === 'yearly' ? to - from : (to - from) * 12),
        });
      }
    }
    const inDays = daysUntil(s.nextRenewalDate, today);
    if (s.cycle === 'yearly' && inDays >= 0 && inDays <= RENEWAL_SOON_DAYS) {
      flags.push({ subId: s.id, name: s.name, kind: 'renewal_soon', inDays, amount: s.amount });
    }
    const ageDays = daysUntil(s.firstSeenDate, today) * -1;
    if (s.detailOpenedAt == null && ageDays >= FORGOTTEN_MIN_AGE_DAYS && yearlyCost(s) >= FORGOTTEN_MIN_YEARLY) {
      flags.push({ subId: s.id, name: s.name, kind: 'forgotten', yearlyCost: yearlyCost(s) });
    }
  }

  return { monthlyBurn, yearlyProjection, activeCount: active.length, upcoming, flags };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest subscription-summary -v`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/subscriptions/subscription-summary.ts backend/src/subscriptions/subscription-summary.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): pure subscription summary + flags"
```

---

## Task 4: Merchant catalog + naming — `subscription-catalog.ts`

**Files:**
- Create: `backend/src/subscriptions/subscription-catalog.ts`
- Test: `backend/src/subscriptions/subscription-catalog.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `resolveFromCatalog(descriptor: string): ResolvedName | null` (includes aggregator entries)
  - `isAggregator(descriptor: string): boolean`
  - `extractServiceName(text: string): string | null` (pure regex over a Play/Gmail notification body)
  - `resolveName(descriptor: string, opts?: { hint?: string | null; llm?: LlmNamer }): Promise<ResolvedName>`
  - types `ResolvedName { name; emoji; color }`, `LlmNamer = (descriptor: string) => Promise<{ name: string; emoji: string } | null>`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/subscriptions/subscription-catalog.spec.ts
import { resolveFromCatalog, resolveName, isAggregator, extractServiceName } from './subscription-catalog';

describe('resolveFromCatalog', () => {
  it('resolves a known merchant', () => {
    expect(resolveFromCatalog('netflix.com')?.name).toBe('Netflix');
  });
  it('resolves an aggregator to a generic name', () => {
    expect(resolveFromCatalog('google play')?.name).toBe('Google Play');
  });
  it('returns null for an unknown descriptor', () => {
    expect(resolveFromCatalog('zzz random merchant')).toBeNull();
  });
});

describe('isAggregator', () => {
  it('flags aggregator descriptors', () => {
    expect(isAggregator('google play')).toBe(true);
    expect(isAggregator('netflix.com')).toBe(false);
  });
});

describe('extractServiceName', () => {
  it('pulls the real service out of a Google Play receipt notification', () => {
    const text = 'Your Google Play Order Receipt. Your subscription from True Software Scandinavia AB on Google Play has renewed.';
    expect(extractServiceName(text)).toBe('True Software Scandinavia AB');
  });
  it('returns null when no service phrase is present', () => {
    expect(extractServiceName('Payment of Rs.99 to Google Play was successful')).toBeNull();
  });
});

describe('resolveName', () => {
  it('prefers the catalog over the hint and LLM', async () => {
    const r = await resolveName('netflix.com', { hint: 'WRONG', llm: async () => ({ name: 'WRONG2', emoji: '❌' }) });
    expect(r.name).toBe('Netflix');
  });
  it('uses the notification hint for an aggregator (catalog is generic)', async () => {
    const r = await resolveName('google play', { hint: 'Truecaller' });
    expect(r.name).toBe('Truecaller');
  });
  it('uses the LLM for an unknown descriptor with no hint', async () => {
    const r = await resolveName('acme cloud pro', { llm: async () => ({ name: 'Acme Cloud', emoji: '☁️' }) });
    expect(r.name).toBe('Acme Cloud');
    expect(r.emoji).toBe('☁️');
  });
  it('falls back to a title-cased descriptor when nothing resolves', async () => {
    const r = await resolveName('acme cloud pro', { llm: async () => null });
    expect(r.name).toBe('Acme Cloud Pro');
    expect(r.emoji).toBe('🔁');
  });
  it('falls back gracefully with no opts', async () => {
    const r = await resolveName('acme cloud pro');
    expect(r.name).toBe('Acme Cloud Pro');
  });
});
```

Note the aggregator ordering subtlety: `resolveFromCatalog` must NOT let a generic aggregator entry shadow a specific merchant. Because a normalized descriptor for an aggregator charge is literally "google play" (the service name is not in it), specific entries never collide — but keep the aggregator entries LAST in the catalog array and match on the full aggregator token so "google play" resolves generically while "google one" still hits its specific entry.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest subscription-catalog -v`
Expected: FAIL ("Cannot find module './subscription-catalog'").

- [ ] **Step 3: Write the implementation**

```ts
// backend/src/subscriptions/subscription-catalog.ts
export interface ResolvedName { name: string; emoji: string; color: string }
export type LlmNamer = (descriptor: string) => Promise<{ name: string; emoji: string } | null>;

const DEFAULT_COLOR = '#a78bfa';
const DEFAULT_EMOJI = '🔁';

// keyword (found in the normalized descriptor) → display. Specific merchants
// first; aggregator (generic) entries last so a real merchant never shadows.
const CATALOG: { match: string; name: string; emoji: string; color: string }[] = [
  { match: 'netflix', name: 'Netflix', emoji: '🎬', color: '#c97d8c' },
  { match: 'spotify', name: 'Spotify', emoji: '🎧', color: '#7faf93' },
  { match: 'youtube', name: 'YouTube Premium', emoji: '▶️', color: '#ff6b85' },
  { match: 'prime', name: 'Amazon Prime', emoji: '📦', color: '#6ea8ff' },
  { match: 'hotstar', name: 'Disney+ Hotstar', emoji: '✨', color: '#5ee0d8' },
  { match: 'disney', name: 'Disney+ Hotstar', emoji: '✨', color: '#5ee0d8' },
  { match: 'google one', name: 'Google One', emoji: '☁️', color: '#ffc24b' },
  { match: 'icloud', name: 'iCloud+', emoji: '🍎', color: '#8a8299' },
  { match: 'cult', name: 'Cult.fit', emoji: '🏋️', color: '#a78bfa' },
  { match: 'jio', name: 'JioSaavn', emoji: '🎵', color: '#6ea8ff' },
  // aggregators (generic — the real service is enriched from notification text)
  { match: 'google play', name: 'Google Play', emoji: '🅶', color: '#6ea8ff' },
  { match: 'apple.com', name: 'Apple', emoji: '🍎', color: '#8a8299' },
  { match: 'itunes', name: 'Apple', emoji: '🍎', color: '#8a8299' },
  { match: 'razorpay', name: 'Razorpay', emoji: '💳', color: '#6ea8ff' },
  { match: 'payu', name: 'PayU', emoji: '💳', color: '#6ea8ff' },
];

const AGGREGATORS = ['google play', 'apple.com', 'itunes', 'razorpay', 'payu'];

export function isAggregator(descriptor: string): boolean {
  const d = descriptor.toLowerCase();
  return AGGREGATORS.some((a) => d.includes(a));
}

/** Pull the real service name out of a Play/Gmail subscription-receipt body,
 * e.g. "Your subscription from True Software Scandinavia AB on Google Play…". */
export function extractServiceName(text: string): string | null {
  const m = text.match(/subscription from ([A-Z0-9][\w .&'-]+?) (?:on|has|will|is)\b/i);
  return m ? m[1].trim() : null;
}

function titleCase(descriptor: string): string {
  return descriptor
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function resolveFromCatalog(descriptor: string): ResolvedName | null {
  const d = descriptor.toLowerCase();
  const hit = CATALOG.find((c) => d.includes(c.match));
  return hit ? { name: hit.name, emoji: hit.emoji, color: hit.color } : null;
}

/**
 * Naming order: catalog (specific merchant) → notification hint (aggregators,
 * where the catalog only knows the generic aggregator name) → LLM → title-case.
 * The LLM never decides whether the group is a subscription.
 */
export async function resolveName(
  descriptor: string,
  opts?: { hint?: string | null; llm?: LlmNamer },
): Promise<ResolvedName> {
  const cat = resolveFromCatalog(descriptor);
  // A specific (non-aggregator) catalog hit is authoritative.
  if (cat && !isAggregator(descriptor)) return cat;
  // Aggregator: prefer the real service name from the notification hint.
  if (opts?.hint) return { name: opts.hint, emoji: cat?.emoji ?? DEFAULT_EMOJI, color: cat?.color ?? DEFAULT_COLOR };
  if (cat) return cat; // generic aggregator name (e.g. "Google Play")
  if (opts?.llm) {
    try {
      const r = await opts.llm(descriptor);
      if (r && r.name) return { name: r.name, emoji: r.emoji || DEFAULT_EMOJI, color: DEFAULT_COLOR };
    } catch {
      /* graceful fallback below */
    }
  }
  return { name: titleCase(descriptor), emoji: DEFAULT_EMOJI, color: DEFAULT_COLOR };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest subscription-catalog -v`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/subscriptions/subscription-catalog.ts backend/src/subscriptions/subscription-catalog.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): subscription merchant catalog + naming resolver"
```

---

## Task 5: DTOs

**Files:**
- Create: `backend/src/subscriptions/dto/create-subscription.dto.ts`
- Create: `backend/src/subscriptions/dto/update-subscription.dto.ts`
- Create: `backend/src/subscriptions/dto/dismiss-candidate.dto.ts`

**Interfaces:**
- Produces: `CreateSubscriptionDto`, `UpdateSubscriptionDto`, `DismissCandidateDto`.

- [ ] **Step 1: Create `create-subscription.dto.ts`**

```ts
// backend/src/subscriptions/dto/create-subscription.dto.ts
import { IsString, IsOptional, IsNumber, IsInt, IsIn, IsArray, MaxLength, IsDateString, Min } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString() @MaxLength(120)
  name: string;

  @IsString() @MaxLength(200)
  merchantDescriptor: string;

  @IsOptional() @IsString() @MaxLength(16)
  emoji?: string;

  @IsOptional() @IsString() @MaxLength(20)
  color?: string;

  @IsNumber() @Min(0)
  amount: number;

  @IsIn(['monthly', 'yearly'])
  cycle: 'monthly' | 'yearly';

  @IsDateString()
  nextRenewalDate: string;

  @IsDateString()
  firstSeenDate: string;

  @IsOptional() @IsString()
  accountId?: string | null;

  @IsOptional() @IsString()
  paymentMethod?: string | null;

  @IsOptional() @IsString()
  categoryId?: string | null;

  @IsOptional() @IsInt() @Min(0)
  reminderDays?: number | null;

  /** Historical charge ids to back-link to this subscription. */
  @IsOptional() @IsArray()
  transactionIds?: string[];
}
```

- [ ] **Step 2: Create `update-subscription.dto.ts`**

```ts
// backend/src/subscriptions/dto/update-subscription.dto.ts
import { IsString, IsOptional, IsNumber, IsInt, IsIn, MaxLength, IsDateString, Min } from 'class-validator';

export class UpdateSubscriptionDto {
  @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @IsOptional() @IsNumber() @Min(0)
  amount?: number;

  @IsOptional() @IsIn(['monthly', 'yearly'])
  cycle?: 'monthly' | 'yearly';

  @IsOptional() @IsIn(['active', 'paused', 'cancelled'])
  status?: 'active' | 'paused' | 'cancelled';

  @IsOptional() @IsDateString()
  nextRenewalDate?: string;

  @IsOptional() @IsString()
  accountId?: string | null;

  @IsOptional() @IsInt() @Min(0)
  reminderDays?: number | null;

  /** Set by the mobile detail sheet the first time it opens. */
  @IsOptional()
  markDetailOpened?: boolean;
}
```

- [ ] **Step 3: Create `dismiss-candidate.dto.ts`**

```ts
// backend/src/subscriptions/dto/dismiss-candidate.dto.ts
import { IsString, MaxLength } from 'class-validator';

export class DismissCandidateDto {
  @IsString() @MaxLength(200)
  merchantDescriptor: string;
}
```

- [ ] **Step 4: Verify tsc**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep "subscriptions/dto"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add backend/src/subscriptions/dto/
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): subscription DTOs"
```

---

## Task 6: `SubscriptionsService`

**Files:**
- Create: `backend/src/subscriptions/subscriptions.service.ts`
- Test: `backend/src/subscriptions/subscriptions.service.spec.ts`
- Modify: `backend/src/subscriptions/subscriptions.module.ts` (add service + deps)

**Interfaces:**
- Consumes: `detectSubscriptions`, `computeSubscriptionSummary`, `resolveName` / `isAggregator` / `extractServiceName`, entities, `CategoriesService`, and the `CapturedNotification` repo (read-only, for aggregator name enrichment — registered via `TypeOrmModule.forFeature`, NOT by importing NotificationSyncModule).
- Produces: `SubscriptionsService` with:
  - `detect(userId): Promise<SubscriptionCandidateView[]>` (candidates + resolved names — aggregator names enriched from captured Play/Gmail notifications when available, else generic; not persisted)
  - `list(userId): Promise<SubscriptionListView>` (rows + summary)
  - `create(userId, dto): Promise<Subscription>` (persists + back-links transactionIds)
  - `update(userId, id, dto): Promise<Subscription>`
  - `remove(userId, id): Promise<void>`
  - `dismiss(userId, descriptor): Promise<void>`
  - `attachTransaction(userId, tx): Promise<void>` (reverse-linking, used by Task 9)

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/subscriptions/subscriptions.service.spec.ts
import { SubscriptionsService } from './subscriptions.service';

function makeRepo<T extends { id?: string }>(seed: T[] = []) {
  const rows = [...seed];
  return {
    rows,
    find: jest.fn(async (q?: any) => rows.filter((r: any) => !q?.where || Object.entries(q.where).every(([k, v]) => r[k] === v))),
    findOne: jest.fn(async (q: any) => rows.find((r: any) => Object.entries(q.where).every(([k, v]) => r[k] === v)) ?? null),
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => { const r = { id: d.id ?? 'new-id', ...d }; const i = rows.findIndex((x: any) => x.id === r.id); if (i >= 0) rows[i] = r; else rows.push(r); return r; }),
    remove: jest.fn(async (d: any) => { const i = rows.findIndex((x: any) => x.id === d.id); if (i >= 0) rows.splice(i, 1); }),
    update: jest.fn(async () => undefined),
  };
}

describe('SubscriptionsService', () => {
  const categoriesSvc = { findAll: jest.fn(async () => [{ id: 'cat-sub', name: 'Subscriptions', color: '#a78bfa' }, { id: 'cat-ent', name: 'Entertainment', color: null }]) };

  function build(txns: any[] = [], notes: any[] = []) {
    const subRepo = makeRepo<any>();
    const ignoreRepo = makeRepo<any>();
    const txRepo = { ...makeRepo<any>(txns), find: jest.fn(async () => txns) } as any;
    const capturedRepo = { ...makeRepo<any>(notes), find: jest.fn(async () => notes) } as any;
    const svc = new SubscriptionsService(subRepo as any, ignoreRepo as any, txRepo as any, capturedRepo as any, categoriesSvc as any);
    return { svc, subRepo, ignoreRepo, txRepo, capturedRepo };
  }

  it('create persists a row and back-links historical transactions', async () => {
    const { svc, subRepo, txRepo } = build();
    const sub = await svc.create('u1', {
      name: 'Netflix', merchantDescriptor: 'netflix.com', amount: 649, cycle: 'monthly',
      nextRenewalDate: '2026-05-10', firstSeenDate: '2025-01-01', transactionIds: ['t1', 't2'],
    } as any);
    expect(subRepo.save).toHaveBeenCalled();
    expect(txRepo.update).toHaveBeenCalledWith({ id: expect.anything(), userId: 'u1' }, { subscriptionId: sub.id });
  });

  it('update pauses a subscription', async () => {
    const { svc, subRepo } = build();
    subRepo.rows.push({ id: 's1', userId: 'u1', status: 'active', name: 'Netflix' });
    const r = await svc.update('u1', 's1', { status: 'paused' } as any);
    expect(r.status).toBe('paused');
  });

  it('update markDetailOpened stamps detailOpenedAt once', async () => {
    const { svc, subRepo } = build();
    subRepo.rows.push({ id: 's1', userId: 'u1', status: 'active', detailOpenedAt: null });
    const r = await svc.update('u1', 's1', { markDetailOpened: true } as any);
    expect(r.detailOpenedAt).toBeInstanceOf(Date);
  });

  it('dismiss records an ignore row so the descriptor stops surfacing', async () => {
    const { svc, ignoreRepo } = build();
    await svc.dismiss('u1', 'netflix.com');
    expect(ignoreRepo.save).toHaveBeenCalled();
  });

  it('detect excludes descriptors already persisted or ignored', async () => {
    const txns = [
      { id: 't1', date: '2026-03-02', description: 'NETFLIX.COM', amount: 649, categoryId: 'cat-ent', category: { name: 'Entertainment' }, accountId: 'a1', paymentMethod: 'card', isRecurring: false },
      { id: 't2', date: '2026-04-02', description: 'NETFLIX.COM', amount: 649, categoryId: 'cat-ent', category: { name: 'Entertainment' }, accountId: 'a1', paymentMethod: 'card', isRecurring: false },
    ];
    const { svc, subRepo } = build(txns);
    subRepo.rows.push({ id: 's1', userId: 'u1', merchantDescriptor: 'netflix.com', status: 'active' });
    const candidates = await svc.detect('u1');
    expect(candidates).toHaveLength(0);
  });

  it('detect enriches an aggregator name from a captured notification', async () => {
    const txns = [
      { id: 't1', date: '2025-07-08', description: 'GOOGLE PLAY', amount: 99, categoryId: 'cat-ent', category: { name: 'Entertainment' }, accountId: 'a1', paymentMethod: 'autopay', isRecurring: false },
      { id: 't2', date: '2026-07-08', description: 'GOOGLE PLAY', amount: 99, categoryId: 'cat-ent', category: { name: 'Entertainment' }, accountId: 'a1', paymentMethod: 'autopay', isRecurring: false },
    ];
    const notes = [
      { userId: 'u1', title: 'Google Play', text: 'Your subscription from Truecaller on Google Play has renewed for ₹99.', postedAt: new Date('2026-07-08') },
    ];
    const { svc } = build(txns, notes);
    const candidates = await svc.detect('u1');
    expect(candidates[0].name).toBe('Truecaller');
  });

  it('detect keeps the generic aggregator name when no notification matches', async () => {
    const txns = [
      { id: 't1', date: '2025-07-08', description: 'GOOGLE PLAY', amount: 99, categoryId: 'cat-ent', category: { name: 'Entertainment' }, accountId: 'a1', paymentMethod: 'autopay', isRecurring: false },
      { id: 't2', date: '2026-07-08', description: 'GOOGLE PLAY', amount: 99, categoryId: 'cat-ent', category: { name: 'Entertainment' }, accountId: 'a1', paymentMethod: 'autopay', isRecurring: false },
    ];
    const { svc } = build(txns, []);
    const candidates = await svc.detect('u1');
    expect(candidates[0].name).toBe('Google Play');
  });
});
```

(Note `today` for `detect` is `new Date()` inside the service; the enrichment/name assertions above do not depend on the current date, and the two yearly-spaced autopay charges qualify via the autopay signal regardless of when the test runs.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest subscriptions.service -v`
Expected: FAIL ("Cannot find module './subscriptions.service'").

- [ ] **Step 3: Write the implementation**

```ts
// backend/src/subscriptions/subscriptions.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from './subscription.entity';
import { SubscriptionIgnore } from './subscription-ignore.entity';
import { Transaction } from '../transactions/transaction.entity';
import { CategoriesService } from '../categories/categories.service';
import { CapturedNotification } from '../notification-sync/captured-notification.entity';
import { TransactionType, PaymentMethod } from '../common/enums';
import { detectSubscriptions, normalizeDescriptor, DetectTxn, SubscriptionCandidate } from './detect-subscriptions';
import { resolveName, ResolvedName, isAggregator, extractServiceName } from './subscription-catalog';
import { computeSubscriptionSummary, SummarySub } from './subscription-summary';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

export type SubscriptionCandidateView = SubscriptionCandidate & ResolvedName;

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(SubscriptionIgnore) private readonly ignoreRepo: Repository<SubscriptionIgnore>,
    @InjectRepository(Transaction) private readonly txRepo: Repository<Transaction>,
    @InjectRepository(CapturedNotification) private readonly capturedRepo: Repository<CapturedNotification>,
    private readonly categoriesService: CategoriesService,
  ) {}

  /**
   * Best-effort: for an aggregator charge (bank SMS says only "Google Play"),
   * mine the real service name from a captured Play/Gmail receipt notification
   * that both names a service and mentions the amount. Read-only against
   * notification-sync's table; returns null when nothing matches (→ generic
   * aggregator name, user renames at confirm).
   */
  private async findNotificationName(userId: string, amount: number): Promise<string | null> {
    const notes = await this.capturedRepo.find({ where: { userId }, order: { postedAt: 'DESC' }, take: 200 });
    const amtStr = String(Math.round(amount));
    const patterns = [`₹${amtStr}`, `rs.${amtStr}`, `rs ${amtStr}`, `inr ${amtStr}`, `${amtStr}.00`];
    for (const n of notes) {
      const text = `${n.title ?? ''} ${n.text}`;
      const name = extractServiceName(text);
      if (!name) continue;
      const lower = text.toLowerCase();
      if (patterns.some((p) => lower.includes(p))) return name;
    }
    return null;
  }

  private toSummarySub(s: Subscription): SummarySub {
    return {
      id: s.id, name: s.name, emoji: s.emoji, color: s.color, amount: s.amount,
      cycle: s.cycle, nextRenewalDate: s.nextRenewalDate, firstSeenDate: s.firstSeenDate,
      status: s.status, priceHistory: s.priceHistory, detailOpenedAt: s.detailOpenedAt, accountId: s.accountId,
    };
  }

  async detect(userId: string): Promise<SubscriptionCandidateView[]> {
    const [txns, existing, ignored] = await Promise.all([
      this.txRepo.find({ where: { userId, type: TransactionType.EXPENSE }, relations: ['category'] }),
      this.subRepo.find({ where: { userId } }),
      this.ignoreRepo.find({ where: { userId } }),
    ]);
    const skip = new Set<string>([
      ...existing.map((s) => s.merchantDescriptor),
      ...ignored.map((i) => i.merchantDescriptor),
    ]);
    const detectTxns: DetectTxn[] = txns.map((t) => ({
      id: t.id, date: new Date(t.date).toISOString(), description: t.description,
      amount: Math.abs(t.amount), categoryId: t.categoryId,
      categoryName: (t as any).category?.name ?? '', accountId: t.accountId,
      paymentMethod: t.paymentMethod, isRecurring: t.isRecurring,
    }));
    const candidates = detectSubscriptions(detectTxns, skip, new Date());
    return Promise.all(
      candidates.map(async (c) => {
        const hint = isAggregator(c.merchantDescriptor) ? await this.findNotificationName(userId, c.amount) : null;
        return { ...c, ...(await resolveName(c.merchantDescriptor, { hint })) };
      }),
    );
  }

  async list(userId: string) {
    const subs = await this.subRepo.find({ where: { userId } });
    const summary = computeSubscriptionSummary(subs.map((s) => this.toSummarySub(s)), new Date());
    return { subscriptions: subs, summary };
  }

  async create(userId: string, dto: CreateSubscriptionDto): Promise<Subscription> {
    let categoryId = dto.categoryId ?? null;
    if (!categoryId) {
      const cats = await this.categoriesService.findAll(userId);
      categoryId = cats.find((c) => c.name.toLowerCase() === 'subscriptions')?.id ?? null;
    }
    const sub = this.subRepo.create({
      userId, name: dto.name, merchantDescriptor: normalizeDescriptor(dto.merchantDescriptor),
      emoji: dto.emoji ?? '🔁', color: dto.color ?? '#a78bfa', amount: dto.amount, cycle: dto.cycle,
      nextRenewalDate: dto.nextRenewalDate, firstSeenDate: dto.firstSeenDate,
      status: 'active', accountId: dto.accountId ?? null,
      paymentMethod: (dto.paymentMethod as PaymentMethod) ?? null, categoryId,
      reminderDays: dto.reminderDays ?? null, priceHistory: null, detailOpenedAt: null, lastReminderSentFor: null,
    });
    const saved = await this.subRepo.save(sub);
    for (const id of dto.transactionIds ?? []) {
      await this.txRepo.update({ id, userId }, { subscriptionId: saved.id });
    }
    return saved;
  }

  private async load(userId: string, id: string): Promise<Subscription> {
    const sub = await this.subRepo.findOne({ where: { id, userId } });
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  async update(userId: string, id: string, dto: UpdateSubscriptionDto): Promise<Subscription> {
    const sub = await this.load(userId, id);
    const { markDetailOpened, ...rest } = dto;
    Object.assign(sub, rest);
    if (markDetailOpened && !sub.detailOpenedAt) sub.detailOpenedAt = new Date();
    return this.subRepo.save(sub);
  }

  async remove(userId: string, id: string): Promise<void> {
    const sub = await this.load(userId, id);
    await this.txRepo.update({ subscriptionId: id, userId }, { subscriptionId: null });
    await this.subRepo.remove(sub);
  }

  async dismiss(userId: string, merchantDescriptor: string): Promise<void> {
    const descriptor = normalizeDescriptor(merchantDescriptor);
    const existing = await this.ignoreRepo.findOne({ where: { userId, merchantDescriptor: descriptor } });
    if (existing) return;
    await this.ignoreRepo.save(this.ignoreRepo.create({ userId, merchantDescriptor: descriptor }));
  }
}
```

- [ ] **Step 4: Wire the service into the module**

Replace `backend/src/subscriptions/subscriptions.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from './subscription.entity';
import { SubscriptionIgnore } from './subscription-ignore.entity';
import { Transaction } from '../transactions/transaction.entity';
import { CapturedNotification } from '../notification-sync/captured-notification.entity';
import { SubscriptionsService } from './subscriptions.service';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    // CapturedNotification is registered read-only for aggregator name enrichment
    // (a repository handle only — no dependency on NotificationSyncModule).
    TypeOrmModule.forFeature([Subscription, SubscriptionIgnore, Transaction, CapturedNotification]),
    CategoriesModule,
  ],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest subscriptions.service -v`
Expected: PASS (all 5 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/subscriptions/subscriptions.service.ts backend/src/subscriptions/subscriptions.service.spec.ts backend/src/subscriptions/subscriptions.module.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): SubscriptionsService (detect/confirm/list/update/dismiss)"
```

---

## Task 7: `SubscriptionsController` + endpoints

**Files:**
- Create: `backend/src/subscriptions/subscriptions.controller.ts`
- Test: `backend/src/subscriptions/subscriptions.controller.spec.ts`
- Modify: `backend/src/subscriptions/subscriptions.module.ts` (add controller)

**Interfaces:**
- Consumes: `SubscriptionsService`.
- Produces: routes `GET /subscriptions`, `GET /subscriptions/detect`, `POST /subscriptions`, `PATCH /subscriptions/:id`, `DELETE /subscriptions/:id`, `POST /subscriptions/dismiss`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/subscriptions/subscriptions.controller.spec.ts
import { SubscriptionsController } from './subscriptions.controller';

describe('SubscriptionsController', () => {
  const svc = {
    list: jest.fn(async () => ({ subscriptions: [], summary: {} })),
    detect: jest.fn(async () => []),
    create: jest.fn(async () => ({ id: 's1' })),
    update: jest.fn(async () => ({ id: 's1', status: 'paused' })),
    remove: jest.fn(async () => undefined),
    dismiss: jest.fn(async () => undefined),
  };
  const ctrl = new SubscriptionsController(svc as any);
  const user = { userId: 'u1', email: 'a@b.c' };

  it('GET /subscriptions returns list + summary', async () => {
    await ctrl.list(user);
    expect(svc.list).toHaveBeenCalledWith('u1');
  });
  it('GET /subscriptions/detect returns candidates', async () => {
    await ctrl.detect(user);
    expect(svc.detect).toHaveBeenCalledWith('u1');
  });
  it('POST /subscriptions creates', async () => {
    await ctrl.create(user, { name: 'Netflix' } as any);
    expect(svc.create).toHaveBeenCalledWith('u1', { name: 'Netflix' });
  });
  it('PATCH /subscriptions/:id updates', async () => {
    await ctrl.update(user, 's1', { status: 'paused' } as any);
    expect(svc.update).toHaveBeenCalledWith('u1', 's1', { status: 'paused' });
  });
  it('DELETE /subscriptions/:id removes', async () => {
    await ctrl.remove(user, 's1');
    expect(svc.remove).toHaveBeenCalledWith('u1', 's1');
  });
  it('POST /subscriptions/dismiss records an ignore', async () => {
    await ctrl.dismiss(user, { merchantDescriptor: 'netflix.com' } as any);
    expect(svc.dismiss).toHaveBeenCalledWith('u1', 'netflix.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest subscriptions.controller -v`
Expected: FAIL ("Cannot find module './subscriptions.controller'").

- [ ] **Step 3: Write the implementation**

```ts
// backend/src/subscriptions/subscriptions.controller.ts
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { DismissCandidateDto } from './dto/dismiss-candidate.dto';

type AuthUser = { userId: string; email: string };

@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.userId);
  }

  @Get('detect')
  detect(@CurrentUser() user: AuthUser) {
    return this.service.detect(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSubscriptionDto) {
    return this.service.create(user.userId, dto);
  }

  @Post('dismiss')
  dismiss(@CurrentUser() user: AuthUser, @Body() dto: DismissCandidateDto) {
    return this.service.dismiss(user.userId, dto.merchantDescriptor);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.service.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(user.userId, id);
  }
}
```

- [ ] **Step 4: Add the controller to the module**

In `subscriptions.module.ts`, import `SubscriptionsController` and add `controllers: [SubscriptionsController],` to the `@Module` decorator.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest subscriptions.controller -v`
Expected: PASS (all 6 tests).

- [ ] **Step 6: Full suite still green + commit**

Run: `cd backend && npx jest 2>&1 | tail -4`
Expected: all green (was 232 + new subscription specs).

```bash
git add backend/src/subscriptions/subscriptions.controller.ts backend/src/subscriptions/subscriptions.controller.spec.ts backend/src/subscriptions/subscriptions.module.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): subscriptions REST controller"
```

---

## Task 8: Renewal reminders (notifications scheduler)

**Files:**
- Modify: `backend/src/common/enums.ts` (add `SUBSCRIPTION_RENEWAL`)
- Create: `backend/src/subscriptions/renewal-reminder.ts` + `.spec.ts` (pure due-check)
- Modify: `backend/src/notifications/notifications.scheduler.ts` (daily pass)
- Modify: `backend/src/notifications/notifications.module.ts` (import `SubscriptionsModule`)

**Interfaces:**
- Consumes: `SubscriptionsService` (add `dueForReminder(userId, today)` + `markReminded(id, forDate)`), `NotificationsService.create`.
- Produces:
  - `enums.NotificationType.SUBSCRIPTION_RENEWAL = 'subscription_renewal'`
  - pure `isReminderDue(sub, today): boolean` in `renewal-reminder.ts`
  - `SubscriptionsService.dueForReminder(userId, today): Promise<Subscription[]>`
  - `SubscriptionsService.markReminded(id, forDate): Promise<void>`

- [ ] **Step 1: Add the enum value**

In `backend/src/common/enums.ts`, add to `NotificationType` (after `MUNSHI_SUGGESTION`):

```ts
  SUBSCRIPTION_RENEWAL = 'subscription_renewal',
```

- [ ] **Step 2: Write the failing pure-fn test**

```ts
// backend/src/subscriptions/renewal-reminder.spec.ts
import { isReminderDue } from './renewal-reminder';

const sub = (over: any = {}) => ({
  id: 's1', status: 'active', reminderDays: 2, nextRenewalDate: '2026-05-03',
  lastReminderSentFor: null, ...over,
});

describe('isReminderDue', () => {
  const today = new Date('2026-05-01T00:00:00Z');

  it('is due when renewal is within reminderDays', () => {
    expect(isReminderDue(sub(), today)).toBe(true);
  });
  it('is not due when renewal is further out than reminderDays', () => {
    expect(isReminderDue(sub({ nextRenewalDate: '2026-05-20' }), today)).toBe(false);
  });
  it('is not due when reminders are off', () => {
    expect(isReminderDue(sub({ reminderDays: null }), today)).toBe(false);
  });
  it('is not due when already reminded for this renewal', () => {
    expect(isReminderDue(sub({ lastReminderSentFor: '2026-05-03' }), today)).toBe(false);
  });
  it('is not due for paused subs', () => {
    expect(isReminderDue(sub({ status: 'paused' }), today)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest renewal-reminder -v`
Expected: FAIL ("Cannot find module './renewal-reminder'").

- [ ] **Step 4: Write the pure fn**

```ts
// backend/src/subscriptions/renewal-reminder.ts
import { Subscription } from './subscription.entity';

const dayOnly = (s: string): string => s.slice(0, 10);

export function isReminderDue(
  sub: Pick<Subscription, 'status' | 'reminderDays' | 'nextRenewalDate' | 'lastReminderSentFor'>,
  today: Date,
): boolean {
  if (sub.status !== 'active') return false;
  if (sub.reminderDays == null) return false;
  if (sub.lastReminderSentFor && dayOnly(sub.lastReminderSentFor) === dayOnly(sub.nextRenewalDate)) return false;
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const inDays = Math.round((new Date(dayOnly(sub.nextRenewalDate) + 'T00:00:00Z').getTime() - start) / 86400000);
  return inDays >= 0 && inDays <= sub.reminderDays;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest renewal-reminder -v`
Expected: PASS (all 5 tests).

- [ ] **Step 6: Add `dueForReminder` + `markReminded` to the service**

Append to `SubscriptionsService` (after `dismiss`):

```ts
  async dueForReminder(userId: string, today: Date): Promise<Subscription[]> {
    const subs = await this.subRepo.find({ where: { userId, status: 'active' as any } });
    return subs.filter((s) => isReminderDue(s, today));
  }

  async markReminded(id: string, forDate: string): Promise<void> {
    await this.subRepo.update({ id }, { lastReminderSentFor: forDate });
  }

  async allActiveUserIds(): Promise<string[]> {
    const subs = await this.subRepo.find({ where: { status: 'active' as any } });
    return [...new Set(subs.map((s) => s.userId))];
  }
```

Add the import at the top of `subscriptions.service.ts`:

```ts
import { isReminderDue } from './renewal-reminder';
```

- [ ] **Step 7: Wire the daily reminder pass into the scheduler**

Read `backend/src/notifications/notifications.scheduler.ts` first to match its constructor-injection and `safe()` wrapper style. Then:

1. Import `SubscriptionsService` and `NotificationType`, inject `SubscriptionsService` in the constructor.
2. Add a cron method mirroring the existing `runDailyMunshi` pattern:

```ts
  @Cron('0 9 * * *', { timeZone: 'Asia/Kolkata' })
  async runSubscriptionReminders(): Promise<void> {
    const userIds = await this.subscriptions.allActiveUserIds();
    for (const userId of userIds) {
      await this.safe(() => this.remindUser(userId));
    }
  }

  private async remindUser(userId: string): Promise<void> {
    const due = await this.subscriptions.dueForReminder(userId, new Date());
    for (const sub of due) {
      await this.notifications.create(userId, {
        type: NotificationType.SUBSCRIPTION_RENEWAL,
        title: `${sub.name} renews soon`,
        body: `₹${sub.amount} on ${sub.nextRenewalDate}`,
        data: { subscriptionId: sub.id },
      } as any);
      await this.subscriptions.markReminded(sub.id, sub.nextRenewalDate);
    }
  }
```

(Match the exact `notifications.create` signature the scheduler already uses — read `runDailyMunshi`/`generateMunshiForUser` for the real shape and adapt field names accordingly.)

- [ ] **Step 8: Import `SubscriptionsModule` into `NotificationsModule`**

In `backend/src/notifications/notifications.module.ts`, add `SubscriptionsModule` to `imports`. If a circular-import error appears, use `forwardRef(() => SubscriptionsModule)` on both sides.

- [ ] **Step 9: Verify + commit**

Run: `cd backend && npx jest notifications.scheduler renewal-reminder 2>&1 | tail -6`
Expected: PASS. Then full suite:
Run: `cd backend && npx jest 2>&1 | tail -4` → all green.

```bash
git add backend/src/common/enums.ts backend/src/subscriptions/renewal-reminder.ts backend/src/subscriptions/renewal-reminder.spec.ts backend/src/subscriptions/subscriptions.service.ts backend/src/notifications/notifications.scheduler.ts backend/src/notifications/notifications.module.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): live subscription renewal reminders via notifications scheduler"
```

---

## Task 9: Reverse-linking — attribute imported charges to existing subs

**Files:**
- Create: `backend/src/subscriptions/attach-transaction.ts` + `.spec.ts` (pure matcher)
- Modify: `backend/src/subscriptions/subscriptions.service.ts` (add `attachTransaction`)
- Create: `backend/src/subscriptions/subscriptions.listener.ts` + `.spec.ts` (`@OnEvent(TRANSACTION_CREATED)` → `attachTransaction`)
- Modify: `backend/src/subscriptions/subscriptions.module.ts` (register the listener as a provider)

**Approach (decoupled event listener, NOT create-site injection):** The app already emits `TRANSACTION_CREATED` (`{ userId, transaction }`) from `TransactionsService.create` (see `transactions.service.ts:165`) and `notifications.listener.ts` already consumes it via `@OnEvent(TRANSACTION_CREATED)`. We mirror that: a `SubscriptionsListener` handles the same event and calls `attachTransaction`. This covers ALL creation paths (SMS via the mobile→transactions endpoint, server-side statement import, and manual adds) with zero coupling and no circular-dependency risk, and it never touches the parallel-WIP `notification-sync.service.ts`. `EventEmitterModule.forRoot()` is already registered globally in `app.module.ts`, so a listener provider in `SubscriptionsModule` (already imported by `app.module`) fires automatically.

**Interfaces:**
- Consumes: `normalizeDescriptor`, `addCycle`, `TRANSACTION_CREATED` + `TransactionCreatedEvent` type (from `../notifications/notification-events`), `PaymentMethod`/`TransactionType` enums.
- Produces:
  - pure `matchSubscription(descriptor, accountId, subs): Subscription | null`
  - `SubscriptionsService.attachTransaction(userId, tx): Promise<void>` — links a newly created recurring charge to a matching sub and rolls `amount`/`nextRenewalDate`/`priceHistory` forward.
  - `SubscriptionsListener` — `@OnEvent(TRANSACTION_CREATED)`, gated to expense + recurring-signal charges, calls `attachTransaction` in try/catch.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/subscriptions/attach-transaction.spec.ts
import { matchSubscription } from './attach-transaction';

const sub = (over: any = {}) => ({ id: 's1', merchantDescriptor: 'netflix.com', accountId: 'a1', status: 'active', ...over });

describe('matchSubscription', () => {
  it('matches by normalized descriptor + account (4+ digit ref stripped)', () => {
    expect(matchSubscription('NETFLIX.COM 9982', 'a1', [sub()])?.id).toBe('s1');
  });
  it('does not match a different account', () => {
    expect(matchSubscription('NETFLIX.COM', 'a2', [sub()])).toBeNull();
  });
  it('does not match a cancelled subscription', () => {
    expect(matchSubscription('NETFLIX.COM', 'a1', [sub({ status: 'cancelled' })])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest attach-transaction -v`
Expected: FAIL ("Cannot find module './attach-transaction'").

- [ ] **Step 3: Write the pure matcher**

```ts
// backend/src/subscriptions/attach-transaction.ts
import { Subscription } from './subscription.entity';
import { normalizeDescriptor } from './detect-subscriptions';

export function matchSubscription(
  description: string,
  accountId: string | null,
  subs: Pick<Subscription, 'id' | 'merchantDescriptor' | 'accountId' | 'status'>[],
): Subscription | null {
  const key = normalizeDescriptor(description);
  const hit = subs.find(
    (s) => s.status === 'active' && s.merchantDescriptor === key && (s.accountId ?? null) === (accountId ?? null),
  );
  return (hit as Subscription) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes, then add the service method**

Run: `cd backend && npx jest attach-transaction -v` → PASS.

Append to `SubscriptionsService` (import `matchSubscription` and `addCycle` at top):

```ts
  /** Called after a recurring charge is created by SMS/statement import.
   * Links it to a matching active subscription and rolls the sub forward. */
  async attachTransaction(userId: string, tx: { id: string; description: string; amount: number; date: string; accountId: string | null }): Promise<void> {
    const subs = await this.subRepo.find({ where: { userId } });
    const match = matchSubscription(tx.description, tx.accountId, subs);
    if (!match) return;
    await this.txRepo.update({ id: tx.id, userId }, { subscriptionId: match.id });

    const amount = Math.abs(tx.amount);
    if (amount !== match.amount) {
      match.priceHistory = [...(match.priceHistory ?? [{ amount: match.amount, since: match.firstSeenDate }]), { amount, since: tx.date.slice(0, 10) }];
      match.amount = amount;
    }
    if (tx.date.slice(0, 10) >= match.nextRenewalDate) {
      match.nextRenewalDate = addCycle(tx.date, match.cycle);
    }
    await this.subRepo.save(match);
  }
```

Add imports: `import { matchSubscription } from './attach-transaction';` and extend the existing `import { ..., addCycle } from './detect-subscriptions';`.

- [ ] **Step 5: Write the failing listener test**

```ts
// backend/src/subscriptions/subscriptions.listener.spec.ts
import { SubscriptionsListener } from './subscriptions.listener';
import { PaymentMethod, TransactionType } from '../common/enums';

describe('SubscriptionsListener', () => {
  const tx = (over: any = {}) => ({
    id: 't1', description: 'NETFLIX.COM', amount: 649, date: new Date('2026-05-02'),
    type: TransactionType.EXPENSE, paymentMethod: PaymentMethod.AUTOPAY, isRecurring: false, accountId: 'a1',
    ...over,
  });

  function build() {
    const subscriptions = { attachTransaction: jest.fn(async () => undefined) };
    const listener = new SubscriptionsListener(subscriptions as any);
    return { listener, subscriptions };
  }

  it('attaches an autopay expense (mapping fields)', async () => {
    const { listener, subscriptions } = build();
    await listener.onTransactionCreated({ userId: 'u1', transaction: tx() } as any);
    expect(subscriptions.attachTransaction).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 't1', description: 'NETFLIX.COM', amount: 649, accountId: 'a1' }));
  });

  it('attaches an isRecurring expense even without autopay', async () => {
    const { listener, subscriptions } = build();
    await listener.onTransactionCreated({ userId: 'u1', transaction: tx({ paymentMethod: PaymentMethod.UPI, isRecurring: true }) } as any);
    expect(subscriptions.attachTransaction).toHaveBeenCalled();
  });

  it('ignores a non-recurring, non-autopay expense', async () => {
    const { listener, subscriptions } = build();
    await listener.onTransactionCreated({ userId: 'u1', transaction: tx({ paymentMethod: PaymentMethod.UPI, isRecurring: false }) } as any);
    expect(subscriptions.attachTransaction).not.toHaveBeenCalled();
  });

  it('ignores a non-expense transaction', async () => {
    const { listener, subscriptions } = build();
    await listener.onTransactionCreated({ userId: 'u1', transaction: tx({ type: TransactionType.TRANSFER }) } as any);
    expect(subscriptions.attachTransaction).not.toHaveBeenCalled();
  });

  it('swallows a failure from attachTransaction (never breaks tx creation)', async () => {
    const { listener, subscriptions } = build();
    subscriptions.attachTransaction.mockRejectedValueOnce(new Error('boom'));
    await expect(listener.onTransactionCreated({ userId: 'u1', transaction: tx() } as any)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd backend && npx jest subscriptions.listener -v`
Expected: FAIL ("Cannot find module './subscriptions.listener'").

- [ ] **Step 7: Write the listener**

```ts
// backend/src/subscriptions/subscriptions.listener.ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TRANSACTION_CREATED } from '../notifications/notification-events';
import type { TransactionCreatedEvent } from '../notifications/notification-events';
import { PaymentMethod, TransactionType } from '../common/enums';
import { SubscriptionsService } from './subscriptions.service';

/** Attributes a newly created recurring charge (SMS/statement/manual) to a
 * matching subscription. Mirrors NotificationsListener's TRANSACTION_CREATED
 * handler — fully decoupled from TransactionsService. */
@Injectable()
export class SubscriptionsListener {
  private readonly logger = new Logger(SubscriptionsListener.name);

  constructor(private readonly subscriptions: SubscriptionsService) {}

  @OnEvent(TRANSACTION_CREATED)
  async onTransactionCreated(e: TransactionCreatedEvent): Promise<void> {
    try {
      const tx = e.transaction;
      if (tx.type !== TransactionType.EXPENSE) return;
      // Only recurring-signal charges are subscription candidates.
      if (tx.paymentMethod !== PaymentMethod.AUTOPAY && !tx.isRecurring) return;
      await this.subscriptions.attachTransaction(e.userId, {
        id: tx.id,
        description: tx.description,
        amount: Number(tx.amount),
        date: new Date(tx.date).toISOString(),
        accountId: tx.accountId,
      });
    } catch (err) {
      this.logger.warn(
        `subscription attach failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
```

- [ ] **Step 8: Register the listener in the module**

In `backend/src/subscriptions/subscriptions.module.ts`, import `SubscriptionsListener` and add it to `providers` (alongside `SubscriptionsService`). No new imports are needed — `EventEmitterModule.forRoot()` is already global in `app.module.ts`.

- [ ] **Step 9: Verify + commit**

Run: `cd backend && npx jest attach-transaction subscriptions.listener subscriptions.service -v` → all green.
Run: `cd backend && npx jest 2>&1 | tail -4` → full suite green.

```bash
git add backend/src/subscriptions/attach-transaction.ts backend/src/subscriptions/attach-transaction.spec.ts backend/src/subscriptions/subscriptions.listener.ts backend/src/subscriptions/subscriptions.listener.spec.ts backend/src/subscriptions/subscriptions.service.ts backend/src/subscriptions/subscriptions.module.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): attribute created recurring charges to subscriptions via event listener"
```

---

## Task 10: Munshi `list_subscriptions` tool

**Files:**
- Create: `backend/src/ai-chat/tools/subscriptions.tools.ts`
- Test: `backend/src/ai-chat/tools/subscriptions.tools.spec.ts`
- Modify: `backend/src/ai-chat/tools/types.ts` (add `subscriptions` to `ToolCtx.svc`)
- Modify: `backend/src/ai-chat/tools/index.ts` (register)
- Modify: `backend/src/ai-chat/ai-chat.service.ts` (wire the service into `toolCtx`)
- Modify: `backend/src/ai-chat/ai-chat.module.ts` (import `SubscriptionsModule`)

**Interfaces:**
- Consumes: `SubscriptionsService.list`, `ToolCtx`.
- Produces: `subscriptionTools: RiddhiTool[]` with a `list_subscriptions` safe tool.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/ai-chat/tools/subscriptions.tools.spec.ts
import { subscriptionTools } from './subscriptions.tools';

describe('list_subscriptions tool', () => {
  const tool = subscriptionTools.find((t) => t.name === 'list_subscriptions')!;

  it('is registered and safe', () => {
    expect(tool).toBeDefined();
    expect(tool.risk).toBe('safe');
  });

  it('returns burn + active subs', async () => {
    const ctx: any = {
      userId: 'u1',
      svc: { subscriptions: { list: jest.fn(async () => ({
        subscriptions: [{ id: 's1', name: 'Netflix', amount: 649, cycle: 'monthly', status: 'active', nextRenewalDate: '2026-05-10' }],
        summary: { monthlyBurn: 649, yearlyProjection: 7788, activeCount: 1, upcoming: [], flags: [] },
      })) } },
    };
    const res = await tool.handler(ctx, {});
    expect((res.data as any).monthlyBurn).toBe(649);
    expect((res.data as any).subscriptions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest subscriptions.tools -v`
Expected: FAIL ("Cannot find module './subscriptions.tools'").

- [ ] **Step 3: Add `subscriptions` to `ToolCtx.svc`**

In `backend/src/ai-chat/tools/types.ts`, import `SubscriptionsService` and add `subscriptions: SubscriptionsService;` to the `svc` object of `ToolCtx`.

- [ ] **Step 4: Write the tool**

```ts
// backend/src/ai-chat/tools/subscriptions.tools.ts
import { RiddhiTool, inr, schema } from './types';

export const subscriptionTools: RiddhiTool[] = [
  {
    name: 'list_subscriptions',
    description:
      'Call this when the user asks about their subscriptions, recurring payments, monthly subscription burn, or upcoming renewals.',
    label: 'Checking your subscriptions…',
    inputSchema: schema({}),
    risk: 'safe',
    handler: async (ctx) => {
      const { subscriptions, summary } = await ctx.svc.subscriptions.list(ctx.userId);
      const active = subscriptions.filter((s: any) => s.status === 'active');
      return {
        data: {
          monthlyBurn: summary.monthlyBurn,
          yearlyProjection: summary.yearlyProjection,
          activeCount: summary.activeCount,
          upcoming: summary.upcoming,
          subscriptions: active.map((s: any) => ({
            id: s.id, name: s.name, amount: s.amount, cycle: s.cycle, nextRenewalDate: s.nextRenewalDate,
          })),
        },
        summary: `Subscription burn ${inr(summary.monthlyBurn)}/mo`,
      };
    },
  },
];
```

- [ ] **Step 5: Register in `index.ts` and wire the service in `ai-chat.service.ts`**

In `tools/index.ts`: import `subscriptionTools` and spread it into `TOOL_REGISTRY` (the array is `.sort()`ed afterwards, so order does not matter).

In `ai-chat.service.ts`: inject `SubscriptionsService` (constructor param, mirroring `creditCardService`) and add `subscriptions: this.subscriptionsService,` to the `svc` object in `toolCtx(userId)`.

In `ai-chat.module.ts`: add `SubscriptionsModule` to `imports`.

- [ ] **Step 6: Run test + full suite, then commit**

Run: `cd backend && npx jest subscriptions.tools tools.spec 2>&1 | tail -6` → PASS.
Run: `cd backend && npx jest 2>&1 | tail -4` → all green.

```bash
git add backend/src/ai-chat/tools/subscriptions.tools.ts backend/src/ai-chat/tools/subscriptions.tools.spec.ts backend/src/ai-chat/tools/types.ts backend/src/ai-chat/tools/index.ts backend/src/ai-chat/ai-chat.service.ts backend/src/ai-chat/ai-chat.module.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): Munshi list_subscriptions tool"
```

---

## Task 11: Mobile `api.subscriptions` surface

**Files:**
- Create: `mobile/src/api/subscriptions.ts`
- Test: `mobile/src/api/subscriptions.spec.ts`
- Modify: `mobile/src/api/index.ts` (export `subscriptions`)

**Interfaces:**
- Consumes: `apiClient` from `./client`.
- Produces: `subscriptionsApi` with `detect()`, `list()`, `create(payload)`, `update(id, patch)`, `remove(id)`, `dismiss(descriptor)`; view types `SubView`, `SubCandidateView`, `SubSummaryView`, `SubFlagView`, `SubListView`.

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/api/subscriptions.spec.ts
import { mapSubList } from './subscriptions';

describe('mapSubList', () => {
  it('maps the backend list+summary payload to the view model', () => {
    const view = mapSubList({
      subscriptions: [{ id: 's1', name: 'Netflix', emoji: '🎬', color: '#c97d8c', amount: 649, cycle: 'monthly', status: 'active', nextRenewalDate: '2026-05-10', firstSeenDate: '2025-01-01', priceHistory: null, accountId: 'a1', paymentMethod: 'card' }],
      summary: { monthlyBurn: 649, yearlyProjection: 7788, activeCount: 1, upcoming: [{ subId: 's1', nextRenewalDate: '2026-05-10', inDays: 9, amount: 649 }], flags: [] },
    });
    expect(view.monthlyBurn).toBe(649);
    expect(view.subscriptions[0].name).toBe('Netflix');
    expect(view.upcoming[0].inDays).toBe(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest api/subscriptions -v`
Expected: FAIL ("Cannot find module './subscriptions'").

- [ ] **Step 3: Write the api module**

```ts
// mobile/src/api/subscriptions.ts
import { apiClient } from './client';

export type SubCycle = 'monthly' | 'yearly';
export type SubStatus = 'active' | 'paused' | 'cancelled';

export interface SubView {
  id: string; name: string; emoji: string; color: string;
  amount: number; cycle: SubCycle; status: SubStatus;
  nextRenewalDate: string; firstSeenDate: string;
  priceHistory: { amount: number; since: string }[] | null;
  accountId: string | null; paymentMethod: string | null;
  reminderDays?: number | null; detailOpenedAt?: string | null;
}

export interface SubCandidateView {
  merchantDescriptor: string; rawDescription: string; name: string; emoji: string; color: string;
  amount: number; cycle: SubCycle; nextRenewalDate: string; firstSeenDate: string;
  accountId: string | null; paymentMethod: string | null; categoryId: string;
  priceHistory: { amount: number; since: string }[]; transactionIds: string[]; occurrences: number;
}

export type SubFlagView =
  | { subId: string; name: string; kind: 'hike'; from: number; to: number; pct: number; extraYearly: number }
  | { subId: string; name: string; kind: 'renewal_soon'; inDays: number; amount: number }
  | { subId: string; name: string; kind: 'forgotten'; yearlyCost: number };

export interface SubSummaryView {
  monthlyBurn: number; yearlyProjection: number; activeCount: number;
  upcoming: { subId: string; nextRenewalDate: string; inDays: number; amount: number }[];
  flags: SubFlagView[];
}

export interface SubListView extends SubSummaryView { subscriptions: SubView[] }

export function mapSubList(raw: { subscriptions: SubView[]; summary: SubSummaryView }): SubListView {
  return { ...raw.summary, subscriptions: raw.subscriptions };
}

export const subscriptionsApi = {
  async detect(): Promise<SubCandidateView[]> {
    return apiClient.get<SubCandidateView[]>('/subscriptions/detect');
  },
  async list(): Promise<SubListView> {
    const raw = await apiClient.get<{ subscriptions: SubView[]; summary: SubSummaryView }>('/subscriptions');
    return mapSubList(raw);
  },
  async create(payload: Partial<SubCandidateView> & { name: string; merchantDescriptor: string; amount: number; cycle: SubCycle; nextRenewalDate: string; firstSeenDate: string }): Promise<SubView> {
    return apiClient.post<SubView>('/subscriptions', payload);
  },
  async update(id: string, patch: Partial<{ name: string; amount: number; cycle: SubCycle; status: SubStatus; nextRenewalDate: string; accountId: string | null; reminderDays: number | null; markDetailOpened: boolean }>): Promise<SubView> {
    return apiClient.patch<SubView>(`/subscriptions/${id}`, patch);
  },
  async remove(id: string): Promise<void> {
    await apiClient.delete<void>(`/subscriptions/${id}`);
  },
  async dismiss(merchantDescriptor: string): Promise<void> {
    await apiClient.post<void>('/subscriptions/dismiss', { merchantDescriptor });
  },
};
```

- [ ] **Step 4: Export from `api/index.ts`**

Add `export { subscriptionsApi } from './subscriptions';` and re-export the view types. If screens consume the `api` aggregate object, attach `subscriptions: subscriptionsApi` to it (match how `cards`/`statements` are attached — read `api/index.ts` around the `cards:` surface).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd mobile && npx jest api/subscriptions -v`
Expected: PASS.

- [ ] **Step 6: tsc + commit**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep subscriptions` → no output.

```bash
git add mobile/src/api/subscriptions.ts mobile/src/api/subscriptions.spec.ts mobile/src/api/index.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(mobile): api.subscriptions surface + adapters"
```

---

## Task 12: Mobile pure view helpers — `screens/subscriptions.ts`

**Files:**
- Create: `mobile/src/screens/subscriptions.ts`
- Test: `mobile/src/screens/subscriptions.spec.ts`

**Interfaces:**
- Consumes: `SubView`, `SubCandidateView`, `SubFlagView` from `../api/subscriptions`.
- Produces:
  - `formatInr(n: number): string`
  - `payTag(sub: { paymentMethod: string | null }): { label: string; icon: 'card' | 'bank' | 'upi' }`
  - `candidateToCreatePayload(c: SubCandidateView, reminderDays: number | null): CreateSubPayload`
  - `filterByTab(subs: SubView[], tab: 'all' | 'active' | 'paused'): SubView[]`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/screens/subscriptions.spec.ts
import { formatInr, payTag, candidateToCreatePayload, filterByTab } from './subscriptions';

describe('subscription view helpers', () => {
  it('formats INR', () => {
    expect(formatInr(1499)).toBe('₹1,499');
  });
  it('maps payment method to a tag', () => {
    expect(payTag({ paymentMethod: 'card' }).icon).toBe('card');
    expect(payTag({ paymentMethod: 'upi' }).icon).toBe('upi');
  });
  it('builds a create payload from a candidate', () => {
    const c: any = { name: 'Netflix', merchantDescriptor: 'netflix.com', amount: 649, cycle: 'monthly', nextRenewalDate: '2026-05-10', firstSeenDate: '2025-01-01', emoji: '🎬', color: '#c97d8c', accountId: 'a1', paymentMethod: 'card', categoryId: 'cat', transactionIds: ['t1', 't2'] };
    const p = candidateToCreatePayload(c, 2);
    expect(p.transactionIds).toEqual(['t1', 't2']);
    expect(p.reminderDays).toBe(2);
  });
  it('filters by tab', () => {
    const subs: any = [{ id: '1', status: 'active' }, { id: '2', status: 'paused' }, { id: '3', status: 'cancelled' }];
    expect(filterByTab(subs, 'all').map((s: any) => s.id)).toEqual(['1', '2']); // excludes cancelled
    expect(filterByTab(subs, 'paused').map((s: any) => s.id)).toEqual(['2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest screens/subscriptions -v`
Expected: FAIL ("Cannot find module './subscriptions'").

- [ ] **Step 3: Write the helpers**

```ts
// mobile/src/screens/subscriptions.ts
import { SubView, SubCandidateView } from '../api/subscriptions';

export function formatInr(n: number): string {
  return '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');
}

export function payTag(sub: { paymentMethod: string | null }): { label: string; icon: 'card' | 'bank' | 'upi' } {
  const pm = (sub.paymentMethod ?? '').toLowerCase();
  if (pm === 'card' || pm === 'credit_card') return { label: 'Card', icon: 'card' };
  if (pm === 'netbanking' || pm === 'ach' || pm === 'bank') return { label: 'Bank', icon: 'bank' };
  return { label: 'UPI', icon: 'upi' };
}

export interface CreateSubPayload {
  name: string; merchantDescriptor: string; emoji: string; color: string;
  amount: number; cycle: 'monthly' | 'yearly'; nextRenewalDate: string; firstSeenDate: string;
  accountId: string | null; paymentMethod: string | null; categoryId: string;
  reminderDays: number | null; transactionIds: string[];
}

export function candidateToCreatePayload(c: SubCandidateView, reminderDays: number | null): CreateSubPayload {
  return {
    name: c.name, merchantDescriptor: c.merchantDescriptor, emoji: c.emoji, color: c.color,
    amount: c.amount, cycle: c.cycle, nextRenewalDate: c.nextRenewalDate, firstSeenDate: c.firstSeenDate,
    accountId: c.accountId, paymentMethod: c.paymentMethod, categoryId: c.categoryId,
    reminderDays, transactionIds: c.transactionIds,
  };
}

export function filterByTab(subs: SubView[], tab: 'all' | 'active' | 'paused'): SubView[] {
  const visible = subs.filter((s) => s.status !== 'cancelled');
  if (tab === 'active') return visible.filter((s) => s.status === 'active');
  if (tab === 'paused') return visible.filter((s) => s.status === 'paused');
  return visible;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest screens/subscriptions -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/subscriptions.ts mobile/src/screens/subscriptions.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(mobile): subscription view helpers"
```

---

## Task 13: Subscriptions screen + detail sheet + nav registration

**Files:**
- Create: `mobile/src/screens/Subscriptions.tsx`
- Create: `mobile/src/screens/SubDetailSheet.tsx`
- Modify: `mobile/src/app/navContext.tsx` (add `'subscriptions'` to `ScreenKind`)
- Modify: `mobile/src/app/screens.tsx` (register the screen)

**Interfaces:**
- Consumes: `subscriptionsApi`, view helpers from `screens/subscriptions`, `useNav()` from `app/navContext`.
- Produces: `Subscriptions` and `SubDetailSheet` components; screen kind `'subscriptions'`.

- [ ] **Step 1: Add the screen kind**

In `mobile/src/app/navContext.tsx`, add `| 'subscriptions'` and `| 'subscriptions-review'` to the `ScreenKind` union (near `'card-detail'`, line ~35).

- [ ] **Step 2: Build the Subscriptions screen**

Port `project/riddhi/MobileSubs.jsx` to React Native, binding to `subscriptionsApi.list()`. Read an existing ported screen (`mobile/src/screens/CardDetail.tsx`) first to match the app's RN component conventions (theme tokens, `useNav`, `ScrollView`, `Pressable`, `StyleSheet`). The screen must render:
- a burn hero (monthly burn via `formatInr`, yearly, active count, this-month total from `upcoming` where `inDays <= 30`);
- a "Worth a look" flags section from `summary.flags` (📈 hike / 🗓️ renewal_soon / 💤 forgotten), each row `Pressable` → opens `SubDetailSheet` for that sub;
- an "Upcoming charges" timeline from `summary.upcoming` (join to `subscriptions` by `subId`);
- an "All subscriptions" list with an All/Active/Paused segmented control driven by `filterByTab`;
- a header overflow menu with "Detect from transactions" → `nav('subscriptions-review')` and "Add subscription" → `nav('subscriptions-review')` (manual add lives in the review screen).

Key data wiring (real code the screen must contain):

```tsx
const [data, setData] = useState<SubListView | null>(null);
const [detail, setDetail] = useState<SubView | null>(null);
const [tab, setTab] = useState<'all' | 'active' | 'paused'>('all');

const load = useCallback(async () => {
  setData(await subscriptionsApi.list());
}, []);
useEffect(() => { load(); }, [load]);

const subs = data?.subscriptions ?? [];
const list = filterByTab(subs, tab);
const subById = new Map(subs.map((s) => [s.id, s]));
```

- [ ] **Step 3: Build the detail sheet**

`SubDetailSheet.tsx` renders the selected sub (cost grid, next charge, cycle, flags) and actions wired to the API:

```tsx
const pauseResume = async () => {
  await subscriptionsApi.update(sub.id, { status: sub.status === 'active' ? 'paused' : 'active' });
  await onChanged();
  onClose();
};
const cancel = async () => {
  await subscriptionsApi.update(sub.id, { status: 'cancelled' });
  await onChanged();
  onClose();
};
const toggleRemind = async () => {
  await subscriptionsApi.update(sub.id, { reminderDays: sub.reminderDays == null ? 2 : null });
  await onChanged();
};
```

When the sheet mounts, stamp the "opened" signal so the possibly-forgotten flag clears:

```tsx
useEffect(() => {
  if (!sub.detailOpenedAt) subscriptionsApi.update(sub.id, { markDetailOpened: true }).catch(() => {});
}, [sub.id]);
```

Mirror `PayBillSheet.tsx` for the bottom-sheet chrome and button styles.

- [ ] **Step 4: Register the screen**

In `mobile/src/app/screens.tsx`: `import { Subscriptions } from '../screens/Subscriptions';` and add `'subscriptions': Subscriptions,` to `SCREEN_REGISTRY`.

- [ ] **Step 5: Verify tsc + drive the screen**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -i "subscriptions\|SubDetail"` → no output.
(RN screens have no jest coverage — verify by `npx tsc --noEmit` clean and, if a device/emulator is available, navigate to the screen.)

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/Subscriptions.tsx mobile/src/screens/SubDetailSheet.tsx mobile/src/app/navContext.tsx mobile/src/app/screens.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(mobile): Subscriptions screen + detail sheet + nav registration"
```

---

## Task 14: Detection review screen + manual add + entry point

**Files:**
- Create: `mobile/src/screens/SubscriptionsReview.tsx`
- Modify: `mobile/src/app/screens.tsx` (register `'subscriptions-review'`)
- Modify: a Home/menu entry point so the screen is reachable (see step 4).

**Interfaces:**
- Consumes: `subscriptionsApi.detect/create/dismiss`, `candidateToCreatePayload`.
- Produces: `SubscriptionsReview` component; screen kind `'subscriptions-review'` registered.

- [ ] **Step 1: Build the review screen**

Read `mobile/src/screens/StatementReviewScreen.tsx` first to mirror the app's "review then add" list pattern. The screen must:
- on mount, call `subscriptionsApi.detect()` and render each candidate as a card (name/emoji, amount + cycle, occurrences, payment tag, "since" date);
- **Editable name before confirm** — aggregator candidates often arrive with a generic name ("Google Play") when no notification enrichment matched, so each card's name must be tappable/editable (a `TextInput` prefilled with `c.name`); the edited name flows into the create payload. This satisfies the spec's "edit name/emoji before saving." A small hint chip shows the amount so the user knows which aggregator sub this is (e.g. "Google Play · ₹99/yr" → rename to "Truecaller").
- **Confirm** → `subscriptionsApi.create({ ...candidateToCreatePayload(c, null), name: editedName })`, then remove the row (with the app's confirm/dismiss animation used by the SMS/statement review lists);
- **Dismiss** → `subscriptionsApi.dismiss(c.merchantDescriptor)`, then remove the row;
- a "Confirm all" action that creates every remaining candidate;
- a "Add manually" entry that opens a small form (name, amount, cycle, next date, account) building a `CreateSubPayload` with `transactionIds: []` and `merchantDescriptor` = the entered name.

Real wiring the screen must contain:

```tsx
const [candidates, setCandidates] = useState<SubCandidateView[]>([]);
useEffect(() => { subscriptionsApi.detect().then(setCandidates).catch(() => setCandidates([])); }, []);

const confirm = async (c: SubCandidateView) => {
  await subscriptionsApi.create(candidateToCreatePayload(c, null));
  setCandidates((prev) => prev.filter((x) => x.merchantDescriptor !== c.merchantDescriptor));
};
const dismiss = async (c: SubCandidateView) => {
  await subscriptionsApi.dismiss(c.merchantDescriptor);
  setCandidates((prev) => prev.filter((x) => x.merchantDescriptor !== c.merchantDescriptor));
};
```

- [ ] **Step 2: Register the screen**

In `mobile/src/app/screens.tsx`: `import { SubscriptionsReview } from '../screens/SubscriptionsReview';` and add `'subscriptions-review': SubscriptionsReview,`.

- [ ] **Step 3: Verify tsc**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -i "SubscriptionsReview\|subscriptions-review"` → no output.

- [ ] **Step 4: Add an entry point**

Add a menu row so Subscriptions is reachable. Read `mobile/src/app/MoreSheet.tsx` (the "More" menu) and add a row: label "Subscriptions", tapping it calls `nav('subscriptions')`. If a Home money-management section is more appropriate, add it there instead — match the existing row style. Do NOT restructure navigation; add one row.

- [ ] **Step 5: Full verification + commit**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -v "node_modules"` → clean (0 errors; parallel WIP suites aside).
Run: `cd mobile && npx jest 2>&1 | tail -4` → the subscription specs pass (a pre-existing failing parallel suite `theme/tokens.spec.ts` is unrelated WIP).
Run: `cd backend && npx jest 2>&1 | tail -4` → all green.

```bash
git add mobile/src/screens/SubscriptionsReview.tsx mobile/src/app/screens.tsx mobile/src/app/MoreSheet.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(mobile): subscription detection review + manual add + entry point"
```

---

## Final verification

- [ ] Backend: `cd backend && npx jest` → all green (232 baseline + new subscription suites).
- [ ] Backend: `cd backend && npx tsc --noEmit 2>&1 | grep -v "auth.service.spec.ts"` → no output.
- [ ] Mobile: `cd mobile && npx jest 2>&1 | tail -4` → subscription suites green (ignore the pre-existing parallel `tokens.spec.ts` WIP failure).
- [ ] Mobile: `cd mobile && npx tsc --noEmit` → 0 errors.
- [ ] Manual/device (user-driven, if hardware available): open Subscriptions from the menu → burn hero renders; "Detect from transactions" surfaces candidates; confirm one → it appears in the list; open its detail → pause/resume/remind/cancel work; a confirmed sub's detail opening clears the forgotten flag.

## Cross-module consistency checklist (spec §6)

- [x] Munshi: `list_subscriptions` tool (Task 10).
- [x] SMS/statement reverse-linking (Task 9).
- [ ] Reports/insights subscription-burn line — **out of this plan's core**; the `Subscriptions` category already aggregates these charges in budgets/reports, so no new backend wiring is required. If a dedicated "subscription burn" report line is wanted, add it as a follow-up.
- [x] Budgets: confirmed subs' charges carry the `Subscriptions` category (create defaults `categoryId` to it) — Task 6.
- [x] CSV export: unchanged (subscriptions are a view over already-exported transactions) — spec §6.
- [x] Slice E home widget: reads `computeSubscriptionSummary` — built later.
