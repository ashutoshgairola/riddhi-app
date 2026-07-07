# Event Budget Planner — Design Spec

_Riddhi · 2026-07-07_

## 1. Summary

Plan a one-off event (birthday, wedding, trip, house party, or custom) as a
**budget with a payable expense checklist**. The user sets a total budget, breaks
it into expenses each filed under a normal spending category, and ticks each off
as they pay. Ticking an expense creates a **real transaction** in Activity tagged
to the event; un-ticking removes it. The two stay in sync, enforced server-side.

The web prototype (`project/riddhi/MobileEvents.jsx`) is UI-only and resets on
reload. This spec makes events **persistent** (backend + mobile) and wires them
into Activity, Categories, Reports, and Munshi.

Entry points: **More → Events**, and the FAB **＋ → "Plan an event"**.

## 2. Scope

In scope (one spec):

- Backend `events` module: `event` + `event_expense` entities, CRUD + computed
  totals, and the paid⟷transaction sync.
- One new nullable column on `transaction`: `eventId`.
- Mobile: `Events` list + `EventDetail` screens, `CreateEventSheet` +
  `EventItemSheet`, `api.events` resource, client-side templates.
- Entry points: More menu item + FAB "Plan an event" action.
- Reports: an "Event Budgets" card.
- Munshi: `list_events` read tool + events snapshot in the chat prompt.

Out of scope: linking event budgets to monthly budgets; Munshi *write* tools for
events (create/edit event by chat) — Munshi can still log spends via the existing
`create_transaction`.

## 3. Key decision — the paid⟷transaction sync lives in the backend

When an expense flips to **paid** (or a paid expense's amount changes, or it
un-ticks, or a paid expense is deleted), `EventsService` creates / updates /
deletes the linked real transaction by calling `TransactionsService`, then
persists the expense row. These are ordered so the transaction write happens
**before** the expense is saved as paid, so the common failure (the tx write
fails) leaves nothing persisted. See §5 for the atomicity limitation.

- `event_expense.transactionId` → the linked transaction (null when unpaid).
- `transaction.eventId` → the owning event (null for ordinary transactions).

The invariant **"paid ⟺ a linked transaction exists"** is enforced in exactly one
place. Rejected alternative: mobile creating the expense and transaction as two
separate calls — it splits the invariant across the client, is race-prone, and
Munshi (server-side) could not keep the two in sync.

The paid transaction is **account-less** (`accountId: null`, no balance movement),
matching the prototype. It still appears in Activity, counts toward its category's
spend, and flows into Reports and Munshi. It carries `type: expense`, the expense's
`categoryId`, `amount = actual`, `description = <expense label>` (e.g. "Cake"),
and `notes = "For <event.name>"` (e.g. _"For Aarav's 5th Birthday"_). The
tappable "back to event" is driven by `eventId`, not by parsing the note.

## 4. Backend data model (`backend/src/events/`)

Module layout mirrors `budgets/` (entity / controller / service / repository / dto).
Dev schema auto-syncs (`synchronize: true` + `autoLoadEntities`) exactly as when
`budgets`/`goals` were added — no migration file. `numericTransformer` (parseFloat
on read) reused from the budget/transaction entities.

### `event` entity (`event`)

| column      | type                  | notes                                  |
|-------------|-----------------------|----------------------------------------|
| `id`        | uuid PK               |                                        |
| `userId`    | uuid FK → user        | `onDelete: CASCADE`                     |
| `name`      | varchar(255)          |                                        |
| `emoji`     | varchar(16)           | e.g. `🎂`                              |
| `color`     | varchar(32)           | hex accent, from template or custom    |
| `date`      | timestamptz, nullable | event date; optional                   |
| `budget`    | numeric(18,2)         | total budget                           |
| `guests`    | int, default 0        | optional headcount                     |
| `createdAt` / `updatedAt` | timestamptz | Create/UpdateDateColumn           |

`@OneToMany(() => EventExpense, e => e.event, { cascade: true })` `expenses`.

### `event_expense` entity (`event_expense`)

| column          | type                    | notes                                    |
|-----------------|-------------------------|------------------------------------------|
| `id`            | uuid PK                 |                                          |
| `eventId`       | uuid FK → event         | `onDelete: CASCADE`                       |
| `categoryId`    | uuid FK → transaction_category | `onDelete: RESTRICT` (same as transaction) |
| `label`         | varchar(255)            | "Cake", "Venue"                          |
| `planned`       | numeric(18,2)           |                                          |
| `actual`        | numeric(18,2), default 0|                                          |
| `paid`          | boolean, default false  |                                          |
| `transactionId` | uuid, nullable          | linked real tx while paid                |
| `sortOrder`     | int, default 0          | preserves checklist order                |
| `createdAt` / `updatedAt` | timestamptz   |                                          |

### `transaction` entity change

Add one nullable column:

```ts
@Column({ type: 'uuid', nullable: true })
eventId: string | null;

@ManyToOne(() => Event, { nullable: true, onDelete: 'SET NULL' })
@JoinColumn({ name: 'eventId' })
event: Event | null;
```

`onDelete: SET NULL` means **deleting an event does NOT delete its paid
transactions** — they remain in Activity as ordinary spend, with `eventId` nulled.
(Confirmed decision: no cascade.)

## 5. Backend endpoints (`EventsController`, JWT-guarded, `@CurrentUser`)

```
GET    /events                      list + computed totals (no expense rows needed on list)
GET    /events/:id                  one event + expenses
POST   /events                      create { name, emoji, color, date?, budget, guests?, expenses[] }
PATCH  /events/:id                  edit basics { name?, emoji?, color?, date?, budget?, guests? }
DELETE /events/:id                  delete event (cascade its expenses; SET NULL on transactions)
POST   /events/:id/expenses         add expense { categoryId, label, planned, actual?, paid? }
PATCH  /events/:id/expenses/:eid    edit expense { categoryId?, label?, planned?, actual?, paid? } — runs tx sync
DELETE /events/:id/expenses/:eid    remove expense (+ linked tx if paid)
```

`expenses[]` on create/`POST /expenses` items: `{ categoryId, label, planned,
actual?, paid? }`. All ownership checks via `userId`, `NotFoundException` when
missing (matching budgets/goals).

### Computed totals (`EventsService`, server-side, like `computeBudget`)

Per event, matching the prototype's `evTotals`:

- `planned` = Σ `planned`
- `paid` = Σ `actual` where `paid`
- `projected` = Σ (`paid ? actual : planned`)
- `paidCount` = count where `paid`; `count` = total expenses
- `over` = `projected > budget`

All rounded to 2 dp (`Math.round(x*100)/100`).

### Paid-sync algorithm (the core of `EventsService`)

On create-expense / edit-expense / delete-expense, reconcile the linked
transaction from the expense's `(paid, actual, categoryId, label)`, ordering the
transaction write before the expense save:

- **unpaid → paid**: create an account-less expense transaction
  (`amount = actual` — defaulting `actual` to `planned` when the client didn't
  supply one, matching the prototype's `togglePaid`), `categoryId`, `eventId`,
  description/notes `For <event.name>`; store its id in `event_expense.transactionId`.
- **paid → paid (amount/category/label changed)**: `PATCH` the linked transaction.
- **paid → unpaid**: delete the linked transaction; null `transactionId`.
- **delete a paid expense**: delete the linked transaction first, then the row.

Reuses `TransactionsService.create/update/remove` so account-balance and
`TRANSACTION_CREATED` event semantics stay identical to manual entries. `EventsModule`
imports `TransactionsModule` (and `CategoriesModule` if needed for validation).

**Atomicity limitation (accepted).** Because the reconcile goes through
`TransactionsService` (each call owns its own `queryRunner`) and the expense row
is then saved separately, the two writes are **not** wrapped in a single DB
transaction. The write ordering (transaction first, expense save second) makes the
dominant failure mode safe — if the transaction write fails, nothing is persisted,
so a paid row never exists without its transaction. The residual window is narrow:
only if the **second** write (the expense save, or a `paid→unpaid` expense save
after the tx delete) fails can the two drift (an orphaned event transaction, or a
paid row pointing at a deleted tx). For account-less bookkeeping rows this risk is
accepted rather than paid for with a cross-service `EntityManager` refactor; true
single-transaction atomicity is a possible follow-up if it proves necessary.

## 6. Mobile

Follows the real app's patterns (`_MPageShell`, `BottomSheet`, `components/ui`,
`api` data layer, `useApiData`), not the prototype's inline styles. Expo v56 —
per `mobile/AGENTS.md`, check the versioned docs before writing RN code.

### Navigation

- Add `ScreenKind`s `'events'` and `'event-detail'` to `navContext.tsx`.
- Register both in `screens.tsx` `SCREEN_REGISTRY` → `Events`, `EventDetail`.
- `event-detail` receives `{ id }` via `entry.data`; `events` accepts an optional
  `{ autoCreate: true }` to open the create sheet on mount (FAB shortcut).

### Screens & sheets (ported from `MobileEvents.jsx`)

- `screens/Events.tsx` — list of progress cards (accent bar, emoji, name, date,
  `paidCount/count`, progress bar, `paid / budget`, `left`/`over by`), empty state,
  header `＋` opens create sheet.
- `screens/EventDetail.tsx` — budget ring hero (spent % of budget), Planned / Paid /
  Left stat row, over-budget warning banner, expense checklist (tap row → edit,
  tap checkbox → toggle paid), "Add expense" button, More menu (add expense, view
  in Activity, ask Munshi, delete event).
- `CreateEventSheet` — template picker (2-col grid), custom emoji picker, name,
  date, budget. On create: resolve each template item's category label → id, POST.
- `EventItemSheet` — category chips, label, planned + actual, "mark as paid" toggle.

### API (`api.events` in `api/index.ts` + `adapters.ts` + `types.ts`)

```
list(): EventView[]                          GET /events
get(id): EventDetailView                     GET /events/:id
create(input): EventView                     POST /events   (resolves category labels → ids)
update(id, patch): void                      PATCH /events/:id
remove(id): void                             DELETE /events/:id
addExpense(id, input): void                  POST /events/:id/expenses
updateExpense(id, eid, patch): void          PATCH /events/:id/expenses/:eid   (incl. toggle paid)
removeExpense(id, eid): void                 DELETE /events/:id/expenses/:eid
```

Every mutation calls `bumpData()` so all mounted screens refetch (Activity reflects
the new/removed transaction immediately). Category label↔id via the existing
`resolveCategoryId`. Views (`EventView`, `EventDetailView`, `EventExpenseView`) carry
the server-computed totals + `over` flag and a per-category icon/color resolved
against the app's category metadata.

### Templates (client-side seed data)

Port `EV_TEMPLATES` + `seedFromTemplate` from the prototype: Birthday, Wedding,
Trip, House Party, Custom — each with emoji, accent color, suggested budget, and
pre-filled items (category label + label + planned amount). Templates live in mobile;
the backend is template-agnostic.

### Entry points

- `MoreSheet`: add an **"Events"** item (id `events`, e.g. 🎉) to the list.
- `FabActions`: add a 5th action **"Plan an event"** → navigates to `events` with
  `{ autoCreate: true }` (needs a nav path that passes data + closes the FAB;
  extend the existing `action` handling rather than `openAdd`).

### Reports

Add an **"Event Budgets"** card to `screens/Reports.tsx`, fed by `api.events.list()`
(no new reports endpoint). Each row shows the event's emoji/name and progress
(`paid / budget`, over/under); tapping a row navigates to `event-detail`.

## 7. Munshi

- **Prompt snapshot**: extend `ChatPromptContext` with an events list
  (`{ name, budget, paid, projected, over }`), fetch it in
  `AiChatService.buildPromptContext` (best-effort `.catch(() => [])` like the
  others), and render a `formatEventsSection` in `buildDynamicPrompt`. Add
  "events" to the static prompt's data-domains sentence.
- **Read tool** `list_events` (`events.tools.ts`, `risk: 'safe'`): returns each
  event with computed totals + paid/planned so Munshi answers
  _"How much have I spent on the Goa trip?"_ from live data. Register `EventsService`
  in `ToolCtx.svc` and add `eventTools` to the `TOOL_REGISTRY`.
- Munshi logging a spend already reaches Activity via `create_transaction` — no
  change there.

## 8. Testing

- **Backend unit** (`events.service.spec.ts`): computed totals (planned/paid/
  projected/over); paid-sync state machine — unpaid→paid creates a linked
  account-less tx with the right category/amount/eventId; edit re-syncs; paid→unpaid
  and delete-paid remove the tx; deleting an event nulls `transaction.eventId` and
  does **not** delete the tx.
- **Backend**: ownership/not-found paths mirror budgets/goals specs.
- **Mobile**: adapter mapping (`toEventView`) totals/over flag; template→create
  category resolution.
- Follow `superpowers:test-driven-development` during implementation.

## 9. Open questions / decisions locked

- Paid expenses are **account-less** (locked).
- Event delete **does not cascade** to transactions — `SET NULL` (locked).
- Full scope incl. Reports card + Munshi read/snapshot (locked); Munshi event
  *write* tools deferred.
