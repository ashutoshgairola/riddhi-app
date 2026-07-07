# Multi-day events + per-day expense grouping — design

_Riddhi · 2026-07-07_

## Context

The event budget planner (see `2026-07-07-event-budget-planner-design.md`) models
a **one-off, single-day event** as a budget with a payable expense checklist. Each
`event` carries one `date`; each `event_expense` has no day of its own and the
`EventDetail` checklist is a single flat list.

Real events span multiple days — a wedding (mehndi / ceremony / reception), a
multi-day trip, a festival. The user wants to:

1. Mark an event as **multi-day** and give it a **start and end date**.
2. **Group expenses by day** so each day's spend is planned and read separately.
3. **Drag an expense to move it to another day.**

This spec is a self-contained slice on top of the existing events module. It does
not change the paid⟷transaction sync, event totals, or any downstream module's
amounts.

## Non-goals

- Per-day *budgets* (each day still draws from the one event budget; days show
  subtotals, not their own budget rings).
- Recurring/all-day expense spreading across the range.
- Changing the paid⟷transaction sync or the linked transaction's shape.
- Cross-day drag to a **specific position** within the target day (drag reassigns
  the day; the item lands at the end of the target day — within-day ordering keeps
  using the existing `sortOrder`).

## Design

### Data model (backend)

**`event` entity** (`backend/src/events/event.entity.ts`) — two new columns; the
existing `date` column becomes the **start** date:

```ts
@Column({ type: 'boolean', default: false })
multiDay: boolean;

/** YYYY-MM-DD end date; null for single-day events. `date` is the start. */
@Column({ type: 'date', nullable: true })
endDate: string | null;
```

Single-day events: `multiDay = false`, `endDate = null`, `date` = the day —
identical to today. Multi-day: `multiDay = true`, `date` = start, `endDate` = end.
Existing rows need **no migration** (dev schema auto-syncs via `synchronize:true`;
the new boolean defaults `false` and `endDate` defaults `null`).

**`event_expense` entity** (`backend/src/events/event-expense.entity.ts`) — one
new column:

```ts
/** YYYY-MM-DD day the expense belongs to; null = Unscheduled. In [event.date, event.endDate]. */
@Column({ type: 'date', nullable: true })
dayDate: string | null;
```

### Validation & service logic (`events.service.ts`)

- **Event create/update:** if `multiDay` is true, `endDate` is required and must be
  `>= date` (else `400`). If `multiDay` is false, the service forces `endDate = null`.
- **Expense create/update:** `dayDate`, when present, must be `null` or a date
  within `[event.date, event.endDate]` (else `400`). For a single-day event
  `dayDate` is always coerced to `null` (there is only one day).
- **Range-shrink / flag-off cleanup:** when an event update narrows the range or
  turns `multiDay` off, every expense whose `dayDate` now falls outside the new
  range is reset to `null` (moves to Unscheduled), in the **same DB transaction** as
  the event update. Invariant: every stored `dayDate` is `null` or within range.

### View model & per-day totals

The codebase deliberately computes event totals server-side (`events.totals.ts` +
`events.totals.spec.ts`); `EventDetail` does no client-side re-derivation. Per-day
rollups follow the same rule.

Extend `events.totals.ts` with a tested helper:

```ts
export interface EventDayGroup {
  dayDate: string | null; // null = Unscheduled
  planned: number;
  paid: number;
  count: number;
  paidCount: number;
}

// Ordered: one group per calendar day in [date, endDate] that has >=1 expense,
// in date order, then an Unscheduled group last (only if it has expenses).
export function computeDayGroups(expenses, event): EventDayGroup[];
```

`paid`/`planned` reuse the same math as `computeEventTotals` (paid = sum of
`actual` where `paid`; planned = sum of `planned`). Single-day events return `[]`.

**View types** (`mobile/src/api/types.ts`):

- `EventView` gains `multiDay: boolean` and `endDate: string | null`.
- `EventDetailView` gains `dayGroups: EventDayGroup[]`.
- `EventExpenseView` gains `dayDate: string | null`.
- `ApiEvent` / `ApiEventExpense` gain the corresponding raw fields; the adapters
  (`toEventView`, `toEventDetailView`, expense mapping in `adapters.ts`) pass them
  through.

### Mobile — UI

**CreateEventSheet** (`screens/events/CreateEventSheet.tsx`):

- Add a **"Multiple days"** toggle. Off → the current single `CalendarPicker`. On →
  a single **date-range** field that opens a new **`CalendarRangePicker`** (below)
  for picking start→end in one popover. On create, send `multiDay`, `date` (start),
  and `endDate`.

**`CalendarRangePicker`** (`mobile/src/components/CalendarRangePicker.tsx`) — a
range-selecting sibling of `CalendarPicker` that **reuses its exact look** (same
scrim + floating card, month header with prev/next arrows, month/year jump view,
weekday row, 6×7 grid) and its exported pure helpers (`isSameDay`, `addDays`,
`isAfterDay`, `buildMonthMatrix`). Differences from the single picker:

- Speaks a range: `start: Date | null`, `end: Date | null` in, `onSelect(start, end)`
  out (fired only when a full range is chosen), plus `onClose`.
- Two-tap selection: first tap sets the start (clears end); the next tap on/after the
  start sets the end and commits (`onSelect` + close); a tap **before** the current
  start restarts the selection with that day as the new start.
- Highlight: the start and end cells fill like the single picker's `selected` state
  (`emDim` bg, `em` text); days strictly between render a lighter continuous band so
  the range reads as one span.
- A footer line shows the pending range (e.g. "8 Jul – 10 Jul") so the two-step
  interaction has feedback. The Today/Yesterday quick chips are omitted (they set a
  single day, not a range).
- Template-seeded expenses are created Unscheduled (`dayDate` omitted).

**EventItemSheet** (`screens/events/EventItemSheet.tsx`):

- For multi-day events, add a **Day** selector: a segmented / menu picker offering
  **Unscheduled** plus each day in `[date, endDate]` (restricted to the range — no
  free calendar). Hidden entirely for single-day events. Saves `dayDate`.

**EventDetail** (`screens/events/EventDetail.tsx`):

- **Single-day events render exactly as today** (flat checklist).
- **Multi-day events** render the checklist as **day sections** driven by
  `dayGroups`. Each section header shows the day's date (e.g. "Wed 8 Jul") and a
  per-day **planned / paid subtotal** from the group. An **Unscheduled** section
  (if non-empty) sorts last. The hero chip row shows the date **range** for
  multi-day events (e.g. "🗓 8–10 Jul") instead of a single date.

### Drag-to-move across day groups

Hand-rolled on the existing `react-native-gesture-handler` + `react-native-reanimated`
stack (matching `SwipeRow.tsx` / `PullToRefresh.tsx` / `BottomSheet.tsx`); **no new
dependency**.

- **Long-press** on an expense row lifts it (scale + elevation, other rows dim).
- **Drag**: as the lifted row's centre enters a day section's bounds, that section
  highlights as the active drop target. Section frames are measured
  (`measureInWindow` / `onLayout`) into a ref map keyed by `dayDate` (+ an
  `unscheduled` key).
- **Release** over a section → optimistically move the expense into that group in
  local state, then persist via
  `api.events.updateExpense(id, expId, { dayDate })`. The item appends to the end of
  the target day. On failure: revert local state + `toast("Couldn't move — try again", '📡')`
  (the screen's existing error pattern). The PATCH triggers the usual refresh that
  reconciles server order.
- Release outside any section (or back on the origin) → no-op, row settles back.

This lives inside `EventDetail` and is only active when `multiDay` is true.

## Cross-module consistency

Following the money-management **consistency principle** — every slice leaves the
whole app correct — this slice touches:

- **Paid⟷transaction sync (`events.service.ts`)** — unchanged. `dayDate` is
  planning metadata only; it is **not** copied to the linked transaction and does
  not affect `amount`, `categoryId`, `notes`, or `eventId`.
- **Payment-source foundation (Slice A, `2026-07-07-payment-source-foundation-design.md`)**
  — no interaction. Event-linked transactions keep deriving `paymentMethod` from
  their account (typically none → `cash`) exactly as Slice A specifies; multi-day
  grouping changes nothing on the transaction side. The two slices are independent.
- **Munshi AI-chat (`events` snapshot / `list_events` tool)** — event summaries
  gain `multiDay` and the date range so the assistant reads "Trip to Goa,
  8–10 Jul" correctly. `dayDate` on individual expenses is not surfaced to Munshi
  in this slice (no user need identified; can follow later).
- **Reports "Event Budgets" card** — reads event totals, which are unchanged by
  grouping; no change needed, verified not broken.

Modules needing **no change**: budgets, categories, activity/transactions list,
CSV export (event `dayDate` is not a transaction field).

## Testing

- **Backend:**
  - `events.totals.spec.ts` — `computeDayGroups`: ordering (days ascending,
    Unscheduled last), per-day planned/paid sums, empty-array for single-day,
    days with no expenses omitted.
  - `events.service.spec.ts` — multi-day validation (`endDate` required & `>= date`);
    `dayDate` range validation (in-range ok, out-of-range 400, null ok); single-day
    coerces `dayDate` to null; range-shrink/flag-off resets out-of-range `dayDate`
    to null.
- **Mobile:**
  - Adapter test: `ApiEvent` → `EventDetailView` carries `multiDay`, `endDate`,
    `dayGroups`, and per-expense `dayDate`.
  - (Drag interaction verified manually / via the run skill — gesture behaviour is
    impractical to unit-test.)

## Risks / edge cases

- **Expenses outside the range after an edit** — deterministically reset to
  Unscheduled by the service (§ Validation), so the UI never shows an expense under
  a day that no longer exists.
- **Single-day → multi-day and back** — turning multi-day off nulls all `dayDate`s
  and clears grouping; turning it on shows all existing expenses as Unscheduled
  until the user assigns days. No data loss of the expenses themselves.
- **Drag correctness** — optimistic move is reverted on PATCH failure; server
  refresh is the source of truth for final order.
- **Timezone** — all dates are `YYYY-MM-DD` strings parsed as *local* dates
  (matching `CreateEventSheet`'s existing `parseYMD`), so day boundaries never
  shift under UTC conversion.
