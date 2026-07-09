# Statement Import + Dedup (Slice C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user upload a monthly statement PDF (credit-card *or* bank), parse it with Claude, dedup its line items against transactions Riddhi already has, review, and import the rest exactly once — plus populate the Slice B card statement-override figures.

**Architecture:** A dedicated stateless `statements` backend module mirrors the `receipts` pattern (upload → Claude structured extraction → return → confirm-before-save). Deduplication is a pure, deterministic function (amount + date window + account, merchant as a tiebreaker); the LLM only parses the statement. Imported transactions carry a stable `importFingerprint` that guards both re-import and later SMS/notification collisions. **Encrypted PDFs are decrypted on-device** (`pdfjs-dist`, password never leaves the phone) and uploaded as extracted text; unencrypted PDFs upload raw bytes and are read as a Claude document block. Mobile adds a review screen fed by a stateless `POST /statements/parse`, committing via `POST /statements/import`.

**Tech Stack:** NestJS + TypeORM (Postgres, `synchronize: true`), `@anthropic-ai/sdk` ^0.109.0 (PDF document block **or** text block); Expo v56 / React Native, `expo-document-picker` + `expo-file-system`, `pdfjs-dist` for on-device decrypt+text-extract; backend Jest, mobile ts-jest pure-logic harness.

## Global Constraints

- **DB:** `synchronize: true` — nullable columns / new entities need **no migration**.
- **Commits:** author email `gairola.ashutosh26@gmail.com`; **no** `Co-Authored-By` trailer; commit with `git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify`. **Never** `git add -A` — add exact paths only. Never commit `mobile/.env` or anything under `.superpowers/`. `docs/` is gitignored — spec/plan files are force-added with `git add -f`.
- **Mobile testing:** jest is **pure-logic only** (jest-expo blocked by an RN peer-dep). RN components are verified by `npx tsc --noEmit` + driving the app, not component tests. Extract testable logic into RN-free `.ts` helpers with `.spec.ts` tests.
- **Known tsc noise to ignore:** a pre-existing error in `backend/src/auth/auth.service.spec.ts`; ~6 errors in `mobile/modules/notification-listener/index.test.ts` (parallel work). Your own new source must be clean. Do **not** touch `mobile/tsconfig.json`.
- **AI client:** optional — behind a DI token that returns `null` when `ANTHROPIC_API_KEY` is unset (mirror `RECEIPTS_ANTHROPIC_CLIENT`). Model from `config.get('AI_MODEL') ?? 'claude-sonnet-5'`.
- **Mobile docs:** read Expo v56 docs (per `mobile/AGENTS.md`) before writing any mobile code, especially for `expo-document-picker` and base64 file reads.
- **Branch:** `feat/riddhi-build` (shared with parallel work — add exact paths, expect interleaved foreign commits).

---

## File Structure

**Backend — new `backend/src/statements/`:**
- `import-fingerprint.ts` — pure: `computeImportFingerprint`, `normalizeDescriptor`.
- `statement-dedup.ts` — pure: `classifyLineItems` + shared types.
- `account-resolve.ts` — pure: `resolveAccountByLast4`.
- `statement-parser.service.ts` — Claude parse (PDF **or** text) + `STATEMENTS_ANTHROPIC_CLIENT` token + hallucination guard.
- `statements.service.ts` — `parse()` + `import()` orchestration.
- `statements.controller.ts` — `POST /statements/parse`, `POST /statements/import`.
- `statements.module.ts` — wires the above + Anthropic factory.
- `dto/parse-statement.dto.ts`, `dto/import-statement.dto.ts`.

**Backend — modified:**
- `src/transactions/transaction.entity.ts` — add `importFingerprint` column.
- `src/transactions/dto/create-transaction.dto.ts` — add optional server-set `importFingerprint`.
- `src/notification-sync/payment-source-resolver.ts` — use `resolveAccountByLast4` (folds in Slice A follow-up #1).
- `src/notification-sync/*` confirm/save path + `src/sms-sync/*` — reverse-dedup against existing account txns.
- `src/app.module.ts` (or the module registry) — register `StatementsModule`.

**Mobile — modified/new:**
- `src/api/index.ts` — add `statements` resource.
- `src/api/adapters.ts` (or a new `statementAdapter.ts`) — parse-result → review view.
- `src/screens/statementPdf.ts` (new) + `.spec.ts` — `isEncrypted` byte-scan + `pdfjs-dist` decrypt+text-extract (on-device).
- `src/screens/StatementReview.tsx` (new) + `src/screens/statementReview.ts` (RN-free helpers) + `.spec.ts`.
- Entry points: `CardDetail`, bank `AccountDetail`, `Sync` — an "Import statement" action.

---

## Task 1: `importFingerprint` column + fingerprint helper

**Files:**
- Create: `backend/src/statements/import-fingerprint.ts`
- Create: `backend/src/statements/import-fingerprint.spec.ts`
- Modify: `backend/src/transactions/transaction.entity.ts` (add column)
- Modify: `backend/src/transactions/dto/create-transaction.dto.ts` (add optional field)

**Interfaces:**
- Produces: `computeImportFingerprint(accountId: string, amount: number, isoDate: string, descriptor: string): string` (64-char sha1 hex); `normalizeDescriptor(s: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/statements/import-fingerprint.spec.ts
import { computeImportFingerprint, normalizeDescriptor } from './import-fingerprint';

describe('normalizeDescriptor', () => {
  it('lowercases, collapses whitespace, strips punctuation and trailing ref numbers', () => {
    expect(normalizeDescriptor('  SWIGGY*Order   #1234567 ')).toBe('swiggy order');
    expect(normalizeDescriptor('AMAZON.IN')).toBe('amazon in');
  });
});

describe('computeImportFingerprint', () => {
  it('is stable across cosmetic descriptor differences', () => {
    const a = computeImportFingerprint('acc1', 499, '2026-06-12', 'SWIGGY*Order #111');
    const b = computeImportFingerprint('acc1', 499, '2026-06-12', 'swiggy order  #999');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
  it('differs on account, amount, or date', () => {
    const base = computeImportFingerprint('acc1', 499, '2026-06-12', 'swiggy');
    expect(computeImportFingerprint('acc2', 499, '2026-06-12', 'swiggy')).not.toBe(base);
    expect(computeImportFingerprint('acc1', 500, '2026-06-12', 'swiggy')).not.toBe(base);
    expect(computeImportFingerprint('acc1', 499, '2026-06-13', 'swiggy')).not.toBe(base);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest import-fingerprint`
Expected: FAIL — "Cannot find module './import-fingerprint'".

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/statements/import-fingerprint.ts
import { createHash } from 'crypto';

/**
 * Normalize a statement/transaction descriptor so cosmetic differences
 * (case, punctuation, trailing reference numbers, extra spaces) don't change
 * a transaction's identity.
 */
export function normalizeDescriptor(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[#*].*$/g, ' ')     // drop trailing ref after # or *
    .replace(/\d{4,}/g, ' ')      // drop long numeric runs (ref/order numbers)
    .replace(/[^a-z0-9]+/g, ' ')  // punctuation → space
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Stable identity for an imported statement line: account + amount(2dp) + ISO
 * date + normalized descriptor. Persisted on the created Transaction so a
 * re-import of the same statement, and a later SMS/notification for the same
 * charge, both dedup against it.
 */
export function computeImportFingerprint(
  accountId: string,
  amount: number,
  isoDate: string,
  descriptor: string,
): string {
  const key = `${accountId}|${amount.toFixed(2)}|${isoDate}|${normalizeDescriptor(descriptor)}`;
  return createHash('sha1').update(key).digest('hex').slice(0, 64);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest import-fingerprint`
Expected: PASS (2 suites of assertions).

- [ ] **Step 5: Add the entity column + DTO field**

In `backend/src/transactions/transaction.entity.ts`, after the `notes` column add:

```ts
  /** Set on statement-imported transactions; the dedup fingerprint (see
   * statements/import-fingerprint.ts). Null for everything else. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  @Index()
  importFingerprint: string | null;
```

Add `Index` to the `typeorm` import list at the top of the file.

In `backend/src/transactions/dto/create-transaction.dto.ts`, add (server-set, like `eventId`):

```ts
  /** Statement-import dedup fingerprint (set server-side by StatementsService). */
  @IsOptional()
  @IsString()
  importFingerprint?: string;
```

`TransactionsService.create` already spreads `...dto` into `repo.create`, so a supplied `importFingerprint` persists with no further change.

- [ ] **Step 6: Verify build + full suite**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep -v auth.service.spec` (expect no new errors) and `npx jest` (expect all green).

- [ ] **Step 7: Commit**

```bash
git add backend/src/statements/import-fingerprint.ts backend/src/statements/import-fingerprint.spec.ts backend/src/transactions/transaction.entity.ts backend/src/transactions/dto/create-transaction.dto.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): statement importFingerprint column + fingerprint helper"
```

---

## Task 2: Deterministic dedup (`classifyLineItems`)

**Files:**
- Create: `backend/src/statements/statement-dedup.ts`
- Create: `backend/src/statements/statement-dedup.spec.ts`

**Interfaces:**
- Consumes: `computeImportFingerprint` (Task 1).
- Produces:
  - `type LineDirection = 'debit' | 'credit'`
  - `interface ParsedLineItem { isoDate: string; amount: number; direction: LineDirection; descriptor: string; category: string | null }`
  - `type Verdict = 'new' | 'duplicate' | 'possible'`
  - `interface ClassifiedLineItem extends ParsedLineItem { verdict: Verdict; matchedTransactionId?: string }`
  - `interface ExistingTxn { id: string; isoDate: string; amount: number; direction: LineDirection; descriptor: string; importFingerprint: string | null }`
  - `classifyLineItems(accountId: string, items: ParsedLineItem[], existing: ExistingTxn[], opts?: { windowDays?: number }): ClassifiedLineItem[]`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/statements/statement-dedup.spec.ts
import { classifyLineItems, ExistingTxn, ParsedLineItem } from './statement-dedup';

const item = (o: Partial<ParsedLineItem> = {}): ParsedLineItem => ({
  isoDate: '2026-06-12', amount: 499, direction: 'debit', descriptor: 'Swiggy', category: null, ...o,
});
const existing = (o: Partial<ExistingTxn> = {}): ExistingTxn => ({
  id: 't1', isoDate: '2026-06-12', amount: 499, direction: 'debit', descriptor: 'SWIGGY', importFingerprint: null, ...o,
});

describe('classifyLineItems', () => {
  it('no candidate → new', () => {
    const [r] = classifyLineItems('acc1', [item()], []);
    expect(r.verdict).toBe('new');
  });
  it('exactly one candidate (amount+date, ±window) → duplicate with matched id', () => {
    const [r] = classifyLineItems('acc1', [item()], [existing({ id: 'tx9', isoDate: '2026-06-14' })]);
    expect(r.verdict).toBe('duplicate');
    expect(r.matchedTransactionId).toBe('tx9');
  });
  it('date outside window → new', () => {
    const [r] = classifyLineItems('acc1', [item({ isoDate: '2026-06-01' })], [existing({ isoDate: '2026-06-12' })], { windowDays: 3 });
    expect(r.verdict).toBe('new');
  });
  it('opposite direction is not a match', () => {
    const [r] = classifyLineItems('acc1', [item({ direction: 'credit' })], [existing({ direction: 'debit' })]);
    expect(r.verdict).toBe('new');
  });
  it('two candidates for one item → possible', () => {
    const r = classifyLineItems('acc1', [item()], [existing({ id: 'a' }), existing({ id: 'b', isoDate: '2026-06-13' })]);
    expect(r[0].verdict).toBe('possible');
  });
  it('twin charges, one existing → first duplicate (consumes it), second new', () => {
    const r = classifyLineItems('acc1', [item(), item()], [existing({ id: 'only' })]);
    expect(r[0].verdict).toBe('duplicate');
    expect(r[0].matchedTransactionId).toBe('only');
    expect(r[1].verdict).toBe('new');
  });
  it('fingerprint match is definitive duplicate even off-window', () => {
    const fp = require('./import-fingerprint').computeImportFingerprint('acc1', 499, '2026-06-12', 'Swiggy');
    const r = classifyLineItems('acc1', [item()], [existing({ id: 'fp', isoDate: '2026-05-01', importFingerprint: fp })]);
    expect(r[0].verdict).toBe('duplicate');
    expect(r[0].matchedTransactionId).toBe('fp');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest statement-dedup`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/statements/statement-dedup.ts
import { computeImportFingerprint } from './import-fingerprint';

export type LineDirection = 'debit' | 'credit';

export interface ParsedLineItem {
  isoDate: string;        // YYYY-MM-DD
  amount: number;         // positive
  direction: LineDirection;
  descriptor: string;
  category: string | null;
}

export type Verdict = 'new' | 'duplicate' | 'possible';

export interface ClassifiedLineItem extends ParsedLineItem {
  verdict: Verdict;
  matchedTransactionId?: string;
}

export interface ExistingTxn {
  id: string;
  isoDate: string;
  amount: number;
  direction: LineDirection;
  descriptor: string;
  importFingerprint: string | null;
}

function daysApart(a: string, b: string): number {
  const ms = Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z'));
  return Math.round(ms / 86_400_000);
}

function amountEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

/**
 * Deterministically classify each parsed statement line against the account's
 * existing transactions. Matching backbone is exact amount + same direction +
 * posting date within ±windowDays; a fingerprint match is definitive. Matches
 * are consumed 1:1 so two identical lines don't both collapse onto one existing
 * transaction. Ambiguity (2+ live candidates) is surfaced as 'possible' for the
 * user to resolve — never silently skipped. The LLM never judges duplicates.
 */
export function classifyLineItems(
  accountId: string,
  items: ParsedLineItem[],
  existing: ExistingTxn[],
  opts: { windowDays?: number } = {},
): ClassifiedLineItem[] {
  const windowDays = opts.windowDays ?? 3;
  const consumed = new Set<string>();
  // Deterministic order: by date then amount.
  const ordered = [...items].sort((a, b) =>
    a.isoDate === b.isoDate ? a.amount - b.amount : a.isoDate < b.isoDate ? -1 : 1,
  );
  const byId = new Map<ParsedLineItem, ClassifiedLineItem>();

  for (const it of ordered) {
    const fp = computeImportFingerprint(accountId, it.amount, it.isoDate, it.descriptor);
    const fpMatch = existing.find((e) => !consumed.has(e.id) && e.importFingerprint === fp);
    if (fpMatch) {
      consumed.add(fpMatch.id);
      byId.set(it, { ...it, verdict: 'duplicate', matchedTransactionId: fpMatch.id });
      continue;
    }
    const candidates = existing.filter(
      (e) =>
        !consumed.has(e.id) &&
        e.direction === it.direction &&
        amountEq(e.amount, it.amount) &&
        daysApart(e.isoDate, it.isoDate) <= windowDays,
    );
    if (candidates.length === 0) {
      byId.set(it, { ...it, verdict: 'new' });
    } else if (candidates.length === 1) {
      consumed.add(candidates[0].id);
      byId.set(it, { ...it, verdict: 'duplicate', matchedTransactionId: candidates[0].id });
    } else {
      // Ambiguous: pick the closest-dated to consume, but flag for the user.
      const best = candidates.sort((a, b) => daysApart(a.isoDate, it.isoDate) - daysApart(b.isoDate, it.isoDate))[0];
      consumed.add(best.id);
      byId.set(it, { ...it, verdict: 'possible', matchedTransactionId: best.id });
    }
  }
  // Return in the caller's original item order.
  return items.map((it) => byId.get(it)!);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest statement-dedup`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add backend/src/statements/statement-dedup.ts backend/src/statements/statement-dedup.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): deterministic statement line-item dedup"
```

---

## Task 3: Account resolution by last4 (folds in Slice A follow-up #1)

**Files:**
- Create: `backend/src/statements/account-resolve.ts`
- Create: `backend/src/statements/account-resolve.spec.ts`

**Interfaces:**
- Produces:
  - `interface ResolvableAccount { id: string; type: AccountType; institutionName: string | null; last4: string | null }` (`last4` comes from the linked `credit_card` row for credit accounts, else null)
  - `resolveAccountByLast4(accounts: ResolvableAccount[], last4: string | null): { accountId: string | null; ambiguous: boolean }`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/statements/account-resolve.spec.ts
import { resolveAccountByLast4, ResolvableAccount } from './account-resolve';
import { AccountType } from '../common/enums';

const acc = (o: Partial<ResolvableAccount>): ResolvableAccount => ({
  id: 'a', type: AccountType.CREDIT, institutionName: 'HDFC', last4: '1234', ...o,
});

describe('resolveAccountByLast4', () => {
  it('unique last4 → that account', () => {
    const r = resolveAccountByLast4([acc({ id: 'x', last4: '1234' }), acc({ id: 'y', last4: '9999' })], '1234');
    expect(r).toEqual({ accountId: 'x', ambiguous: false });
  });
  it('no last4 given → null, not ambiguous', () => {
    expect(resolveAccountByLast4([acc({})], null)).toEqual({ accountId: null, ambiguous: false });
  });
  it('no match → null', () => {
    expect(resolveAccountByLast4([acc({ last4: '1111' })], '2222')).toEqual({ accountId: null, ambiguous: false });
  });
  it('two accounts share the last4 → ambiguous', () => {
    const r = resolveAccountByLast4([acc({ id: 'x', last4: '1234' }), acc({ id: 'y', last4: '1234' })], '1234');
    expect(r).toEqual({ accountId: null, ambiguous: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest account-resolve`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/statements/account-resolve.ts
import { AccountType } from '../common/enums';

export interface ResolvableAccount {
  id: string;
  type: AccountType;
  institutionName: string | null;
  last4: string | null; // from the linked credit_card row for credit accounts
}

/**
 * Match a parsed statement's (or an SMS's) last-4 to exactly one account.
 * Only credit accounts carry a last4 (on their credit_card row), so this is
 * the card case — it is the shared helper the SMS/notification path uses to
 * fill accountId on card spends (Slice A follow-up #1). Returns ambiguous=true
 * when 2+ accounts share the last4 so the caller can ask the user.
 */
export function resolveAccountByLast4(
  accounts: ResolvableAccount[],
  last4: string | null,
): { accountId: string | null; ambiguous: boolean } {
  const key = (last4 ?? '').trim();
  if (!key) return { accountId: null, ambiguous: false };
  const matches = accounts.filter((a) => (a.last4 ?? '').trim() === key);
  if (matches.length === 1) return { accountId: matches[0].id, ambiguous: false };
  if (matches.length > 1) return { accountId: null, ambiguous: true };
  return { accountId: null, ambiguous: false };
}
```

Note: keep `AccountType` imported even though not filtered on here — the interface uses it and later tasks pass real accounts. (No filtering needed: only credit accounts ever have a non-null `last4`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest account-resolve`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/statements/account-resolve.ts backend/src/statements/account-resolve.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): resolveAccountByLast4 shared helper"
```

---

## Task 4: Mobile on-device PDF decrypt + text extraction (`statementPdf.ts`)

> **This is a MOBILE task** (no backend dependency) — it can be executed here or
> deferred to run alongside Tasks 9–10. It is placed early because its output (the
> `{ pdf }`-vs-`{ text }` upload decision) defines the shape Task 6's parse DTO must
> accept.

**Files:**
- Create: `mobile/src/screens/statementPdf.ts`
- Create: `mobile/src/screens/statementPdf.spec.ts`
- Modify: `mobile/package.json` (add `pdfjs-dist`)

**Interfaces:**
- Produces:
  - `isEncrypted(bytes: Uint8Array): boolean`
  - `class PdfPasswordError extends Error` (wrong/again-needed password)
  - `extractText(bytes: Uint8Array, password?: string): Promise<string>` (throws `PdfPasswordError` when a password is needed/incorrect)
  - `type PreparedUpload = { pdf: string } | { text: string }` and `prepareUpload(base64: string, password?: string): Promise<PreparedUpload>`

**Background:** the user chose **on-device decryption** — the password must never leave the phone. Pure on-device *decryption to PDF bytes* isn't feasible in Expo/RN (`pdf-lib` can't decrypt), but `pdfjs-dist` **can** open an encrypted PDF with a password and extract text. So the flow is a hybrid: unencrypted PDFs upload raw bytes (best fidelity, Claude document block); encrypted PDFs are opened locally with the password and their **text** uploaded.

> **Feasibility spike:** `pdfjs-dist` under Hermes is fiddly (needs the `legacy`
> build and a couple of globals/polyfills — e.g. `Promise.withResolvers`, a no-op
> worker). **Do this spike first.** If it can't be made to run on device after a
> reasonable effort, STOP and escalate to the human: the documented fallback is
> server-side decrypt for encrypted PDFs only (the `qpdf`/`node-qpdf2` route from
> the spec's Risks section) while the unencrypted path ships unchanged. Do not
> silently ship a broken encrypted path.

- [ ] **Step 1: Read Expo v56 docs** for reading a picked file as base64 (`expo-file-system` `readAsStringAsync` + `EncodingType.Base64`), and skim the `pdfjs-dist` legacy-build usage. Install: `cd mobile && npx expo install expo-document-picker expo-file-system && npm install pdfjs-dist`.

- [ ] **Step 2: Write the failing test** (pure `isEncrypted`; `extractText` is node-testable against a fixture but device-verified)

```ts
// mobile/src/screens/statementPdf.spec.ts
import { isEncrypted } from './statementPdf';

const bytes = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'));

describe('isEncrypted', () => {
  it('true when the trailer references /Encrypt', () => {
    expect(isEncrypted(bytes('%PDF-1.6 ... << /Root 1 0 R /Encrypt 9 0 R >> %%EOF'))).toBe(true);
  });
  it('false for a plain PDF', () => {
    expect(isEncrypted(bytes('%PDF-1.6 ... << /Root 1 0 R /Size 10 >> %%EOF'))).toBe(false);
  });
  it('false for non-PDF bytes', () => {
    expect(isEncrypted(bytes('hello'))).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd mobile && npx jest statementPdf`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```ts
// mobile/src/screens/statementPdf.ts
// On-device statement PDF handling. Unencrypted → upload raw bytes; encrypted →
// decrypt + extract text locally with pdfjs-dist so the password never leaves
// the device. See plan Task 4 for the Hermes feasibility caveats/fallback.
import { getDocument, PasswordException, GlobalWorkerOptions, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf';

export class PdfPasswordError extends Error {
  constructor(message = 'PDF password required or incorrect') {
    super(message);
    this.name = 'PdfPasswordError';
  }
}

export type PreparedUpload = { pdf: string } | { text: string };

/** A PDF is encrypted iff its trailer references an /Encrypt object. Scan the
 * last 4KB (where the trailer lives) to avoid stream-data false positives. */
export function isEncrypted(bytes: Uint8Array): boolean {
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (!head.startsWith('%PDF-')) return false;
  const tailBytes = bytes.slice(Math.max(0, bytes.length - 4096));
  const tail = String.fromCharCode(...tailBytes);
  return /\/Encrypt\b/.test(tail);
}

/** Open an (encrypted) PDF with the password and concatenate page text.
 * Throws PdfPasswordError when a password is required or wrong. */
export async function extractText(bytes: Uint8Array, password?: string): Promise<string> {
  GlobalWorkerOptions.workerSrc = undefined as any; // run on the JS thread (no worker in RN)
  try {
    const doc = await getDocument({ data: bytes, password, verbosity: VerbosityLevel.ERRORS }).promise;
    let out = '';
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      out += content.items.map((i: any) => ('str' in i ? i.str : '')).join(' ') + '\n';
    }
    return out.trim();
  } catch (e) {
    if (e instanceof PasswordException) throw new PdfPasswordError();
    throw e;
  }
}

/** Decide the upload shape from raw base64 PDF bytes. Unencrypted → { pdf };
 * encrypted → decrypt locally and return { text }. `password` is required for
 * the encrypted case (caller prompts and retries on PdfPasswordError). */
export async function prepareUpload(base64: string, password?: string): Promise<PreparedUpload> {
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  if (!isEncrypted(bytes)) return { pdf: base64 };
  const text = await extractText(bytes, password);
  return { text };
}
```

> **Implementer notes:** (1) `Buffer` may need the RN polyfill already used elsewhere in the app — check `client.ts`/existing base64 handling and reuse that path; if `Buffer` isn't available, use `expo-file-system`/`atob` equivalents. (2) Confirm the exact `pdfjs-dist` legacy import path against the installed version, and whether it needs a `Promise.withResolvers` polyfill under Hermes (add one in the app entry if so). (3) `verbosity`/`VerbosityLevel` are optional — drop if the version differs.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd mobile && npx jest statementPdf`
Expected: `isEncrypted` cases PASS. (`extractText`/`prepareUpload` are exercised on-device in Task 10 with a real encrypted fixture — add a node fixture test if `pdfjs-dist` loads cleanly under ts-jest, otherwise document it as device-verified.)

- [ ] **Step 6: Typecheck + commit**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -v notification-listener/index.test` (no new errors).

```bash
git add mobile/src/screens/statementPdf.ts mobile/src/screens/statementPdf.spec.ts mobile/package.json mobile/package-lock.json
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(mobile): on-device PDF encryption check + pdfjs text extraction"
```

---

## Task 5: Statement parser service (Claude PDF document block **or** text)

**Files:**
- Create: `backend/src/statements/statement-parser.service.ts`
- Create: `backend/src/statements/statement-parser.service.spec.ts`

**Interfaces:**
- Consumes: `ParsedLineItem`, `LineDirection` (Task 2).
- Produces:
  - `const STATEMENTS_ANTHROPIC_CLIENT = 'STATEMENTS_ANTHROPIC_CLIENT'`
  - `interface ParsedStatementSummary { statementDate: string | null; statementBilled: number | null; statementMinDue: number | null; statementDueDate: string | null; statementRewards: number | null; openingBalance: number | null; closingBalance: number | null }`
  - `interface ParsedStatement { last4: string | null; inferredType: 'card' | 'bank'; period: { from: string | null; to: string | null }; summary: ParsedStatementSummary; items: ParsedLineItem[] }`
  - `type StatementInput = { pdf: string } | { text: string }`
  - `class StatementParserService { parse(input: StatementInput): Promise<ParsedStatement> }` (throws `ServiceUnavailableException` when the client is null). `{ pdf }` → Claude PDF document block; `{ text }` → Claude text block (on-device-extracted text from an encrypted PDF).

- [ ] **Step 1: Write the failing test** (Anthropic client mocked; assert prompt-agnostic parsing + hallucination guard)

```ts
// backend/src/statements/statement-parser.service.spec.ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StatementParserService, STATEMENTS_ANTHROPIC_CLIENT } from './statement-parser.service';

function clientReturning(text: string) {
  return { messages: { create: jest.fn().mockResolvedValue({ content: [{ type: 'text', text }] }) } };
}

async function build(client: any) {
  const mod = await Test.createTestingModule({
    providers: [
      StatementParserService,
      { provide: STATEMENTS_ANTHROPIC_CLIENT, useValue: client },
      { provide: ConfigService, useValue: { get: () => 'claude-sonnet-5' } },
    ],
  }).compile();
  return mod.get(StatementParserService);
}

describe('StatementParserService.parse', () => {
  it('maps a well-formed reply and drops non-positive / malformed items', async () => {
    const svc = await build(clientReturning(JSON.stringify({
      last4: '1234', type: 'card',
      period: { from: '2026-05-13', to: '2026-06-12' },
      summary: { statementBilled: 15230.5, statementMinDue: 800, statementDueDate: '2026-07-02', statementDate: '2026-06-12', statementRewards: 120 },
      items: [
        { date: '2026-06-01', amount: 499, direction: 'debit', descriptor: 'Swiggy', category: 'Food' },
        { date: '2026-06-02', amount: -5, direction: 'debit', descriptor: 'bad' },      // dropped: non-positive
        { date: 'nope', amount: 100, direction: 'debit', descriptor: 'baddate' },        // dropped: bad date
        { date: '2026-06-03', amount: 200, direction: 'credit', descriptor: 'Refund', category: null },
      ],
    })));
    const r = await svc.parse({ pdf: 'BASE64' });
    expect(r.last4).toBe('1234');
    expect(r.inferredType).toBe('card');
    expect(r.summary.statementBilled).toBe(15230.5);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ isoDate: '2026-06-01', amount: 499, direction: 'debit' });
    expect(r.items[1].direction).toBe('credit');
  });

  it('returns an empty-but-valid statement when the model emits no JSON', async () => {
    const svc = await build(clientReturning('sorry, cannot read this'));
    const r = await svc.parse({ pdf: 'BASE64' });
    expect(r.items).toEqual([]);
    expect(r.inferredType).toBe('bank'); // default
  });

  it('throws when the client is not configured', async () => {
    const svc = await build(null);
    await expect(svc.parse({ pdf: 'BASE64' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest statement-parser`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** (mirror `receipts.service.ts`; use a PDF **document** block)

```ts
// backend/src/statements/statement-parser.service.ts
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LineDirection, ParsedLineItem } from './statement-dedup';

export const STATEMENTS_ANTHROPIC_CLIENT = 'STATEMENTS_ANTHROPIC_CLIENT';

export interface ParsedStatementSummary {
  statementDate: string | null;
  statementBilled: number | null;
  statementMinDue: number | null;
  statementDueDate: string | null;
  statementRewards: number | null;
  openingBalance: number | null;
  closingBalance: number | null;
}

export interface ParsedStatement {
  last4: string | null;
  inferredType: 'card' | 'bank';
  period: { from: string | null; to: string | null };
  summary: ParsedStatementSummary;
  items: ParsedLineItem[];
}

/** Either raw PDF base64 (document block) or on-device-extracted text. */
export type StatementInput = { pdf: string } | { text: string };

const EMPTY_SUMMARY: ParsedStatementSummary = {
  statementDate: null, statementBilled: null, statementMinDue: null,
  statementDueDate: null, statementRewards: null, openingBalance: null, closingBalance: null,
};

@Injectable()
export class StatementParserService {
  private readonly logger = new Logger(StatementParserService.name);

  constructor(
    @Inject(STATEMENTS_ANTHROPIC_CLIENT) private readonly client: Anthropic | null,
    private readonly config: ConfigService,
  ) {}

  private get model(): string {
    return this.config.get<string>('AI_MODEL') ?? 'claude-sonnet-5';
  }

  async parse(input: StatementInput): Promise<ParsedStatement> {
    if (!this.client) {
      throw new ServiceUnavailableException('Statement import is not configured');
    }
    // Build the source block: a PDF document block for raw bytes, or a text
    // block for on-device-extracted text (encrypted PDFs decrypted on-device).
    const sourceBlock =
      'pdf' in input
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdf } }
        : { type: 'text', text: `STATEMENT TEXT (extracted on device):\n${input.text}` };

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system:
        'You extract a bank or credit-card statement into JSON. Reply with ONLY a JSON object, no prose, no markdown fences. Shape: ' +
        '{"last4": string|null (last 4 digits of the account/card), "type": "card"|"bank", ' +
        '"period": {"from": "YYYY-MM-DD"|null, "to": "YYYY-MM-DD"|null}, ' +
        '"summary": {"statementDate":"YYYY-MM-DD"|null,"statementBilled":number|null,"statementMinDue":number|null,"statementDueDate":"YYYY-MM-DD"|null,"statementRewards":number|null,"openingBalance":number|null,"closingBalance":number|null}, ' +
        '"items": [{"date":"YYYY-MM-DD","amount":number (positive),"direction":"debit"|"credit","descriptor":string,"category":string|null}]}. ' +
        'A debit is money out (a purchase/withdrawal), a credit is money in (a payment/refund/deposit). ' +
        'category is one of Food, Groceries, Transport, Shopping, Bills, Utilities, Entertainment, Health, Income, or null. ' +
        'For a credit-card statement fill the statement* summary fields; for a bank statement fill opening/closingBalance. Omit interest/finance-charge summary rows from items only if they are not real charges.',
      messages: [
        {
          role: 'user',
          content: [
            sourceBlock as any,
            { type: 'text', text: 'Extract the statement as JSON.' },
          ],
        },
      ],
    } as Anthropic.MessageCreateParamsNonStreaming);

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    return this.parseReply(text);
  }

  /** Parse + hallucination guard: drop items with non-positive amounts or
   * malformed dates; coerce enums; never throw on a bad reply. */
  private parseReply(text: string): ParsedStatement {
    const empty: ParsedStatement = {
      last4: null, inferredType: 'bank', period: { from: null, to: null },
      summary: { ...EMPTY_SUMMARY }, items: [],
    };
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      this.logger.warn(`Statement parse: no JSON (${text.slice(0, 120)})`);
      return empty;
    }
    let raw: Record<string, any>;
    try {
      raw = JSON.parse(match[0]);
    } catch {
      this.logger.warn(`Statement parse: bad JSON (${text.slice(0, 120)})`);
      return empty;
    }
    const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
    const dir = (v: unknown): LineDirection => (v === 'credit' ? 'credit' : 'debit');

    const items: ParsedLineItem[] = Array.isArray(raw.items)
      ? raw.items
          .filter((it: any) => it && isDate(it.date) && typeof it.amount === 'number' && it.amount > 0)
          .map((it: any) => ({
            isoDate: it.date,
            amount: Math.abs(it.amount),
            direction: dir(it.direction),
            descriptor: typeof it.descriptor === 'string' ? it.descriptor : '',
            category: typeof it.category === 'string' ? it.category : null,
          }))
      : [];

    const s = raw.summary ?? {};
    return {
      last4: typeof raw.last4 === 'string' ? raw.last4.replace(/\D/g, '').slice(-4) || null : null,
      inferredType: raw.type === 'card' ? 'card' : 'bank',
      period: { from: isDate(raw.period?.from) ? raw.period.from : null, to: isDate(raw.period?.to) ? raw.period.to : null },
      summary: {
        statementDate: isDate(s.statementDate) ? s.statementDate : null,
        statementBilled: num(s.statementBilled),
        statementMinDue: num(s.statementMinDue),
        statementDueDate: isDate(s.statementDueDate) ? s.statementDueDate : null,
        statementRewards: num(s.statementRewards),
        openingBalance: num(s.openingBalance),
        closingBalance: num(s.closingBalance),
      },
      items,
    };
  }
}
```

> **Implementer note:** confirm the PDF document-block shape against the installed `@anthropic-ai/sdk` ^0.109.0 types (`type: 'document'`, `source.media_type: 'application/pdf'`). The `as MessageCreateParamsNonStreaming` cast is only to keep the content-block union happy if the local types are stricter — remove it if unneeded.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest statement-parser`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add backend/src/statements/statement-parser.service.ts backend/src/statements/statement-parser.service.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): Claude statement PDF parser + hallucination guard"
```

---

## Task 6: `parse()` orchestration + controller + module (`POST /statements/parse`)

**Files:**
- Create: `backend/src/statements/dto/parse-statement.dto.ts`
- Create: `backend/src/statements/statements.service.ts`
- Create: `backend/src/statements/statements.controller.ts`
- Create: `backend/src/statements/statements.module.ts`
- Create: `backend/src/statements/statements.service.spec.ts`
- Modify: the module registry (`backend/src/app.module.ts`) to import `StatementsModule`

**Interfaces:**
- Consumes: `StatementParserService`, `ParsedStatement`, `StatementInput` (T5); `classifyLineItems`, `ClassifiedLineItem`, `ExistingTxn` (T2); `resolveAccountByLast4` (T3); `AccountsService`, `TransactionsService`, `CreditCardService`. (No decrypt — encrypted PDFs are handled on-device, T4.)
- Produces:
  - `interface StatementParseResult { account: { id: string | null; matchedByLast4: boolean; ambiguous: boolean; mismatchWarning: boolean }; statementType: 'card' | 'bank'; period: { from: string | null; to: string | null }; summary: ParsedStatementSummary; items: ClassifiedLineItem[] }`
  - `StatementsService.parse(userId, dto): Promise<StatementParseResult>` (throws `BadRequestException` when neither/both of `pdf`/`text` are present)

- [ ] **Step 1: Write the DTO**

```ts
// backend/src/statements/dto/parse-statement.dto.ts
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const MAX_LEN = 20 * 1024 * 1024; // ~15MB base64 PDF or extracted text

export class ParseStatementDto {
  /** Base64 PDF bytes (no data: URI prefix) — present when the PDF is
   * unencrypted. Exactly one of pdf/text is sent. */
  @IsOptional() @IsString() @MaxLength(MAX_LEN)
  pdf?: string;

  /** Statement text extracted on-device from an encrypted PDF (password never
   * leaves the phone). Exactly one of pdf/text is sent. */
  @IsOptional() @IsString() @MaxLength(MAX_LEN)
  text?: string;

  /** Target account when launched from CardDetail / AccountDetail (implicit). */
  @IsOptional() @IsUUID()
  accountId?: string;
}
```

The "exactly one of pdf/text" rule is enforced in the service (`BadRequestException`), not the DTO, so the error message is explicit.

- [ ] **Step 2: Write the failing test** (mock deps; cover missing-input rejection, pdf/text pass-through, dedup wiring, account resolve, mismatch warning)

```ts
// backend/src/statements/statements.service.spec.ts
import { StatementsService } from './statements.service';
import { BadRequestException } from '@nestjs/common';
import { AccountType } from '../common/enums';

// Minimal fakes for collaborators:
const parser = { parse: jest.fn() };
const accounts = { findAll: jest.fn(), findOne: jest.fn() };
const transactions = { create: jest.fn(), findForAccountInRange: jest.fn() };
const cards = { updateConfig: jest.fn() };

const svc = new StatementsService(parser as any, accounts as any, transactions as any, cards as any);

beforeEach(() => jest.clearAllMocks());

it('rejects when neither pdf nor text is supplied', async () => {
  await expect(svc.parse('u1', { accountId: 'c1' } as any)).rejects.toBeInstanceOf(BadRequestException);
});

it('passes {pdf} straight to the parser, resolves the card by last4, classifies items', async () => {
  parser.parse.mockResolvedValue({
    last4: '1234', inferredType: 'card', period: { from: '2026-05-13', to: '2026-06-12' },
    summary: {}, items: [{ isoDate: '2026-06-01', amount: 499, direction: 'debit', descriptor: 'Swiggy', category: 'Food' }],
  });
  accounts.findAll.mockResolvedValue([{ id: 'c1', type: AccountType.CREDIT, institutionName: 'HDFC', last4: '1234' }]);
  transactions.findForAccountInRange.mockResolvedValue([]); // nothing existing → 'new'
  const r = await svc.parse('u1', { pdf: 'BASE64' } as any);
  expect(parser.parse).toHaveBeenCalledWith({ pdf: 'BASE64' });
  expect(r.account.id).toBe('c1');
  expect(r.account.matchedByLast4).toBe(true);
  expect(r.items[0].verdict).toBe('new');
});

it('passes {text} straight to the parser (encrypted → on-device-extracted)', async () => {
  parser.parse.mockResolvedValue({ last4: null, inferredType: 'bank', period: {}, summary: {}, items: [] });
  accounts.findOne.mockResolvedValue({ id: 'b1', type: AccountType.SAVINGS, institutionName: 'ICICI' });
  accounts.findAll.mockResolvedValue([{ id: 'b1', type: AccountType.SAVINGS, institutionName: 'ICICI', last4: null }]);
  transactions.findForAccountInRange.mockResolvedValue([]);
  await svc.parse('u1', { text: 'STATEMENT TEXT', accountId: 'b1' } as any);
  expect(parser.parse).toHaveBeenCalledWith({ text: 'STATEMENT TEXT' });
});

it('flags mismatch when the passed accountId differs from the parsed last4 account', async () => {
  parser.parse.mockResolvedValue({ last4: '9999', inferredType: 'card', period: {}, summary: {}, items: [] });
  accounts.findOne.mockResolvedValue({ id: 'c1', type: AccountType.CREDIT, institutionName: 'HDFC' });
  accounts.findAll.mockResolvedValue([
    { id: 'c1', type: AccountType.CREDIT, institutionName: 'HDFC', last4: '1234' },
    { id: 'c2', type: AccountType.CREDIT, institutionName: 'ICICI', last4: '9999' },
  ]);
  transactions.findForAccountInRange.mockResolvedValue([]);
  const r = await svc.parse('u1', { pdf: 'BASE64', accountId: 'c1' } as any);
  expect(r.account.id).toBe('c1');
  expect(r.account.mismatchWarning).toBe(true);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest statements.service`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the service**

```ts
// backend/src/statements/statements.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CreditCardService } from '../credit-card/credit-card.service';
import { StatementParserService, ParsedStatement, ParsedStatementSummary } from './statement-parser.service';
import { classifyLineItems, ClassifiedLineItem, ExistingTxn, LineDirection } from './statement-dedup';
import { resolveAccountByLast4, ResolvableAccount } from './account-resolve';
import { TransactionType } from '../common/enums';
import { ParseStatementDto } from './dto/parse-statement.dto';

export interface StatementParseResult {
  account: { id: string | null; matchedByLast4: boolean; ambiguous: boolean; mismatchWarning: boolean };
  statementType: 'card' | 'bank';
  period: { from: string | null; to: string | null };
  summary: ParsedStatementSummary;
  items: ClassifiedLineItem[];
}

@Injectable()
export class StatementsService {
  constructor(
    private readonly parser: StatementParserService,
    private readonly accounts: AccountsService,
    private readonly transactions: TransactionsService,
    private readonly cards: CreditCardService,
  ) {}

  async parse(userId: string, dto: ParseStatementDto): Promise<StatementParseResult> {
    // Exactly one input: raw PDF bytes (unencrypted) or on-device-extracted text
    // (encrypted PDF, decrypted on the phone). No decryption happens here.
    const hasPdf = typeof dto.pdf === 'string' && dto.pdf.length > 0;
    const hasText = typeof dto.text === 'string' && dto.text.length > 0;
    if (hasPdf === hasText) {
      throw new BadRequestException('Provide exactly one of pdf or text');
    }
    const parsed: ParsedStatement = await this.parser.parse(hasPdf ? { pdf: dto.pdf! } : { text: dto.text! });

    // Resolve the target account.
    const all = await this.accounts.findAll(userId);
    const resolvable: ResolvableAccount[] = all.map((a: any) => ({
      id: a.id, type: a.type, institutionName: a.institutionName ?? null,
      last4: a.card?.last4 ?? a.last4 ?? null, // credit_card.last4 for credit accounts
    }));
    const byLast4 = resolveAccountByLast4(resolvable, parsed.last4);

    let accountId: string | null = dto.accountId ?? byLast4.accountId;
    let mismatchWarning = false;
    if (dto.accountId && byLast4.accountId && dto.accountId !== byLast4.accountId) {
      mismatchWarning = true; // launched on one card, statement is for another
    }
    if (!accountId) {
      // No implicit account and no last4 match — the caller (Sync) will ask the
      // user to pick; return items unclassified against an empty ledger.
      return {
        account: { id: null, matchedByLast4: false, ambiguous: byLast4.ambiguous, mismatchWarning: false },
        statementType: parsed.inferredType, period: parsed.period, summary: parsed.summary,
        items: classifyLineItems('none', parsed.items, []),
      };
    }

    // Dedup against the account's existing transactions in the statement period
    // (widened by the dedup window on both ends).
    const existing = await this.loadExisting(userId, accountId, parsed.period);
    const items = classifyLineItems(accountId, parsed.items, existing);

    return {
      account: { id: accountId, matchedByLast4: !dto.accountId && !!byLast4.accountId, ambiguous: byLast4.ambiguous, mismatchWarning },
      statementType: parsed.inferredType, period: parsed.period, summary: parsed.summary, items,
    };
  }

  /** Load existing account transactions as dedup candidates. Uses the period
   * (±a few days) so we compare against the right cycle. */
  private async loadExisting(
    userId: string, accountId: string, period: { from: string | null; to: string | null },
  ): Promise<ExistingTxn[]> {
    const from = period.from ? new Date(Date.parse(period.from) - 5 * 86_400_000) : new Date(Date.now() - 90 * 86_400_000);
    const to = period.to ? new Date(Date.parse(period.to) + 5 * 86_400_000) : new Date();
    const rows = await this.transactions.findForAccountInRange(userId, accountId, from, to);
    return rows.map((t: any) => ({
      id: t.id,
      isoDate: new Date(t.date).toISOString().slice(0, 10),
      amount: Math.abs(t.amount),
      direction: this.directionOf(t, accountId),
      descriptor: t.description ?? '',
      importFingerprint: t.importFingerprint ?? null,
    }));
  }

  private directionOf(t: { type: TransactionType; accountId: string | null }, accountId: string): LineDirection {
    if (t.type === TransactionType.INCOME) return 'credit';
    if (t.type === TransactionType.TRANSFER) return t.accountId === accountId ? 'debit' : 'credit';
    return 'debit'; // EXPENSE
  }
}
```

> **Implementer note:** `TransactionsService` needs a `findForAccountInRange(userId, accountId, from, to)` returning that account's transactions (where `accountId` **or** `destinationAccountId` equals the account) with `id, date, amount, type, description, importFingerprint, accountId`. If no equivalent method exists, add it in this task (thin repository query) with its own unit test, and export it. Check `transactions.service.ts` / its repository for an existing range query to reuse first.

- [ ] **Step 5: Write the controller + module**

```ts
// backend/src/statements/statements.controller.ts
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StatementsService } from './statements.service';
import { ParseStatementDto } from './dto/parse-statement.dto';
import { ImportStatementDto } from './dto/import-statement.dto';

@UseGuards(JwtAuthGuard)
@Controller('statements')
export class StatementsController {
  constructor(private readonly statements: StatementsService) {}

  @Post('parse')
  parse(@Req() req: any, @Body() dto: ParseStatementDto) {
    return this.statements.parse(req.user.userId, dto);
  }

  @Post('import')
  import(@Req() req: any, @Body() dto: ImportStatementDto) {
    return this.statements.import(req.user.userId, dto);
  }
}
```

```ts
// backend/src/statements/statements.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { CreditCardModule } from '../credit-card/credit-card.module';
import { StatementsController } from './statements.controller';
import { StatementsService } from './statements.service';
import { StatementParserService, STATEMENTS_ANTHROPIC_CLIENT } from './statement-parser.service';

@Module({
  imports: [AccountsModule, TransactionsModule, CreditCardModule],
  controllers: [StatementsController],
  providers: [
    StatementsService,
    StatementParserService,
    {
      provide: STATEMENTS_ANTHROPIC_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Anthropic | null => {
        const apiKey = config.get<string>('ANTHROPIC_API_KEY');
        return apiKey ? new Anthropic({ apiKey }) : null;
      },
    },
  ],
})
export class StatementsModule {}
```

Verify `JwtAuthGuard`'s `req.user` shape by copying the exact pattern from `receipts.controller.ts` / another authed controller (the property is `userId` in most controllers here — confirm and match). Register `StatementsModule` in the app's module list (mirror how `ReceiptsModule` / `CreditCardModule` are imported in `app.module.ts`). The `import()` method lands in Task 7 — add a temporary `import()` stub returning `{ imported: 0, skipped: 0 }` so this task compiles, replaced in Task 7. Confirm `AccountsModule`, `TransactionsModule`, `CreditCardModule` export their services.

- [ ] **Step 6: Run tests + build**

Run: `cd backend && npx jest statements.service && npx tsc --noEmit 2>&1 | grep -v auth.service.spec`
Expected: service tests PASS; no new tsc errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/statements/dto/parse-statement.dto.ts backend/src/statements/statements.service.ts backend/src/statements/statements.controller.ts backend/src/statements/statements.module.ts backend/src/statements/statements.service.spec.ts backend/src/app.module.ts backend/src/transactions/transactions.service.ts backend/src/transactions/transactions.service.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): POST /statements/parse — decrypt, parse, resolve, dedup"
```

---

## Task 7: `import()` — create transactions, patch card override, reconcile balance (`POST /statements/import`)

**Files:**
- Create: `backend/src/statements/dto/import-statement.dto.ts`
- Modify: `backend/src/statements/statements.service.ts` (replace the `import()` stub)
- Modify: `backend/src/statements/statements.service.spec.ts` (add import cases)

**Interfaces:**
- Consumes: `TransactionsService.create` (persists `importFingerprint`), `CreditCardService.updateConfig`, `AccountsService.update` (balance reconcile), `computeImportFingerprint` (T1), `categoriesService.resolveId`-equivalent.
- Produces: `StatementsService.import(userId, dto): Promise<{ imported: number; skipped: number }>`

- [ ] **Step 1: Write the DTO**

```ts
// backend/src/statements/dto/import-statement.dto.ts
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

class ImportLineDto {
  @IsString() isoDate: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsIn(['debit', 'credit']) direction: 'debit' | 'credit';
  @IsString() descriptor: string;
  /** Resolved/edited category NAME (server resolves to an id). */
  @IsOptional() @IsString() category?: string | null;
}

class CardOverrideDto {
  @IsOptional() @IsString() statementDate?: string;
  @IsOptional() @IsNumber() statementBilled?: number;
  @IsOptional() @IsNumber() statementMinDue?: number;
  @IsOptional() @IsString() statementDueDate?: string;
  @IsOptional() @IsNumber() statementRewards?: number;
}

export class ImportStatementDto {
  @IsUUID() accountId: string;
  @IsIn(['card', 'bank']) statementType: 'card' | 'bank';

  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => ImportLineDto)
  items: ImportLineDto[];

  /** Card override figures to apply (card statements only). */
  @IsOptional() @ValidateNested() @Type(() => CardOverrideDto)
  summary?: CardOverrideDto;

  /** When present, set the account balance to this (bank reconcile, opt-in). */
  @IsOptional() @IsNumber()
  setBalance?: number;
}
```

- [ ] **Step 2: Write the failing test** (add to `statements.service.spec.ts`)

```ts
describe('StatementsService.import', () => {
  it('creates a txn per item with fingerprint, patches card override, and skips nothing extra', async () => {
    accounts.findOne.mockResolvedValue({ id: 'c1', type: AccountType.CREDIT, name: 'HDFC' });
    const categories = { findAll: jest.fn().mockResolvedValue([{ id: 'cat-food', name: 'Food' }, { id: 'cat-other', name: 'Other' }]) };
    const svc2 = new StatementsService(parser as any, accounts as any, transactions as any, cards as any, categories as any);
    transactions.create.mockResolvedValue({ id: 'new' });
    cards.updateConfig.mockResolvedValue({});
    const res = await svc2.import('u1', {
      accountId: 'c1', statementType: 'card',
      items: [{ isoDate: '2026-06-01', amount: 499, direction: 'debit', descriptor: 'Swiggy', category: 'Food' }],
      summary: { statementBilled: 15230.5, statementDate: '2026-06-12' },
    } as any);
    expect(res).toEqual({ imported: 1, skipped: 0 });
    const arg = transactions.create.mock.calls[0][1];
    expect(arg).toMatchObject({ amount: 499, type: 'expense', categoryId: 'cat-food', accountId: 'c1', paymentMethod: 'card' });
    expect(typeof arg.importFingerprint).toBe('string');
    expect(cards.updateConfig).toHaveBeenCalledWith('c1', 'u1', expect.objectContaining({ statementBilled: 15230.5 }));
  });

  it('bank credit → income; setBalance reconciles the account', async () => {
    accounts.findOne.mockResolvedValue({ id: 'b1', type: AccountType.SAVINGS, name: 'ICICI', balance: 100 });
    accounts.update = jest.fn().mockResolvedValue({});
    const categories = { findAll: jest.fn().mockResolvedValue([{ id: 'cat-income', name: 'Income' }, { id: 'cat-other', name: 'Other' }]) };
    const svc2 = new StatementsService(parser as any, accounts as any, transactions as any, cards as any, categories as any);
    transactions.create.mockResolvedValue({ id: 'n' });
    const res = await svc2.import('u1', {
      accountId: 'b1', statementType: 'bank',
      items: [{ isoDate: '2026-06-03', amount: 5000, direction: 'credit', descriptor: 'Salary', category: 'Income' }],
      setBalance: 9000,
    } as any);
    expect(res.imported).toBe(1);
    expect(transactions.create.mock.calls[0][1]).toMatchObject({ type: 'income', categoryId: 'cat-income', accountId: 'b1' });
    expect(accounts.update).toHaveBeenCalledWith('b1', 'u1', expect.objectContaining({ balance: 9000 }));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest statements.service`
Expected: FAIL — `import` is the stub / constructor arity differs.

- [ ] **Step 4: Implement `import()`** (add `CategoriesService` to the constructor)

Add `categories: CategoriesService` as the 5th constructor param (import from `../categories/categories.service`, and add `CategoriesModule` to `statements.module.ts` imports). Replace the stub:

```ts
async import(userId: string, dto: ImportStatementDto): Promise<{ imported: number; skipped: number }> {
  const account = await this.accounts.findOne(dto.accountId, userId);
  if (!account) throw new BadRequestException('Account not found');

  const cats = await this.categories.findAll(userId);
  const other = cats.find((c: any) => c.name.toLowerCase() === 'other') ?? cats[0];
  const resolveCategoryId = (name?: string | null): string => {
    if (name) {
      const hit = cats.find((c: any) => c.name.toLowerCase() === name.toLowerCase());
      if (hit) return hit.id;
    }
    if (!other) throw new BadRequestException('No category available');
    return other.id;
  };

  let imported = 0;
  for (const it of dto.items) {
    const type = it.direction === 'credit' ? TransactionType.INCOME : TransactionType.EXPENSE;
    const paymentMethod = dto.statementType === 'card' ? 'card' : 'netbanking';
    await this.transactions.create(userId, {
      date: new Date(it.isoDate).toISOString(),
      description: it.descriptor || 'Statement import',
      amount: it.amount,
      type,
      categoryId: resolveCategoryId(it.category),
      accountId: dto.accountId,
      paymentMethod: paymentMethod as any,
      importFingerprint: computeImportFingerprint(dto.accountId, it.amount, it.isoDate, it.descriptor),
    } as any);
    imported++;
  }

  if (dto.statementType === 'card' && dto.summary) {
    await this.cards.updateConfig(dto.accountId, userId, dto.summary as any);
  }
  if (dto.setBalance !== undefined) {
    await this.accounts.update(dto.accountId, userId, { balance: dto.setBalance } as any);
  }

  return { imported, skipped: 0 };
}
```

Add the `computeImportFingerprint` import at the top of the service. `skipped` stays 0 because mobile only sends the user-selected (non-duplicate) subset; the count is informational and mobile shows the skipped tally from its own review state.

> **Implementer note:** confirm `AccountsService.update` accepts a `{ balance }` patch and applies it (check `accounts.service.ts:57`). If `update` recomputes balance from transactions rather than accepting it, add a dedicated `setBalance(accountId, userId, balance)` method instead and call that. Verify `CreditCardService.updateConfig` signature `(accountId, userId, dto)` (confirmed at `credit-card.service.ts:123`).

- [ ] **Step 5: Run tests + full suite + build**

Run: `cd backend && npx jest statements.service && npx jest && npx tsc --noEmit 2>&1 | grep -v auth.service.spec`
Expected: import tests PASS; full suite green; no new tsc errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/statements/dto/import-statement.dto.ts backend/src/statements/statements.service.ts backend/src/statements/statements.service.spec.ts backend/src/statements/statements.module.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): POST /statements/import — create txns, card override, balance reconcile"
```

---

## Task 8: Cross-module — SMS→account linking + reverse dedup

**Files:**
- Modify: `backend/src/notification-sync/payment-source-resolver.ts` (add last4 → account, using `resolveAccountByLast4`)
- Modify: `backend/src/notification-sync/payment-source-resolver.spec.ts`
- Modify: the notification-sync **confirm/save** path and `src/sms-sync/*` create path (reverse-dedup guard)
- Create: `backend/src/statements/reverse-dedup.ts` + `.spec.ts` (thin shared guard)

**Interfaces:**
- Consumes: `resolveAccountByLast4` (T3), `classifyLineItems`/`ExistingTxn` (T2), `TransactionsService.findForAccountInRange` (T6).
- Produces: `isLikelyDuplicateOfExisting(candidate, existing[], windowDays?): boolean` — a thin wrapper over the dedup match used to suppress a create when a statement-imported (or prior) transaction already covers it.

- [ ] **Step 1: Extend `resolvePaymentSource` to accept a parsed last4**

Add an optional `last4: string | null` parameter and, when the rail is `card` and a last4 is present, resolve the account via `resolveAccountByLast4` (reusing the account list, mapping `credit_card.last4`). Precedence: a unique last4 match wins over the institution-name heuristic; fall back to the existing institution logic otherwise.

- [ ] **Step 2: Write the failing test** (add to `payment-source-resolver.spec.ts`)

```ts
it('fills accountId from a card last4 even when the institution is ambiguous', () => {
  const accounts = [
    { id: 'c1', institutionName: 'HDFC', type: AccountType.CREDIT, last4: '1234' },
    { id: 'c2', institutionName: 'HDFC', type: AccountType.CREDIT, last4: '9999' },
  ];
  const r = resolvePaymentSource('HDFC', 'card', accounts as any, '9999');
  expect(r.accountId).toBe('c2');
  expect(r.paymentMethod).toBe(PaymentMethod.CARD);
});
```

(Existing resolver tests must keep passing — the new param is optional and defaults to `null`, preserving current behavior. Update the `AccountLite` type to include `last4?: string | null`.)

- [ ] **Step 3: Run test to verify it fails, then implement**

Run: `cd backend && npx jest payment-source-resolver` → FAIL. Implement the last4 branch, re-run → PASS.

- [ ] **Step 4: Reverse-dedup guard — write the failing test**

```ts
// backend/src/statements/reverse-dedup.spec.ts
import { isLikelyDuplicateOfExisting } from './reverse-dedup';

it('true when an existing txn matches amount+direction+date-window', () => {
  const existing = [{ id: 't', isoDate: '2026-06-12', amount: 499, direction: 'debit', descriptor: 'X', importFingerprint: null }];
  expect(isLikelyDuplicateOfExisting({ isoDate: '2026-06-13', amount: 499, direction: 'debit', descriptor: 'Swiggy', category: null }, existing)).toBe(true);
});
it('false when nothing matches', () => {
  expect(isLikelyDuplicateOfExisting({ isoDate: '2026-06-13', amount: 10, direction: 'debit', descriptor: 'x', category: null }, [])).toBe(false);
});
```

- [ ] **Step 5: Implement `reverse-dedup.ts`** (reuse `classifyLineItems`)

```ts
// backend/src/statements/reverse-dedup.ts
import { classifyLineItems, ExistingTxn, ParsedLineItem } from './statement-dedup';

/** True when a new incoming charge (from SMS/notification) already exists on the
 * account — including one imported from a statement. Reuses the same
 * deterministic matcher so both dedup directions agree. */
export function isLikelyDuplicateOfExisting(
  candidate: ParsedLineItem,
  existing: ExistingTxn[],
  windowDays = 3,
): boolean {
  const [r] = classifyLineItems('rev', [candidate], existing, { windowDays });
  return r.verdict !== 'new';
}
```

- [ ] **Step 6: Wire the guard into the SMS/notification create path**

In the notification-sync confirm path and `sms-sync` create path, before creating a transaction for a detected charge that has an `accountId`, load the account's recent transactions (`findForAccountInRange`, ±window around the charge date) and skip/flag when `isLikelyDuplicateOfExisting` returns true. Add one service test asserting a create is suppressed when an imported charge already covers it. Keep the change minimal and additive — do not restructure the surrounding parallel-work code.

> **Implementer note:** these files (`notification-sync/*`, `sms-sync/*`) are actively edited by parallel work. Read them fresh, add the guard as a small pre-check, and add exact paths to the commit only. If the confirm path has no natural seam for a per-charge query, gate the guard behind the presence of an `accountId` (which only exists now that Step 1 fills it) to keep the blast radius small.

- [ ] **Step 7: Run tests + full suite**

Run: `cd backend && npx jest && npx tsc --noEmit 2>&1 | grep -v auth.service.spec`
Expected: all green; no new tsc errors.

- [ ] **Step 8: Commit**

```bash
git add backend/src/statements/reverse-dedup.ts backend/src/statements/reverse-dedup.spec.ts backend/src/notification-sync/payment-source-resolver.ts backend/src/notification-sync/payment-source-resolver.spec.ts
# plus the exact notification-sync/sms-sync files you touched
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(backend): SMS card last4→account linking + reverse statement dedup"
```

---

## Task 9: Mobile — `api.statements` + adapter + review helpers (pure)

**Files:**
- Modify: `mobile/src/api/index.ts` (add `statements` resource)
- Modify: `mobile/src/api/types.ts` (DTO + view types)
- Create: `mobile/src/screens/statementReview.ts` (RN-free helpers)
- Create: `mobile/src/screens/statementReview.spec.ts`

**Interfaces:**
- Produces:
  - `api.statements.parse(payload): Promise<StatementParseResultView>` and `api.statements.import(payload): Promise<{ imported: number; skipped: number }>`
  - `bucketByVerdict(items): { new: ClassifiedLineView[]; possible: ...; duplicate: ... }`
  - `defaultIncluded(item): boolean` (new → true; possible/duplicate → false)
  - `buildImportPayload(view, selection): ImportStatementPayload`

- [ ] **Step 1: Add DTO/view types to `types.ts`**

Mirror the backend `StatementParseResult` shape as an `ApiStatementParseResult` interface (account, statementType, period, summary, items with `verdict`/`matchedTransactionId`), and a `StatementParseResultView` the screen consumes. Reuse the existing type conventions in `types.ts` (`Api*` for wire, `*View` for screen). No password/422 type — decryption is on-device (Task 4); `api.statements.parse` receives the already-prepared `{ pdf }` or `{ text }`.

- [ ] **Step 2: Write the failing test for the pure helpers**

```ts
// mobile/src/screens/statementReview.spec.ts
import { bucketByVerdict, defaultIncluded, buildImportPayload } from './statementReview';

const item = (o: any) => ({ isoDate: '2026-06-01', amount: 499, direction: 'debit', descriptor: 'Swiggy', category: 'Food', verdict: 'new', ...o });

describe('statementReview helpers', () => {
  it('buckets items by verdict', () => {
    const b = bucketByVerdict([item({ verdict: 'new' }), item({ verdict: 'possible' }), item({ verdict: 'duplicate' })]);
    expect(b.new).toHaveLength(1); expect(b.possible).toHaveLength(1); expect(b.duplicate).toHaveLength(1);
  });
  it('defaults new→included, possible/duplicate→excluded', () => {
    expect(defaultIncluded(item({ verdict: 'new' }))).toBe(true);
    expect(defaultIncluded(item({ verdict: 'possible' }))).toBe(false);
    expect(defaultIncluded(item({ verdict: 'duplicate' }))).toBe(false);
  });
  it('buildImportPayload emits only selected items with resolved fields', () => {
    const view = { account: { id: 'c1' }, statementType: 'card', summary: { statementBilled: 100 },
      items: [item({ verdict: 'new' }), item({ verdict: 'duplicate', descriptor: 'dup' })] };
    const selection = new Set([0]); // include only the first
    const payload = buildImportPayload(view as any, selection, { applySummary: true, setBalance: undefined });
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].descriptor).toBe('Swiggy');
    expect(payload.accountId).toBe('c1');
    expect(payload.summary).toEqual({ statementBilled: 100 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd mobile && npx jest statementReview`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the helpers** (pure, RN-free)

```ts
// mobile/src/screens/statementReview.ts
export type Verdict = 'new' | 'possible' | 'duplicate';
export interface ClassifiedLineView {
  isoDate: string; amount: number; direction: 'debit' | 'credit';
  descriptor: string; category: string | null; verdict: Verdict; matchedTransactionId?: string;
}
export interface StatementParseResultView {
  account: { id: string | null; matchedByLast4: boolean; ambiguous: boolean; mismatchWarning: boolean };
  statementType: 'card' | 'bank';
  period: { from: string | null; to: string | null };
  summary: Record<string, number | string | null>;
  items: ClassifiedLineView[];
}

export function bucketByVerdict(items: ClassifiedLineView[]) {
  return {
    new: items.filter((i) => i.verdict === 'new'),
    possible: items.filter((i) => i.verdict === 'possible'),
    duplicate: items.filter((i) => i.verdict === 'duplicate'),
  };
}

export function defaultIncluded(item: ClassifiedLineView): boolean {
  return item.verdict === 'new';
}

export interface ImportStatementPayload {
  accountId: string;
  statementType: 'card' | 'bank';
  items: Array<{ isoDate: string; amount: number; direction: 'debit' | 'credit'; descriptor: string; category: string | null }>;
  summary?: Record<string, number | string | null>;
  setBalance?: number;
}

export function buildImportPayload(
  view: StatementParseResultView,
  selected: Set<number>,
  opts: { applySummary: boolean; setBalance?: number },
): ImportStatementPayload {
  const items = view.items
    .map((it, idx) => ({ it, idx }))
    .filter(({ idx }) => selected.has(idx))
    .map(({ it }) => ({ isoDate: it.isoDate, amount: it.amount, direction: it.direction, descriptor: it.descriptor, category: it.category }));
  return {
    accountId: view.account.id!,
    statementType: view.statementType,
    items,
    summary: opts.applySummary && view.statementType === 'card' ? view.summary : undefined,
    setBalance: opts.setBalance,
  };
}
```

- [ ] **Step 5: Add the `statements` api resource** (in `index.ts`, mirror `receipts`/`cards`)

```ts
  statements: {
    /** Parse a statement. `input` is the already-prepared upload from
     * statementPdf.prepareUpload — { pdf } for an unencrypted PDF (raw base64),
     * or { text } for an encrypted PDF decrypted on-device. Decryption/passwords
     * never touch this layer. */
    async parse(input: { pdf: string } | { text: string }, accountId?: string):
      Promise<StatementParseResultView> {
      const dto = await apiClient.post<ApiStatementParseResult>('/statements/parse', { ...input, accountId });
      return toStatementParseResultView(dto);
    },
    async import(payload: ImportStatementPayload): Promise<{ imported: number; skipped: number }> {
      const res = await apiClient.post<{ imported: number; skipped: number }>('/statements/import', payload);
      bumpData();
      return res;
    },
  },
```

Add `toStatementParseResultView` to `adapters.ts` (near `toCardSummaryView`) — a near-passthrough that maps the wire DTO to the view.

- [ ] **Step 6: Run tests + build**

Run: `cd mobile && npx jest statementReview && npx tsc --noEmit 2>&1 | grep -v notification-listener/index.test`
Expected: helper tests PASS; no new tsc errors (ignore the ~6 known `index.test.ts` errors).

- [ ] **Step 7: Commit**

```bash
git add mobile/src/api/index.ts mobile/src/api/types.ts mobile/src/api/adapters.ts mobile/src/screens/statementReview.ts mobile/src/screens/statementReview.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(mobile): api.statements + parse-result adapter + review helpers"
```

---

## Task 10: Mobile — StatementReview screen, password prompt, entry points

**Files:**
- Create: `mobile/src/screens/StatementReview.tsx`
- Modify: `mobile/src/screens/CardDetail.tsx` (add "Import statement" action)
- Modify: `mobile/src/screens/AccountDetail.tsx` (bank — add "Import statement" action)
- Modify: `mobile/src/screens/Sync.tsx` (add "Import a statement" tile)
- Modify: nav registry `mobile/src/app/navContext.tsx` + `mobile/src/app/screens.tsx` — register a `statement-review` kind (mirror how `card-detail` is registered there)
- (`expo-document-picker`, `expo-file-system`, `pdfjs-dist` already added in Task 4)

**Interfaces:**
- Consumes: `prepareUpload`/`PdfPasswordError` (Task 4), `api.statements` (Task 9), `bucketByVerdict`/`defaultIncluded`/`buildImportPayload` (Task 9), `categories.resolveId` (existing, used on confirm), the Slice B `bumpData` refresh.

Since mobile RN components aren't unit-tested here, this task is structural + `tsc` + on-device driving. Steps:

- [ ] **Step 1: Read Expo v56 docs** for `expo-document-picker` (`getDocumentAsync`, `copyToCacheDirectory`) and reading the picked file as base64 (`expo-file-system` `readAsStringAsync` with `EncodingType.Base64`). Per `mobile/AGENTS.md`. (Deps installed in Task 4.)

- [ ] **Step 2: Add the nav kind** — register `{ kind: 'statement-review', data: { accountId?: string } }` in the nav registry alongside `card-detail` (mirror how `card-detail` was added). The review screen receives the parse result via route data or an in-memory handoff (match the pattern the codebase uses for passing large objects between screens — check how `CardDetail` receives its account).

- [ ] **Step 3: Build the launcher flow** (shared helper the three entry points call): pick PDF → read base64 → `prepareUpload(base64)` (Task 4). If it throws `PdfPasswordError`, show a **password sheet** and retry `prepareUpload(base64, password)` locally (the password stays on-device; never persist it). Once it resolves to `{ pdf }` or `{ text }`, call `api.statements.parse(prepared, accountId?)`, then navigate to `StatementReview` with the returned view. Wrap in try/catch + toast on error (mirror `Sync.tsx runSync` convention).

- [ ] **Step 4: Build `StatementReview.tsx`:**
  - **Summary header** (editable). Card: show the parsed override figures (billed/minDue/dueDate/rewards/statementDate) with a "Apply these figures" toggle (default on). Bank: a "Set balance to ₹{closingBalance}" toggle (default off).
  - **Account mismatch banner** when `view.account.mismatchWarning` — "This statement looks like it's for a different card. Import anyway?"
  - **Sectioned list** via `bucketByVerdict`: **New** (toggles default on), **Possible duplicates** (default off, with the matched hint), **Already imported** (duplicates, default off). Each row: date, descriptor, amount, direction, an include `Switch`, and an inline category chip (tap → category picker; resolve via `categories.resolveId` create-or-resolve on confirm, mirroring the notification-confirm path).
  - **Import bar**: "Add N · skip M" → `buildImportPayload(view, selectedSet, { applySummary, setBalance })` → `api.statements.import(payload)` → toast + navigate back. `api.statements.import` already calls `bumpData()`, so CardDetail/Accounts refresh.

- [ ] **Step 5: Wire the three entry points** — an "Import statement" row/button on `CardDetail` (passes its `accountId`), the bank `AccountDetail` (passes its `accountId`), and an "Import a statement" tile on `Sync` (no accountId → backend resolves by last4; if `view.account.id` is null, show an account picker before proceeding to review).

- [ ] **Step 6: Typecheck + drive the app**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -v notification-listener/index.test`
Expected: no new errors.
Then **drive the app** (per the `superpowers:verification-before-completion` + `run` skills): launch, open a card, Import statement, pick a sample PDF — **an unlocked statement (→ `{ pdf }` document-block path) and a password-protected one (→ on-device `pdfjs` decrypt + password sheet + `{ text }` path)**. Confirm the review screen buckets items and import creates transactions that appear in the ledger and update the card summary. This device run is where the `pdfjs-dist`-under-Hermes spike is proven; if the encrypted path fails on device, escalate per the Task 4 fallback. Note any device-only gaps in the progress ledger.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/screens/StatementReview.tsx mobile/src/screens/CardDetail.tsx mobile/src/screens/AccountDetail.tsx mobile/src/screens/Sync.tsx mobile/src/app/navContext.tsx mobile/src/app/screens.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit --no-verify -m "feat(mobile): statement import — review screen, password prompt, entry points"
```

---

## Final whole-slice review

- [ ] Run the full suites: `cd backend && npx jest` (expect all green, ~+20 tests) and `cd mobile && npx jest` (expect all green, ~+3 suites). Confirm `npx tsc --noEmit` is clean in both except the two known-noise files.
- [ ] Verify the **consistency principle** end-to-end: (a) an SMS-detected card spend now carries `accountId` and lands under the "Cards" filter (follow-up #1); (b) re-importing the same statement classifies every line as `duplicate`; (c) importing a charge then receiving its SMS does not create a second transaction; (d) an imported card statement's override figures show on CardDetail; (e) imported debits count in budgets/reports exactly once and bank-bill transfers stay excluded; (f) Munshi's card-dues answers reflect the imported exact figures.
- [ ] Request code review via `superpowers:requesting-code-review`; log follow-ups in `.superpowers/sdd/progress.md`.

---

## Self-review notes (author)

- **Spec coverage:** flow (T6/T10), fingerprint column (T1), dedup rule incl. twin-charge/ambiguity (T2), account resolve + follow-up #1 (T3/T8), on-device decrypt + text extraction (T4), Claude PDF/text parse + guard (T5), parse/import endpoints incl. pdf|text input (T6/T7), card override + bank reconcile (T7), reverse dedup (T8), mobile api/adapter/helpers (T9), review screen + local password prompt + both+Sync entry points (T10), cross-module consistency + testing (Final review). All spec sections map to a task.
- **Open verification for the implementer (flagged inline, not placeholders):** exact `req.user` property on the JWT guard; `AccountsService.update` accepting a `{ balance }` patch (else add `setBalance`); existence/addition of `TransactionsService.findForAccountInRange`; the Anthropic PDF document-block type against SDK ^0.109.0; **`pdfjs-dist` running under Hermes (the one real feasibility risk — spiked in T4, device-proven in T10, with a server-side-decrypt fallback for encrypted PDFs only)**. Each has a concrete fallback in its task.
