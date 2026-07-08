# Task 5 report: Munshi card-dues awareness

(Note: this file previously held a stale report for an unrelated, differently-scoped
"Task 5" — payment-source resolution for notification-sync. That work is not part of
this task; this report replaces it with the credit-card/Munshi-awareness task.)

## How ChatPromptContext is assembled (and where cards hook in)

`AiChatService.buildPromptContext(userId)` (backend/src/ai-chat/ai-chat.service.ts)
runs a `Promise.all` fetching `budgets`, `goals`, `categories`, `eventsRaw`, and
(newly) `accountsRaw` via `this.accountsService.findAll(userId)`, each wrapped in
`.catch(() => [])` so one failing dependency doesn't take down prompt assembly.

After that, mirroring the events pattern from commit `54219e1`
("feat(munshi): event-budget awareness via snapshot and list_events tool"):
- `creditAccounts = accountsRaw.filter(a => a.type === AccountType.CREDIT)`
- `cardSummaries = Promise.all(creditAccounts.map(a => this.creditCardService.getSummary(a.id, userId).catch(() => null)))`
  — per-card failures are swallowed individually so one bad card config doesn't
  blank out the others.
- `cards: PromptCardContext[]` = summaries filtered to non-null AND
  `outstanding > 0`, mapped to `{ name, outstanding, dueDate, daysUntilDue }`.
- `cards` is added to the returned `ChatPromptContext` alongside `budget`,
  `goals`, `events`, `categoryNames`.

`CreditCardService` is injected into `AiChatService`'s constructor (after
`eventsService`, before the `ANTHROPIC_CLIENT` token) and added to
`toolCtx().svc.creditCard` so tool handlers can call it too.

## Snapshot line format

`prompt.ts` gains `PromptCardContext` and a `cards: PromptCardContext[]` field
on `ChatPromptContext`, plus `formatCardsSection`:

- No cards with outstanding > 0: `- No card dues.`
- Otherwise: `- Card dues: ₹<total> across <n> card(s); soonest <name> due in <d> days (₹<outstanding>).`
  where `<name>`/`<d>`/`<outstanding>` come from the card with the smallest
  `daysUntilDue`. `formatCardsSection` is called from `buildDynamicPrompt`
  right after `formatEventsSection`, before the categories line — same slot
  events took relative to goals.

Example: `- Card dues: ₹12,000 across 1 card; soonest ICICI Card due in 7 days (₹12,000).`

`STATIC_SYSTEM_PROMPT` (the cached block) was left untouched — no new tool
file was added for cards (unlike events' `list_events`), the change rides on
the existing `accounts`/`list_accounts` surface, so the tool-list sentence
didn't need updating.

## Accounts-tool change

`backend/src/ai-chat/tools/accounts.tools.ts`: added `toModelAccountWithCard(ctx, a)`,
an async wrapper around the existing (still-used) `toModelAccount`. For
non-credit accounts it returns the base fields unchanged. For credit accounts
it calls `ctx.svc.creditCard.getSummary(a.id, ctx.userId)` and merges in
`outstanding`, `available`, `minDue`, `dueDate`; on error it falls back to the
base fields (never throws the whole `list_accounts` call for one bad card).

Only `list_accounts` was changed to use it (`items = await Promise.all(accounts.map(a => toModelAccountWithCard(ctx, a)))`,
returned as `data: items`). `create_account`/`update_account`/`delete_account`
and the `account_list` widget payload were left as-is — the brief's "the
accounts tool" maps to `list_accounts`, the read surface Munshi actually
queries for card questions.

## Module wiring

- `AiChatModule` now imports `CreditCardModule` (exports `CreditCardService`).
- Checked for cycles: grepped every `*.module.ts` for `AiChatModule` imports —
  only `app.module.ts` and `ai-chat.module.ts` itself reference it.
  `CreditCardModule` imports `AccountsModule`, `CategoriesModule`,
  `TransactionsModule` — none of which import `AiChatModule`. No cycle.
  Full test suite (which exercises these services, though via manual
  construction in specs rather than Nest's DI container in most places) stayed
  green; there is no existing spec that boots `AiChatModule` through
  `Test.createTestingModule`, so this was a static-analysis check rather than
  a live DI boot — worth a live-boot check too if one is ever added.
- `tools/types.ts`: `ToolCtx.svc` gained `creditCard: CreditCardService`.

## Tests

- `backend/src/ai-chat/ai-chat.service.spec.ts`: added `creditCard` mock and a
  working `accounts` mock (was `{}`, which would throw synchronously the
  moment `buildPromptContext` called `accountsService.findAll` — the `.catch`
  wrapper only catches promise rejections, not "not a function" throws, so
  this had to become `{ findAll: jest.fn().mockResolvedValue([]) }`). Wired
  `creditCard` into the constructor call in the right position. Added two new
  tests:
  - "includes the card-dues line in the dynamic prompt when a credit account
    has outstanding due" — mocks `accounts.findAll` to return one credit
    account, `creditCard.getSummary` to return an outstanding balance, runs
    `service.runTurn(...)`, and asserts the captured `system[1].text` sent to
    the model contains the expected card-dues line.
  - "omits the card-dues line when no credit account has an outstanding
    balance" — same setup but `outstanding: 0`; asserts the text contains
    `No card dues.`
- `backend/src/ai-chat/tools/accounts.tools.spec.ts` (new file, mirrors
  `events.tools.spec.ts` style): tests `list_accounts`'s handler directly with
  a hand-built `ToolCtx`.
  - Credit account: asserts `creditCard.getSummary` was called with
    `(accountId, userId)` and the returned item has `outstanding`,
    `available`, `minDue`, `dueDate`.
  - Non-credit (savings) account: asserts `getSummary` was NOT called and the
    returned item has no `outstanding`/`available`/`minDue`/`dueDate` keys.

## Verification

- `npx tsc --noEmit`: only the pre-existing known error in
  `src/auth/auth.service.spec.ts:158` (`user.resetTokenExpiresAt` possibly
  null) — unrelated to this change, matches the brief's "ignore known" note.
- `npx jest ai-chat`: 6 suites, 27 tests, all passing.
- `npx jest` (full suite): 40 suites, 175 tests, all passing.

## Files changed

- `backend/src/ai-chat/ai-chat.service.ts`
- `backend/src/ai-chat/ai-chat.service.spec.ts`
- `backend/src/ai-chat/prompt.ts`
- `backend/src/ai-chat/tools/accounts.tools.ts`
- `backend/src/ai-chat/tools/accounts.tools.spec.ts` (new)
- `backend/src/ai-chat/tools/types.ts`
- `backend/src/ai-chat/ai-chat.module.ts`

`mobile/src/theme/tokens.ts` was already modified in the working tree before
this task started (pre-existing, unrelated) and was NOT touched or staged.

## Self-review

- Considered whether `create_account`/`update_account` should also carry card
  fields on their return payload; skipped it — those return the just-created/
  updated account for confirmation display, not a browsing surface, and the
  brief/spec test both frame this around the accounts *list* (`list_accounts`).
  If Munshi needs to confirm card fields right after `create_account`, it can
  follow up with `list_accounts`.
- `formatCardsSection`'s "soonest" pick uses `daysUntilDue` ascending; if two
  cards tie, `Array.prototype.sort` is stable so the first in `cards` order
  wins — order comes from `creditAccounts` iteration order (whatever
  `accountsService.findAll` returns), which is deterministic per user but
  arbitrary across users. Not a correctness issue, just noting it's
  insertion-order-dependent on ties.
- Per-card summary failures are swallowed (`.catch(() => null)`) both in
  prompt assembly and in the accounts tool, consistent with the existing
  pattern of catching at the per-dependency level elsewhere in
  `buildPromptContext`.
