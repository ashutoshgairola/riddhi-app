# Clickable Notifications with Redirection — Design

**Date:** 2026-07-12
**Status:** Approved, ready for planning

## Problem

The in-app Notifications list ([mobile/src/screens/Notifications.tsx](../../../mobile/src/screens/Notifications.tsx))
renders each notification as a plain, non-interactive `View`. Tapping does
nothing. Users expect to tap a notification and land on the relevant screen.

Push-notification taps already deep-link correctly via
`mapNotificationToScreen()` + `nav()` in
[mobile/src/notifications/usePushNotifications.ts](../../../mobile/src/notifications/usePushNotifications.ts).
The in-app list simply never wired up the same behavior, and the notification
`id` is dropped by the adapter (so we can't mark a single one read).

## Goals

- Every notification card in the list is tappable and redirects to the correct
  screen.
- Tapping a notification marks that single notification as read (clears its
  unread dot).
- Goal notifications open the **specific goal's detail page**; Munshi
  suggestions route to the entity they reference (a specific goal, Budgets, or
  Chat).

## Prerequisite

This work depends on the **Goal Detail** screen from
[2026-07-12-goals-clickable-transfer-savings-design.md](2026-07-12-goals-clickable-transfer-savings-design.md),
which introduces:

- the `goal-detail` `ScreenKind` (registered in `navContext` + `screens.tsx`),
  pushed as `{ kind: 'goal-detail', data: goal }`;
- `api.goals.get(id)` → `GET /goals/:id`.

That spec should land first (or together). Goal deep-links here target
`goal-detail`; until it exists there is nothing valid to link to.

## Non-goals

- Notification grouping and swipe actions.
- Building the Goal Detail screen itself (owned by the prerequisite spec); this
  spec only adds its stub-payload fetch-by-id path.
- A budget detail screen (none exists; budget notifications target the Budgets
  list).
- Changing which events generate notifications.

## Existing infrastructure (reused)

- `mapNotificationToScreen(data)` in
  [mobile/src/notifications/deepLink.ts](../../../mobile/src/notifications/deepLink.ts)
  maps a `{ screen, id? }` payload to a nav target. Allow-list:
  `budgets, goals, reports, chat, tx-detail, sync, subscriptions`.
- Backend deep-link payloads emitted today: `chat`, `reports`,
  `subscriptions`(+id), `tx-detail`(+id), `budgets`, `goals`, `sync`. All map
  to valid `ScreenKind`s.
- `POST /notifications/:id/read` (mark single read) already exists on the
  backend; the mobile API just doesn't call it yet.
- `GET /transactions/:id` already exists on the backend.

## Design

### 1. Tap handler (Notifications screen)

Wrap each card in a `Pressable` using the app's standard press feedback. On
press:

1. Resolve a nav target (§3).
2. Fire-and-forget `api.notifications.markRead(n.id)`. This calls `bumpData()`,
   which triggers `useApiData` to refetch and clear the unread dot — the same
   pattern the existing "Mark all as read" action uses.
3. `nav(target.kind, target.data)`.

Use `n.id` as the React list key instead of the array index.

### 2. Thread the notification `id` through

- Add `id: string` to `NotificationView`
  ([mobile/src/api/types.ts](../../../mobile/src/api/types.ts)).
- `toNotificationView` maps `n.id`
  ([mobile/src/api/adapters.ts](../../../mobile/src/api/adapters.ts)).
- New mobile API method `api.notifications.markRead(id)` →
  `POST /notifications/:id/read`, then `bumpData()`
  ([mobile/src/api/index.ts](../../../mobile/src/api/index.ts)).

### 3. Target resolution (extend deepLink.ts)

- **Has a `data` deep-link** → reuse `mapNotificationToScreen(n.data)`.
  - Add `goal-detail` to the `ALLOWED` allow-list, handled like `tx-detail`:
    a `{ screen: 'goal-detail', id }` payload → `{ kind: 'goal-detail',
    data: { id } }`.
- **`data` is null (older rows)** → new `fallbackTargetForType(type)`:
  - `budget → budgets`
  - `goal → goals` (list — no goal id available in this path)
  - `tx → txns` (list — no id available in this path)
  - `report → reports`
  - `security → settings`
  - `munshi → chat`

The Notifications screen tries the deep-link first, then the type fallback, so
**every** card resolves to a target and is tappable.

### 4. Detail screens: fetch-by-id from a stub payload

`tx-detail` and `goal-detail` are pushed with a full object from the app
(`data: tx` / `data: goal`), but a notification deep-link carries only
`{ id }`. Both screens read `entry.data` as a full object and would render
incompletely from a stub — a latent bug on the push path for `tx-detail` too.
The same fix applies to both:

- **tx-detail** ([mobile/src/screens/TxDetail.tsx](../../../mobile/src/screens/TxDetail.tsx)):
  - New `api.transactions.get(id)` → `GET /transactions/:id`, adapted with the
    existing `toTxView` (+ category/account maps, as `list()` already does).
- **goal-detail** (new screen from the prerequisite spec, which already adds
  `api.goals.get(id)`):
  - No new API needed; reuse `api.goals.get(id)`.

In each screen: detect a stub payload (has `id` but not the full object's
fields, e.g. no `desc` / no goal `name`), fetch the full record, show a loading
state, then render. Fully-populated pushes (list/search) skip the fetch. This
fixes both the in-app and push paths.

### 5. Backend deep-link payloads for goals

- **goal_progress** ([backend/src/notifications/notifications.listener.ts](../../../backend/src/notifications/notifications.listener.ts)):
  `onGoalUpdated` has `e.goalId`, so emit
  `data: { screen: 'goal-detail', id: e.goalId }` instead of
  `{ screen: 'goals' }`.

### 6. Munshi suggestions → referenced entity (backend)

Today the scheduler hardcodes `data: { screen: 'chat' }` on every
`munshi_suggestion`
([backend/src/notifications/notifications.scheduler.ts](../../../backend/src/notifications/notifications.scheduler.ts)),
even when the note is about a goal or budget.

- Snapshot ([munshi-suggestion.prompt.ts](../../../backend/src/notifications/munshi-suggestion.prompt.ts)):
  `goals` gains `id`: `{ id: string; name: string; progressPct: number }[]`.
  `buildSnapshot` maps `g.id` (already available from `goals.findAll`). Budgets
  have no detail screen, so no budget id is needed.
- JSON contract: add optional `focus: "budget" | "goal"`, and — when
  `focus === "goal"` — `focusGoal: "<exact goal name>"`:
  - Update `MUNSHI_SYSTEM_PROMPT` to instruct the model to set `focus` when the
    nudge is primarily about the budget or a goal (and to echo the exact goal
    name in `focusGoal` for a goal), omitting both otherwise. The prompt
    already lists each goal by name, so the model has the names to echo.
  - `parseMunshiSuggestion` returns `{ title, body, focus?, focusGoal? }`;
    `focus` is accepted only when exactly `"budget"` / `"goal"`, `focusGoal`
    only as a non-empty string, else dropped.
- The scheduler maps to `data`:
  - `focus "budget"` → `{ screen: 'budgets' }`
  - `focus "goal"` → match `focusGoal` case-insensitively against the
    snapshot's goal names → if matched, `{ screen: 'goal-detail', id }`; else
    `{ screen: 'goals' }`.
  - absent → `{ screen: 'chat' }` (unchanged default)
- Mobile needs no new handling beyond §3's `goal-detail` allow-list entry —
  `budgets` / `goals` / `chat` are already handled. The munshi null-data type
  fallback stays `→ chat`.

## Testing

- `deepLink.spec.ts`: `mapNotificationToScreen` handles `goal-detail` (+id);
  `fallbackTargetForType` across all six types.
- `adapters.spec.ts`: `toNotificationView` carries `id`.
- Backend `notifications.listener.spec`: `goal_progress` emits
  `{ screen: 'goal-detail', id }`.
- Backend `munshi-suggestion` / scheduler specs: `parseMunshiSuggestion` parses
  and validates `focus` / `focusGoal`; scheduler maps `budget` → budgets,
  `goal` + matched name → `goal-detail`+id, `goal` + unmatched name → goals,
  absent → chat.
- Manual verify: tap each notification type → correct screen; unread dot
  clears on tap; a large-transaction notification loads the full tx detail; a
  goal-milestone notification opens that goal's detail; a Munshi note about a
  named goal opens that goal, about a budget opens Budgets, otherwise Chat.

## Files touched

**Mobile**
- `src/screens/Notifications.tsx` — pressable cards, tap handler, `id` key
- `src/api/types.ts` — `NotificationView.id`
- `src/api/adapters.ts` — map `id`
- `src/api/index.ts` — `notifications.markRead(id)`, `transactions.get(id)`
- `src/notifications/deepLink.ts` — `goal-detail` allow-list,
  `fallbackTargetForType`
- `src/screens/TxDetail.tsx` — stub-payload fetch-by-id + loading state
- `src/screens/GoalDetail.tsx` (from prerequisite spec) — stub-payload
  fetch-by-id + loading state
- `src/notifications/deepLink.spec.ts`, `src/api/adapters.spec.ts` — tests

**Backend**
- `src/notifications/notifications.listener.ts` — `goal_progress` →
  `goal-detail` + id
- `src/notifications/munshi-suggestion.prompt.ts` — snapshot goal `id`,
  `focus` / `focusGoal` in contract/parse
- `src/notifications/notifications.scheduler.ts` — `focus`/`focusGoal` →
  `data.screen` (+id)
- corresponding `.spec.ts` files
