# Goals: Clickable Cards + Transfer Savings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make goal cards tappable (opening a Goal Detail screen) and let users transfer real money from a source account into a goal's linked savings account, with progress derived from that account's balance.

**Architecture:** Backend derives goal progress from the linked account's balance and gains a `POST /goals/:id/contribute` endpoint that records a `transfer` transaction (source → goal account) by reusing `TransactionsService.create`. Mobile adds an account picker to goal creation, threads the goal `id` through, makes list cards `Pressable`, and adds a new `goal-detail` screen with a transfer action.

**Tech Stack:** NestJS + TypeORM (backend), Expo/React Native + TypeScript (mobile), Jest for both.

## Global Constraints

- Expo SDK 56 — read `https://docs.expo.dev/versions/v56.0.0/` before writing Expo code (mobile/AGENTS.md).
- Git: commit author email `gairola.ashutosh26@gmail.com`; do **not** add a `Co-Authored-By` trailer; `docs/` specs/plans are force-added (`git add -f`).
- Chatbot persona is **Munshi** — never rename; not relevant here but do not touch.
- Money amounts are ₹ (INR); `numeric(18,2)` in the DB.
- Follow existing file patterns; each screen reads its route params from `entry.data`.

---

## Task 1: Derive goal progress from the linked account balance

**Files:**
- Modify: `backend/src/goals/goals.repository.ts:13-19` (load `account` relation)
- Modify: `backend/src/goals/goals.service.ts:17-49` (`computeGoalFields` uses account balance; export it)
- Test: `backend/src/goals/goals.service.spec.ts` (create)

**Interfaces:**
- Produces: `computeGoalFields(goal: Goal): { ...goal; progressPct: number; remaining: number; saved: number; projectedCompletionDate: string | null }` — now exported. When `goal.account` is loaded, `saved = Number(goal.account.balance)`; otherwise `saved = Number(goal.currentAmount)`. `progressPct` and `remaining` are computed from `saved`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/goals/goals.service.spec.ts`:

```ts
import { computeGoalFields } from './goals.service';
import { GoalType, GoalStatus } from '../common/enums';

function baseGoal(overrides: any = {}): any {
  return {
    id: 'g1',
    name: 'Emergency Fund',
    type: GoalType.SAVINGS,
    targetAmount: 100000,
    currentAmount: 0,
    startDate: new Date('2026-01-01'),
    targetDate: new Date('2026-12-31'),
    accountId: null,
    account: null,
    priority: 1,
    status: GoalStatus.ACTIVE,
    contributionFrequency: null,
    contributionAmount: null,
    color: null,
    notes: null,
    userId: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('computeGoalFields', () => {
  it('derives saved/progress/remaining from the linked account balance', () => {
    const goal = baseGoal({
      accountId: 'a1',
      account: { id: 'a1', balance: 25000 },
    });
    const result = computeGoalFields(goal);
    expect(result.saved).toBe(25000);
    expect(result.progressPct).toBe(25);
    expect(result.remaining).toBe(75000);
  });

  it('falls back to currentAmount when no account is linked', () => {
    const goal = baseGoal({ currentAmount: 40000, account: null });
    const result = computeGoalFields(goal);
    expect(result.saved).toBe(40000);
    expect(result.progressPct).toBe(40);
    expect(result.remaining).toBe(60000);
  });

  it('caps progress at 100 and never goes below 0', () => {
    const goal = baseGoal({ accountId: 'a1', account: { balance: 150000 } });
    const result = computeGoalFields(goal);
    expect(result.progressPct).toBe(100);
    expect(result.remaining).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/goals/goals.service.spec.ts`
Expected: FAIL — `computeGoalFields` is not exported / `saved` undefined.

- [ ] **Step 3: Load the account relation in the repository**

In `backend/src/goals/goals.repository.ts`, add `relations: ['account']` to both finders:

```ts
findAllByUser(userId: string): Promise<Goal[]> {
  return this.repo.find({
    where: { userId },
    order: { createdAt: 'ASC' },
    relations: ['account'],
  });
}

findOneByUser(id: string, userId: string): Promise<Goal | null> {
  return this.repo.findOne({ where: { id, userId }, relations: ['account'] });
}
```

- [ ] **Step 4: Update `computeGoalFields` to use the account balance and export it**

In `backend/src/goals/goals.service.ts`, replace the function signature line `function computeGoalFields(goal: Goal) {` with `export function computeGoalFields(goal: Goal) {` and change the top of the body:

```ts
export function computeGoalFields(goal: Goal) {
  const targetAmount = Number(goal.targetAmount);
  const saved =
    goal.account != null
      ? Number(goal.account.balance)
      : Number(goal.currentAmount);

  const progressPct =
    targetAmount > 0
      ? Math.round(Math.min(Math.max((saved / targetAmount) * 100, 0), 100))
      : 0;
  const remaining = Math.max(targetAmount - saved, 0);
```

Then add `saved` to the returned object (keep `progressPct`, `remaining`, `projectedCompletionDate`):

```ts
  return {
    ...goal,
    progressPct,
    remaining,
    saved,
    projectedCompletionDate,
  };
}
```

(The `projectedCompletionDate` block below is unchanged.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest src/goals/goals.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/goals/goals.repository.ts backend/src/goals/goals.service.ts backend/src/goals/goals.service.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(goals): derive progress from linked account balance"
```

---

## Task 2: `POST /goals/:id/contribute` endpoint (transfer savings into a goal)

**Files:**
- Create: `backend/src/goals/dto/contribute-goal.dto.ts`
- Modify: `backend/src/goals/goals.service.ts` (add `contribute`, inject deps)
- Modify: `backend/src/goals/goals.controller.ts` (add route)
- Modify: `backend/src/goals/goals.module.ts` (import Transactions + Categories modules)
- Modify: `backend/src/categories/categories.module.ts` (ensure `CategoriesService` is exported — verify first)
- Test: `backend/src/goals/goals.service.spec.ts` (extend)

**Interfaces:**
- Consumes: `computeGoalFields` (Task 1); `TransactionsService.create(userId, CreateTransactionDto)`; `CategoriesService.findAll(userId)` / `.create(userId, { name })`.
- Produces: `GoalsService.contribute(id: string, userId: string, dto: { amount: number; sourceAccountId: string })` → the recomputed goal. Route `POST /goals/:id/contribute`.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/goals/goals.service.spec.ts`:

```ts
import { GoalsService } from './goals.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionType } from '../common/enums';

describe('GoalsService.contribute', () => {
  function makeService(goal: any) {
    const goalsRepository = {
      findOneByUser: jest.fn().mockResolvedValue(goal),
    };
    const transactionsService = {
      create: jest.fn().mockResolvedValue({ id: 'tx1' }),
    };
    const categoriesService = {
      findAll: jest.fn().mockResolvedValue([{ id: 'cat-transfer', name: 'Transfer' }]),
      create: jest.fn(),
    };
    const events = { emit: jest.fn() };
    const svc = new GoalsService(
      goalsRepository as any,
      events as any,
      transactionsService as any,
      categoriesService as any,
    );
    return { svc, goalsRepository, transactionsService, categoriesService };
  }

  const linkedGoal = {
    id: 'g1',
    name: 'Emergency Fund',
    targetAmount: 100000,
    currentAmount: 0,
    accountId: 'goal-acct',
    account: { id: 'goal-acct', balance: 0 },
  };

  it('creates a transfer from the source into the goal account', async () => {
    const { svc, transactionsService } = makeService({ ...linkedGoal });
    await svc.contribute('g1', 'u1', { amount: 5000, sourceAccountId: 'src-acct' });
    expect(transactionsService.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        type: TransactionType.TRANSFER,
        accountId: 'src-acct',
        destinationAccountId: 'goal-acct',
        amount: 5000,
        categoryId: 'cat-transfer',
      }),
    );
  });

  it('throws when the goal is not found', async () => {
    const { svc } = makeService(null);
    await expect(
      svc.contribute('g1', 'u1', { amount: 5000, sourceAccountId: 'src-acct' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when the goal has no linked account', async () => {
    const { svc } = makeService({ ...linkedGoal, accountId: null, account: null });
    await expect(
      svc.contribute('g1', 'u1', { amount: 5000, sourceAccountId: 'src-acct' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when source equals the goal account', async () => {
    const { svc } = makeService({ ...linkedGoal });
    await expect(
      svc.contribute('g1', 'u1', { amount: 5000, sourceAccountId: 'goal-acct' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/goals/goals.service.spec.ts`
Expected: FAIL — `GoalsService` constructor arity / `contribute` undefined.

- [ ] **Step 3: Verify CategoriesService is exported**

Run: `grep -n "exports" backend/src/categories/categories.module.ts`
If `CategoriesService` is not in `exports`, add it:

```ts
exports: [TypeOrmModule, CategoriesService],
```

- [ ] **Step 4: Create the DTO**

Create `backend/src/goals/dto/contribute-goal.dto.ts`:

```ts
import { IsPositive, IsUUID } from 'class-validator';

export class ContributeGoalDto {
  @IsPositive()
  amount: number;

  @IsUUID()
  sourceAccountId: string;
}
```

- [ ] **Step 5: Add deps + `contribute` to the service**

In `backend/src/goals/goals.service.ts`, add imports:

```ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { TransactionsService } from '../transactions/transactions.service';
import { CategoriesService } from '../categories/categories.service';
import { CreateTransactionDto } from '../transactions/dto/create-transaction.dto';
import { TransactionType, TransactionStatus } from '../common/enums';
```

Extend the constructor:

```ts
constructor(
  private readonly goalsRepository: GoalsRepository,
  private readonly events: EventEmitter2,
  private readonly transactionsService: TransactionsService,
  private readonly categoriesService: CategoriesService,
) {}
```

Add the method (find-or-create a "Transfer" category, then delegate):

```ts
async contribute(
  id: string,
  userId: string,
  dto: { amount: number; sourceAccountId: string },
) {
  const goal = await this.goalsRepository.findOneByUser(id, userId);
  if (!goal) throw new NotFoundException('Goal not found');
  if (!goal.accountId) {
    throw new BadRequestException('Goal has no linked account');
  }
  if (dto.sourceAccountId === goal.accountId) {
    throw new BadRequestException('Source and destination accounts must differ');
  }

  const categories = await this.categoriesService.findAll(userId);
  let transferCat = categories.find((c) => c.name === 'Transfer');
  if (!transferCat) {
    transferCat = await this.categoriesService.create(userId, { name: 'Transfer' });
  }

  const previousPct = computeGoalFields(goal).progressPct;

  const txDto: CreateTransactionDto = {
    date: new Date().toISOString(),
    description: `Savings → ${goal.name}`,
    amount: dto.amount,
    type: TransactionType.TRANSFER,
    categoryId: transferCat.id,
    accountId: dto.sourceAccountId,
    destinationAccountId: goal.accountId,
    status: TransactionStatus.CLEARED,
  } as CreateTransactionDto;

  await this.transactionsService.create(userId, txDto);

  const updated = await this.goalsRepository.findOneByUser(id, userId);
  const computed = computeGoalFields(updated!);
  if (computed.progressPct !== previousPct) {
    this.events.emit(GOAL_UPDATED, {
      userId,
      goalId: goal.id,
      previousPct,
      newPct: computed.progressPct,
    });
  }
  return computed;
}
```

- [ ] **Step 6: Add the controller route**

In `backend/src/goals/goals.controller.ts`, import the DTO and add the route (after `create`):

```ts
import { ContributeGoalDto } from './dto/contribute-goal.dto';

// ...

@Post(':id/contribute')
contribute(
  @CurrentUser() user: { userId: string; email: string },
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: ContributeGoalDto,
) {
  return this.goalsService.contribute(id, user.userId, dto);
}
```

- [ ] **Step 7: Wire module imports**

In `backend/src/goals/goals.module.ts`:

```ts
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Goal]),
    TransactionsModule,
    CategoriesModule,
  ],
  controllers: [GoalsController],
  providers: [GoalsRepository, GoalsService],
  exports: [TypeOrmModule, GoalsService],
})
export class GoalsModule {}
```

- [ ] **Step 8: Run tests + build**

Run: `cd backend && npx jest src/goals/goals.service.spec.ts && npx tsc --noEmit`
Expected: PASS (all goals tests); no type errors. If `npx tsc --noEmit` is not how this repo type-checks, run `npm run build`.

- [ ] **Step 9: Commit**

```bash
git add backend/src/goals backend/src/categories/categories.module.ts
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(goals): add POST /goals/:id/contribute to transfer savings into a goal"
```

---

## Task 3: Mobile API layer — goal types, adapter, and endpoints

**Files:**
- Modify: `mobile/src/api/types.ts` (`ApiGoal`, `GoalView`, `NewGoalInput`)
- Modify: `mobile/src/api/adapters.ts:228-240` (`toGoalView`)
- Modify: `mobile/src/api/index.ts` (`goals.get`, `goals.contribute`, `goals.create` accountId, `accounts.create` returns account)
- Test: `mobile/src/api/adapters.spec.ts` (create)

**Interfaces:**
- Consumes: backend `POST /goals/:id/contribute`, `GET /goals/:id`, computed `saved`/`progressPct`/`remaining` fields on `ApiGoal`.
- Produces:
  - `GoalView` gains `id: string`, `accountId?: string`, `saved: number`, `remaining: number`.
  - `NewGoalInput` gains `accountId?: string`.
  - `api.goals.get(id: string): Promise<GoalView>`
  - `api.goals.contribute(id: string, input: { amount: number; sourceAccountId: string }): Promise<void>`
  - `api.accounts.create(input: NewAccountInput): Promise<AccountView>`

- [ ] **Step 1: Write the failing adapter test**

Create `mobile/src/api/adapters.spec.ts`:

```ts
import { toGoalView } from './adapters';
import type { ApiGoal } from './types';

const apiGoal = {
  id: 'g1',
  name: 'Emergency Fund',
  type: 'savings',
  targetAmount: 100000,
  currentAmount: 0,
  startDate: '2026-01-01',
  targetDate: '2026-12-31',
  accountId: 'a1',
  priority: 1,
  status: 'active',
  saved: 25000,
  remaining: 75000,
} as ApiGoal;

describe('toGoalView', () => {
  it('threads id and accountId and uses backend saved/remaining', () => {
    const v = toGoalView(apiGoal);
    expect(v.id).toBe('g1');
    expect(v.accountId).toBe('a1');
    expect(v.saved).toBe(25000);
    expect(v.remaining).toBe(75000);
    expect(v.current).toBe(25000); // current mirrors saved for display
    expect(v.target).toBe(100000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest src/api/adapters.spec.ts`
Expected: FAIL — `v.id`/`v.saved` undefined.

- [ ] **Step 3: Extend the types**

In `mobile/src/api/types.ts`, add computed fields to `ApiGoal` (after `notes?: string;`, before the closing brace at line 99):

```ts
  saved?: number; // ₹ — backend-computed (linked account balance or currentAmount)
  remaining?: number; // ₹
  progressPct?: number;
```

Replace the `GoalView` interface (lines 327-334):

```ts
export interface GoalView {
  id: string;
  accountId?: string;
  name: string;
  emoji: string;
  color: string;
  current: number; // mirrors `saved`, kept for existing card display
  saved: number;
  remaining: number;
  target: number;
  date: string; // display string e.g. "Dec 2026"
}
```

Add `accountId` to `NewGoalInput` (after `targetDate: string;`):

```ts
  /** Linked savings account the goal's progress derives from. */
  accountId?: string;
```

- [ ] **Step 4: Update the adapter**

In `mobile/src/api/adapters.ts`, replace `toGoalView` (lines 228-240):

```ts
export function toGoalView(goal: ApiGoal): GoalView {
  const d = new Date(goal.targetDate);
  const displayDate = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const saved = goal.saved ?? goal.currentAmount;
  return {
    id: goal.id,
    accountId: goal.accountId,
    name: goal.name,
    emoji: goalEmoji(goal.type),
    color: goal.color ?? '#7faf93',
    current: saved,
    saved,
    remaining: goal.remaining ?? Math.max(goal.targetAmount - saved, 0),
    target: goal.targetAmount,
    date: displayDate,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd mobile && npx jest src/api/adapters.spec.ts`
Expected: PASS.

- [ ] **Step 6: Add API methods**

In `mobile/src/api/index.ts`, change `accounts.create` (lines 371-374) to return the created account:

```ts
async create(input: NewAccountInput): Promise<AccountView> {
  const raw = await apiClient.post<ApiAccount>('/accounts', input);
  bumpData();
  return toAccountView(raw, ACCOUNT_GRADIENTS[raw.type] ?? ACCOUNT_GRADIENTS['other'], 0);
}
```

Replace the `goals` block (lines 636-653) to pass `accountId`, and add `get` + `contribute`:

```ts
goals: {
  async list(): Promise<GoalView[]> {
    const raw = await apiClient.get<ApiGoal[]>('/goals');
    return raw.map(toGoalView);
  },

  async get(id: string): Promise<GoalView> {
    const raw = await apiClient.get<ApiGoal>(`/goals/${id}`);
    return toGoalView(raw);
  },

  async create(input: NewGoalInput): Promise<void> {
    await apiClient.post('/goals', {
      name: input.name,
      type: input.type,
      targetAmount: input.target,
      currentAmount: input.current ?? 0,
      startDate: todayIso(),
      targetDate: input.targetDate,
      accountId: input.accountId,
    });
    bumpData();
  },

  async contribute(
    id: string,
    input: { amount: number; sourceAccountId: string },
  ): Promise<void> {
    await apiClient.post(`/goals/${id}/contribute`, {
      amount: input.amount,
      sourceAccountId: input.sourceAccountId,
    });
    bumpData();
  },
},
```

Confirm `toAccountView`, `ACCOUNT_GRADIENTS`, and `ApiAccount` are already imported in this file (they are used by `accounts.list`); if `ApiAccount` is not imported, add it to the existing type import from `./types`.

- [ ] **Step 7: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors. (Downstream `Goals.tsx` still compiles — `GoalView` gained fields, none removed.)

- [ ] **Step 8: Commit**

```bash
git add mobile/src/api/types.ts mobile/src/api/adapters.ts mobile/src/api/index.ts mobile/src/api/adapters.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): goal id/accountId/saved in api layer + goals.get/contribute"
```

---

## Task 4: Account picker in the New Goal form

**Files:**
- Modify: `mobile/src/screens/Goals.tsx` (fetch accounts; add `select` field; create-account-on-new flow)

**Interfaces:**
- Consumes: `api.accounts.list()` → `AccountView[]`; `api.accounts.create()` → `AccountView` (Task 3); `FormFieldSpec` `kind: 'select'` with `options: {label,value}[]`.
- Produces: goals created with `accountId` set.

- [ ] **Step 1: Fetch accounts and import the field type**

In `mobile/src/screens/Goals.tsx`, add near the other imports:

```ts
import type { FormFieldSpec } from '../components/FormSheet';
```

Inside the `Goals` component, after the existing `useApiData` for goals:

```ts
const { data: accounts } = useApiData(() => api.accounts.list(), []);
```

- [ ] **Step 2: Build the account select and thread accountId through `newGoal`**

Replace the `newGoal` function body's `fields` array and `onSubmit` so it offers existing savings/cash accounts plus a "new account" option, and links the chosen (or newly created) account:

```ts
const newGoal = (type: 'savings' | 'debt') => {
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  const NEW_ACCOUNT = '__new__';
  const linkable = accounts.filter((a) => a.type === 'savings' || a.type === 'cash');
  const accountField: FormFieldSpec = {
    kind: 'select',
    key: 'account',
    label: 'Savings account',
    initial: NEW_ACCOUNT,
    options: [
      { label: '＋ New account for this goal', value: NEW_ACCOUNT },
      ...linkable.map((a) => ({ label: a.name, value: String(a.id) })),
    ],
  };

  form({
    title: type === 'debt' ? 'New debt payoff goal' : 'New savings goal',
    fields: [
      { key: 'name', label: 'Goal name', placeholder: type === 'debt' ? 'Credit card payoff' : 'Emergency fund' },
      { kind: 'amount', key: 'target', label: 'Target amount (₹)' },
      { kind: 'amount', key: 'current', label: 'Saved so far (₹)', optional: true },
      accountField,
      {
        kind: 'date',
        key: 'targetDate',
        label: 'Target date',
        initial: nextYear.toISOString().slice(0, 10),
      },
    ],
    submitLabel: 'Create goal',
    onSubmit: async (v) => {
      let accountId = v['account'];
      if (accountId === NEW_ACCOUNT) {
        const created = await api.accounts.create({
          name: v['name']!,
          type: 'savings',
          balance: v['current'] ? Number(v['current']) : 0,
        });
        accountId = String(created.id);
      }
      await api.goals.create({
        name: v['name']!,
        type,
        target: Number(v['target']),
        current: v['current'] ? Number(v['current']) : 0,
        targetDate: v['targetDate']!,
        accountId,
      });
      toast(`Goal created: ${v['name']}`, '🎯');
    },
  });
};
```

Note: when a **new** account is created seeded with the "Saved so far" amount, progress already reflects it (balance-derived); the goal's `currentAmount` is only a fallback for unlinked goals, so passing `current` here is harmless.

- [ ] **Step 3: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification (per verify skill)**

Confirm the New Goal form shows a "Savings account" select defaulting to "＋ New account for this goal", and creating a goal with it produces a linked savings account (visible on the Accounts screen). Follow the project run/verify skill to launch the app.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/Goals.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): link a savings account when creating a goal"
```

---

## Task 5: Goal Detail screen with transfer + link-account actions

**Files:**
- Create: `mobile/src/screens/GoalDetail.tsx`

**Interfaces:**
- Consumes: `entry.data as GoalView` (pushed in Task 6); `api.goals.get`, `api.goals.contribute`, `api.goals.update` (exists), `api.accounts.list`; `MPageShell`, `useNav().pop`, `useFeedback()`.
- Produces: `export function GoalDetail({ entry }: { entry: ScreenEntry })`.

- [ ] **Step 1: Create the screen**

Create `mobile/src/screens/GoalDetail.tsx`. It reads the goal from `entry.data`, re-fetches the live goal by id, renders progress + stats, and offers Transfer (linked) or Link-account (unlinked):

```tsx
/**
 * GoalDetail — full-screen drill-in for a goal (pushed from Goals.tsx).
 * Progress is derived server-side from the goal's linked account balance;
 * "Transfer savings" moves money from a chosen source account into that
 * linked account via api.goals.contribute. Goals with no linked account
 * (legacy) instead offer "Link a savings account".
 */
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '../components/Glass';
import { AppIconBox } from '../components/contentIcons';
import { ProgressBar, SectionHead } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import { space, weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import type { FormFieldSpec } from '../components/FormSheet';
import { api } from '../api';
import { useApiData } from '../api/useApi';
import { MPageShell } from './_MPageShell';
import type { GoalView } from '../api/types';

function fmt(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function GoalDetail({ entry }: { entry: ScreenEntry }) {
  const seed = entry.data as GoalView;
  const { t } = useTheme();
  const { pop } = useNav();
  const { toast, form } = useFeedback();

  const { data: goal } = useApiData(() => api.goals.get(seed.id), seed);
  const { data: accounts } = useApiData(() => api.accounts.list(), []);

  const pct = goal.target > 0 ? Math.round((goal.saved / goal.target) * 100) : 0;

  const transfer = () => {
    const sources = accounts.filter((a) => String(a.id) !== goal.accountId);
    if (sources.length === 0) {
      toast('Add another account to transfer from', '🏦');
      return;
    }
    const sourceField: FormFieldSpec = {
      kind: 'select',
      key: 'source',
      label: 'From account',
      initial: String(sources[0]!.id),
      options: sources.map((a) => ({ label: a.name, value: String(a.id) })),
    };
    form({
      title: `Transfer to ${goal.name}`,
      fields: [sourceField, { kind: 'amount', key: 'amount', label: 'Amount (₹)' }],
      submitLabel: 'Transfer',
      onSubmit: async (v) => {
        await api.goals.contribute(goal.id, {
          amount: Number(v['amount']),
          sourceAccountId: v['source']!,
        });
        toast(`Transferred ${fmt(Number(v['amount']))} to ${goal.name}`, '🎯');
        pop(); // list is fresh; this screen holds seed route data
      },
    });
  };

  const linkAccount = () => {
    const linkable = accounts.filter((a) => a.type === 'savings' || a.type === 'cash');
    if (linkable.length === 0) {
      toast('Create a savings account first', '🏦');
      return;
    }
    const field: FormFieldSpec = {
      kind: 'select',
      key: 'account',
      label: 'Savings account',
      initial: String(linkable[0]!.id),
      options: linkable.map((a) => ({ label: a.name, value: String(a.id) })),
    };
    form({
      title: 'Link a savings account',
      fields: [field],
      submitLabel: 'Link account',
      onSubmit: async (v) => {
        await api.goals.update(goal.id, { accountId: v['account']! });
        toast('Account linked', '🔗');
        pop();
      },
    });
  };

  return (
    <MPageShell title={goal.name} onBack={pop}>
      <View style={styles.body}>
        <GlassCard style={styles.headerCard}>
          <View style={styles.headerRow}>
            <AppIconBox value={goal.emoji} color={goal.color} size={48} iconSize={22} />
            <View style={styles.headerText}>
              <Text style={[styles.name, { color: t.text1, fontFamily: weight(700) }]}>{goal.name}</Text>
              <Text style={[styles.sub, { color: t.text3 }]}>Target {goal.date}</Text>
            </View>
            <Text style={[styles.pct, { color: goal.color, fontFamily: weight(700) }]}>{pct}%</Text>
          </View>
          <ProgressBar pct={pct} color={goal.color} height={8} />
          <View style={styles.stats}>
            <Stat label="Saved" value={fmt(goal.saved)} t={t} />
            <Stat label="Target" value={fmt(goal.target)} t={t} />
            <Stat label="Remaining" value={fmt(goal.remaining)} t={t} />
          </View>
        </GlassCard>

        {goal.accountId ? (
          <GlassCard style={styles.actionCard} onPress={transfer}>
            <Text style={[styles.action, { color: goal.color, fontFamily: weight(700) }]}>Transfer savings</Text>
          </GlassCard>
        ) : (
          <GlassCard style={styles.actionCard} onPress={linkAccount}>
            <Text style={[styles.action, { color: goal.color, fontFamily: weight(700) }]}>Link a savings account</Text>
          </GlassCard>
        )}
      </View>
    </MPageShell>
  );
}

function Stat({ label, value, t }: { label: string; value: string; t: any }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: t.text3 }]}>{label}</Text>
      <Text style={[styles.statValue, { color: t.text1, fontFamily: weight(700) }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space[18], paddingTop: space[8], gap: space[14] },
  headerCard: { padding: space[18], gap: space[12] },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 18 },
  sub: { fontSize: 12, marginTop: space[2] },
  pct: { fontSize: 18 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space[4] },
  stat: { gap: space[2] },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 16 },
  actionCard: { padding: space[18], alignItems: 'center' },
  action: { fontSize: 16 },
});
```

- [ ] **Step 2: Verify `MPageShell` and `GlassCard` props**

Run: `grep -n "onBack\|title\|export function MPageShell\|interface" mobile/src/screens/_MPageShell.tsx` and `grep -n "onPress\|export function GlassCard\|interface GlassCardProps" mobile/src/components/Glass.tsx`.
Expected: `MPageShell` accepts `title` and a back handler; `GlassCard` accepts `onPress`. If prop names differ (e.g. shell uses `useNav().pop` internally rather than an `onBack` prop, or `GlassCard` has no `onPress`), adjust the screen: for a non-pressable `GlassCard`, wrap it in a `Pressable`; match the shell's actual back prop. Use `AccountDetail.tsx` (which already uses `MPageShell`) as the reference for exact usage.

- [ ] **Step 3: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors (the screen is not yet registered/imported — that is Task 6; this step only checks the file itself compiles). If tsc reports "unused" only, that is fine.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/GoalDetail.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): add GoalDetail screen with transfer + link-account actions"
```

---

## Task 6: Register `goal-detail` and make goal cards tappable

**Files:**
- Modify: `mobile/src/app/navContext.tsx:24-47` (add `'goal-detail'` to `ScreenKind`)
- Modify: `mobile/src/app/screens.tsx` (import + register)
- Modify: `mobile/src/screens/Goals.tsx` (wrap card in `Pressable` → push)

**Interfaces:**
- Consumes: `GoalDetail` (Task 5); `useNav().push`.
- Produces: tapping a goal card pushes `{ kind: 'goal-detail', data: goal }`.

- [ ] **Step 1: Add the screen kind**

In `mobile/src/app/navContext.tsx`, add `'goal-detail'` to the `ScreenKind` union (e.g. after `'goals'`):

```ts
  | 'goals'
  | 'goal-detail'
```

- [ ] **Step 2: Register the component**

In `mobile/src/app/screens.tsx`, add the import (alphabetically near `Goals`):

```ts
import { GoalDetail } from '../screens/GoalDetail';
```

And register it in `SCREEN_REGISTRY`:

```ts
  goals: Goals,
  'goal-detail': GoalDetail,
```

- [ ] **Step 3: Make the goal card tappable**

In `mobile/src/screens/Goals.tsx`, import `Pressable` from `react-native` and `useNav`:

```ts
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useNav } from '../app/navContext';
```

Inside the component, get `push`:

```ts
const { push } = useNav();
```

Wrap the goal card (the `<GlassView ...>` inside the `.map`) in a `Pressable` that pushes the detail. Change the `SpringIn` child so the card is pressable, keeping the `key` on the outer `SpringIn`:

```tsx
<SpringIn key={g.id} delay={50 + i * 50}>
  <Pressable onPress={() => push({ kind: 'goal-detail', data: g })}>
    <GlassView style={styles.goalCard} intensity={40} radius={radius.xl} padding={0}>
      {/* ...existing card contents unchanged... */}
    </GlassView>
  </Pressable>
</SpringIn>
```

Also change the map key from `key={g.name}` to `key={g.id}` (goals now carry a stable id).

- [ ] **Step 4: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification (verify skill)**

Launch the app (project run skill). Tap a goal → GoalDetail opens. For a goal with a linked account, "Transfer savings" moves money from a source account and progress advances; for a legacy goal, "Link a savings account" links one. Verify the source account balance drops by the transferred amount on the Accounts screen.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/app/navContext.tsx mobile/src/app/screens.tsx mobile/src/screens/Goals.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): tappable goal cards open GoalDetail"
```

---

## Self-Review Notes

- **Spec coverage:** progress-from-balance (T1); contribute endpoint w/ guards (T2); mobile types/adapter/API (T3); account-linking at creation (T4); GoalDetail screen w/ transfer + legacy link-account (T5); clickable cards + registration (T6). All spec sections covered. Out-of-scope items (history, recurring, withdrawals) intentionally excluded.
- **Type consistency:** `contribute(id, { amount, sourceAccountId })` and `GoalView.{id,accountId,saved,remaining}` used identically across backend, api layer, and screens. `computeGoalFields` exported once (T1) and reused (T2).
- **Known verification points folded into steps:** T2S3 (CategoriesService export), T5S2 (MPageShell/GlassCard prop names) — each step tells the implementer exactly what to check and how to adjust, using an existing reference file.
