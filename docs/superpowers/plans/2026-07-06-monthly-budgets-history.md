# Monthly Budgets with History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock budgets to one-per-calendar-month, add month-history browsing (view-only past months, carry-forward setup) to the mobile Budgets screen, and fix the two `raw[0]`-as-current bugs.

**Architecture:** No entity change. The backend gains a `?month=YYYY-MM` filter on `GET /budgets` and a one-per-month guard on create. The mobile API layer stops treating "newest budget" as "current month" and instead resolves the real calendar month; the Budgets screen gains a month switcher and gates editing to the current month. A final, orthogonal task migrates the deprecated `datetimepicker` `onChange` prop.

**Tech Stack:** NestJS + TypeORM (backend, Jest tests), React Native / Expo SDK 56 + TypeScript 6 (mobile, no unit-test runner — verified with `tsc --noEmit`).

## Global Constraints

- Backend tests run from `backend/`: `npx jest <path>`. Backend uses class-validator DTOs and TypeORM repositories.
- Mobile has **no** jest/lint script. Mobile verification is `cd mobile && npx tsc --noEmit`. Expo SDK 56 — consult https://docs.expo.dev/versions/v56.0.0/ before adding any native API.
- Git author email: `gairola.ashutosh26@gmail.com`. **No** `Co-Authored-By` trailer on commits. Commit with `git -c user.email=gairola.ashutosh26@gmail.com commit`.
- Budget invariant: at most one `Budget` per `(userId, calendar month)`, month derived from `startDate`.
- Month key format is `YYYY-MM` throughout (client and `?month=` param).
- `spent` is always computed live from transactions in `[startDate, endDate]` — never store or freeze it.

---

### Task 1: Backend — `?month=YYYY-MM` filter on `GET /budgets`

**Files:**
- Create: `backend/src/budgets/dto/query-budgets.dto.ts`
- Modify: `backend/src/budgets/budgets.repository.ts` (add `findByMonth`)
- Modify: `backend/src/budgets/budgets.service.ts:23-26` (`findAll` gains optional `month`)
- Modify: `backend/src/budgets/budgets.controller.ts:23-26` (read query param)
- Test: `backend/src/budgets/budgets.service.spec.ts` (append)

**Interfaces:**
- Consumes: existing `BudgetsRepository.findAllByUser`, `computeBudget`, `fetchUserCategories`, `fetchExpensesForBudget`.
- Produces:
  - `class QueryBudgetsDto { month?: string }` (validated `^\d{4}-\d{2}$`)
  - `BudgetsRepository.findByMonth(userId: string, start: Date, end: Date): Promise<Budget[]>`
  - `BudgetsService.findAll(userId: string, month?: string): Promise<ComputedBudget[]>`
  - `BudgetsService.monthBounds(month: string): { start: Date; end: Date }` (static-ish helper; UTC bounds)

- [ ] **Step 1: Write the failing test**

Append to `backend/src/budgets/budgets.service.spec.ts`:

```typescript
describe('BudgetsService.findAll — month filter', () => {
  const emptyCompute = {
    fetchUserCategories: jest.fn().mockResolvedValue([]),
    fetchExpensesForBudget: jest.fn().mockResolvedValue(new Map()),
  };

  it('filters to the requested month via repository.findByMonth', async () => {
    const julyBudget = {
      id: 'jul',
      startDate: new Date('2026-07-01T00:00:00Z'),
      endDate: new Date('2026-07-31T00:00:00Z'),
      categories: [],
    } as unknown as Budget;

    const budgetsRepository = {
      ...emptyCompute,
      findByMonth: jest.fn().mockResolvedValue([julyBudget]),
      findAllByUser: jest.fn().mockResolvedValue([]),
    };
    const service = new BudgetsService(budgetsRepository as never);

    const result = await service.findAll('u1', '2026-07');

    expect(budgetsRepository.findByMonth).toHaveBeenCalledTimes(1);
    expect(budgetsRepository.findAllByUser).not.toHaveBeenCalled();
    const [, start, end] = budgetsRepository.findByMonth.mock.calls[0];
    expect((start as Date).toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect((end as Date).toISOString()).toBe('2026-07-31T23:59:59.999Z');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('jul');
  });

  it('returns all budgets when no month is given', async () => {
    const budgetsRepository = {
      ...emptyCompute,
      findByMonth: jest.fn(),
      findAllByUser: jest.fn().mockResolvedValue([]),
    };
    const service = new BudgetsService(budgetsRepository as never);

    await service.findAll('u1');

    expect(budgetsRepository.findAllByUser).toHaveBeenCalledTimes(1);
    expect(budgetsRepository.findByMonth).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/budgets/budgets.service.spec.ts -t "month filter"`
Expected: FAIL — `findAll` ignores the `month` argument, so `findByMonth` is never called.

- [ ] **Step 3: Create the query DTO**

Create `backend/src/budgets/dto/query-budgets.dto.ts`:

```typescript
import { IsOptional, Matches } from 'class-validator';

export class QueryBudgetsDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month?: string;
}
```

- [ ] **Step 4: Add the repository method**

In `backend/src/budgets/budgets.repository.ts`, add `Between` to the `typeorm` import (line 3 becomes `import { Between, In, Repository } from 'typeorm';`) and add this method after `findAllByUser` (line 39):

```typescript
  findByMonth(userId: string, start: Date, end: Date): Promise<Budget[]> {
    return this.budgetRepo.find({
      where: { userId, startDate: Between(start, end) },
      relations: ['categories'],
      order: { startDate: 'DESC' },
    });
  }
```

- [ ] **Step 5: Update the service**

In `backend/src/budgets/budgets.service.ts`, replace `findAll` (lines 23-26) with:

```typescript
  async findAll(userId: string, month?: string): Promise<ComputedBudget[]> {
    let budgets: Budget[];
    if (month) {
      const { start, end } = this.monthBounds(month);
      budgets = await this.budgetsRepository.findByMonth(userId, start, end);
    } else {
      budgets = await this.budgetsRepository.findAllByUser(userId);
    }
    return Promise.all(budgets.map((b) => this.computeBudget(b, userId)));
  }

  /** UTC [start, end] bounds for a YYYY-MM month key. */
  monthBounds(month: string): { start: Date; end: Date } {
    const [year, mon] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));
    return { start, end };
  }
```

- [ ] **Step 6: Update the controller**

In `backend/src/budgets/budgets.controller.ts`, add `Query` to the `@nestjs/common` import (line 1 block) and `import { QueryBudgetsDto } from './dto/query-budgets.dto';` under the other DTO imports. Replace `findAll` (lines 23-26) with:

```typescript
  @Get()
  findAll(
    @CurrentUser() user: { userId: string; email: string },
    @Query() query: QueryBudgetsDto,
  ) {
    return this.budgetsService.findAll(user.userId, query.month);
  }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && npx jest src/budgets/budgets.service.spec.ts`
Expected: PASS — all `computeBudget` and new `month filter` tests green.

- [ ] **Step 8: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add backend/src/budgets/
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(budgets): filter GET /budgets by ?month=YYYY-MM"
```

---

### Task 2: Backend — one-per-month guard on create

**Files:**
- Modify: `backend/src/budgets/budgets.service.ts:34-58` (`create`)
- Test: `backend/src/budgets/budgets.service.spec.ts` (append)

**Interfaces:**
- Consumes: `BudgetsRepository.findByMonth` (Task 1), `monthBounds` (Task 1).
- Produces: `create` throws `ConflictException` when a budget already exists for `dto.startDate`'s month.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/budgets/budgets.service.spec.ts`:

```typescript
import { ConflictException } from '@nestjs/common';

describe('BudgetsService.create — one per month', () => {
  const baseDto = {
    name: 'July 2026',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    income: 0,
    categories: [],
  };

  it('rejects a second budget in the same month', async () => {
    const budgetsRepository = {
      findByMonth: jest.fn().mockResolvedValue([{ id: 'existing' }]),
      create: jest.fn(),
      save: jest.fn(),
    };
    const service = new BudgetsService(budgetsRepository as never);

    await expect(service.create('u1', baseDto as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(budgetsRepository.save).not.toHaveBeenCalled();
  });

  it('creates when the month is free', async () => {
    const saved = { id: 'new' };
    const budgetsRepository = {
      findByMonth: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockReturnValue(saved),
      save: jest.fn().mockResolvedValue(saved),
      findOneByUser: jest.fn().mockResolvedValue({
        ...saved,
        startDate: new Date('2026-07-01T00:00:00Z'),
        endDate: new Date('2026-07-31T00:00:00Z'),
        categories: [],
      }),
      fetchUserCategories: jest.fn().mockResolvedValue([]),
      fetchExpensesForBudget: jest.fn().mockResolvedValue(new Map()),
    };
    const service = new BudgetsService(budgetsRepository as never);

    const result = await service.create('u1', baseDto as never);

    expect(budgetsRepository.save).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('new');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/budgets/budgets.service.spec.ts -t "one per month"`
Expected: FAIL — `create` never calls `findByMonth`, so the duplicate is not rejected.

- [ ] **Step 3: Add the guard**

In `backend/src/budgets/budgets.service.ts`, add `ConflictException` to the `@nestjs/common` import (line 1 becomes `import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';`). At the top of `create` (before `const budget = ...` at line 35), insert:

```typescript
    const { start, end } = this.monthBounds(dto.startDate.slice(0, 7));
    const clash = await this.budgetsRepository.findByMonth(userId, start, end);
    if (clash.length > 0) {
      throw new ConflictException('A budget already exists for this month');
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest src/budgets/budgets.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add backend/src/budgets/
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(budgets): reject duplicate budget for an existing month"
```

---

### Task 3: Mobile API — month-aware budgets layer

**Files:**
- Modify: `mobile/src/api/index.ts:299-366` (the `budgets:` block)
- Test: none (no mobile test runner) — verified with `tsc --noEmit`.

**Interfaces:**
- Consumes: `apiClient.get<ApiBudget[]>`, `toBudgetCategoryViews`, `resolveCategoryId`, `bumpData`, types `ApiBudget`, `BudgetCategoryView`, `BudgetSummaryView`, `NewBudgetCategoryInput`.
- Produces (new `api.budgets` shape):
  - `list(month?: string): Promise<BudgetCategoryView[]>` — defaults to current month
  - `listMonths(): Promise<string[]>` — sorted-ascending `YYYY-MM` keys that have budgets
  - `currentSummary(): Promise<BudgetSummaryView | null>` — current month only
  - `upsertCategory(input: NewBudgetCategoryInput): Promise<void>` — current month only
  - `setupFromPrevious(): Promise<boolean>` — create current month by copying the latest prior budget; returns `false` if none to copy
  - module-local helpers `ymd(d: Date): string` and `currentMonthKey(): string`

- [ ] **Step 1: Add local date helpers**

In `mobile/src/api/index.ts`, directly above the `budgets: {` line (299), add:

```typescript
// Local YYYY-MM-DD (avoids the UTC shift that toISOString() causes in
// timezones ahead of UTC, which would push a 1st-of-month into the prior day).
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Current calendar month as YYYY-MM (local).
function currentMonthKey(): string {
  return ymd(new Date()).slice(0, 7);
}
```

- [ ] **Step 2: Replace the `budgets` block**

Replace the entire `budgets: { ... }` object (lines 299-366) with:

```typescript
  budgets: {
    /** Category views for a given month (defaults to the current month). */
    async list(month: string = currentMonthKey()): Promise<BudgetCategoryView[]> {
      const raw = await apiClient.get<ApiBudget[]>(`/budgets?month=${month}`);
      if (!raw.length) return [];
      return toBudgetCategoryViews(raw[0]!);
    },

    /** Ascending YYYY-MM keys for every month that has a budget. */
    async listMonths(): Promise<string[]> {
      const raw = await apiClient.get<ApiBudget[]>('/budgets');
      return raw
        .map((b) => b.startDate.slice(0, 7))
        .sort();
    },

    /** Current-month rollup for Home's hero; null when none exists. */
    async currentSummary(): Promise<BudgetSummaryView | null> {
      const raw = await apiClient.get<ApiBudget[]>(
        `/budgets?month=${currentMonthKey()}`,
      );
      if (!raw.length) return null;
      const budget = raw[0]!;
      const end = new Date(budget.endDate);
      const msLeft = end.getTime() - Date.now();
      return {
        monthLabel: new Date(budget.startDate).toLocaleString('en', { month: 'long' }),
        allocated: budget.totalAllocated,
        spent: budget.totalSpent,
        daysLeft: Math.max(1, Math.ceil(msLeft / (24 * 3600 * 1000))),
      };
    },

    /**
     * Adds (or re-allocates) one category budget in the CURRENT month,
     * creating the month's budget if none exists. Backend budget updates
     * replace `categories` wholesale, so existing rows are re-sent.
     */
    async upsertCategory(input: NewBudgetCategoryInput): Promise<void> {
      const month = currentMonthKey();
      const current = await apiClient.get<ApiBudget[]>(`/budgets?month=${month}`);
      const newCat = {
        name: input.name,
        allocated: input.allocated,
        // Link the matching transaction category — `spent` is computed from
        // transactions in these categories, so an empty list never tracks.
        categoryIds: [await resolveCategoryId(input.name)],
        icon: input.icon,
        color: input.color,
      };
      if (!current.length) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        await apiClient.post('/budgets', {
          name: now.toLocaleString('en', { month: 'long', year: 'numeric' }),
          startDate: ymd(start),
          endDate: ymd(end),
          income: 0,
          categories: [newCat],
        });
      } else {
        const budget = current[0]!;
        const kept = budget.categories
          .filter((c) => c.name.toLowerCase() !== input.name.toLowerCase())
          .map((c) => ({
            name: c.name,
            allocated: c.allocated,
            categoryIds: c.categoryIds,
            icon: c.icon,
            color: c.color,
            rollover: c.rollover,
            notes: c.notes,
          }));
        await apiClient.patch(`/budgets/${budget.id}`, { categories: [...kept, newCat] });
      }
      bumpData();
    },

    /**
     * Create the current month's budget by copying categories + allocations
     * from the most recent prior month (spent resets, computed live).
     * Returns false when there is no prior budget to copy.
     */
    async setupFromPrevious(): Promise<boolean> {
      const month = currentMonthKey();
      const all = await apiClient.get<ApiBudget[]>('/budgets'); // newest-first
      const prior = all.find((b) => b.startDate.slice(0, 7) < month);
      if (!prior) return false;

      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      await apiClient.post('/budgets', {
        name: now.toLocaleString('en', { month: 'long', year: 'numeric' }),
        startDate: ymd(start),
        endDate: ymd(end),
        income: prior.income,
        categories: prior.categories.map((c) => ({
          name: c.name,
          allocated: c.allocated,
          categoryIds: c.categoryIds,
          icon: c.icon,
          color: c.color,
          rollover: c.rollover,
          notes: c.notes,
        })),
      });
      bumpData();
      return true;
    },
  },
```

- [ ] **Step 3: Verify types compile**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS — no errors. (`api.budgets.list()` still callable with zero args because `month` defaults.)

- [ ] **Step 4: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add mobile/src/api/index.ts
git -c user.email=gairola.ashutosh26@gmail.com commit -m "fix(budgets): resolve current month explicitly, add month + carry-forward api"
```

---

### Task 4: Mobile — month switcher + read-only past months on Budgets screen

**Files:**
- Modify: `mobile/src/screens/Budgets.tsx`
- Test: none — verified with `tsc --noEmit`.

**Interfaces:**
- Consumes: `api.budgets.list(month)`, `api.budgets.listMonths()`, `api.budgets.setupFromPrevious()`, `useApiData(fetcher, fallback, deps)`, `useFeedback().toast`, existing `Topbar`/`IconButton`/`SectionHead`/`ProgressBar`/`GlassCard`/`MI` imports.
- Produces: a Budgets screen with `viewMonth` state; edit affordances shown only when `viewMonth === currentMonthKey()`.

- [ ] **Step 1: Add month state and helpers**

In `mobile/src/screens/Budgets.tsx`, after the existing imports, add a local month helper block (mirrors the api layer, kept local to avoid exporting internals):

```typescript
function monthKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function monthLabelOf(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' });
}
function prevMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return monthKeyOf(new Date(y, m - 2, 1));
}
function nextMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return monthKeyOf(new Date(y, m, 1));
}
const CURRENT_MONTH = monthKeyOf(new Date());
```

- [ ] **Step 2: Wire month state into the component**

Inside `Budgets`, replace the data line (currently `const { data: budgets } = useApiData(() => api.budgets.list(), EMPTY_BUDGETS);`) with:

```typescript
  const [viewMonth, setViewMonth] = useState(CURRENT_MONTH);
  const { data: budgets } = useApiData(
    () => api.budgets.list(viewMonth),
    EMPTY_BUDGETS,
    [viewMonth],
  );
  const { data: months } = useApiData(() => api.budgets.listMonths(), [] as string[]);

  const isCurrentMonth = viewMonth === CURRENT_MONTH;
  const earliestMonth = months.length ? months[0]! : CURRENT_MONTH;
  const canGoBack = viewMonth > earliestMonth;
  const canGoForward = viewMonth < CURRENT_MONTH;
```

(`useState` is already imported at line 41.)

- [ ] **Step 3: Replace the static month label with a switcher**

The current ring card shows `{monthLabel} Budget` (line 195-196) using `monthLabel` derived at line 97. Delete the line 97 `monthLabel` declaration and replace the ring-info title (lines 194-196) with the switched month:

```tsx
              <Text style={[styles.ringInfoTitle, { color: t.text3, fontFamily: weight(600) }]}>
                {monthLabelOf(viewMonth)}
              </Text>
```

Then add a switcher row directly under the `<Topbar .../>` close tag (after line 149), before `<ScrollView`. The available icons are `MI.back` (left chevron) and `MI.arrow` (right chevron); `IconButton` has **no** `disabled` prop, so render an equal-size spacer `View` when a direction is unavailable to preserve the `space-between` layout:

```tsx
      <View style={styles.monthSwitcher}>
        {canGoBack ? (
          <IconButton onPress={() => setViewMonth(prevMonth(viewMonth))}>
            <MI.back size={20} color={t.text1} />
          </IconButton>
        ) : (
          <View style={styles.switcherSpacer} />
        )}
        <Text style={[styles.monthSwitcherLabel, { color: t.text1, fontFamily: weight(700) }]}>
          {monthLabelOf(viewMonth)}
        </Text>
        {canGoForward ? (
          <IconButton onPress={() => setViewMonth(nextMonth(viewMonth))}>
            <MI.arrow size={20} color={t.text1} />
          </IconButton>
        ) : (
          <View style={styles.switcherSpacer} />
        )}
      </View>
```

- [ ] **Step 4: Gate the "+" button to the current month**

The `Topbar`'s `right` prop currently always renders the plus `IconButton` (lines 144-148). Wrap it so it only appears on the current month:

```tsx
        right={
          isCurrentMonth ? (
            <IconButton onPress={openCreateSheet}>
              <MI.plus size={20} color={t.text1} />
            </IconButton>
          ) : undefined
        }
```

- [ ] **Step 5: Add empty states**

Immediately after the `<SectionHead title="Categories" .../>` wrap (line 213-215), and before the `categoryList` view, add:

```tsx
        {budgets.length === 0 ? (
          <GlassCard contentStyle={styles.emptyCard}>
            <Text style={[styles.emptyText, { color: t.text2, fontFamily: weight(600) }]}>
              {isCurrentMonth
                ? 'No budget set for this month yet.'
                : `No budget was set for ${monthLabelOf(viewMonth)}.`}
            </Text>
            {isCurrentMonth ? (
              <Pressable onPress={() => void setupMonth()} style={[styles.emptyBtn, { backgroundColor: t.em }]}>
                <Text style={[styles.emptyBtnText, { color: t.bg1, fontFamily: weight(700) }]}>
                  Set up budget
                </Text>
              </Pressable>
            ) : null}
          </GlassCard>
        ) : null}
```

Add `Pressable` to the `react-native` import block (lines 42-49). Define `setupMonth` inside the component, above the `return`:

```typescript
  const setupMonth = async () => {
    const copied = await api.budgets.setupFromPrevious();
    if (copied) {
      toast('Budget copied from last month', '🗓️');
    } else {
      newBudget();
    }
  };
```

- [ ] **Step 6: Add the new styles**

Add to the `StyleSheet.create({...})` object:

```typescript
  monthSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 4,
  },
  monthSwitcherLabel: {
    fontSize: 15,
  },
  switcherSpacer: {
    width: 40,
    height: 40,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 28,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
  emptyBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 99,
  },
  emptyBtnText: {
    fontSize: 13,
  },
```

- [ ] **Step 7: Verify types compile**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS — no errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add mobile/src/screens/Budgets.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(budgets): month switcher, read-only history, empty/carry-forward states"
```

---

### Task 5: Manual verification — end-to-end budget history

**Files:** none (verification task).

**Interfaces:** Consumes the running backend + Expo app.

- [ ] **Step 1: Start backend and app**

Run backend (`cd backend && npm run start:dev`) and the Expo app (`cd mobile && npx expo start`). Sign in as a test user.

- [ ] **Step 2: Verify current-month create + carry-forward**

On Budgets: with no budget, tap "Set up budget" → falls through to "New category budget" form (no prior month). Add a category. Confirm the ring + category card render for the current month and the "+" button is present.

- [ ] **Step 3: Verify month switcher bounds**

Tap ◀ — if a prior month budget exists it loads read-only (no "+" button, empty-state text names the month when none). Confirm ▶ is disabled at the current month and ◀ is disabled at the earliest budget month.

- [ ] **Step 4: Verify back-dated actuals flow into a past month**

Add a transaction dated in a past month that has a budget (via Add Tx). Return to Budgets, switch to that month, confirm the category `spent`/progress reflects the new transaction even though allocations were untouched.

- [ ] **Step 5: Verify Home hero uses the real current month**

Ensure the newest budget is a *prior* month, then check Home's budget hero shows the current month's summary (or empty), not the prior month's numbers.

- [ ] **Step 6: Commit (if any fixups were needed)**

Only if steps surfaced fixes:

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add -A
git -c user.email=gairola.ashutosh26@gmail.com commit -m "fix(budgets): address end-to-end verification findings"
```

---

### Task 6 (orthogonal): Migrate deprecated `datetimepicker` `onChange`

Not part of the budgets feature — the user flagged the deprecated date picker separately. `@react-native-community/datetimepicker@9.1.0` deprecates the `onChange` prop in favor of `onValueChange` (value changes) + `onDismiss` (dismissal); same `(event, date?)` signature. Two call sites in `FormSheet.tsx`.

**Files:**
- Modify: `mobile/src/components/FormSheet.tsx:95-138`
- Test: none — verified with `tsc --noEmit` + manual date-field check.

- [ ] **Step 1: Migrate the Android imperative call**

In `mobile/src/components/FormSheet.tsx`, replace the `DateTimePickerAndroid.open({...})` call (lines 95-101) with:

```typescript
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onValueChange: (_e, picked) => {
          if (picked) onChange(toYMD(picked));
        },
      });
```

(`onValueChange` fires only on selection, so the previous `e.type === 'set'` check is no longer needed.)

- [ ] **Step 2: Migrate the iOS component prop**

Replace the iOS `<DateTimePicker ... onChange={onIOSChange} />` (line 131-138) so it uses `onValueChange`:

```tsx
          <DateTimePicker
            value={current}
            mode="date"
            display="spinner"
            themeVariant={mode}
            accentColor={t.em}
            onValueChange={onIOSChange}
          />
```

- [ ] **Step 3: Keep the handler type valid**

`onIOSChange` (line 107) already has signature `(_e: DateTimePickerEvent, picked?: Date) => void`, which matches `onValueChange`. If `tsc` reports `DateTimePickerEvent` is unused after the change, leave the type import — it still types `onIOSChange`. No change needed unless tsc says otherwise.

- [ ] **Step 4: Verify types compile**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS — no errors, no deprecation on `onValueChange`.

- [ ] **Step 5: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add mobile/src/components/FormSheet.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "chore(mobile): migrate datetimepicker onChange to onValueChange"
```

---

## Self-Review Notes

- **Spec coverage:** §2 backend `?month=` (Task 1) + one-per-month guard (Task 2); §3 client layer incl. `currentSummary`/`upsertCategory` bug fixes + carry-forward (Task 3); §4 screen switcher/read-only/empty (Task 4); §5 carry-forward (Task 3 `setupFromPrevious` + Task 4 `setupMonth`); §6 testing (backend unit in Tasks 1-2, manual E2E in Task 5). Date-picker migration (Task 6) is the user's extra ask, kept isolated.
- **YAGNI:** No `/budgets/current` route, no arbitrary/named budgets, no editable past months, no rollover, no income planning — all deferred per spec.
- **Known follow-up not in scope:** the `?month=` response is an array of 0-or-1 elements (client reads `raw[0]`), reusing `ApiBudget[]` typing rather than a nullable body — deliberate, keeps client/serializer simple.
