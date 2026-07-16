# Money-management Follow-ups (Slices B & C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the logged Slice B & C follow-ups — legacy-card empty state, SMS account-linking + reverse-dedup, reverse-dedup tightening, and pay() hardening — as a batch of small, self-contained fixes.

**Architecture:** Backend (NestJS/TypeORM) reuses the existing shared helpers the notification-sync pipeline already uses (`resolvePaymentSource`, `reverse-dedup`); the SMS `parse-batch` endpoint gains account resolution + a duplicate flag. Mobile (Expo/RN) threads the resolved `accountId` into transaction creation, surfaces a "possible duplicate" hint, and gives legacy credit cards a "Set up this card" empty state backed by an upsert on the existing card config endpoint.

**Tech Stack:** NestJS, TypeORM (`synchronize: true`), Jest (backend TDD). Expo SDK 56, React Native, ts-jest pure-logic harness (mobile RN components verified by `tsc --noEmit` + on-device, not component tests).

## Global Constraints

- **Commit invocation (every commit step):** `git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "<msg>"`. NO `Co-Authored-By` trailer. Author email `gairola.ashutosh26@gmail.com`.
- **Staging:** NEVER `git add -A`. Stage exact paths only (the branch is shared; unrelated uncommitted files + parallel commits exist). Never commit `mobile/.env` or anything under `.superpowers/`.
- **Backend DB:** `synchronize: true` — no migrations needed (no new/changed columns here anyway).
- **Backend lint auto-fixes** (`npm run lint` runs `eslint --fix`) — verify with `npx jest` / `npx tsc --noEmit` / `npx eslint <path> --no-fix`, not `npm run lint`.
- **Mobile has NO component-test harness.** Pure-logic `.spec.ts` under ts-jest only. Verify RN components with `cd mobile && npx tsc --noEmit`. `tsc` emits ~6–7 PRE-EXISTING errors in `mobile/modules/notification-listener/index.test.ts` — IGNORE them; only your own new/edited source must be clean. Do NOT touch `mobile/tsconfig.json`.
- **Before writing mobile code, read Expo v56 docs** per `mobile/AGENTS.md` (https://docs.expo.dev/versions/v56.0.0/). Nothing here needs a new Expo API, but honor the rule.
- **Test suites (baseline, must stay green):** `cd backend && npx jest` → 218 pass; `cd mobile && npx jest` → 67 pass.

---

## Task 1: Reverse-dedup — expose verdict + tighten silent-suppression

**Files:**
- Modify: `backend/src/statements/reverse-dedup.ts`
- Test: `backend/src/statements/reverse-dedup.spec.ts`

**Interfaces:**
- Consumes: `classifyLineItems`, `ParsedLineItem`, `ExistingTxn`, `Verdict` from `./statement-dedup`.
- Produces:
  - `reverseDedupVerdict(candidate: ParsedLineItem, existing: ExistingTxn[], windowDays?: number): 'new' | 'possible' | 'duplicate'`
  - `isLikelyDuplicateOfExisting(candidate: ParsedLineItem, existing: ExistingTxn[], windowDays?: number): boolean` — now `true` ONLY when verdict is `'duplicate'`.

Rationale: `isLikelyDuplicateOfExisting` (used by notification-sync to SILENTLY drop a detection) currently returns `verdict !== 'new'`, so it drops `'possible'` (ambiguous, ≥2 candidates) too — which can silently lose a genuine 2nd identical charge within ±3d. Tighten it to exact duplicates. Task 4 (SMS) will call `reverseDedupVerdict` directly and FLAG on `!== 'new'` (safe, because it only flags — the user decides).

- [ ] **Step 1: Write the failing tests**

Replace the body of `backend/src/statements/reverse-dedup.spec.ts` with:

```ts
import { isLikelyDuplicateOfExisting, reverseDedupVerdict } from './reverse-dedup';

const existingOne = [
  { id: 't', isoDate: '2026-06-12', amount: 499, direction: 'debit' as const, descriptor: 'X', importFingerprint: null },
];
// two live candidates in-window for the same amount+direction → 'possible'
const existingTwo = [
  { id: 't1', isoDate: '2026-06-12', amount: 499, direction: 'debit' as const, descriptor: 'X', importFingerprint: null },
  { id: 't2', isoDate: '2026-06-13', amount: 499, direction: 'debit' as const, descriptor: 'Y', importFingerprint: null },
];
const candidate = { isoDate: '2026-06-13', amount: 499, direction: 'debit' as const, descriptor: 'Swiggy', category: null };

describe('reverseDedupVerdict', () => {
  it("returns 'duplicate' for a single in-window match", () => {
    expect(reverseDedupVerdict(candidate, existingOne)).toBe('duplicate');
  });
  it("returns 'possible' for 2+ in-window candidates", () => {
    expect(reverseDedupVerdict(candidate, existingTwo)).toBe('possible');
  });
  it("returns 'new' when nothing matches", () => {
    expect(reverseDedupVerdict(candidate, [])).toBe('new');
  });
});

describe('isLikelyDuplicateOfExisting', () => {
  it('true only on an exact duplicate (single match)', () => {
    expect(isLikelyDuplicateOfExisting(candidate, existingOne)).toBe(true);
  });
  it("false on 'possible' (2+ candidates) — no silent drop of a real 2nd charge", () => {
    expect(isLikelyDuplicateOfExisting(candidate, existingTwo)).toBe(false);
  });
  it('false when nothing matches', () => {
    expect(isLikelyDuplicateOfExisting(candidate, [])).toBe(false);
  });
  it('false when the only match is outside the ±3d window', () => {
    const far = [{ id: 't', isoDate: '2026-06-01', amount: 499, direction: 'debit' as const, descriptor: 'X', importFingerprint: null }];
    expect(isLikelyDuplicateOfExisting(candidate, far)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/statements/reverse-dedup.spec.ts`
Expected: FAIL — `reverseDedupVerdict` is not exported; the `'possible'` cases fail against the old `verdict !== 'new'`.

- [ ] **Step 3: Implement**

Replace the body of `backend/src/statements/reverse-dedup.ts` with:

```ts
import { classifyLineItems, ExistingTxn, ParsedLineItem, Verdict } from './statement-dedup';

/** Classify one incoming charge (from SMS/notification) against an account's
 * existing transactions using the same deterministic matcher as statement
 * import, so both dedup directions agree. */
export function reverseDedupVerdict(
  candidate: ParsedLineItem,
  existing: ExistingTxn[],
  windowDays = 3,
): Verdict {
  return classifyLineItems('rev', [candidate], existing, { windowDays })[0].verdict;
}

/** True only when the incoming charge is an EXACT duplicate of an existing
 * transaction — the predicate used to SILENTLY suppress a detection. Ambiguous
 * ('possible') matches are deliberately NOT suppressed, so a genuine 2nd
 * identical charge within the window is never dropped without the user seeing
 * it. */
export function isLikelyDuplicateOfExisting(
  candidate: ParsedLineItem,
  existing: ExistingTxn[],
  windowDays = 3,
): boolean {
  return reverseDedupVerdict(candidate, existing, windowDays) === 'duplicate';
}
```

- [ ] **Step 4: Run the file's tests + the full backend suite**

Run: `cd backend && npx jest src/statements/reverse-dedup.spec.ts` → PASS.
Run: `cd backend && npx jest` → all green (was 218). The notification-sync suppression tests use a single exact match (`'duplicate'`), so they still pass. If any notification-sync test relied on suppressing a `'possible'` case, update that test to reflect the new (safer) behavior — the detection now flows through instead of being dropped.
Run: `cd backend && npx tsc --noEmit` → clean except the known pre-existing `auth.service.spec.ts` error.

- [ ] **Step 5: Commit**

```bash
git add backend/src/statements/reverse-dedup.ts backend/src/statements/reverse-dedup.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "fix(backend): tighten reverse-dedup suppression to exact duplicates + expose verdict"
```

---

## Task 2: pay() rejects a credit-card source account

**Files:**
- Modify: `backend/src/credit-card/credit-card.service.ts` (method `pay`, lines ~130–148)
- Test: `backend/src/credit-card/credit-card.pay.spec.ts`

**Interfaces:**
- Consumes: `AccountType` from `../common/enums`, `BadRequestException` from `@nestjs/common` (both already imported in the service).
- Produces: no signature change; `pay()` now throws `BadRequestException('Cannot pay a card bill from a credit card')` when `fromAccountId` resolves to a `CREDIT` account, before any balance check or transaction create.

- [ ] **Step 1: Write the failing test**

Open `backend/src/credit-card/credit-card.pay.spec.ts`, find how the existing tests build the service + mocks, and add a test mirroring that setup:

```ts
it('rejects paying a card bill from a credit-card source account', async () => {
  // card account (target) is CREDIT; source account is ALSO credit
  accountsService.findOne = jest
    .fn()
    .mockResolvedValueOnce({ id: 'card1', type: AccountType.CREDIT, name: 'Amex', balance: 0 }) // target card
    .mockResolvedValueOnce({ id: 'card2', type: AccountType.CREDIT, name: 'HDFC CC', balance: 100000 }); // source
  await expect(
    service.pay('card1', 'u1', { fromAccountId: 'card2', amount: 500 }),
  ).rejects.toThrow('Cannot pay a card bill from a credit card');
  expect(transactionsService.create).not.toHaveBeenCalled();
});
```

Adjust the mock variable names (`accountsService`, `transactionsService`, `service`) to match the file's existing `beforeEach` wiring; import `AccountType` from `../common/enums` if not already imported.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/credit-card/credit-card.pay.spec.ts`
Expected: FAIL — no such guard; `transactionsService.create` is called.

- [ ] **Step 3: Implement**

In `credit-card.service.ts` `pay()`, immediately after `const from = await this.accountsService.findOne(dto.fromAccountId, userId);` and BEFORE the balance check, insert:

```ts
    if (from.type === AccountType.CREDIT) {
      throw new BadRequestException('Cannot pay a card bill from a credit card');
    }
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest src/credit-card/credit-card.pay.spec.ts` → PASS.
Run: `cd backend && npx jest` → all green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/credit-card/credit-card.service.ts backend/src/credit-card/credit-card.pay.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "fix(backend): reject credit-card source in card bill pay()"
```

---

## Task 3: updateConfig upserts a missing credit_card row (legacy cards)

**Files:**
- Modify: `backend/src/credit-card/credit-card.service.ts` (method `updateConfig`, lines ~123–128)
- Test: `backend/src/credit-card/credit-card.service.spec.ts`

**Interfaces:**
- Consumes: `accountsService.findOne`, `cardRepo` (both already injected); `AccountType`, `NotFoundException`, `BadRequestException` (already imported).
- Produces: `updateConfig(accountId, userId, dto)` now CREATES the `credit_card` row when absent (for a valid, user-owned CREDIT account) before applying `dto`, then returns `getSummary`. `GET`/`pay` are unchanged (still 404 until set up). This is what the mobile "Set up this card" empty state (Task 7) calls.

- [ ] **Step 1: Write the failing tests**

In `backend/src/credit-card/credit-card.service.spec.ts`, using the file's existing mock wiring for `cardRepo` / `accountsService`, add:

```ts
describe('updateConfig upsert (legacy card)', () => {
  it('creates the row from defaults when none exists, then applies the dto', async () => {
    cardRepo.findOne = jest.fn().mockResolvedValue(null); // no existing row
    accountsService.findOne = jest
      .fn()
      .mockResolvedValue({ id: 'acc1', type: AccountType.CREDIT, name: 'HDFC', balance: -5000 });
    const created: any = { accountId: 'acc1', userId: 'u1', creditLimit: 0, statementDay: 1, graceDays: 18 };
    cardRepo.create = jest.fn().mockReturnValue(created);
    cardRepo.save = jest.fn().mockImplementation(async (c) => c);
    // getSummary re-reads the row; stub it to short-circuit after the save
    const getSummary = jest.spyOn(service, 'getSummary').mockResolvedValue({ ok: true } as any);

    await service.updateConfig('acc1', 'u1', { creditLimit: 200000, statementDay: 5 });

    expect(cardRepo.create).toHaveBeenCalledWith({ accountId: 'acc1', userId: 'u1' });
    expect(cardRepo.save).toHaveBeenCalledWith(expect.objectContaining({ creditLimit: 200000, statementDay: 5 }));
    expect(getSummary).toHaveBeenCalledWith('acc1', 'u1');
  });

  it('rejects setting up a non-credit account', async () => {
    cardRepo.findOne = jest.fn().mockResolvedValue(null);
    accountsService.findOne = jest.fn().mockResolvedValue({ id: 'acc1', type: AccountType.BANK, name: 'SBI', balance: 100 });
    await expect(service.updateConfig('acc1', 'u1', { creditLimit: 1 })).rejects.toThrow('Account is not a credit card');
    expect(cardRepo.create).not.toHaveBeenCalled();
  });

  it('updates in place when the row already exists (no create)', async () => {
    const existing: any = { accountId: 'acc1', userId: 'u1', creditLimit: 0, statementDay: 1 };
    cardRepo.findOne = jest.fn().mockResolvedValue(existing);
    cardRepo.save = jest.fn().mockImplementation(async (c) => c);
    cardRepo.create = jest.fn();
    jest.spyOn(service, 'getSummary').mockResolvedValue({ ok: true } as any);
    await service.updateConfig('acc1', 'u1', { creditLimit: 50000 });
    expect(cardRepo.create).not.toHaveBeenCalled();
    expect(cardRepo.save).toHaveBeenCalledWith(expect.objectContaining({ creditLimit: 50000 }));
  });
});
```

Match the exact mock accessor names (`cardRepo`, `accountsService`, `service`) to the file's `beforeEach`; import `AccountType` from `../common/enums` if missing. If the existing spec builds repos via `getRepositoryToken`, reuse that handle for `cardRepo`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/credit-card/credit-card.service.spec.ts`
Expected: FAIL — current `updateConfig` calls `loadCard`, which throws `NotFoundException` when `findOne` returns null (never reaches create).

- [ ] **Step 3: Implement**

Replace `updateConfig` in `credit-card.service.ts` with:

```ts
  async updateConfig(accountId: string, userId: string, dto: UpdateCardDto) {
    let card = await this.cardRepo.findOne({ where: { accountId, userId } });
    if (!card) {
      // Legacy credit accounts (created before Slice B) have no credit_card
      // row. Create one on first config-save (the mobile "Set up this card"
      // empty state), guarded to the user's own CREDIT accounts. Column
      // defaults mirror the create-on-account-create seed.
      const account = await this.accountsService.findOne(accountId, userId);
      if (account.type !== AccountType.CREDIT) {
        throw new BadRequestException('Account is not a credit card');
      }
      card = this.cardRepo.create({ accountId, userId });
    }
    Object.assign(card, dto);
    await this.cardRepo.save(card);
    return this.getSummary(accountId, userId);
  }
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest src/credit-card/credit-card.service.spec.ts` → PASS.
Run: `cd backend && npx jest` → all green.
Run: `cd backend && npx tsc --noEmit` → clean except the known `auth.service.spec.ts` error.

- [ ] **Step 5: Commit**

```bash
git add backend/src/credit-card/credit-card.service.ts backend/src/credit-card/credit-card.service.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): upsert credit_card row on config-save for legacy cards"
```

---

## Task 4: SMS parse-batch resolves accountId + flags reverse-duplicates

**Files:**
- Modify: `backend/src/sms-sync/dto/parse.dto.ts` (add `date?` to `SmsMessageDto`; add `ParsedSmsBatchItem` result interface)
- Modify: `backend/src/sms-sync/sms-sync.service.ts` (constructor deps + `parseBatch` becomes async and resolves account + dedup)
- Modify: `backend/src/sms-sync/sms-sync.module.ts` (imports)
- Modify: `backend/src/sms-sync/sms-sync.controller.ts` (pass `user.userId`)
- Test: `backend/src/sms-sync/sms-sync.service.spec.ts`

**Interfaces:**
- Consumes: `resolvePaymentSource` from `../notification-sync/payment-source-resolver`; `reverseDedupVerdict` + `ExistingTxn` from `../statements/reverse-dedup` / `../statements/statement-dedup` (Task 1); `AccountsService.findAll`; `TransactionsService.findForAccountInRange`; `CreditCard` repo; `TransactionType`, `AccountType` from `../common/enums`.
- Produces: `parseBatch(userId: string, messages: { id: string; raw: string; date?: number }[]): Promise<ParsedSmsBatchItem[]>` where `ParsedSmsBatchItem = ParseSmsResult & { id: string; raw: string; accountId: string | null; possibleDuplicate: boolean }`. Mobile (Task 5) reads `accountId` + `possibleDuplicate`.

Reference implementation for the resolution + reverse-dedup block: `backend/src/notification-sync/notification-sync.service.ts:92–152` (mirror the `augmentedAccounts` build, the `ExistingTxn` mapping incl. the TRANSFER direction branch, and the candidate build).

- [ ] **Step 1: Extend the DTO**

In `backend/src/sms-sync/dto/parse.dto.ts`:

Add `IsInt`, `IsOptional` to the `class-validator` import, then add to `SmsMessageDto`:

```ts
  @IsOptional()
  @IsInt()
  date?: number; // epoch ms; used as the txn date + reverse-dedup window center
```

At the bottom of the file add the batch-result type (keep `ParseSmsResult` unchanged — the `parse` endpoint still returns it):

```ts
export interface ParsedSmsBatchItem extends ParseSmsResult {
  id: string;
  raw: string;
  accountId: string | null;
  possibleDuplicate: boolean;
}
```

- [ ] **Step 2: Write the failing tests**

In `backend/src/sms-sync/sms-sync.service.spec.ts`, the existing tests call `service.parseBatch(messages)` synchronously — they must move to the new async signature with injected deps. Update the `beforeEach` to build the service with mocks, and replace/extend the batch tests:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SmsSyncService } from './sms-sync.service';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CreditCard } from '../credit-card/credit-card.entity';
import { AccountType, TransactionType } from '../common/enums';

describe('SmsSyncService.parseBatch (resolution + reverse-dedup)', () => {
  let service: SmsSyncService;
  let accounts: { findAll: jest.Mock };
  let transactions: { findForAccountInRange: jest.Mock };
  let cardRepo: { find: jest.Mock };

  beforeEach(async () => {
    accounts = { findAll: jest.fn().mockResolvedValue([]) };
    transactions = { findForAccountInRange: jest.fn().mockResolvedValue([]) };
    cardRepo = { find: jest.fn().mockResolvedValue([]) };
    const mod = await Test.createTestingModule({
      providers: [
        SmsSyncService,
        { provide: AccountsService, useValue: accounts },
        { provide: TransactionsService, useValue: transactions },
        { provide: getRepositoryToken(CreditCard), useValue: cardRepo },
      ],
    }).compile();
    service = mod.get(SmsSyncService);
  });

  const cardSms = { id: 'm1', raw: 'Rs.499 spent on HDFC Credit Card xx4521 at SWIGGY', date: Date.parse('2026-06-13T10:00:00Z') };

  it('resolves accountId for a unique last4 card match', async () => {
    accounts.findAll.mockResolvedValue([
      { id: 'acc-card', institutionName: 'HDFC Bank', type: AccountType.CREDIT },
    ]);
    cardRepo.find.mockResolvedValue([{ accountId: 'acc-card', last4: '4521' }]);
    const [item] = await service.parseBatch('u1', [cardSms]);
    expect(item.accountId).toBe('acc-card');
    expect(item.possibleDuplicate).toBe(false);
  });

  it('leaves accountId null and possibleDuplicate false when no account matches', async () => {
    const [item] = await service.parseBatch('u1', [cardSms]);
    expect(item.accountId).toBeNull();
    expect(item.possibleDuplicate).toBe(false);
    expect(transactions.findForAccountInRange).not.toHaveBeenCalled();
  });

  it('flags possibleDuplicate when a resolved account already has a matching txn', async () => {
    accounts.findAll.mockResolvedValue([
      { id: 'acc-card', institutionName: 'HDFC Bank', type: AccountType.CREDIT },
    ]);
    cardRepo.find.mockResolvedValue([{ accountId: 'acc-card', last4: '4521' }]);
    transactions.findForAccountInRange.mockResolvedValue([
      { id: 'tx1', date: '2026-06-13', amount: -499, type: TransactionType.EXPENSE, accountId: 'acc-card', description: 'Swiggy', importFingerprint: null },
    ]);
    const [item] = await service.parseBatch('u1', [cardSms]);
    expect(item.possibleDuplicate).toBe(true);
  });

  it('skips non-transaction messages (no amount)', async () => {
    const out = await service.parseBatch('u1', [{ id: 'x', raw: 'Your OTP is 4521', date: 0 }]);
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && npx jest src/sms-sync/sms-sync.service.spec.ts`
Expected: FAIL — `parseBatch` is sync/one-arg; constructor takes no deps; `accountId`/`possibleDuplicate` absent.

- [ ] **Step 4: Wire the module**

In `backend/src/sms-sync/sms-sync.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmsSyncController } from './sms-sync.controller';
import { SmsSyncService } from './sms-sync.service';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { CreditCard } from '../credit-card/credit-card.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CreditCard]),
    AccountsModule,
    TransactionsModule,
  ],
  controllers: [SmsSyncController],
  providers: [SmsSyncService],
  exports: [SmsSyncService],
})
export class SmsSyncModule {}
```

(If `AccountsModule` / `TransactionsModule` don't export their services, confirm — they already do, since `CreditCardModule` and `notification-sync` consume them. No `forwardRef` needed.)

- [ ] **Step 5: Implement the service**

In `backend/src/sms-sync/sms-sync.service.ts`:

Add imports:

```ts
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CreditCard } from '../credit-card/credit-card.entity';
import { AccountType, TransactionType } from '../common/enums';
import { resolvePaymentSource } from '../notification-sync/payment-source-resolver';
import { reverseDedupVerdict } from '../statements/reverse-dedup';
import { ExistingTxn } from '../statements/statement-dedup';
import { ParsedSmsBatchItem } from './dto/parse.dto';
```

Add a constructor:

```ts
  constructor(
    private readonly accountsService: AccountsService,
    private readonly transactionsService: TransactionsService,
    @InjectRepository(CreditCard)
    private readonly cardRepo: Repository<CreditCard>,
  ) {}
```

Replace `parseBatch` with:

```ts
  /**
   * Parse a batch of on-device SMS bodies, keep the transaction alerts, and —
   * where the text identifies the account — resolve its `accountId` and flag a
   * likely reverse-duplicate (a charge already recorded from SMS, notification
   * capture, or a statement import). Flagging (not dropping) leaves the user in
   * control on the Sync review screen.
   */
  async parseBatch(
    userId: string,
    messages: { id: string; raw: string; date?: number }[],
  ): Promise<ParsedSmsBatchItem[]> {
    const parsed = messages
      .map((m) => ({ m, result: this.parse(m.raw) }))
      .filter((x) => x.result.amount !== null);
    if (parsed.length === 0) return [];

    const accounts = await this.accountsService.findAll(userId);
    // Only credit accounts carry a last4 (on their credit_card row).
    const cardRows = await this.cardRepo.find({ where: { userId } });
    const last4ByAccount = new Map(cardRows.map((c) => [c.accountId, c.last4]));
    const augmentedAccounts = accounts.map((a) => ({
      id: a.id,
      institutionName: a.institutionName,
      type: a.type,
      last4: last4ByAccount.get(a.id) ?? null,
    }));

    const out: ParsedSmsBatchItem[] = [];
    for (const { m, result } of parsed) {
      const { accountId } = resolvePaymentSource(
        result.bank,
        result.paymentMethod, // rail: 'upi' | 'card' | 'autopay'
        augmentedAccounts,
        result.last4,
      );

      let possibleDuplicate = false;
      if (accountId) {
        const when = m.date ? new Date(m.date) : new Date();
        const from = new Date(when.getTime() - 3 * 86_400_000);
        const to = new Date(when.getTime() + 3 * 86_400_000);
        const rows = await this.transactionsService.findForAccountInRange(
          userId,
          accountId,
          from,
          to,
        );
        const existing: ExistingTxn[] = rows.map((tx) => ({
          id: tx.id,
          isoDate: new Date(tx.date).toISOString().slice(0, 10),
          amount: Math.abs(tx.amount),
          direction:
            tx.type === TransactionType.INCOME
              ? 'credit'
              : tx.type === TransactionType.TRANSFER
                ? tx.accountId === accountId
                  ? 'debit'
                  : 'credit'
                : 'debit',
          descriptor: tx.description ?? '',
          importFingerprint: tx.importFingerprint ?? null,
        }));
        const candidate = {
          isoDate: when.toISOString().slice(0, 10),
          amount: result.amount as number,
          direction: (result.type === 'income' ? 'credit' : 'debit') as 'credit' | 'debit',
          descriptor: result.merchant ?? '',
          category: null,
        };
        possibleDuplicate = reverseDedupVerdict(candidate, existing) !== 'new';
      }

      out.push({ id: m.id, raw: m.raw, ...result, accountId, possibleDuplicate });
    }
    return out;
  }
```

- [ ] **Step 6: Update the controller**

In `backend/src/sms-sync/sms-sync.controller.ts`, rename `_user` → `user` in `parseBatch` and pass the id:

```ts
  @Post('parse-batch')
  parseBatch(
    @CurrentUser() user: { userId: string; email: string },
    @Body() dto: ParseSmsBatchDto,
  ) {
    return this.smsSyncService.parseBatch(user.userId, dto.messages);
  }
```

(Leave the `parse` endpoint's `_user` as-is.)

- [ ] **Step 7: Run tests + full suite + tsc**

Run: `cd backend && npx jest src/sms-sync/sms-sync.service.spec.ts` → PASS.
Run: `cd backend && npx jest` → all green.
Run: `cd backend && npx tsc --noEmit` → clean except the known `auth.service.spec.ts` error.

- [ ] **Step 8: Commit**

```bash
git add backend/src/sms-sync/dto/parse.dto.ts backend/src/sms-sync/sms-sync.service.ts backend/src/sms-sync/sms-sync.module.ts backend/src/sms-sync/sms-sync.controller.ts backend/src/sms-sync/sms-sync.service.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): SMS parse-batch resolves accountId + flags reverse-duplicates"
```

---

## Task 5: Mobile SMS mapping — send timestamp, map accountId + possibleDuplicate

**Files:**
- Create: `mobile/src/lib/smsSyncMap.ts` (pure mapping + helpers, no RN/native imports)
- Create: `mobile/src/lib/smsSyncMap.spec.ts`
- Modify: `mobile/src/lib/smsSync.ts` (send `date`; use the pure mapper)
- Modify: `mobile/src/screens/Sync.tsx` (extend `SyncDetected` type — the exported interface)

**Interfaces:**
- Consumes (wire from Task 4): `{ id, raw, merchant, amount, type, category, account, bank, last4, confidence, paymentMethod, accountId, possibleDuplicate }`.
- Produces:
  - `ParsedSmsWire` interface (the batch response item)
  - `toSyncDetected(p: ParsedSmsWire, isoDate: string): SyncDetected`
  - `nonDuplicates(list: SyncDetected[]): SyncDetected[]` — drops `possibleDuplicate` items (used by Task 6's "Add all")
  - `SyncDetected` (in `Sync.tsx`) gains `accountId?: string` and `possibleDuplicate?: boolean`.

- [ ] **Step 1: Extend the `SyncDetected` type**

In `mobile/src/screens/Sync.tsx`, find the exported `SyncDetected` interface and add two fields:

```ts
  /** Resolved source account (from last4/institution match), when known. */
  accountId?: string;
  /** True when this charge likely already exists (reverse-dedup). */
  possibleDuplicate?: boolean;
```

- [ ] **Step 2: Write the failing tests**

Create `mobile/src/lib/smsSyncMap.spec.ts`:

```ts
import { toSyncDetected, nonDuplicates, type ParsedSmsWire } from './smsSyncMap';

const base: ParsedSmsWire = {
  id: 'm1', raw: 'Rs.499 at SWIGGY', merchant: 'Swiggy', amount: null as unknown as number,
  type: 'expense', category: 'Food', account: 'HDFC •4521', bank: 'HDFC Bank', last4: '4521',
  confidence: 0.8, paymentMethod: 'card', accountId: 'acc-card', possibleDuplicate: false,
};

describe('toSyncDetected', () => {
  it('maps a card expense with resolved account + signed amount + given date', () => {
    const d = toSyncDetected({ ...base, amount: 499 }, '2026-06-13');
    expect(d.amount).toBe(-499);
    expect(d.accountId).toBe('acc-card');
    expect(d.paymentMethod).toBe('card');
    expect(d.time).toBe('2026-06-13');
    expect(d.cat).toBe('Food');
    expect(d.possibleDuplicate).toBe(false);
  });

  it('signs income positive and carries the duplicate flag', () => {
    const d = toSyncDetected({ ...base, amount: 50000, type: 'income', category: 'Income', possibleDuplicate: true }, '2026-06-01');
    expect(d.amount).toBe(50000);
    expect(d.possibleDuplicate).toBe(true);
  });

  it('falls back to defaults when fields are null', () => {
    const d = toSyncDetected({ ...base, amount: 10, merchant: null, bank: null, category: null, accountId: null, account: null }, '2026-06-13');
    expect(d.merchant).toBe('Transaction');
    expect(d.bank).toBe('Bank');
    expect(d.cat).toBe('Other');
    expect(d.accountId).toBeUndefined();
  });
});

describe('nonDuplicates', () => {
  it('drops possibleDuplicate rows', () => {
    const a = toSyncDetected({ ...base, amount: 1 }, '2026-06-13');
    const b = toSyncDetected({ ...base, id: 'm2', amount: 2, possibleDuplicate: true }, '2026-06-13');
    expect(nonDuplicates([a, b])).toEqual([a]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd mobile && npx jest src/lib/smsSyncMap.spec.ts`
Expected: FAIL — module `./smsSyncMap` does not exist.

- [ ] **Step 4: Implement the pure mapper**

Create `mobile/src/lib/smsSyncMap.ts` (move `CAT_COLOR`/`CAT_ICON`/`DEFAULT_COLOR` here from `smsSync.ts`):

```ts
/**
 * Pure mapping from a parsed-SMS wire item (backend `/sms-sync/parse-batch`)
 * to the `SyncDetected` shape the Sync screen renders. Kept free of RN/native
 * imports so the mobile ts-jest harness can exercise it (see jest.config.js).
 */
import type { PaymentMethod } from '../api/types';
import type { SyncDetected } from '../screens/Sync';

export interface ParsedSmsWire {
  id: string;
  raw: string;
  merchant: string | null;
  amount: number;
  type: 'income' | 'expense';
  category: string | null;
  account: string | null;
  bank: string | null;
  last4: string | null;
  confidence: number;
  paymentMethod: PaymentMethod;
  accountId: string | null;
  possibleDuplicate: boolean;
}

/** Category → accent color, mirroring the backend keyword-map Category union. */
const CAT_COLOR: Record<string, string> = {
  Food: '#c9a86a', Groceries: '#7faf93', Utilities: '#6fb3ad', Bills: '#6fb3ad',
  Income: '#7faf93', Shopping: '#c97d8c', Transport: '#9d8bd6', Entertainment: '#c97d8c', Health: '#ef4444',
};
const CAT_ICON: Record<string, string> = {
  Food: '🍽', Groceries: '🛒', Utilities: '⚡', Bills: '⚡', Income: '💼',
  Shopping: '🛍', Transport: '🚇', Entertainment: '🎬', Health: '💊',
};
const DEFAULT_COLOR = '#8a8299';

export function toSyncDetected(p: ParsedSmsWire, isoDate: string): SyncDetected {
  const cat = p.category ?? 'Other';
  const signedAmount = p.type === 'income' ? Math.abs(p.amount) : -Math.abs(p.amount);
  return {
    id: p.id,
    raw: p.raw,
    bank: p.bank ?? 'Bank',
    amount: signedAmount,
    merchant: p.merchant ?? p.bank ?? 'Transaction',
    icon: CAT_ICON[cat] ?? '💳',
    cat,
    catCol: CAT_COLOR[cat] ?? DEFAULT_COLOR,
    account: p.account ?? '',
    time: isoDate,
    conf: p.confidence,
    paymentMethod: p.paymentMethod,
    accountId: p.accountId ?? undefined,
    possibleDuplicate: p.possibleDuplicate,
  };
}

/** Rows safe to bulk-add — excludes likely reverse-duplicates (user confirms
 * those individually). */
export function nonDuplicates(list: SyncDetected[]): SyncDetected[] {
  return list.filter((d) => !d.possibleDuplicate);
}
```

- [ ] **Step 5: Rewire `smsSync.ts` to send the timestamp and use the mapper**

In `mobile/src/lib/smsSync.ts`:
- Remove the now-unused local `CAT_COLOR`/`CAT_ICON`/`DEFAULT_COLOR` consts (lines ~24–47) and the local `ParsedSms` interface (lines ~55–67) — both are superseded by the shared module. Add: `import { toSyncDetected, type ParsedSmsWire } from './smsSyncMap';`
- Change the batch payload to include the message date, and map through `toSyncDetected`:

```ts
  const candidates = messages
    .filter((m) => !processed.has(m.id) && looksLikeMoney(m.body))
    .map((m) => ({ id: m.id, raw: m.body, date: m.date }));
  if (candidates.length === 0) return [];

  const parsed = await apiClient.post<ParsedSmsWire[]>('/sms-sync/parse-batch', {
    messages: candidates,
  });

  const dateById = new Map(candidates.map((c) => [c.id, c.date]));
  return parsed.map((p) =>
    toSyncDetected(p, new Date(dateById.get(p.id) ?? Date.now()).toISOString().slice(0, 10)),
  );
```

(`getMessages` returns `SmsMessage` with `date: number` — see `modules/sms-reader/index.ts`.)

- [ ] **Step 6: Run tests + tsc**

Run: `cd mobile && npx jest src/lib/smsSyncMap.spec.ts` → PASS.
Run: `cd mobile && npx jest` → all green (was 67).
Run: `cd mobile && npx tsc --noEmit` → no NEW errors in `smsSync.ts` / `smsSyncMap.ts` / `Sync.tsx` (ignore the pre-existing `notification-listener/index.test.ts` noise).

- [ ] **Step 7: Commit**

```bash
git add mobile/src/lib/smsSyncMap.ts mobile/src/lib/smsSyncMap.spec.ts mobile/src/lib/smsSync.ts mobile/src/screens/Sync.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(mobile): SMS sync maps resolved accountId + duplicate flag + message date"
```

(`Sync.tsx` is also edited in Task 6 — committing the type change here is fine; Task 6 amends the same file with a separate commit.)

---

## Task 6: Sync screen — thread accountId, flag duplicates, exclude from Add-all

**Files:**
- Modify: `mobile/src/screens/Sync.tsx` (`saveDetected`, `addAll`, pending-row rendering)

**Interfaces:**
- Consumes: `SyncDetected.accountId` / `.possibleDuplicate` (Task 5); `nonDuplicates` from `../lib/smsSyncMap`; `NewTxInput.accountId` (already on the type).
- Produces: no new exports. Behavior: created txns carry `accountId`; flagged rows show a "possible duplicate" hint and are excluded from "Add all" (kept in `pending` for individual review).

- [ ] **Step 1: Thread accountId into create**

In `Sync.tsx` `saveDetected`, add `accountId`:

```ts
  const saveDetected = (tx: SyncDetected) =>
    api.transactions.create({
      desc: tx.merchant,
      amount: tx.amount,
      type: tx.amount > 0 ? 'inc' : 'exp',
      categoryName: tx.cat,
      paymentMethod: tx.paymentMethod,
      ...(tx.accountId ? { accountId: tx.accountId } : {}),
    });
```

- [ ] **Step 2: Exclude flagged rows from "Add all"**

Import the helper at the top: `import { nonDuplicates } from '../lib/smsSyncMap';`

Rewrite `addAll` so flagged duplicates stay in `pending`:

```ts
  const addAll = () => {
    const batch = nonDuplicates(pending);
    if (batch.length === 0) return;
    const remaining = pending.filter((p) => p.possibleDuplicate);
    setPending(remaining);
    Promise.all(batch.map(saveDetected))
      .then(() => {
        setJustAdded((n) => n + batch.length);
        setAdded((a) => [...batch.map(toRecentRow), ...a]);
        void rememberProcessed(batch.map((b) => b.id));
      })
      .catch(() => {
        toast("Couldn't add all transactions", '📡');
        setPending((p) => [...batch, ...p]);
      });
  };
```

- [ ] **Step 3: Show a "possible duplicate" hint on pending rows**

Locate where each `pending` item renders (the detected-card row). Add a small hint when `tx.possibleDuplicate` is true, styled with the existing token palette (e.g. `t.amber`), near the merchant/category line. Keep it minimal — a `<Text>` reading `Possible duplicate` gated on `tx.possibleDuplicate`. (Exact placement is cosmetic; match the row's existing meta-row style. This is verified by `tsc` + on-device, no unit test.)

- [ ] **Step 4: Verify tsc**

Run: `cd mobile && npx tsc --noEmit` → no NEW errors (ignore the pre-existing `notification-listener/index.test.ts` noise).
Run: `cd mobile && npx jest` → still green (no logic changed in tested modules).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/Sync.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(mobile): Sync threads accountId + flags duplicates, excludes them from Add-all"
```

---

## Task 7: CardDetail "Set up this card" empty state + CardSetupSheet

**Files:**
- Create: `mobile/src/lib/cardSetup.ts` (pure patch builder)
- Create: `mobile/src/lib/cardSetup.spec.ts`
- Create: `mobile/src/app/CardSetupSheet.tsx`
- Modify: `mobile/src/screens/CardDetail.tsx` (404 branch + setup state)

**Interfaces:**
- Consumes: `useApiData().error` (an `ApiError` with `.status`) from `../api/useApi` + `ApiError` from `../api/client`; `api.cards.updateSettings(accountId, patch)` (now an upsert — Task 3); `BottomSheet`, `Btn` primitives; `UpdateCardDto` whitelist (backend): `creditLimit`, `statementDay` (1–28), `graceDays` (0–60), `network` (≤40), `last4` (≤4), `rewardRate` (≤60).
- Produces:
  - `buildCardSetupPatch(fields: { creditLimit: string; statementDay: string; network: string; last4: string }): { creditLimit: number; statementDay: number; network?: string; last4?: string }` — parses/clamps the form; used by the sheet.
  - `CardSetupSheet` component (`{ open, onClose, accountId }`).

- [ ] **Step 1: Write the failing tests for the patch builder**

Create `mobile/src/lib/cardSetup.spec.ts`:

```ts
import { buildCardSetupPatch } from './cardSetup';

describe('buildCardSetupPatch', () => {
  it('parses numbers and includes optional strings when present', () => {
    expect(buildCardSetupPatch({ creditLimit: '200000', statementDay: '5', network: 'Visa', last4: '4521' }))
      .toEqual({ creditLimit: 200000, statementDay: 5, network: 'Visa', last4: '4521' });
  });

  it('clamps statementDay into 1..28 and defaults blank/invalid to 1', () => {
    expect(buildCardSetupPatch({ creditLimit: '0', statementDay: '40', network: '', last4: '' }).statementDay).toBe(28);
    expect(buildCardSetupPatch({ creditLimit: '', statementDay: '', network: '', last4: '' }).statementDay).toBe(1);
    expect(buildCardSetupPatch({ creditLimit: '', statementDay: '0', network: '', last4: '' }).statementDay).toBe(1);
  });

  it('defaults blank creditLimit to 0 and omits empty optional strings', () => {
    const p = buildCardSetupPatch({ creditLimit: '', statementDay: '1', network: '', last4: '' });
    expect(p.creditLimit).toBe(0);
    expect('network' in p).toBe(false);
    expect('last4' in p).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest src/lib/cardSetup.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the patch builder**

Create `mobile/src/lib/cardSetup.ts`:

```ts
/**
 * Pure form → PATCH-body builder for the "Set up this card" flow. Kept
 * RN-free so the ts-jest harness can test it. Mirrors the backend
 * UpdateCardDto whitelist (creditLimit, statementDay 1..28, network, last4).
 */
export interface CardSetupFields {
  creditLimit: string;
  statementDay: string;
  network: string;
  last4: string;
}

export interface CardSetupPatch {
  creditLimit: number;
  statementDay: number;
  network?: string;
  last4?: string;
}

function clampDay(raw: string): number {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n > 28 ? 28 : n;
}

export function buildCardSetupPatch(fields: CardSetupFields): CardSetupPatch {
  const creditLimit = Number(fields.creditLimit) || 0;
  const patch: CardSetupPatch = {
    creditLimit,
    statementDay: clampDay(fields.statementDay),
  };
  const network = fields.network.trim();
  if (network) patch.network = network.slice(0, 40);
  const last4 = fields.last4.replace(/\D/g, '').slice(-4);
  if (last4) patch.last4 = last4;
  return patch;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest src/lib/cardSetup.spec.ts` → PASS.

- [ ] **Step 5: Build the CardSetupSheet**

Create `mobile/src/app/CardSetupSheet.tsx`, following the `PayBillSheet.tsx` structure (BottomSheet + themed `TextInput`s + `Btn`). Four inputs (credit limit — numeric; statement day — numeric; network — text; last4 — numeric, maxLength 4). On save call `api.cards.updateSettings` with `buildCardSetupPatch(...)` cast to the settings patch type, toast, and `onClose()`. `updateSettings` fires `bumpData()`, so CardDetail's `useApiData` refetches and the real card replaces the empty state — no manual refresh needed.

```tsx
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../api';
import type { ApiCardSummary } from '../api/types';
import { BottomSheet } from '../components/BottomSheet';
import { Btn } from '../components/ui';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useTheme } from '../theme/ThemeProvider';
import { radius, weight } from '../theme/tokens';
import { buildCardSetupPatch } from '../lib/cardSetup';

export interface CardSetupSheetProps {
  open: boolean;
  onClose: () => void;
  accountId: string;
}

export function CardSetupSheet({ open, onClose, accountId }: CardSetupSheetProps) {
  const { t } = useTheme();
  const { toast } = useFeedback();

  const [creditLimit, setCreditLimit] = useState('');
  const [statementDay, setStatementDay] = useState('1');
  const [network, setNetwork] = useState('');
  const [last4, setLast4] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCreditLimit(''); setStatementDay('1'); setNetwork(''); setLast4(''); setSaving(false);
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      const patch = buildCardSetupPatch({ creditLimit, statementDay, network, last4 });
      await api.cards.updateSettings(accountId, patch as Partial<ApiCardSummary>);
      toast('Card set up', '💳');
      onClose();
    } catch {
      toast("Couldn't save the card — try again", '📡');
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChangeText: (v: string) => void,
    opts: { numeric?: boolean; maxLength?: number; placeholder?: string } = {},
  ) => (
    <View style={styles.fieldBlock}>
      <Text style={[styles.fieldLabel, { color: t.text3, fontFamily: weight(600) }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChangeText(opts.numeric ? v.replace(/[^0-9]/g, '') : v)}
        keyboardType={opts.numeric ? 'number-pad' : 'default'}
        maxLength={opts.maxLength}
        placeholder={opts.placeholder}
        placeholderTextColor={t.text3}
        style={[styles.input, { color: t.text1, backgroundColor: t.glassBg, borderColor: t.glassBrd, fontFamily: weight(600) }]}
      />
    </View>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title="Set up this card">
      <Text style={[styles.intro, { color: t.text3, fontFamily: weight(500) }]}>
        Add your card's details so Riddhi can track the cycle, dues, and available limit.
      </Text>
      {field('Credit limit', creditLimit, setCreditLimit, { numeric: true, placeholder: '0' })}
      {field('Statement day (1–28)', statementDay, setStatementDay, { numeric: true, maxLength: 2, placeholder: '1' })}
      {field('Network (optional)', network, setNetwork, { maxLength: 40, placeholder: 'Visa / Mastercard / RuPay' })}
      {field('Last 4 digits (optional)', last4, setLast4, { numeric: true, maxLength: 4, placeholder: '4521' })}
      <Btn variant="em" onPress={() => void save()} disabled={saving} style={styles.saveBtn}>
        {saving ? 'Saving…' : 'Save card'}
      </Btn>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 12.5, lineHeight: 18, paddingBottom: 14 },
  fieldBlock: { marginBottom: 12 },
  fieldLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  input: { height: 48, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14, fontSize: 15 },
  saveBtn: { marginTop: 8, height: 52 },
});
```

Before writing, confirm `BottomSheet`'s prop names (`open`/`onClose`/`title`) against `mobile/src/components/BottomSheet.tsx` (PayBillSheet uses exactly these) and that `radius.lg` exists in `theme/tokens.ts`.

- [ ] **Step 6: Wire the 404 empty state into CardDetail**

In `mobile/src/screens/CardDetail.tsx`:

Add these two imports (`GlassCard`, `Btn`, `Text`, `View`, `MPageShell`, `SearchButton` are already imported — do NOT re-add them):

```ts
import { ApiError } from '../api/client';
import { CardSetupSheet } from '../app/CardSetupSheet';
```

Change the `useApiData` call to capture `error`, and add a `setupOpen` state alongside `payOpen` (BEFORE the `if (!summary)` guard so hook order is stable):

```ts
  const { data: summary, error } = useApiData<CardSummaryView | null>(
    () => api.cards.get(String(a.id)),
    null,
    [a.id],
  );

  const [payOpen, setPayOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
```

Replace `if (!summary) return null;` with a 404-aware branch:

```ts
  // A legacy credit account has no credit_card row yet → GET 404s. Offer a
  // one-time "set up" instead of rendering blank. Any other error (transient)
  // falls through to the existing null (the app's inline-retry pattern).
  if (!summary) {
    const notSetUp = error instanceof ApiError && error.status === 404;
    if (!notSetUp) return null;
    return (
      <>
        <MPageShell title={a.name} onBack={pop} right={<SearchButton />}>
          <GlassCard style={styles.cycleEmptyCard}>
            <Text style={[styles.noDuesTitle, { color: t.text1 }]}>Set up this card</Text>
            <Text style={[styles.noDuesSub, { color: t.text3, textAlign: 'center' }]}>
              Add your credit limit and statement day to track dues and spending.
            </Text>
            <Btn variant="em" onPress={() => setSetupOpen(true)} style={styles.payBillBtn}>
              Set up this card
            </Btn>
          </GlassCard>
        </MPageShell>
        <CardSetupSheet open={setupOpen} onClose={() => setSetupOpen(false)} accountId={String(a.id)} />
      </>
    );
  }
```

Leave the rest of the component (the loaded-summary render + `PayBillSheet`) unchanged.

- [ ] **Step 7: Verify**

Run: `cd mobile && npx jest src/lib/cardSetup.spec.ts` → PASS.
Run: `cd mobile && npx jest` → all green.
Run: `cd mobile && npx tsc --noEmit` → no NEW errors in `CardDetail.tsx` / `CardSetupSheet.tsx` / `cardSetup.ts` (ignore the pre-existing `notification-listener/index.test.ts` noise).

- [ ] **Step 8: Commit**

```bash
git add mobile/src/lib/cardSetup.ts mobile/src/lib/cardSetup.spec.ts mobile/src/app/CardSetupSheet.tsx mobile/src/screens/CardDetail.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(mobile): CardDetail set-up empty state for legacy cards + CardSetupSheet"
```

---

## Task 8: Document the isEncrypted compressed-xref limitation

**Files:**
- Modify: `mobile/src/screens/statementPdf.ts` (comment on `isEncrypted`)

No behavior change and no test — the current behavior is a documented graceful degrade (a PDF hiding `/Encrypt` in a compressed object stream is misdetected as unencrypted, uploads raw, and Claude returns no line-items → the review screen shows "no charges found"). Proper detection needs a full xref-stream/object-stream parser, which is out of scope.

- [ ] **Step 1: Add the limitation note**

Above the `isEncrypted` function/doc-block in `statementPdf.ts`, add:

```ts
// KNOWN LIMITATION: this trailer byte-scan does not catch a PDF that hides its
// /Encrypt reference inside a compressed cross-reference / object stream. Such a
// file is misdetected as unencrypted and uploaded raw; Claude cannot read the
// encrypted bytes and returns no line-items, so the review screen shows "no
// charges found" (a graceful degrade — no crash). Catching this needs a full
// xref-stream parser and is intentionally out of scope.
```

- [ ] **Step 2: Verify tsc**

Run: `cd mobile && npx tsc --noEmit` → no NEW errors (comment-only; ignore pre-existing noise).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/statementPdf.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "docs(mobile): note isEncrypted compressed-xref limitation"
```

---

## Final verification (after all tasks)

- [ ] `cd backend && npx jest` → all green (was 218; new tests added).
- [ ] `cd backend && npx tsc --noEmit` → clean except the known pre-existing `auth.service.spec.ts` error.
- [ ] `cd mobile && npx jest` → all green (was 67; new specs added).
- [ ] `cd mobile && npx tsc --noEmit` → clean except the known pre-existing `mobile/modules/notification-listener/index.test.ts` errors.
- [ ] `git log --oneline` shows the batch's commits (Tasks 1–8), no unrelated files swept in.
- [ ] On-device (user-driven, not gated here): CardDetail set-up flow for a legacy card; Sync "possible duplicate" hint + Add-all exclusion; SMS card spend now filed under Cards with the correct account.
