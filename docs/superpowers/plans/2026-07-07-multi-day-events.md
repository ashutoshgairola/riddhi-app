# Multi-day Events + Per-day Expense Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an event span multiple days (start + end date), group its expenses by day with per-day subtotals, and let the user drag an expense to move it to another day.

**Architecture:** Backend adds `multiDay`/`endDate` to `event` and a nullable `dayDate` to `event_expense`; `EventsService` validates the range and keeps `dayDate` in-range; a new tested `computeDayGroups` helper produces ordered per-day rollups exposed on the event-detail response. Mobile passes the new fields through the adapter, adds a multi-day toggle + start/end pickers to create, a range-restricted Day selector to the item sheet, day-sectioned rendering to `EventDetail`, and a hand-rolled long-press drag that reassigns `dayDate`.

**Tech Stack:** NestJS + TypeORM (Postgres, `synchronize:true` dev auto-sync — no migration files), Jest (backend). Expo SDK 56 / React Native, `react-native-gesture-handler` ~2.31, `react-native-reanimated` 4.3 (mobile). Spec: `docs/superpowers/specs/2026-07-07-multi-day-events-design.md`.

## Global Constraints

- **Expo SDK 56** — before writing any mobile code, read the versioned docs at `https://docs.expo.dev/versions/v56.0.0/` (per `mobile/AGENTS.md`).
- **No new dependencies** — the drag interaction is hand-rolled on the existing gesture-handler + reanimated stack.
- **Dates are `YYYY-MM-DD` strings, parsed as *local* dates** (mirror the existing `parseYMD` in `CreateEventSheet.tsx`) — never `new Date(ymd)` (that parses as UTC and can shift the day).
- **No DB migration files** — dev schema auto-syncs; new columns must be nullable or defaulted so existing rows need no backfill.
- **`dayDate` is planning metadata only** — it is never copied to the linked transaction; the paid⟷transaction sync is untouched.
- **Commit style:** no `Co-Authored-By` trailer; docs under `docs/` are force-added (`git add -f`) as they are gitignored.
- Run backend tests from `backend/` with `npx jest <path>`; run backend typecheck with `npx tsc --noEmit`. Run mobile typecheck from `mobile/` with `npx tsc --noEmit`.

---

## File Structure

**Backend (`backend/src/events/`)**
- `event.entity.ts` — MODIFY: add `multiDay`, `endDate` columns.
- `event-expense.entity.ts` — MODIFY: add `dayDate` column.
- `dto/create-event.dto.ts` — MODIFY: add `multiDay`, `endDate`.
- `dto/update-event.dto.ts` — MODIFY: add `multiDay`, `endDate`.
- `dto/create-event-expense.dto.ts` — MODIFY: add `dayDate`.
- `events.totals.ts` — MODIFY: add `EventDayGroup` + `computeDayGroups`.
- `events.totals.spec.ts` — MODIFY: tests for `computeDayGroups`.
- `events.service.ts` — MODIFY: range validation, `dayDate` handling, cleanup, expose `dayGroups`.
- `events.service.spec.ts` — MODIFY: validation + cleanup tests.
- `backend/src/ai-chat/tools/events.tools.ts` — MODIFY: surface `multiDay`/date range.

**Mobile (`mobile/src/`)**
- `components/CalendarRangePicker.tsx` — CREATE: range-selecting sibling of `CalendarPicker`, same look.
- `api/types.ts` — MODIFY: `ApiEvent`, `ApiEventExpense`, `EventView`, `EventDetailView`, `EventExpenseView`, `EventDayGroup`, `NewEventInput`, `NewEventExpenseInput`.
- `api/adapters.ts` — MODIFY: `toEventView`, `toEventDetailView` pass-through + `dayGroups`.
- `api/adapters.events.spec.ts` — CREATE: adapter test.
- `api/index.ts` — MODIFY: `events.create/update/addExpense/updateExpense` pass new fields.
- `screens/events/eventDates.ts` — CREATE: shared date helpers (`parseYMD`, `toYMD`, `eachDayYMD`, `formatDayShort`, `formatRange`).
- `screens/events/CreateEventSheet.tsx` — MODIFY: multi-day toggle + start/end pickers.
- `screens/events/EventItemSheet.tsx` — MODIFY: Day selector.
- `screens/events/EventDetail.tsx` — MODIFY: day-sectioned rendering + range chip.
- `screens/events/ExpenseDragList.tsx` — CREATE: hand-rolled drag-to-move day-sectioned list.

---

## Task 1: Backend — schema + DTO fields

**Files:**
- Modify: `backend/src/events/event.entity.ts`
- Modify: `backend/src/events/event-expense.entity.ts`
- Modify: `backend/src/events/dto/create-event.dto.ts`
- Modify: `backend/src/events/dto/update-event.dto.ts`
- Modify: `backend/src/events/dto/create-event-expense.dto.ts`

**Interfaces:**
- Produces: `Event.multiDay: boolean`, `Event.endDate: string | null`, `EventExpense.dayDate: string | null`. DTO fields `CreateEventDto.multiDay?/endDate?`, `UpdateEventDto.multiDay?/endDate?`, `CreateEventExpenseDto.dayDate?: string | null` (validated `YYYY-MM-DD` or null). `UpdateEventExpenseDto` inherits `dayDate` via `PartialType(CreateEventExpenseDto)` — no edit needed there.

- [ ] **Step 1: Add columns to the event entity**

In `event.entity.ts`, after the `date` column (line ~29) add:

```ts
  @Column({ type: 'boolean', default: false })
  multiDay: boolean;

  /** YYYY-MM-DD end date; null for single-day events. `date` holds the start. */
  @Column({ type: 'date', nullable: true })
  endDate: string | null;
```

- [ ] **Step 2: Add the day column to the expense entity**

In `event-expense.entity.ts`, after the `actual` column (line ~39) add:

```ts
  /** YYYY-MM-DD day this expense belongs to; null = Unscheduled. Kept within [event.date, event.endDate]. */
  @Column({ type: 'date', nullable: true })
  dayDate: string | null;
```

- [ ] **Step 3: Extend the event DTOs**

In `create-event.dto.ts`, add `IsBoolean` to the `class-validator` import, and after the `date?` field add:

```ts
  @IsOptional()
  @IsBoolean()
  multiDay?: boolean;

  /** YYYY-MM-DD; required by the service when multiDay is true. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;
```

In `update-event.dto.ts`, add `IsBoolean` to the import and two fields:

```ts
  @IsOptional() @IsBoolean() multiDay?: boolean;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate?: string;
```

- [ ] **Step 4: Extend the create-expense DTO**

In `create-event-expense.dto.ts`, add `ValidateIf` to the `class-validator` import and after `label` add:

```ts
  /** YYYY-MM-DD within the event range, or null for Unscheduled. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dayDate?: string | null;
```

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/events/event.entity.ts src/events/event-expense.entity.ts src/events/dto/create-event.dto.ts src/events/dto/update-event.dto.ts src/events/dto/create-event-expense.dto.ts
git commit -m "feat(events): multiDay/endDate + expense dayDate schema and DTOs"
```

---

## Task 2: Backend — `computeDayGroups` totals helper

**Files:**
- Modify: `backend/src/events/events.totals.ts`
- Test: `backend/src/events/events.totals.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  export interface EventDayGroup {
    dayDate: string | null; // null = Unscheduled
    planned: number; paid: number; count: number; paidCount: number;
  }
  interface DayGroupExpense { planned: number; actual: number; paid: boolean; dayDate: string | null; }
  export function computeDayGroups(
    expenses: DayGroupExpense[],
    event: { multiDay: boolean },
  ): EventDayGroup[];
  ```
  Ordering: non-null `dayDate` groups ascending (lexicographic on `YYYY-MM-DD`), then the Unscheduled (`null`) group last if it has any expenses. Returns `[]` when `event.multiDay` is false.

- [ ] **Step 1: Write the failing test**

Append to `events.totals.spec.ts`:

```ts
import { computeDayGroups } from './events.totals';

const dayItem = (planned: number, actual: number, paid: boolean, dayDate: string | null) =>
  ({ planned, actual, paid, dayDate }) as any;

describe('computeDayGroups', () => {
  it('returns [] for single-day events', () => {
    expect(computeDayGroups([dayItem(100, 0, false, null)], { multiDay: false })).toEqual([]);
  });

  it('groups by day ascending with Unscheduled last, summing planned/paid', () => {
    const groups = computeDayGroups(
      [
        dayItem(2000, 2000, true, '2026-07-09'),
        dayItem(500, 0, false, '2026-07-08'),
        dayItem(8000, 7500, true, '2026-07-08'),
        dayItem(1500, 0, false, null),
      ],
      { multiDay: true },
    );
    expect(groups.map((g) => g.dayDate)).toEqual(['2026-07-08', '2026-07-09', null]);
    // 2026-07-08: planned 8500, paid 7500 (only the paid item's actual), 2 items, 1 paid
    expect(groups[0]).toEqual({ dayDate: '2026-07-08', planned: 8500, paid: 7500, count: 2, paidCount: 1 });
    expect(groups[1]).toEqual({ dayDate: '2026-07-09', planned: 2000, paid: 2000, count: 1, paidCount: 1 });
    expect(groups[2]).toEqual({ dayDate: null, planned: 1500, paid: 0, count: 1, paidCount: 0 });
  });

  it('omits the Unscheduled group when every expense has a day', () => {
    const groups = computeDayGroups([dayItem(100, 0, false, '2026-07-08')], { multiDay: true });
    expect(groups.map((g) => g.dayDate)).toEqual(['2026-07-08']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/events/events.totals.spec.ts -t computeDayGroups`
Expected: FAIL — `computeDayGroups is not a function`.

- [ ] **Step 3: Implement the helper**

Append to `events.totals.ts`:

```ts
export interface EventDayGroup {
  dayDate: string | null;
  planned: number;
  paid: number;
  count: number;
  paidCount: number;
}

interface DayGroupExpense {
  planned: number;
  actual: number;
  paid: boolean;
  dayDate: string | null;
}

/** Per-day rollups for a multi-day event; [] for single-day events. */
export function computeDayGroups(
  expenses: DayGroupExpense[],
  event: { multiDay: boolean },
): EventDayGroup[] {
  if (!event.multiDay) return [];
  const byDay = new Map<string | null, EventDayGroup>();
  for (const e of expenses) {
    const key = e.dayDate ?? null;
    let g = byDay.get(key);
    if (!g) {
      g = { dayDate: key, planned: 0, paid: 0, count: 0, paidCount: 0 };
      byDay.set(key, g);
    }
    g.planned += e.planned || 0;
    if (e.paid) {
      g.paid += e.actual || 0;
      g.paidCount += 1;
    }
    g.count += 1;
  }
  const groups = [...byDay.values()];
  groups.forEach((g) => {
    g.planned = r2(g.planned);
    g.paid = r2(g.paid);
  });
  // Non-null days ascending, then Unscheduled (null) last.
  return groups.sort((a, b) => {
    if (a.dayDate === null) return 1;
    if (b.dayDate === null) return -1;
    return a.dayDate < b.dayDate ? -1 : a.dayDate > b.dayDate ? 1 : 0;
  });
}
```

(`r2` already exists at the top of the file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/events/events.totals.spec.ts`
Expected: PASS (existing `computeEventTotals` tests still green).

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/events/events.totals.ts src/events/events.totals.spec.ts
git commit -m "feat(events): computeDayGroups per-day rollup helper"
```

---

## Task 3: Backend — service validation, dayDate handling, cleanup, expose dayGroups

**Files:**
- Modify: `backend/src/events/events.service.ts`
- Test: `backend/src/events/events.service.spec.ts`

**Interfaces:**
- Consumes: `computeDayGroups`, `EventDayGroup` (Task 2); DTO fields (Task 1).
- Produces: `ComputedEvent` now also carries `dayGroups: EventDayGroup[]` (via `compute`). Service enforces: multiDay ⇒ `endDate` required and `endDate >= date` (else `BadRequestException`); non-multiDay forces `endDate = null`; expense `dayDate` must be null or within `[date, endDate]` (else `BadRequestException`), and is coerced to null for single-day events; on event update, expenses whose `dayDate` falls outside the new range are reset to null.

- [ ] **Step 1: Write the failing tests**

Append to `events.service.spec.ts` (reuses the file's `makeRepo`; extend it with expense helpers):

```ts
import { BadRequestException } from '@nestjs/common';
import { computeDayGroups } from './events.totals';

function makeRepoWithExpenses(events: any[]) {
  const repo = makeRepo(events);
  repo.findExpense = jest.fn(async (expId: string, evId: string) => {
    const ev = events.find((e) => e.id === evId);
    return ev?.expenses?.find((x: any) => x.id === expId) ?? null;
  });
  repo.saveExpense = jest.fn(async (x: any) => x);
  repo.createExpense = jest.fn((x: any) => ({ id: 'exp-new', ...x }));
  return repo;
}

describe('EventsService multi-day', () => {
  it('rejects multiDay create without endDate', async () => {
    const svc = new EventsService(makeRepo([]), {} as any);
    await expect(
      svc.create('u1', { name: 'Trip', emoji: '✈️', color: '#fff', budget: 100, date: '2026-07-08', multiDay: true, expenses: [] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects endDate before start', async () => {
    const svc = new EventsService(makeRepo([]), {} as any);
    await expect(
      svc.create('u1', { name: 'Trip', emoji: '✈️', color: '#fff', budget: 100, date: '2026-07-10', endDate: '2026-07-08', multiDay: true, expenses: [] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forces endDate to null when not multiDay on update', async () => {
    const events = [{ id: 'ev1', userId: 'u1', budget: 100, multiDay: true, date: '2026-07-08', endDate: '2026-07-10', expenses: [] }];
    const svc = new EventsService(makeRepoWithExpenses(events), {} as any);
    await svc.update('ev1', 'u1', { multiDay: false } as any);
    expect(events[0].endDate).toBeNull();
  });

  it('rejects an out-of-range dayDate on addExpense', async () => {
    const events = [{ id: 'ev1', userId: 'u1', budget: 100, multiDay: true, date: '2026-07-08', endDate: '2026-07-10', expenses: [] }];
    const svc = new EventsService(makeRepoWithExpenses(events), {} as any);
    await expect(
      svc.addExpense('ev1', 'u1', { categoryId: 'c1', label: 'A', planned: 10, dayDate: '2026-07-20' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('coerces dayDate to null for a single-day event', async () => {
    const events = [{ id: 'ev1', userId: 'u1', budget: 100, multiDay: false, date: '2026-07-08', endDate: null, expenses: [] }];
    const repo = makeRepoWithExpenses(events);
    const svc = new EventsService(repo, {} as any);
    await svc.addExpense('ev1', 'u1', { categoryId: 'c1', label: 'A', planned: 10, dayDate: '2026-07-08' } as any);
    expect(repo.createExpense.mock.calls[0][0].dayDate).toBeNull();
  });

  it('resets out-of-range expense days when the range shrinks', async () => {
    const events = [{
      id: 'ev1', userId: 'u1', budget: 100, multiDay: true, date: '2026-07-08', endDate: '2026-07-12',
      expenses: [{ id: 'x1', dayDate: '2026-07-11', planned: 10, actual: 0, paid: false }],
    }];
    const svc = new EventsService(makeRepoWithExpenses(events), {} as any);
    await svc.update('ev1', 'u1', { endDate: '2026-07-09' } as any);
    expect(events[0].expenses[0].dayDate).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/events/events.service.spec.ts -t "multi-day"`
Expected: FAIL (no validation yet; some throw nothing / wrong values).

- [ ] **Step 3: Add a validation helper and wire it into create/update**

In `events.service.ts`, add `BadRequestException` to the `@nestjs/common` import and `computeDayGroups`, `EventDayGroup` to the totals import. Change the `ComputedEvent` type and `compute`:

```ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
// ...
import { computeEventTotals, computeDayGroups, EventTotals, EventDayGroup } from './events.totals';

export type ComputedEvent = Event & EventTotals & { dayGroups: EventDayGroup[] };
```

```ts
  private compute(event: Event): ComputedEvent {
    const expenses = event.expenses ?? [];
    const totals = computeEventTotals(expenses, event.budget);
    const dayGroups = computeDayGroups(expenses, event);
    return Object.assign(event, totals, { dayGroups });
  }
```

Add these private helpers to the class:

```ts
  /** Resolve the effective multiDay/start/end for a create or update. Throws on bad ranges. */
  private resolveRange(
    multiDay: boolean,
    start: string | null,
    end: string | null,
  ): { multiDay: boolean; endDate: string | null } {
    if (!multiDay) return { multiDay: false, endDate: null };
    if (!start || !end) {
      throw new BadRequestException('A multi-day event needs both a start and end date.');
    }
    if (end < start) {
      throw new BadRequestException('End date cannot be before the start date.');
    }
    return { multiDay: true, endDate: end };
  }

  /** Validate/normalize an expense day against the event range. Returns the day to store. */
  private resolveDayDate(event: Event, dayDate: string | null | undefined): string | null {
    if (dayDate === undefined || dayDate === null) return null;
    if (!event.multiDay || !event.date || !event.endDate) return null;
    if (dayDate < event.date || dayDate > event.endDate) {
      throw new BadRequestException('Expense day is outside the event date range.');
    }
    return dayDate;
  }
```

In `create`, replace the range/`endDate` assignment. After computing `date`, resolve the range and set fields:

```ts
    const start = dto.date ?? null;
    const { multiDay, endDate } = this.resolveRange(dto.multiDay ?? false, start, dto.endDate ?? null);
    const event = this.repo.create({
      name: dto.name,
      emoji: dto.emoji,
      color: dto.color,
      date: start,
      multiDay,
      endDate,
      budget: dto.budget,
      guests: dto.guests ?? 0,
      userId,
      expenses: dto.expenses.map((e, i) => ({
        categoryId: e.categoryId,
        label: e.label,
        planned: e.planned,
        actual: e.actual ?? 0,
        paid: false,
        transactionId: null,
        dayDate: multiDay && e.dayDate && e.dayDate >= (start ?? '') && e.dayDate <= (endDate ?? '') ? e.dayDate : null,
        sortOrder: e.sortOrder ?? i,
      })) as EventExpense[],
    });
```

In `update`, after applying `name/emoji/color`, replace the `date/guests` block so the range is resolved and out-of-range expense days are cleaned up in the same save:

```ts
    if (dto.name !== undefined) event.name = dto.name;
    if (dto.emoji !== undefined) event.emoji = dto.emoji;
    if (dto.color !== undefined) event.color = dto.color;
    if (dto.budget !== undefined) event.budget = dto.budget;
    if (dto.guests !== undefined) event.guests = dto.guests;

    const nextStart = dto.date !== undefined ? dto.date : event.date;
    const nextMultiDay = dto.multiDay !== undefined ? dto.multiDay : event.multiDay;
    const nextEnd = dto.endDate !== undefined ? dto.endDate : event.endDate;
    const range = this.resolveRange(nextMultiDay, nextStart, nextEnd);
    event.date = nextStart;
    event.multiDay = range.multiDay;
    event.endDate = range.endDate;
    // Reset any expense day now outside the (possibly narrowed / cleared) range.
    for (const x of event.expenses ?? []) {
      if (x.dayDate && (!range.multiDay || !event.date || !range.endDate || x.dayDate < event.date || x.dayDate > range.endDate)) {
        x.dayDate = null;
        await this.repo.saveExpense(x);
      }
    }
```

(Remove the old `if (dto.date !== undefined) event.date = dto.date;` line — it is now handled above. Keep the trailing `await this.repo.save(event); return this.findOne(id, userId);`. `update` must load expenses; `findOneByUser` already returns them per the existing totals path.)

In `addExpense`, set `dayDate` from the resolver — after loading `event` and before building the expense:

```ts
    const dayDate = this.resolveDayDate(event, dto.dayDate);
```
and add `dayDate,` to the `this.repo.createExpense({ ... })` object.

In `updateExpense`, after the existing field assignments (before the linked-transaction reconciliation), add:

```ts
    if (dto.dayDate !== undefined) expense.dayDate = this.resolveDayDate(event, dto.dayDate);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest src/events/events.service.spec.ts`
Expected: PASS (new multi-day tests + existing CRUD tests).

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/events/events.service.ts src/events/events.service.spec.ts
git commit -m "feat(events): validate range, keep dayDate in range, expose dayGroups"
```

---

## Task 4: Backend — Munshi list_events surfaces the date range

**Files:**
- Modify: `backend/src/ai-chat/tools/events.tools.ts`
- Test: `backend/src/ai-chat/tools/events.tools.spec.ts`

**Interfaces:**
- Consumes: `ComputedEvent` fields `multiDay`, `date`, `endDate`.
- Produces: each `list_events` row additionally carries `multiDay: boolean`, `startDate: string | null`, `endDate: string | null`.

- [ ] **Step 1: Write/extend the failing test**

Open `events.tools.spec.ts`; find the assertion on the mapped row shape and add expectations that a multi-day event's row includes `multiDay: true`, `startDate`, and `endDate`. If the file stubs `svc.events.findAll`, add `multiDay`, `date`, `endDate` to the stub event. Concretely add a case:

```ts
it('includes the date range for multi-day events', async () => {
  const ctx = makeCtx([{ id: 'ev1', name: 'Goa', emoji: '✈️', budget: 50000, planned: 0, paid: 0, projected: 0, over: false, paidCount: 0, count: 0, multiDay: true, date: '2026-07-08', endDate: '2026-07-10' }]);
  const res = await eventTools[0].handler(ctx);
  expect(res.data[0]).toMatchObject({ multiDay: true, startDate: '2026-07-08', endDate: '2026-07-10' });
});
```

(Reuse the file's existing context/stub helper; the above `makeCtx` name should match whatever the spec already defines — if it builds ctx inline, follow that shape instead.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/ai-chat/tools/events.tools.spec.ts`
Expected: FAIL — row lacks `multiDay/startDate/endDate`.

- [ ] **Step 3: Extend the tool**

In `events.tools.ts`, widen `EventLike` and the mapped row:

```ts
interface EventLike {
  id: string; name: string; emoji: string; budget: number;
  planned: number; paid: number; projected: number; over: boolean;
  paidCount: number; count: number;
  multiDay: boolean; date: string | null; endDate: string | null;
}
```
```ts
        data: events.map((e) => ({
          id: e.id, name: e.name, emoji: e.emoji, budget: e.budget,
          planned: e.planned, paid: e.paid, projected: e.projected,
          over: e.over, paidCount: e.paidCount, count: e.count,
          multiDay: e.multiDay, startDate: e.date, endDate: e.endDate,
        })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/ai-chat/tools/events.tools.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/ai-chat/tools/events.tools.ts src/ai-chat/tools/events.tools.spec.ts
git commit -m "feat(munshi): list_events surfaces multi-day date range"
```

---

## Task 5: Mobile — API types, adapter, resource pass-through

**Files:**
- Modify: `mobile/src/api/types.ts`
- Modify: `mobile/src/api/adapters.ts`
- Create: `mobile/src/api/adapters.events.spec.ts`
- Modify: `mobile/src/api/index.ts`

**Interfaces:**
- Consumes: backend response fields from Tasks 1–3.
- Produces (mobile view types):
  ```ts
  export interface EventDayGroup { dayDate: string | null; planned: number; paid: number; count: number; paidCount: number; }
  ```
  `ApiEvent` gains `multiDay: boolean; endDate: string | null; dayGroups?: EventDayGroup[]`. `ApiEventExpense` gains `dayDate: string | null`. `EventView` gains `multiDay: boolean; endDate: string | null`. `EventDetailView` gains `dayGroups: EventDayGroup[]`. `EventExpenseView` gains `dayDate: string | null`. `NewEventInput` gains `multiDay?: boolean; endDate?: string`. `NewEventExpenseInput` gains `dayDate?: string | null`. `api.events.updateExpense` patch gains `dayDate?: string | null`.

- [ ] **Step 1: Extend the API/view types**

In `types.ts`:
- Add to `ApiEventExpense`: `dayDate: string | null;`
- Add to `ApiEvent`: `multiDay: boolean;`, `endDate: string | null;`, and `dayGroups?: EventDayGroup[];`
- Add the `EventDayGroup` interface (place it just above `EventExpenseView`):
  ```ts
  export interface EventDayGroup {
    dayDate: string | null;
    planned: number;
    paid: number;
    count: number;
    paidCount: number;
  }
  ```
- Add to `EventExpenseView`: `dayDate: string | null;`
- Add to `EventView`: `multiDay: boolean;`, `endDate: string | null;`
- Add to `EventDetailView`: `dayGroups: EventDayGroup[];`
- Add to `NewEventInput`: `multiDay?: boolean;`, `endDate?: string;`
- Add to `NewEventExpenseInput`: `dayDate?: string | null;`

- [ ] **Step 2: Write the failing adapter test**

Create `adapters.events.spec.ts`:

```ts
import { toEventView, toEventDetailView } from './adapters';
import type { ApiEvent, ApiCategory } from './types';

const baseEvent: ApiEvent = {
  id: 'ev1', name: 'Goa', emoji: '✈️', color: '#8197c4',
  date: '2026-07-08', multiDay: true, endDate: '2026-07-10',
  budget: 50000, guests: 0,
  planned: 8500, paid: 7500, projected: 9000, over: false,
  paidCount: 1, count: 2, remaining: 42500,
  dayGroups: [{ dayDate: '2026-07-08', planned: 8500, paid: 7500, count: 2, paidCount: 1 }],
  expenses: [
    { id: 'x1', categoryId: 'c1', label: 'Hotel', planned: 8000, actual: 7500, paid: true, transactionId: 't1', sortOrder: 0, dayDate: '2026-07-08' },
    { id: 'x2', categoryId: 'c1', label: 'Snacks', planned: 500, actual: 0, paid: false, transactionId: null, sortOrder: 1, dayDate: null },
  ],
};

const catMap = new Map<string, ApiCategory>([
  ['c1', { id: 'c1', name: 'Travel', icon: '✈️', color: '#8197c4' } as ApiCategory],
]);

describe('event adapter multi-day', () => {
  it('passes multiDay/endDate through toEventView', () => {
    const v = toEventView(baseEvent);
    expect(v.multiDay).toBe(true);
    expect(v.endDate).toBe('2026-07-10');
  });

  it('carries dayGroups and per-expense dayDate in the detail view', () => {
    const v = toEventDetailView(baseEvent, catMap);
    expect(v.dayGroups).toEqual(baseEvent.dayGroups);
    expect(v.expenses.map((e) => e.dayDate)).toEqual(['2026-07-08', null]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd mobile && npx jest src/api/adapters.events.spec.ts`
Expected: FAIL — `multiDay`/`dayGroups`/`dayDate` undefined.

- [ ] **Step 4: Extend the adapters**

In `adapters.ts`, update `toEventView`:

```ts
export function toEventView(e: ApiEvent): EventView {
  return {
    id: e.id, name: e.name, emoji: e.emoji, color: e.color, date: e.date,
    multiDay: e.multiDay, endDate: e.endDate,
    budget: e.budget, guests: e.guests, planned: e.planned, paid: e.paid,
    projected: e.projected, over: e.over, paidCount: e.paidCount,
    count: e.count, remaining: e.remaining,
  };
}
```

In `toEventDetailView`, add `dayDate: x.dayDate` to each mapped expense object, and return `dayGroups`:

```ts
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
        dayDate: x.dayDate,
      };
    });
  return { ...toEventView(e), expenses, dayGroups: e.dayGroups ?? [] };
```

Add `EventDayGroup` to the type import at the top of `adapters.ts` if the file imports view types explicitly (it imports `EventView`, `EventDetailView`, `EventExpenseView` already — add `EventDayGroup` to that list only if `tsc` complains; it is referenced only via `e.dayGroups`).

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd mobile && npx jest src/api/adapters.events.spec.ts`
Expected: PASS.

- [ ] **Step 6: Thread the new fields through the resource**

In `index.ts` `events`:

`create` — pass `multiDay`/`endDate` and per-expense `dayDate`:
```ts
      const expenses = await Promise.all(
        input.expenses.map(async (x) => ({
          categoryId: await resolveCategoryId(x.categoryName),
          label: x.label,
          planned: x.planned,
          actual: x.actual ?? 0,
          paid: false,
          dayDate: x.dayDate ?? null,
        })),
      );
      const created = await apiClient.post<ApiEvent>('/events', {
        name: input.name, emoji: input.emoji, color: input.color,
        date: input.date, multiDay: input.multiDay ?? false, endDate: input.endDate,
        budget: input.budget, guests: input.guests ?? 0,
        expenses,
      });
```

`update` — widen the patch type to include the new fields:
```ts
    async update(id: string, patch: Partial<Pick<NewEventInput, 'name' | 'emoji' | 'color' | 'date' | 'multiDay' | 'endDate' | 'budget' | 'guests'>>): Promise<void> {
```

`addExpense` — pass `dayDate`:
```ts
      await apiClient.post(`/events/${id}/expenses`, {
        categoryId: await resolveCategoryId(input.categoryName),
        label: input.label,
        planned: input.planned,
        actual: input.actual,
        paid: input.paid ?? false,
        dayDate: input.dayDate ?? null,
      });
```

`updateExpense` — accept and forward `dayDate` (note: `null` is a meaningful value → check for `undefined`, not falsiness):
```ts
    async updateExpense(
      id: string,
      expenseId: string,
      patch: { categoryName?: string; label?: string; planned?: number; actual?: number; paid?: boolean; dayDate?: string | null },
    ): Promise<void> {
      const body: Record<string, unknown> = {};
      if (patch.categoryName !== undefined) body['categoryId'] = await resolveCategoryId(patch.categoryName);
      if (patch.label !== undefined) body['label'] = patch.label;
      if (patch.planned !== undefined) body['planned'] = patch.planned;
      if (patch.actual !== undefined) body['actual'] = patch.actual;
      if (patch.paid !== undefined) body['paid'] = patch.paid;
      if (patch.dayDate !== undefined) body['dayDate'] = patch.dayDate;
      await apiClient.patch(`/events/${id}/expenses/${expenseId}`, body);
      bumpData();
    },
```

- [ ] **Step 7: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd mobile && git add src/api/types.ts src/api/adapters.ts src/api/adapters.events.spec.ts src/api/index.ts
git commit -m "feat(mobile): thread multiDay/endDate/dayDate through events API + adapter"
```

---

## Task 6: Mobile — shared event date helpers

**Files:**
- Create: `mobile/src/screens/events/eventDates.ts`

**Interfaces:**
- Produces:
  ```ts
  export function parseYMD(s: string): Date | null;          // local-date parse
  export function toYMD(d: Date): string;                    // Date -> 'YYYY-MM-DD'
  export function eachDayYMD(start: string, end: string): string[]; // inclusive range of YMD strings
  export function formatDayShort(ymd: string): string;       // '2026-07-08' -> 'Wed 8 Jul'
  export function formatRange(start: string, end: string): string;  // -> '8–10 Jul' (compact)
  ```

- [ ] **Step 1: Write the failing test**

Create `mobile/src/screens/events/eventDates.spec.ts`:

```ts
import { parseYMD, toYMD, eachDayYMD, formatDayShort, formatRange } from './eventDates';

describe('eventDates', () => {
  it('round-trips YMD as a local date', () => {
    const d = parseYMD('2026-07-08')!;
    expect(toYMD(d)).toBe('2026-07-08');
    expect(d.getDate()).toBe(8); // local, not shifted by UTC
  });

  it('enumerates an inclusive day range', () => {
    expect(eachDayYMD('2026-07-08', '2026-07-10')).toEqual(['2026-07-08', '2026-07-09', '2026-07-10']);
  });

  it('formats a short day label', () => {
    expect(formatDayShort('2026-07-08')).toBe('Wed 8 Jul');
  });

  it('formats a compact range within the same month', () => {
    expect(formatRange('2026-07-08', '2026-07-10')).toBe('8–10 Jul');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest src/screens/events/eventDates.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `eventDates.ts`:

```ts
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse 'YYYY-MM-DD' as a LOCAL date (never UTC). Mirrors CreateEventSheet.parseYMD. */
export function parseYMD(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toYMD(d: Date): string {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${day}`;
}

/** Inclusive list of 'YYYY-MM-DD' from start to end. Empty if end < start or unparseable. */
export function eachDayYMD(start: string, end: string): string[] {
  const s = parseYMD(start);
  const e = parseYMD(end);
  if (!s || !e || e < s) return [];
  const out: string[] = [];
  const cur = new Date(s);
  while (cur <= e) {
    out.push(toYMD(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** '2026-07-08' -> 'Wed 8 Jul'. */
export function formatDayShort(ymd: string): string {
  const d = parseYMD(ymd);
  if (!d) return ymd;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Compact range: same month -> '8–10 Jul'; cross-month -> '30 Jul – 2 Aug'. */
export function formatRange(start: string, end: string): string {
  const s = parseYMD(start);
  const e = parseYMD(end);
  if (!s || !e) return start;
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]}`;
  }
  return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest src/screens/events/eventDates.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd mobile && git add src/screens/events/eventDates.ts src/screens/events/eventDates.spec.ts
git commit -m "feat(mobile): shared event date helpers (range, day labels)"
```

---

## Task 7: Mobile — `CalendarRangePicker` component

**Files:**
- Create: `mobile/src/components/CalendarRangePicker.tsx`
- Test: `mobile/src/components/CalendarRangePicker.spec.ts` (pure range-state logic only)

**Interfaces:**
- Consumes: `CalendarPicker`'s exported helpers `isSameDay`, `addDays`, `isAfterDay`, `buildMonthMatrix`, and its `Anchor` type (all from `./CalendarPicker`).
- Produces:
  ```tsx
  export function nextRangeState(
    sel: { start: Date | null; end: Date | null },
    tapped: Date,
  ): { start: Date | null; end: Date | null; committed: boolean };
  export function CalendarRangePicker(props: {
    visible: boolean;
    start: Date | null;
    end: Date | null;
    anchor?: Anchor | null;
    onSelect: (start: Date, end: Date) => void;
    onClose: () => void;
  }): JSX.Element;
  ```
  `nextRangeState` is the pure tap-reducer (extracted so it is unit-testable without rendering): first tap or a tap when a full range exists starts fresh (`start=tapped, end=null, committed=false`); a tap before the current start restarts (`start=tapped, end=null`); a tap on/after start completes (`end=tapped, committed=true`).

- [ ] **Step 1: Read the Expo 56 docs note**

Per `mobile/AGENTS.md`, this component uses only RN core (`Modal`, `Pressable`, `View`, `Text`, `useWindowDimensions`) exactly like `CalendarPicker` — no new Expo API surface. Skim `https://docs.expo.dev/versions/v56.0.0/` only if you touch an Expo module.

- [ ] **Step 2: Write the failing test for the tap-reducer**

Create `CalendarRangePicker.spec.ts`:

```ts
import { nextRangeState } from './CalendarRangePicker';

const d = (day: number) => new Date(2026, 6, day); // July 2026

describe('nextRangeState', () => {
  it('first tap sets start and clears end', () => {
    expect(nextRangeState({ start: null, end: null }, d(8))).toEqual({ start: d(8), end: null, committed: false });
  });

  it('tap on/after start completes the range and commits', () => {
    expect(nextRangeState({ start: d(8), end: null }, d(10))).toEqual({ start: d(8), end: d(10), committed: true });
  });

  it('same-day second tap commits a single-day range', () => {
    expect(nextRangeState({ start: d(8), end: null }, d(8))).toEqual({ start: d(8), end: d(8), committed: true });
  });

  it('tap before start restarts the selection', () => {
    expect(nextRangeState({ start: d(8), end: null }, d(5))).toEqual({ start: d(5), end: null, committed: false });
  });

  it('tapping when a full range exists starts fresh', () => {
    expect(nextRangeState({ start: d(8), end: d(10) }, d(12))).toEqual({ start: d(12), end: null, committed: false });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd mobile && npx jest src/components/CalendarRangePicker.spec.ts`
Expected: FAIL — module/function not found.

- [ ] **Step 4: Implement the reducer + component**

Create `CalendarRangePicker.tsx`. Start with the pure reducer, then the view (copy `CalendarPicker`'s card shell, `pos` math, header, `JumpView`, and week grid verbatim; only the cell rendering and commit path differ). Reuse the exported helpers rather than redefining them.

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { radius, weight } from '../theme/tokens';
import {
  type Anchor,
  isSameDay,
  isAfterDay,
  buildMonthMatrix,
} from './CalendarPicker';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
/** true when `x` is strictly between a and b (exclusive), day-granular. */
function isBetween(x: Date, a: Date, b: Date): boolean {
  const t = startOfDay(x).getTime();
  const lo = Math.min(startOfDay(a).getTime(), startOfDay(b).getTime());
  const hi = Math.max(startOfDay(a).getTime(), startOfDay(b).getTime());
  return t > lo && t < hi;
}

/** Pure tap-reducer for range selection — unit-tested in CalendarRangePicker.spec.ts. */
export function nextRangeState(
  sel: { start: Date | null; end: Date | null },
  tapped: Date,
): { start: Date | null; end: Date | null; committed: boolean } {
  if (!sel.start || sel.end) return { start: tapped, end: null, committed: false };
  if (isAfterDay(sel.start, tapped)) return { start: tapped, end: null, committed: false };
  return { start: sel.start, end: tapped, committed: true };
}

const CARD_MAX_W = 340;
const CARD_H_EST = 460;
const MARGIN = 12;

export function CalendarRangePicker({
  visible, start, end, anchor, onSelect, onClose,
}: {
  visible: boolean;
  start: Date | null;
  end: Date | null;
  anchor?: Anchor | null;
  onSelect: (start: Date, end: Date) => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const win = useWindowDimensions();
  const [sel, setSel] = useState<{ start: Date | null; end: Date | null }>({ start, end });
  const seed = start ?? new Date();
  const [view, setView] = useState({ year: seed.getFullYear(), month: seed.getMonth() });
  const [jump, setJump] = useState(false);

  useEffect(() => {
    if (visible) {
      setSel({ start, end });
      const s = start ?? new Date();
      setView({ year: s.getFullYear(), month: s.getMonth() });
      setJump(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const cardW = Math.min(CARD_MAX_W, win.width - MARGIN * 2);
  const pos = useMemo(() => {
    if (!anchor) {
      return { top: Math.max(MARGIN, (win.height - CARD_H_EST) / 2), left: (win.width - cardW) / 2 };
    }
    let left = anchor.x + anchor.w - cardW;
    left = Math.min(Math.max(MARGIN, left), win.width - cardW - MARGIN);
    let top = anchor.y + anchor.h + 8;
    if (top + CARD_H_EST > win.height - MARGIN) top = Math.max(MARGIN, anchor.y - CARD_H_EST - 8);
    return { top, left };
  }, [anchor, cardW, win.width, win.height]);

  const matrix = useMemo(() => buildMonthMatrix(view.year, view.month), [view]);

  const step = (delta: number) => setView((v) => {
    const m = v.month + delta;
    return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
  });

  const pick = (cell: Date) => {
    const next = nextRangeState(sel, cell);
    setSel({ start: next.start, end: next.end });
    if (next.committed && next.start && next.end) {
      onSelect(next.start, next.end);
    }
  };

  const rangeLabel = sel.start
    ? `${sel.start.getDate()} ${MONTHS[sel.start.getMonth()]}${sel.end ? ` – ${sel.end.getDate()} ${MONTHS[sel.end.getMonth()]}` : ' – …'}`
    : 'Pick a start date';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: t.sheetBackdropBg }]} onPress={onClose}>
        <Pressable onPress={() => {}} style={[styles.card, { width: cardW, top: pos.top, left: pos.left, backgroundColor: t.sheetBg, borderColor: t.borderStr }]}>
          {jump ? (
            <RangeJumpView
              year={view.year}
              onPickMonth={(month) => { setView((v) => ({ ...v, month })); setJump(false); }}
              onStepYear={(dd) => setView((v) => ({ ...v, year: v.year + dd }))}
            />
          ) : (
            <>
              <View style={styles.header}>
                <Pressable hitSlop={10} onPress={() => step(-1)}><Text style={[styles.arrow, { color: t.em }]}>‹</Text></Pressable>
                <Pressable hitSlop={8} onPress={() => setJump(true)}>
                  <Text style={[styles.title, { color: t.text1, fontFamily: weight(700) }]}>{MONTHS_FULL[view.month]} {view.year}</Text>
                </Pressable>
                <Pressable hitSlop={10} onPress={() => step(1)}><Text style={[styles.arrow, { color: t.em }]}>›</Text></Pressable>
              </View>

              <View style={styles.weekRow}>
                {WEEKDAYS.map((w, i) => (
                  <Text key={i} style={[styles.weekday, { color: t.text3, fontFamily: weight(600) }]}>{w}</Text>
                ))}
              </View>

              {matrix.map((row, ri) => (
                <View key={ri} style={styles.weekRow}>
                  {row.map((cell, ci) => {
                    if (!cell) return <View key={ci} style={styles.cell} />;
                    const isStart = sel.start && isSameDay(cell, sel.start);
                    const isEnd = sel.end && isSameDay(cell, sel.end);
                    const inBand = sel.start && sel.end && isBetween(cell, sel.start, sel.end);
                    const endpoint = isStart || isEnd;
                    return (
                      <Pressable key={ci} style={styles.cell} onPress={() => pick(cell)}>
                        {/* Full-square band bg so adjacent in-range days touch into one span. */}
                        <View style={[styles.cellBand, inBand ? { backgroundColor: t.emDim } : null]}>
                          <View style={[styles.cellInner, endpoint ? { backgroundColor: t.emDim } : null]}>
                            <Text style={{ color: endpoint ? t.em : t.text1, fontFamily: weight(endpoint ? 700 : 600), fontSize: 14 }}>
                              {cell.getDate()}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}

              <Text style={[styles.footer, { color: t.text3, fontFamily: weight(600) }]}>{rangeLabel}</Text>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function RangeJumpView({ year, onPickMonth, onStepYear }: { year: number; onPickMonth: (m: number) => void; onStepYear: (d: number) => void }) {
  const { t } = useTheme();
  return (
    <View>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => onStepYear(-1)}><Text style={[styles.arrow, { color: t.em }]}>‹</Text></Pressable>
        <Text style={[styles.title, { color: t.text1, fontFamily: weight(700) }]}>{year}</Text>
        <Pressable hitSlop={10} onPress={() => onStepYear(1)}><Text style={[styles.arrow, { color: t.em }]}>›</Text></Pressable>
      </View>
      <View style={styles.monthGrid}>
        {MONTHS.map((m, i) => (
          <Pressable key={i} onPress={() => onPickMonth(i)} style={styles.monthCell}>
            <View style={styles.monthInner}><Text style={{ color: t.text1, fontFamily: weight(600), fontSize: 14 }}>{m}</Text></View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1 },
  card: { position: 'absolute', borderWidth: 1, borderRadius: radius.lg, padding: 14, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 4 },
  arrow: { fontSize: 26, lineHeight: 28, paddingHorizontal: 8 },
  title: { fontSize: 15 },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, paddingVertical: 6 },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellBand: { alignSelf: 'stretch', flex: 1, alignItems: 'center', justifyContent: 'center' },
  cellInner: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  footer: { fontSize: 12.5, textAlign: 'center', marginTop: 12 },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: '25%', paddingVertical: 8, alignItems: 'center' },
  monthInner: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.sm },
});
```

Note: if `startOfDay` gets exported from `CalendarPicker` later, import it instead of the local copy to stay DRY. For now `CalendarPicker` keeps it private, so the small local copy here is acceptable.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd mobile && npx jest src/components/CalendarRangePicker.spec.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd mobile && git add src/components/CalendarRangePicker.tsx src/components/CalendarRangePicker.spec.ts
git commit -m "feat(mobile): CalendarRangePicker matching CalendarPicker's look"
```

---

## Task 8: Mobile — CreateEventSheet multi-day toggle + range field

**Files:**
- Modify: `mobile/src/screens/events/CreateEventSheet.tsx`

**Interfaces:**
- Consumes: `NewEventInput.multiDay/endDate` (Task 5); `parseYMD/toYMD/formatRange` from `eventDates` (Task 6); `CalendarRangePicker` (Task 7).
- Produces: create payload now carries `multiDay` and (when on) `endDate`.

- [ ] **Step 1: Read the Expo 56 docs note**

Per `mobile/AGENTS.md`, this task uses only RN core + existing app components; skim `https://docs.expo.dev/versions/v56.0.0/` only if touching an Expo module.

- [ ] **Step 2: Add multi-day state, a toggle, and the range field**

In `CreateEventSheet.tsx`:
- Import the shared helpers from `./eventDates` (`parseYMD`, `toYMD`, `formatRange`) and remove the now-duplicated local `parseYMD`/`toYMD` (keep or replace `displayDate` with `formatDayShort` from the same module). Import `CalendarRangePicker` from `../../components/CalendarRangePicker`.
- Add state: `const [multiDay, setMultiDay] = useState(false);`, `const [endDate, setEndDate] = useState('');`, and a range-picker open/anchor pair (`rangeOpen`, `rangeAnchor`, `rangeRowRef`).
- Reset in the `open` effect: `setMultiDay(false); setEndDate('');`.
- Add a **"Multiple days"** toggle row (reuse `EventItemSheet`'s paid-row style) placed just above the DATE field.
- When `multiDay` is **off**: render the existing single `CalendarPicker` DATE field unchanged.
- When `multiDay` is **on**: replace that field with a single **DATES** `Pressable` (same field styling) whose label shows `date && endDate ? formatRange(date, endDate) : 'Select dates'`, opening the `CalendarRangePicker`:
  ```tsx
  <CalendarRangePicker
    visible={rangeOpen}
    start={parseYMD(date)}
    end={parseYMD(endDate)}
    anchor={rangeAnchor}
    onSelect={(s, e) => { setDate(toYMD(s)); setEndDate(toYMD(e)); setRangeOpen(false); }}
    onClose={() => setRangeOpen(false)}
  />
  ```
  (measure `rangeRowRef` into `rangeAnchor` on open, exactly like the existing `openDatePicker`.)
- In `create()`, guard and include the new fields:
  ```ts
    if (multiDay && (!date || !endDate)) return; // need a full range
    onCreate({
      ...seed,
      name: name.trim() || template.name,
      date: date || undefined,
      multiDay,
      endDate: multiDay ? endDate || undefined : undefined,
      budget: Number(budget) || template.budget,
      emoji: isCustom ? emoji : template.emoji,
    });
  ```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify in the running app**

Use the `run` skill to launch the app, FAB → "Plan an event", toggle **Multiple days**, open the range picker, pick a start then an end (confirm the in-range band highlight looks like the app's date picker), create, and confirm it persists with a date range. Confirm single-day (toggle off) still creates as before.

- [ ] **Step 5: Commit**

```bash
cd mobile && git add src/screens/events/CreateEventSheet.tsx
git commit -m "feat(mobile): multi-day toggle + range field in CreateEventSheet"
```

---

## Task 9: Mobile — EventItemSheet Day selector

**Files:**
- Modify: `mobile/src/screens/events/EventItemSheet.tsx`
- Modify: `mobile/src/screens/events/EventDetail.tsx` (pass event range into the sheet)

**Interfaces:**
- Consumes: `EventItemSaved` extends `NewEventExpenseInput` → now carries optional `dayDate`; `eachDayYMD`, `formatDayShort` (Task 6).
- Produces: `EventItemSheet` accepts `multiDay: boolean`, `rangeStart: string | null`, `rangeEnd: string | null`, and `item.dayDate`; `onSave` payload includes `dayDate: string | null`.

- [ ] **Step 1: Extend the saved-item type and props**

In `EventItemSheet.tsx`:
- `export interface EventItemSaved extends NewEventExpenseInput { actual: number; dayDate: string | null; }`
- Add props: `multiDay: boolean; rangeStart: string | null; rangeEnd: string | null;`
- Add state `const [dayDate, setDayDate] = useState<string | null>(null);`
- Seed on open: `setDayDate(item?.dayDate ?? null);`

- [ ] **Step 2: Render the Day selector (multi-day only)**

Below the paid toggle, when `multiDay && rangeStart && rangeEnd`, render a horizontal chip row (reuse the category `ScrollView`/`chip` styles) with options built from the range:

```tsx
{multiDay && rangeStart && rangeEnd ? (
  <View style={{ marginTop: 14 }}>
    <Text style={[styles.label, { color: t.text3, fontFamily: weight(600) }]}>DAY</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
      {[null, ...eachDayYMD(rangeStart, rangeEnd)].map((d) => {
        const on = d === dayDate;
        return (
          <Pressable
            key={d ?? 'unscheduled'}
            onPress={() => setDayDate(d)}
            style={[styles.chip, { backgroundColor: on ? t.emDim : t.bg2, borderColor: on ? t.emGlow : t.border }]}
          >
            <Text style={[styles.chipLabel, { color: on ? t.em : t.text2, fontFamily: weight(600) }]}>
              {d === null ? 'Unscheduled' : formatDayShort(d)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  </View>
) : null}
```

Add the import: `import { eachDayYMD, formatDayShort } from './eventDates';`

- [ ] **Step 3: Include dayDate in save**

In `save()`, add `dayDate` to the payload:
```ts
    onSave({ categoryName: cat, label: label.trim() || cat, planned: p, actual: a, paid, dayDate });
```

- [ ] **Step 4: Pass event range from EventDetail**

In `EventDetail.tsx`, update the `<EventItemSheet ... />` render to pass:
```tsx
        multiDay={ev.multiDay}
        rangeStart={ev.date}
        rangeEnd={ev.endDate}
```
And update `saveItem`'s type so `patch.dayDate` flows into `api.events.addExpense`/`updateExpense` (both already accept `dayDate` after Task 5 — for `updateExpense` pass `dayDate: patch.dayDate`).

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Verify**

Launch the app (run skill), open a multi-day event, add an expense, pick a Day, save, and confirm it lands under that day. Confirm a single-day event's item sheet shows no Day selector.

- [ ] **Step 7: Commit**

```bash
cd mobile && git add src/screens/events/EventItemSheet.tsx src/screens/events/EventDetail.tsx
git commit -m "feat(mobile): range-restricted Day selector in EventItemSheet"
```

---

## Task 10: Mobile — EventDetail day-sectioned rendering + range chip

**Files:**
- Modify: `mobile/src/screens/events/EventDetail.tsx`

**Interfaces:**
- Consumes: `ev.multiDay`, `ev.endDate`, `ev.dayGroups`, per-expense `ev.expenses[].dayDate`; `formatDayShort`, `formatRange` (Task 6).
- Produces: multi-day events render grouped sections; single-day unchanged. (No drag yet — Task 11 replaces the plain grouped list with the draggable one.)

- [ ] **Step 1: Range chip in the hero**

Replace the single-date hero chip so multi-day events show the range:
```tsx
{ev.multiDay && ev.date && ev.endDate ? (
  <Text style={[styles.heroChip, { color: t.text2 }]}>🗓 {formatRange(ev.date, ev.endDate)}</Text>
) : ev.date ? (
  <Text style={[styles.heroChip, { color: t.text2 }]}>🗓 {ev.date}</Text>
) : null}
```
Add `import { formatDayShort, formatRange } from './eventDates';`

- [ ] **Step 2: Grouped rendering for multi-day**

Where the checklist currently maps `ev.expenses` (the `else` branch after the empty state), branch on `ev.multiDay`. For single-day keep the existing flat `ev.expenses.map(...)`. For multi-day, render one section per `ev.dayGroups` entry, each with a header (day label + subtotal) and its expenses:

```tsx
{ev.multiDay ? (
  <View style={styles.expenseList}>
    {ev.dayGroups.map((g) => {
      const rows = ev.expenses.filter((x) => (x.dayDate ?? null) === g.dayDate);
      return (
        <View key={g.dayDate ?? 'unscheduled'}>
          <View style={styles.dayHeader}>
            <Text style={[styles.dayHeaderTitle, { color: t.text2, fontFamily: weight(700) }]}>
              {g.dayDate === null ? 'Unscheduled' : formatDayShort(g.dayDate)}
            </Text>
            <Text style={[styles.dayHeaderSub, { color: t.text3 }]}>
              {evFmt(g.paid)} / {evFmt(g.planned)}
            </Text>
          </View>
          {rows.map((x, i) => (
            <SpringIn key={x.id} delay={40 + i * 20}>
              <ExpenseRow x={x} onToggle={() => togglePaid(x)} onPress={() => openEdit(x)} />
            </SpringIn>
          ))}
        </View>
      );
    })}
  </View>
) : (
  <View style={styles.expenseList}>
    {ev.expenses.map((x, i) => (
      <SpringIn key={x.id} delay={50 + i * 30}>
        <ExpenseRow x={x} onToggle={() => togglePaid(x)} onPress={() => openEdit(x)} />
      </SpringIn>
    ))}
  </View>
)}
```

Add styles:
```ts
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  dayHeaderTitle: { fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.6 },
  dayHeaderSub: { fontSize: 11.5 },
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify**

Launch the app (run skill), open a multi-day event with expenses on different days + one Unscheduled; confirm day sections render in date order with correct subtotals and Unscheduled last. Confirm single-day events look identical to before.

- [ ] **Step 5: Commit**

```bash
cd mobile && git add src/screens/events/EventDetail.tsx
git commit -m "feat(mobile): day-sectioned expense list + range chip in EventDetail"
```

---

## Task 11: Mobile — drag an expense to another day

**Files:**
- Create: `mobile/src/screens/events/ExpenseDragList.tsx`
- Modify: `mobile/src/screens/events/EventDetail.tsx`

**Interfaces:**
- Consumes: `EventExpenseView` (with `dayDate`), `EventDayGroup`, the `ExpenseRow` visual (extracted/shared), and callbacks.
- Produces:
  ```tsx
  interface ExpenseDragListProps {
    groups: EventDayGroup[];
    expenses: EventExpenseView[];
    renderRow: (x: EventExpenseView) => React.ReactNode; // reuse ExpenseRow
    onMove: (expenseId: string, toDayDate: string | null) => void; // fired on drop into a new day
  }
  export function ExpenseDragList(props: ExpenseDragListProps): JSX.Element;
  ```

- [ ] **Step 1: Read the Expo 56 + reanimated/gesture-handler docs**

Per `mobile/AGENTS.md`, before writing gesture code confirm the current APIs at `https://docs.expo.dev/versions/v56.0.0/` and the installed `react-native-reanimated` 4.3 / `react-native-gesture-handler` 2.31 gesture API (`Gesture.Pan()`, `Gesture.LongPress()`, `runOnJS`). Follow the same pattern already used in `mobile/src/screens/SwipeRow.tsx`.

- [ ] **Step 2: Build the drag list component**

Create `ExpenseDragList.tsx`. Behaviour:
- Render the same day sections as Task 10 (header + rows), but wrap each row in a draggable wrapper.
- Measure each **section** frame into a shared value map (`onLayout` on each section `View`, storing `{ y, height, dayDate }` keyed by `dayDate ?? 'unscheduled'`). Measure relative to the list container (capture the container's `onLayout` origin).
- A `Gesture.LongPress().minDuration(200)` activates lift; a composed `Gesture.Pan()` tracks `translationY`/absolute Y. On the JS side track which section the pointer's absolute Y currently falls in → set an `activeDropKey` state to highlight that section (border/background via reanimated or a plain state highlight is fine since drop targets are section-level, not per-row).
- On release: compute the target section from the final absolute Y; if its `dayDate` differs from the dragged row's current `dayDate`, call `runOnJS(onMove)(expenseId, targetDayDate)`. Reset lift + highlight.
- Only the dragged row lifts (scale 1.03 + raised `zIndex`/elevation + shadow); others stay put. Release outside any section or on the origin day = no-op settle-back.

Keep the file focused: it owns gesture state and section geometry; it delegates row visuals to the passed `renderRow`. Extract the existing `ExpenseRow` from `EventDetail.tsx` into a shared spot (either export it from `EventDetail` or move it to `ExpenseRow.tsx` and import in both) so both the single-day list and the drag list render identical rows — do the move if `ExpenseRow` is otherwise duplicated.

- [ ] **Step 3: Wire optimistic move + persistence in EventDetail**

In `EventDetail.tsx`, replace the multi-day grouped block (Task 10) with `<ExpenseDragList groups={ev.dayGroups} expenses={ev.expenses} renderRow={...} onMove={moveExpense} />`. Implement `moveExpense`:

```ts
  const moveExpense = (expenseId: string, toDayDate: string | null) => {
    // Optimistic: reflect the move immediately, then persist.
    setOptimistic((prev) => applyMove(prev ?? ev, expenseId, toDayDate));
    api.events
      .updateExpense(id, expenseId, { dayDate: toDayDate })
      .catch(() => {
        setOptimistic(null); // revert; the next refresh restores server truth
        toast("Couldn't move — try again", '📡');
      });
  };
```

Use a local `optimistic` state layered over `ev` for the render (fall back to `ev` when null; clear `optimistic` whenever a fresh `ev` arrives via a `useEffect` on `ev`). `applyMove` clones the event, sets the expense's `dayDate`, and recomputes `dayGroups` client-side for the interim frame (a small local port of `computeDayGroups`, or simplest: recompute subtotals inline). Keep it minimal — the authoritative `dayGroups` returns on the `bumpData()` refresh that `updateExpense` triggers.

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify the drag end-to-end**

Launch the app (run skill). On a multi-day event: long-press an expense, drag it over another day section (confirm it highlights), release, and confirm the expense reappears under the new day with updated subtotals and survives a screen refresh. Test dropping back on the origin (no-op) and a failed move (revert + toast) if you can force an API error.

- [ ] **Step 6: Commit**

```bash
cd mobile && git add src/screens/events/ExpenseDragList.tsx src/screens/events/EventDetail.tsx src/screens/events/ExpenseRow.tsx 2>/dev/null; git add -A src/screens/events
git commit -m "feat(mobile): drag an expense to move it to another day"
```

---

## Final verification

- [ ] `cd backend && npx jest src/events src/ai-chat/tools/events.tools.spec.ts` — all green.
- [ ] `cd backend && npx tsc --noEmit` — clean.
- [ ] `cd mobile && npx jest src/api/adapters.events.spec.ts src/screens/events/eventDates.spec.ts` — all green.
- [ ] `cd mobile && npx tsc --noEmit` — clean.
- [ ] Manual (run skill): create a multi-day event → add expenses across days + Unscheduled → drag between days → confirm subtotals and Munshi "how's my <event>?" reads the range. Confirm a single-day event is visually unchanged end-to-end.
