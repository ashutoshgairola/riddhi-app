# Event Budget Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Event Budget Planner persistent end-to-end — a backend `events` module with an expense checklist whose paid items become real transactions, plus the mobile screens/entry-points, a Reports card, and Munshi awareness.

**Architecture:** A NestJS `events` module (entity/controller/service/repository/dto, mirroring `budgets/`) owns the invariant "expense is paid ⟺ a linked account-less transaction exists"; the sync runs server-side in `EventsService` via `TransactionsService`. The mobile app gets an `Events` list + `EventDetail` screen pair (ported from `project/riddhi/MobileEvents.jsx`) backed by a new `api.events` resource, wired into the More menu, FAB, Reports, and the Munshi chat prompt/tools.

**Tech Stack:** Backend — NestJS 11, TypeORM (Postgres, `synchronize: true` in dev), Jest. Mobile — Expo v56 / React Native, TypeScript (verified with `npx tsc --noEmit`; no unit-test runner). Anthropic SDK for Munshi tools.

## Global Constraints

- **Git (from user memory):** commits must NOT include a `Co-Authored-By` trailer; author email is `gairola.ashutosh26@gmail.com`. `docs/` is gitignored — force-add plan/spec files with `git add -f`. Use `git -c user.email=gairola.ashutosh26@gmail.com commit`.
- **Chatbot name is "Munshi"** (bookkeeper persona) — never rename to Riddhi.
- **Money:** amounts are `numeric(18,2)` in the DB with the shared `numericTransformer` (`{ to: v=>v, from: v=>parseFloat(v) }`); ₹ INR, Indian digit grouping in UI.
- **Auth:** every controller is `@UseGuards(JwtAuthGuard)`; the user id comes from `@CurrentUser()` (`{ userId, email }`). All queries are scoped by `userId`; missing rows throw `NotFoundException`.
- **DB schema:** dev auto-syncs via `autoLoadEntities: true` + `synchronize: true` (app.module.ts:37-38). No migration files — registering an entity in a module's `TypeOrmModule.forFeature([...])` is sufficient, exactly as `budgets`/`goals` were added.
- **Paid event transactions are account-less** (`accountId` null, no balance movement).
- **Event delete does NOT cascade to transactions** — `transaction.eventId` uses `onDelete: 'SET NULL'`.
- **Expo:** per `mobile/AGENTS.md`, consult https://docs.expo.dev/versions/v56.0.0/ before writing RN code.
- **Spec:** `docs/superpowers/specs/2026-07-07-event-budget-planner-design.md`.

---

## File Structure

**Backend (new — `backend/src/events/`):**
- `event.entity.ts` — the `event` table.
- `event-expense.entity.ts` — the `event_expense` table.
- `events.totals.ts` — pure `computeEventTotals()` helper (unit-tested in isolation).
- `events.repository.ts` — thin TypeORM data access.
- `events.service.ts` — CRUD, computed totals, and the paid⟷transaction sync.
- `events.service.spec.ts` — unit tests.
- `events.controller.ts` — REST endpoints.
- `events.module.ts` — wiring.
- `dto/` — `create-event.dto.ts`, `update-event.dto.ts`, `create-event-expense.dto.ts`, `update-event-expense.dto.ts`.

**Backend (modified):**
- `transactions/transaction.entity.ts` — add nullable `eventId` column + relation.
- `transactions/dto/create-transaction.dto.ts` — add optional `eventId`.
- `app.module.ts` — register `EventsModule`.
- `ai-chat/prompt.ts` — events snapshot in the dynamic prompt + static-prompt domain line.
- `ai-chat/ai-chat.service.ts` — fetch events into prompt context; add `events` to `ToolCtx.svc`.
- `ai-chat/tools/types.ts` — add `events: EventsService` to `ToolCtx.svc`.
- `ai-chat/tools/events.tools.ts` (new) + `ai-chat/tools/index.ts` — `list_events` tool.
- `ai-chat/ai-chat.module.ts` — import `EventsModule`.

**Mobile (new — `mobile/src/`):**
- `screens/Events.tsx` — event list.
- `screens/EventDetail.tsx` — budget ring + expense checklist.
- `screens/events/CreateEventSheet.tsx` — template picker + basics.
- `screens/events/EventItemSheet.tsx` — expense line-item editor.
- `screens/events/templates.ts` — `EV_TEMPLATES`, `seedFromTemplate`, `EV_CAT_LIST`.

**Mobile (modified):**
- `api/types.ts` — event view/input types.
- `api/adapters.ts` — `toEventView` / `toEventDetailView`.
- `api/index.ts` — `api.events` resource; expose `eventId` on `TxView`.
- `app/navContext.tsx` — `'events'` + `'event-detail'` screen kinds; `nav` data passthrough (already supported).
- `app/screens.tsx` — register the two screens.
- `app/MoreSheet.tsx` — "Events" item.
- `app/FabActions.tsx` — "Plan an event" action.
- `screens/Reports.tsx` — "Event Budgets" card.
- `screens/TxDetail.tsx` — "For <event>" link when `tx.eventId` is set.

---

## Task 1: Event entities + totals helper

**Files:**
- Create: `backend/src/events/event.entity.ts`
- Create: `backend/src/events/event-expense.entity.ts`
- Create: `backend/src/events/events.totals.ts`
- Test: `backend/src/events/events.totals.spec.ts`

**Interfaces:**
- Produces: `Event` entity (`id, userId, name, emoji, color, date: string|null, budget, guests, expenses: EventExpense[]`); `EventExpense` entity (`id, eventId, categoryId, label, planned, actual, paid, transactionId: string|null, sortOrder`); `computeEventTotals(expenses, budget) => { planned, paid, projected, paidCount, count, remaining, over }`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/events/events.totals.spec.ts
import { computeEventTotals } from './events.totals';

const item = (planned: number, actual: number, paid: boolean) =>
  ({ planned, actual, paid }) as any;

describe('computeEventTotals', () => {
  it('sums planned, paid actuals, and projects unpaid at planned', () => {
    const t = computeEventTotals(
      [item(6000, 6000, true), item(2500, 2800, true), item(8000, 0, false)],
      25000,
    );
    expect(t.planned).toBe(16500);
    expect(t.paid).toBe(8800);
    expect(t.projected).toBe(16800); // 8800 paid + 8000 unpaid planned
    expect(t.paidCount).toBe(2);
    expect(t.count).toBe(3);
    expect(t.remaining).toBe(16200); // budget - paid
    expect(t.over).toBe(false);
  });

  it('flags over when projected exceeds budget', () => {
    const t = computeEventTotals([item(30000, 30000, true)], 25000);
    expect(t.over).toBe(true);
  });

  it('handles no expenses', () => {
    const t = computeEventTotals([], 10000);
    expect(t).toEqual({
      planned: 0, paid: 0, projected: 0, paidCount: 0, count: 0,
      remaining: 10000, over: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest events.totals -t computeEventTotals`
Expected: FAIL — `Cannot find module './events.totals'`.

- [ ] **Step 3: Write the entities**

```ts
// backend/src/events/event.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany,
  JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { EventExpense } from './event-expense.entity';

const numericTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
};

@Entity('event')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 16 })
  emoji: string;

  @Column({ type: 'varchar', length: 32 })
  color: string;

  /** YYYY-MM-DD; TypeORM `date` columns round-trip as strings. */
  @Column({ type: 'date', nullable: true })
  date: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: numericTransformer })
  budget: number;

  @Column({ type: 'int', default: 0 })
  guests: number;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => EventExpense, (e) => e.event, { cascade: true })
  expenses: EventExpense[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
```

```ts
// backend/src/events/event-expense.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Event } from './event.entity';
import { TransactionCategory } from '../categories/category.entity';

const numericTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
};

@Entity('event_expense')
export class EventExpense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  eventId: string;

  @ManyToOne(() => Event, (e) => e.expenses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => TransactionCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  category: TransactionCategory;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: numericTransformer })
  planned: number;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: numericTransformer })
  actual: number;

  @Column({ type: 'boolean', default: false })
  paid: boolean;

  /** The linked real transaction while paid; null when unpaid. */
  @Column({ type: 'uuid', nullable: true })
  transactionId: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
```

- [ ] **Step 4: Write the totals helper**

```ts
// backend/src/events/events.totals.ts
export interface EventTotals {
  planned: number;
  paid: number;
  projected: number;
  paidCount: number;
  count: number;
  remaining: number;
  over: boolean;
}

interface TotalsExpense {
  planned: number;
  actual: number;
  paid: boolean;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Mirrors the prototype's evTotals (MobileStore.jsx:106-113). */
export function computeEventTotals(
  expenses: TotalsExpense[],
  budget: number,
): EventTotals {
  const planned = expenses.reduce((s, e) => s + (e.planned || 0), 0);
  const paid = expenses.reduce((s, e) => s + (e.paid ? e.actual || 0 : 0), 0);
  const unpaidPlanned = expenses.reduce(
    (s, e) => s + (!e.paid ? e.planned || 0 : 0), 0,
  );
  const projected = paid + unpaidPlanned;
  return {
    planned: r2(planned),
    paid: r2(paid),
    projected: r2(projected),
    paidCount: expenses.filter((e) => e.paid).length,
    count: expenses.length,
    remaining: r2(budget - paid),
    over: projected > budget,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest events.totals`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add backend/src/events/event.entity.ts backend/src/events/event-expense.entity.ts backend/src/events/events.totals.ts backend/src/events/events.totals.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(events): event entities and totals helper"
```

---

## Task 2: transaction.eventId column + DTO passthrough

**Files:**
- Modify: `backend/src/transactions/transaction.entity.ts` (after the `account`/`destinationAccount` relations, ~line 70)
- Modify: `backend/src/transactions/dto/create-transaction.dto.ts`
- Test: `backend/src/transactions/event-link.spec.ts`

**Interfaces:**
- Consumes: `Event` entity (Task 1).
- Produces: `Transaction.eventId: string | null` persisted; `CreateTransactionDto.eventId?: string` flows through `TransactionsService.create` (it spreads `...dto`).

- [ ] **Step 1: Write the failing test** — a thin unit test that `create()` persists `eventId`. Mock the repository + accounts so no DB is needed.

```ts
// backend/src/transactions/event-link.spec.ts
import { TransactionsService } from './transactions.service';
import { TransactionType } from '../common/enums';

describe('TransactionsService eventId passthrough', () => {
  it('persists eventId from the dto onto the created transaction', async () => {
    const saved: any[] = [];
    const manager = { save: jest.fn(async (tx: any) => { saved.push(tx); return tx; }) };
    const dataSource = {
      createQueryRunner: () => ({
        connect: jest.fn(), startTransaction: jest.fn(),
        commitTransaction: jest.fn(), rollbackTransaction: jest.fn(),
        release: jest.fn(), manager,
      }),
    } as any;
    const repo = { create: (data: any) => data } as any;
    const accounts = {} as any;
    const events = { emit: jest.fn() } as any;
    const svc = new TransactionsService(repo, accounts, dataSource, events);

    await svc.create('user-1', {
      date: '2026-07-07', description: 'Cake', amount: 800,
      type: TransactionType.EXPENSE, categoryId: 'cat-1', eventId: 'ev-1',
    } as any);

    expect(saved[0].eventId).toBe('ev-1');
    expect(saved[0].accountId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest event-link`
Expected: FAIL — `saved[0].eventId` is `undefined` (dto field not declared/allowed) or type error.

- [ ] **Step 3: Add the column + relation to the entity**

Add these imports and members to `transaction.entity.ts`:

```ts
import { Event } from '../events/event.entity';
```

```ts
  /** Set when this expense was logged by ticking an Event Planner item. */
  @Column({ type: 'uuid', nullable: true })
  eventId: string | null;

  @ManyToOne(() => Event, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'eventId' })
  event: Event | null;
```

- [ ] **Step 4: Add the optional DTO field**

In `create-transaction.dto.ts`, after `accountId`:

```ts
  /** Links this transaction to an Event Planner expense (set server-side). */
  @IsOptional()
  @IsUUID()
  eventId?: string;
```

Also update `TransactionsService.create` so an omitted `eventId` is stored as `null` (keeps the entity column explicit). In `transactions.service.ts`, inside the `this.transactionsRepository.create({ ... })` object (~line 111), add:

```ts
        eventId: dto.eventId ?? null,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest event-link`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/transactions/transaction.entity.ts backend/src/transactions/dto/create-transaction.dto.ts backend/src/transactions/transactions.service.ts backend/src/transactions/event-link.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(transactions): nullable eventId link for event expenses"
```

---

## Task 3: Events repository, DTOs, service CRUD + controller

**Files:**
- Create: `backend/src/events/dto/create-event.dto.ts`, `dto/update-event.dto.ts`, `dto/create-event-expense.dto.ts`, `dto/update-event-expense.dto.ts`
- Create: `backend/src/events/events.repository.ts`
- Create: `backend/src/events/events.service.ts`
- Create: `backend/src/events/events.controller.ts`
- Create: `backend/src/events/events.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/events/events.service.spec.ts`

**Interfaces:**
- Consumes: `Event`, `EventExpense` (Task 1); `computeEventTotals` (Task 1); `TransactionsService` (Task 2).
- Produces:
  - `ComputedEvent = Event & EventTotals` (totals flattened onto the event; `expenses` present on `findOne`, omitted/empty on `findAll` cards is fine — include them, they're small).
  - `EventsService.findAll(userId): Promise<ComputedEvent[]>`
  - `EventsService.findOne(id, userId): Promise<ComputedEvent>`
  - `EventsService.create(userId, CreateEventDto): Promise<ComputedEvent>`
  - `EventsService.update(id, userId, UpdateEventDto): Promise<ComputedEvent>`
  - `EventsService.remove(id, userId): Promise<void>`
  - Expense methods added in Task 4.

- [ ] **Step 1: Write the DTOs**

```ts
// backend/src/events/dto/create-event-expense.dto.ts
import { IsString, IsNumber, IsUUID, IsOptional, IsBoolean, IsInt, MaxLength, Min } from 'class-validator';

export class CreateEventExpenseDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  @MaxLength(255)
  label: string;

  @IsNumber()
  @Min(0)
  planned: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actual?: number;

  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
```

```ts
// backend/src/events/dto/update-event-expense.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateEventExpenseDto } from './create-event-expense.dto';

export class UpdateEventExpenseDto extends PartialType(CreateEventExpenseDto) {}
```

```ts
// backend/src/events/dto/create-event.dto.ts
import {
  IsString, IsNumber, IsOptional, IsInt, IsArray, ValidateNested,
  MaxLength, Min, Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateEventExpenseDto } from './create-event-expense.dto';

export class CreateEventDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(16)
  emoji: string;

  @IsString()
  @MaxLength(32)
  color: string;

  /** YYYY-MM-DD or omitted. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsNumber()
  @Min(0)
  budget: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  guests?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEventExpenseDto)
  expenses: CreateEventExpenseDto[];
}
```

```ts
// backend/src/events/dto/update-event.dto.ts
import {
  IsString, IsNumber, IsOptional, IsInt, MaxLength, Min, Matches,
} from 'class-validator';

export class UpdateEventDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(16) emoji?: string;
  @IsOptional() @IsString() @MaxLength(32) color?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsNumber() @Min(0) budget?: number;
  @IsOptional() @IsInt() @Min(0) guests?: number;
}
```

- [ ] **Step 2: Write the repository**

```ts
// backend/src/events/events.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './event.entity';
import { EventExpense } from './event-expense.entity';

@Injectable()
export class EventsRepository {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(EventExpense)
    private readonly expenseRepo: Repository<EventExpense>,
  ) {}

  findAllByUser(userId: string): Promise<Event[]> {
    return this.eventRepo.find({
      where: { userId },
      relations: ['expenses'],
      order: { createdAt: 'DESC' },
    });
  }

  findOneByUser(id: string, userId: string): Promise<Event | null> {
    return this.eventRepo.findOne({
      where: { id, userId },
      relations: ['expenses'],
    });
  }

  create(data: Partial<Event>): Event {
    return this.eventRepo.create(data);
  }

  save(event: Event): Promise<Event> {
    return this.eventRepo.save(event);
  }

  async remove(event: Event): Promise<void> {
    await this.eventRepo.remove(event);
  }

  findExpense(id: string, eventId: string): Promise<EventExpense | null> {
    return this.expenseRepo.findOne({ where: { id, eventId } });
  }

  createExpense(data: Partial<EventExpense>): EventExpense {
    return this.expenseRepo.create(data);
  }

  saveExpense(expense: EventExpense): Promise<EventExpense> {
    return this.expenseRepo.save(expense);
  }

  async removeExpense(expense: EventExpense): Promise<void> {
    await this.expenseRepo.remove(expense);
  }
}
```

- [ ] **Step 3: Write the service (CRUD only; expense/sync methods stubbed in Task 4)**

```ts
// backend/src/events/events.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { EventsRepository } from './events.repository';
import { TransactionsService } from '../transactions/transactions.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { Event } from './event.entity';
import { EventExpense } from './event-expense.entity';
import { computeEventTotals, EventTotals } from './events.totals';

export type ComputedEvent = Event & EventTotals;

@Injectable()
export class EventsService {
  constructor(
    private readonly repo: EventsRepository,
    private readonly transactionsService: TransactionsService,
  ) {}

  private compute(event: Event): ComputedEvent {
    const expenses = event.expenses ?? [];
    const totals = computeEventTotals(expenses, event.budget);
    return Object.assign(event, totals);
  }

  async findAll(userId: string): Promise<ComputedEvent[]> {
    const events = await this.repo.findAllByUser(userId);
    return events.map((e) => this.compute(e));
  }

  async findOne(id: string, userId: string): Promise<ComputedEvent> {
    const event = await this.repo.findOneByUser(id, userId);
    if (!event) throw new NotFoundException('Event not found');
    return this.compute(event);
  }

  async create(userId: string, dto: CreateEventDto): Promise<ComputedEvent> {
    const event = this.repo.create({
      name: dto.name,
      emoji: dto.emoji,
      color: dto.color,
      date: dto.date ?? null,
      budget: dto.budget,
      guests: dto.guests ?? 0,
      userId,
      expenses: dto.expenses.map((e, i) => ({
        categoryId: e.categoryId,
        label: e.label,
        planned: e.planned,
        actual: e.actual ?? 0,
        paid: false, // created events start unticked; ticking is a later PATCH
        transactionId: null,
        sortOrder: e.sortOrder ?? i,
      })) as EventExpense[],
    });
    const saved = await this.repo.save(event);
    return this.findOne(saved.id, userId);
  }

  async update(id: string, userId: string, dto: UpdateEventDto): Promise<ComputedEvent> {
    const event = await this.repo.findOneByUser(id, userId);
    if (!event) throw new NotFoundException('Event not found');
    if (dto.name !== undefined) event.name = dto.name;
    if (dto.emoji !== undefined) event.emoji = dto.emoji;
    if (dto.color !== undefined) event.color = dto.color;
    if (dto.date !== undefined) event.date = dto.date;
    if (dto.budget !== undefined) event.budget = dto.budget;
    if (dto.guests !== undefined) event.guests = dto.guests;
    await this.repo.save(event);
    return this.findOne(id, userId);
  }

  async remove(id: string, userId: string): Promise<void> {
    const event = await this.repo.findOneByUser(id, userId);
    if (!event) throw new NotFoundException('Event not found');
    // transaction.eventId is ON DELETE SET NULL — paid transactions survive.
    await this.repo.remove(event);
  }
}
```

> Note: `create` intentionally forces `paid: false` — a freshly created event's items are unpaid, so no transactions are made at create time. Ticking happens through the expense PATCH in Task 4, which owns the sync. This keeps "paid ⟺ transaction exists" enforced in exactly one code path.

- [ ] **Step 4: Write the controller**

```ts
// backend/src/events/events.controller.ts
import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateEventExpenseDto } from './dto/create-event-expense.dto';
import { UpdateEventExpenseDto } from './dto/update-event-expense.dto';

@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  findAll(@CurrentUser() user: { userId: string }) {
    return this.events.findAll(user.userId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.findOne(id, user.userId);
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateEventDto) {
    return this.events.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.events.update(id, user.userId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.remove(id, user.userId);
  }

  // Expense sub-resource — handlers implemented in Task 4.
  @Post(':id/expenses')
  addExpense(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateEventExpenseDto,
  ) {
    return this.events.addExpense(id, user.userId, dto);
  }

  @Patch(':id/expenses/:expenseId')
  updateExpense(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: UpdateEventExpenseDto,
  ) {
    return this.events.updateExpense(id, expenseId, user.userId, dto);
  }

  @Delete(':id/expenses/:expenseId')
  removeExpense(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
  ) {
    return this.events.removeExpense(id, expenseId, user.userId);
  }
}
```

> The controller references `addExpense`/`updateExpense`/`removeExpense`, which are added to `EventsService` in Task 4. To keep this task compiling on its own, add temporary stubs to the service now and replace them in Task 4:
>
> ```ts
>   addExpense(id: string, userId: string, dto: CreateEventExpenseDto): Promise<ComputedEvent> { throw new Error('implemented in Task 4'); }
>   updateExpense(id: string, expenseId: string, userId: string, dto: UpdateEventExpenseDto): Promise<ComputedEvent> { throw new Error('implemented in Task 4'); }
>   removeExpense(id: string, expenseId: string, userId: string): Promise<ComputedEvent> { throw new Error('implemented in Task 4'); }
> ```
>
> (Add the matching imports for `CreateEventExpenseDto`/`UpdateEventExpenseDto` to the service.)

- [ ] **Step 5: Write the module + register it**

```ts
// backend/src/events/events.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './event.entity';
import { EventExpense } from './event-expense.entity';
import { TransactionCategory } from '../categories/category.entity';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, EventExpense, TransactionCategory]),
    TransactionsModule,
  ],
  controllers: [EventsController],
  providers: [EventsRepository, EventsService],
  exports: [EventsService, TypeOrmModule],
})
export class EventsModule {}
```

In `app.module.ts`: add `import { EventsModule } from './events/events.module';` and add `EventsModule,` to the `imports` array (after `BudgetsModule,`).

- [ ] **Step 6: Write the service CRUD spec**

```ts
// backend/src/events/events.service.spec.ts
import { NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';

function makeRepo(events: any[]) {
  return {
    findAllByUser: jest.fn(async (uid: string) => events.filter((e) => e.userId === uid)),
    findOneByUser: jest.fn(async (id: string, uid: string) =>
      events.find((e) => e.id === id && e.userId === uid) ?? null),
    create: jest.fn((data: any) => ({ id: 'ev-new', ...data })),
    save: jest.fn(async (e: any) => { if (!events.includes(e)) events.push(e); return e; }),
    remove: jest.fn(async (e: any) => { events.splice(events.indexOf(e), 1); }),
  } as any;
}

describe('EventsService CRUD', () => {
  it('findAll flattens computed totals onto each event', async () => {
    const repo = makeRepo([{
      id: 'ev1', userId: 'u1', budget: 25000,
      expenses: [{ planned: 6000, actual: 6000, paid: true }, { planned: 8000, actual: 0, paid: false }],
    }]);
    const svc = new EventsService(repo, {} as any);
    const [e] = await svc.findAll('u1');
    expect(e.paid).toBe(6000);
    expect(e.projected).toBe(14000);
    expect(e.over).toBe(false);
  });

  it('findOne throws when the event is not owned', async () => {
    const repo = makeRepo([]);
    const svc = new EventsService(repo, {} as any);
    await expect(svc.findOne('nope', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create forces new expenses to unpaid', async () => {
    const repo = makeRepo([]);
    repo.findOneByUser.mockImplementation(async (id: string) => ({
      id, userId: 'u1', budget: 100, expenses: [{ planned: 100, actual: 0, paid: false }],
    }));
    const svc = new EventsService(repo, {} as any);
    await svc.create('u1', {
      name: 'X', emoji: '🎉', color: '#fff', budget: 100,
      expenses: [{ categoryId: 'c1', label: 'A', planned: 100, paid: true }],
    } as any);
    const created = repo.create.mock.calls[0][0];
    expect(created.expenses[0].paid).toBe(false);
  });
});
```

- [ ] **Step 7: Run tests**

Run: `cd backend && npx jest events.service`
Expected: PASS (3 tests). Then `npx tsc --noEmit -p backend/tsconfig.json` (or `cd backend && npx tsc --noEmit`) — Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/src/events/ backend/src/app.module.ts
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(events): CRUD service, controller, and module wiring"
```

---

## Task 4: Expense sub-resource + paid⟷transaction sync

**Files:**
- Modify: `backend/src/events/events.service.ts` (replace the three stubs)
- Test: `backend/src/events/events.sync.spec.ts`

**Interfaces:**
- Consumes: `TransactionsService.create(userId, dto)`, `.update(id, userId, patch)`, `.remove(id, userId)` (Task 2); `EventsRepository` expense methods (Task 3).
- Produces:
  - `addExpense(id, userId, CreateEventExpenseDto): Promise<ComputedEvent>` — creates the row; if `paid`, also creates the linked transaction.
  - `updateExpense(id, expenseId, userId, UpdateEventExpenseDto): Promise<ComputedEvent>` — reconciles the linked transaction across the paid state machine.
  - `removeExpense(id, expenseId, userId): Promise<ComputedEvent>` — deletes the linked transaction (if any) then the row.
  - Private `syncTransaction(userId, event, expense, prev): Promise<void>`.

- [ ] **Step 1: Write the sync spec (drives the state machine)**

```ts
// backend/src/events/events.sync.spec.ts
import { EventsService } from './events.service';
import { TransactionType } from '../common/enums';

function harness() {
  const event = { id: 'ev1', userId: 'u1', name: "Aarav's Birthday", budget: 25000, expenses: [] as any[] };
  const repo = {
    findOneByUser: jest.fn(async () => event),
    findExpense: jest.fn(async (id: string) => event.expenses.find((e) => e.id === id) ?? null),
    createExpense: jest.fn((d: any) => ({ id: 'x1', transactionId: null, actual: 0, paid: false, ...d })),
    saveExpense: jest.fn(async (e: any) => { if (!event.expenses.includes(e)) event.expenses.push(e); return e; }),
    removeExpense: jest.fn(async (e: any) => { event.expenses.splice(event.expenses.indexOf(e), 1); }),
  } as any;
  const tx = {
    create: jest.fn(async (_uid: string, dto: any) => ({ id: 'tx1', ...dto })),
    update: jest.fn(async () => ({})),
    remove: jest.fn(async () => undefined),
  } as any;
  return { svc: new EventsService(repo, tx), tx, event };
}

describe('EventsService paid sync', () => {
  it('addExpense(paid) creates an account-less expense transaction tagged to the event', async () => {
    const { svc, tx } = harness();
    await svc.addExpense('ev1', 'u1', { categoryId: 'c1', label: 'Cake', planned: 2500, actual: 2800, paid: true } as any);
    expect(tx.create).toHaveBeenCalledTimes(1);
    const dto = tx.create.mock.calls[0][1];
    expect(dto).toMatchObject({
      description: 'Cake', amount: 2800, type: TransactionType.EXPENSE,
      categoryId: 'c1', eventId: 'ev1', notes: "For Aarav's Birthday",
    });
    expect(dto.accountId).toBeUndefined();
  });

  it('addExpense(paid) with no actual defaults the amount to planned', async () => {
    const { svc, tx } = harness();
    await svc.addExpense('ev1', 'u1', { categoryId: 'c1', label: 'DJ', planned: 2000, paid: true } as any);
    expect(tx.create.mock.calls[0][1].amount).toBe(2000);
  });

  it('unpaid->paid via updateExpense creates the transaction', async () => {
    const { svc, tx, event } = harness();
    event.expenses.push({ id: 'x1', categoryId: 'c1', label: 'Cake', planned: 2500, actual: 0, paid: false, transactionId: null });
    await svc.updateExpense('ev1', 'x1', 'u1', { paid: true, actual: 2800 } as any);
    expect(tx.create).toHaveBeenCalledTimes(1);
    expect(event.expenses[0].transactionId).toBe('tx1');
  });

  it('paid->unpaid deletes the transaction and clears the link', async () => {
    const { svc, tx, event } = harness();
    event.expenses.push({ id: 'x1', categoryId: 'c1', label: 'Cake', planned: 2500, actual: 2800, paid: true, transactionId: 'tx1' });
    await svc.updateExpense('ev1', 'x1', 'u1', { paid: false } as any);
    expect(tx.remove).toHaveBeenCalledWith('tx1', 'u1');
    expect(event.expenses[0].transactionId).toBeNull();
  });

  it('paid->paid amount change updates the transaction', async () => {
    const { svc, tx, event } = harness();
    event.expenses.push({ id: 'x1', categoryId: 'c1', label: 'Cake', planned: 2500, actual: 2800, paid: true, transactionId: 'tx1' });
    await svc.updateExpense('ev1', 'x1', 'u1', { actual: 3000 } as any);
    expect(tx.update).toHaveBeenCalledWith('tx1', 'u1', expect.objectContaining({ amount: 3000 }));
  });

  it('removeExpense deletes the linked transaction first', async () => {
    const { svc, tx, event } = harness();
    event.expenses.push({ id: 'x1', categoryId: 'c1', label: 'Cake', planned: 2500, actual: 2800, paid: true, transactionId: 'tx1' });
    await svc.removeExpense('ev1', 'x1', 'u1');
    expect(tx.remove).toHaveBeenCalledWith('tx1', 'u1');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest events.sync`
Expected: FAIL — the three methods currently `throw new Error('implemented in Task 4')`.

- [ ] **Step 3: Replace the stubs with the real implementation**

Add imports at the top of `events.service.ts`:

```ts
import { TransactionType } from '../common/enums';
```

Replace the three stub methods with:

```ts
  async addExpense(
    id: string,
    userId: string,
    dto: CreateEventExpenseDto,
  ): Promise<ComputedEvent> {
    const event = await this.repo.findOneByUser(id, userId);
    if (!event) throw new NotFoundException('Event not found');

    const paid = dto.paid ?? false;
    const actual = dto.actual ?? (paid ? dto.planned : 0);
    let expense = this.repo.createExpense({
      eventId: id,
      categoryId: dto.categoryId,
      label: dto.label,
      planned: dto.planned,
      actual,
      paid,
      transactionId: null,
      sortOrder: dto.sortOrder ?? (event.expenses?.length ?? 0),
    });
    expense = await this.repo.saveExpense(expense);

    if (paid) {
      const tx = await this.createLinkedTx(userId, event, expense);
      expense.transactionId = tx.id;
      await this.repo.saveExpense(expense);
    }
    return this.findOne(id, userId);
  }

  async updateExpense(
    id: string,
    expenseId: string,
    userId: string,
    dto: UpdateEventExpenseDto,
  ): Promise<ComputedEvent> {
    const event = await this.repo.findOneByUser(id, userId);
    if (!event) throw new NotFoundException('Event not found');
    const expense = await this.repo.findExpense(expenseId, id);
    if (!expense) throw new NotFoundException('Expense not found');

    const wasPaid = expense.paid;

    if (dto.categoryId !== undefined) expense.categoryId = dto.categoryId;
    if (dto.label !== undefined) expense.label = dto.label;
    if (dto.planned !== undefined) expense.planned = dto.planned;
    if (dto.sortOrder !== undefined) expense.sortOrder = dto.sortOrder;
    if (dto.actual !== undefined) expense.actual = dto.actual;
    if (dto.paid !== undefined) expense.paid = dto.paid;

    // Ticking with no actual yet defaults the spend to the planned amount
    // (mirrors the prototype's togglePaid, MobileEvents.jsx:241-242).
    if (!wasPaid && expense.paid && (dto.actual === undefined || !expense.actual)) {
      expense.actual = expense.planned;
    }

    // Reconcile the linked transaction.
    if (!wasPaid && expense.paid) {
      const tx = await this.createLinkedTx(userId, event, expense);
      expense.transactionId = tx.id;
    } else if (wasPaid && !expense.paid) {
      if (expense.transactionId) {
        await this.transactionsService.remove(expense.transactionId, userId);
      }
      expense.transactionId = null;
    } else if (wasPaid && expense.paid && expense.transactionId) {
      await this.transactionsService.update(expense.transactionId, userId, {
        amount: expense.actual,
        categoryId: expense.categoryId,
        description: expense.label,
      } as any);
    }

    await this.repo.saveExpense(expense);
    return this.findOne(id, userId);
  }

  async removeExpense(
    id: string,
    expenseId: string,
    userId: string,
  ): Promise<ComputedEvent> {
    const event = await this.repo.findOneByUser(id, userId);
    if (!event) throw new NotFoundException('Event not found');
    const expense = await this.repo.findExpense(expenseId, id);
    if (!expense) throw new NotFoundException('Expense not found');

    if (expense.transactionId) {
      await this.transactionsService.remove(expense.transactionId, userId);
    }
    await this.repo.removeExpense(expense);
    return this.findOne(id, userId);
  }

  /** Creates the account-less expense transaction that mirrors a paid item. */
  private createLinkedTx(userId: string, event: Event, expense: EventExpense) {
    return this.transactionsService.create(userId, {
      date: new Date().toISOString().slice(0, 10),
      description: expense.label,
      amount: expense.actual,
      type: TransactionType.EXPENSE,
      categoryId: expense.categoryId,
      notes: `For ${event.name}`,
      eventId: event.id,
    } as any);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest events.sync`
Expected: PASS (6 tests). Then `cd backend && npx jest events` — Expected: all events specs pass. Then `cd backend && npx tsc --noEmit` — no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/events/events.service.ts backend/src/events/events.sync.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(events): expense sub-resource with paid->transaction sync"
```

---

## Task 5: Munshi awareness (prompt snapshot + list_events tool)

**Files:**
- Modify: `backend/src/ai-chat/prompt.ts`
- Modify: `backend/src/ai-chat/ai-chat.service.ts`
- Modify: `backend/src/ai-chat/tools/types.ts`
- Create: `backend/src/ai-chat/tools/events.tools.ts`
- Modify: `backend/src/ai-chat/tools/index.ts`
- Modify: `backend/src/ai-chat/ai-chat.module.ts`
- Test: `backend/src/ai-chat/tools/events.tools.spec.ts`

**Interfaces:**
- Consumes: `EventsService.findAll(userId)` → `ComputedEvent[]` (Task 3).
- Produces: `list_events` tool; `ChatPromptContext.events: PromptEventContext[]`; `ToolCtx.svc.events: EventsService`.

- [ ] **Step 1: Write the tool spec**

```ts
// backend/src/ai-chat/tools/events.tools.spec.ts
import { eventTools } from './events.tools';

describe('list_events tool', () => {
  it('returns each event with computed totals', async () => {
    const ctx: any = {
      userId: 'u1',
      svc: {
        events: {
          findAll: jest.fn(async () => [
            { id: 'ev1', name: 'Goa Getaway', emoji: '✈️', budget: 60000,
              planned: 60000, paid: 43900, projected: 60400, over: true,
              paidCount: 3, count: 5 },
          ]),
        },
      },
    };
    const tool = eventTools.find((t) => t.name === 'list_events')!;
    const res = await tool.handler(ctx, {});
    expect((res.data as any[])[0]).toMatchObject({ name: 'Goa Getaway', paid: 43900, over: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest events.tools`
Expected: FAIL — `Cannot find module './events.tools'`.

- [ ] **Step 3: Add `events` to the tool context type**

In `tools/types.ts`, add the import and the field:

```ts
import { EventsService } from '../../events/events.service';
```

Inside `ToolCtx.svc`, add:

```ts
    events: EventsService;
```

- [ ] **Step 4: Write the tool**

```ts
// backend/src/ai-chat/tools/events.tools.ts
import { RiddhiTool, schema } from './types';

interface EventLike {
  id: string; name: string; emoji: string; budget: number;
  planned: number; paid: number; projected: number; over: boolean;
  paidCount: number; count: number;
}

export const eventTools: RiddhiTool[] = [
  {
    name: 'list_events',
    description:
      'Call this when the user asks about their event budgets — a birthday, wedding, trip, or party they are planning — e.g. "how are my event budgets?" or "how much have I spent on the Goa trip?". Returns each event with its budget, planned, paid, projected total, and whether it is over budget.',
    label: 'Checking your events…',
    inputSchema: schema({}),
    risk: 'safe',
    handler: async (ctx) => {
      const events = (await ctx.svc.events.findAll(ctx.userId)) as unknown as EventLike[];
      return {
        data: events.map((e) => ({
          id: e.id, name: e.name, emoji: e.emoji, budget: e.budget,
          planned: e.planned, paid: e.paid, projected: e.projected,
          over: e.over, paidCount: e.paidCount, count: e.count,
        })),
      };
    },
  },
];
```

- [ ] **Step 5: Register the tool**

In `tools/index.ts`: add `import { eventTools } from './events.tools';` and spread `...eventTools,` into the `TOOL_REGISTRY` array (before `.sort(...)`).

- [ ] **Step 6: Wire `EventsService` into the chat service + module**

In `ai-chat.module.ts`: import `EventsModule` and add it to `imports`.

```ts
import { EventsModule } from '../events/events.module';
// ...imports: [ ...existing, EventsModule ]
```

In `ai-chat.service.ts`:
- import and inject `EventsService` in the constructor (add `private readonly eventsService: EventsService,`);
- in `toolCtx()`, add `events: this.eventsService,` to the `svc` object.

- [ ] **Step 7: Add events to the prompt snapshot**

In `prompt.ts`, add the context type + formatter and thread it through:

```ts
export interface PromptEventContext {
  name: string;
  budget: number;
  paid: number;
  projected: number;
  over: boolean;
}
```

Add `events: PromptEventContext[];` to `ChatPromptContext`. Add a formatter:

```ts
function formatEventsSection(events: PromptEventContext[]): string {
  if (events.length === 0) return '- No events planned.';
  return events
    .map((e) => {
      const tail = e.over
        ? ` — projected ${inr(e.projected)}, OVER budget`
        : ` — projected ${inr(e.projected)}`;
      return `- Event "${e.name}": budget ${inr(e.budget)}, paid ${inr(e.paid)}${tail}.`;
    })
    .join('\n');
}
```

In `buildDynamicPrompt`, append after the goals line:

```ts
${formatEventsSection(ctx.events)}
```

In `STATIC_SYSTEM_PROMPT`, change the data-domains sentence to include events:

```
You can read AND change the user's data through your tools: transactions, budgets, goals, accounts, categories, investments, events, and reports.
```

- [ ] **Step 8: Fetch events in `buildPromptContext`**

In `ai-chat.service.ts` `buildPromptContext`, add an events fetch to the `Promise.all` (best-effort like the others) and map it:

```ts
      this.eventsService
        .findAll(userId)
        .catch(() => [] as Awaited<ReturnType<EventsService['findAll']>>),
```

Then build `events: PromptEventContext[]` from the results:

```ts
    const events = eventsRaw.map((e) => ({
      name: e.name, budget: e.budget, paid: e.paid,
      projected: e.projected, over: e.over,
    }));
```

and add `events,` to the returned context object. (Destructure `eventsRaw` from the `Promise.all` tuple.)

- [ ] **Step 9: Run tests + typecheck**

Run: `cd backend && npx jest events.tools ai-chat`
Expected: PASS. Then `cd backend && npx tsc --noEmit` — no errors. Then `cd backend && npx jest` — full suite green.

- [ ] **Step 10: Commit**

```bash
git add backend/src/ai-chat/
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(munshi): event-budget awareness via snapshot and list_events tool"
```

---

## Task 6: Mobile API layer — types, adapters, `api.events`

**Files:**
- Modify: `mobile/src/api/types.ts`
- Modify: `mobile/src/api/adapters.ts`
- Modify: `mobile/src/api/index.ts`

**Interfaces:**
- Consumes: backend `GET/POST/PATCH/DELETE /events` + `/events/:id/expenses` (Tasks 3-4); existing `resolveCategoryId`, `apiClient`, `bumpData`.
- Produces:
  - `ApiEvent`, `ApiEventExpense` (raw server shapes) in types.ts.
  - `EventView` (`{ id, name, emoji, color, date, budget, guests, planned, paid, projected, over, paidCount, count, remaining }`), `EventExpenseView` (`{ id, categoryId, categoryName, icon, color, label, planned, actual, paid }`), `EventDetailView` (`EventView & { expenses: EventExpenseView[] }`).
  - `NewEventInput` (`{ name, emoji, color, date?, budget, guests?, expenses: NewEventExpenseInput[] }`), `NewEventExpenseInput` (`{ categoryName, label, planned, actual?, paid? }`).
  - `toEventView(e)`, `toEventDetailView(e, catMap)` in adapters.ts.
  - `api.events` resource in index.ts with `list/get/create/update/remove/addExpense/updateExpense/removeExpense`.
  - `TxView.eventId?: string | null` populated by `toTxView`.

- [ ] **Step 1: Add the raw + view + input types**

In `types.ts`, add (near the other `Api*`/`*View` blocks):

```ts
export interface ApiEventExpense {
  id: string;
  categoryId: string;
  label: string;
  planned: number;
  actual: number;
  paid: boolean;
  transactionId: string | null;
  sortOrder: number;
}

export interface ApiEvent {
  id: string;
  name: string;
  emoji: string;
  color: string;
  date: string | null;
  budget: number;
  guests: number;
  planned: number;
  paid: number;
  projected: number;
  paidCount: number;
  count: number;
  remaining: number;
  over: boolean;
  expenses?: ApiEventExpense[];
}

export interface EventExpenseView {
  id: string;
  categoryId: string;
  categoryName: string;
  icon: string;
  color: string;
  label: string;
  planned: number;
  actual: number;
  paid: boolean;
}

export interface EventView {
  id: string;
  name: string;
  emoji: string;
  color: string;
  date: string | null;
  budget: number;
  guests: number;
  planned: number;
  paid: number;
  projected: number;
  over: boolean;
  paidCount: number;
  count: number;
  remaining: number;
}

export interface EventDetailView extends EventView {
  expenses: EventExpenseView[];
}

export interface NewEventExpenseInput {
  categoryName: string;
  label: string;
  planned: number;
  actual?: number;
  paid?: boolean;
}

export interface NewEventInput {
  name: string;
  emoji: string;
  color: string;
  date?: string;
  budget: number;
  guests?: number;
  expenses: NewEventExpenseInput[];
}
```

Also add `eventId?: string | null;` to the existing `TxView` interface.

- [ ] **Step 2: Add the adapters**

In `adapters.ts` (mirroring `toBudgetCategoryView`), add. Reuse the same fallback slice palette pattern already in `index.ts`; here derive icon/color from the category record when present:

```ts
import type { ApiEvent, ApiCategory, EventView, EventDetailView, EventExpenseView } from './types';

export function toEventView(e: ApiEvent): EventView {
  return {
    id: e.id, name: e.name, emoji: e.emoji, color: e.color, date: e.date,
    budget: e.budget, guests: e.guests, planned: e.planned, paid: e.paid,
    projected: e.projected, over: e.over, paidCount: e.paidCount,
    count: e.count, remaining: e.remaining,
  };
}

export function toEventDetailView(
  e: ApiEvent,
  catMap: Map<string, ApiCategory>,
): EventDetailView {
  const expenses: EventExpenseView[] = (e.expenses ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((x) => {
      const cat = catMap.get(x.categoryId);
      return {
        id: x.id,
        categoryId: x.categoryId,
        categoryName: cat?.name ?? 'Other',
        icon: cat?.icon ?? '🏷',
        color: cat?.color ?? '#8197c4',
        label: x.label,
        planned: x.planned,
        actual: x.actual,
        paid: x.paid,
      };
    });
  return { ...toEventView(e), expenses };
}
```

In `adapters.ts` `toTxView`, add `eventId: tx.eventId ?? null,` to the returned object (the `ApiTransaction` type already carries arbitrary server fields; add `eventId?: string | null` to `ApiTransaction` in types.ts if it is a strict interface).

- [ ] **Step 3: Add the `api.events` resource**

In `index.ts`, import the new types + adapters, then add this resource object (place after `budgets`):

```ts
  events: {
    async list(): Promise<EventView[]> {
      const raw = await apiClient.get<ApiEvent[]>('/events');
      return raw.map(toEventView);
    },

    async get(id: string): Promise<EventDetailView> {
      const [raw, catMap] = await Promise.all([
        apiClient.get<ApiEvent>(`/events/${id}`),
        fetchCategoryMap(),
      ]);
      return toEventDetailView(raw, catMap);
    },

    async create(input: NewEventInput): Promise<EventView> {
      // Resolve each expense's category label -> id (creating if missing),
      // exactly as budgets/transactions do.
      const expenses = await Promise.all(
        input.expenses.map(async (x) => ({
          categoryId: await resolveCategoryId(x.categoryName),
          label: x.label,
          planned: x.planned,
          actual: x.actual ?? 0,
          paid: false, // create starts unticked; ticking is a later PATCH
        })),
      );
      const created = await apiClient.post<ApiEvent>('/events', {
        name: input.name, emoji: input.emoji, color: input.color,
        date: input.date, budget: input.budget, guests: input.guests ?? 0,
        expenses,
      });
      bumpData();
      return toEventView(created);
    },

    async update(id: string, patch: Partial<Pick<NewEventInput, 'name' | 'emoji' | 'color' | 'date' | 'budget' | 'guests'>>): Promise<void> {
      await apiClient.patch(`/events/${id}`, patch);
      bumpData();
    },

    async remove(id: string): Promise<void> {
      await apiClient.delete(`/events/${id}`);
      bumpData();
    },

    async addExpense(id: string, input: NewEventExpenseInput): Promise<void> {
      await apiClient.post(`/events/${id}/expenses`, {
        categoryId: await resolveCategoryId(input.categoryName),
        label: input.label,
        planned: input.planned,
        actual: input.actual,
        paid: input.paid ?? false,
      });
      bumpData();
    },

    async updateExpense(
      id: string,
      expenseId: string,
      patch: { categoryName?: string; label?: string; planned?: number; actual?: number; paid?: boolean },
    ): Promise<void> {
      const body: Record<string, unknown> = {};
      if (patch.categoryName !== undefined) body['categoryId'] = await resolveCategoryId(patch.categoryName);
      if (patch.label !== undefined) body['label'] = patch.label;
      if (patch.planned !== undefined) body['planned'] = patch.planned;
      if (patch.actual !== undefined) body['actual'] = patch.actual;
      if (patch.paid !== undefined) body['paid'] = patch.paid;
      await apiClient.patch(`/events/${id}/expenses/${expenseId}`, body);
      bumpData();
    },

    async removeExpense(id: string, expenseId: string): Promise<void> {
      await apiClient.delete(`/events/${id}/expenses/${expenseId}`);
      bumpData();
    },
  },
```

Add the new type names to the top-of-file `import type { ... } from './types'` block and `toEventView, toEventDetailView` to the adapters import block.

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/api/types.ts mobile/src/api/adapters.ts mobile/src/api/index.ts
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): api.events resource, views, and adapters"
```

---

## Task 7: Navigation wiring + templates

**Files:**
- Modify: `mobile/src/app/navContext.tsx` (the `ScreenKind` union, ~lines 24-40)
- Create: `mobile/src/screens/events/templates.ts`

**Interfaces:**
- Produces: `ScreenKind` gains `'events' | 'event-detail'`; `EV_TEMPLATES`, `seedFromTemplate(t)`, `EV_CAT_LIST` for the create sheet.

- [ ] **Step 1: Extend the ScreenKind union**

In `navContext.tsx`, add `| 'events'` and `| 'event-detail'` to the `ScreenKind` union (after `'search'`/`'tx-detail'`). No other nav changes are needed: `nav('event-detail', { id })` already pushes with data, and `nav('events', { autoCreate: true })` already resets/pushes with data.

- [ ] **Step 2: Port the templates (verbatim from `project/riddhi/MobileStore.jsx:22,41-60`)**

```ts
// mobile/src/screens/events/templates.ts
// Ported from project/riddhi/MobileStore.jsx:22 (EV_CAT_LIST), 41-60 (templates).

/** Categories offered for event line-items (expense side only). */
export const EV_CAT_LIST = [
  'Food & Dining', 'Entertainment', 'Shopping', 'Transport',
  'Housing', 'Utilities', 'Healthcare', 'Education', 'Other',
];

export interface TemplateItem {
  categoryName: string;
  label: string;
  planned: number;
}

export interface EventTemplate {
  key: string;
  name: string;
  emoji: string;
  color: string;
  budget: number;
  items: TemplateItem[];
}

const item = (categoryName: string, label: string, planned: number): TemplateItem => ({ categoryName, label, planned });

export const EV_TEMPLATES: EventTemplate[] = [
  { key: 'birthday', name: 'Birthday Party', emoji: '🎂', color: '#c97d8c', budget: 25000, items: [
    item('Entertainment', 'Venue / play zone', 6000), item('Food & Dining', 'Custom cake', 2500),
    item('Food & Dining', 'Catering / snacks', 8000), item('Shopping', 'Balloons & decor', 3000),
    item('Shopping', 'Return gifts', 2500), item('Entertainment', 'DJ / music', 2000),
    item('Shopping', 'Invites & printing', 1000),
  ] },
  { key: 'wedding', name: 'Wedding', emoji: '💍', color: '#c9a86a', budget: 800000, items: [
    item('Entertainment', 'Banquet hall', 250000), item('Food & Dining', 'Catering', 300000),
    item('Entertainment', 'Photo & video', 120000), item('Shopping', 'Outfits & jewellery', 90000),
    item('Shopping', 'Stage & flowers', 80000), item('Entertainment', 'Band / DJ', 40000),
  ] },
  { key: 'trip', name: 'Trip / Vacation', emoji: '✈️', color: '#6fb3ad', budget: 60000, items: [
    item('Transport', 'Flights / train', 22000), item('Housing', 'Hotel stay', 18000),
    item('Food & Dining', 'Meals', 9000), item('Entertainment', 'Tours & tickets', 7000),
    item('Shopping', 'Shopping & misc', 4000),
  ] },
  { key: 'houseparty', name: 'House Party', emoji: '🎉', color: '#9d8bd6', budget: 12000, items: [
    item('Food & Dining', 'Drinks & beverages', 4000), item('Food & Dining', 'Snacks & food', 5000),
    item('Entertainment', 'Music / speaker', 1000), item('Shopping', 'Lights & props', 1500),
    item('Other', 'Supplies', 500),
  ] },
  { key: 'custom', name: 'Custom Event', emoji: '✨', color: '#b6a4f3', budget: 20000, items: [] },
];

export const CUSTOM_EMOJIS = ['✨', '🥳', '🎊', '🎄', '🏡', '🎓', '🍾', '🏆', '🎃', '⚽', '🎸', '🐣'];

/** Builds a NewEventInput-shaped seed from a template (labels, not ids). */
export function seedFromTemplate(t: EventTemplate) {
  return {
    name: t.name,
    emoji: t.emoji,
    color: t.color,
    budget: t.budget,
    guests: 0,
    expenses: t.items.map((i) => ({ categoryName: i.categoryName, label: i.label, planned: i.planned })),
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/app/navContext.tsx mobile/src/screens/events/templates.ts
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): events screen kinds and templates"
```

---

## Task 8: EventItemSheet + CreateEventSheet

**Files:**
- Create: `mobile/src/screens/events/EventItemSheet.tsx`
- Create: `mobile/src/screens/events/CreateEventSheet.tsx`

**Reference:** Port from `project/riddhi/MobileEvents.jsx:10-114` (`EventItemSheet`) and `:119-218` (`CreateEventSheet`). Build them as RN components following the existing rich-sheet pattern in `mobile/src/app/AddTxSheet.tsx` (custom `BottomSheet` body with the app's inputs, chips, and buttons — NOT the generic `useFeedback().form()`). Reuse `BottomSheet` (`mobile/src/components/BottomSheet.tsx`), the input/button/label primitives from `mobile/src/components/ui.tsx` and `FormSheet.tsx`, `useTheme`, and `tokens`.

**Interfaces:**
- Consumes: `EV_CAT_LIST`, `EV_TEMPLATES`, `CUSTOM_EMOJIS`, `seedFromTemplate` (Task 7); `NewEventInput`, `EventExpenseView`, `NewEventExpenseInput` (Task 6).
- Produces:
  - `EventItemSheet({ open, onClose, item, onSave, onDelete })` where `item?: EventExpenseView`; `onSave(patch: { categoryName; label; planned; actual; paid })`; `onDelete()`.
  - `CreateEventSheet({ open, onClose, onCreate })` where `onCreate(input: NewEventInput)`.

- [ ] **Step 1: Build `EventItemSheet`**

Port `MobileEvents.jsx:10-114`. State: `cat` (category name), `label`, `planned` (numeric string), `actual` (numeric string), `paid` (bool). On open, seed from `item` (or defaults: `cat='Food & Dining'`, empty). Category chips row from `EV_CAT_LIST` (resolve icon/color from the app's category metadata — reuse whatever `TxCategories`/`AddTxSheet` uses for category glyphs; fall back to a neutral chip). "Mark as paid" toggle with the sub-label `Logs a real transaction under {cat}`. Save builds `{ categoryName: cat, label: label.trim() || cat, planned: Number(planned)||0, actual: actual===''? (paid? planned:0) : Number(actual), paid }` and calls `onSave`. Show "Remove expense" only when editing.

Key composition (abridged — match the AddTxSheet structure for inputs/spacing):

```tsx
// mobile/src/screens/events/EventItemSheet.tsx
import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { BottomSheet } from '../../components/BottomSheet';
import { EV_CAT_LIST } from './templates';
import type { EventExpenseView, NewEventExpenseInput } from '../../api/types';
// + useTheme, tokens, and the shared input/button primitives used by AddTxSheet

export interface EventItemSaved extends NewEventExpenseInput { actual: number }

export function EventItemSheet({ open, onClose, item, onSave, onDelete }: {
  open: boolean;
  onClose: () => void;
  item?: EventExpenseView | null;
  onSave: (patch: EventItemSaved) => void;
  onDelete?: () => void;
}) {
  const [cat, setCat] = useState('Food & Dining');
  const [label, setLabel] = useState('');
  const [planned, setPlanned] = useState('');
  const [actual, setActual] = useState('');
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCat(item?.categoryName ?? 'Food & Dining');
    setLabel(item?.label ?? '');
    setPlanned(item ? String(item.planned || '') : '');
    setActual(item && item.actual ? String(item.actual) : '');
    setPaid(item?.paid ?? false);
  }, [open, item]);

  const save = () => {
    const p = Number(planned) || 0;
    const a = actual === '' ? (paid ? p : 0) : Number(actual);
    if (!label.trim() && p === 0) { onClose(); return; }
    onSave({ categoryName: cat, label: label.trim() || cat, planned: p, actual: a, paid });
    onClose();
  };

  // ...render: category chips (EV_CAT_LIST), label input, planned+actual inputs,
  // mark-as-paid toggle ("Logs a real transaction under {cat}"), Save button,
  // and a red "Remove expense" button when `item` is set (calls onDelete()).
  return (
    <BottomSheet open={open} onClose={onClose} title={item ? 'Edit expense' : 'Add expense'}>
      {/* body per MobileEvents.jsx:37-111 */}
    </BottomSheet>
  );
}
```

- [ ] **Step 2: Build `CreateEventSheet`**

Port `MobileEvents.jsx:119-218`. State: `tpl` (template key), `name`, `date` (YYYY-MM-DD via the app's themed date field — reuse the date picker used by `useFeedback().form()`'s `kind:'date'`, i.e. `mobile/src/components/CalendarPicker.tsx`), `budget`, `emoji`. Template grid (2-col) from `EV_TEMPLATES`; selecting a template sets `budget` to its suggested value; `custom` reveals the `CUSTOM_EMOJIS` picker. On create: `const seed = seedFromTemplate(template); onCreate({ ...seed, name: name.trim() || template.name, date: date || undefined, budget: Number(budget) || template.budget, emoji: isCustom ? emoji : template.emoji })`.

```tsx
// mobile/src/screens/events/CreateEventSheet.tsx
// State + create() per MobileEvents.jsx:121-148; render per :151-217.
// Uses EV_TEMPLATES, CUSTOM_EMOJIS, seedFromTemplate from ./templates.
// onCreate: (input: NewEventInput) => void
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/events/EventItemSheet.tsx mobile/src/screens/events/CreateEventSheet.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): event create + line-item sheets"
```

---

## Task 9: EventDetail screen

**Files:**
- Create: `mobile/src/screens/EventDetail.tsx`

**Reference:** Port from `project/riddhi/MobileEvents.jsx:223-389` (`EventDetail`). Use `MPageShell`-style scaffold via `PageBackground` + `Topbar` (this screen needs a scrollable body with a back + more button — follow `AccountDetail.tsx` for the pushed-screen shape). Reuse `GlassView`/`GlassCard`, `ProgressBar`, `useTheme`, `tokens`, `useFeedback`, `useNav`, `SpringIn`.

**Interfaces:**
- Consumes: `api.events.get/updateExpense/addExpense/removeExpense/remove` (Task 6); `EventItemSheet` (Task 8); `useApiData`; `useNav().pop/nav`.
- Produces: `EventDetail({ entry })` where `entry.data = { id }`.

- [ ] **Step 1: Build the screen**

Structure (per prototype):
- `const { id } = entry.data; const { data: ev } = useApiData(() => api.events.get(id), null-ish fallback, [id]);` — guard render until loaded.
- Hero card: budget ring (SVG via `react-native-svg`, already a dep — confirm in package.json; `AccountDetail`/charts use it) showing `pct = round(paid/budget*100)`, event emoji, ring color = `over ? red : pct>=85 ? amber : ev.color`.
- Stats row: `Planned` / `Paid` / `Left|Over by` using `ev.planned`, `ev.paid`, `over ? projected-budget : budget-paid`.
- Over-budget warning banner when `ev.over`.
- Expenses checklist: each `EventExpenseView` row — checkbox toggles paid via `api.events.updateExpense(id, x.id, { paid: !x.paid })`; tapping the row opens `EventItemSheet` for edit; amount shows `actual` (paid) or `planned`, with strike-through delta.
- "Add expense" button opens `EventItemSheet` with no item; on save → `api.events.addExpense(id, patch)` (or `updateExpense` when editing an existing row).
- More button (`useFeedback().sheet`): Add expense; View in Activity (`nav('txns')`); Ask Munshi (`nav('chat')`); Delete event (`api.events.remove(id)` then `pop()`).
- Honor `entry.data.autoAddExpense` (optional) to open the add sheet on mount (used by nothing yet; harmless).

Money formatting: port `evFmt`/`evFmtK` (MobileStore.jsx:31-32) into a small local helper or a shared `mobile/src/lib/money.ts` if one exists — check first; if not, inline them here.

```tsx
// mobile/src/screens/EventDetail.tsx
import { api } from '../api';
import { useApiData } from '../api/useApi';
import { EventItemSheet } from './events/EventItemSheet';
import { useNav, type ScreenEntry } from '../app/navContext';
// ...
export function EventDetail({ entry }: { entry: ScreenEntry }) {
  const { id } = entry.data as { id: string };
  const { pop, nav } = useNav();
  const { data: ev } = useApiData(() => api.events.get(id), null as any, [id]);
  // ...render per MobileEvents.jsx:257-388, wiring each mutation to api.events.*
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/EventDetail.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): event detail screen with budget ring and checklist"
```

---

## Task 10: Events list screen + registry

**Files:**
- Create: `mobile/src/screens/Events.tsx`
- Modify: `mobile/src/app/screens.tsx`

**Reference:** Port from `project/riddhi/MobileEvents.jsx:394-483` (`MobileEvents` list). Follow `Goals.tsx` for the list-of-progress-cards shape.

**Interfaces:**
- Consumes: `api.events.list` (Task 6); `CreateEventSheet` (Task 8); `useNav`; `useApiData`.
- Produces: `Events({ entry })` — `entry.data?.autoCreate` opens the create sheet on mount.

- [ ] **Step 1: Build the list screen**

- Subtitle: `${events.length} event(s) · ${evFmtK(totalPaid)} spent of ${evFmtK(totalBudget)} planned`.
- Empty state card ("Plan your first event") with a "New event" button.
- Each event card: accent bar (`ev.color`), emoji, name, `🗓 date` + `paidCount/count paid`, progress bar (`min(pct,100)%`, color = over→red / ≥85→amber / ev.color), `paid / budget` and `left | over by`. Tap → `nav('event-detail', { id: ev.id })`.
- Header `＋` and empty-state button open `CreateEventSheet`. On create → `api.events.create(input)` then `nav('event-detail', { id: created.id })`.
- `useEffect` on mount: if `entry.data?.autoCreate`, open the create sheet.

```tsx
// mobile/src/screens/Events.tsx
export function Events({ entry }: { entry: ScreenEntry }) {
  const { nav } = useNav();
  const { data: events } = useApiData(() => api.events.list(), [] as EventView[]);
  const [createOpen, setCreateOpen] = useState(Boolean(entry.data?.autoCreate));
  // ...render per MobileEvents.jsx:415-482; CreateEventSheet at the bottom.
}
```

- [ ] **Step 2: Register both screens**

In `app/screens.tsx`: import `Events` and `EventDetail`, add to `SCREEN_REGISTRY`:

```ts
  events: Events,
  'event-detail': EventDetail,
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/Events.tsx mobile/src/app/screens.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): events list screen and registry"
```

---

## Task 11: Entry points — More menu + FAB "Plan an event"

**Files:**
- Modify: `mobile/src/app/MoreSheet.tsx`
- Modify: `mobile/src/app/FabActions.tsx`

**Interfaces:**
- Consumes: `nav('events')`, `nav('events', { autoCreate: true })` (Task 7/10).

- [ ] **Step 1: Add the More menu item**

In `MoreSheet.tsx`, add to the `ITEMS` array (choose a placement; e.g. after `goals`):

```ts
  { id: 'events', l: 'Events', i: '🎉', c: '#c97d8c', d: 'Plan birthdays, trips & more' },
```

(`id: 'events'` is now a valid `ScreenKind`; `handlePress` already calls `nav(id)`.)

- [ ] **Step 2: Add the FAB action**

In `FabActions.tsx`:
- Extend the `FabAction` interface: `action?: 'chat' | 'plan-event';`.
- Add a 5th entry to `FAB_ACTIONS` (place first or last — last keeps existing order):

```ts
  { label: 'Plan an event', desc: 'Budget a party or trip', icon: '🎉', colorToken: 'violet', action: 'plan-event' },
```

- In `handlePress`, branch on the new action:

```ts
  const handlePress = () => {
    if (item.action === 'chat') { nav('chat'); setFabOpen(false); }
    else if (item.action === 'plan-event') { nav('events', { autoCreate: true }); setFabOpen(false); }
    else { openAdd(); }
  };
```

Note the Android speed-dial vertical offsets (`androidActionBottom(i)` / `bottom: 100 + index*64`) already index by position, so a 5th card stacks correctly with no further change.

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/app/MoreSheet.tsx mobile/src/app/FabActions.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): Events entry points in More menu and FAB"
```

---

## Task 12: Reports "Event Budgets" card + Activity link

**Files:**
- Modify: `mobile/src/screens/Reports.tsx`
- Modify: `mobile/src/screens/TxDetail.tsx`

**Interfaces:**
- Consumes: `api.events.list` (Task 6); `TxView.eventId` (Task 6); `nav('event-detail', { id })`.

- [ ] **Step 1: Add the Reports card**

In `Reports.tsx`, fetch events (`const { data: events } = useApiData(() => api.events.list(), [] as EventView[]);`) and render an "Event Budgets" section — a card listing each event with emoji, name, a small progress bar (`min(round(paid/budget*100),100)`), `paid / budget`, and over/under text. Each row `onPress` → `nav('event-detail', { id: ev.id })`. Hide the whole section when `events.length === 0`. Match the existing Reports card styling (reuse the section header + `GlassCard` already in that file).

- [ ] **Step 2: Add the Activity → event link**

In `TxDetail.tsx`, when the transaction's `eventId` is set, render a tappable "For <event>" row that navigates to `nav('event-detail', { id: tx.eventId })`. The event name isn't on the tx payload; show a generic label ("View event") or fetch the event name via `api.events.get(tx.eventId)` if the screen already does async lookups — otherwise a static "View event budget" link is acceptable and keeps the task self-contained.

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/Reports.tsx mobile/src/screens/TxDetail.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): Reports event-budgets card and Activity->event link"
```

---

## Task 13: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Backend suite + typecheck**

Run: `cd backend && npx jest && npx tsc --noEmit`
Expected: all specs pass; no type errors.

- [ ] **Step 2: Mobile typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the app against the backend and exercise the flow**

Use the `run` skill (or `cd mobile && npx expo start`) with the backend running. Verify manually:
1. More → Events (and FAB → "Plan an event") both open the Events screen / create sheet.
2. Create an event from the Birthday template → it persists (reload the app; it's still there).
3. Open the event, tick an expense paid → it appears in Activity tagged "For <event>", the ring/Paid/Left update, and the over-budget banner appears when projected exceeds budget.
4. Un-tick it → the Activity transaction disappears.
5. Reports shows the Event Budgets card; tapping a row opens the event.
6. In Chat, ask Munshi "how are my event budgets?" → it answers from live data.

- [ ] **Step 4: Final commit (if any verification fixups were needed)**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "fix(events): verification fixups"
```

---

## Self-Review Notes (author)

- **Spec coverage:** persistence (Tasks 1-4, 6-10); paid⟷tx sync incl. un-tick removal (Task 4); account-less + no-cascade constraints (Tasks 2, 4); categories via `resolveCategoryId` (Task 6); More + FAB entry points (Task 11); Reports card + Activity link (Task 12); Munshi snapshot + `list_events` (Task 5). All spec sections map to a task.
- **Type consistency:** `EventView`/`EventDetailView`/`EventExpenseView`/`NewEventInput` are defined once (Task 6) and consumed by Tasks 8-12; `ComputedEvent`/`EventTotals`/`computeEventTotals` defined in Tasks 1/3 and reused in 4-5; `list_events`/`ToolCtx.svc.events` defined in Task 5.
- **Deferred/graceful:** Munshi event *write* tools are out of scope (spec §2). The date field uses the app's themed picker (a deliberate improvement over the prototype's free-text; spec §4 allows `date` nullable) — see Task 8 Step 2.
```
