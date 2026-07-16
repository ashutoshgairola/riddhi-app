# Unified SMS + notification sync pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SMS and Android notifications feed one capture→detect→review pipeline, with an OTP/noise gate and on-demand analysis at "Sync now" that runs immediately, independent of the cron.

**Architecture:** SMS become captures in `captured_notification` (`packageName: "sms"`). The existing SMS regex is relocated into notification-sync as a pure module that (a) gates OTP/noise out of the LLM batch and (b) produces detections directly when no LLM client is configured. `runAnalysisForUser` batches SMS + notification captures into one LLM call (cross-channel correlation for free). A new `POST /notification-sync/analyze` runs analysis synchronously for the caller. The mobile Sync screen collapses to the single `detected` queue.

**Tech Stack:** NestJS + TypeORM (Postgres, `synchronize: true`), Jest (backend); Expo/React Native, ts-jest (mobile).

## Global Constraints

- No DB schema/migration changes. Reuse `captured_notification` (`packageName`, `analyzed`) and `detected_transaction` (`sourceKeys`) as-is.
- Backend git commits: no `Co-Authored-By` trailer; author email `gairola.ashutosh26@gmail.com`. `docs/` specs/plans are force-added (`git add -f`).
- The cron (`notification-sync.scheduler.ts`, `0 9,13,18,22`) stays unchanged and is the background safety net.
- Regex hints are NOT injected into the LLM prompt (marginal value, biases the model, extra tokens). The regex earns its keep as the OTP/noise gate and the no-LLM fallback only. `analysis.prompt.ts` is untouched.
- Mobile spacing uses named 8pt tokens from `theme/spacing`; do not introduce raw `space[N]`.

---

## File Structure

**Backend**
- Create `backend/src/notification-sync/keyword-map.ts` — copy of the bank/category maps (sms-sync's copy deleted in Task 6).
- Create `backend/src/notification-sync/sms-parse.ts` — pure `isOtpMessage` + `parseSms`.
- Create `backend/src/notification-sync/sms-parse.spec.ts`.
- Modify `backend/src/notification-sync/notification-analysis.service.ts` — no-LLM regex fallback.
- Modify `backend/src/notification-sync/notification-sync.service.ts` — OTP/noise gate, `interactive` flag, in-flight guard.
- Modify `backend/src/notification-sync/notification-sync.controller.ts` — `POST /analyze`.
- Modify `backend/src/notification-sync/analysis-run.spec.ts` — gate/fallback/interactive cases.
- Delete (Task 6) `backend/src/sms-sync/**`, remove `SmsSyncModule` from `app.module.ts`.

**Mobile**
- Modify `mobile/src/lib/notificationSync.ts` — add `analyzeNow`.
- Modify `mobile/src/lib/smsSync.ts` — replace `fetchSmsSuggestions` with `uploadSmsCaptures`.
- Modify `mobile/src/screens/Sync.tsx` — single detected queue; "Sync now" uploads both channels + analyzes.
- Delete (Task 6) `mobile/src/lib/smsSyncMap.ts`, `mobile/src/lib/smsSyncMap.spec.ts` if unreferenced.

---

## Task 1: Relocate the SMS regex as a pure module under notification-sync

**Files:**
- Create: `backend/src/notification-sync/keyword-map.ts` (copy of `backend/src/sms-sync/keyword-map.ts`, verbatim)
- Create: `backend/src/notification-sync/sms-parse.ts`
- Test: `backend/src/notification-sync/sms-parse.spec.ts`

**Interfaces:**
- Produces:
  - `isOtpMessage(text: string): boolean`
  - `parseSms(raw: string): ParsedSms` where
    ```ts
    interface ParsedSms {
      merchant: string | null;
      amount: number | null;
      type: 'income' | 'expense';
      category: Category | null; // from keyword-map
      bank: string | null;
      last4: string | null;
      confidence: number;
      paymentMethod: 'upi' | 'card' | 'autopay';
    }
    ```

- [ ] **Step 1: Copy keyword-map**

Copy `backend/src/sms-sync/keyword-map.ts` to `backend/src/notification-sync/keyword-map.ts` unchanged (leave the sms-sync copy in place; it is removed in Task 6).

- [ ] **Step 2: Write the failing test**

Create `backend/src/notification-sync/sms-parse.spec.ts`:

```ts
import { isOtpMessage, parseSms } from './sms-parse';

describe('isOtpMessage', () => {
  it('flags an OTP that carries an amount', () => {
    expect(
      isOtpMessage('OTP is 867317 for txn of INR 1190.00 at BUNDL TECHN on HDFC Bank Card'),
    ).toBe(true);
  });
  it('does not flag a real debit alert whose footer mentions OTP', () => {
    expect(
      isOtpMessage('Rs.1190 spent on HDFC Bank Card x8374 at BUNDL TECHNOLOGIES. Never share your OTP with anyone.'),
    ).toBe(false);
  });
});

describe('parseSms', () => {
  it('extracts amount, type, bank, last4 from a card spend', () => {
    const p = parseSms('Rs.499 spent on HDFC Bank Card xx1234 at SWIGGY');
    expect(p.amount).toBe(499);
    expect(p.type).toBe('expense');
    expect(p.bank).toBe('HDFC Bank');
    expect(p.last4).toBe('1234');
    expect(p.paymentMethod).toBe('card');
  });
  it('returns null amount for a message with no currency', () => {
    expect(parseSms('Your ride is arriving').amount).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && npx jest sms-parse`
Expected: FAIL — cannot find module `./sms-parse`.

- [ ] **Step 4: Create the pure module**

Create `backend/src/notification-sync/sms-parse.ts`. Port the body of `SmsSyncService.parse` and its private `extract*`/`titleCase`/`calcConfidence` methods verbatim to module-level functions, and include the OTP guard already written in `sms-sync.service.ts`:

```ts
import { BANK_MAP, CATEGORY_KEYWORD_MAP, Category } from './keyword-map';

export interface ParsedSms {
  merchant: string | null;
  amount: number | null;
  type: 'income' | 'expense';
  category: Category | null;
  bank: string | null;
  last4: string | null;
  confidence: number;
  paymentMethod: 'upi' | 'card' | 'autopay';
}

/** True for OTP / verification SMS. These carry an "INR 1190.00" amount that
 * would otherwise parse as a completed transaction. Matches an OTP keyword
 * within a short span of a 3–8 digit code (either order), so a "never share
 * your OTP" footer on a real debit alert — no code nearby — doesn't trip it. */
export function isOtpMessage(text: string): boolean {
  return /\b(?:otp|one[\s-]?time\s*password|verification code)\b\D{0,15}\d{3,8}|\d{3,8}\D{0,15}\b(?:is\s+your\s+)?(?:otp|one[\s-]?time\s*password)\b/i.test(
    text,
  );
}

export function parseSms(raw: string): ParsedSms {
  const text = raw;
  const amount = extractAmount(text);
  const type = extractType(text);
  const { bank, bankShort: _bankShort } = extractBank(text);
  const last4 = extractLast4(text);
  const merchant = extractMerchant(text, type);
  const category = extractCategory(text, merchant, type);
  const confidence = calcConfidence(amount, bank, last4, merchant, category);
  const paymentMethod = extractPaymentMethod(text);
  return { merchant, amount, type, category, bank, last4, confidence, paymentMethod };
}

// ── Port each private method below verbatim from sms-sync.service.ts,
//    changing `private extractAmount(text: string)` → `function extractAmount(text: string)`
//    (and likewise for extractType, extractBank, extractLast4, extractMerchant,
//    extractPaymentMethod, extractCategory, calcConfidence, titleCase).
//    The regex/logic bodies are copied unchanged. ──
```

Transcribe the eight helpers exactly as they appear in `backend/src/sms-sync/sms-sync.service.ts` (lines 133–296), converting each `private X(...)` method to a module-level `function X(...)`. `extractCategory` calls `titleCase` via `extractMerchant`; keep all call sites.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx jest sms-parse`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/notification-sync/keyword-map.ts src/notification-sync/sms-parse.ts src/notification-sync/sms-parse.spec.ts
git commit -m "refactor(sync): pure sms-parse module + OTP gate under notification-sync"
```

---

## Task 2: OTP/noise gate + no-LLM fallback + interactive flag + in-flight guard

**Files:**
- Modify: `backend/src/notification-sync/notification-analysis.service.ts`
- Modify: `backend/src/notification-sync/notification-sync.service.ts`
- Test: `backend/src/notification-sync/analysis-run.spec.ts`

**Interfaces:**
- Consumes: `isOtpMessage`, `parseSms` (Task 1).
- Produces:
  - `NotificationSyncService.runAnalysisForUser(userId: string, opts?: { interactive?: boolean }): Promise<{ detected: number }>`
  - `NotificationAnalysisService.analyze(...)` gains a no-client regex fallback (same return type `DetectedGroup[]`).

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/notification-sync/analysis-run.spec.ts` (reuse the module-setup pattern already in the file):

```ts
it('gates an OTP capture out of the LLM batch but still marks it analyzed', async () => {
  const captures: any[] = [
    { id: 'c1', dedupKey: 'k-otp', packageName: 'sms', title: 'HDFCBK', text: 'OTP is 867317 for txn of INR 1190.00 at BUNDL TECHN', postedAt: new Date(), analyzed: false },
  ];
  const capRepo = { find: jest.fn(async () => captures), update: jest.fn(async () => undefined) };
  const analysis = { analyze: jest.fn(async () => []) };
  const notifications = { create: jest.fn() };
  const moduleRef = await Test.createTestingModule({
    providers: [
      NotificationSyncService,
      { provide: getRepositoryToken(CapturedNotification), useValue: capRepo },
      { provide: getRepositoryToken(DetectedTransaction), useValue: { create: (x: any) => x, save: jest.fn() } },
      { provide: getRepositoryToken(Account), useValue: { find: jest.fn(async () => []) } },
      { provide: getRepositoryToken(CreditCard), useValue: { find: jest.fn(async () => []) } },
      { provide: NotificationAnalysisService, useValue: analysis },
      { provide: NotificationsService, useValue: notifications },
      { provide: TransactionsService, useValue: { findForAccountInRange: jest.fn() } },
    ],
  }).compile();
  const svc = moduleRef.get(NotificationSyncService);
  const res = await svc.runAnalysisForUser('u1');
  expect(res.detected).toBe(0);
  expect(analysis.analyze).not.toHaveBeenCalled(); // OTP was the only capture → nothing to send
  expect(capRepo.update).toHaveBeenCalledTimes(1); // still marked analyzed
});

it('does not push a review nudge when interactive', async () => {
  const captures: any[] = [
    { id: 'c1', dedupKey: 'k-hdfc', packageName: 'sms', title: 'HDFCBK', text: 'Rs.499 spent on card *1234', postedAt: new Date(), analyzed: false },
  ];
  const capRepo = { find: jest.fn(async () => captures), update: jest.fn(async () => undefined) };
  const analysis = { analyze: jest.fn(async () => [{ merchant: 'Swiggy', amount: 499, type: 'expense', category: 'Food', institution: 'HDFC', rail: 'card', last4: '1234', confidence: 0.9, sourceKeys: ['k-hdfc'] }]) };
  const notifications = { create: jest.fn(async () => ({})) };
  const moduleRef = await Test.createTestingModule({
    providers: [
      NotificationSyncService,
      { provide: getRepositoryToken(CapturedNotification), useValue: capRepo },
      { provide: getRepositoryToken(DetectedTransaction), useValue: { create: (x: any) => x, save: jest.fn(async (x: any) => x) } },
      { provide: getRepositoryToken(Account), useValue: { find: jest.fn(async () => []) } },
      { provide: getRepositoryToken(CreditCard), useValue: { find: jest.fn(async () => []) } },
      { provide: NotificationAnalysisService, useValue: analysis },
      { provide: NotificationsService, useValue: notifications },
      { provide: TransactionsService, useValue: { findForAccountInRange: jest.fn(async () => []) } },
    ],
  }).compile();
  const svc = moduleRef.get(NotificationSyncService);
  const res = await svc.runAnalysisForUser('u1', { interactive: true });
  expect(res.detected).toBe(1);
  expect(notifications.create).not.toHaveBeenCalled();
});
```

Add a fallback test in `backend/src/notification-sync/notification-analysis.service.spec.ts` (follow its existing construction of the service with a `null` client):

```ts
it('falls back to regex detections when no LLM client is configured', async () => {
  const svc = new NotificationAnalysisService(null, { get: () => undefined } as any);
  const groups = await svc.analyze([
    { dedupKey: 'k1', packageName: 'sms', title: 'HDFCBK', text: 'Rs.499 spent on HDFC Bank Card xx1234 at SWIGGY' },
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({ amount: 499, type: 'expense', sourceKeys: ['k1'] });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest analysis-run notification-analysis.service`
Expected: FAIL — interactive push still fires / no-client returns `[]`.

- [ ] **Step 3: Add the no-LLM fallback to `analyze`**

In `notification-analysis.service.ts`, import the parser and replace the early `if (!this.client ...) return []` so that a missing client falls back to regex:

```ts
import { isOtpMessage, parseSms } from './sms-parse';
```

```ts
async analyze(
  captures: { dedupKey: string; packageName: string; title: string | null; text: string }[],
): Promise<DetectedGroup[]> {
  if (captures.length === 0) return [];
  if (!this.client) return regexFallback(captures);
  // ... unchanged LLM path ...
}
```

Add at module scope (below `parseGroups`):

```ts
/** Deterministic detections when no LLM is configured: one group per capture
 * the regex can price. Keeps SMS/notification detection working with the LLM
 * off (the LLM path supersedes this whenever a client is present). */
function regexFallback(
  captures: { dedupKey: string; packageName: string; title: string | null; text: string }[],
): DetectedGroup[] {
  const out: DetectedGroup[] = [];
  for (const c of captures) {
    const p = parseSms(c.text);
    if (p.amount === null) continue;
    out.push({
      merchant: p.merchant,
      amount: p.amount,
      type: p.type,
      category: p.category,
      institution: p.bank,
      rail: p.paymentMethod,
      last4: p.last4,
      confidence: p.confidence,
      sourceKeys: [c.dedupKey],
    });
  }
  return out;
}
```

- [ ] **Step 4: Add the gate, interactive flag, and in-flight guard to `runAnalysisForUser`**

In `notification-sync.service.ts`, import the gate and add a per-user lock field:

```ts
import { isOtpMessage, parseSms } from './sms-parse';
```

```ts
/** Users with an analysis pass in flight — a second concurrent call (double
 * tap of "Sync now", or a cron firing mid-sync) returns early instead of
 * re-processing the same captures.
 * ponytail: in-process Set; swap for a Postgres advisory lock if the backend
 * ever runs multi-instance. */
private readonly inFlight = new Set<string>();
```

Rewrite the method signature and body head/tail:

```ts
async runAnalysisForUser(
  userId: string,
  opts: { interactive?: boolean } = {},
): Promise<{ detected: number }> {
  if (this.inFlight.has(userId)) return { detected: 0 };
  this.inFlight.add(userId);
  try {
    const captures = await this.captures.find({
      where: { userId, analyzed: false },
      order: { postedAt: 'ASC' },
      take: 150, // ponytail: batch ceiling; an OTP-heavy first backlog drains over successive syncs
    });
    if (captures.length === 0) return { detected: 0 };

    // Cheap gate: drop OTP/promo/balance-only (no priceable amount) before the
    // LLM. Gated captures are still marked analyzed at the end so they don't loop.
    const candidates = captures.filter(
      (c) => !isOtpMessage(c.text) && parseSms(c.text).amount !== null,
    );

    const groups =
      candidates.length > 0
        ? await this.analysis.analyze(
            candidates.map((c) => ({
              dedupKey: c.dedupKey,
              packageName: c.packageName,
              title: c.title,
              text: c.text,
            })),
          )
        : [];

    // ... existing account/card loading, keyToPostedAt, and the per-group
    //     resolve → reverse-dedup → save loop stay UNCHANGED ...

    await this.captures.update(
      { id: In(captures.map((c) => c.id)) },
      { analyzed: true },
    );

    if (detected > 0 && !opts.interactive) {
      await this.notifications.create(userId, {
        type: NotificationType.MUNSHI_SUGGESTION,
        title: 'New transactions to review',
        body: `Munshi ji found ${detected} transaction${detected === 1 ? '' : 's'} from your notifications.`,
        data: { screen: 'sync' },
      });
    }
    return { detected };
  } finally {
    this.inFlight.delete(userId);
  }
}
```

Note: `keyToPostedAt` must be built from `captures` (unchanged); the per-group loop iterates `groups`. Leave the middle of the method exactly as it is today.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx jest analysis-run notification-analysis.service`
Expected: PASS (all cases, including the pre-existing correlation/dedup tests).

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/notification-sync/notification-analysis.service.ts src/notification-sync/notification-sync.service.ts src/notification-sync/analysis-run.spec.ts src/notification-sync/notification-analysis.service.spec.ts
git commit -m "feat(sync): OTP/noise gate, no-LLM fallback, interactive + in-flight guard"
```

---

## Task 3: On-demand `POST /notification-sync/analyze`

**Files:**
- Modify: `backend/src/notification-sync/notification-sync.controller.ts`
- Test: `backend/src/notification-sync/analyze-endpoint.spec.ts` (create)

**Interfaces:**
- Consumes: `runAnalysisForUser(userId, { interactive: true })` (Task 2).
- Produces: `POST /notification-sync/analyze` → `{ detected: number }`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/notification-sync/analyze-endpoint.spec.ts`:

```ts
import { NotificationSyncController } from './notification-sync.controller';

describe('POST /notification-sync/analyze', () => {
  it('runs analysis interactively for the current user', async () => {
    const service = { runAnalysisForUser: jest.fn(async () => ({ detected: 3 })) } as any;
    const controller = new NotificationSyncController(service);
    const res = await controller.analyze({ userId: 'u1', email: 'e' });
    expect(res).toEqual({ detected: 3 });
    expect(service.runAnalysisForUser).toHaveBeenCalledWith('u1', { interactive: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest analyze-endpoint`
Expected: FAIL — `controller.analyze` is not a function.

- [ ] **Step 3: Add the endpoint**

In `notification-sync.controller.ts` add:

```ts
@Post('analyze')
analyze(@CurrentUser() user: { userId: string; email: string }) {
  return this.service.runAnalysisForUser(user.userId, { interactive: true });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest analyze-endpoint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/notification-sync/notification-sync.controller.ts src/notification-sync/analyze-endpoint.spec.ts
git commit -m "feat(sync): on-demand POST /notification-sync/analyze"
```

---

## Task 4: Mobile — upload SMS as captures instead of parse-batch

**Files:**
- Modify: `mobile/src/lib/smsSync.ts`
- Modify: `mobile/src/lib/notificationSync.ts`

**Interfaces:**
- Consumes: `POST /notification-sync/ingest` (existing), `POST /notification-sync/analyze` (Task 3).
- Produces:
  - `uploadSmsCaptures(): Promise<number>` (in `smsSync.ts`) — count of newly uploaded SMS.
  - `analyzeNow(): Promise<{ detected: number }>` (in `notificationSync.ts`).

- [ ] **Step 1: Add `analyzeNow` to notificationSync.ts**

Append:

```ts
/** Triggers an immediate server-side analysis pass for the current user
 * (SMS + notification captures), independent of the cron. Returns how many
 * new detections it produced. Safe to call repeatedly — the server no-ops when
 * there are no unanalyzed captures. */
export async function analyzeNow(): Promise<{ detected: number }> {
  return apiClient.post<{ detected: number }>(`/notification-sync/analyze`, {});
}
```

- [ ] **Step 2: Replace `fetchSmsSuggestions` with `uploadSmsCaptures`**

In `smsSync.ts`, remove the `ParsedSmsWire`/`toSyncDetected` import and the `fetchSmsSuggestions` function, and add:

```ts
/** Reads recent bank SMS and uploads the money-looking, not-yet-processed
 * ones to the shared capture store as `packageName: "sms"` captures. The
 * backend dedups by content, so re-runs are cheap. Returns the count uploaded.
 * Assumes READ_SMS is already granted (call `ensureSmsPermission` first). */
export async function uploadSmsCaptures(): Promise<number> {
  if (!smsSyncSupported()) return 0;
  const since = Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000;
  const messages = await getMessages(since, 300);
  const processed = await loadProcessedIds();
  const fresh = messages.filter((m) => !processed.has(m.id) && looksLikeMoney(m.body));
  if (fresh.length === 0) return 0;
  await apiClient.post('/notification-sync/ingest', {
    notifications: fresh.map((m) => ({
      packageName: 'sms',
      title: m.address,
      text: m.body,
      postedAt: m.date,
    })),
  });
  await rememberProcessed(fresh.map((m) => m.id));
  return fresh.length;
}
```

Keep `looksLikeMoney`, `loadProcessedIds`, `rememberProcessed`, `ensureSmsPermission`, `smsSyncSupported` as-is (`looksLikeMoney` still trims obvious non-money before upload; the server OTP gate handles OTP-with-amount).

- [ ] **Step 3: Update the smsSyncMap test (unit-level guard)**

`smsSyncMap.ts` is now unused by the app but its pure mapping test still compiles. Leave both for deletion in Task 6. No test change here.

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: errors ONLY in `Sync.tsx` (still importing `fetchSmsSuggestions`) — fixed in Task 5. No errors in `smsSync.ts` / `notificationSync.ts`.

- [ ] **Step 5: Commit**

```bash
cd mobile && git add src/lib/smsSync.ts src/lib/notificationSync.ts
git commit -m "feat(sync): upload SMS as captures + analyzeNow client helper"
```

---

## Task 5: Mobile — collapse Sync.tsx to the single detected queue

**Files:**
- Modify: `mobile/src/screens/Sync.tsx`

**Interfaces:**
- Consumes: `uploadSmsCaptures` (Task 4), `analyzeNow` (Task 4), existing `uploadCaptured`/`fetchDetected`/`configureAllowlist`.

- [ ] **Step 1: Swap imports**

Replace the `smsSync` import block:

```ts
import {
  ensureSmsPermission,
  uploadSmsCaptures,
  smsSyncSupported,
} from '../lib/smsSync';
```

Add `analyzeNow` to the `notificationSync` import list. Remove `import { nonDuplicates } from '../lib/smsSyncMap';`.

- [ ] **Step 2: Fold SMS upload + analysis into `refreshDetections`**

Change `refreshDetections` to take an `analyze` flag and upload SMS alongside notifications:

```ts
const refreshDetections = useCallback(async (analyze = false) => {
  setListenerEnabled(isListenerEnabled());
  try {
    const paused = (await AsyncStorage.getItem(CAPTURE_PAUSED_KEY)) === '1';
    if (!paused) await configureAllowlist();
    await Promise.all([uploadCaptured(), uploadSmsCaptures()]);
    if (analyze) await analyzeNow();
    const [cats, det] = await Promise.all([api.categories.list(), fetchDetected()]);
    setCategories(cats);
    setDetected(det);
  } catch {
    toast("Couldn't load detected transactions", '📡');
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

The mount effect stays `void refreshDetections();` (analyze defaults to false — show existing detections without an LLM call or SMS permission prompt).

- [ ] **Step 3: Rewrite "Sync now"**

In `openMoreSheet`, replace the Sync-now `onPress` with a handler that requests SMS permission (when supported) then runs the analyzing refresh:

```ts
onPress: () =>
  void (async () => {
    setSyncing(true);
    try {
      if (smsSyncSupported()) await ensureSmsPermission();
      await refreshDetections(true);
      toast('Synced', '🔄');
    } finally {
      setSyncing(false);
    }
  })(),
```

- [ ] **Step 4: Remove the SMS `pending` path**

Delete: `pending` state, `NO_DETECTED`, `runSync`, the auto-`runSync` effect, `saveDetected`, `confirm`, `dismiss`, `addAll`, and the `SyncDetected` render branch (`shownPending` / `possibleDuplicate` hint). The review list becomes `detected`-only:

```ts
const reviewCount = detected.length;
const reviewCountLabel =
  detected.length >= DETECTED_FETCH_LIMIT ? `${reviewCount}+` : `${reviewCount}`;
const shownDetected = detected.slice(0, reviewLimit);
const hiddenCount = reviewCount - shownDetected.length;
```

Render only `shownDetected.map((d) => <DetectedCard ... />)`. Remove the "Add all" link (`nonDuplicates(pending)`), keeping per-card confirm/dismiss. `keep the `added` session list and `confirmDetectedItem`/`dismissDetectedItem` exactly as they are.

- [ ] **Step 5: Typecheck + mapping test**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS (no references to removed SMS symbols).

Run: `cd mobile && npx jest smsSyncMap`
Expected: PASS (still green until Task 6 deletes it).

- [ ] **Step 6: Commit**

```bash
cd mobile && git add src/screens/Sync.tsx
git commit -m "feat(sync): single detected queue; Sync now uploads both channels + analyzes"
```

---

## Task 6: Delete the legacy sms-sync module

**Files:**
- Delete: `backend/src/sms-sync/` (controller, module, service, spec, keyword-map, dto)
- Modify: `backend/src/app.module.ts` (remove `SmsSyncModule`)
- Delete: `mobile/src/lib/smsSyncMap.ts`, `mobile/src/lib/smsSyncMap.spec.ts`
- Delete: `backend/src/sms-sync/sms-sync.service.spec.ts` OTP additions from the earlier fix (removed with the module)

- [ ] **Step 1: Confirm no remaining references**

Run:
```bash
cd backend && grep -rn "sms-sync\|SmsSync\|parse-batch" src/ | grep -v node_modules
cd ../mobile && grep -rn "smsSyncMap\|parse-batch\|toSyncDetected\|ParsedSmsWire" src/ | grep -v node_modules
```
Expected: only matches inside the files being deleted (and `SmsSyncModule` in `app.module.ts`).

- [ ] **Step 2: Delete the backend module and unregister it**

```bash
cd backend && rm -rf src/sms-sync
```
In `app.module.ts`, remove the `SmsSyncModule` import line and its entry in the `imports` array.

- [ ] **Step 3: Delete the mobile mapper**

```bash
cd mobile && rm src/lib/smsSyncMap.ts src/lib/smsSyncMap.spec.ts
```

- [ ] **Step 4: Full test + typecheck**

Run:
```bash
cd backend && npx jest && npx tsc --noEmit -p tsconfig.json
cd ../mobile && npx jest && npx tsc --noEmit
```
Expected: PASS across both. No dangling imports.

- [ ] **Step 5: Commit**

```bash
cd backend && git add -A src/sms-sync src/app.module.ts && cd ../mobile && git add -A src/lib/smsSyncMap.ts src/lib/smsSyncMap.spec.ts
git commit -m "chore(sync): remove legacy sms-sync module, unified pipeline supersedes it"
```

---

## Notes / follow-ups (not in this plan)

- **Source text on the review card.** Notification-origin detections show "Detected from a … notification"; SMS-origin ones will too, instead of the raw SMS preview the old cards showed. Restoring a source preview means adding a `sample` field to `DetectedView`/`listPending` (join the first `sourceKey`'s capture text). Deferred — the confirmed transaction already carries the full source text as its note.
- **Bulk "Add all"** over `detected` is dropped (it only existed for SMS `pending`). Add a `POST /notification-sync/confirm-all` later if wanted.
- **Skip-LLM-for-confident-SMS** cost optimization: only if batch volume ever proves it needed.

## Self-review

- Spec §1 one capture store → Tasks 4, 5, 6. §2 regex gate/fallback → Tasks 1, 2. §3 one bounded LLM pass → Task 2 (gate feeds `analyze`). §4 on-demand analyze → Tasks 2, 3, 5. §5 one review UI → Task 5. Data/schema (no changes) → honored throughout. Ceilings (batch 150, in-flight lock, no-push interactive) → Task 2. All spec sections covered.
- Type consistency: `runAnalysisForUser(userId, opts?)`, `analyze(captures)` return `DetectedGroup[]`, `parseSms`→`ParsedSms`, `uploadSmsCaptures(): Promise<number>`, `analyzeNow(): Promise<{detected:number}>` used identically across tasks.
- No placeholders except the deliberate "port these eight helpers verbatim from the named source lines" in Task 1 — the source is in-repo and cited by file+line.
