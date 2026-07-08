# Notification-sync — design

## Context

Riddhi already turns bank **SMS** into reviewable transactions
(`backend/src/sms-sync/`, `mobile/modules/sms-reader/`, `mobile/src/lib/smsSync.ts`)
using a regex parser. That pipeline has two structural limits:

1. **Source coverage.** It only reads the SMS inbox. Many spends today arrive
   *only* as an app notification — a Rapido/Uber/Swiggy receipt, a
   GPay/PhonePe/Paytm confirmation — never as SMS. It also cannot correlate the
   two halves of a single spend (the merchant app says "your ride was ₹159", the
   bank says "₹159 debited").
2. **Parsing brittleness.** The regex misses real-world formats. Concretely, a
   plain HDFC UPI SMS (`Sent Rs.1.00 From HDFC Bank A/C *1281 To SHOURYA JOSHI`)
   currently yields `merchant: null`, `last4: null`, `account: null` because the
   `last4` regex does not handle `*`-masked numbers and the merchant regex is
   case-sensitive. An LLM reads these robustly.

This feature adds an Android **notification listener** as a *new source* feeding
the *existing* review pipeline, and uses a Claude (Sonnet) model to analyse a
batch of captured notifications — extracting transactions **and correlating
related notifications into a single transaction**.

The app is distributed as a **sideloaded APK, not via Google Play**, so the
notification-access special permission (which Play restricts) is acceptable.

This feature builds on the just-landed **Payment-source foundation** (Slice A,
`docs/superpowers/specs/2026-07-07-payment-source-foundation-design.md`): every
transaction now carries `accountId` + `paymentMethod`, credit cards are
`Account`s (`AccountType.CREDIT`), and the app has an account/card picker plus a
`SourceTag`. Notification-sync must produce transactions that carry those same
two fields, per that foundation's **consistency principle**.

## Goal

Capture notifications from a curated set of finance/merchant apps, analyse them
in bulk with an LLM on a schedule, correlate related notifications into single
transactions with the right merchant/amount/category/payment-source, and surface
them on the existing Sync screen for the user to confirm before they hit the
ledger.

Worked example: a `com.rapido` notification ("Your ride ₹159") plus an HDFC bank
notification ("Rs.159 debited … A/C *1281") become **one** pending transaction —
Rapido, ₹159, Transport, `HDFC UPI` — that the user confirms.

## Non-goals

- iOS (no notification-read API; Android-only by design, like sms-reader).
- Reading non-allowlisted notifications (WhatsApp, OTPs, news, etc.) — never
  captured.
- Auto-writing to the ledger. Every detection is `pending` until the user
  confirms (matches receipts + SMS today).
- A Slice-B `last4` field on `Account`, card statement math, or subscriptions —
  those are separate slices. This feature stays forward-compatible with them.

## Decisions (locked during brainstorming)

- **Source strategy:** notifications are a *new* source into the *existing*
  unified review pipeline; SMS-sync stays. The LLM correlates/dedupes across
  sources.
- **Capture scope:** a **curated package allowlist** (banks + GPay/PhonePe/Paytm
  + Rapido/Uber/Swiggy/Amazon…). Only allowlisted packages are ever captured.
- **Trigger:** listener captures 24/7 to on-device storage; the **backend
  auto-analyses on a schedule** and pushes "N transactions detected"; the user
  **confirms before save**.
- **Correlation:** **one batched LLM call does grouping + extraction**
  (Approach A), with a deterministic **dedup key** for idempotency.

## Architecture & data flow

```
ANDROID (sideloaded APK)
  notification-listener (new native Expo module)
    - NotificationListenerService: onNotificationPosted for every notification
    - package allowlist filter (finance / merchant apps)
    - writes {packageName, title, text, postedAt, key} to local SQLite log
  notificationSync.ts (JS upload worker)
    - selects uploaded=0 rows, POST /notification-sync/ingest in batches
    - marks rows uploaded=1 on 2xx (dedupKey makes re-send harmless)
        |
        v  POST /notification-sync/ingest
BACKEND (NestJS)
  CapturedNotification table (raw, per user, dedupKey UNIQUE, analyzed flag)
  @Cron (reuses notifications.scheduler pattern, Asia/Kolkata) per user:
    1. load analyzed=false captures (capped batch)
    2. ONE Sonnet call -> grouped transactions (correlates Rapido+HDFC)
    3. resolve accountId/paymentMethod, insert DetectedTransaction (pending)
    4. mark captures analyzed=true; expo-push "N detected" if any
        |
        v  GET /notification-sync/pending
  Sync screen (existing UI) -> confirm/edit -> real Transaction
```

### Two-stage dedup (idempotency backbone)

- **Capture-level:** `dedupKey = hash(packageName + normalizedAmount +
  postedAt-bucket)`, `UNIQUE (userId, dedupKey)`. The same notification uploaded
  twice is dropped at ingest.
- **Analysis-level:** captures flip `analyzed=true` once grouped, so a batch is
  never re-analysed and suggestions never duplicate across cron runs.
- **Cross-source (SMS ↔ notification):** because a bank alert arrives as *both*
  an SMS and a notification, the LLM groups both records of one debit into a
  single transaction, and the amount+time-bucket dedup key means confirming one
  will not let the other resurface.

## Mobile — capture (Android native)

**New local Expo module `mobile/modules/notification-listener/`** (mirrors
`sms-reader`'s structure; registered on Android only, degrades to no-op
elsewhere):

- A `NotificationListenerService` subclass. Enabling it requires the user to flip
  a toggle in **Settings → Notification access** (a one-time system-settings
  grant, acceptable for a sideloaded APK). The module exposes `isEnabled()` and
  `openSettings()` so the Sync screen can guide the user.
- `onNotificationPosted(sbn)` → apply the **package allowlist** → extract
  `packageName`, `title`, `text`/`bigText`, `postedAt`, and Android's stable
  `sbn.key` → insert a row into a local **SQLite** table via `expo-sqlite`.
  SQLite (not AsyncStorage) because this is an append-heavy log needing
  `WHERE uploaded=0` queries and a bounded size.
- Ring-buffer cap (≈60 days / 5 000 rows). Non-allowlisted notifications are
  never stored.

**Upload worker `mobile/src/lib/notificationSync.ts`** (sibling of `smsSync.ts`):

- Runs on app foreground and after capture bursts; selects `uploaded=0` rows,
  `POST /notification-sync/ingest` in batches of ~100, marks `uploaded=1` on 2xx.
- Idempotent: the backend `dedupKey` unique constraint absorbs any double-send.

## Backend — analysis

**New module `backend/src/notification-sync/`** (sibling of `sms-sync/`, reuses
the receipts Anthropic-client injection pattern so the module→service and
service→token imports don't cycle):

- `POST /notification-sync/ingest` — validates and inserts `CapturedNotification`
  rows (`analyzed=false`), dropping `dedupKey` collisions.
- **`@Cron` job** (reuses `notifications.scheduler.ts` pattern, `Asia/Kolkata`,
  wrapped in the existing per-user `safe()`), per user:
  1. Load `analyzed=false` captures; cap the batch (≈150).
  2. **One Sonnet call.** New env `NOTIFICATION_AI_MODEL` (default
     `claude-sonnet-5`) so bulk analysis is cheap while chat/receipts stay on
     `claude-opus-4-8` (`AI_MODEL`). Structured output (tool / JSON schema)
     returns `groups[]`, each with `merchant`, `amount`, `type`, `category`,
     `institution`, `rail`, `last4`, and the `sourceKeys[]` that formed the
     group.
  3. For each group → resolve `accountId` / `paymentMethod` (see below) → insert
     a `DetectedTransaction` (`status=pending`).
  4. Mark those captures `analyzed=true`; if any new detections, `expo-push` via
     the existing dispatcher: *"Munshi found N transactions to review."*
- `GET /notification-sync/pending` — pending detections for the Sync screen.
- `POST /notification-sync/:id/confirm` (with optional edits) — creates the real
  `Transaction` (carrying `accountId` + `paymentMethod`) via `TransactionsService`
  and sets the detection to `confirmed` with its `transactionId`.
- `POST /notification-sync/:id/dismiss` — sets `dismissed`. Both are terminal, so
  a resolved detection never reappears.

### Payment-source resolution

The LLM returns `institution` (e.g. "HDFC"), `rail` (`upi`/`card`/`netbanking`/
`autopay`), and `last4` (e.g. "1281"). The backend maps these to Slice-A fields:

- `paymentMethod` is set directly from `rail`.
- `accountId` is resolved by matching `institutionName` (+ account type implied
  by rail; `card` → `AccountType.CREDIT`) against the user's accounts:
  - **Unambiguous** single match → auto-fill `accountId`.
  - **Ambiguous or no match** → leave `accountId` **null**; the review card's
    account picker (from Slice A's `AddTxSheet` / `DetectedCard.tsx`) lets the
    user pick. `paymentMethod` is still set from `rail`, so the `SourceTag` is
    correct either way.

**Known gap, handled without a schema change:** `Account` has `institutionName`
but no stored `last4` yet (Slice A notes the masked account number "has no
backend equivalent"). So `*1281` cannot pin an *exact* account when the user has
two accounts at one bank — hence the ambiguous→null→user-picks fallback. This
stays forward-compatible: when a later slice adds `last4` to `Account`,
resolution simply becomes more precise with no change to this design.

## Data model (two new entities)

```
CapturedNotification
  id, userId, packageName, title, text, postedAt,
  dedupKey (UNIQUE per user), analyzed (bool, default false), createdAt

DetectedTransaction
  id, userId, merchant, amount, type,
  suggestedCategoryId, accountId (nullable), paymentMethod,
  confidence, status (pending|confirmed|dismissed),
  sourceKeys (simple-array; audit trail of which notifications formed it),
  transactionId (nullable; set on confirm), createdAt
```

`sourceKeys` preserves which captured notifications formed each detection, so a
mis-grouping is explainable and reversible.

## Cross-module consistency (per foundation principle)

This feature carries its own consistency section, as every slice must:

- **Transactions:** confirmed detections create transactions with `accountId` +
  `paymentMethod` set, so `SourceTag`, the Bank & UPI / Cards filter, budgets,
  reports/insights, and Munshi all treat them like any other transaction — no
  special-casing.
- **SMS-sync:** unchanged in behaviour, but the LLM's cross-source grouping +
  the shared `dedupKey` mean a spend that arrives as both SMS and notification
  is not double-counted. The allowlist/parsing logic lives in one backend place,
  reusable by the future "SMS dedup" slice (C).
- **Munshi AI-chat:** no tool change required — it reads the resulting
  transactions, which already carry payment source from Slice A.
- **Categories / accounts:** the LLM's suggested category maps to an existing
  `TransactionCategory` by name at confirm time (unknown → user picks), reusing
  the same resolution the review card already does.

Modules needing **no change**: budgets, goals, events, reports (amounts flow
through the normal transaction create-path once confirmed).

## Privacy, cost, errors

- **Privacy:** only allowlisted packages ever leave the device; raw captures are
  user-scoped. The Sync screen exposes a "Pause capture" toggle and a "clear
  captured data" action (local + server).
- **Cost control:** one batched call per cron run; Sonnet, not Opus; capped
  batch size; the LLM is skipped entirely when there are zero unanalysed
  captures.
- **Errors:** an LLM failure leaves captures `analyzed=false` for the next run
  (the scheduler's `safe()` wrapper already isolates per-user failures);
  malformed LLM output is validated and bad groups are dropped, never saved.

## Testing

- **Backend:**
  - `dedupKey` collision at ingest is a no-op (no duplicate row).
  - Grouping-response → `DetectedTransaction` mapping, including the
    **Rapido + HDFC correlation** producing one detection, and the
    **ambiguous-account → `accountId` null** case.
  - `confirm` creates a `Transaction` carrying the right `accountId` +
    `paymentMethod`; `dismiss` is terminal; both prevent re-surfacing.
  - Cron: zero unanalysed captures → no LLM call; ≥1 detection → push sent.
- **Mobile:**
  - Upload worker selects only `uploaded=0`, batches, and marks `uploaded=1`
    against a mock client; native module kept thin (integration-tested manually).
- **LLM prompt:** a fixture set of real notification batches (Rapido+HDFC,
  standalone GPay, noise-only) asserting the structured output shape and
  correlation, run against a recorded/mocked response in unit tests.

## Risks / edge cases

- **Notification listener killed by the OS** — capture is best-effort; a missed
  notification simply never becomes a suggestion (same failure mode as SMS-sync
  missing a message). No correctness impact on existing data.
- **Partial correlation** — merchant notification present but bank one missing
  (or vice-versa): the LLM still emits a single-source detection; the user
  confirms with whatever fields are known.
- **Amount mismatch** (fare ₹159 shown, ₹161 debited with a tip): the LLM may
  still group by time+merchant semantics; the review step is the safety net.
- **Duplicate across SMS and notification** — handled by cross-source grouping +
  shared dedup key (above).
- **Account ambiguity** — handled by ambiguous→null→user-picks (above).
