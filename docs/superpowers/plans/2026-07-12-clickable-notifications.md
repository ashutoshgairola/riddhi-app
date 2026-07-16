# Clickable Notifications with Redirection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every in-app notification tappable so it marks itself read and redirects to the correct screen (including a specific goal's detail page), matching the existing push-notification deep-link behavior.

**Architecture:** The in-app Notifications list reuses the same `mapNotificationToScreen()` deep-link resolver the push path already uses, plus a new type-based fallback for legacy rows with no payload. The backend enriches goal-related payloads to point at the `goal-detail` screen. Detail screens that can be reached from a bare `{ id }` payload gain a fetch-by-id path.

**Tech Stack:** React Native / Expo (mobile), NestJS + TypeORM (backend), Jest + ts-jest (both).

## Global Constraints

- **Prerequisite:** the `goal-detail` `ScreenKind` + `GoalDetail` screen + `api.goals.get(id)` come from `docs/superpowers/specs/2026-07-12-goals-clickable-transfer-savings-design.md`. That work must be merged before Task 9 (and before goal deep-links resolve to anything). Tasks 1–8 do not depend on it.
- Mobile Jest runs pure-logic specs only (`testMatch: **/src/**/*.spec.ts(x)`); there is no component-rendering harness. Screen/`useEffect` behavior (Tasks 7–9) is verified manually, not by unit test.
- Git commit prefs (repo convention): author email `gairola.ashutosh26@gmail.com`, **no** `Co-Authored-By` trailer. `docs/` is force-added (`git add -f`).
- Run mobile tests from `mobile/`, backend tests from `backend/`.
- The chatbot persona is **Munshi** — never rename it.

## Sequencing (execution rounds)

The `goal-detail` screen / `api.goals.get` prerequisite is **not yet merged**
(mobile `GoalDetail.tsx`, the `goal-detail` `ScreenKind`, and `api.goals.get`
do not exist). Execution is split:

- **Round 1 (now):** Tasks 4, 5, 6, 7, 8. Every notification becomes clickable
  with zero dead links. Task 6 is scoped to **exclude** `goal-detail` plumbing
  so the `ScreenKind` union (owned by the goals-clickable plan) is untouched.
  Goal notifications route to the **Goals list** (deferred Task 1 leaves
  `goal_progress` emitting `{ screen: 'goals' }`; the type fallback maps
  `goal → goals`), and munshi notifications keep their current `→ chat`
  payload. Both resolve today.
- **Round 2 (after the goals-clickable plan merges):** Tasks 1, 2, 3, 9, plus
  the deferred Task 6 additions (add `'goal-detail'` to `ALLOWED` / `ID_SCREENS`
  and its resolver test). This upgrades goal + goal-focused-munshi
  notifications to the specific goal's detail page. **Task 2 moves here** (not
  Round 1) because it is type-coupled to Task 3: it adds `id` to
  `MunshiSnapshot.goals`, which `buildSnapshot` (Task 3) must populate, and its
  `munshiDeepLink` helper is unused until Task 3 wires it — so the two ship
  together.

---

## File Structure

**Backend**
- `backend/src/notifications/notifications.listener.ts` — `goal_progress` payload → `goal-detail` + id
- `backend/src/notifications/munshi-suggestion.prompt.ts` — snapshot goal `id`, `focus`/`focusGoal` contract + parse + `munshiDeepLink()` helper
- `backend/src/notifications/notifications.scheduler.ts` — snapshot maps goal id; munshi payload from `munshiDeepLink()`
- `*.spec.ts` alongside each

**Mobile**
- `mobile/src/api/types.ts` — `NotificationView.id`
- `mobile/src/api/adapters.ts` — map `id`
- `mobile/src/api/index.ts` — `notifications.markRead(id)`, `transactions.get(id)`
- `mobile/src/notifications/deepLink.ts` — `goal-detail` allow-list, `fallbackTargetForType()`
- `mobile/src/notifications/deepLink.spec.ts` — new
- `mobile/src/api/adapters.spec.ts` — add `toNotificationView` case
- `mobile/src/screens/Notifications.tsx` — pressable cards + tap handler
- `mobile/src/screens/TxDetail.tsx` — stub-payload fetch-by-id
- `mobile/src/screens/GoalDetail.tsx` — stub-payload fetch-by-id (prerequisite file)

---

## Task 1: Goal-progress notification → goal-detail + id (backend)

**Files:**
- Modify: `backend/src/notifications/notifications.listener.ts` (`onGoalUpdated`, ~line 95)
- Test: `backend/src/notifications/notifications.listener.spec.ts` (~line 60)

**Interfaces:**
- Consumes: `GoalUpdatedEvent { userId: string; goalId: string; previousPct: number; newPct: number }` (already defined in `notification-events.ts`).
- Produces: `goal_progress` notifications now carry `data: { screen: 'goal-detail', id: <goalId> }`.

- [ ] **Step 1: Update the failing test**

In `notifications.listener.spec.ts`, change the goal-progress assertion's `data`:

```ts
  it('creates a goal_progress notification on milestone crossing', async () => {
    const { listener, notifications } = setup();
    await listener.onGoalUpdated({ userId: 'u1', goalId: 'g1', previousPct: 40, newPct: 55 });
    expect(notifications.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        type: NotificationType.GOAL_PROGRESS,
        data: { screen: 'goal-detail', id: 'g1' },
      }),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/notifications/notifications.listener.spec.ts -t "goal_progress"`
Expected: FAIL — received `data: { screen: 'goals' }`.

- [ ] **Step 3: Update the listener**

In `notifications.listener.ts` `onGoalUpdated`, change the `data` line:

```ts
        data: { screen: 'goal-detail', id: e.goalId },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/notifications/notifications.listener.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(notifications): goal_progress deep-links to goal-detail"
```

---

## Task 2: Munshi contract — snapshot id, focus/focusGoal, parse, deep-link helper (backend)

**Files:**
- Modify: `backend/src/notifications/munshi-suggestion.prompt.ts`
- Test: `backend/src/notifications/munshi-suggestion.prompt.spec.ts` (create if absent)

**Interfaces:**
- Produces:
  - `MunshiSnapshot.goals: { id: string; name: string; progressPct: number }[]`
  - `interface MunshiSuggestion { title: string; body: string; focus?: 'budget' | 'goal'; focusGoal?: string }`
  - `parseMunshiSuggestion(text: string): MunshiSuggestion | null`
  - `munshiDeepLink(s: MunshiSuggestion, goals: { id: string; name: string }[]): { screen: string; id?: string }`

- [ ] **Step 1: Write the failing tests**

Create/extend `backend/src/notifications/munshi-suggestion.prompt.spec.ts`:

```ts
import { parseMunshiSuggestion, munshiDeepLink } from './munshi-suggestion.prompt';

describe('parseMunshiSuggestion focus', () => {
  it('parses focus and focusGoal for a goal nudge', () => {
    const r = parseMunshiSuggestion('{"title":"t","body":"b","focus":"goal","focusGoal":"Emergency fund"}');
    expect(r).toEqual({ title: 't', body: 'b', focus: 'goal', focusGoal: 'Emergency fund' });
  });
  it('parses budget focus and ignores focusGoal', () => {
    const r = parseMunshiSuggestion('{"title":"t","body":"b","focus":"budget","focusGoal":"x"}');
    expect(r).toEqual({ title: 't', body: 'b', focus: 'budget' });
  });
  it('drops an invalid focus', () => {
    const r = parseMunshiSuggestion('{"title":"t","body":"b","focus":"nonsense"}');
    expect(r).toEqual({ title: 't', body: 'b' });
  });
  it('returns null on skip', () => {
    expect(parseMunshiSuggestion('{"skip":true}')).toBeNull();
  });
});

describe('munshiDeepLink', () => {
  const goals = [{ id: 'g1', name: 'Emergency fund' }, { id: 'g2', name: 'Car' }];
  it('maps budget focus to budgets', () => {
    expect(munshiDeepLink({ title: 't', body: 'b', focus: 'budget' }, goals)).toEqual({ screen: 'budgets' });
  });
  it('maps a matched goal (case-insensitive) to goal-detail + id', () => {
    expect(munshiDeepLink({ title: 't', body: 'b', focus: 'goal', focusGoal: 'emergency FUND' }, goals))
      .toEqual({ screen: 'goal-detail', id: 'g1' });
  });
  it('maps an unmatched goal name to the goals list', () => {
    expect(munshiDeepLink({ title: 't', body: 'b', focus: 'goal', focusGoal: 'Vacation' }, goals))
      .toEqual({ screen: 'goals' });
  });
  it('defaults to chat with no focus', () => {
    expect(munshiDeepLink({ title: 't', body: 'b' }, goals)).toEqual({ screen: 'chat' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/notifications/munshi-suggestion.prompt.spec.ts`
Expected: FAIL — `munshiDeepLink` not exported; `parseMunshiSuggestion` returns object without `focus`.

- [ ] **Step 3: Update the snapshot type**

In `munshi-suggestion.prompt.ts`, change the `goals` field:

```ts
export interface MunshiSnapshot {
  budget: {
    name: string;
    totalAllocated: number;
    totalSpent: number;
    topCategories: { name: string; allocated: number; spent: number }[];
  } | null;
  goals: { id: string; name: string; progressPct: number }[];
}
```

- [ ] **Step 4: Update the system prompt**

Replace the JSON-rules block in `MUNSHI_SYSTEM_PROMPT`:

```ts
You write ONE short push notification based on the user's snapshot. Rules:
- Reply with STRICT JSON only, no prose, no markdown fences.
- If there is nothing genuinely worth a nudge today, reply exactly {"skip": true}.
- Otherwise reply {"title": "<=40 chars", "body": "<=120 chars"}.
- If the nudge is primarily about the budget, add "focus": "budget".
- If it is primarily about one goal, add "focus": "goal" and "focusGoal": "<the goal's exact name from the snapshot>".
- Never invent numbers not present in the snapshot.
```

- [ ] **Step 5: Replace parse + add helper**

Replace `parseMunshiSuggestion` and append `munshiDeepLink`:

```ts
export interface MunshiSuggestion {
  title: string;
  body: string;
  focus?: 'budget' | 'goal';
  focusGoal?: string;
}

export function parseMunshiSuggestion(text: string): MunshiSuggestion | null {
  try {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    if (obj.skip === true) return null;
    if (typeof obj.title !== 'string' || typeof obj.body !== 'string') return null;
    const result: MunshiSuggestion = {
      title: obj.title.slice(0, 60),
      body: obj.body.slice(0, 160),
    };
    if (obj.focus === 'budget' || obj.focus === 'goal') {
      result.focus = obj.focus;
      if (
        result.focus === 'goal' &&
        typeof obj.focusGoal === 'string' &&
        obj.focusGoal.trim()
      ) {
        result.focusGoal = obj.focusGoal.trim();
      }
    }
    return result;
  } catch {
    return null;
  }
}

export function munshiDeepLink(
  s: MunshiSuggestion,
  goals: { id: string; name: string }[],
): { screen: string; id?: string } {
  if (s.focus === 'budget') return { screen: 'budgets' };
  if (s.focus === 'goal') {
    const match = s.focusGoal
      ? goals.find((g) => g.name.toLowerCase() === s.focusGoal!.toLowerCase())
      : undefined;
    return match ? { screen: 'goal-detail', id: match.id } : { screen: 'goals' };
  }
  return { screen: 'chat' };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx jest src/notifications/munshi-suggestion.prompt.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(notifications): munshi focus/focusGoal deep-link contract"
```

---

## Task 3: Scheduler wires snapshot goal ids and munshi deep-link (backend)

**Files:**
- Modify: `backend/src/notifications/notifications.scheduler.ts` (`buildSnapshot` goal map ~line 145; `generateMunshiForUser` create block ~line 90)
- Test: `backend/src/notifications/notifications.scheduler.spec.ts`

**Interfaces:**
- Consumes: `parseMunshiSuggestion`, `munshiDeepLink` (Task 2).
- Produces: `munshi_suggestion` notifications carry `data` from `munshiDeepLink()`.

- [ ] **Step 1: Add failing tests**

In `notifications.scheduler.spec.ts`, add after the existing munshi test:

```ts
  it('deep-links a goal-focused munshi note to that goal-detail', async () => {
    const { scheduler, notifications } = setup({
      goals: [{ id: 'g1', name: 'Emergency fund', progressPct: 55, status: 'active' }],
      aiText: '{"title":"Aadha safar tay","body":"50% done","focus":"goal","focusGoal":"Emergency fund"}',
    });
    await scheduler.generateMunshiForUser('u1');
    expect(notifications.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        type: NotificationType.MUNSHI_SUGGESTION,
        data: { screen: 'goal-detail', id: 'g1' },
      }),
    );
  });

  it('falls back to chat for a munshi note with no focus', async () => {
    const { scheduler, notifications } = setup({
      budgets: [{ name: 'April', totalAllocated: 10000, totalSpent: 8000, categories: [] }],
      aiText: '{"title":"Slow down","body":"80% gone"}',
    });
    await scheduler.generateMunshiForUser('u1');
    expect(notifications.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ data: { screen: 'chat' } }),
    );
  });
```

Note: `buildSnapshot` filters goals by `GoalStatus.ACTIVE`, so test goals need `status: 'active'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/notifications/notifications.scheduler.spec.ts -t "munshi"`
Expected: the goal-detail test FAILs (received `data: { screen: 'chat' }`); the no-focus test passes already.

- [ ] **Step 3: Map goal id in buildSnapshot**

In `buildSnapshot`, update the goals map:

```ts
      goals: goals
        .filter((g: any) => g.status === GoalStatus.ACTIVE)
        .map((g: any) => ({ id: g.id, name: g.name, progressPct: g.progressPct })),
```

- [ ] **Step 4: Use munshiDeepLink in generateMunshiForUser**

Add `munshiDeepLink` to the import from `./munshi-suggestion.prompt`, then replace the create block:

```ts
    const parsed = parseMunshiSuggestion(text);
    if (!parsed) return;

    await this.notifications.create(userId, {
      type: NotificationType.MUNSHI_SUGGESTION,
      title: parsed.title,
      body: parsed.body,
      data: munshiDeepLink(parsed, snapshot.goals),
    });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest src/notifications/notifications.scheduler.spec.ts`
Expected: PASS (all munshi cases, including the existing budget-focused-but-no-focus one that now defaults to chat).

- [ ] **Step 6: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(notifications): route munshi notes to referenced entity"
```

---

## Task 4: NotificationView carries the notification id (mobile)

**Files:**
- Modify: `mobile/src/api/types.ts` (`NotificationView`, ~line 483)
- Modify: `mobile/src/api/adapters.ts` (`toNotificationView`, ~line 304)
- Test: `mobile/src/api/adapters.spec.ts`

**Interfaces:**
- Produces: `NotificationView.id: string` (used by Tasks 5 & 7).

- [ ] **Step 1: Write the failing test**

Append to `mobile/src/api/adapters.spec.ts`:

```ts
import { toNotificationView } from './adapters';
import type { ApiNotification } from './types';

describe('toNotificationView', () => {
  it('carries the notification id and deep-link data', () => {
    const n: ApiNotification = {
      id: 'n1', type: 'large_transaction', title: 'T', body: 'B',
      read: false, createdAt: '2026-07-12T00:00:00.000Z',
      data: { screen: 'tx-detail', id: 't1' },
    };
    const v = toNotificationView(n);
    expect(v.id).toBe('n1');
    expect(v.data).toEqual({ screen: 'tx-detail', id: 't1' });
    expect(v.unread).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest src/api/adapters.spec.ts -t "toNotificationView"`
Expected: FAIL — `v.id` is `undefined` (type error / assertion fails).

- [ ] **Step 3: Add `id` to the view type**

In `types.ts`, add to `NotificationView` (first field):

```ts
export interface NotificationView {
  id: string;
  icon: string;
```

- [ ] **Step 4: Map `id` in the adapter**

In `adapters.ts` `toNotificationView`, add `id` to the returned object:

```ts
  return {
    id: n.id,
    icon: NOTIF_ICONS[type],
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd mobile && npx jest src/api/adapters.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(api): NotificationView carries notification id"
```

---

## Task 5: API methods — markRead(id) and transactions.get(id) (mobile)

**Files:**
- Modify: `mobile/src/api/index.ts` (`notifications` block ~line 764; `transactions` block ~line 260)

**Interfaces:**
- Consumes: `NotificationView.id` (Task 4), existing `fetchCategoryMap`, `fetchAccountMap`, `toTxView`, `bumpData`.
- Produces:
  - `api.notifications.markRead(id: string): Promise<void>`
  - `api.transactions.get(id: string): Promise<TxView>`

*(No unit test — these are thin network wrappers; the mobile harness cannot exercise HTTP. Verified via typecheck + manual run in Task 10.)*

- [ ] **Step 1: Add `markRead` to the notifications block**

In `index.ts`, inside `notifications: { ... }`, after `markAllRead`:

```ts
    async markRead(id: string): Promise<void> {
      await apiClient.post(`/notifications/${id}/read`, {});
      bumpData();
    },
```

- [ ] **Step 2: Add `get` to the transactions block**

Inside `transactions: { ... }`, after `list`:

```ts
    async get(id: string): Promise<TxView> {
      const raw = await apiClient.get<ApiTransaction>(`/transactions/${id}`);
      const [catMap, acctMap] = await Promise.all([fetchCategoryMap(), fetchAccountMap()]);
      return toTxView(
        raw,
        catMap.get(raw.categoryId),
        raw.accountId ? acctMap.get(raw.accountId) : undefined,
      );
    },
```

- [ ] **Step 3: Verify it typechecks**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors. (`ApiTransaction`, `TxView`, `toTxView` are already imported in this file.)

- [ ] **Step 4: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(api): add notifications.markRead and transactions.get"
```

---

## Task 6: Deep-link resolver — type fallback (mobile)

**Round 1 scope:** adds `fallbackTargetForType` only, and leaves
`mapNotificationToScreen` at its current `tx-detail`-only behavior. The
`goal-detail` allow-list / `ID_SCREENS` additions and their test case are
**deferred to Round 2** (Task 1/3/9) so this task does not touch the
`ScreenKind` union owned by the goals-clickable plan.

**Files:**
- Modify: `mobile/src/notifications/deepLink.ts`
- Test: `mobile/src/notifications/deepLink.spec.ts` (create)

**Interfaces:**
- Consumes: `NotifViewType` from `../api/types`, `ScreenKind` from `../app/navContext`.
- Produces: `fallbackTargetForType(type: NotifViewType): NotifNavTarget`.

- [ ] **Step 1: Write the failing tests**

Create `mobile/src/notifications/deepLink.spec.ts`:

```ts
import { mapNotificationToScreen, fallbackTargetForType } from './deepLink';

describe('mapNotificationToScreen', () => {
  it('resolves tx-detail with an id', () => {
    expect(mapNotificationToScreen({ screen: 'tx-detail', id: 't1' }))
      .toEqual({ kind: 'tx-detail', data: { id: 't1' } });
  });
  it('resolves a screen with no id', () => {
    expect(mapNotificationToScreen({ screen: 'budgets' })).toEqual({ kind: 'budgets' });
  });
  it('rejects an unknown screen', () => {
    expect(mapNotificationToScreen({ screen: 'nope' })).toBeNull();
  });
  it('rejects a null payload', () => {
    expect(mapNotificationToScreen(null)).toBeNull();
  });
});

describe('fallbackTargetForType', () => {
  it('maps every type to a target', () => {
    expect(fallbackTargetForType('budget')).toEqual({ kind: 'budgets' });
    expect(fallbackTargetForType('goal')).toEqual({ kind: 'goals' });
    expect(fallbackTargetForType('tx')).toEqual({ kind: 'txns' });
    expect(fallbackTargetForType('report')).toEqual({ kind: 'reports' });
    expect(fallbackTargetForType('security')).toEqual({ kind: 'settings' });
    expect(fallbackTargetForType('munshi')).toEqual({ kind: 'chat' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && npx jest src/notifications/deepLink.spec.ts`
Expected: FAIL — `fallbackTargetForType` not exported.

- [ ] **Step 3: Append `fallbackTargetForType` to deepLink.ts**

Leave the existing imports and `mapNotificationToScreen` unchanged. Add the
`NotifViewType` import and the fallback at the end of the file:

```ts
import type { NotifViewType } from '../api/types';

/** Screen a notification of a given type opens when it has no deep-link
 * payload (legacy rows). Every type resolves to a target so all cards are
 * tappable. */
const TYPE_FALLBACK: Record<NotifViewType, ScreenKind> = {
  budget: 'budgets',
  goal: 'goals',
  tx: 'txns',
  report: 'reports',
  security: 'settings',
  munshi: 'chat',
};

export function fallbackTargetForType(type: NotifViewType): NotifNavTarget {
  return { kind: TYPE_FALLBACK[type] };
}
```

(`import type` lines may sit together at the top; grouping is cosmetic.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npx jest src/notifications/deepLink.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(notifications): type-based fallback deep-link resolver"
```

**Round 2 addition (deferred — do with Task 1/3/9):** add `'goal-detail'` to
`ALLOWED` and a new `ID_SCREENS = ['tx-detail', 'goal-detail']` guard in
`mapNotificationToScreen` (replacing the inline `tx-detail` check), and add the
`goal-detail` resolver test:

```ts
  it('resolves goal-detail with an id', () => {
    expect(mapNotificationToScreen({ screen: 'goal-detail', id: 'g1' }))
      .toEqual({ kind: 'goal-detail', data: { id: 'g1' } });
  });
```

---

## Task 7: Notifications screen — pressable cards + tap handler (mobile)

**Files:**
- Modify: `mobile/src/screens/Notifications.tsx`

**Interfaces:**
- Consumes: `mapNotificationToScreen`, `fallbackTargetForType` (Task 6); `api.notifications.markRead` (Task 5); `NotificationView.id` (Task 4); `useNav().nav`.

*(No unit test — component behavior; verified manually in Task 10.)*

- [ ] **Step 1: Add imports**

At the top of `Notifications.tsx`, add `Pressable` to the react-native import and import the resolvers:

```ts
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
```
```ts
import { mapNotificationToScreen, fallbackTargetForType } from "../notifications/deepLink";
import type { NotificationView } from "../api/types";
```

- [ ] **Step 1b: Retype the list to NotificationView**

The screen currently has a local `interface Notification` (no `id`/`data`) typing `ALL_NOTIFS`; the tap handler needs the real view type. Delete the local `interface Notification { … }` block and retype the fallback:

```ts
// Renders empty while the api loads (or is unreachable) — no mock data.
const ALL_NOTIFS: NotificationView[] = [];
```

Keep the local `type NotifType` and `FILTER_CHIPS` as-is (they still drive the filter chips). `api.notifications.list()` already returns `NotificationView[]`, so `notifs`/`filtered` now carry `id` and `data`.

- [ ] **Step 2: Add the tap handler**

Inside the `Notifications` component, after the `filtered` computation:

```ts
  const onTapNotif = (n: NotificationView) => {
    const target = mapNotificationToScreen(n.data) ?? fallbackTargetForType(n.type);
    // Fire-and-forget: bumpData() inside markRead refetches and clears the dot.
    void api.notifications.markRead(n.id).catch(() => {});
    nav(target.kind, target.data);
  };
```

- [ ] **Step 3: Wrap each card in a Pressable and key by id**

Replace the `filtered.map(...)` block's `<SpringIn key={i} ...>` wrapper contents so the card `View` is wrapped by a `Pressable`, and use `n.id` as the key:

```tsx
          {filtered.map((n, i) => (
            <SpringIn key={n.id} delay={i * 30}>
              <Pressable onPress={() => onTapNotif(n)}>
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: n.unread ? t.bg2 : t.bg1,
                      borderColor: t.border,
                    },
                  ]}
                >
                  {/* …existing card children unchanged… */}
                </View>
              </Pressable>
            </SpringIn>
          ))}
```

Keep every child of the card `View` exactly as-is (unread dot, icon box, text block).

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(notifications): tappable cards with deep-link + mark-read"
```

---

## Task 8: TxDetail — fetch-by-id from a stub payload (mobile)

**Files:**
- Modify: `mobile/src/screens/TxDetail.tsx`

**Interfaces:**
- Consumes: `api.transactions.get(id)` (Task 5).

*(No unit test — component; verified manually in Task 10. This also fixes the pre-existing push-notification path, which passes only `{ id }`.)*

- [ ] **Step 1: Add imports**

Ensure these are imported in `TxDetail.tsx`:

```ts
import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
```
(Add to the existing react-native import rather than duplicating it.)

- [ ] **Step 2: Replace the synchronous `tx` binding with a stub-aware fetch**

Replace the line `const tx = entry.data as SwipeTx;` (top of the component) with:

```ts
  const stub = entry.data as { id: string } & Partial<SwipeTx>;
  const isFull = typeof stub?.desc === "string";
  const [tx, setTx] = useState<SwipeTx | null>(isFull ? (stub as SwipeTx) : null);

  useEffect(() => {
    if (tx) return;
    let cancelled = false;
    api.transactions
      .get(stub.id)
      .then((full) => {
        if (!cancelled) setTx(full);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tx, stub.id]);
```

- [ ] **Step 3: Early-return a loading shell while fetching**

Immediately after the hooks above (before any code that reads `tx.*`), add a guard so the rest of the component sees a non-null `SwipeTx`:

```tsx
  if (!tx) {
    return (
      <MPageShell title="Transaction" onBack={pop}>
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={t.text3} />
        </View>
      </MPageShell>
    );
  }
```

Use whatever page-shell/back handler this screen already imports (mirror its existing header). Everything below this guard already references `tx` and needs no change.

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(tx-detail): load full transaction from an id-only deep link"
```

---

## Task 9: GoalDetail — fetch-by-id from a stub payload (mobile) — PREREQUISITE-GATED

**Files:**
- Modify: `mobile/src/screens/GoalDetail.tsx` (created by the goals-detail prerequisite spec)

**Interfaces:**
- Consumes: `api.goals.get(id)` (added by the prerequisite spec).

**Gate:** Only implement once the prerequisite (`GoalDetail.tsx` + `api.goals.get`) is merged. If the file does not yet exist, mark this task blocked and surface it in review rather than scaffolding a placeholder screen.

*(No unit test — component; verified manually in Task 10.)*

- [ ] **Step 1: Locate GoalDetail's data binding**

Open `GoalDetail.tsx` and find where it reads its route param — e.g. `const goal = entry.data as GoalView;`. Note the actual view type name and a field that is always present on a full goal but absent on a stub (e.g. `name`).

- [ ] **Step 2: Replace with a stub-aware fetch (mirror Task 8)**

Replace the synchronous binding with:

```ts
  const stub = entry.data as { id: string } & Partial<GoalView>;
  const isFull = typeof stub?.name === "string";
  const [goal, setGoal] = useState<GoalView | null>(isFull ? (stub as GoalView) : null);

  useEffect(() => {
    if (goal) return;
    let cancelled = false;
    api.goals
      .get(stub.id)
      .then((full) => {
        if (!cancelled) setGoal(full);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [goal, stub.id]);
```

Add `useEffect`, `useState` (react) and `ActivityIndicator` (react-native) to the existing imports. Use the screen's real view type in place of `GoalView` if it differs.

- [ ] **Step 3: Early-return a loading shell**

After the hooks, before any code reading `goal.*`:

```tsx
  if (!goal) {
    return (
      <MPageShell title="Goal" onBack={pop}>
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={t.text3} />
        </View>
      </MPageShell>
    );
  }
```

Mirror the screen's existing shell/back handler.

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "feat(goal-detail): load full goal from an id-only deep link"
```

---

## Task 10: End-to-end verification

**Files:** none (manual).

- [ ] **Step 1: Run all affected tests**

Run: `cd backend && npx jest src/notifications` then `cd mobile && npx jest src/notifications src/api/adapters.spec.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck both packages**

Run: `cd backend && npx tsc --noEmit` and `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual app walkthrough**

With the app running against the backend, confirm each on tap:
- Budget alert → Budgets; unread dot clears.
- Large transaction → Transaction detail loads full data (spinner then details).
- Goal milestone → that goal's detail page loads.
- Monthly report → Reports.
- Munshi note about a named goal → that goal's detail; about the budget → Budgets; otherwise → Chat.
- A legacy notification with no payload → its type's fallback screen.

- [ ] **Step 4: Final commit (if any fixups)**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "test: verify clickable notifications end-to-end"
```
