# Payment-source foundation (Slice A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every transaction a queryable payment source (UPI / card / netbanking / autopay / cash) so the app shows *how* you paid, splits Activity into Bank & UPI vs Cards, and lets the user pick what they paid with — with no data migration.

**Architecture:** Backend adds a nullable `paymentMethod` enum on `Transaction`, derives a default from the account type on create, and adds a `source=bank|card` list filter that keys off `account.type='credit'`. Mobile derives a display `source={kind,label}` in one pure helper, renders a `SourceTag` pill, adds a Bank/Cards segmented filter, and an account picker in Add-Transaction. Cross-module: sms-sync emits a `paymentMethod` hint, Munshi's transaction tool becomes source-aware, and CSV export gains a Source column.

**Tech Stack:** NestJS + TypeORM + Postgres (backend, jest); Expo SDK 56 / React Native + TypeScript (mobile).

## Global Constraints

- **Backend DB:** `synchronize: true` (app.module) — a new **nullable** column auto-applies; **no migration file needed**. Keep the column nullable (existing rows stay `null`).
- **Git/commit prefs:** author email `gairola.ashutosh26@gmail.com`; **no `Co-Authored-By` trailer**; `docs/` is gitignored so specs/plans are force-added (`git add -f`). Commit with `git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify`.
- **Mobile / Expo:** before writing any mobile code, read the versioned Expo docs at `https://docs.expo.dev/versions/v56.0.0/` (per `mobile/AGENTS.md`). Mobile has **no existing test harness**; Task 6 adds a minimal `jest-expo` setup used only for pure-logic tests. RN UI tasks are verified with `npx tsc --noEmit` and by driving the app (superpowers `verify`/`run`), not component tests.
- **No double-count is not in scope here** — card-bill settlement is Slice B (modeled as a `transfer`, already expense-excluded). This slice only tags source, filters, and picks source on add.
- **Spec:** `docs/superpowers/specs/2026-07-07-payment-source-foundation-design.md`.

---

## File Structure

**Backend (create):**
- `backend/src/transactions/payment-method.spec.ts` — derivation unit tests.
- `backend/src/transactions/transactions.repository.spec.ts` — source-filter tests.

**Backend (modify):**
- `backend/src/common/enums.ts` — add `PaymentMethod` enum.
- `backend/src/transactions/transaction.entity.ts` — add `paymentMethod` column.
- `backend/src/transactions/dto/create-transaction.dto.ts` — optional `paymentMethod`.
- `backend/src/transactions/dto/query-transactions.dto.ts` — optional `source`.
- `backend/src/transactions/transactions.service.ts` — `derivePaymentMethod()` + create-path wiring.
- `backend/src/transactions/transactions.repository.ts` — `source` filter branch.
- `backend/src/sms-sync/sms-sync.service.ts` + `dto/parse.dto.ts` — `paymentMethod` hint on parse result.
- `backend/src/sms-sync/sms-sync.service.spec.ts` (create) — hint tests.
- `backend/src/ai-chat/tools/transactions.tools.ts` — `paymentMethod` in model item + `source` filter on `list_transactions`.
- `backend/src/ai-chat/tools/transactions.tools.spec.ts` (create) — tool tests.

**Mobile (create):**
- `mobile/src/api/paymentSource.ts` — pure `deriveSource()` helper + types.
- `mobile/src/api/paymentSource.spec.ts` — helper tests.
- `mobile/src/components/SourceTag.tsx` — the pill component.
- `mobile/jest.config.js` + package.json `test` script + devDeps — minimal harness.

**Mobile (modify):**
- `mobile/src/api/types.ts` — `PaymentMethod`, `ApiTransaction.paymentMethod`, `TxView.source`, `NewTxInput.paymentMethod`.
- `mobile/src/api/adapters.ts` — thread account into `toTxView`/`toRecentTxView`, set `source`.
- `mobile/src/api/index.ts` — `fetchAccountMap()`, thread accounts, `source` param, `NewTxInput.paymentMethod` passthrough, `RecentTxView`/`TxView` include source, `sms` mapping.
- `mobile/src/screens/SwipeRow.tsx` — render `SourceTag` in the row.
- `mobile/src/screens/TxDetail.tsx` — render `SourceTag`.
- `mobile/src/screens/Home.tsx` — render `SourceTag` in recent list.
- `mobile/src/screens/Txns.tsx` — Bank/Cards segmented control → `source` param.
- `mobile/src/app/AddTxSheet.tsx` — account picker.
- `mobile/src/lib/exportCsv.ts` — Source column.

---

## Task 1: PaymentMethod enum + Transaction column

**Files:**
- Modify: `backend/src/common/enums.ts`
- Modify: `backend/src/transactions/transaction.entity.ts`

**Interfaces:**
- Produces: `enum PaymentMethod { UPI='upi', CARD='card', NETBANKING='netbanking', AUTOPAY='autopay', CASH='cash' }`; `Transaction.paymentMethod: PaymentMethod | null`.

- [ ] **Step 1: Add the enum.** In `backend/src/common/enums.ts`, after the `TransactionStatus` enum block, add:

```ts
export enum PaymentMethod {
  UPI = 'upi',
  CARD = 'card',
  NETBANKING = 'netbanking',
  AUTOPAY = 'autopay',
  CASH = 'cash',
}
```

- [ ] **Step 2: Add the column.** In `backend/src/transactions/transaction.entity.ts`, update the enums import and add the column after the `status` column (around line 86):

```ts
import { TransactionType, TransactionStatus, PaymentMethod } from '../common/enums';
```
```ts
  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod: PaymentMethod | null;
```

- [ ] **Step 3: Verify it compiles.**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -am "feat(txns): PaymentMethod enum + nullable column on Transaction"
```

---

## Task 2: derivePaymentMethod() + create-path wiring (TDD)

**Files:**
- Create: `backend/src/transactions/payment-method.spec.ts`
- Modify: `backend/src/transactions/transactions.service.ts`

**Interfaces:**
- Consumes: `PaymentMethod`, `AccountType` (`../common/enums`); `AccountsService.findOne(id, userId): Promise<Account>` (throws if missing); `Account.type: AccountType`.
- Produces: `export function derivePaymentMethod(accountType: AccountType | null | undefined): PaymentMethod`; create path persists `paymentMethod`.

- [ ] **Step 1: Write the failing test.** Create `backend/src/transactions/payment-method.spec.ts`:

```ts
import { derivePaymentMethod } from './transactions.service';
import { AccountType, PaymentMethod } from '../common/enums';

describe('derivePaymentMethod', () => {
  it('maps a credit account to card', () => {
    expect(derivePaymentMethod(AccountType.CREDIT)).toBe(PaymentMethod.CARD);
  });
  it('maps a bank account to upi', () => {
    expect(derivePaymentMethod(AccountType.SAVINGS)).toBe(PaymentMethod.UPI);
    expect(derivePaymentMethod(AccountType.CHECKING)).toBe(PaymentMethod.UPI);
  });
  it('maps no account to cash', () => {
    expect(derivePaymentMethod(null)).toBe(PaymentMethod.CASH);
    expect(derivePaymentMethod(undefined)).toBe(PaymentMethod.CASH);
  });
});
```

- [ ] **Step 2: Run it — expect failure.**

Run: `cd backend && npx jest transactions/payment-method -t derivePaymentMethod`
Expected: FAIL — `derivePaymentMethod is not a function`.

- [ ] **Step 3: Implement.** In `backend/src/transactions/transactions.service.ts`, extend the enums import and add the exported helper next to the existing `transactionBalanceDeltas` export (top of file, outside the class):

```ts
import { TransactionType, TransactionStatus, PaymentMethod, AccountType } from '../common/enums';
```
```ts
/**
 * Default payment rail for a transaction when the client doesn't specify one.
 * A credit account is a card swipe; any other account is UPI; no account is cash.
 */
export function derivePaymentMethod(
  accountType: AccountType | null | undefined,
): PaymentMethod {
  if (!accountType) return PaymentMethod.CASH;
  if (accountType === AccountType.CREDIT) return PaymentMethod.CARD;
  return PaymentMethod.UPI;
}
```

- [ ] **Step 4: Run it — expect pass.**

Run: `cd backend && npx jest transactions/payment-method`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire it into `create()`.** In `TransactionsService.create`, capture the source account type and set `paymentMethod`. Replace the account-ownership block and the `create({...})` call:

```ts
    // Validate account ownership before starting DB transaction
    let sourceAccountType: AccountType | null = null;
    if (dto.accountId) {
      const account = await this.accountsService.findOne(dto.accountId, userId);
      if (!account) {
        throw new BadRequestException(
          'Account not found or does not belong to user',
        );
      }
      sourceAccountType = account.type;
    }
```

In the `this.transactionsRepository.create({ ... })` object, add one line alongside `accountId: dto.accountId ?? null,`:

```ts
        paymentMethod: dto.paymentMethod ?? derivePaymentMethod(sourceAccountType),
```

- [ ] **Step 6: Add a create-path test.** Append to `payment-method.spec.ts`:

```ts
import { TransactionsService } from './transactions.service';
import { TransactionType } from '../common/enums';

function makeSvc(accountType?: AccountType) {
  const saved: any[] = [];
  const manager = { save: jest.fn(async (tx: any) => { saved.push(tx); return tx; }) };
  const dataSource = {
    createQueryRunner: () => ({
      connect: jest.fn(), startTransaction: jest.fn(),
      commitTransaction: jest.fn(), rollbackTransaction: jest.fn(),
      release: jest.fn(), manager,
    }),
  } as any;
  const repo = { create: (d: any) => d } as any;
  const accounts = { findOne: jest.fn(async () => ({ type: accountType })) } as any;
  const events = { emit: jest.fn() } as any;
  return { svc: new TransactionsService(repo, accounts, dataSource, events), saved };
}

describe('TransactionsService payment method on create', () => {
  const base = {
    date: '2026-07-07', description: 'x', amount: 100,
    type: TransactionType.EXPENSE, categoryId: 'cat-1',
  };
  it('derives card for a credit account', async () => {
    const { svc, saved } = makeSvc(AccountType.CREDIT);
    await svc.create('u1', { ...base, accountId: 'acc-1' } as any);
    expect(saved[0].paymentMethod).toBe(PaymentMethod.CARD);
  });
  it('derives cash when no account', async () => {
    const { svc, saved } = makeSvc();
    await svc.create('u1', base as any);
    expect(saved[0].paymentMethod).toBe(PaymentMethod.CASH);
  });
  it('honours an explicit paymentMethod from the dto', async () => {
    const { svc, saved } = makeSvc(AccountType.CREDIT);
    await svc.create('u1', { ...base, accountId: 'acc-1', paymentMethod: PaymentMethod.AUTOPAY } as any);
    expect(saved[0].paymentMethod).toBe(PaymentMethod.AUTOPAY);
  });
});
```

- [ ] **Step 7: Run tests — expect pass.**

Run: `cd backend && npx jest transactions/payment-method`
Expected: PASS (6 tests). (`dto.paymentMethod` is added to the DTO in Task 3; TS in the spec uses `as any`, so this compiles now.)

- [ ] **Step 8: Commit.**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add -A && git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -m "feat(txns): derive paymentMethod default on create"
```

---

## Task 3: DTOs accept paymentMethod + source

**Files:**
- Modify: `backend/src/transactions/dto/create-transaction.dto.ts`
- Modify: `backend/src/transactions/dto/query-transactions.dto.ts`

**Interfaces:**
- Produces: `CreateTransactionDto.paymentMethod?: PaymentMethod`; `QueryTransactionsDto.source?: 'bank' | 'card'`. `UpdateTransactionDto` inherits via `PartialType`.

- [ ] **Step 1: Create DTO field.** In `create-transaction.dto.ts`, extend the enums import and add the optional field after `destinationAccountId`:

```ts
import { TransactionType, TransactionStatus, PaymentMethod } from '../../common/enums';
```
```ts
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
```

- [ ] **Step 2: Query DTO field.** In `query-transactions.dto.ts`, `IsIn` is already imported? (No — it imports `IsEnum, IsOptional, IsUUID, IsDateString, IsInt, IsString, MaxLength, Min, Max`.) Add `IsIn` to that import, then add after `accountId`:

```ts
  @IsOptional()
  @IsIn(['bank', 'card'])
  source?: 'bank' | 'card';
```

- [ ] **Step 3: Verify compile.**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -am "feat(txns): DTOs accept paymentMethod and source filter"
```

---

## Task 4: Repository `source` filter (TDD)

**Files:**
- Create: `backend/src/transactions/transactions.repository.spec.ts`
- Modify: `backend/src/transactions/transactions.repository.ts`

**Interfaces:**
- Consumes: `QueryTransactionsDto.source`.
- Produces: `findAllByUser` applies a `tx.account` join filtering `account.type = 'credit'` (card) or `IS NULL OR != 'credit'` (bank).

- [ ] **Step 1: Write the failing test.** Create `backend/src/transactions/transactions.repository.spec.ts`:

```ts
import { TransactionsRepository } from './transactions.repository';

function makeQb() {
  const calls: { method: string; args: any[] }[] = [];
  const qb: any = {};
  for (const m of ['where', 'orderBy', 'addOrderBy', 'andWhere', 'leftJoin', 'skip', 'take']) {
    qb[m] = (...args: any[]) => { calls.push({ method: m, args }); return qb; };
  }
  qb.getManyAndCount = async () => [[], 0];
  return { qb, calls };
}

function makeRepo(qb: any) {
  const repo: any = { createQueryBuilder: () => qb };
  return new TransactionsRepository(repo);
}

describe('TransactionsRepository source filter', () => {
  it('filters to credit accounts for source=card', async () => {
    const { qb, calls } = makeQb();
    await makeRepo(qb).findAllByUser('u1', { source: 'card' } as any);
    expect(calls.some((c) => c.method === 'leftJoin' && c.args[0] === 'tx.account')).toBe(true);
    const card = calls.find((c) => c.method === 'andWhere' && /srcAcc\.type = :creditType/.test(c.args[0]));
    expect(card).toBeTruthy();
    expect(card!.args[1]).toEqual({ creditType: 'credit' });
  });
  it('excludes credit accounts (and allows null) for source=bank', async () => {
    const { qb, calls } = makeQb();
    await makeRepo(qb).findAllByUser('u1', { source: 'bank' } as any);
    const bank = calls.find((c) => c.method === 'andWhere' && /srcAcc\.id IS NULL/.test(c.args[0]));
    expect(bank).toBeTruthy();
  });
  it('adds no join when source is absent', async () => {
    const { qb, calls } = makeQb();
    await makeRepo(qb).findAllByUser('u1', {} as any);
    expect(calls.some((c) => c.method === 'leftJoin')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect failure.**

Run: `cd backend && npx jest transactions/transactions.repository`
Expected: FAIL (no leftJoin call).

- [ ] **Step 3: Implement.** In `transactions.repository.ts`, add `source` to the destructure and a filter branch. In the destructure block add `source,`. After the existing `if (accountId) { ... }` block add:

```ts
    if (source === 'card') {
      qb.leftJoin('tx.account', 'srcAcc').andWhere('srcAcc.type = :creditType', {
        creditType: 'credit',
      });
    } else if (source === 'bank') {
      qb.leftJoin('tx.account', 'srcAcc').andWhere(
        '(srcAcc.id IS NULL OR srcAcc.type != :creditType)',
        { creditType: 'credit' },
      );
    }
```

- [ ] **Step 4: Run it — expect pass.**

Run: `cd backend && npx jest transactions/transactions.repository`
Expected: PASS (3 tests).

- [ ] **Step 5: Full backend suite (regression).**

Run: `cd backend && npx jest`
Expected: PASS (all existing + new).

- [ ] **Step 6: Commit.**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add -A && git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -m "feat(txns): source=bank|card list filter via account join"
```

---

## Task 5: sms-sync paymentMethod hint (TDD)

**Files:**
- Modify: `backend/src/sms-sync/sms-sync.service.ts`
- Modify: `backend/src/sms-sync/dto/parse.dto.ts`
- Create: `backend/src/sms-sync/sms-sync.service.spec.ts`

**Interfaces:**
- Produces: `ParseSmsResult.paymentMethod: 'upi' | 'card' | 'autopay'`; `SmsSyncService.parse()` sets it.

- [ ] **Step 1: Write the failing test.** Create `backend/src/sms-sync/sms-sync.service.spec.ts`:

```ts
import { SmsSyncService } from './sms-sync.service';

describe('SmsSyncService payment method hint', () => {
  const svc = new SmsSyncService();
  it('tags a credit-card spend as card', () => {
    const r = svc.parse('Rs.2499 spent on ICICI Credit Card XX8830 at AMAZON on 23-04');
    expect(r.paymentMethod).toBe('card');
  });
  it('tags a UPI debit as upi', () => {
    const r = svc.parse('Rs.649 debited from HDFC Bank a/c XX4521 to SWIGGY via UPI');
    expect(r.paymentMethod).toBe('upi');
  });
  it('tags an autopay/SIP/ACH mandate as autopay', () => {
    const r = svc.parse('Rs.10000 debited via ACH E-Mandate SIP from HDFC a/c XX4521');
    expect(r.paymentMethod).toBe('autopay');
  });
});
```

- [ ] **Step 2: Run it — expect failure.**

Run: `cd backend && npx jest sms-sync/sms-sync.service`
Expected: FAIL — `paymentMethod` undefined.

- [ ] **Step 3: Add the field to the result type.** In `sms-sync/dto/parse.dto.ts`, add to `ParseSmsResult`:

```ts
  paymentMethod: 'upi' | 'card' | 'autopay';
```

- [ ] **Step 4: Implement the heuristic.** In `sms-sync.service.ts`, add a private method and call it in `parse()`. Add before the `return { ... }` in `parse`:

```ts
    const paymentMethod = this.extractPaymentMethod(text);
```
and include `paymentMethod,` in the returned object. Then add the method (near `extractMerchant`):

```ts
  private extractPaymentMethod(text: string): 'upi' | 'card' | 'autopay' {
    const t = text.toLowerCase();
    if (/\b(e-?mandate|mandate|auto\s?pay|autopay|si\b|standing instruction|ach|nach|sip)\b/.test(t)) {
      return 'autopay';
    }
    if (/credit\s*card|debit\s*card|\bcard\b/.test(t)) {
      return 'card';
    }
    return 'upi';
  }
```

- [ ] **Step 5: Run it — expect pass.**

Run: `cd backend && npx jest sms-sync/sms-sync.service`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit.**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add -A && git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -m "feat(sms-sync): emit paymentMethod hint from parsed SMS"
```

---

## Task 6: Munshi transaction tool is source-aware (TDD)

**Files:**
- Modify: `backend/src/ai-chat/tools/transactions.tools.ts`
- Create: `backend/src/ai-chat/tools/transactions.tools.spec.ts`

**Interfaces:**
- Consumes: `QueryTransactionsDto.source`; `Transaction.paymentMethod`.
- Produces: `list_transactions` accepts `source: 'bank'|'card'`; model items include `paymentMethod`.

- [ ] **Step 1: Write the failing test.** Create `backend/src/ai-chat/tools/transactions.tools.spec.ts`:

```ts
import { transactionTools } from './transactions.tools';
import { PaymentMethod } from '../../common/enums';

const listTool = transactionTools.find((t) => t.name === 'list_transactions')!;

function makeCtx(capture: { query?: any }) {
  return {
    userId: 'u1',
    svc: {
      tx: {
        findAll: async (_uid: string, query: any) => {
          capture.query = query;
          return {
            total: 1,
            items: [{ id: 't1', date: new Date('2026-07-01'), description: 'Amazon', amount: 2499, type: 'expense', categoryId: 'c1', accountId: 'a1', notes: null, paymentMethod: PaymentMethod.CARD }],
          };
        },
      },
      categories: { findAllByUser: async () => [{ id: 'c1', name: 'Shopping' }] },
    },
  } as any;
}

describe('list_transactions source awareness', () => {
  it('passes the source filter through to the query', async () => {
    const cap: { query?: any } = {};
    await listTool.handler(makeCtx(cap), { source: 'card' });
    expect(cap.query.source).toBe('card');
  });
  it('includes paymentMethod on returned model items', async () => {
    const res: any = await listTool.handler(makeCtx({}), {});
    expect(res.data.items[0].paymentMethod).toBe(PaymentMethod.CARD);
  });
});
```

Note: if `categoryNameMap` uses a different service path than `svc.categories.findAllByUser`, mirror the real call in the mock — check the top of `transactions.tools.ts` for `categoryNameMap`'s implementation and align the mock's shape before running.

- [ ] **Step 2: Run it — expect failure.**

Run: `cd backend && npx jest ai-chat/tools/transactions.tools`
Expected: FAIL — `source` not passed / `paymentMethod` absent.

- [ ] **Step 3: Implement.** In `transactions.tools.ts`:

Add `paymentMethod` to `toModelItem`'s returned object:
```ts
    accountId: tx.accountId,
    paymentMethod: tx.paymentMethod,
    notes: tx.notes,
```

Add a `source` property to the tool's `inputSchema` (inside `schema({ ... })`, after `categoryId`):
```ts
      source: {
        type: 'string',
        enum: ['bank', 'card'],
        description: 'Filter by payment side: bank/UPI or credit card',
      },
```

Pass it into the query in the handler's `Object.assign(new QueryTransactionsDto(), { ... })`:
```ts
        categoryId: input.categoryId as string | undefined,
        source: input.source as 'bank' | 'card' | undefined,
```

- [ ] **Step 4: Run it — expect pass.**

Run: `cd backend && npx jest ai-chat/tools/transactions.tools`
Expected: PASS (2 tests).

- [ ] **Step 5: Full backend suite.**

Run: `cd backend && npx jest`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add -A && git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -m "feat(munshi): source-aware list_transactions + paymentMethod in results"
```

---

## Task 7: Mobile jest harness + pure source helper (TDD)

**Files:**
- Modify: `mobile/package.json` (add `test` script + devDeps)
- Create: `mobile/jest.config.js`
- Create: `mobile/src/api/paymentSource.ts`
- Create: `mobile/src/api/paymentSource.spec.ts`

**Interfaces:**
- Produces: `type SourceKind = 'upi'|'card'|'bank'|'autopay'|'cash'`; `interface TxSource { kind: SourceKind; label: string; autopay?: boolean }`; `function deriveSource(paymentMethod: PaymentMethod | null | undefined, account?: { institutionName?: string | null; name: string; type: string }): TxSource`.

- [ ] **Step 1: Read Expo v56 docs** (`https://docs.expo.dev/versions/v56.0.0/`) for the current test-setup guidance, then add the harness. In `mobile/package.json` add to `scripts`: `"test": "jest"`, and install dev deps:

```bash
cd /Users/ashutoshgairola/dev/riddhi-app/mobile && npm i -D jest-expo jest @types/jest ts-jest
```

- [ ] **Step 2: Add jest config.** Create `mobile/jest.config.js` — scoped to pure-logic specs so RN native mocking isn't needed:

```js
/** Pure-logic unit tests only (no RN component rendering in this slice). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.spec.ts'],
  roots: ['<rootDir>/src'],
};
```

- [ ] **Step 3: Write the failing test.** Create `mobile/src/api/paymentSource.spec.ts`:

```ts
import { deriveSource } from './paymentSource';

const hdfc = { institutionName: 'HDFC Bank', name: 'HDFC Savings', type: 'savings' };
const icici = { institutionName: 'ICICI Bank', name: 'Amazon Pay', type: 'credit' };

describe('deriveSource', () => {
  it('labels a credit account CC', () => {
    expect(deriveSource('card', icici)).toEqual({ kind: 'card', label: 'ICICI CC' });
  });
  it('labels a bank UPI', () => {
    expect(deriveSource('upi', hdfc)).toEqual({ kind: 'upi', label: 'HDFC UPI' });
  });
  it('labels autopay ACH with the auto marker', () => {
    expect(deriveSource('autopay', hdfc)).toEqual({ kind: 'autopay', label: 'HDFC ACH', autopay: true });
  });
  it('derives card from a null method on a credit account', () => {
    expect(deriveSource(null, icici)).toEqual({ kind: 'card', label: 'ICICI CC' });
  });
  it('derives upi from a null method on a bank account', () => {
    expect(deriveSource(undefined, hdfc)).toEqual({ kind: 'upi', label: 'HDFC UPI' });
  });
  it('falls back to Cash with no account', () => {
    expect(deriveSource(null, undefined)).toEqual({ kind: 'cash', label: 'Cash' });
  });
});
```

- [ ] **Step 4: Run it — expect failure.**

Run: `cd mobile && npx jest api/paymentSource`
Expected: FAIL — cannot find module `./paymentSource`.

- [ ] **Step 5: Implement.** Create `mobile/src/api/paymentSource.ts`:

```ts
import type { PaymentMethod } from './types';

export type SourceKind = 'upi' | 'card' | 'bank' | 'autopay' | 'cash';

export interface TxSource {
  kind: SourceKind;
  label: string;
  autopay?: boolean;
}

interface SourceAccount {
  institutionName?: string | null;
  name: string;
  type: string;
}

/** First word of the institution name, e.g. "HDFC Bank" → "HDFC". */
function instShort(account?: SourceAccount): string {
  const inst = account?.institutionName || account?.name || '';
  return inst.split(' ')[0] || inst;
}

/**
 * Derives the display source ({kind,label}) for a transaction from its stored
 * paymentMethod and account. Mirrors the backend create-path default when the
 * method is null (credit → card, other account → upi, no account → cash).
 */
export function deriveSource(
  paymentMethod: PaymentMethod | null | undefined,
  account?: SourceAccount,
): TxSource {
  const method: PaymentMethod =
    paymentMethod ?? (account?.type === 'credit' ? 'card' : account ? 'upi' : 'cash');
  const short = instShort(account);
  switch (method) {
    case 'card':
      return { kind: 'card', label: short ? `${short} CC` : 'Card' };
    case 'netbanking':
      return { kind: 'bank', label: short || 'Bank' };
    case 'autopay':
      return { kind: 'autopay', label: short ? `${short} ACH` : 'Autopay', autopay: true };
    case 'cash':
      return { kind: 'cash', label: 'Cash' };
    case 'upi':
    default:
      return { kind: 'upi', label: short ? `${short} UPI` : 'UPI' };
  }
}
```

- [ ] **Step 6: Add the `PaymentMethod` type export** (the helper imports it). In `mobile/src/api/types.ts`, add near the top, before `ApiTransaction`:

```ts
export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'autopay' | 'cash';
```
(Task 8 adds the remaining fields — `ApiTransaction.paymentMethod`, `TxView.source`, etc. — and does **not** redefine this type.)

- [ ] **Step 7: Run it — expect pass.**

Run: `cd mobile && npx jest api/paymentSource`
Expected: PASS (6 tests).

- [ ] **Step 8: Commit.**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add -A && git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -m "test(mobile): jest harness + deriveSource payment-source helper"
```

---

## Task 8: Mobile types — paymentMethod & source

**Files:**
- Modify: `mobile/src/api/types.ts`

**Interfaces:**
- Produces: `type PaymentMethod`; `ApiTransaction.paymentMethod?`; `TxView.source?: TxSource`; `RecentTxView.source?: TxSource`; `NewTxInput.paymentMethod?`.

- [ ] **Step 1: Add the enum type + fields.** In `mobile/src/api/types.ts`:

Add near the top (before `ApiTransaction`):
```ts
export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'autopay' | 'cash';
```
Add to `ApiTransaction` (after `eventId`):
```ts
  paymentMethod?: PaymentMethod | null;
```
Import the source type at the top of the file:
```ts
import type { TxSource } from './paymentSource';
```
Add to `TxView` (after `eventId?`):
```ts
  source?: TxSource;
```
Add to `RecentTxView` (after `type`):
```ts
  source?: TxSource;
```
Add to `NewTxInput` (after `accountId?`):
```ts
  /** Payment rail; when omitted the backend derives it from the account. */
  paymentMethod?: PaymentMethod;
```

- [ ] **Step 2: Verify compile.**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors. (`toTxView` still compiles; `source` is optional.)

- [ ] **Step 3: Commit.**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -am "feat(mobile): payment-source types on transactions"
```

---

## Task 9: Adapter sets source (TDD)

**Files:**
- Modify: `mobile/src/api/adapters.ts`
- Create/Modify: `mobile/src/api/adapters.spec.ts`

**Interfaces:**
- Consumes: `deriveSource`, `ApiAccount`.
- Produces: `toTxView(tx, category?, account?)` and `toRecentTxView(tx, category?, displayDate?, account?)` set `.source`.

- [ ] **Step 1: Write the failing test.** Create `mobile/src/api/adapters.spec.ts`:

```ts
import { toTxView, toRecentTxView } from './adapters';
import type { ApiTransaction, ApiAccount } from './types';

const tx: ApiTransaction = {
  id: 't1', date: '2026-07-01T00:00:00.000Z', description: 'Amazon', amount: 2499,
  type: 'expense', categoryId: 'c1', status: 'cleared', tags: [], attachments: [],
  isRecurring: false, paymentMethod: 'card', accountId: 'a1',
};
const acc: ApiAccount = {
  id: 'a1', name: 'Amazon Pay', type: 'credit', balance: 0, currency: 'INR',
  isConnected: false, includeInNetWorth: true, lastUpdated: '', institutionName: 'ICICI Bank',
};

describe('adapter source', () => {
  it('sets source on toTxView from the account', () => {
    expect(toTxView(tx, undefined, acc).source).toEqual({ kind: 'card', label: 'ICICI CC' });
  });
  it('sets source on toRecentTxView', () => {
    expect(toRecentTxView(tx, undefined, 'Today', acc).source).toEqual({ kind: 'card', label: 'ICICI CC' });
  });
  it('derives cash when no account given', () => {
    expect(toTxView({ ...tx, paymentMethod: null, accountId: undefined }, undefined, undefined).source)
      .toEqual({ kind: 'cash', label: 'Cash' });
  });
});
```

- [ ] **Step 2: Run it — expect failure.**

Run: `cd mobile && npx jest api/adapters`
Expected: FAIL — `source` undefined / arity mismatch.

- [ ] **Step 3: Implement.** In `adapters.ts`, add the import and thread the account:

```ts
import { deriveSource } from './paymentSource';
```
Change `toTxView` signature and add `source` to its return object:
```ts
export function toTxView(tx: ApiTransaction, category?: ApiCategory, account?: ApiAccount): TxView {
```
```ts
    eventId: tx.eventId ?? null,
    source: deriveSource(tx.paymentMethod, account),
```
Change `toRecentTxView` signature and return:
```ts
export function toRecentTxView(
  tx: ApiTransaction,
  category?: ApiCategory,
  displayDate?: string,
  account?: ApiAccount,
): RecentTxView {
```
```ts
    type: isIncome ? 'inc' : 'exp',
    source: deriveSource(tx.paymentMethod, account),
```
(Ensure `ApiAccount` is imported in `adapters.ts` — add it to the existing type import from `./types` if absent.)

- [ ] **Step 4: Run it — expect pass.**

Run: `cd mobile && npx jest api/adapters`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add -A && git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -m "feat(mobile): adapters derive transaction source"
```

---

## Task 10: API layer — thread accounts + source param + sms mapping

**Files:**
- Modify: `mobile/src/api/index.ts`

**Interfaces:**
- Consumes: `toTxView(tx, cat, account)`, `toRecentTxView(tx, cat, displayDate, account)`.
- Produces: `TxListParams.source?: 'bank' | 'card'`; `fetchAccountMap(): Promise<Map<string, ApiAccount>>`; `transactions.create` forwards `paymentMethod`; recent/list pass the account through.

- [ ] **Step 1: Add `fetchAccountMap`.** Near `fetchCategoryMap` (line ~127) add:

```ts
async function fetchAccountMap(): Promise<Map<string, ApiAccount>> {
  const accounts = await apiClient.get<ApiAccount[]>('/accounts');
  return new Map(accounts.map((a) => [a.id, a]));
}
```

- [ ] **Step 2: Add `source` to `TxListParams`.** In the interface (line ~187) add:

```ts
  /** Restrict to bank/UPI or credit-card transactions (server-side). */
  source?: 'bank' | 'card';
```

- [ ] **Step 3: Wire `source` + accounts into `list`.** In `transactions.list`, after the `accountId` line add:

```ts
      if (params?.source) qs.set('source', params.source);
```
Replace the final two lines of `list` (the `catMap` fetch + map) with a parallel accounts fetch:
```ts
      const [catMap, acctMap] = await Promise.all([fetchCategoryMap(), fetchAccountMap()]);
      return txItems(raw).map((tx) =>
        toTxView(tx, catMap.get(tx.categoryId), tx.accountId ? acctMap.get(tx.accountId) : undefined),
      );
```

- [ ] **Step 4: Thread accounts into `recent`.** Replace its body's `catMap` fetch + map:

```ts
      const [catMap, acctMap] = await Promise.all([fetchCategoryMap(), fetchAccountMap()]);
      return txItems(raw).map((tx) =>
        toRecentTxView(
          tx,
          catMap.get(tx.categoryId),
          displayDate(tx.date.slice(0, 10)),
          tx.accountId ? acctMap.get(tx.accountId) : undefined,
        ),
      );
```

- [ ] **Step 5: Forward `paymentMethod` on create.** In `transactions.create`, in the POST body add after the `accountId` spread:

```ts
        ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
```
And after `create` maps the result, pass the account so the returned view has a source:
```ts
      const [catMap, acctMap] = await Promise.all([fetchCategoryMap(), fetchAccountMap()]);
      return toTxView(created, catMap.get(created.categoryId), created.accountId ? acctMap.get(created.accountId) : undefined);
```

- [ ] **Step 6: Map the sms `paymentMethod` hint (if the sms parse feeds NewTxInput).** Locate the sms parse consumer (search `sms-sync` / `parse` usage in `mobile/src`). Where a parsed SMS becomes a `NewTxInput`/prefill, carry `paymentMethod: parsed.paymentMethod`. If the mobile sms flow only prefills the account, add `paymentMethod` to that prefill object. (Confirm the exact call site — `mobile/src/lib/smsSync.ts` — and thread the field; do not invent a flow that isn't there.)

- [ ] **Step 7: Typecheck.**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit.**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add -A && git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -m "feat(mobile): thread accounts + source param through the tx api"
```

---

## Task 11: SourceTag component + render sites

**Files:**
- Create: `mobile/src/components/SourceTag.tsx`
- Modify: `mobile/src/screens/SwipeRow.tsx`, `mobile/src/screens/TxDetail.tsx`, `mobile/src/screens/Home.tsx`

**Interfaces:**
- Consumes: `TxSource`.
- Produces: `<SourceTag source={TxSource} />` — a pill with a kind-colored dot + label.

- [ ] **Step 1: Create the component.** `mobile/src/components/SourceTag.tsx`:

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/tokens';
import type { TxSource, SourceKind } from '../api/paymentSource';

function dotColor(kind: SourceKind, t: ReturnType<typeof useTheme>): string {
  switch (kind) {
    case 'card': return t.em;
    case 'autopay': return t.amber;
    case 'cash': return t.text3;
    case 'bank':
    case 'upi':
    default: return t.cyan;
  }
}

export function SourceTag({ source }: { source?: TxSource }) {
  const t = useTheme();
  if (!source) return null;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg3, borderColor: t.border }]}>
      <View style={[styles.dot, { backgroundColor: dotColor(source.kind, t) }]} />
      <Text style={[styles.label, { color: t.text3 }]} numberOfLines={1}>{source.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 1.5, paddingHorizontal: 7, borderRadius: 99, borderWidth: 1, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 10, fontWeight: '700' },
});
```

Confirm the theme hook name/exports in `mobile/src/theme/tokens.ts` (this codebase uses a `useTheme()`-style accessor returning `{ em, cyan, amber, text3, bg3, border, ... }`). If the accessor differs (e.g. `useTokens()`), match it; the token keys `em/cyan/amber/text3/bg3/border` exist.

- [ ] **Step 2: Render in `SwipeRow.tsx`.** In the transaction row's subtitle line (where category name + date render), add after the existing meta text:

```tsx
{tx.source ? <SourceTag source={tx.source} /> : null}
```
Import: `import { SourceTag } from '../components/SourceTag';`. Place it so it sits inline with the category/date meta (a `flexDirection: 'row'` container with a small gap), matching the prototype's row where the tag trails the category. Confirm the exact JSX node by reading the row's meta block.

- [ ] **Step 3: Render in `TxDetail.tsx`.** Add a `<SourceTag source={tx.source} />` near the account/category detail rows (import as above).

- [ ] **Step 4: Render in `Home.tsx` recent list.** In the recent-transaction row, add `{item.source ? <SourceTag source={item.source} /> : null}` in the row's subtitle line (import as above).

- [ ] **Step 5: Typecheck.**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Verify visually.** Use the superpowers `run`/`verify` skill to launch the app and confirm the source pill appears on transaction rows in Activity, Home recents, and the detail screen.

- [ ] **Step 7: Commit.**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add -A && git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -m "feat(mobile): SourceTag pill on tx rows, detail, and home"
```

---

## Task 12: Activity Bank/Cards segmented filter

**Files:**
- Modify: `mobile/src/screens/Txns.tsx`

**Interfaces:**
- Consumes: `api.transactions.list({ period, source })`; `MSeg<T>`.
- Produces: a second segmented control controlling a `source` state.

- [ ] **Step 1: Add source state + type.** Near the existing `const [filter, setFilter] = useState<FilterValue>('all')` (line ~94) add:

```ts
type SourceValue = 'all' | 'bank' | 'card';
const [source, setSource] = useState<SourceValue>('all');
```

- [ ] **Step 2: Pass source to the query.** Change the data hook (line ~98) to include `source` in params and deps:

```ts
const { data: txData } = useApiData(
  () => api.transactions.list({ period, source: source === 'all' ? undefined : source }),
  EMPTY_TXNS,
  [period, source],
);
```

- [ ] **Step 3: Render the control.** Next to the existing income/expense `MSeg` (line ~177), add a second segmented control:

```tsx
<MSeg<SourceValue>
  options={[
    { value: 'all', label: 'All' },
    { value: 'bank', label: 'Bank & UPI' },
    { value: 'card', label: 'Cards' },
  ]}
  value={source}
  onChange={setSource}
/>
```
Place it above or below the existing filter `MSeg`, matching the screen's spacing (wrap in the same container style the existing `MSeg` uses).

- [ ] **Step 4: Typecheck.**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify.** Launch the app; toggling Bank & UPI / Cards re-queries and shows only the matching side (card spends under Cards).

- [ ] **Step 6: Commit.**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add -A && git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -m "feat(mobile): Bank & UPI / Cards filter on Activity"
```

---

## Task 13: Add-Transaction account picker

**Files:**
- Modify: `mobile/src/app/AddTxSheet.tsx`

**Interfaces:**
- Consumes: `api.accounts.list()` (returns `AccountView[]`); `NewTxInput.accountId`, `NewTxInput.paymentMethod`.
- Produces: an account/card selector; selecting a credit card sends `paymentMethod: 'card'`, a bank account sends `'upi'`.

- [ ] **Step 1: Read the sheet.** Read `mobile/src/app/AddTxSheet.tsx` fully to find where the payload is assembled (around line 268–276, `accountId: addPrefill?.accountId`) and where form rows render.

- [ ] **Step 2: Load accounts.** Add state and load accounts (bank + credit) when the sheet opens, using the existing api and account-view shape. Include both bank accounts and cards; default the selection to the prefill account or the primary bank account.

```ts
const [accountId, setAccountId] = useState<string | undefined>(addPrefill?.accountId);
const { data: accounts } = useApiData(() => api.accounts.list(), [], []);
const selected = accounts.find((a) => a.id === accountId);
```

- [ ] **Step 3: Render a picker row.** Add a horizontal selectable list (chips or rows) of accounts under the amount/category fields, each showing the account name + type; tapping sets `accountId`. Mirror the existing selectable-row styling already used in this sheet (follow the sheet's own component conventions — do not import new UI kits).

- [ ] **Step 4: Send accountId + derived paymentMethod.** Where the payload is built, replace the `accountId` line so it uses the picked account and sends a matching method:

```ts
        accountId,
        paymentMethod: selected?.type === 'credit' ? 'card' : accountId ? 'upi' : undefined,
```
(The backend also derives this, so `paymentMethod` is belt-and-suspenders; sending it keeps the optimistic view correct.)

- [ ] **Step 5: Typecheck.**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Verify.** Launch the app; add an expense, pick a credit card, confirm the new row shows the `… CC` tag and appears under the Cards filter.

- [ ] **Step 7: Commit.**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add -A && git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -m "feat(mobile): account/card picker in Add Transaction"
```

---

## Task 14: CSV export Source column

**Files:**
- Modify: `mobile/src/lib/exportCsv.ts`

**Interfaces:**
- Consumes: `TxView.source`.

- [ ] **Step 1: Add the column.** In `buildTxCsv`, update the header and row:

```ts
  const header = 'Date,Description,Category,Type,Source,Amount (INR)';
  const rows = txs.map((tx) =>
    [
      tx.date,
      csvEscape(tx.desc),
      csvEscape(tx.cat),
      tx.type === 'inc' ? 'income' : 'expense',
      csvEscape(tx.source?.label ?? ''),
      String(tx.amount),
    ].join(','),
  );
```

- [ ] **Step 2: Typecheck.**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add -A && git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -q -m "feat(mobile): add Source column to CSV export"
```

---

## Final verification

- [ ] **Backend suite green:** `cd backend && npx jest` → all pass.
- [ ] **Mobile pure-logic green:** `cd mobile && npx jest` → `paymentSource` + `adapters` pass.
- [ ] **Typecheck both:** `cd backend && npx tsc --noEmit` and `cd mobile && npx tsc --noEmit`.
- [ ] **Drive the app** (superpowers `verify`): add a UPI expense and a card expense; confirm tags render, the Bank/Cards filter splits them, the card spend appears under Cards, and CSV export includes the Source column.
