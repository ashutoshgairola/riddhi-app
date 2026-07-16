# Vendor Mappings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set-once per-user vendor rules ("True Software Scandinavia AB" → "Truecaller" + category) that auto-confirm future synced detections, sweep the pending queue on creation, and are manageable from a Vendor rules screen.

**Architecture:** A `vendor_mapping` entity in the existing backend `notification-sync` module, keyed on `normalizeDescriptor(merchant)` (reused from `subscriptions/detect-subscriptions.ts` — a pure function, safe to import). Rules are created via a `remember` flag on the confirm endpoint, applied inside `runAnalysisForUser` (auto-confirm when the account resolved, pre-fill otherwise), and exposed via GET/PATCH/DELETE endpoints. Mobile adds a "Vendor rule" select to the review edit form and a Vendor rules list screen. Subscriptions need no changes: auto-confirmed transactions carry the mapped description, which the existing subscription listener/detector already consumes.

**Tech Stack:** NestJS + TypeORM (Postgres, `synchronize: true` in app — no migration needed), Jest; React Native (Expo) mobile with existing FormSheet/ListCard/MPageShell components.

**Spec:** `docs/superpowers/specs/2026-07-16-vendor-mappings-design.md`

## Global Constraints

- Git commits: NO `Co-Authored-By` trailer; author is `Ashutosh <gairola.ashutosh26@gmail.com>` (pass `--author` if the local config differs).
- Mobile spacing: only the named 8pt tokens from `mobile/src/theme/spacing.ts` (`spacing.xxs/xs/sm/md/lg/xl`); never raw pixel margins or legacy `space[N]`.
- Backend tests run from `backend/`: `npm test -- --runTestsByPath src/notification-sync/<file>.spec.ts`. Mobile tests from `mobile/`: `npx jest src/lib/notificationSync.spec.ts`.
- The chatbot persona is "Munshi" — do not introduce copy calling the bot "Riddhi".
- Every task that adds a constructor dependency to `NotificationSyncService` must keep ALL existing notification-sync specs compiling (they build Nest testing modules with explicit provider lists).

---

### Task 1: VendorMapping entity, CRUD endpoints, module wiring

**Files:**
- Create: `backend/src/notification-sync/vendor-mapping.entity.ts`
- Create: `backend/src/notification-sync/dto/update-vendor-mapping.dto.ts`
- Create: `backend/src/notification-sync/vendor-mappings.spec.ts`
- Modify: `backend/src/notification-sync/notification-sync.service.ts` (constructor + 3 methods)
- Modify: `backend/src/notification-sync/notification-sync.controller.ts` (3 routes)
- Modify: `backend/src/notification-sync/notification-sync.module.ts` (register entities)
- Modify: `backend/src/notification-sync/confirm.spec.ts`, `backend/src/notification-sync/analysis-run.spec.ts`, `backend/src/notification-sync/notification-sync.service.spec.ts` (add the two new repo tokens to every testing module that provides `NotificationSyncService`)

**Interfaces:**
- Consumes: `normalizeDescriptor(desc: string): string` from `../subscriptions/detect-subscriptions` (already exported, pure).
- Produces (later tasks rely on these exact names):
  - `VendorMapping` entity: `{ id: string; userId: string; matchKey: string; displayName: string; categoryId: string }`.
  - `NotificationSyncService.listMappings(userId: string): Promise<VendorMapping[]>`
  - `NotificationSyncService.updateMapping(userId: string, id: string, dto: UpdateVendorMappingDto): Promise<VendorMapping>`
  - `NotificationSyncService.deleteMapping(userId: string, id: string): Promise<{ ok: true }>`
  - Service constructor gains `mappings: Repository<VendorMapping>` and `categories: Repository<TransactionCategory>` (in this order, after the existing `cards` repo param).
  - Routes: `GET /notification-sync/vendor-mappings`, `PATCH /notification-sync/vendor-mappings/:id`, `DELETE /notification-sync/vendor-mappings/:id`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/notification-sync/vendor-mappings.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { NotificationSyncService } from './notification-sync.service';
import { NotificationAnalysisService } from './notification-analysis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { VendorMapping } from './vendor-mapping.entity';
import { TransactionCategory } from '../categories/category.entity';
import { Account } from '../accounts/account.entity';
import { CreditCard } from '../credit-card/credit-card.entity';

function build(mappingsRepo: any) {
  return Test.createTestingModule({
    providers: [
      NotificationSyncService,
      { provide: getRepositoryToken(CapturedNotification), useValue: {} },
      { provide: getRepositoryToken(DetectedTransaction), useValue: {} },
      { provide: getRepositoryToken(Account), useValue: {} },
      { provide: getRepositoryToken(CreditCard), useValue: {} },
      { provide: getRepositoryToken(VendorMapping), useValue: mappingsRepo },
      { provide: getRepositoryToken(TransactionCategory), useValue: {} },
      { provide: NotificationAnalysisService, useValue: {} },
      { provide: NotificationsService, useValue: {} },
      { provide: TransactionsService, useValue: {} },
    ],
  }).compile();
}

describe('vendor mapping CRUD', () => {
  it('listMappings scopes by user and sorts by displayName', async () => {
    const find = jest.fn(async () => [{ id: 'm1' }]);
    const svc = (await build({ find })).get(NotificationSyncService);
    const res = await svc.listMappings('u1');
    expect(res).toEqual([{ id: 'm1' }]);
    expect(find).toHaveBeenCalledWith({ where: { userId: 'u1' }, order: { displayName: 'ASC' } });
  });

  it('updateMapping patches displayName/categoryId on an owned row', async () => {
    const row: any = { id: 'm1', userId: 'u1', displayName: 'Old', categoryId: 'c1' };
    const repo = {
      findOne: jest.fn(async () => row),
      save: jest.fn(async (x: any) => x),
    };
    const svc = (await build(repo)).get(NotificationSyncService);
    const res = await svc.updateMapping('u1', 'm1', { displayName: 'Truecaller', categoryId: 'c2' });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'm1', userId: 'u1' } });
    expect(res).toMatchObject({ displayName: 'Truecaller', categoryId: 'c2' });
  });

  it('updateMapping on a foreign/missing row throws NotFound', async () => {
    const repo = { findOne: jest.fn(async () => null), save: jest.fn() };
    const svc = (await build(repo)).get(NotificationSyncService);
    await expect(svc.updateMapping('u1', 'nope', { displayName: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('deleteMapping deletes an owned row and 404s otherwise', async () => {
    const repo = { delete: jest.fn(async () => ({ affected: 1 })) };
    const svc = (await build(repo)).get(NotificationSyncService);
    await expect(svc.deleteMapping('u1', 'm1')).resolves.toEqual({ ok: true });
    expect(repo.delete).toHaveBeenCalledWith({ id: 'm1', userId: 'u1' });

    const repoMiss = { delete: jest.fn(async () => ({ affected: 0 })) };
    const svcMiss = (await build(repoMiss)).get(NotificationSyncService);
    await expect(svcMiss.deleteMapping('u1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `npm test -- --runTestsByPath src/notification-sync/vendor-mappings.spec.ts`
Expected: FAIL — cannot find module `./vendor-mapping.entity` / methods not defined.

- [ ] **Step 3: Implement**

Create `backend/src/notification-sync/vendor-mapping.entity.ts`:

```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';
import { TransactionCategory } from '../categories/category.entity';

/** A set-once per-user vendor rule: any detection whose normalized merchant
 * equals `matchKey` is renamed to `displayName`, categorized as `categoryId`,
 * and auto-confirmed when its payment source resolved. */
@Entity('vendor_mapping')
@Unique(['userId', 'matchKey'])
export class VendorMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** `normalizeDescriptor(detected merchant)` — see detect-subscriptions.ts. */
  @Column({ type: 'varchar', length: 255 })
  matchKey: string;

  @Column({ type: 'varchar', length: 255 })
  displayName: string;

  // A rule without its category is meaningless — CASCADE drops the rule and
  // the vendor simply falls back to normal review.
  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => TransactionCategory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category: TransactionCategory;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
```

Create `backend/src/notification-sync/dto/update-vendor-mapping.dto.ts`:

```ts
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateVendorMappingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  displayName?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
```

In `backend/src/notification-sync/notification-sync.service.ts`:

Add imports:

```ts
import { VendorMapping } from './vendor-mapping.entity';
import { TransactionCategory } from '../categories/category.entity';
import { UpdateVendorMappingDto } from './dto/update-vendor-mapping.dto';
```

Add to the constructor, directly after the `cards` repository parameter:

```ts
    @InjectRepository(VendorMapping)
    private readonly mappings: Repository<VendorMapping>,
    @InjectRepository(TransactionCategory)
    private readonly categories: Repository<TransactionCategory>,
```

Add three methods at the end of the class (after `dismiss`):

```ts
  // ── Vendor mappings ─────────────────────────────────────────────────────

  listMappings(userId: string): Promise<VendorMapping[]> {
    return this.mappings.find({ where: { userId }, order: { displayName: 'ASC' } });
  }

  async updateMapping(
    userId: string,
    id: string,
    dto: UpdateVendorMappingDto,
  ): Promise<VendorMapping> {
    const m = await this.mappings.findOne({ where: { id, userId } });
    if (!m) throw new NotFoundException('Vendor mapping not found');
    if (dto.displayName !== undefined) m.displayName = dto.displayName;
    if (dto.categoryId !== undefined) m.categoryId = dto.categoryId;
    return this.mappings.save(m);
  }

  async deleteMapping(userId: string, id: string): Promise<{ ok: true }> {
    const res = await this.mappings.delete({ id, userId });
    if (!res.affected) throw new NotFoundException('Vendor mapping not found');
    return { ok: true };
  }
```

In `backend/src/notification-sync/notification-sync.controller.ts`: add `Patch` and `Delete` to the `@nestjs/common` import, import `UpdateVendorMappingDto`, and add these routes **before** the `@Post(':id/confirm')` route (path-literal routes must not be shadowed by param routes):

```ts
  @Get('vendor-mappings')
  listVendorMappings(@CurrentUser() user: { userId: string }) {
    return this.service.listMappings(user.userId);
  }

  @Patch('vendor-mappings/:id')
  updateVendorMapping(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateVendorMappingDto,
  ) {
    return this.service.updateMapping(user.userId, id, dto);
  }

  @Delete('vendor-mappings/:id')
  deleteVendorMapping(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.service.deleteMapping(user.userId, id);
  }
```

In `backend/src/notification-sync/notification-sync.module.ts`: import `VendorMapping` and `TransactionCategory` and append both to the `TypeOrmModule.forFeature([...])` array.

In each of `confirm.spec.ts`, `analysis-run.spec.ts`, and `notification-sync.service.spec.ts`: add imports

```ts
import { VendorMapping } from './vendor-mapping.entity';
import { TransactionCategory } from '../categories/category.entity';
```

and add these two providers to EVERY `Test.createTestingModule({ providers: [...] })` block that lists `NotificationSyncService`:

```ts
      { provide: getRepositoryToken(VendorMapping), useValue: {} },
      { provide: getRepositoryToken(TransactionCategory), useValue: {} },
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `backend/`): `npm test -- --runTestsByPath src/notification-sync/vendor-mappings.spec.ts` — Expected: PASS.
Then the whole module: `npm test -- src/notification-sync` — Expected: all PASS (harnesses updated).

- [ ] **Step 5: Commit**

```bash
git add backend/src/notification-sync
git commit -m "feat(sync): vendor_mapping entity + CRUD endpoints"
```

---

### Task 2: `remember` on confirm + pending-queue sweep

**Files:**
- Modify: `backend/src/notification-sync/dto/confirm.dto.ts`
- Modify: `backend/src/notification-sync/notification-sync.service.ts`
- Create: `backend/src/notification-sync/vendor-remember.spec.ts`

**Interfaces:**
- Consumes: Task 1's `mappings` repository, `normalizeDescriptor` from `../subscriptions/detect-subscriptions`.
- Produces (Task 3 reuses this exact private helper):
  - `private async autoConfirm(det: DetectedTransaction, mapping: VendorMapping): Promise<void>` — creates the transaction from a detection using the mapping's displayName/categoryId, marks the detection CONFIRMED with its transactionId.
  - `ConfirmDetectedDto.remember?: boolean`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/notification-sync/vendor-remember.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationSyncService } from './notification-sync.service';
import { NotificationAnalysisService } from './notification-analysis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { VendorMapping } from './vendor-mapping.entity';
import { TransactionCategory } from '../categories/category.entity';
import { Account } from '../accounts/account.entity';
import { CreditCard } from '../credit-card/credit-card.entity';
import { DetectedStatus, TransactionType, PaymentMethod } from '../common/enums';

const MAPPING = {
  id: 'm1',
  userId: 'u1',
  matchKey: 'true software scandinavia ab',
  displayName: 'Truecaller',
  categoryId: 'catSub',
};

function build(opts: { detRepo: any; mapRepo: any; txCreate?: any; capRepo?: any }) {
  return Test.createTestingModule({
    providers: [
      NotificationSyncService,
      { provide: getRepositoryToken(CapturedNotification), useValue: opts.capRepo ?? { find: jest.fn(async () => []) } },
      { provide: getRepositoryToken(DetectedTransaction), useValue: opts.detRepo },
      { provide: getRepositoryToken(Account), useValue: {} },
      { provide: getRepositoryToken(CreditCard), useValue: {} },
      { provide: getRepositoryToken(VendorMapping), useValue: opts.mapRepo },
      { provide: getRepositoryToken(TransactionCategory), useValue: {} },
      { provide: NotificationAnalysisService, useValue: {} },
      { provide: NotificationsService, useValue: {} },
      {
        provide: TransactionsService,
        useValue: { create: opts.txCreate ?? jest.fn(async () => ({ id: 'tx1' })) },
      },
    ],
  }).compile();
}

const CONFIRM_DTO = {
  date: '2026-07-16',
  description: 'Truecaller',
  amount: 249,
  type: TransactionType.EXPENSE,
  categoryId: 'catSub',
  accountId: 'a1',
  paymentMethod: PaymentMethod.AUTOPAY,
  notes: 'n',
  remember: true,
} as any;

describe('confirm with remember', () => {
  it('upserts a mapping keyed on the normalized detected merchant', async () => {
    const det: any = {
      id: 'd1',
      userId: 'u1',
      status: DetectedStatus.PENDING,
      merchant: 'True Software Scandinavia AB',
      sourceKeys: [],
    };
    const detRepo = {
      findOne: jest.fn(async () => det),
      save: jest.fn(async (x: any) => x),
      find: jest.fn(async () => []), // sweep finds nothing else pending
    };
    const mapRepo = {
      upsert: jest.fn(async () => ({})),
      findOne: jest.fn(async () => MAPPING),
    };
    const svc = (await build({ detRepo, mapRepo })).get(NotificationSyncService);

    await svc.confirm('u1', 'd1', CONFIRM_DTO);

    expect(mapRepo.upsert).toHaveBeenCalledWith(
      {
        userId: 'u1',
        matchKey: 'true software scandinavia ab',
        displayName: 'Truecaller',
        categoryId: 'catSub',
      },
      ['userId', 'matchKey'],
    );
  });

  it('sweeps same-key pending detections with a resolved account, skips the rest', async () => {
    const det: any = {
      id: 'd1',
      userId: 'u1',
      status: DetectedStatus.PENDING,
      merchant: 'True Software Scandinavia AB',
      sourceKeys: [],
    };
    const sweepable: any = {
      id: 'd2',
      userId: 'u1',
      status: DetectedStatus.PENDING,
      merchant: 'TRUE SOFTWARE SCANDINAVIA AB',
      amount: 249,
      type: TransactionType.EXPENSE,
      accountId: 'a1',
      paymentMethod: PaymentMethod.AUTOPAY,
      postedAt: new Date('2026-07-01T10:00:00Z'),
      sourceKeys: [],
    };
    const noAccount: any = { ...sweepable, id: 'd3', accountId: null };
    const otherVendor: any = { ...sweepable, id: 'd4', merchant: 'Netflix' };
    const detRepo = {
      findOne: jest.fn(async () => det),
      save: jest.fn(async (x: any) => x),
      find: jest.fn(async () => [sweepable, noAccount, otherVendor]),
    };
    const mapRepo = { upsert: jest.fn(async () => ({})), findOne: jest.fn(async () => MAPPING) };
    const txCreate = jest.fn(async () => ({ id: 'tx-new' }));
    const svc = (await build({ detRepo, mapRepo, txCreate })).get(NotificationSyncService);

    await svc.confirm('u1', 'd1', CONFIRM_DTO);

    // 1 call for d1 itself + 1 for the swept d2 (d3 lacks an account, d4 is another vendor).
    expect(txCreate).toHaveBeenCalledTimes(2);
    expect(txCreate).toHaveBeenLastCalledWith(
      'u1',
      expect.objectContaining({
        description: 'Truecaller',
        categoryId: 'catSub',
        amount: 249,
        accountId: 'a1',
        date: '2026-07-01',
      }),
    );
    expect(sweepable.status).toBe(DetectedStatus.CONFIRMED);
    expect(sweepable.transactionId).toBe('tx-new');
    expect(noAccount.status).toBe(DetectedStatus.PENDING);
    expect(otherVendor.status).toBe(DetectedStatus.PENDING);
  });

  it('remember with a null detected merchant is a no-op', async () => {
    const det: any = { id: 'd1', userId: 'u1', status: DetectedStatus.PENDING, merchant: null, sourceKeys: [] };
    const detRepo = { findOne: jest.fn(async () => det), save: jest.fn(async (x: any) => x) };
    const mapRepo = { upsert: jest.fn(), findOne: jest.fn() };
    const svc = (await build({ detRepo, mapRepo })).get(NotificationSyncService);
    await svc.confirm('u1', 'd1', CONFIRM_DTO);
    expect(mapRepo.upsert).not.toHaveBeenCalled();
  });

  it('confirm without remember never touches mappings', async () => {
    const det: any = { id: 'd1', userId: 'u1', status: DetectedStatus.PENDING, merchant: 'X', sourceKeys: [] };
    const detRepo = { findOne: jest.fn(async () => det), save: jest.fn(async (x: any) => x) };
    const mapRepo = { upsert: jest.fn(), findOne: jest.fn() };
    const svc = (await build({ detRepo, mapRepo })).get(NotificationSyncService);
    await svc.confirm('u1', 'd1', { ...CONFIRM_DTO, remember: undefined });
    expect(mapRepo.upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `npm test -- --runTestsByPath src/notification-sync/vendor-remember.spec.ts`
Expected: FAIL — `mapRepo.upsert` never called (remember not implemented).

- [ ] **Step 3: Implement**

In `backend/src/notification-sync/dto/confirm.dto.ts`: add `IsBoolean` to the class-validator import and append to the class:

```ts
  /** When true, upsert a vendor mapping from this confirmation and sweep the
   * pending queue for same-vendor detections. */
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
```

In `backend/src/notification-sync/notification-sync.service.ts`:

Add import:

```ts
import { normalizeDescriptor } from '../subscriptions/detect-subscriptions';
```

At the end of `confirm()`, replace the final `return { transactionId: tx.id };` with:

```ts
    if (dto.remember) await this.rememberVendor(det, dto);
    return { transactionId: tx.id };
```

Add the private helpers (below `confirm`, above `dismiss`):

```ts
  /** Upserts the vendor rule this confirmation defines, then auto-confirms
   * every other pending same-vendor detection whose account resolved. */
  private async rememberVendor(
    det: DetectedTransaction,
    dto: ConfirmDetectedDto,
  ): Promise<void> {
    const matchKey = normalizeDescriptor(det.merchant ?? '');
    if (!matchKey) return;
    await this.mappings.upsert(
      {
        userId: det.userId,
        matchKey,
        displayName: dto.description,
        categoryId: dto.categoryId,
      },
      ['userId', 'matchKey'],
    );
    const mapping = await this.mappings.findOne({
      where: { userId: det.userId, matchKey },
    });
    if (!mapping) return;
    const pending = await this.detected.find({
      where: { userId: det.userId, status: DetectedStatus.PENDING },
    });
    for (const p of pending) {
      if (p.id === det.id || !p.merchant || !p.accountId || p.amount == null) continue;
      if (normalizeDescriptor(p.merchant) !== mapping.matchKey) continue;
      await this.autoConfirm(p, mapping);
    }
  }

  /** Creates the real transaction a mapped detection describes and marks the
   * detection CONFIRMED. Caller guarantees accountId and amount are set. */
  private async autoConfirm(
    det: DetectedTransaction,
    mapping: VendorMapping,
  ): Promise<void> {
    const caps = det.sourceKeys.length
      ? await this.captures.find({
          where: { userId: det.userId, dedupKey: In(det.sourceKeys) },
        })
      : [];
    const notes = caps.map((c) => c.text).join('\n') || undefined;
    const tx = await this.transactions.create(det.userId, {
      date: (det.postedAt ?? new Date()).toISOString().slice(0, 10),
      description: mapping.displayName,
      amount: det.amount!,
      type: det.type,
      categoryId: mapping.categoryId,
      accountId: det.accountId!,
      paymentMethod: det.paymentMethod,
      notes,
    });
    det.merchant = mapping.displayName;
    det.status = DetectedStatus.CONFIRMED;
    det.transactionId = tx.id;
    await this.detected.save(det);
  }
```

Note: `transactions.create` takes a `CreateTransactionDto`; the object above matches how the existing `confirm()` calls it. If TypeScript complains about missing optional dto fields, cast the literal `as CreateTransactionDto` (import the type from `../transactions/dto/create-transaction.dto`), mirroring whatever `confirm()` does today.

- [ ] **Step 4: Run tests to verify they pass**

Run (from `backend/`): `npm test -- src/notification-sync` — Expected: all PASS (new spec + no regressions in confirm.spec).

- [ ] **Step 5: Commit**

```bash
git add backend/src/notification-sync
git commit -m "feat(sync): remember-vendor on confirm + pending-queue sweep"
```

---

### Task 3: Auto-apply mappings in the analysis pass

**Files:**
- Modify: `backend/src/notification-sync/notification-sync.service.ts` (`runAnalysisForUser`)
- Create: `backend/src/notification-sync/vendor-auto-apply.spec.ts`

**Interfaces:**
- Consumes: Task 2's `private autoConfirm(det, mapping)`, Task 1's `mappings`/`categories` repositories.
- Produces: `runAnalysisForUser` return type becomes `{ detected: number; autoAdded: number }` — `detected` counts detections left PENDING (drives the review push notification), `autoAdded` counts mapped detections confirmed straight through. The `/analyze` endpoint and mobile `analyzeNow()` tolerate the extra field with no change.

- [ ] **Step 1: Write the failing test**

Create `backend/src/notification-sync/vendor-auto-apply.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationSyncService } from './notification-sync.service';
import { NotificationAnalysisService } from './notification-analysis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { VendorMapping } from './vendor-mapping.entity';
import { TransactionCategory } from '../categories/category.entity';
import { Account } from '../accounts/account.entity';
import { CreditCard } from '../credit-card/credit-card.entity';
import { AccountType, DetectedStatus } from '../common/enums';

const MAPPING = {
  id: 'm1',
  userId: 'u1',
  matchKey: 'google play',
  displayName: 'Truecaller',
  categoryId: 'catSub',
};

const GROUP = {
  merchant: 'Google Play',
  amount: 249,
  type: 'expense',
  category: 'Entertainment',
  institution: 'HDFC',
  rail: 'autopay',
  last4: null,
  confidence: 0.9,
  sourceKeys: ['k1'],
};

function harness(opts: { accounts: any[]; mappings: any[]; groups: any[] }) {
  const savedDetections: any[] = [];
  const capRepo = {
    find: jest.fn(async () => [
      {
        id: 'c1',
        dedupKey: 'k1',
        packageName: 'sms',
        title: 'HDFCBK',
        text: 'UPI Mandate Rs.249.00 to Google Play',
        postedAt: new Date('2026-07-16T13:31:00Z'),
        analyzed: false,
      },
    ]),
    update: jest.fn(async () => undefined),
  };
  const detRepo = {
    create: (x: any) => x,
    save: jest.fn(async (x: any) => {
      savedDetections.push(x);
      return x;
    }),
  };
  const txCreate = jest.fn(async () => ({ id: 'tx1' }));
  const notifications = { create: jest.fn(async () => ({})) };
  const providers = [
    NotificationSyncService,
    { provide: getRepositoryToken(CapturedNotification), useValue: capRepo },
    { provide: getRepositoryToken(DetectedTransaction), useValue: detRepo },
    { provide: getRepositoryToken(Account), useValue: { find: jest.fn(async () => opts.accounts) } },
    { provide: getRepositoryToken(CreditCard), useValue: { find: jest.fn(async () => []) } },
    { provide: getRepositoryToken(VendorMapping), useValue: { find: jest.fn(async () => opts.mappings) } },
    {
      provide: getRepositoryToken(TransactionCategory),
      useValue: { find: jest.fn(async () => [{ id: 'catSub', name: 'Subscriptions' }]) },
    },
    { provide: NotificationAnalysisService, useValue: { analyze: jest.fn(async () => opts.groups) } },
    { provide: NotificationsService, useValue: notifications },
    {
      provide: TransactionsService,
      useValue: { create: txCreate, findForAccountInRange: jest.fn(async () => []) },
    },
  ];
  return { providers, savedDetections, txCreate, notifications };
}

const HDFC = { id: 'a1', institutionName: 'HDFC Bank', type: AccountType.SAVINGS };

describe('vendor mapping auto-apply in runAnalysisForUser', () => {
  it('auto-confirms a mapped detection when the account resolved', async () => {
    const h = harness({ accounts: [HDFC], mappings: [MAPPING], groups: [GROUP] });
    const svc = (await Test.createTestingModule({ providers: h.providers }).compile()).get(
      NotificationSyncService,
    );

    const res = await svc.runAnalysisForUser('u1');

    expect(res).toEqual({ detected: 0, autoAdded: 1 });
    expect(h.txCreate).toHaveBeenCalledTimes(1);
    expect(h.txCreate).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ description: 'Truecaller', categoryId: 'catSub', amount: 249 }),
    );
    const finalSave = h.savedDetections[h.savedDetections.length - 1];
    expect(finalSave).toMatchObject({
      status: DetectedStatus.CONFIRMED,
      transactionId: 'tx1',
      merchant: 'Truecaller',
    });
    // Nothing left to review → no push.
    expect(h.notifications.create).not.toHaveBeenCalled();
  });

  it('pre-fills but keeps PENDING when the account did not resolve', async () => {
    const h = harness({ accounts: [], mappings: [MAPPING], groups: [GROUP] });
    const svc = (await Test.createTestingModule({ providers: h.providers }).compile()).get(
      NotificationSyncService,
    );

    const res = await svc.runAnalysisForUser('u1');

    expect(res).toEqual({ detected: 1, autoAdded: 0 });
    expect(h.txCreate).not.toHaveBeenCalled();
    expect(h.savedDetections[0]).toMatchObject({
      status: DetectedStatus.PENDING,
      merchant: 'Truecaller',
      suggestedCategory: 'Subscriptions',
    });
    // Still needs review → push fires (non-interactive).
    expect(h.notifications.create).toHaveBeenCalledTimes(1);
  });

  it('unmapped detections behave exactly as before', async () => {
    const h = harness({ accounts: [HDFC], mappings: [], groups: [GROUP] });
    const svc = (await Test.createTestingModule({ providers: h.providers }).compile()).get(
      NotificationSyncService,
    );

    const res = await svc.runAnalysisForUser('u1');

    expect(res).toEqual({ detected: 1, autoAdded: 0 });
    expect(h.txCreate).not.toHaveBeenCalled();
    expect(h.savedDetections[0]).toMatchObject({
      status: DetectedStatus.PENDING,
      merchant: 'Google Play',
      suggestedCategory: 'Entertainment',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `npm test -- --runTestsByPath src/notification-sync/vendor-auto-apply.spec.ts`
Expected: FAIL — `autoAdded` undefined / txCreate not called.

- [ ] **Step 3: Implement**

In `runAnalysisForUser` (`notification-sync.service.ts`):

1. Change the signature/returns: `Promise<{ detected: number; autoAdded: number }>`; the two early returns become `return { detected: 0, autoAdded: 0 };`.

2. After the `augmentedAccounts` block, load the user's rules once:

```ts
      const rules = await this.mappings.find({ where: { userId } });
      const ruleByKey = new Map(rules.map((m) => [m.matchKey, m]));
      // Rules rename the suggested category too — resolve mapped category
      // names in one query up front.
      const categoryNameById = new Map<string, string>();
      if (rules.length > 0) {
        const cats = await this.categories.find({
          where: { id: In(rules.map((m) => m.categoryId)) },
        });
        for (const c of cats) categoryNameById.set(c.id, c.name);
      }
```

3. Add `let autoAdded = 0;` beside `let detected = 0;`.

4. In the group loop, after the reverse-dedup `if (isLikelyDuplicateOfExisting...) continue;` block, replace the existing `await this.detected.save(...)` + `detected += 1;` with:

```ts
        const rule = g.merchant
          ? ruleByKey.get(normalizeDescriptor(g.merchant))
          : undefined;

        const det = await this.detected.save(
          this.detected.create({
            userId,
            merchant: rule ? rule.displayName : g.merchant,
            amount: g.amount,
            type:
              g.type === 'income'
                ? TransactionType.INCOME
                : TransactionType.EXPENSE,
            suggestedCategory: rule
              ? (categoryNameById.get(rule.categoryId) ?? g.category)
              : g.category,
            accountId,
            paymentMethod,
            confidence: g.confidence,
            status: DetectedStatus.PENDING,
            sourceKeys: g.sourceKeys,
            transactionId: null,
            postedAt,
          }),
        );
        // A matched rule with a resolved payment source skips review entirely.
        if (rule && accountId && g.amount != null) {
          await this.autoConfirm(det, rule);
          autoAdded += 1;
        } else {
          detected += 1;
        }
```

5. The push-notification condition stays `if (detected > 0 && !opts.interactive)` (auto-added rows must not trigger a review nudge). The final return becomes `return { detected, autoAdded };`.

- [ ] **Step 4: Run tests to verify they pass**

Run (from `backend/`): `npm test -- src/notification-sync` — Expected: all PASS, including the untouched `analysis-run.spec.ts` (its expectations on `res.detected` still hold; if any assertion does `expect(res).toEqual({ detected: N })`, update it to `expect(res.detected).toBe(N)`).

Also run the subscriptions module to prove `normalizeDescriptor` reuse broke nothing: `npm test -- src/subscriptions` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/notification-sync
git commit -m "feat(sync): auto-apply vendor mappings in analysis pass"
```

---

### Task 4: Mobile — "Vendor rule" choice in the review edit form

**Files:**
- Modify: `mobile/src/lib/notificationSync.ts` (`DetectedView`, `ConfirmPayload`, `applyDetectedEdit`)
- Modify: `mobile/src/lib/notificationSync.spec.ts`
- Modify: `mobile/src/screens/Sync.tsx` (`editDetectedItem` form field, `confirmDetectedItem` payload)

**Interfaces:**
- Consumes: backend `ConfirmDetectedDto.remember?: boolean` (Task 2).
- Produces: `DetectedView.remember?: boolean`; `ConfirmPayload.remember?: boolean`; edit-form key `remember` with string values `''` (once) / `'1'` (always).

- [ ] **Step 1: Write the failing test**

Append to `mobile/src/lib/notificationSync.spec.ts` (inside the existing `applyDetectedEdit` describe if one exists, else a new one — reuse the file's existing base-object helper if it has one):

```ts
describe('applyDetectedEdit remember flag', () => {
  const base = {
    id: 'd1',
    merchant: 'True Software Scandinavia AB',
    amount: 249,
    type: 'expense' as const,
    suggestedCategory: 'Entertainment',
    accountId: 'a1',
    paymentMethod: 'autopay',
    confidence: 0.9,
    postedAt: '2026-07-16T13:31:00.000Z',
  };
  const edit = {
    desc: 'Truecaller',
    amount: '249',
    cat: 'Subscriptions',
    account: 'a1',
    date: '2026-07-16',
    type: 'expense',
  };

  it("remember: '1' sets the flag", () => {
    expect(applyDetectedEdit(base, { ...edit, remember: '1' }).remember).toBe(true);
  });

  it('remember unset/empty leaves it false', () => {
    expect(applyDetectedEdit(base, { ...edit, remember: '' }).remember).toBe(false);
    expect(applyDetectedEdit(base, edit).remember).toBe(false);
  });
});
```

(Import `applyDetectedEdit` at the top if the spec doesn't already.)

- [ ] **Step 2: Run test to verify it fails**

Run (from `mobile/`): `npx jest src/lib/notificationSync.spec.ts`
Expected: FAIL — `remember` is `undefined` after edit with `'1'`.

- [ ] **Step 3: Implement**

In `mobile/src/lib/notificationSync.ts`:

- `DetectedView`: add `remember?: boolean;` after `postedAt`.
- `ConfirmPayload`: add `remember?: boolean;` after `notes`.
- `applyDetectedEdit`: add to the returned object:

```ts
    remember: v['remember'] === '1',
```

In `mobile/src/screens/Sync.tsx`:

- In `editDetectedItem`'s `fields` array, append after the `type` select:

```ts
        {
          kind: 'select',
          key: 'remember',
          label: 'Vendor rule',
          options: [
            { label: 'Just this once', value: '' },
            { label: 'Always map this vendor', value: '1' },
          ],
          initial: d.remember ? '1' : '',
        },
```

- In `confirmDetectedItem`'s `confirmDetected(d.id, {...})` payload, add:

```ts
          remember: d.remember,
```

- [ ] **Step 4: Run tests + typecheck to verify**

Run (from `mobile/`): `npx jest src/lib/notificationSync.spec.ts` — Expected: PASS.
Run (from `mobile/`): `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/notificationSync.ts mobile/src/lib/notificationSync.spec.ts mobile/src/screens/Sync.tsx
git commit -m "feat(mobile): remember-vendor choice in detection edit form"
```

---

### Task 5: Mobile — Vendor rules screen (view/edit/delete) + Sync entry point

**Files:**
- Modify: `mobile/src/lib/notificationSync.ts` (vendor-mapping API calls)
- Create: `mobile/src/screens/VendorRules.tsx`
- Modify: `mobile/src/app/navContext.tsx` (add `'vendor-rules'` to `ScreenKind`)
- Modify: `mobile/src/app/screens.tsx` (register the screen)
- Modify: `mobile/src/screens/Sync.tsx` (entry row)

**Interfaces:**
- Consumes: Task 1's endpoints; `MPageShell`, `ListCard`/`ListRow`, `useFeedback().form/toast`, `api.categories.list()`, `MI.trash`/`MI.arrow` — all existing.
- Produces: `fetchVendorMappings(): Promise<VendorMappingView[]>`, `updateVendorMapping(id, patch)`, `deleteVendorMapping(id)`; screen kind `'vendor-rules'`.

- [ ] **Step 1: Add the API surface**

Append to `mobile/src/lib/notificationSync.ts`:

```ts
// ── Vendor mappings (set-once merchant rules) ────────────────────────────

export interface VendorMappingView {
  id: string;
  matchKey: string;
  displayName: string;
  categoryId: string;
}

export async function fetchVendorMappings(): Promise<VendorMappingView[]> {
  return apiClient.get<VendorMappingView[]>('/notification-sync/vendor-mappings');
}

export async function updateVendorMapping(
  id: string,
  patch: { displayName?: string; categoryId?: string },
): Promise<void> {
  await apiClient.patch(`/notification-sync/vendor-mappings/${id}`, patch);
}

export async function deleteVendorMapping(id: string): Promise<void> {
  await apiClient.delete(`/notification-sync/vendor-mappings/${id}`);
}
```

- [ ] **Step 2: Create the screen**

Create `mobile/src/screens/VendorRules.tsx`:

```tsx
/**
 * VendorRules — list of the user's set-once vendor mappings (created via the
 * "Always map this vendor" choice on a detection's edit form). Row tap edits
 * the shown name/category; the trash icon deletes the rule. Rules apply to
 * future syncs only — existing transactions are never rewritten.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

import { api } from '../api';
import type { CategoryView } from '../api/types';
import { GlassCard } from '../components/Glass';
import { ListCard, ListRow } from '../components/ui';
import { AppIconBox } from '../components/contentIcons';
import { MI } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { spacing } from '../theme/spacing';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import {
  fetchVendorMappings,
  updateVendorMapping,
  deleteVendorMapping,
  type VendorMappingView,
} from '../lib/notificationSync';
import { MPageShell } from './_MPageShell';

export function VendorRules({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop } = useNav();
  const { form, toast } = useFeedback();
  const [rules, setRules] = useState<VendorMappingView[]>([]);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cats, list] = await Promise.all([api.categories.list(), fetchVendorMappings()]);
      setCategories(cats);
      setRules(list);
    } catch {
      toast("Couldn't load vendor rules", '📡');
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const catOf = (id: string) => categories.find((c) => String(c.id) === id);

  const editRule = (r: VendorMappingView) => {
    form({
      title: 'Edit vendor rule',
      fields: [
        { key: 'name', label: 'Shown as', initial: r.displayName },
        {
          kind: 'select',
          key: 'cat',
          label: 'Category',
          options: categories.map((c) => ({ label: `${c.icon} ${c.name}`, value: String(c.id) })),
          initial: r.categoryId,
        },
      ],
      submitLabel: 'Save rule',
      onSubmit: (v) => {
        void updateVendorMapping(r.id, { displayName: v['name']!, categoryId: v['cat']! })
          .then(load)
          .catch(() => toast("Couldn't update the rule", '📡'));
      },
    });
  };

  const removeRule = (r: VendorMappingView) => {
    setRules((cur) => cur.filter((x) => x.id !== r.id));
    void deleteVendorMapping(r.id)
      .then(() => toast('Rule deleted', '🗑'))
      .catch(() => {
        toast("Couldn't delete the rule", '📡');
        void load();
      });
  };

  return (
    <MPageShell title="Vendor rules" onBack={pop}>
      {loaded && rules.length === 0 ? (
        <GlassCard contentStyle={styles.emptyContent}>
          <Text style={[styles.emptyTitle, { color: t.text1, fontFamily: weight(700) }]}>
            No vendor rules yet
          </Text>
          <Text style={[styles.emptyBody, { color: t.text3 }]}>
            While reviewing a detected transaction, choose “Always map this vendor” in its edit
            form. Future payments to that vendor will then sync automatically.
          </Text>
        </GlassCard>
      ) : (
        <ListCard>
          {rules.map((r, i) => {
            const cat = catOf(r.categoryId);
            return (
              <ListRow key={r.id} last={i === rules.length - 1} onPress={() => editRule(r)}>
                <AppIconBox value={cat?.icon ?? '🏷️'} color={cat?.color ?? t.em} size={40} iconSize={18} />
                <View style={styles.rowText}>
                  <Text
                    style={[styles.rowTitle, { color: t.text1, fontFamily: weight(600) }]}
                    numberOfLines={1}
                  >
                    {r.displayName}
                  </Text>
                  <Text style={[styles.rowCaption, { color: t.text3 }]} numberOfLines={1}>
                    {cat?.name ?? 'Unknown'} · matches “{r.matchKey}”
                  </Text>
                </View>
                <Pressable onPress={() => removeRule(r)} hitSlop={8} style={styles.trashBtn}>
                  <MI.trash size={16} color={t.text3} />
                </Pressable>
              </ListRow>
            );
          })}
        </ListCard>
      )}

      <View style={styles.infoRow}>
        <View style={styles.infoIconWrap}>
          <MI.info size={15} color={t.text3} />
        </View>
        <Text style={[styles.infoText, { color: t.text3 }]}>
          Rules apply when new payments sync. Existing transactions and subscriptions aren't
          changed.
        </Text>
      </View>
    </MPageShell>
  );
}

const styles = StyleSheet.create({
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 14,
  },
  rowCaption: {
    fontSize: 11.5,
    marginTop: spacing.xxs,
  },
  trashBtn: {
    padding: spacing.xs,
    flexShrink: 0,
  },
  emptyContent: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 14.5,
  },
  emptyBody: {
    fontSize: 12.5,
    marginTop: spacing.xxs,
    lineHeight: 18.75,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xxs,
    marginTop: spacing.xl,
  },
  infoIconWrap: {
    marginTop: spacing.xxs,
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17.25,
  },
});
```

Adjust imports/props to match neighboring screens if a detail differs (e.g. `MPageShell` prop names) — follow `MonitoredApps.tsx` as the reference for a pushed settings-style list screen.

- [ ] **Step 3: Wire navigation + entry row**

- `mobile/src/app/navContext.tsx`: add `| 'vendor-rules'` to the `ScreenKind` union (after `'monitored-apps'`).
- `mobile/src/app/screens.tsx`: `import { VendorRules } from '../screens/VendorRules';` and add `'vendor-rules': VendorRules,` to the registry.
- `mobile/src/screens/Sync.tsx`: directly below the "Monitored apps" `SpringIn` block (outside its `notifSupported && listenerEnabled` conditional — rules also matter for SMS-only devices), add:

```tsx
      <SpringIn style={styles.block}>
        <ListCard>
          <ListRow last onPress={() => push({ kind: 'vendor-rules' })}>
            <AppIconBox value="🏷️" color={t.em} />
            <View style={styles.statusText}>
              <Text style={[styles.statusTitle, { color: t.text1, fontFamily: weight(700) }]}>
                Vendor rules
              </Text>
              <Text style={[styles.statusSubtitle, { color: t.text3 }]}>
                Vendors you've mapped are added automatically without review
              </Text>
            </View>
            <MI.arrow size={18} color={t.text3} />
          </ListRow>
        </ListCard>
      </SpringIn>
```

- [ ] **Step 4: Verify**

Run (from `mobile/`): `npx tsc --noEmit` — Expected: no errors.
Run (from `mobile/`): `npx jest src/lib` — Expected: PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/notificationSync.ts mobile/src/screens/VendorRules.tsx mobile/src/app/navContext.tsx mobile/src/app/screens.tsx mobile/src/screens/Sync.tsx
git commit -m "feat(mobile): vendor rules screen + sync entry point"
```
