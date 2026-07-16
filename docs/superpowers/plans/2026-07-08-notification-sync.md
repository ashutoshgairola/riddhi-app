# Notification-sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture notifications from a curated set of finance/merchant Android apps, analyse them in bulk with Claude a few times a day, correlate related notifications into single transactions, and surface them on the existing Sync screen for the user to confirm.

**Architecture:** A new Android `NotificationListenerService` (local Expo module) captures allowlisted notifications to an on-device SQLite log. A JS worker uploads un-sent captures to a new NestJS `notification-sync` module, which stores them, and on a schedule sends the un-analysed batch to Claude in one call that returns *grouped* transactions (e.g. Rapido₹159 + HDFC₹159 → one). Each group becomes a `pending` DetectedTransaction; the user confirms it on the Sync screen, which creates a real `Transaction` carrying `accountId` + `paymentMethod`.

**Tech Stack:** NestJS + TypeORM (Postgres), `@anthropic-ai/sdk`, `@nestjs/schedule`; Expo/React Native, Kotlin `NotificationListenerService`, Android SQLite, `expo-sqlite` not required (native store).

## Global Constraints

- **Model:** `claude-sonnet-5` app-wide via the shared `AI_MODEL` env. **No `claude-opus-4-8` may remain anywhere** in the codebase.
- **Android only.** The native module registers on Android only and degrades to no-op elsewhere (mirror `mobile/modules/sms-reader`).
- **Distribution is a sideloaded APK**, so the notification-access special permission is acceptable.
- **Nothing auto-writes to the ledger.** Every detection is `pending` until the user confirms.
- **Consistency principle:** confirmed detections create transactions carrying `accountId` + `paymentMethod`, exactly like Slice A demands, so SourceTag / Bank-vs-Cards filter / budgets / reports / Munshi treat them normally.
- **Payment source:** resolve `accountId` by `institutionName` + rail only (never `last4`); ambiguous/no-match → `accountId` null and the user picks in review.
- **Commit style:** author email `gairola.ashutosh26@gmail.com`, **no `Co-Authored-By` trailer**. `docs/` specs/plans are force-added (`git add -f`).
- Entities auto-register via the `**/*.entity.ts` glob in `backend/src/database/data-source.ts` — no data-source edit needed; a module just needs `TypeOrmModule.forFeature([...])`.

---

## Task 1: Switch the whole app off `claude-opus-4-8`

**Files:**
- Modify: `backend/src/receipts/receipts.service.ts:32`
- Modify: `backend/src/ai-chat/ai-chat.service.ts:90`
- Modify: `backend/src/notifications/notifications.scheduler.ts:44`
- Test: none (config-string change; verified by grep)

**Interfaces:**
- Consumes: nothing.
- Produces: the shared default model is now `claude-sonnet-5` everywhere.

- [ ] **Step 1: Find every occurrence**

Run: `grep -rn "claude-opus-4-8" backend/src`
Expected: three hits (the three files above). If more appear, include them in Step 2.

- [ ] **Step 2: Replace each default**

In each of the three files, change the fallback string:

```ts
// before
return this.config.get<string>('AI_MODEL') ?? 'claude-opus-4-8';
// after
return this.config.get<string>('AI_MODEL') ?? 'claude-sonnet-5';
```

- [ ] **Step 3: Verify none remain**

Run: `grep -rn "claude-opus-4-8" backend/src`
Expected: no matches (exit code 1, no output).

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "chore(backend): default AI_MODEL to claude-sonnet-5 app-wide"
```

---

## Task 2: `notification-sync` module scaffold + two entities

**Files:**
- Create: `backend/src/notification-sync/captured-notification.entity.ts`
- Create: `backend/src/notification-sync/detected-transaction.entity.ts`
- Create: `backend/src/notification-sync/notification-sync.module.ts`
- Modify: `backend/src/common/enums.ts` (add `DetectedStatus`)
- Modify: `backend/src/app.module.ts` (register `NotificationSyncModule`)
- Test: `backend/src/notification-sync/captured-notification.entity.spec.ts`

**Interfaces:**
- Produces:
  - `CapturedNotification { id, userId, packageName, title, text, postedAt, dedupKey, analyzed, createdAt }`
  - `DetectedTransaction { id, userId, merchant, amount, type, suggestedCategory, accountId, paymentMethod, confidence, status, sourceKeys, transactionId, postedAt, createdAt }`
  - `enum DetectedStatus { PENDING='pending', CONFIRMED='confirmed', DISMISSED='dismissed' }`

- [ ] **Step 1: Add the status enum**

In `backend/src/common/enums.ts`, append:

```ts
export enum DetectedStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  DISMISSED = 'dismissed',
}
```

- [ ] **Step 2: Write the CapturedNotification entity**

Create `backend/src/notification-sync/captured-notification.entity.ts`:

```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('captured_notification')
@Unique('uq_capture_user_dedup', ['userId', 'dedupKey'])
export class CapturedNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255 })
  packageName: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title: string | null;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'timestamptz' })
  postedAt: Date;

  @Column({ type: 'varchar', length: 64 })
  dedupKey: string;

  @Column({ type: 'boolean', default: false })
  @Index()
  analyzed: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 3: Write the DetectedTransaction entity**

Create `backend/src/notification-sync/detected-transaction.entity.ts`:

```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { TransactionType, PaymentMethod, DetectedStatus } from '../common/enums';

@Entity('detected_transaction')
export class DetectedTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255, nullable: true })
  merchant: string | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v == null ? null : parseFloat(v)),
    },
  })
  amount: number | null;

  @Column({ type: 'enum', enum: TransactionType, default: TransactionType.EXPENSE })
  type: TransactionType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  suggestedCategory: string | null;

  @Column({ type: 'uuid', nullable: true })
  accountId: string | null;

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 0.5,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => parseFloat(v),
    },
  })
  confidence: number;

  @Column({ type: 'enum', enum: DetectedStatus, default: DetectedStatus.PENDING })
  @Index()
  status: DetectedStatus;

  @Column({ type: 'simple-array', default: '' })
  sourceKeys: string[];

  @Column({ type: 'uuid', nullable: true })
  transactionId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  postedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 4: Write the module (providers filled in by later tasks)**

Create `backend/src/notification-sync/notification-sync.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { Account } from '../accounts/account.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CapturedNotification, DetectedTransaction, Account]),
  ],
  controllers: [],
  providers: [],
})
export class NotificationSyncModule {}
```

- [ ] **Step 5: Register the module**

In `backend/src/app.module.ts`, add `NotificationSyncModule` to the `imports` array (next to `SmsSyncModule`) and its `import` line at the top:

```ts
import { NotificationSyncModule } from './notification-sync/notification-sync.module';
```

- [ ] **Step 6: Write a smoke test asserting the entity metadata**

Create `backend/src/notification-sync/captured-notification.entity.spec.ts`:

```ts
import { CapturedNotification } from './captured-notification.entity';

describe('CapturedNotification entity', () => {
  it('constructs with expected fields', () => {
    const c = new CapturedNotification();
    c.packageName = 'com.rapido';
    c.text = 'Your ride ₹159';
    c.dedupKey = 'abc';
    c.analyzed = false;
    expect(c.packageName).toBe('com.rapido');
    expect(c.analyzed).toBe(false);
  });
});
```

- [ ] **Step 7: Run test + typecheck**

Run: `cd backend && npx jest notification-sync/captured-notification.entity && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(backend): notification-sync module scaffold + entities"
```

---

## Task 3: Ingest endpoint + dedup

**Files:**
- Create: `backend/src/notification-sync/dto/ingest.dto.ts`
- Create: `backend/src/notification-sync/dedup.ts`
- Create: `backend/src/notification-sync/notification-sync.service.ts`
- Create: `backend/src/notification-sync/notification-sync.controller.ts`
- Modify: `backend/src/notification-sync/notification-sync.module.ts` (wire controller + service)
- Test: `backend/src/notification-sync/dedup.spec.ts`, `backend/src/notification-sync/notification-sync.service.spec.ts`

**Interfaces:**
- Consumes: `CapturedNotification` (Task 2).
- Produces:
  - `computeDedupKey(packageName: string, text: string, postedAtMs: number): string`
  - `NotificationSyncService.ingest(userId: string, items: IngestItemDto[]): Promise<{ inserted: number }>`
  - `POST /notification-sync/ingest` body `{ notifications: IngestItemDto[] }`
  - `IngestItemDto { packageName: string; title?: string; text: string; postedAt: number }`

- [ ] **Step 1: Write the dedup test**

Create `backend/src/notification-sync/dedup.spec.ts`:

```ts
import { computeDedupKey } from './dedup';

describe('computeDedupKey', () => {
  it('is stable for the same package+text within the same minute', () => {
    const a = computeDedupKey('com.rapido', 'Your ride ₹159', 1_700_000_000_000);
    const b = computeDedupKey('com.rapido', 'Your ride ₹159', 1_700_000_020_000);
    expect(a).toBe(b);
  });

  it('differs across packages', () => {
    const a = computeDedupKey('com.rapido', 'x', 1_700_000_000_000);
    const b = computeDedupKey('com.uber', 'x', 1_700_000_000_000);
    expect(a).not.toBe(b);
  });

  it('differs across minute buckets', () => {
    const a = computeDedupKey('com.rapido', 'x', 1_700_000_000_000);
    const b = computeDedupKey('com.rapido', 'x', 1_700_000_120_000);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd backend && npx jest notification-sync/dedup`
Expected: FAIL (`Cannot find module './dedup'`).

- [ ] **Step 3: Implement dedup**

Create `backend/src/notification-sync/dedup.ts`:

```ts
import { createHash } from 'crypto';

/**
 * Stable key identifying "the same notification": package + body + the minute
 * it was posted. Two ingests of one notification collapse to one row; the
 * cross-source (SMS vs notification) dedup is the LLM's job, not this key's.
 */
export function computeDedupKey(
  packageName: string,
  text: string,
  postedAtMs: number,
): string {
  const bucket = Math.floor(postedAtMs / 60_000);
  return createHash('sha1')
    .update(`${packageName}|${text}|${bucket}`)
    .digest('hex')
    .slice(0, 64);
}
```

- [ ] **Step 4: Run dedup test to pass**

Run: `cd backend && npx jest notification-sync/dedup`
Expected: PASS.

- [ ] **Step 5: Write the ingest DTO**

Create `backend/src/notification-sync/dto/ingest.dto.ts`:

```ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsNumber,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class IngestItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  packageName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text: string;

  /** Epoch milliseconds the notification was posted. */
  @IsNumber()
  postedAt: number;
}

export class IngestNotificationsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => IngestItemDto)
  notifications: IngestItemDto[];
}
```

- [ ] **Step 6: Write the service ingest test**

Create `backend/src/notification-sync/notification-sync.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationSyncService } from './notification-sync.service';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';

describe('NotificationSyncService.ingest', () => {
  it('inserts new captures and ignores dedup collisions', async () => {
    const saved: CapturedNotification[] = [];
    const capRepo = {
      create: (x: Partial<CapturedNotification>) => x as CapturedNotification,
      // simulate ON CONFLICT DO NOTHING: identity insert count
      insert: jest.fn(async (rows: CapturedNotification[]) => {
        for (const r of rows) {
          if (!saved.find((s) => s.dedupKey === r.dedupKey)) saved.push(r);
        }
        return { identifiers: [] };
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationSyncService,
        { provide: getRepositoryToken(CapturedNotification), useValue: capRepo },
        { provide: getRepositoryToken(DetectedTransaction), useValue: {} },
      ],
    }).compile();
    const svc = moduleRef.get(NotificationSyncService);

    const item = { packageName: 'com.rapido', text: 'ride ₹159', postedAt: 1_700_000_000_000 };
    await svc.ingest('u1', [item]);
    await svc.ingest('u1', [item]); // same → dedup

    expect(saved.length).toBe(1);
  });
});
```

- [ ] **Step 7: Run to see it fail**

Run: `cd backend && npx jest notification-sync/notification-sync.service`
Expected: FAIL (`Cannot find module './notification-sync.service'`).

- [ ] **Step 8: Implement the service (ingest only for now)**

Create `backend/src/notification-sync/notification-sync.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { IngestItemDto } from './dto/ingest.dto';
import { computeDedupKey } from './dedup';

@Injectable()
export class NotificationSyncService {
  constructor(
    @InjectRepository(CapturedNotification)
    private readonly captures: Repository<CapturedNotification>,
    @InjectRepository(DetectedTransaction)
    private readonly detected: Repository<DetectedTransaction>,
  ) {}

  /**
   * Persist a batch of raw captures, dropping rows that collide on
   * (userId, dedupKey). Uses an ON CONFLICT DO NOTHING insert so a re-upload
   * of the same notification is a silent no-op.
   */
  async ingest(userId: string, items: IngestItemDto[]): Promise<{ inserted: number }> {
    if (items.length === 0) return { inserted: 0 };
    const rows = items.map((i) =>
      this.captures.create({
        userId,
        packageName: i.packageName,
        title: i.title ?? null,
        text: i.text,
        postedAt: new Date(i.postedAt),
        dedupKey: computeDedupKey(i.packageName, i.text, i.postedAt),
        analyzed: false,
      }),
    );
    const res = await this.captures
      .createQueryBuilder()
      .insert()
      .values(rows)
      .orIgnore() // ON CONFLICT DO NOTHING
      .execute();
    return { inserted: res.identifiers.filter(Boolean).length };
  }
}
```

Note: the unit test injects a `capRepo` with an `insert` mock; adjust the test double if you keep the query-builder form — in the test, provide `createQueryBuilder` returning a chainable stub. Simpler: in the test, replace the `insert` double with a `createQueryBuilder` stub:

```ts
const capRepo = {
  create: (x) => x,
  createQueryBuilder: () => ({
    insert: () => ({
      values: (rows) => ({
        orIgnore: () => ({
          execute: async () => {
            const inserted = rows.filter(
              (r) => !saved.find((s) => s.dedupKey === r.dedupKey),
            );
            saved.push(...inserted);
            return { identifiers: inserted.map(() => ({})) };
          },
        }),
      }),
    }),
  }),
};
```

Use this `capRepo` shape in the Step-6 test.

- [ ] **Step 9: Run service test to pass**

Run: `cd backend && npx jest notification-sync/notification-sync.service`
Expected: PASS (inserted length 1).

- [ ] **Step 10: Write the controller**

Create `backend/src/notification-sync/notification-sync.controller.ts`:

```ts
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationSyncService } from './notification-sync.service';
import { IngestNotificationsDto } from './dto/ingest.dto';

@UseGuards(JwtAuthGuard)
@Controller('notification-sync')
export class NotificationSyncController {
  constructor(private readonly service: NotificationSyncService) {}

  @Post('ingest')
  ingest(
    @CurrentUser() user: { userId: string; email: string },
    @Body() dto: IngestNotificationsDto,
  ) {
    return this.service.ingest(user.userId, dto.notifications);
  }
}
```

- [ ] **Step 11: Wire controller + service into the module**

In `backend/src/notification-sync/notification-sync.module.ts`, set `controllers: [NotificationSyncController]` and `providers: [NotificationSyncService]`, `exports: [NotificationSyncService]`, adding the imports.

- [ ] **Step 12: Full typecheck + tests**

Run: `cd backend && npx tsc --noEmit && npx jest notification-sync`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(backend): notification-sync ingest endpoint + dedup"
```

---

## Task 4: LLM analysis service (grouping + extraction)

**Files:**
- Create: `backend/src/notification-sync/analysis.prompt.ts`
- Create: `backend/src/notification-sync/notification-analysis.service.ts`
- Test: `backend/src/notification-sync/notification-analysis.service.spec.ts`

**Interfaces:**
- Consumes: `CapturedNotification` (Task 2), `AI_MODEL` env, `ANTHROPIC_CLIENT` (mirror receipts factory).
- Produces:
  - `interface DetectedGroup { merchant: string|null; amount: number|null; type: 'income'|'expense'; category: string|null; institution: string|null; rail: 'upi'|'card'|'netbanking'|'autopay'|null; confidence: number; sourceKeys: string[] }`
  - `parseGroups(text: string, validKeys: Set<string>): DetectedGroup[]`
  - `NotificationAnalysisService.analyze(captures: {dedupKey: string; packageName: string; title: string|null; text: string}[]): Promise<DetectedGroup[]>`
  - DI token `NOTIFICATION_ANTHROPIC_CLIENT`.

- [ ] **Step 1: Write the prompt module**

Create `backend/src/notification-sync/analysis.prompt.ts`:

```ts
export const ANALYSIS_SYSTEM_PROMPT = [
  'You analyse a batch of Android notifications from a user\'s finance and',
  'merchant apps and extract the real-money transactions in them.',
  '',
  'CORRELATE: when two notifications describe the SAME payment — e.g. a Rapido',
  'notification "Your ride ₹159" and a bank notification "Rs.159 debited from',
  'A/C *1281" close in time — output ONE group covering both, preferring the',
  'merchant name from the merchant app and the account/bank from the bank app.',
  '',
  'Reply with ONLY a JSON array, no prose, no markdown fences. Each element:',
  '{',
  '  "merchant": string|null,',
  '  "amount": number|null,        // positive, in INR',
  '  "type": "income"|"expense",',
  '  "category": string|null,      // one of Food, Groceries, Transport, Shopping,',
  '                                //  Bills, Utilities, Entertainment, Health, Income, or null',
  '  "institution": string|null,   // bank/issuer short name, e.g. "HDFC"',
  '  "rail": "upi"|"card"|"netbanking"|"autopay"|null,',
  '  "confidence": number,         // 0..1',
  '  "sourceKeys": string[]        // the "key" values of the notifications in this group',
  '}',
  '',
  'Ignore OTPs, promotions, delivery/status updates, and anything that is not a',
  'completed money movement. If nothing qualifies, return [].',
].join('\n');

export function buildAnalysisUserPrompt(
  captures: { dedupKey: string; packageName: string; title: string | null; text: string }[],
): string {
  const lines = captures.map((c) =>
    JSON.stringify({
      key: c.dedupKey,
      app: c.packageName,
      title: c.title ?? '',
      text: c.text,
    }),
  );
  return 'Notifications (one JSON per line):\n' + lines.join('\n');
}
```

- [ ] **Step 2: Write the parse test**

Create `backend/src/notification-sync/notification-analysis.service.spec.ts`:

```ts
import { parseGroups } from './notification-analysis.service';

describe('parseGroups', () => {
  const keys = new Set(['k-rapido', 'k-hdfc', 'k-other']);

  it('parses a correlated group and keeps only known sourceKeys', () => {
    const text = JSON.stringify([
      {
        merchant: 'Rapido',
        amount: 159,
        type: 'expense',
        category: 'Transport',
        institution: 'HDFC',
        rail: 'upi',
        confidence: 0.9,
        sourceKeys: ['k-rapido', 'k-hdfc', 'k-hallucinated'],
      },
    ]);
    const groups = parseGroups(text, keys);
    expect(groups).toHaveLength(1);
    expect(groups[0].merchant).toBe('Rapido');
    expect(groups[0].amount).toBe(159);
    expect(groups[0].sourceKeys.sort()).toEqual(['k-hdfc', 'k-rapido']);
  });

  it('tolerates code fences and prose around the JSON', () => {
    const text = 'Here you go:\n```json\n[]\n```';
    expect(parseGroups(text, keys)).toEqual([]);
  });

  it('drops groups with no amount', () => {
    const text = JSON.stringify([
      { merchant: 'X', amount: null, type: 'expense', category: null, institution: null, rail: null, confidence: 0.4, sourceKeys: ['k-other'] },
    ]);
    expect(parseGroups(text, keys)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to fail**

Run: `cd backend && npx jest notification-sync/notification-analysis.service`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement the analysis service + parser**

Create `backend/src/notification-sync/notification-analysis.service.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from './analysis.prompt';

export const NOTIFICATION_ANTHROPIC_CLIENT = 'NOTIFICATION_ANTHROPIC_CLIENT';

export interface DetectedGroup {
  merchant: string | null;
  amount: number | null;
  type: 'income' | 'expense';
  category: string | null;
  institution: string | null;
  rail: 'upi' | 'card' | 'netbanking' | 'autopay' | null;
  confidence: number;
  sourceKeys: string[];
}

const RAILS = ['upi', 'card', 'netbanking', 'autopay'] as const;

/** Parse the model's JSON array, dropping malformed / amount-less groups and
 *  any hallucinated sourceKeys not present in the batch. */
export function parseGroups(text: string, validKeys: Set<string>): DetectedGroup[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: DetectedGroup[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    const amount =
      typeof r['amount'] === 'number' && isFinite(r['amount']) && r['amount'] > 0
        ? Math.abs(r['amount'])
        : null;
    if (amount === null) continue; // not a real transaction
    const sourceKeys = Array.isArray(r['sourceKeys'])
      ? (r['sourceKeys'] as unknown[]).filter(
          (k): k is string => typeof k === 'string' && validKeys.has(k),
        )
      : [];
    if (sourceKeys.length === 0) continue; // nothing to attribute it to
    const rail =
      typeof r['rail'] === 'string' && (RAILS as readonly string[]).includes(r['rail'])
        ? (r['rail'] as DetectedGroup['rail'])
        : null;
    out.push({
      merchant: typeof r['merchant'] === 'string' ? r['merchant'] : null,
      amount,
      type: r['type'] === 'income' ? 'income' : 'expense',
      category: typeof r['category'] === 'string' ? r['category'] : null,
      institution: typeof r['institution'] === 'string' ? r['institution'] : null,
      rail,
      confidence:
        typeof r['confidence'] === 'number' && r['confidence'] >= 0 && r['confidence'] <= 1
          ? r['confidence']
          : 0.5,
      sourceKeys: Array.from(new Set(sourceKeys)),
    });
  }
  return out;
}

@Injectable()
export class NotificationAnalysisService {
  private readonly logger = new Logger(NotificationAnalysisService.name);

  constructor(
    @Inject(NOTIFICATION_ANTHROPIC_CLIENT) private readonly client: Anthropic | null,
    private readonly config: ConfigService,
  ) {}

  private get model(): string {
    return this.config.get<string>('AI_MODEL') ?? 'claude-sonnet-5';
  }

  async analyze(
    captures: { dedupKey: string; packageName: string; title: string | null; text: string }[],
  ): Promise<DetectedGroup[]> {
    if (!this.client || captures.length === 0) return [];
    const validKeys = new Set(captures.map((c) => c.dedupKey));
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildAnalysisUserPrompt(captures) }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return parseGroups(text, validKeys);
  }
}
```

- [ ] **Step 5: Run parse tests to pass**

Run: `cd backend && npx jest notification-sync/notification-analysis.service`
Expected: PASS (3 tests).

- [ ] **Step 6: Register the analysis provider + Anthropic factory in the module**

In `notification-sync.module.ts`, add to `providers`:

```ts
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  NotificationAnalysisService,
  NOTIFICATION_ANTHROPIC_CLIENT,
} from './notification-analysis.service';
// ...
providers: [
  NotificationSyncService,
  NotificationAnalysisService,
  {
    provide: NOTIFICATION_ANTHROPIC_CLIENT,
    inject: [ConfigService],
    useFactory: (config: ConfigService): Anthropic | null => {
      const apiKey = config.get<string>('ANTHROPIC_API_KEY');
      return apiKey ? new Anthropic({ apiKey }) : null;
    },
  },
],
```

- [ ] **Step 7: Typecheck + commit**

Run: `cd backend && npx tsc --noEmit && npx jest notification-sync`
Expected: PASS.

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(backend): notification LLM analysis + grouping parser"
```

---

## Task 5: Payment-source resolution

**Files:**
- Create: `backend/src/notification-sync/payment-source-resolver.ts`
- Test: `backend/src/notification-sync/payment-source-resolver.spec.ts`

**Interfaces:**
- Consumes: `Account` (`institutionName`, `type`), `AccountType`, `PaymentMethod`.
- Produces: `resolvePaymentSource(institution: string|null, rail: DetectedGroup['rail'], accounts: Pick<Account,'id'|'institutionName'|'type'>[]): { accountId: string|null; paymentMethod: PaymentMethod }`

- [ ] **Step 1: Write the test**

Create `backend/src/notification-sync/payment-source-resolver.spec.ts`:

```ts
import { resolvePaymentSource } from './payment-source-resolver';
import { AccountType, PaymentMethod } from '../common/enums';

const acc = (id: string, institutionName: string | null, type: AccountType) => ({
  id,
  institutionName,
  type,
});

describe('resolvePaymentSource', () => {
  it('sets paymentMethod straight from rail', () => {
    const r = resolvePaymentSource('HDFC', 'card', []);
    expect(r.paymentMethod).toBe(PaymentMethod.CARD);
  });

  it('auto-fills accountId on a single institution match', () => {
    const accounts = [acc('a1', 'HDFC Bank', AccountType.SAVINGS)];
    const r = resolvePaymentSource('HDFC', 'upi', accounts);
    expect(r.accountId).toBe('a1');
    expect(r.paymentMethod).toBe(PaymentMethod.UPI);
  });

  it('leaves accountId null when the institution is ambiguous', () => {
    const accounts = [
      acc('a1', 'HDFC Bank', AccountType.SAVINGS),
      acc('a2', 'HDFC Bank', AccountType.CREDIT),
    ];
    const r = resolvePaymentSource('HDFC', 'upi', accounts);
    expect(r.accountId).toBeNull();
  });

  it('narrows by account type implied by a card rail', () => {
    const accounts = [
      acc('a1', 'HDFC Bank', AccountType.SAVINGS),
      acc('a2', 'HDFC Bank', AccountType.CREDIT),
    ];
    const r = resolvePaymentSource('HDFC', 'card', accounts);
    expect(r.accountId).toBe('a2'); // only the credit account matches a card rail
  });

  it('null institution → no account, upi default when rail null', () => {
    const r = resolvePaymentSource(null, null, []);
    expect(r.accountId).toBeNull();
    expect(r.paymentMethod).toBe(PaymentMethod.UPI);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd backend && npx jest notification-sync/payment-source-resolver`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the resolver**

Create `backend/src/notification-sync/payment-source-resolver.ts`:

```ts
import { AccountType, PaymentMethod } from '../common/enums';

type Rail = 'upi' | 'card' | 'netbanking' | 'autopay' | null;
interface AccountLite {
  id: string;
  institutionName: string | null;
  type: AccountType;
}

const RAIL_TO_METHOD: Record<Exclude<Rail, null>, PaymentMethod> = {
  upi: PaymentMethod.UPI,
  card: PaymentMethod.CARD,
  netbanking: PaymentMethod.NETBANKING,
  autopay: PaymentMethod.AUTOPAY,
};

/** First word, lowercased: "HDFC Bank" → "hdfc". */
function instKey(name: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0].toLowerCase();
}

/**
 * Map an LLM-detected (institution, rail) onto a Slice-A payment source.
 * paymentMethod comes straight from the rail (UPI default when rail is null).
 * accountId is filled only when institution+type identifies exactly one account;
 * ambiguous or no match leaves it null for the user to pick in review.
 */
export function resolvePaymentSource(
  institution: string | null,
  rail: Rail,
  accounts: AccountLite[],
): { accountId: string | null; paymentMethod: PaymentMethod } {
  const paymentMethod = rail ? RAIL_TO_METHOD[rail] : PaymentMethod.UPI;

  let accountId: string | null = null;
  const key = instKey(institution);
  if (key) {
    let matches = accounts.filter((a) => instKey(a.institutionName) === key);
    // A card rail can only be a credit account; a non-card rail is any non-credit.
    if (rail === 'card') {
      matches = matches.filter((a) => a.type === AccountType.CREDIT);
    } else if (rail) {
      matches = matches.filter((a) => a.type !== AccountType.CREDIT);
    }
    if (matches.length === 1) accountId = matches[0].id;
  }
  return { accountId, paymentMethod };
}
```

- [ ] **Step 4: Run to pass**

Run: `cd backend && npx jest notification-sync/payment-source-resolver`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(backend): resolve detected payment source by institution + rail"
```

---

## Task 6: Analysis run + scheduler + push

**Files:**
- Modify: `backend/src/notification-sync/notification-sync.service.ts` (add `runAnalysisForUser`)
- Create: `backend/src/notification-sync/notification-sync.scheduler.ts`
- Modify: `backend/src/notification-sync/notification-sync.module.ts` (add scheduler, import NotificationsModule, TypeOrmModule for UserPreferences)
- Test: `backend/src/notification-sync/analysis-run.spec.ts`

**Interfaces:**
- Consumes: `NotificationAnalysisService.analyze` (Task 4), `resolvePaymentSource` (Task 5), `NotificationsService.create`, `AccountsService`/`Account` repo, `UserPreferences` repo (mirror scheduler).
- Produces: `NotificationSyncService.runAnalysisForUser(userId: string): Promise<{ detected: number }>`

- [ ] **Step 1: Write the run test (mapping + mark-analyzed + push)**

Create `backend/src/notification-sync/analysis-run.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationSyncService } from './notification-sync.service';
import { NotificationAnalysisService } from './notification-analysis.service';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { Account } from '../accounts/account.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { AccountType, PaymentMethod } from '../common/enums';

describe('runAnalysisForUser', () => {
  it('turns a correlated group into one pending detection, marks captures analyzed, pushes', async () => {
    const captures: any[] = [
      { id: 'c1', dedupKey: 'k-rapido', packageName: 'com.rapido', title: '', text: 'ride ₹159', postedAt: new Date(), analyzed: false },
      { id: 'c2', dedupKey: 'k-hdfc', packageName: 'com.hdfc', title: '', text: 'Rs.159 debited A/C *1281', postedAt: new Date(), analyzed: false },
    ];
    const savedDetections: any[] = [];
    const analyzedIds: string[] = [];

    const capRepo = {
      find: jest.fn(async () => captures),
      update: jest.fn(async (ids: string[]) => { analyzedIds.push(...ids); }),
    };
    const detRepo = {
      create: (x: any) => x,
      save: jest.fn(async (x: any) => { savedDetections.push(x); return x; }),
    };
    const accRepo = { find: jest.fn(async () => [{ id: 'a1', institutionName: 'HDFC Bank', type: AccountType.SAVINGS }] as Account[]) };
    const analysis = { analyze: jest.fn(async () => [{
      merchant: 'Rapido', amount: 159, type: 'expense', category: 'Transport',
      institution: 'HDFC', rail: 'upi', confidence: 0.9, sourceKeys: ['k-rapido', 'k-hdfc'],
    }]) };
    const notifications = { create: jest.fn(async () => ({})) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationSyncService,
        { provide: getRepositoryToken(CapturedNotification), useValue: capRepo },
        { provide: getRepositoryToken(DetectedTransaction), useValue: detRepo },
        { provide: getRepositoryToken(Account), useValue: accRepo },
        { provide: NotificationAnalysisService, useValue: analysis },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    const svc = moduleRef.get(NotificationSyncService);

    const res = await svc.runAnalysisForUser('u1');

    expect(res.detected).toBe(1);
    expect(savedDetections[0]).toMatchObject({
      merchant: 'Rapido', amount: 159, accountId: 'a1', paymentMethod: PaymentMethod.UPI,
    });
    expect(analyzedIds.sort()).toEqual(['c1', 'c2']);
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });

  it('no captures → no analyze call, no push', async () => {
    const capRepo = { find: jest.fn(async () => []), update: jest.fn() };
    const analysis = { analyze: jest.fn() };
    const notifications = { create: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationSyncService,
        { provide: getRepositoryToken(CapturedNotification), useValue: capRepo },
        { provide: getRepositoryToken(DetectedTransaction), useValue: {} },
        { provide: getRepositoryToken(Account), useValue: { find: jest.fn() } },
        { provide: NotificationAnalysisService, useValue: analysis },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    const svc = moduleRef.get(NotificationSyncService);
    const res = await svc.runAnalysisForUser('u1');
    expect(res.detected).toBe(0);
    expect(analysis.analyze).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd backend && npx jest notification-sync/analysis-run`
Expected: FAIL (`runAnalysisForUser` not a function / missing deps).

- [ ] **Step 3: Extend the service**

Add to `NotificationSyncService` in `notification-sync.service.ts` — extend the constructor and add the method. New constructor injections and imports:

```ts
import { NotificationAnalysisService } from './notification-analysis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Account } from '../accounts/account.entity';
import { resolvePaymentSource } from './payment-source-resolver';
import { DetectedStatus, NotificationType } from '../common/enums';
import { In } from 'typeorm';
```

Constructor gains:

```ts
@InjectRepository(Account) private readonly accounts: Repository<Account>,
private readonly analysis: NotificationAnalysisService,
private readonly notifications: NotificationsService,
```

Method (max batch 150):

```ts
/**
 * Analyse this user's un-analysed captures in one LLM call, turn each returned
 * group into a pending DetectedTransaction (resolving its payment source),
 * mark the captures analysed, and push a summary if anything was found.
 */
async runAnalysisForUser(userId: string): Promise<{ detected: number }> {
  const captures = await this.captures.find({
    where: { userId, analyzed: false },
    order: { postedAt: 'ASC' },
    take: 150,
  });
  if (captures.length === 0) return { detected: 0 };

  const groups = await this.analysis.analyze(
    captures.map((c) => ({
      dedupKey: c.dedupKey,
      packageName: c.packageName,
      title: c.title,
      text: c.text,
    })),
  );

  const userAccounts = await this.accounts.find({ where: { userId } });
  const keyToPostedAt = new Map(captures.map((c) => [c.dedupKey, c.postedAt]));

  let detected = 0;
  for (const g of groups) {
    const { accountId, paymentMethod } = resolvePaymentSource(
      g.institution,
      g.rail,
      userAccounts,
    );
    const postedAt =
      g.sourceKeys.map((k) => keyToPostedAt.get(k)).find(Boolean) ?? null;
    await this.detected.save(
      this.detected.create({
        userId,
        merchant: g.merchant,
        amount: g.amount,
        type: g.type === 'income' ? ('income' as any) : ('expense' as any),
        suggestedCategory: g.category,
        accountId,
        paymentMethod,
        confidence: g.confidence,
        status: DetectedStatus.PENDING,
        sourceKeys: g.sourceKeys,
        transactionId: null,
        postedAt,
      }),
    );
    detected += 1;
  }

  await this.captures.update(
    { id: In(captures.map((c) => c.id)) },
    { analyzed: true },
  );

  if (detected > 0) {
    await this.notifications.create(userId, {
      type: NotificationType.LARGE_TRANSACTION,
      title: 'New transactions to review',
      body: `Munshi found ${detected} transaction${detected === 1 ? '' : 's'} from your notifications.`,
      data: { screen: 'sync' },
    });
  }
  return { detected };
}
```

Note: `type` cast — the entity's `type` is `TransactionType`; map `'income'|'expense'` to `TransactionType.INCOME`/`TransactionType.EXPENSE` instead of `as any`:

```ts
type: g.type === 'income' ? TransactionType.INCOME : TransactionType.EXPENSE,
```

and import `TransactionType`. Also confirm `NotificationType.LARGE_TRANSACTION` exists in `enums.ts`; if a more fitting member exists (e.g. a generic one), use it — the `data.screen` is what routes the deep-link.

In the Step-1 test, the analyzed-capture `update` double takes `(criteria, partial)`; adjust the mock to `update: jest.fn(async (criteria) => { analyzedIds.push(...(criteria.id?._value ?? [])); })` or simpler, capture ids from the `In(...)` argument. Use this mock shape:

```ts
update: jest.fn(async (criteria: any) => {
  const ids = criteria.id?._value ?? criteria.id?.value ?? [];
  analyzedIds.push(...ids);
}),
```

If the TypeORM `In` internal shape differs in your version, assert on `capRepo.update` being called once instead of on exact ids.

- [ ] **Step 4: Run to pass**

Run: `cd backend && npx jest notification-sync/analysis-run`
Expected: PASS (both tests).

- [ ] **Step 5: Write the scheduler**

Create `backend/src/notification-sync/notification-sync.scheduler.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreferences } from '../users/user-preferences.entity';
import { NotificationSyncService } from './notification-sync.service';

@Injectable()
export class NotificationSyncScheduler {
  private readonly logger = new Logger(NotificationSyncScheduler.name);

  constructor(
    private readonly service: NotificationSyncService,
    @InjectRepository(UserPreferences)
    private readonly prefsRepo: Repository<UserPreferences>,
  ) {}

  // A few times a day (IST): 09:00, 13:00, 18:00, 22:00.
  @Cron('0 9,13,18,22 * * *', { timeZone: 'Asia/Kolkata' })
  async run(): Promise<void> {
    const prefs = await this.prefsRepo.find();
    for (const p of prefs) {
      await this.safe(() => this.service.runAnalysisForUser(p.userId));
    }
  }

  private async safe(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(
        `Notification analysis failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
```

Note: verify `UserPreferences` has a `userId` and is the right table to enumerate active users; the Munshi scheduler filters by a `*Enabled` flag. If you want a per-user opt-out, add a `notificationSyncEnabled` boolean to `UserPreferences` and filter here — otherwise enumerate all prefs rows.

- [ ] **Step 6: Wire scheduler + deps into the module**

In `notification-sync.module.ts`:
- `imports`: add `NotificationsModule` and `TypeOrmModule.forFeature([CapturedNotification, DetectedTransaction, Account, UserPreferences])`.
- `providers`: add `NotificationSyncScheduler`.
- Confirm `NotificationsModule` exports `NotificationsService` (it must, for injection). If not, add it to that module's `exports`.

- [ ] **Step 7: Typecheck + full module tests**

Run: `cd backend && npx tsc --noEmit && npx jest notification-sync`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(backend): scheduled notification analysis + review push"
```

---

## Task 7: Pending / confirm / dismiss endpoints

**Files:**
- Create: `backend/src/notification-sync/dto/confirm.dto.ts`
- Modify: `backend/src/notification-sync/notification-sync.service.ts` (add `listPending`, `confirm`, `dismiss`)
- Modify: `backend/src/notification-sync/notification-sync.controller.ts` (add routes)
- Modify: `backend/src/notification-sync/notification-sync.module.ts` (import TransactionsModule)
- Test: `backend/src/notification-sync/confirm.spec.ts`

**Interfaces:**
- Consumes: `TransactionsService.create` (returns `Transaction` with `id`), `DetectedTransaction`.
- Produces:
  - `GET /notification-sync/pending` → `DetectedTransaction[]` (status pending)
  - `POST /notification-sync/:id/confirm` body `ConfirmDetectedDto` → `{ transactionId: string }`
  - `POST /notification-sync/:id/dismiss` → `{ ok: true }`
  - `ConfirmDetectedDto { date: string; description: string; amount: number; type: TransactionType; categoryId: string; accountId?: string; paymentMethod?: PaymentMethod; notes?: string }`

- [ ] **Step 1: Write the confirm DTO**

Create `backend/src/notification-sync/dto/confirm.dto.ts`:

```ts
import { IsString, IsOptional, IsUUID, IsEnum, IsPositive, IsDateString } from 'class-validator';
import { TransactionType, PaymentMethod } from '../../common/enums';

export class ConfirmDetectedDto {
  @IsDateString()
  date: string;

  @IsString()
  description: string;

  @IsPositive()
  amount: number;

  @IsEnum(TransactionType)
  type: TransactionType;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  notes?: string;
}
```

- [ ] **Step 2: Write the confirm/dismiss test**

Create `backend/src/notification-sync/confirm.spec.ts`:

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
import { Account } from '../accounts/account.entity';
import { DetectedStatus, TransactionType } from '../common/enums';

function build(detRepoOverrides: any, txCreate = jest.fn(async () => ({ id: 'tx1' }))) {
  return Test.createTestingModule({
    providers: [
      NotificationSyncService,
      { provide: getRepositoryToken(CapturedNotification), useValue: {} },
      { provide: getRepositoryToken(DetectedTransaction), useValue: detRepoOverrides },
      { provide: getRepositoryToken(Account), useValue: {} },
      { provide: NotificationAnalysisService, useValue: {} },
      { provide: NotificationsService, useValue: {} },
      { provide: TransactionsService, useValue: { create: txCreate } },
    ],
  }).compile();
}

describe('confirm/dismiss', () => {
  it('confirm creates a transaction and marks the detection confirmed', async () => {
    const det: any = { id: 'd1', userId: 'u1', status: DetectedStatus.PENDING };
    const detRepo = {
      findOne: jest.fn(async () => det),
      save: jest.fn(async (x: any) => x),
    };
    const txCreate = jest.fn(async () => ({ id: 'tx1' }));
    const moduleRef = await build(detRepo, txCreate);
    const svc = moduleRef.get(NotificationSyncService);

    const res = await svc.confirm('u1', 'd1', {
      date: '2026-07-08', description: 'Rapido', amount: 159,
      type: TransactionType.EXPENSE, categoryId: 'cat1', accountId: 'a1',
    } as any);

    expect(txCreate).toHaveBeenCalledTimes(1);
    expect(res.transactionId).toBe('tx1');
    expect(detRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: DetectedStatus.CONFIRMED, transactionId: 'tx1' }),
    );
  });

  it('confirm on a foreign/missing detection throws', async () => {
    const detRepo = { findOne: jest.fn(async () => null), save: jest.fn() };
    const moduleRef = await build(detRepo);
    const svc = moduleRef.get(NotificationSyncService);
    await expect(
      svc.confirm('u1', 'missing', { date: '2026-07-08', description: 'x', amount: 1, type: TransactionType.EXPENSE, categoryId: 'c' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('dismiss marks the detection dismissed', async () => {
    const det: any = { id: 'd1', userId: 'u1', status: DetectedStatus.PENDING };
    const detRepo = { findOne: jest.fn(async () => det), save: jest.fn(async (x: any) => x) };
    const moduleRef = await build(detRepo);
    const svc = moduleRef.get(NotificationSyncService);
    await svc.dismiss('u1', 'd1');
    expect(detRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: DetectedStatus.DISMISSED }),
    );
  });
});
```

- [ ] **Step 3: Run to fail**

Run: `cd backend && npx jest notification-sync/confirm`
Expected: FAIL (methods missing).

- [ ] **Step 4: Implement the methods**

Add to `NotificationSyncService` (inject `TransactionsService` in the constructor; import it and `NotFoundException`, `TransactionStatus` if needed):

```ts
import { NotFoundException } from '@nestjs/common';
import { TransactionsService } from '../transactions/transactions.service';
import { ConfirmDetectedDto } from './dto/confirm.dto';
// constructor: private readonly transactions: TransactionsService,

listPending(userId: string): Promise<DetectedTransaction[]> {
  return this.detected.find({
    where: { userId, status: DetectedStatus.PENDING },
    order: { createdAt: 'DESC' },
  });
}

private async loadPending(userId: string, id: string): Promise<DetectedTransaction> {
  const det = await this.detected.findOne({ where: { id, userId } });
  if (!det || det.status !== DetectedStatus.PENDING) {
    throw new NotFoundException('Detected transaction not found');
  }
  return det;
}

async confirm(
  userId: string,
  id: string,
  dto: ConfirmDetectedDto,
): Promise<{ transactionId: string }> {
  const det = await this.loadPending(userId, id);
  const tx = await this.transactions.create(userId, {
    date: dto.date,
    description: dto.description,
    amount: dto.amount,
    type: dto.type,
    categoryId: dto.categoryId,
    accountId: dto.accountId,
    paymentMethod: dto.paymentMethod,
    notes: dto.notes,
  });
  det.status = DetectedStatus.CONFIRMED;
  det.transactionId = tx.id;
  await this.detected.save(det);
  return { transactionId: tx.id };
}

async dismiss(userId: string, id: string): Promise<{ ok: true }> {
  const det = await this.loadPending(userId, id);
  det.status = DetectedStatus.DISMISSED;
  await this.detected.save(det);
  return { ok: true };
}
```

- [ ] **Step 5: Run to pass**

Run: `cd backend && npx jest notification-sync/confirm`
Expected: PASS (3 tests).

- [ ] **Step 6: Add controller routes**

Append to `NotificationSyncController`:

```ts
import { Get, Param } from '@nestjs/common';
import { ConfirmDetectedDto } from './dto/confirm.dto';

@Get('pending')
pending(@CurrentUser() user: { userId: string }) {
  return this.service.listPending(user.userId);
}

@Post(':id/confirm')
confirm(
  @CurrentUser() user: { userId: string },
  @Param('id') id: string,
  @Body() dto: ConfirmDetectedDto,
) {
  return this.service.confirm(user.userId, id, dto);
}

@Post(':id/dismiss')
dismiss(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
  return this.service.dismiss(user.userId, id);
}
```

- [ ] **Step 7: Import TransactionsModule in the module**

In `notification-sync.module.ts` add `TransactionsModule` to `imports`. Confirm it exports `TransactionsService`; if not, add it to `TransactionsModule`'s `exports`.

- [ ] **Step 8: Typecheck + full backend tests + commit**

Run: `cd backend && npx tsc --noEmit && npx jest notification-sync`
Expected: PASS.

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(backend): pending/confirm/dismiss for detected transactions"
```

---

## Task 8: Native `notification-listener` Expo module (JS interface + Kotlin skeleton)

**Files:**
- Create: `mobile/modules/notification-listener/expo-module.config.json`
- Create: `mobile/modules/notification-listener/android/build.gradle`
- Create: `mobile/modules/notification-listener/index.ts`
- Test: `mobile/modules/notification-listener/index.test.ts` (JS degradation only)

**Interfaces:**
- Produces (JS):
  - `isNotificationListenerAvailable: boolean`
  - `isEnabled(): boolean`
  - `openSettings(): void`
  - `setAllowlist(packages: string[]): Promise<void>`
  - `getPending(max?: number): Promise<CapturedItem[]>` where `CapturedItem { id: string; packageName: string; title: string; text: string; postedAt: number }`
  - `markUploaded(ids: string[]): Promise<void>`
  - `clearAll(): Promise<void>`
  - `DEFAULT_ALLOWLIST: string[]`

- [ ] **Step 1: Module config + gradle (mirror sms-reader)**

Create `mobile/modules/notification-listener/expo-module.config.json`:

```json
{
  "platforms": ["android"],
  "android": {
    "modules": ["expo.modules.notificationlistener.NotificationListenerModule"]
  }
}
```

Create `mobile/modules/notification-listener/android/build.gradle`:

```gradle
apply plugin: 'expo-module-gradle-plugin'

group = 'expo.modules.notificationlistener'
version = '0.1.0'
```

- [ ] **Step 2: Write the JS degradation test**

Create `mobile/modules/notification-listener/index.test.ts`:

```ts
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null }));

import { isNotificationListenerAvailable, getPending, isEnabled } from './index';

describe('notification-listener (unsupported platform)', () => {
  it('reports unavailable and no-ops', async () => {
    expect(isNotificationListenerAvailable).toBe(false);
    expect(isEnabled()).toBe(false);
    await expect(getPending()).resolves.toEqual([]);
  });
});
```

- [ ] **Step 3: Run to fail**

Run: `cd mobile && npx jest modules/notification-listener/index`
Expected: FAIL (`Cannot find module './index'`).

- [ ] **Step 4: Implement the JS wrapper**

Create `mobile/modules/notification-listener/index.ts`:

```ts
/**
 * notification-listener — local Expo module reading captured notifications from
 * an on-device store fed by an Android NotificationListenerService.
 *
 * Android-only. On every other platform requireOptionalNativeModule returns null
 * and every helper degrades to "not available / no messages".
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export interface CapturedItem {
  id: string;
  packageName: string;
  title: string;
  text: string;
  postedAt: number;
}

interface NativeModule {
  isEnabled(): boolean;
  openSettings(): void;
  setAllowlist(packages: string[]): Promise<void>;
  getPending(max: number): Promise<CapturedItem[]>;
  markUploaded(ids: string[]): Promise<void>;
  clearAll(): Promise<void>;
}

const Native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeModule>('NotificationListener')
    : null;

export const isNotificationListenerAvailable = Native != null;

/** Finance + merchant apps we capture from. Extend as needed. */
export const DEFAULT_ALLOWLIST: string[] = [
  // Banks (notification package names)
  'com.snapwork.hdfc', 'com.csam.icici.bank.imobile', 'com.sbi.lotusintouch',
  'com.axis.mobile', 'com.msf.kbank.mobile', 'com.bankofbaroda.mconnect',
  // UPI / wallets
  'com.google.android.apps.nbu.paisa.user', 'com.phonepe.app', 'net.one97.paytm',
  // Merchants
  'com.rapido.passenger', 'com.ubercab', 'in.swiggy.android',
  'com.application.zomato', 'in.amazon.mShop.android.shopping', 'com.flipkart.android',
];

export function isEnabled(): boolean {
  return Native ? Native.isEnabled() : false;
}
export function openSettings(): void {
  Native?.openSettings();
}
export async function setAllowlist(packages: string[]): Promise<void> {
  if (Native) await Native.setAllowlist(packages);
}
export async function getPending(max = 300): Promise<CapturedItem[]> {
  return Native ? Native.getPending(max) : [];
}
export async function markUploaded(ids: string[]): Promise<void> {
  if (Native && ids.length) await Native.markUploaded(ids);
}
export async function clearAll(): Promise<void> {
  if (Native) await Native.clearAll();
}
```

- [ ] **Step 5: Run to pass**

Run: `cd mobile && npx jest modules/notification-listener/index`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(mobile): notification-listener module JS interface"
```

---

## Task 9: Kotlin — capture store, listener service, module functions

**Files:**
- Create: `mobile/modules/notification-listener/android/src/main/AndroidManifest.xml`
- Create: `.../android/src/main/java/expo/modules/notificationlistener/CaptureStore.kt`
- Create: `.../android/src/main/java/expo/modules/notificationlistener/RiddhiNotificationListenerService.kt`
- Create: `.../android/src/main/java/expo/modules/notificationlistener/NotificationListenerModule.kt`

**Interfaces:**
- Consumes: the JS names from Task 8 (`isEnabled`, `openSettings`, `setAllowlist`, `getPending`, `markUploaded`, `clearAll`).
- Produces: an on-device capture store populated by the system whenever an allowlisted app posts a notification.

> Native code isn't unit-tested in this setup; this task is verified by a real dev build + device walkthrough in Task 12's manual check.

- [ ] **Step 1: Declare the service (merged into the app manifest)**

Create `.../android/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application>
    <service
      android:name="expo.modules.notificationlistener.RiddhiNotificationListenerService"
      android:label="Riddhi notifications"
      android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
      android:exported="false">
      <intent-filter>
        <action android:name="android.service.notification.NotificationListenerService" />
      </intent-filter>
    </service>
  </application>
</manifest>
```

Note: if the Android build fails requiring `android:exported="true"` for a service with an intent-filter, switch it to `true` — binding is still gated by the system-only `BIND_NOTIFICATION_LISTENER_SERVICE` permission.

- [ ] **Step 2: Capture store (SQLite via SQLiteOpenHelper)**

Create `CaptureStore.kt`:

```kotlin
package expo.modules.notificationlistener

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/** Single-table on-device log of captured notifications. */
class CaptureStore private constructor(context: Context) :
  SQLiteOpenHelper(context.applicationContext, DB_NAME, null, 1) {

  companion object {
    private const val DB_NAME = "notif_capture.db"
    private const val TABLE = "captures"
    private const val MAX_ROWS = 5000

    @Volatile private var instance: CaptureStore? = null
    fun get(context: Context): CaptureStore =
      instance ?: synchronized(this) {
        instance ?: CaptureStore(context).also { instance = it }
      }
  }

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      "CREATE TABLE $TABLE (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "pkg TEXT NOT NULL, title TEXT, text TEXT NOT NULL," +
        "postedAt INTEGER NOT NULL, uploaded INTEGER NOT NULL DEFAULT 0)",
    )
  }

  override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {
    db.execSQL("DROP TABLE IF EXISTS $TABLE")
    onCreate(db)
  }

  fun insert(pkg: String, title: String?, text: String, postedAt: Long) {
    val db = writableDatabase
    db.insert(TABLE, null, ContentValues().apply {
      put("pkg", pkg); put("title", title); put("text", text); put("postedAt", postedAt)
    })
    // Trim oldest beyond the cap.
    db.execSQL(
      "DELETE FROM $TABLE WHERE id NOT IN " +
        "(SELECT id FROM $TABLE ORDER BY id DESC LIMIT $MAX_ROWS)",
    )
  }

  fun getPending(max: Int): List<Map<String, Any?>> {
    val out = mutableListOf<Map<String, Any?>>()
    readableDatabase.query(
      TABLE, null, "uploaded = 0", null, null, null, "postedAt ASC", max.toString(),
    ).use { c ->
      val idI = c.getColumnIndexOrThrow("id")
      val pkgI = c.getColumnIndexOrThrow("pkg")
      val titleI = c.getColumnIndexOrThrow("title")
      val textI = c.getColumnIndexOrThrow("text")
      val postedI = c.getColumnIndexOrThrow("postedAt")
      while (c.moveToNext()) {
        out.add(
          mapOf(
            "id" to c.getLong(idI).toString(),
            "packageName" to c.getString(pkgI),
            "title" to (c.getString(titleI) ?: ""),
            "text" to c.getString(textI),
            "postedAt" to c.getLong(postedI).toDouble(),
          ),
        )
      }
    }
    return out
  }

  fun markUploaded(ids: List<String>) {
    if (ids.isEmpty()) return
    val placeholders = ids.joinToString(",") { "?" }
    writableDatabase.execSQL(
      "UPDATE $TABLE SET uploaded = 1 WHERE id IN ($placeholders)",
      ids.toTypedArray(),
    )
  }

  fun clearAll() {
    writableDatabase.execSQL("DELETE FROM $TABLE")
  }
}
```

- [ ] **Step 3: Allowlist prefs helper + listener service**

Create `RiddhiNotificationListenerService.kt`:

```kotlin
package expo.modules.notificationlistener

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/** Reads the JS-configured allowlist from SharedPreferences and stores matching
 *  notifications. Runs whenever the user has granted notification access. */
class RiddhiNotificationListenerService : NotificationListenerService() {

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val pkg = sbn.packageName ?: return
    val allow = allowlist(this)
    if (allow.isNotEmpty() && !allow.contains(pkg)) return

    val extras = sbn.notification?.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
    val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
      ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()
    if (text.isNullOrBlank()) return

    CaptureStore.get(this).insert(pkg, title, text, sbn.postTime)
  }

  companion object {
    private const val PREFS = "notif_listener_prefs"
    private const val KEY_ALLOW = "allowlist"

    fun setAllowlist(context: Context, packages: List<String>) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putStringSet(KEY_ALLOW, packages.toSet()).apply()
    }

    fun allowlist(context: Context): Set<String> =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getStringSet(KEY_ALLOW, emptySet()) ?: emptySet()
  }
}
```

- [ ] **Step 4: The Expo module (JS bridge)**

Create `NotificationListenerModule.kt`:

```kotlin
package expo.modules.notificationlistener

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationListenerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("NotificationListener")

    Function("isEnabled") {
      NotificationManagerCompat.getEnabledListenerPackages(context)
        .contains(context.packageName)
    }

    Function("openSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    AsyncFunction("setAllowlist") { packages: List<String> ->
      RiddhiNotificationListenerService.setAllowlist(context, packages)
    }

    AsyncFunction("getPending") { max: Int ->
      CaptureStore.get(context).getPending(max)
    }

    AsyncFunction("markUploaded") { ids: List<String> ->
      CaptureStore.get(context).markUploaded(ids)
    }

    AsyncFunction("clearAll") {
      CaptureStore.get(context).clearAll()
    }
  }
}
```

- [ ] **Step 5: Prebuild sanity (compile only)**

Run: `cd mobile && npx expo prebuild -p android --no-install` then `cd android && ./gradlew :notification-listener:compileDebugKotlin`
Expected: Kotlin compiles. (If gradle module name differs, use the name printed by `./gradlew projects`.)

- [ ] **Step 6: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(mobile): Android notification listener service + capture store"
```

---

## Task 10: Mobile upload + review pipeline (`notificationSync.ts`)

**Files:**
- Create: `mobile/src/lib/notificationSync.ts`
- Test: `mobile/src/lib/notificationSync.test.ts`

**Interfaces:**
- Consumes: `apiClient` (`mobile/src/api/client`), the Task-8 native helpers, `DEFAULT_ALLOWLIST`.
- Produces:
  - `notificationSyncSupported(): boolean`
  - `configureAllowlist(): Promise<void>` (pushes DEFAULT_ALLOWLIST to native)
  - `uploadCaptured(): Promise<number>` (uploads pending, marks uploaded, returns count)
  - `fetchDetected(): Promise<DetectedView[]>` (GET pending → view models)
  - `confirmDetected(id: string, payload: ConfirmPayload): Promise<void>`
  - `dismissDetected(id: string): Promise<void>`
  - types `DetectedView`, `ConfirmPayload`.

- [ ] **Step 1: Write the upload test**

Create `mobile/src/lib/notificationSync.test.ts`:

```ts
const getPending = jest.fn();
const markUploaded = jest.fn();
jest.mock('../../modules/notification-listener', () => ({
  isNotificationListenerAvailable: true,
  DEFAULT_ALLOWLIST: ['com.rapido.passenger'],
  getPending: (...a: any[]) => getPending(...a),
  markUploaded: (...a: any[]) => markUploaded(...a),
  setAllowlist: jest.fn(),
  isEnabled: () => true,
}));
const post = jest.fn();
jest.mock('../api/client', () => ({ apiClient: { post: (...a: any[]) => post(...a), get: jest.fn() } }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { uploadCaptured } from './notificationSync';

describe('uploadCaptured', () => {
  beforeEach(() => { getPending.mockReset(); markUploaded.mockReset(); post.mockReset(); });

  it('uploads pending captures and marks them uploaded', async () => {
    getPending.mockResolvedValueOnce([
      { id: '1', packageName: 'com.rapido.passenger', title: 'Ride', text: '₹159', postedAt: 1 },
    ]);
    post.mockResolvedValueOnce({ inserted: 1 });
    const n = await uploadCaptured();
    expect(post).toHaveBeenCalledWith('/notification-sync/ingest', {
      notifications: [
        { packageName: 'com.rapido.passenger', title: 'Ride', text: '₹159', postedAt: 1 },
      ],
    });
    expect(markUploaded).toHaveBeenCalledWith(['1']);
    expect(n).toBe(1);
  });

  it('no captures → no upload', async () => {
    getPending.mockResolvedValueOnce([]);
    const n = await uploadCaptured();
    expect(post).not.toHaveBeenCalled();
    expect(n).toBe(0);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd mobile && npx jest src/lib/notificationSync`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the pipeline**

Create `mobile/src/lib/notificationSync.ts`:

```ts
/**
 * notificationSync — Android-only pipeline mirroring smsSync.ts but for
 * NotificationListenerService captures:
 *   1. push the allowlist to the native store,
 *   2. upload un-sent captures to POST /notification-sync/ingest,
 *   3. mark them uploaded natively,
 *   4. fetch backend-detected (LLM-grouped) transactions for review,
 *   5. confirm/dismiss each one.
 */
import { Platform } from 'react-native';
import { apiClient } from '../api/client';
import {
  isNotificationListenerAvailable,
  DEFAULT_ALLOWLIST,
  getPending,
  markUploaded,
  setAllowlist,
} from '../../modules/notification-listener';

const UPLOAD_BATCH = 100;

export interface DetectedView {
  id: string;
  merchant: string | null;
  amount: number | null;
  type: 'income' | 'expense';
  suggestedCategory: string | null;
  accountId: string | null;
  paymentMethod: string;
  confidence: number;
  postedAt: string | null;
}

export interface ConfirmPayload {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  categoryId: string;
  accountId?: string;
  paymentMethod?: string;
  notes?: string;
}

export function notificationSyncSupported(): boolean {
  return Platform.OS === 'android' && isNotificationListenerAvailable;
}

export async function configureAllowlist(): Promise<void> {
  if (!notificationSyncSupported()) return;
  await setAllowlist(DEFAULT_ALLOWLIST);
}

export async function uploadCaptured(): Promise<number> {
  if (!notificationSyncSupported()) return 0;
  const pending = await getPending(UPLOAD_BATCH * 3);
  if (pending.length === 0) return 0;
  let uploaded = 0;
  for (let i = 0; i < pending.length; i += UPLOAD_BATCH) {
    const batch = pending.slice(i, i + UPLOAD_BATCH);
    await apiClient.post('/notification-sync/ingest', {
      notifications: batch.map((p) => ({
        packageName: p.packageName,
        title: p.title,
        text: p.text,
        postedAt: p.postedAt,
      })),
    });
    await markUploaded(batch.map((p) => p.id));
    uploaded += batch.length;
  }
  return uploaded;
}

export async function fetchDetected(): Promise<DetectedView[]> {
  return apiClient.get<DetectedView[]>('/notification-sync/pending');
}

export async function confirmDetected(id: string, payload: ConfirmPayload): Promise<void> {
  await apiClient.post(`/notification-sync/${id}/confirm`, payload);
}

export async function dismissDetected(id: string): Promise<void> {
  await apiClient.post(`/notification-sync/${id}/dismiss`, {});
}
```

- [ ] **Step 4: Run to pass**

Run: `cd mobile && npx jest src/lib/notificationSync`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(mobile): notification capture upload + detected-txn review client"
```

---

## Task 11: Wire the Sync screen (enable CTA, load detections, confirm/dismiss)

**Files:**
- Modify: `mobile/src/screens/Sync.tsx`
- Read first (context): `mobile/src/screens/Sync.tsx`, `mobile/src/screens/DetectedCard.tsx`

**Interfaces:**
- Consumes: everything from Task 10 + the native `isEnabled`/`openSettings`.
- Produces: user-visible capture toggle + notification-detected suggestions merged into the existing pending review list.

> This task modifies a large existing screen. Read `Sync.tsx` fully first, then insert the pieces below at the matching spots. The screen already renders a pending list with confirm/dismiss and a "more" sheet — reuse those; do not rebuild them.

- [ ] **Step 1: Read the screen and its detected card**

Run: open `mobile/src/screens/Sync.tsx` and `mobile/src/screens/DetectedCard.tsx`; identify (a) where pending items are stored in state, (b) the confirm handler, (c) the dismiss handler, (d) the "more" sheet options.

- [ ] **Step 2: Import the pipeline + native enable helpers**

At the top of `Sync.tsx`:

```ts
import {
  notificationSyncSupported,
  configureAllowlist,
  uploadCaptured,
  fetchDetected,
  confirmDetected,
  dismissDetected,
  type DetectedView,
} from '../lib/notificationSync';
import { isEnabled as isListenerEnabled, openSettings as openListenerSettings } from '../../modules/notification-listener';
```

- [ ] **Step 3: On focus — configure, upload, load detections**

Add an effect that runs when the screen gains focus (reuse the screen's existing focus/refresh mechanism; if it uses `useFocusEffect`, add there):

```ts
const [listenerEnabled, setListenerEnabled] = useState<boolean>(false);
const [detected, setDetected] = useState<DetectedView[]>([]);

const refreshDetections = useCallback(async () => {
  if (!notificationSyncSupported()) return;
  setListenerEnabled(isListenerEnabled());
  await configureAllowlist();
  await uploadCaptured();
  setDetected(await fetchDetected());
}, []);

useEffect(() => { refreshDetections(); }, [refreshDetections]);
```

- [ ] **Step 4: Render the enable CTA when access isn't granted**

Where the screen shows its status/connected-sources area, add (only when supported and not enabled):

```tsx
{notificationSyncSupported() && !listenerEnabled && (
  <Pressable onPress={() => openListenerSettings()} style={/* reuse an existing card/button style */}>
    <Text>Enable notification capture</Text>
    <Text style={{ opacity: 0.6 }}>
      Grant Riddhi notification access so it can detect transactions from your bank & app alerts.
    </Text>
  </Pressable>
)}
```

- [ ] **Step 5: Render detected suggestions in the pending list**

Map `detected` into the same card the screen already uses for suggestions (or `DetectedCard`), passing merchant/amount/category/source. Wire the card's confirm and dismiss to:

```ts
const onConfirmDetected = async (d: DetectedView, edited: {
  categoryId: string; accountId?: string; date: string; description: string; amount: number;
}) => {
  await confirmDetected(d.id, {
    date: edited.date,
    description: edited.description,
    amount: edited.amount,
    type: d.type,
    categoryId: edited.categoryId,
    accountId: edited.accountId ?? d.accountId ?? undefined,
    paymentMethod: d.paymentMethod,
  });
  setDetected((cur) => cur.filter((x) => x.id !== d.id));
};

const onDismissDetected = async (d: DetectedView) => {
  await dismissDetected(d.id);
  setDetected((cur) => cur.filter((x) => x.id !== d.id));
};
```

The category picker must resolve a real `categoryId` (the detection only carries a suggested category *name*); reuse the app's existing category picker to map name→id, defaulting the selection to the suggested name when it matches a category.

- [ ] **Step 6: Add "pause capture" + "clear captured data" to the more-sheet**

In the existing more-sheet options, add two items. "Clear captured data" calls the
native `clearAll`; "Pause capture" empties the allowlist so the service stops
storing new notifications (re-enable restores `DEFAULT_ALLOWLIST` via
`configureAllowlist`). Both re-run `refreshDetections`:

```ts
import { clearAll as clearCaptured, setAllowlist } from '../../modules/notification-listener';

// "Clear captured data" onPress:
await clearCaptured();
await refreshDetections();

// "Pause capture" onPress (persist a `captureEnabled` flag in prefs so focus
// effect respects it and skips configureAllowlist while paused):
await setAllowlist([]);
await refreshDetections();
```

- [ ] **Step 7: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(mobile): surface notification-detected transactions on Sync screen"
```

---

## Task 12: End-to-end verification on a device

**Files:** none (manual verification + notes).

> No automated test can cover the NotificationListenerService binding; verify on a real Android build.

- [ ] **Step 1: Build a dev client**

Run: `cd mobile && npx expo run:android` (or an EAS dev build) on a device/emulator with Google Play services.

- [ ] **Step 2: Grant access**

Open the Sync screen → tap "Enable notification capture" → toggle Riddhi on in Settings → Notification access → return to the app. `isEnabled()` should now be true (CTA disappears).

- [ ] **Step 3: Trigger a real capture**

Make a small UPI payment (or trigger a bank/Rapido notification). Confirm a row lands in the capture store: temporarily log `getPending()` length, or check the next step.

- [ ] **Step 4: Force an analysis run**

Either wait for a scheduled slot or add a temporary authenticated debug route that calls `runAnalysisForUser(currentUser)` and hit it. Expect: a "New transactions to review" push + the detection appears on the Sync screen with merchant/amount/category and the right SourceTag.

- [ ] **Step 5: Confirm + verify ledger**

Confirm the detection → verify a real transaction now exists in Activity, under the correct Bank & UPI / Cards filter, tagged with the resolved payment source. Re-open Sync → the detection is gone and does not reappear after another upload+analyze cycle (dedup + analyzed flag).

- [ ] **Step 6: Remove any temporary debug route; final commit if code changed**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "chore(mobile): notification-sync e2e verification cleanup"
```

---

## Notes for the implementer

- **Module wiring gotchas:** `NotificationSyncModule` must import `NotificationsModule` (for `NotificationsService`), `TransactionsModule` (for `TransactionsService`), and `TypeOrmModule.forFeature([...])` for `CapturedNotification`, `DetectedTransaction`, `Account`, `UserPreferences`. If `NotificationsService` / `TransactionsService` aren't already exported from their modules, add them to those modules' `exports` arrays.
- **`NotificationType` member:** Task 6 uses `NotificationType.LARGE_TRANSACTION` with `data.screen = 'sync'`. If a more appropriate member exists, use it; the deep-link key is what routes. Ensure the mobile deep-link map (`mobile/src/notifications/deepLink.ts`) routes `screen: 'sync'` to the Sync screen — add it if missing.
- **Allowlist package names** in `DEFAULT_ALLOWLIST` are best-effort; verify the real notification package names on a device (`adb shell dumpsys notification`) and correct them.
- **Android `exported`** on the service: see the note in Task 9 Step 1.
```
