# Credit-card management + pay-bill/settlement (Slice B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each credit card a management view — outstanding & available limit, this-cycle spends by category, statement due / min due / days-left, cashback, and a one-tap Pay bill that settles the card as a transfer (no double-count) — plus Munshi awareness of card dues.

**Architecture:** A new `CreditCard` entity (1:1 with a credit `Account`) holds config + optional exact-statement overrides. A pure `computeCardSummary()` derives everything else from the ledger (`outstanding = −balance`, `unbilled` = card expenses since the last statement day, `billed = outstanding − unbilled` unless an override is current). Pay bill = a `transfer` (bank → card) via the existing transaction path — already balance-correct and expense-excluded. Mobile gets a dedicated `CardDetail` screen + `PayBillSheet`.

**Tech Stack:** NestJS + TypeORM + Postgres (backend, jest); Expo SDK 56 / React Native + TypeScript (mobile, ts-jest pure-logic harness from Slice A).

## Global Constraints

- **DB:** `synchronize: true` — new entity/columns auto-apply; **no migration files**.
- **Sign convention (already in the app):** a credit `Account.balance` is **negative**, magnitude = outstanding. Swipes (expenses, `accountId`=card) push it more negative; transfers into the card push it toward zero. Do not change this.
- **No double-count:** a card-bill payment is a `type='transfer'` with `destinationAccountId` = the card account. Transfers are already excluded from expense totals — **introduce no new "settlement" flag.**
- **Transfers need a `categoryId`** (the column is non-null) — resolve one server-side via `CategoriesService.findAll` (prefer a category named "Other" case-insensitively, else the first; 400 if the user has none).
- **Module wiring (avoid cycles):** `TransactionsModule` imports `AccountsModule`. Put card read/pay routes in a new `CreditCardModule` that imports `AccountsModule` + `TransactionsModule` + `CategoriesModule`. Register the `CreditCard` entity in **`AccountsModule`** too (so `AccountsService` can create the row) — never make `AccountsModule` import `CreditCardModule`.
- **Commit prefs:** author email `gairola.ashutosh26@gmail.com`; **no `Co-Authored-By`**; `docs/` force-added; `git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify`. Commit only your task's files (branch has unrelated uncommitted files + parallel commits — never `git add -A`; never commit `mobile/.env`).
- **Known noise:** a pre-existing unrelated tsc error in `backend/src/auth/auth.service.spec.ts` — ignore it.
- **Mobile:** consult `https://docs.expo.dev/versions/v56.0.0/` before mobile code (per `mobile/AGENTS.md`). RN UI verified by `npx tsc --noEmit` + driving the app; pure logic unit-tested via the existing ts-jest harness.
- **Spec:** `docs/superpowers/specs/2026-07-08-credit-card-management-design.md`.

---

## File Structure

**Backend (create):** `credit-card/credit-card.entity.ts`, `credit-card/card-summary.ts` (pure math), `credit-card/card-summary.spec.ts`, `credit-card/credit-card.service.ts`, `credit-card/credit-card.controller.ts`, `credit-card/credit-card.module.ts`, `credit-card/dto/update-card.dto.ts`, `credit-card/dto/pay-card.dto.ts`, `credit-card/credit-card.pay.spec.ts`.
**Backend (modify):** `accounts/account.entity.ts` (inverse relation, optional), `accounts/accounts.module.ts` (register CreditCard), `accounts/accounts.service.ts` (+ card-row create), `accounts/dto/create-account.dto.ts` (+ optional card fields), `app.module.ts` (register CreditCardModule), `ai-chat/prompt.ts` + `ai-chat/ai-chat.service.ts` (+ card-dues snapshot), `ai-chat/tools/accounts.tools.ts` (+ card fields).
**Mobile (create):** `screens/CardDetail.tsx`, `app/PayBillSheet.tsx` (or `components/`), `api/cards` methods (in `api/index.ts`).
**Mobile (modify):** `api/types.ts` (CardSummary types), `api/index.ts` (`api.cards`), `app/navContext.tsx` (+ `card-detail` kind), `app/screens.tsx` (registry), `screens/Accounts.tsx` (credit branch + add-card fields + due hint).

---

## Task 1: CreditCard entity + row creation on credit-account create

**Files:**
- Create: `backend/src/credit-card/credit-card.entity.ts`
- Modify: `backend/src/accounts/accounts.module.ts`, `backend/src/accounts/accounts.service.ts`, `backend/src/accounts/dto/create-account.dto.ts`
- Create: `backend/src/accounts/credit-card-create.spec.ts`

**Interfaces:**
- Produces: `CreditCard` entity; `AccountsService.create` also inserts a `CreditCard` row when `dto.type === 'credit'`.

- [ ] **Step 1: Create the entity.** `backend/src/credit-card/credit-card.entity.ts`:

```ts
import {
  Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Account } from '../accounts/account.entity';

const num = {
  type: 'numeric' as const, precision: 18, scale: 2,
  transformer: { to: (v: number) => v, from: (v: string | null) => (v == null ? null : parseFloat(v)) },
};

@Entity('credit_card')
export class CreditCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  accountId: string;

  @OneToOne(() => Account, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountId' })
  account: Account;

  @Column({ ...num, default: 0 })
  creditLimit: number;

  @Column({ type: 'int', default: 1 })
  statementDay: number;

  @Column({ type: 'int', default: 18 })
  graceDays: number;

  @Column({ type: 'varchar', length: 40, nullable: true })
  network: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  last4: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  rewardRate: string | null;

  // Optional exact-statement override (set by import/manual)
  @Column({ type: 'date', nullable: true })
  statementDate: string | null;

  @Column({ ...num, nullable: true })
  statementBilled: number | null;

  @Column({ ...num, nullable: true })
  statementMinDue: number | null;

  @Column({ type: 'date', nullable: true })
  statementDueDate: string | null;

  @Column({ ...num, nullable: true })
  statementRewards: number | null;

  @Column({ type: 'uuid' })
  userId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Register the entity in AccountsModule.** In `accounts.module.ts`, import `CreditCard` and add it to `forFeature`:

```ts
import { CreditCard } from '../credit-card/credit-card.entity';
```
```ts
  imports: [TypeOrmModule.forFeature([Account, CreditCard])],
```

- [ ] **Step 3: Extend the create-account DTO.** In `accounts/dto/create-account.dto.ts`, add optional card fields (after `color`):

```ts
  @IsOptional()
  @IsNumber()
  creditLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  statementDay?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  graceDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  last4?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  network?: string;
```
Add `IsInt, Min, Max` to the `class-validator` import.

- [ ] **Step 4: Write the failing test.** `backend/src/accounts/credit-card-create.spec.ts`:

```ts
import { AccountsService } from './accounts.service';
import { AccountType } from '../common/enums';

function makeService() {
  const saved: any = { id: 'acc-1', type: AccountType.CREDIT };
  const accountsRepo = { create: (d: any) => ({ ...d, id: 'acc-1' }), save: jest.fn(async () => saved) } as any;
  const cardRows: any[] = [];
  const cardRepo = { create: (d: any) => d, save: jest.fn(async (r: any) => { cardRows.push(r); return r; }) } as any;
  return { svc: new AccountsService(accountsRepo, cardRepo), cardRows, accountsRepo };
}

describe('AccountsService credit-card row creation', () => {
  it('creates a CreditCard row for a credit account with the given config', async () => {
    const { svc, cardRows } = makeService();
    await svc.create('user-1', { name: 'ICICI', type: AccountType.CREDIT, balance: -1000, creditLimit: 200000, statementDay: 18 } as any);
    expect(cardRows).toHaveLength(1);
    expect(cardRows[0]).toMatchObject({ accountId: 'acc-1', userId: 'user-1', creditLimit: 200000, statementDay: 18 });
  });
  it('does not create a CreditCard row for a non-credit account', async () => {
    const { svc, cardRows } = makeService();
    await svc.create('user-1', { name: 'HDFC', type: AccountType.SAVINGS, balance: 1000 } as any);
    expect(cardRows).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Run it — expect failure.**

Run: `cd backend && npx jest accounts/credit-card-create`
Expected: FAIL — `AccountsService` constructor takes 1 arg / no card repo.

- [ ] **Step 6: Implement.** In `accounts.service.ts`, inject the card repository and create the row. Update imports + constructor:

```ts
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditCard } from '../credit-card/credit-card.entity';
import { AccountType } from '../common/enums';
```
```ts
  constructor(
    private readonly accountsRepository: AccountsRepository,
    @InjectRepository(CreditCard)
    private readonly creditCardRepository: Repository<CreditCard>,
  ) {}
```
In `create`, after `const account = ... save(account)`, replace the return with:

```ts
    const saved = await this.accountsRepository.save(account);
    if (dto.type === AccountType.CREDIT) {
      const card = this.creditCardRepository.create({
        accountId: saved.id,
        userId,
        creditLimit: dto.creditLimit ?? 0,
        statementDay: dto.statementDay ?? 1,
        graceDays: dto.graceDays ?? 18,
        last4: dto.last4 ?? null,
        network: dto.network ?? null,
      });
      await this.creditCardRepository.save(card);
    }
    return saved;
```

- [ ] **Step 7: Run it — expect pass.**

Run: `cd backend && npx jest accounts/credit-card-create`
Expected: PASS (2 tests).

- [ ] **Step 8: Full suite + commit.**

Run: `cd backend && npx jest` → all pass.
```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add backend/src/credit-card/credit-card.entity.ts backend/src/accounts/accounts.module.ts backend/src/accounts/accounts.service.ts backend/src/accounts/dto/create-account.dto.ts backend/src/accounts/credit-card-create.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -m "feat(cards): CreditCard entity + row creation on credit-account create"
```

---

## Task 2: computeCardSummary pure cycle math (TDD)

**Files:**
- Create: `backend/src/credit-card/card-summary.ts`, `backend/src/credit-card/card-summary.spec.ts`

**Interfaces:**
- Produces: the types and `computeCardSummary(...)` below — consumed by Task 3 (service) and mirrored by the mobile adapter (Task 6).

- [ ] **Step 1: Write the failing test.** `backend/src/credit-card/card-summary.spec.ts`:

```ts
import { computeCardSummary, CardConfig, CardTxn } from './card-summary';

const cfg = (o: Partial<CardConfig> = {}): CardConfig => ({
  creditLimit: 200000, statementDay: 18, graceDays: 18,
  statementDate: null, statementBilled: null, statementMinDue: null,
  statementDueDate: null, statementRewards: null, ...o,
});
const cats = new Map([['c1', { id: 'c1', name: 'Shopping', color: '#c97d8c' }]]);
const today = new Date('2026-04-25T00:00:00Z');

describe('computeCardSummary', () => {
  it('derives outstanding/available/usedPct from a negative balance', () => {
    const s = computeCardSummary(cfg(), -34280, [], cats, today);
    expect(s.outstanding).toBe(34280);
    expect(s.available).toBe(165720);
    expect(s.usedPct).toBe(17);
  });
  it('sums unbilled from card expenses on/after the last statement day', () => {
    const txns: CardTxn[] = [
      { amount: 2499, date: '2026-04-23', type: 'expense', categoryId: 'c1', isPaymentIn: false },
      { amount: 500, date: '2026-04-10', type: 'expense', categoryId: 'c1', isPaymentIn: false }, // before 04-18 -> billed
    ];
    const s = computeCardSummary(cfg(), -2999, txns, cats, today);
    expect(s.lastStatementDate).toBe('2026-04-18');
    expect(s.unbilled).toBe(2499);
    expect(s.billed).toBe(500);
    expect(s.cycleByCategory).toEqual([{ categoryId: 'c1', label: 'Shopping', value: 2499, color: '#c97d8c' }]);
  });
  it('computed minDue is 5% of billed floored at 100; dueDate is statement+grace', () => {
    const s = computeCardSummary(cfg(), -34280, [], cats, today);
    expect(s.billed).toBe(34280);           // no unbilled txns
    expect(s.minDue).toBe(1714);            // round(34280*0.05)
    expect(s.dueDate).toBe('2026-05-06');   // 04-18 + 18d
    expect(s.hasBill).toBe(true);
  });
  it('honours a current-cycle override minus payments since the statement date', () => {
    const txns: CardTxn[] = [
      { amount: 5000, date: '2026-04-20', type: 'transfer', categoryId: 'c1', isPaymentIn: true },
    ];
    const s = computeCardSummary(
      cfg({ statementDate: '2026-04-18', statementBilled: 34280, statementMinDue: 1720, statementDueDate: '2026-05-05', statementRewards: 412 }),
      -29280, txns, cats, today,
    );
    expect(s.billed).toBe(29280);           // 34280 - 5000 paid
    expect(s.minDue).toBe(1720);
    expect(s.dueDate).toBe('2026-05-05');
    expect(s.rewardsThisCycle).toBe(412);
  });
  it('ignores a stale override (statementDate != last statement date)', () => {
    const s = computeCardSummary(cfg({ statementDate: '2026-03-18', statementBilled: 99999, statementDueDate: '2026-04-05' }), -34280, [], cats, today);
    expect(s.dueDate).toBe('2026-05-06');   // computed, not the stale override
    expect(s.billed).toBe(34280);
  });
  it('crosses the year boundary for lastStatementDate', () => {
    const s = computeCardSummary(cfg({ statementDay: 18 }), 0, [], cats, new Date('2026-01-05T00:00:00Z'));
    expect(s.lastStatementDate).toBe('2025-12-18');
  });
});
```

- [ ] **Step 2: Run — expect failure.**

Run: `cd backend && npx jest credit-card/card-summary`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.** `backend/src/credit-card/card-summary.ts`:

```ts
export interface CardConfig {
  creditLimit: number;
  statementDay: number;
  graceDays: number;
  statementDate: string | null;
  statementBilled: number | null;
  statementMinDue: number | null;
  statementDueDate: string | null;
  statementRewards: number | null;
}

export interface CardTxn {
  amount: number; // positive magnitude
  date: string; // ISO (YYYY-MM-DD or full)
  type: 'expense' | 'transfer' | 'income';
  categoryId: string;
  isPaymentIn: boolean; // transfer whose destination is this card
}

export interface CategoryMeta { id: string; name: string; color: string | null }

export interface CycleCategory { categoryId: string; label: string; value: number; color: string | null }

export interface CardSummary {
  outstanding: number; available: number; usedPct: number;
  unbilled: number; billed: number; minDue: number;
  dueDate: string; daysUntilDue: number; hasBill: boolean;
  rewardsThisCycle: number; lastStatementDate: string;
  cycleByCategory: CycleCategory[];
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const dayOnly = (s: string): string => s.slice(0, 10);

/** Most recent occurrence of `statementDay` on/before today (statementDay <= 28). */
export function lastStatementDate(statementDay: number, today: Date): Date {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const thisMonth = new Date(Date.UTC(y, m, statementDay));
  if (today.getUTCDate() >= statementDay) return thisMonth;
  return new Date(Date.UTC(y, m - 1, statementDay));
}

export function computeCardSummary(
  config: CardConfig,
  accountBalance: number,
  txns: CardTxn[],
  categories: Map<string, CategoryMeta>,
  today: Date,
): CardSummary {
  const lastStmt = lastStatementDate(config.statementDay, today);
  const lastStmtIso = iso(lastStmt);

  const outstanding = Math.max(0, -accountBalance);
  const available = config.creditLimit - outstanding;
  const usedPct = config.creditLimit > 0
    ? Math.min(100, Math.max(0, Math.round((outstanding / config.creditLimit) * 100)))
    : 0;

  const unbilledTxns = txns.filter((t) => t.type === 'expense' && dayOnly(t.date) >= lastStmtIso);
  const unbilled = unbilledTxns.reduce((s, t) => s + Math.abs(t.amount), 0);

  const byCat = new Map<string, number>();
  for (const t of unbilledTxns) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + Math.abs(t.amount));
  const cycleByCategory: CycleCategory[] = [...byCat.entries()]
    .map(([categoryId, value]) => {
      const meta = categories.get(categoryId);
      return { categoryId, label: meta?.name ?? 'Other', value, color: meta?.color ?? null };
    })
    .sort((a, b) => b.value - a.value);

  const overrideCurrent = config.statementDate != null && dayOnly(config.statementDate) === lastStmtIso;

  let billed: number, minDue: number, dueDate: string;
  if (overrideCurrent) {
    const paidSince = txns
      .filter((t) => t.isPaymentIn && dayOnly(t.date) >= dayOnly(config.statementDate as string))
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    billed = Math.max(0, (config.statementBilled ?? 0) - paidSince);
    minDue = Math.min(config.statementMinDue ?? 0, billed);
    dueDate = dayOnly(config.statementDueDate ?? iso(new Date(lastStmt.getTime() + config.graceDays * 86400000)));
  } else {
    billed = Math.max(0, outstanding - unbilled);
    minDue = billed > 0 ? Math.max(Math.round(billed * 0.05), 100) : 0;
    dueDate = iso(new Date(lastStmt.getTime() + config.graceDays * 86400000));
  }

  const dueMs = new Date(dueDate + 'T00:00:00Z').getTime() - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysUntilDue = Math.round(dueMs / 86400000);

  return {
    outstanding, available, usedPct, unbilled, billed, minDue, dueDate,
    daysUntilDue, hasBill: billed > 0, rewardsThisCycle: config.statementRewards ?? 0,
    lastStatementDate: lastStmtIso, cycleByCategory,
  };
}
```

- [ ] **Step 4: Run — expect pass.**

Run: `cd backend && npx jest credit-card/card-summary`
Expected: PASS (6 tests). If a date assertion is off by the runner's timezone, note it — the implementation uses UTC throughout; adjust only the implementation to stay UTC-consistent, not the expected values.

- [ ] **Step 5: Commit.**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add backend/src/credit-card/card-summary.ts backend/src/credit-card/card-summary.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -m "feat(cards): pure computeCardSummary cycle math"
```

---

## Task 3: CreditCardService + module + GET/PATCH routes

**Files:**
- Create: `backend/src/credit-card/credit-card.service.ts`, `credit-card.controller.ts`, `credit-card.module.ts`, `dto/update-card.dto.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `computeCardSummary`, `AccountsService.findOne`, `CategoriesService.findAll`, `Repository<Transaction>`, `Repository<CreditCard>`.
- Produces: `GET /accounts/:id/card` → `CardSummary` + config; `PATCH /accounts/:id/card`.

- [ ] **Step 1: DTO.** `backend/src/credit-card/dto/update-card.dto.ts` — all optional: `creditLimit?, statementDay?(1-28), graceDays?(0-60), network?, last4?, rewardRate?, statementDate?, statementBilled?, statementMinDue?, statementDueDate?, statementRewards?` with matching `class-validator` decorators (`@IsOptional()` + `@IsNumber`/`@IsInt @Min @Max`/`@IsString @MaxLength`/`@IsDateString`).

- [ ] **Step 2: Service.** `credit-card.service.ts`. **Constructor parameter order (fixed — Task 4's test depends on it):** `(accountsService: AccountsService, transactionsService: TransactionsService, categoriesService: CategoriesService, @InjectRepository(Transaction) txRepo: Repository<Transaction>, @InjectRepository(CreditCard) cardRepo: Repository<CreditCard>)`. Methods `getSummary(accountId, userId)` and `updateConfig(accountId, userId, dto)` (pay is added in Task 4):
  - `getSummary`: load the account (`accountsService.findOne`, 404 if not credit), load the `CreditCard` row (404 if none), load this card's transactions via `Repository<Transaction>` (two queries or one: `accountId = cardId AND type='expense'` for swipes, `destinationAccountId = cardId AND type='transfer'` for payments-in), map to `CardTxn[]` (`isPaymentIn` = the transfer set), load `categories = CategoriesService.findAll(userId)` → `Map<id,{id,name,color}>`, call `computeCardSummary(config, account.balance, txns, categories, new Date())`, and return `{ ...config (creditLimit, statementDay, graceDays, network, last4, rewardRate), ...summary, accountId, name: account.name, institutionName: account.institutionName }`.
  - `updateConfig`: load the row (404 if none), `Object.assign` the provided fields, save, return the fresh summary.
  Provide the actual query code following `TransactionsRepository` patterns (use `this.txRepo.find({ where: { userId, accountId: cardId, type: TransactionType.EXPENSE } })` and a second `find` for `{ userId, destinationAccountId: cardId, type: TransactionType.TRANSFER }`; map `amount`/`date`(ISO)/`categoryId`).

- [ ] **Step 3: Controller.** `credit-card.controller.ts` — `@UseGuards(JwtAuthGuard) @Controller('accounts')`, methods `@Get(':id/card')` and `@Patch(':id/card')`, both `@Param('id', ParseUUIDPipe)` + `@CurrentUser()`, delegating to the service. (Pay route added in Task 4.)

- [ ] **Step 4: Module + registration.** `credit-card.module.ts`: `imports: [TypeOrmModule.forFeature([CreditCard, Transaction]), AccountsModule, CategoriesModule]`, `controllers: [CreditCardController]`, `providers: [CreditCardService]`, `exports: [CreditCardService]`. Add `CreditCardModule` to `app.module.ts` imports.

- [ ] **Step 5: Test.** `credit-card.service.spec.ts` — with mocked `accountsService`/`txRepo`/`cardRepo`/`categoriesService`, assert `getSummary` returns a summary with `outstanding` computed from the account balance and `cycleByCategory` from the mocked expense txns, and that a non-credit account throws. (Reuse the `computeCardSummary` guarantees; this test verifies wiring — the data reaches the pure function and the shape returns.)

- [ ] **Step 6: Run focused + full suite, then commit.**

Run: `cd backend && npx jest credit-card && npx jest`
```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add backend/src/credit-card/ backend/src/app.module.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -m "feat(cards): card summary service + GET/PATCH /accounts/:id/card"
```

---

## Task 4: Pay-bill endpoint (settlement-as-transfer, TDD)

**Files:**
- Create: `backend/src/credit-card/dto/pay-card.dto.ts`, `backend/src/credit-card/credit-card.pay.spec.ts`
- Modify: `backend/src/credit-card/credit-card.service.ts`, `credit-card.controller.ts`

**Interfaces:**
- Consumes: `TransactionsService.create`, `AccountsService.findOne`, `CategoriesService.findAll`.
- Produces: `POST /accounts/:id/card/pay { fromAccountId, amount }` → the created transfer transaction.

- [ ] **Step 1: DTO.** `pay-card.dto.ts`: `@IsUUID() fromAccountId: string;` and `@IsPositive() amount: number;`.

- [ ] **Step 2: Write the failing test.** `credit-card.pay.spec.ts` — mocked deps; assert `pay(cardAccountId, userId, { fromAccountId, amount })`:
  1. throws `BadRequestException` when the `:id` account is not `type='credit'`.
  2. throws `BadRequestException` when the source account balance < amount.
  3. throws `BadRequestException` when the user has no categories.
  4. on success calls `transactionsService.create` with `{ type: 'transfer', accountId: fromAccountId, destinationAccountId: cardAccountId, amount, paymentMethod: 'netbanking', categoryId: <resolved> }` and returns its result.

```ts
import { BadRequestException } from '@nestjs/common';
import { CreditCardService } from './credit-card.service';
import { AccountType, PaymentMethod, TransactionType } from '../common/enums';

function make(overrides: any = {}) {
  const accountsService = {
    findOne: jest.fn(async (id: string) =>
      id === 'card-1'
        ? { id: 'card-1', type: AccountType.CREDIT, name: 'ICICI', balance: -34280 }
        : { id: 'bank-1', type: AccountType.SAVINGS, name: 'HDFC', balance: overrides.bankBal ?? 100000 }),
  };
  const categoriesService = { findAll: jest.fn(async () => overrides.cats ?? [{ id: 'cat-other', name: 'Other' }]) };
  const txCreate = jest.fn(async (uid: string, dto: any) => ({ id: 'tx-1', ...dto }));
  const transactionsService = { create: txCreate };
  const svc = new CreditCardService(
    accountsService as any, transactionsService as any, categoriesService as any,
    {} as any, {} as any, // txRepo, cardRepo (unused in pay)
  );
  return { svc, txCreate, accountsService };
}

describe('CreditCardService.pay', () => {
  it('rejects a non-credit destination', async () => {
    const { svc } = make();
    await expect(svc.pay('bank-1', 'u1', { fromAccountId: 'bank-1', amount: 100 } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects insufficient source balance', async () => {
    const { svc } = make({ bankBal: 50 });
    await expect(svc.pay('card-1', 'u1', { fromAccountId: 'bank-1', amount: 1000 } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects when the user has no categories', async () => {
    const { svc } = make({ cats: [] });
    await expect(svc.pay('card-1', 'u1', { fromAccountId: 'bank-1', amount: 1000 } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('creates a transfer bank->card with a resolved category', async () => {
    const { svc, txCreate } = make();
    await svc.pay('card-1', 'u1', { fromAccountId: 'bank-1', amount: 1000 } as any);
    expect(txCreate).toHaveBeenCalledWith('u1', expect.objectContaining({
      type: TransactionType.TRANSFER, accountId: 'bank-1', destinationAccountId: 'card-1',
      amount: 1000, paymentMethod: PaymentMethod.NETBANKING, categoryId: 'cat-other',
    }));
  });
});
```

- [ ] **Step 3: Run — expect failure** (`pay` not defined). `cd backend && npx jest credit-card/credit-card.pay`

- [ ] **Step 4: Implement `pay`** in `credit-card.service.ts`:

```ts
async pay(cardAccountId: string, userId: string, dto: PayCardDto) {
  const card = await this.accountsService.findOne(cardAccountId, userId);
  if (card.type !== AccountType.CREDIT) throw new BadRequestException('Not a credit card account');
  const from = await this.accountsService.findOne(dto.fromAccountId, userId);
  if (from.balance < dto.amount) throw new BadRequestException('Not enough balance in the source account');
  const categories = await this.categoriesService.findAll(userId);
  const category = categories.find((c) => c.name.toLowerCase() === 'other') ?? categories[0];
  if (!category) throw new BadRequestException('No category available to record the payment');
  return this.transactionsService.create(userId, {
    date: new Date().toISOString(),
    description: `${card.name} — bill paid`,
    amount: dto.amount,
    type: TransactionType.TRANSFER,
    categoryId: category.id,
    accountId: dto.fromAccountId,
    destinationAccountId: cardAccountId,
    paymentMethod: PaymentMethod.NETBANKING,
  } as any);
}
```
Add `TransactionsService` + `CategoriesService` to the constructor (inject; `CreditCardModule` already imports both modules), and imports for `BadRequestException`, `TransactionType`, `PaymentMethod`, `PayCardDto`.

- [ ] **Step 5: Controller route.** Add to `credit-card.controller.ts`:

```ts
@Post(':id/card/pay')
pay(@CurrentUser() user: { userId: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayCardDto) {
  return this.creditCardService.pay(id, user.userId, dto);
}
```

- [ ] **Step 6: Run focused + full suite; commit.**

Run: `cd backend && npx jest credit-card && npx jest` (expect all green, incl. a check that the created transfer is `type=transfer` so existing expense-total tests are unaffected).
```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add backend/src/credit-card/
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -m "feat(cards): pay-bill endpoint creating a bank->card transfer"
```

---

## Task 5: Munshi card-dues awareness (cross-module)

**Files:**
- Modify: `backend/src/ai-chat/prompt.ts`, `backend/src/ai-chat/ai-chat.service.ts`, `backend/src/ai-chat/tools/accounts.tools.ts`
- Modify/Create: matching spec files.

**Interfaces:**
- Produces: a one-line card-dues snapshot in the dynamic prompt; card computed fields on the accounts tool output for credit accounts.

- [ ] **Step 1: Read the existing pattern.** Read `ai-chat/ai-chat.service.ts` where it assembles the chat prompt context (how `budget`/`goals`/`events` get onto `ChatPromptContext`) and `ai-chat/prompt.ts` `buildDynamicPrompt`/the section formatters. Follow the same pattern that added events awareness (git shows a prior `feat(munshi): event-budget awareness via snapshot` commit — mirror it).

- [ ] **Step 2: Snapshot line.** Add a `cards` field to `ChatPromptContext` (a small array of `{ name, outstanding, dueDate, daysUntilDue }` for credit accounts with `outstanding > 0`, built in `ai-chat.service.ts` by calling `CreditCardService.getSummary` per credit account — inject `CreditCardService`; `AiChatModule` imports `CreditCardModule`). Add a `formatCardsSection` in `prompt.ts` producing one line, e.g. `- Card dues: ₹X across N cards; soonest ICICI due in 5 days (₹Y).`, and include it in `buildDynamicPrompt`. When no card dues, emit nothing or `- No card dues.`

- [ ] **Step 3: Accounts tool card fields.** In `accounts.tools.ts`, for credit accounts include `outstanding`, `available`, `minDue`, `dueDate` (from `CreditCardService.getSummary`) on the returned account items so Munshi can answer card questions. Keep non-credit accounts unchanged.

- [ ] **Step 4: Tests.** Spec asserting: (a) the dynamic prompt includes the card-dues line when a credit account has `outstanding > 0`; (b) the accounts tool returns the card fields for a credit account and omits them for a bank account. Mock `CreditCardService.getSummary`.

- [ ] **Step 5: Run focused + full suite; commit** (`git add backend/src/ai-chat/`).

---

## Task 6: Mobile api.cards + types + adapter (TDD for the adapter)

**Files:**
- Modify: `mobile/src/api/types.ts`, `mobile/src/api/index.ts`, `mobile/src/api/adapters.ts`
- Create: `mobile/src/api/cardAdapter.spec.ts` (pure adapter test via the ts-jest harness)

**Interfaces:**
- Produces: `ApiCardSummary` type; `CardSummaryView`; `api.cards.get/pay/updateSettings`; `toCardSummaryView(dto)`.

- [ ] **Step 1: Types.** In `types.ts` add `ApiCardSummary` (mirrors the backend summary+config: accountId, name, institutionName, creditLimit, statementDay, graceDays, network, last4, rewardRate, outstanding, available, usedPct, unbilled, billed, minDue, dueDate, daysUntilDue, hasBill, rewardsThisCycle, lastStatementDate, cycleByCategory: `{categoryId,label,value,color}[]`) and a `CardSummaryView` (same, plus a `dueTone: 'ok'|'warn'|'urgent'` derived from `daysUntilDue`: `<=3 urgent, <=7 warn, else ok`, and `cycleByCategory` colors defaulted via the adapter's existing `resolveCatColor` when null).

- [ ] **Step 2: Adapter + test (TDD).** Add `toCardSummaryView(dto: ApiCardSummary): CardSummaryView` to `adapters.ts` (pure). Write `cardAdapter.spec.ts` asserting the `dueTone` thresholds (3/7 boundaries) and null-color fallback. RED → implement → GREEN (`cd mobile && npx jest api/cardAdapter`).

- [ ] **Step 3: api.cards.** In `index.ts` add:
```ts
  cards: {
    async get(accountId: string): Promise<CardSummaryView> {
      const dto = await apiClient.get<ApiCardSummary>(`/accounts/${accountId}/card`);
      return toCardSummaryView(dto);
    },
    async pay(accountId: string, body: { fromAccountId: string; amount: number }): Promise<void> {
      await apiClient.post(`/accounts/${accountId}/card/pay`, body);
      bumpData();
    },
    async updateSettings(accountId: string, patch: Partial<ApiCardSummary>): Promise<void> {
      await apiClient.patch(`/accounts/${accountId}/card`, patch);
      bumpData();
    },
  },
```

- [ ] **Step 4: Typecheck, jest, commit** (`git add mobile/src/api/types.ts mobile/src/api/index.ts mobile/src/api/adapters.ts mobile/src/api/cardAdapter.spec.ts`). Message: `feat(mobile): api.cards resource + card summary adapter`.

---

## Task 7: CardDetail screen + nav wiring

**Files:**
- Create: `mobile/src/screens/CardDetail.tsx`
- Modify: `mobile/src/app/navContext.tsx` (`ScreenKind` + `'card-detail'`), `mobile/src/app/screens.tsx` (registry), `mobile/src/screens/Accounts.tsx` (credit branch on tap)

- [ ] **Step 1: Read** `project/riddhi/MobileCards.jsx` (`CardDetail`) for the visual, and `mobile/src/screens/AccountDetail.tsx` + `mobile/src/components/*` (GlassCard, ListCard/ListRow, SectionHead, charts) for the real components/patterns to reuse. Consult Expo v56 docs as needed.
- [ ] **Step 2: Add the nav kind.** In `navContext.tsx` add `'card-detail'` to `ScreenKind`. In `screens.tsx` import `CardDetail` and add `'card-detail': CardDetail` to `SCREEN_REGISTRY`.
- [ ] **Step 3: Accounts branch.** In `Accounts.tsx`, the tap handler pushes `{ kind: a.type === 'credit' ? 'card-detail' : 'account-detail', data: a }`.
- [ ] **Step 4: Build `CardDetail`.** Load the summary via `useApiData(() => api.cards.get(String(a.id)), null, [a.id])`. Render the sections from the spec (card visual, statement-due card with the `dueTone`-colored days-left pill + Pay bill button or "no dues" empty state, this-cycle-by-category stacked bar + list, rewards, card transactions). Use the app's existing components and theme (`useTheme()` from `theme/ThemeProvider`). The card transactions list can reuse `api.transactions.list({ accountId })` for the swipes + payments. Keep the file focused; follow existing screen structure.
- [ ] **Step 5: Typecheck (`npx tsc --noEmit`), then drive the app (verify skill): open a credit card, confirm outstanding/available/cycle/due render.** Commit (`git add mobile/src/screens/CardDetail.tsx mobile/src/app/navContext.tsx mobile/src/app/screens.tsx mobile/src/screens/Accounts.tsx`).

---

## Task 8: PayBillSheet

**Files:**
- Create: `mobile/src/app/PayBillSheet.tsx`
- Modify: `mobile/src/screens/CardDetail.tsx` (wire the Pay bill button)

- [ ] **Step 1: Read** `project/riddhi/MobileCards.jsx` (`PayBillSheet`) and an existing sheet (`mobile/src/app/AddTxSheet.tsx`) for the real bottom-sheet component + patterns.
- [ ] **Step 2: Build the sheet.** Props: `{ open, onClose, card: CardSummaryView }`. Modes total / min / custom (amounts from `card.billed` / `card.minDue` / typed). A source-account picker (bank accounts via `api.accounts.list()`, filtered to non-credit with `bal > 0`), a balance check (disable pay when amount > selected balance), and a Pay button calling `api.cards.pay(card.accountId, { fromAccountId, amount })` then `onClose()` + a success toast. Follow the sheet styling conventions already in the app; no new UI libs.
- [ ] **Step 3: Wire** the CardDetail "Pay bill" button to open it.
- [ ] **Step 4: Typecheck + drive the app** (pay full/min/custom; confirm the card's outstanding drops and a bank balance drops, and the payment shows in the card's transactions and is NOT counted as a new expense). Commit.

---

## Task 9: Add-credit-card fields + Accounts due hint

**Files:**
- Modify: `mobile/src/screens/Accounts.tsx`, and the api create-account input type if needed (`mobile/src/api/types.ts` `NewAccountInput`, `mobile/src/api/index.ts` accounts.create).

- [ ] **Step 1: Extend `NewAccountInput`** (`types.ts`) with optional `creditLimit?, statementDay?, last4?, network?`; `api.accounts.create` forwards them to the POST body when present.
- [ ] **Step 2: Add-card fields.** In `Accounts.tsx`, the "Add credit card" flow (`addAccount('credit', …)`) gains inputs for credit limit + statement day (required for credit) and optional last4/network, passed to `api.accounts.create`. Keep bank/wallet flows unchanged.
- [ ] **Step 3: Due hint.** On the Accounts list, for credit accounts show a small "due in Xd" hint. Fetch per-card summaries (e.g. `api.cards.get` for each credit account, or a lightweight batch) — keep it simple; if per-card calls are too chatty, show the hint only on the CardDetail and skip the list hint (note the choice in the report). Do not over-fetch on every render.
- [ ] **Step 4: Typecheck + drive the app** (add a credit card with a limit + statement day; open it; confirm the summary computes). Commit.

---

## Final verification

- [ ] **Backend:** `cd backend && npx jest` → all pass; `npx tsc --noEmit` → only the known auth spec error.
- [ ] **Mobile:** `cd mobile && npx jest` → pure specs pass; `npx tsc --noEmit` → 0 errors.
- [ ] **Regression (no double-count):** drive the app — a card **swipe** still appears in budget/reports spend totals; a **bill payment** (transfer) does NOT add to spend totals but reduces the card's outstanding and the bank balance.
- [ ] **End-to-end (verify skill):** create a credit card → add a couple of card expenses → open CardDetail (outstanding/available/cycle-by-category/due render) → Pay bill (full) → outstanding goes to ~0, "no dues" state shows.
