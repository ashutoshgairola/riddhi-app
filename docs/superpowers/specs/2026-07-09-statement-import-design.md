# Statement import + dedup (Slice C) — design

## Context

Third slice of the Riddhi money-management feature set (see
`docs/superpowers/specs/2026-07-07-payment-source-foundation-design.md` for the
A–E slice decomposition). Slices A (payment-source foundation) and B (credit-card
management + pay-bill) are built and reviewed on `feat/riddhi-build`.

This slice adds **statement import**: the user uploads a monthly statement PDF and
Riddhi parses it, detects charges it already has (from SMS / notification-sync /
manual entry) so nothing double-counts, lets the user review, and imports the
rest as real transactions.

**Statement import works for any account, not just credit cards.** A user can
upload a credit-card statement *or* a bank-account statement. The flow is the same
shape for both; only the outputs differ (see Goal).

Two existing patterns make this slice lean and are reused rather than reinvented:

1. **Receipts** (`backend/src/receipts/`) already does *upload → Claude structured
   extraction → return best-effort fields → user confirms before save*, with an
   optional Anthropic client behind a DI token (`RECEIPTS_ANTHROPIC_CLIENT`) and a
   JSON-parse hallucination guard. Statement parsing mirrors this, using Claude's
   **PDF document content block** instead of an image block.
2. **notification-sync** (`backend/src/notification-sync/`) already establishes
   dedup thinking (`computeDedupKey`), the confirm-before-save review model
   (`DetectedTransaction` → pending → confirm/dismiss), and per-rail account
   resolution (`resolvePaymentSource`, `resolveAccountByLast4`-style logic).

## Consistency principle (applies to every slice)

Each slice keeps the rest of the app in sync as part of that slice. This slice
carries its own "Cross-module consistency" section, and it is unusually load-bearing
here because imported charges must not collide with SMS/notification-detected ones
in either direction.

## Goal

Let the user upload a statement PDF and, after review, get their charges into
Riddhi exactly once:

- **Credit-card statement** → populate the CreditCard statement-override fields
  defined in Slice B (`statementDate`, `statementBilled`, `statementMinDue`,
  `statementDueDate`, `statementRewards`) so the card view shows the bank's exact
  figures, **and** import the debit line-items as card expenses.
- **Bank statement** → import debit line-items as expenses and credit line-items as
  income; show the statement's closing balance and offer a one-tap, user-confirmed
  "set account balance to ₹X" (never automatic); flag own-account transfers for
  review rather than creating phantom expenses.

Every imported line-item is deduplicated against transactions Riddhi already has,
so re-uploading a statement, or a later SMS arriving for an already-imported charge,
never double-counts.

## Non-goals (later slices / out of scope)

- Subscriptions detection (Slice D) and the Home widgets (Slice E).
- OCR of *scanned/photographed* paper statements — v1 targets the emailed digital
  PDF that banks issue (Claude's PDF document block reads its text/layout).
- Automatic (non-confirmed) import — every charge is reviewed before it is saved.
- Fetching statements from email/bank APIs — the user supplies the PDF file.
- Editing/deleting *already-imported* transactions from within the import flow
  (they become ordinary transactions, editable through the normal TxDetail path).

## Design

### 0. End-to-end flow

1. User taps **Import statement** from one of three entry points (see Mobile):
   CardDetail (target card implicit), a bank AccountDetail (target account
   implicit), or the Sync screen (target account auto-matched from the parsed
   number).
2. User picks a PDF (`expo-document-picker`); mobile uploads it base64.
3. Backend **detects encryption**. If the PDF is encrypted and no password was
   supplied, it responds `422` (`{ error: 'password_required' }`). Mobile prompts
   for the password and resubmits the same request with `password`.
4. Backend **decrypts** the PDF transiently (password held only for the request,
   never persisted) and sends the decrypted PDF to Claude as a **document block**.
5. Claude returns a structured `ParsedStatement`: an account hint (last4 /
   masked number, inferred type), statement period, summary block (card:
   billed/minDue/dueDate/rewards/statementDate; bank: opening/closing balance),
   and line items `[{ isoDate, amount, direction: 'debit'|'credit', descriptor,
   category? }]`. A hallucination guard validates the shape and drops nonsense.
6. Backend **resolves the target account**: implicit from the entry point, else
   matched by last4; it validates the parsed last4 against the on-screen account
   and surfaces a mismatch warning rather than silently importing to the wrong
   account.
7. Backend runs the **deterministic dedup** (see §3) over the line items against
   the account's existing transactions in the statement period, tagging each
   `new | duplicate | possible`.
8. Backend returns a **stateless `StatementParseResult`** (summary + classified
   line items). Nothing is persisted at this step — like `receipts.scan`, parse →
   return → done, so there is no half-imported DB state to reconcile if the user
   abandons review.
9. Mobile shows the **review screen** (§Mobile): editable summary header +
   line items sectioned New / Possible / Duplicate, per-row include toggle and
   category edit.
10. On confirm, mobile calls `POST /statements/import` with the vetted selection.
    Backend creates the transactions (stamping `importFingerprint`), patches the
    CreditCard override fields (card) and/or sets the account balance (bank, only
    if the user opted in), and returns counts `{ imported, skipped }`.

### 1. Data model change (backend)

One nullable column — under the repo's `synchronize: true` convention this needs
**no migration**:

- `Transaction.importFingerprint: varchar(64) | null` (indexed). A stable hash of
  `accountId + amount + isoDate + normalizedDescriptor` (see §4). It is set on
  every statement-imported transaction and guards **both** dedup directions:
  - **Re-import:** importing the same statement again matches existing
    fingerprints → those lines classify as `duplicate`.
  - **Reverse (forward-in-time):** a later SMS/notification for a charge that was
    imported from a statement dedups against the imported transaction.

No new entity: the parse is stateless, and the CreditCard override fields already
exist from Slice B. Line-item mapping reuses existing enums:
`direction:'debit'` → `TransactionType.EXPENSE`, `direction:'credit'` →
`TransactionType.INCOME`; card expenses carry `paymentMethod = card`, bank lines
`upi`/`netbanking` per available signal (default `netbanking`).

### 2. Backend module structure

A dedicated **`statements` module** (`backend/src/statements/`), separate from
`credit-card` because it spans both bank and card accounts. It imports
`AccountsModule`, `TransactionsModule`, and `CreditCardModule` (to PATCH the card
override fields), and defines its own Anthropic client provider mirroring receipts.

- `pdf-crypto.ts` — `isEncrypted(buffer)` and `decrypt(buffer, password)`,
  backed by `qpdf` (via a node wrapper or a spawned binary). Password is a
  function argument only, never stored or logged.
  *Infra note:* the backend runtime/image must have `qpdf` available.
- `statement-parser.service.ts` — sends the decrypted PDF to Claude as a document
  block and parses the JSON reply into a typed `ParsedStatement`, with a
  hallucination guard modelled on notification-sync `parseGroups` (drops items
  with non-positive amounts, bad dates, or missing required fields). Uses the
  `STATEMENTS_ANTHROPIC_CLIENT` DI token (defined in the service file to avoid a
  module↔service import cycle, exactly like `RECEIPTS_ANTHROPIC_CLIENT`).
- `statement-dedup.ts` — **pure** `classifyLineItems(items, existingTxns, opts)`
  returning per-item `{ item, verdict, matchedTransactionId? }`. See §3.
- `import-fingerprint.ts` — pure `computeImportFingerprint(accountId, amount,
  isoDate, descriptor)` and a `normalizeDescriptor` helper.
- `account-resolve.ts` — pure/thin `resolveAccountByLast4(accounts, last4)` used
  by both this module and the SMS/notification path (see Cross-module).
- `statements.service.ts` — orchestrates `parse()` (decrypt → parse → resolve
  account → dedup → return) and `import()` (create transactions with fingerprint →
  patch card override / set balance → return counts).
- `statements.controller.ts` — the two endpoints below.

### 3. Dedup rule (pure, deterministic)

`classifyLineItems` decides, for each parsed line item, whether Riddhi already has
that transaction on the target account:

- **Candidate set:** existing transactions on the same account whose date is within
  `±window` days of the line item (default `window = 3`, since a statement "posted"
  date lags the SMS "transaction" date) **and** whose amount equals the line item's
  amount (exact, same sign/direction).
- **Scoring:** a fuzzy merchant/descriptor similarity boosts confidence and breaks
  ties, but is **not required** — bank statement descriptors routinely differ from
  SMS merchant text, so amount + date + account is the backbone.
- **Verdict:**
  - exactly one candidate → `duplicate` (skipped by default; carries
    `matchedTransactionId`),
  - two or more candidates, or a single weak/low-similarity candidate → `possible`
    (surfaced for the user to decide; defaults to *not* importing to stay safe),
  - no candidate → `new` (imported by default).
- Existing transactions already bearing a matching `importFingerprint` short-circuit
  to `duplicate` (handles exact re-import).

The LLM is used only to *parse the PDF*, never to judge duplicates — the dedup is
deterministic and unit-testable, and ambiguity is resolved by the human in review.

### 4. Fingerprint

`computeImportFingerprint = sha1(accountId | amount(2dp) | isoDate |
normalizeDescriptor(descriptor)).slice(0,64)`, where `normalizeDescriptor`
lower-cases, strips punctuation/extra whitespace, and trims trailing reference
numbers so cosmetic differences don't change the key. Stable across re-imports of
the same statement.

### 5. Endpoints (backend)

- `POST /statements/parse` — body `{ accountId?, pdf (base64), mimeType:
  'application/pdf', password? }`. Returns `StatementParseResult`
  `{ account: { id, matchedByLast4, mismatchWarning? }, statementType:
  'card'|'bank', period: { from, to }, summary: {...}, items:
  [{ isoDate, amount, direction, descriptor, category, verdict,
  matchedTransactionId? }] }`. Returns `422 { error: 'password_required' }` when
  the PDF is encrypted and no/invalid password is supplied. `400` on an
  unresolvable account or a non-PDF. `503` when the Anthropic client is not
  configured (mirrors receipts).
- `POST /statements/import` — body `{ accountId, statementType, items: [the
  user-vetted subset, each with final category + direction], summary?
  (card override figures to apply), setBalance? (bank closing balance to set) }`.
  Creates the transactions via the existing `TransactionsService.create` path
  (stamping `importFingerprint`, so both balances/deltas move exactly as any other
  transaction), applies the card override via the CreditCard PATCH path when
  `statementType==='card'` and `summary` is present, and sets the account balance
  when `setBalance` is present. Returns `{ imported, skipped }`. Idempotent for
  already-imported lines (their fingerprints match → they are not re-created).

### 6. Mobile

- `api.statements` resource: `parse(payload)` and `import(payload)`; adapters map
  the parse-result DTO → a `StatementReviewView` (summary + three verdict buckets).
- **PDF selection** via `expo-document-picker` (Expo v56 docs read before coding,
  per `mobile/AGENTS.md`).
- **Entry points (shared flow):** an "Import statement" action on `CardDetail`
  (card implicit) and on the bank `AccountDetail` (account implicit), plus an
  "Import a statement" tile on the `Sync` screen (account auto-matched from the
  parsed number, prompting the user to pick/confirm if ambiguous).
- **Password prompt** — a small sheet shown when `parse` returns `422`; resubmits
  the same file with the entered password. The password is never persisted.
- **StatementReview screen:**
  - An editable **summary header**. Card: the override figures
    (billed/minDue/dueDate/rewards/statementDate) to confirm before applying. Bank:
    a "Set balance to ₹{closing}" toggle (off by default).
  - Line items **sectioned New / Possible / Duplicate**; each row has an include
    toggle (New on, Duplicate off, Possible off by default) and an inline category
    edit. Category resolution reuses `categories.resolveId` (create-or-resolve),
    same as the notification-confirm path.
  - An **Import** button that summarizes "N will be added, M skipped" and calls
    `api.statements.import`, then refreshes card/account data (the Slice B
    `bumpData` pattern).
- Mobile keeps to the pure-logic ts-jest harness: verdict-bucketing, include/exclude,
  and adapter mapping are extracted to RN-free helpers with unit tests; the RN
  screens are verified by `npx tsc --noEmit` + driving the app (jest-expo remains
  blocked by the RN peer-dep).

### Cross-module consistency (Slice C)

- **SMS → account linking (folds in the Slice A follow-up #1).** The
  `resolveAccountByLast4` helper built for statement→account matching is shared into
  the SMS/notification account-resolution path (`resolvePaymentSource` / sms-sync),
  so an SMS-detected card spend finally gets its `accountId`. This fixes the
  Slice A limitation where SMS card spends showed a bare "Card" pill and fell under
  the "Bank & UPI" filter (which keys off `account.type='credit'`, so a null-account
  spend was misclassified).
- **Reverse dedup.** The SMS/notification confirm path and sms-sync gain a dedup
  check against recent account transactions using the shared `statement-dedup`
  matcher (amount + date + account, plus `importFingerprint`), so a later SMS for a
  charge already imported from a statement is skipped or flagged rather than
  creating a second transaction.
- **Budgets / Reports / Insights.** Imported debits are real expenses (counted),
  imported credits are income; card-bill transfers remain excluded (Slice B).
  Because of dedup there is no double-count. This is a regression check, not a code
  change: a statement-imported expense counts in budgets/reports exactly once.
- **Munshi.** Imported transactions and now-exact card override figures flow through
  the existing snapshot + accounts tool from Slice B with no new tool — Munshi's
  "how much do I owe / when's it due" answers simply become exact once a statement
  is imported.
- **CSV export / events / categories / receipts.** Imported rows are ordinary
  `Transaction`s → they appear in CSV export, are assignable to events, and are
  categorized through the shared `categories.resolveId` resolver. No special-casing
  anywhere downstream.

## Testing

- **Backend (pure/unit):**
  - `statement-dedup.classifyLineItems` — exact single match → duplicate; date at
    the window edge (in vs out); two same-amount/same-day candidates → possible;
    single weak-merchant candidate → possible; no candidate → new; existing
    `importFingerprint` match → duplicate.
  - `computeImportFingerprint` / `normalizeDescriptor` — stability across cosmetic
    descriptor changes; different account/amount/date → different key.
  - `resolveAccountByLast4` — unique match, no match, ambiguous.
  - `statement-parser` hallucination guard — bad JSON, missing required fields,
    non-positive amount, malformed date all dropped/handled (Anthropic client
    mocked).
- **Backend (service):** `import()` creates transactions carrying
  `importFingerprint`, patches the card override when `statementType==='card'`, and
  sets the balance only when `setBalance` is provided; re-import of the same items
  creates nothing new. `parse()` returns `422` for an encrypted PDF without
  password. Reverse-dedup: the SMS/notification path skips a charge already imported.
- **Mobile:** parse-result adapter mapping (verdict buckets + summary); review
  include/exclude pure logic; 422 → password-prompt handling.
- **Cross-module:** an SMS-detected card spend now carries `accountId` and lands
  under the "Cards" filter (follow-up #1 regression); re-importing a statement →
  all lines Duplicate; import-then-SMS for the same charge → deduped.

## Risks / edge cases

- **Wrong/again-encrypted PDF password** → clear `422`/`400` and a retry prompt; no
  partial state (parse is stateless).
- **LLM misparse** (wrong amount/date/merchant) → the user reviews every line before
  anything is saved; a misread never silently creates a wrong transaction.
- **Statement descriptor ≠ SMS merchant** → dedup keys on amount + date + account;
  merchant is only a booster, so a descriptor mismatch does not miss a real
  duplicate.
- **Two genuine same-amount/same-day charges** → flagged `possible`, not
  auto-skipped, so a real second charge is not silently dropped.
- **Own-account transfers on a bank statement** → flagged for review rather than
  imported as an expense/income, to avoid phantom double-sided entries.
- **Foreign-currency / EMI / fee lines on a card statement** → parsed best-effort;
  the user can exclude any line in review.
- **Balance reconcile is always opt-in** → import never overwrites a bank balance
  the user maintains unless they toggle it on.
- **qpdf dependency** → decryption needs `qpdf` in the backend environment; absence
  is surfaced as a configuration error, not a crash.
- **Large multi-page statements** → cap pages / handle token limits gracefully so a
  long statement degrades to a clear error rather than a truncated silent parse.
- **Account-mismatch** (parsed last4 ≠ the account the user launched from) → a
  warning in the review screen; the user confirms before import.
