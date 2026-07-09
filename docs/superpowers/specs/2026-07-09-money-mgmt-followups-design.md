# Money-management follow-ups (Slices B & C) — design

Date: 2026-07-09
Branch: feat/riddhi-build
Related slices: B (credit-card management), C (statement import + dedup)

A batch of logged, non-blocking follow-ups from the Slice B and Slice C final
reviews. All are small, self-contained hardening/consistency fixes. Backend uses
`synchronize: true` (no migrations needed for nullable columns / new entities);
mobile has a pure-logic ts-jest harness only (RN components verified by
`tsc --noEmit` + on-device, not component tests).

## Goals

1. **Legacy-card empty state** (Slice B #2) — pre-Slice-B credit accounts have no
   `credit_card` row, so `GET /accounts/:id/card` 404s and `CardDetail` renders
   blank. Give the user a "Set up this card" empty state that creates the row.
2. **sms-sync linking + reverse-dedup** (Slice C #1) — SMS-detected card spends get
   `paymentMethod` but no `accountId` and no dedup, so they show a bare "Card"
   pill under the Bank & UPI filter and can double-count charges already imported
   from a statement or captured by notification-sync. Wire the same
   `resolvePaymentSource` + reverse-dedup helpers the notification-sync pipeline
   already uses.
3. **reverse-dedup tighten** (Slice C #2) — the reverse-dedup predicate currently
   suppresses `possible` verdicts too (`verdict !== 'new'`), which can silently
   drop a genuine 2nd identical charge within ±3d. Tighten the silent-suppression
   path to exact duplicates only.
4. **pay() non-bank reject** (Slice B #3) — `pay()` never explicitly rejects a
   credit-card `fromAccountId` (paying a card bill from another card). Harden it.
5. **isEncrypted compressed-xref** (Slice C #3) — documented limitation only, no
   code change (see Non-goals).

## Non-goals

- **isEncrypted compressed-xref detection.** A PDF that hides `/Encrypt` inside a
  compressed object stream is not caught by the last-4KB trailer byte-scan in
  `statementPdf.ts` `isEncrypted`. It uploads as `{pdf}`; Claude cannot read the
  encrypted bytes and returns no line-items → the review screen shows "no charges
  found." This is a graceful degrade (no crash). Proper detection needs a full
  xref-stream / object-stream parser, which is disproportionate to the value.
  We record it as a known limitation in a code comment; no functional change.
- No migration/backfill of existing `credit_card` rows (the empty state is the
  forward-compatible fix; it also handles any future account that lacks a row).
- No Gmail/Play parsing, no changes to the statement-import or notification-sync
  detection flows beyond the shared helpers listed here.

## 1. Legacy-card empty state (backend + mobile)

### Backend — `CreditCardService.updateConfig` becomes an upsert
Current `updateConfig` calls `loadCard`, which throws `NotFoundException` when no
row exists — so `PATCH /accounts/:id/card` 404s for legacy cards, same as `GET`.

Change `updateConfig` to create the row when missing:

1. Try to find the row (`cardRepo.findOne({ where: { accountId, userId } })`).
2. If absent: `accountsService.findOne(accountId, userId)` to assert the account
   exists and is owned by the user (throws 404 on miss — no IDOR); assert
   `account.type === AccountType.CREDIT` (else `BadRequestException`, mirroring
   `getSummary`); then `cardRepo.create({ accountId, userId })` relying on the
   entity's column defaults (the same defaults the create-on-account-create path
   seeds).
3. `Object.assign(card, dto)`, `save`, return `getSummary(accountId, userId)`.

`GET` and `pay` are unchanged — they still 404 until the card is set up. Only the
config-save path (which the empty-state CTA calls) creates the row.

### Mobile — `CardDetail` empty state
`CardDetail` loads the summary via `useApiData(() => api.cards.get(id))`. Today a
404 surfaces as a generic error/blank. Change:

- `api.cards.get` / the client must let `CardDetail` distinguish a **404**
  (no card row → not set up) from a transient/other error. (The api client throws
  on non-2xx; expose the status so a 404 can be told apart — e.g. an error shape
  carrying `status`, or a dedicated caught branch. Exact mechanism chosen in the
  plan to match the existing client's error surface.)
- On 404: render a **"Set up this card"** empty state — short explainer + a CTA
  button. The CTA opens the existing card-settings sheet (credit limit, statement
  day, network, last4). Saving calls `api.cards.updateSettings` (now an upsert) →
  on success, refetch the summary (the screen re-renders with the real card).
- On any other error: keep the existing retry banner (unchanged).

The settings sheet is the same one CardDetail already uses to edit a live card;
no new form is built, only a new entry into it from the empty state.

## 2. sms-sync linking + reverse-dedup (backend + mobile)

The SMS path is mobile-driven: `smsSync.ts` reads the inbox, posts bodies to the
stateless `POST /sms-sync/parse-batch`, and `Sync.tsx` `saveDetected` creates each
confirmed suggestion via `POST /transactions`. Today it threads only
`paymentMethod`; `last4`/`bank` are dropped and there is no dedup.

### Backend — resolve accountId + flag duplicates in `parse-batch`

- **Input:** extend the batch item shape to carry the message **timestamp**
  (`{ id, raw, date }`, `date` optional for backward-compat). The mobile reader
  already has per-message timestamps. `date` is used both as the suggested
  transaction date and as the center of the reverse-dedup window.
- **Account resolution:** inject `AccountsService` and the `CreditCard` repo into
  `SmsSyncService` (or a thin resolver at the controller/module seam — plan
  decides). Build the accountId→last4 map from `cardRepo` (last4 lives on the
  `credit_card` row, not the account), assemble `AccountLite[]`, and call the
  existing `resolvePaymentSource(bank, rail, accounts, last4)`. `rail` maps from
  the SMS `paymentMethod` (`upi`→`upi`, `card`→`card`, `autopay`→`autopay`).
  Result: `accountId | null` (unique institution/last4 match, else null).
- **Reverse-dedup:** for each parsed item that resolved an `accountId`, load
  existing txns for that account in the ±3d window
  (`TransactionsService.findForAccountInRange`) and compute the verdict via the
  new `reverseDedupVerdict` helper (see §3). Set `possibleDuplicate = verdict !==
  'new'` (flag both `possible` and `duplicate` — flagging is safe; the user
  decides). Do **not** drop the suggestion.
- **Output:** each parsed result gains `accountId: string | null` and
  `possibleDuplicate: boolean`.
- Per-message range queries are acceptable (bounded sync batch, matches the
  existing per-call fetch pattern); grouping by account is an optional
  optimization, not required.

### Mobile — thread accountId + surface the flag

- `smsSync.ts`: include each message's timestamp in the batch payload; map the
  returned `accountId` and `possibleDuplicate` into `SyncDetected`; use the
  server-provided date instead of "today" for the row time.
- `SyncDetected` type gains `accountId?: string` and `possibleDuplicate?: boolean`.
- `Sync.tsx` `saveDetected`: thread `accountId` into `api.transactions.create`.
- Flagged rows show a **"possible duplicate"** hint and are **excluded from
  "Add all"** (the user must confirm them individually). Single confirm/dismiss
  is unchanged.

## 3. reverse-dedup tighten (backend)

`isLikelyDuplicateOfExisting` currently returns `verdict !== 'new'`, so it treats
a `possible` (ambiguous, ≥2 candidates) verdict as a duplicate. Extract the
verdict so the two consumers can key off it differently:

```ts
// returns the classification of a single incoming charge against existing txns
export function reverseDedupVerdict(
  candidate: ParsedLineItem,
  existing: ExistingTxn[],
  windowDays = 3,
): 'new' | 'possible' | 'duplicate' {
  return classifyLineItems('rev', [candidate], existing, { windowDays })[0].verdict;
}

// silent-suppression predicate — exact duplicates only (TIGHTENED)
export function isLikelyDuplicateOfExisting(
  candidate: ParsedLineItem,
  existing: ExistingTxn[],
  windowDays = 3,
): boolean {
  return reverseDedupVerdict(candidate, existing, windowDays) === 'duplicate';
}
```

- **notification-sync** keeps calling `isLikelyDuplicateOfExisting` → now silently
  drops only exact duplicates. A genuine 2nd identical charge (which classifies as
  `possible`) is no longer silently dropped — it flows through as a detection the
  user reviews.
- **sms-sync** (§2) calls `reverseDedupVerdict` directly and flags on `!== 'new'`
  — safe because it only flags, never drops.

Update `reverse-dedup.spec.ts`: the `possible` case now returns `false` from
`isLikelyDuplicateOfExisting`; add coverage for `reverseDedupVerdict` returning
each of the three verdicts.

## 4. pay() non-bank reject (backend)

In `CreditCardService.pay`, after loading `from = accountsService.findOne(
dto.fromAccountId, ...)` and before the balance check, reject a credit source:

```ts
if (from.type === AccountType.CREDIT) {
  throw new BadRequestException('Cannot pay a card bill from a credit card');
}
```

Add a test asserting a credit `fromAccountId` is rejected (and that the reject
happens before any transaction is created).

## Cross-module consistency

- SMS-linked `accountId` (+ existing `paymentMethod`) means these txns now sort
  under the correct Cards vs Bank & UPI filter, appear as swipes in the Slice B
  card summary, and flow into budgets, reports, CSV export, and Munshi
  automatically — they are ordinary `EXPENSE`/`INCOME` transactions, no special
  casing.
- Reverse-dedup (tightened) prevents double-counting a charge across the three
  ingest paths (SMS ↔ notification-sync ↔ statement import) while no longer
  silently dropping a real repeat charge.
- Legacy-card setup unblocks `CardDetail` and the Munshi card-dues snapshot /
  accounts-tool card fields for pre-Slice-B credit accounts.

## Testing

- **Backend (jest, TDD):**
  - `updateConfig` upsert: creates a row for a legacy credit account (defaults +
    dto applied), rejects a non-credit account, no IDOR on another user's account.
  - `pay()` rejects a credit `fromAccountId` before creating a transaction.
  - `reverseDedupVerdict` returns `new`/`possible`/`duplicate` correctly;
    `isLikelyDuplicateOfExisting` is now true only on `duplicate`.
  - `parse-batch` resolution: sets `accountId` on a unique last4/institution
    match, leaves it null when ambiguous; sets `possibleDuplicate` when an
    existing txn matches in-window.
- **Mobile (pure-logic ts-jest):**
  - the batch-mapping helper (parsed → `SyncDetected`, incl. `accountId` +
    `possibleDuplicate` + server date).
  - the "Add all excludes flagged" selection helper.
- **Mobile UI (tsc + on-device):** CardDetail empty state → setup → live card;
  Sync flagged-row hint + confirm/dismiss/add-all behavior.

## Risks / notes

- `parse-batch` gains DB dependencies (accounts + card repo + tx range query),
  moving it from a pure stateless parser to a stateful endpoint. Its unit tests
  that exercise pure parsing stay valid; new resolution/dedup behavior is tested
  separately with mocked repos.
- Reverse-dedup for SMS uses the message timestamp as the charge date; an older
  message in the 30-day lookback dedups against that historical window, not
  "now" — this is more correct than the current "today" behavior.
- The `updateConfig` upsert changes PATCH semantics from update-only to
  create-or-update; documented in the method and the api layer.
