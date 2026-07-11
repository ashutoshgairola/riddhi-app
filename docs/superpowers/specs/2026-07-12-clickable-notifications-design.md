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
- Munshi suggestions route to the entity they reference (Goals or Budgets),
  falling back to Chat.

## Non-goals

- Notification grouping, swipe actions, per-goal/per-budget detail screens
  (none exist today).
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
- **`data` is null (older rows)** → new `fallbackTargetForType(type)`:
  - `budget → budgets`
  - `goal → goals`
  - `tx → txns` (list — no id available in this path)
  - `report → reports`
  - `security → settings`
  - `munshi → chat`

The Notifications screen tries the deep-link first, then the type fallback, so
**every** card resolves to a target and is tappable.

### 4. tx-detail fetch-by-id

Deep-linking to `tx-detail` passes only `{ id }`, but `TxDetail` reads
`entry.data as SwipeTx` and renders an incomplete object — a latent bug on the
push path too. Fix in `TxDetail`
([mobile/src/screens/TxDetail.tsx](../../../mobile/src/screens/TxDetail.tsx)):

- New `api.transactions.get(id)` → `GET /transactions/:id`, adapted with the
  existing `toTxView` (+ category/account maps, as `list()` already does).
- `TxDetail` detects a stub payload (has `id` but no `desc`), fetches the full
  transaction, shows a loading state, then renders. Fully-populated pushes
  (from the list/search) skip the fetch. This fixes both the in-app and push
  paths.

### 5. Munshi suggestions → referenced entity (backend)

Today the scheduler hardcodes `data: { screen: 'chat' }` on every
`munshi_suggestion`
([backend/src/notifications/notifications.scheduler.ts](../../../backend/src/notifications/notifications.scheduler.ts)),
even when the note is about a goal or budget. There is no per-goal/per-budget
detail screen, so "referenced entity" resolves to the **list** screen — no id
needed.

- Extend the Munshi suggestion JSON contract with an optional
  `focus: "budget" | "goal"` field
  ([backend/src/notifications/munshi-suggestion.prompt.ts](../../../backend/src/notifications/munshi-suggestion.prompt.ts)):
  - Update `MUNSHI_SYSTEM_PROMPT` to instruct the model to include `focus` when
    the nudge is primarily about the budget or a goal, omitting it otherwise.
  - `parseMunshiSuggestion` returns `{ title, body, focus? }`; `focus` is
    accepted only when it is exactly `"budget"` or `"goal"`, else dropped.
- The scheduler maps `focus → data`:
  - `"budget" → { screen: 'budgets' }`
  - `"goal" → { screen: 'goals' }`
  - absent → `{ screen: 'chat' }` (unchanged default)
- Mobile needs no new handling — `budgets`/`goals`/`chat` are already in the
  deep-link allow-list. The munshi null-data type fallback stays `→ chat`.

## Testing

- `deepLink.spec.ts`: extend for `fallbackTargetForType` across all six types.
- `adapters.spec.ts`: `toNotificationView` carries `id`.
- Backend `munshi-suggestion` / scheduler specs: `parseMunshiSuggestion` parses
  and validates `focus`; scheduler maps `focus` → the right `data.screen`
  (budget/goal/absent).
- Manual verify: tap each notification type → correct screen; unread dot
  clears on tap; a large-transaction notification loads the full detail; a
  Munshi note about a goal opens Goals, about a budget opens Budgets, otherwise
  Chat.

## Files touched

**Mobile**
- `src/screens/Notifications.tsx` — pressable cards, tap handler, `id` key
- `src/api/types.ts` — `NotificationView.id`
- `src/api/adapters.ts` — map `id`
- `src/api/index.ts` — `notifications.markRead(id)`, `transactions.get(id)`
- `src/notifications/deepLink.ts` — `fallbackTargetForType`
- `src/screens/TxDetail.tsx` — stub-payload fetch-by-id + loading state
- `src/notifications/deepLink.spec.ts`, `src/api/adapters.spec.ts` — tests

**Backend**
- `src/notifications/munshi-suggestion.prompt.ts` — `focus` in contract/parse
- `src/notifications/notifications.scheduler.ts` — `focus` → `data.screen`
- corresponding `.spec.ts` files
