# 8pt Grid Spacing Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's existing deliberate 2px-grid `space` scale with a strictly-typed 8-point grid exposed as named "friendship" tokens in `src/theme/spacing.ts`, migrating all ~494 off-grid call sites + 25 raw literals across ~65 files.

**Architecture:** Add `spacing.ts` (named 8pt tokens `xxs…xxl`) as an *additive* new module. Migrate files directory-group by directory-group, each group compiling green because the legacy `space` object stays in place until the final task removes it. Apply a single Canonical Snap Map (below) everywhere, with per-component "friendship" overrides for the tie cases.

**Tech Stack:** React Native 0.85.3, Expo ~56, TypeScript. RN 0.85 supports `gap`/`rowGap`/`columnGap` in flex containers.

## Global Constraints

- **Base unit = 8** (0.5× the 16px smallest body font). Scale: `xxs:4  xs:8  sm:12  md:16  lg:24  xl:32  xxl:48`.
- **Named tokens only** — code reads `spacing.md`, never `spacing[16]` or raw `16`. Typed `as const` with a `Spacing` type so off-scale values are rejected by the compiler.
- **Canonical Snap Map** (nearest 8pt token; ties resolved to keep `sm=12` rare and inner ≤ outer):
  | legacy | token | legacy | token |
  |---|---|---|---|
  | `space[2]`  | `xxs` | `space[16]` | `md`  |
  | `space[4]`  | `xxs` | `space[18]` | `md`  |
  | `space[6]`  | `xs`* | `space[20]` | `lg`* |
  | `space[8]`  | `xs`  | `space[24]` | `lg`  |
  | `space[10]` | `xs`* | `space[28]` | `lg`* |
  | `space[12]` | `sm`  | `space[32]` | `xl`  |
  | `space[14]` | `md`* | `space[40]` | `xxl`*|
  | `space[0]`  | `0` (keep literal `0`) | `space[48]` | `xxl` |
- **Friendship overrides** (`*` = tie/context; apply only when the semantic clearly calls for it, else use the default above):
  - Best friends (`xs=8`): heading↔subtitle, label↔input, icon↔text.
  - Friends (`md=16`): rows within a card, form fields in a group, button↔content above.
  - Acquaintances (`lg=24`): card internal padding, gaps between cards in a list.
  - Strangers (`xl=32`+): between distinct sections. A `20`/`28` at a true section break → `xl`; a `14` on a tight label pair → `sm`; a `10`/`6` inside a dense chip/badge → `xxs`.
- **Inner ≤ outer** always: content gaps inside a card < card padding < gap between cards. If a snap would violate this within one component, pick the neighboring token that preserves the ordering and note it in the summary.
- **Screen gutter = `md` (16)** for horizontal padding on every screen — no per-screen deviations.
- **Prefer `gap`** on flex containers over stacked `marginTop`+`marginBottom` between siblings where structurally equivalent; do not restructure layout to force it.
- **Spacing-only:** never touch colors, typography, layout structure, or logic. Structural non-rhythm literals stay literal: negative bleed offsets, safe-area/scroll offsets (e.g. `paddingBottom: 110`), `borderRadius` (use `radius`), sizes, positions, font sizes, line heights, and literal `0`.
- **Git:** no `Co-Authored-By` trailer; author `gairola.ashutosh26@gmail.com`; force-add under `docs/`. One commit per screen/component file where practical.

---

### Task 1: Spacing token foundation (additive)

**Files:**
- Create: `mobile/src/theme/spacing.ts`
- Create: `mobile/src/theme/spacing.spec.ts`
- Note: leave `space` in `mobile/src/theme/tokens.ts` untouched for now (removed in final task).

**Interfaces:**
- Produces: `spacing` (object with keys `xxs,xs,sm,md,lg,xl,xxl`), `type Spacing = (typeof spacing)[keyof typeof spacing]`, `type SpacingToken = keyof typeof spacing`. Every later task imports `spacing` from `../theme/spacing` (path depth varies per file).

- [ ] **Step 1: Write `spacing.ts`**

```ts
/**
 * 8-point grid spacing scale — single source of truth for margins,
 * paddings and gaps. Base unit = 8 (0.5× the 16px smallest body font).
 *
 * Named "friendship" tokens encode intent, not just size:
 *   xxs (4)  icon↔label gaps, tightest pairs, dense chip internals
 *   xs  (8)  "best friends" — heading↔subtitle, label↔input, icon↔text
 *   sm  (12) rare — only where 8 is too tight and 16 too loose in dense UI
 *   md  (16) "friends" — rows in a card, fields in a group; default screen gutter
 *   lg  (24) card padding, gaps between sibling cards in a list
 *   xl  (32) section breaks between unrelated groups
 *   xxl (48) screen-level top/bottom breathing room, hero areas
 *
 * `as const` makes this the allow-list: TypeScript rejects any value not on
 * the scale, which is what enforces the 8pt grid going forward.
 */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** A concrete pixel value drawn from the 8pt scale. */
export type Spacing = (typeof spacing)[keyof typeof spacing];

/** A spacing token name (`'md'`, `'lg'`, …). */
export type SpacingToken = keyof typeof spacing;
```

- [ ] **Step 2: Write `spacing.spec.ts`**

```ts
import { spacing } from './spacing';

describe('8pt spacing scale', () => {
  it('every step is a multiple of 4 with 8 as the base unit', () => {
    for (const v of Object.values(spacing)) {
      expect(v % 4).toBe(0);
    }
    expect(spacing.xs).toBe(8);
  });
  it('is strictly ascending xxs→xxl with the exact 8pt ladder', () => {
    expect(Object.values(spacing)).toEqual([4, 8, 12, 16, 24, 32, 48]);
  });
});
```

- [ ] **Step 3: Run the new spec**

Run: `cd mobile && npx jest src/theme/spacing.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors (additive file).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/theme/spacing.ts mobile/src/theme/spacing.spec.ts
git commit -m "feat(mobile): add 8pt-grid spacing token scale (spacing.ts)"
```

---

### Task 2: Spacing audit report

**Files:**
- Create: `docs/superpowers/plans/2026-07-11-8pt-spacing-audit.md`

**Interfaces:**
- Produces: the authoritative per-file inventory of every off-grid `space[N]` call site and raw literal, each with its proposed token and any friendship override. Every migration task (3–10) consults its section here for the ambiguous sites.

- [ ] **Step 1: Generate the report** containing, grouped by file: (a) count of each off-grid token `space[2/6/10/14/18/20/28]`, (b) the raw-literal list (see `feedback/FeedbackProvider.tsx`, and structural keeps like `StatementReviewScreen paddingBottom:110`), (c) flagged tie-sites where the default snap is overridden, (d) flagged sibling-inconsistencies (e.g. list-row gap `12` vs `16` across screens for the same pattern). Use the counts already gathered in this session as the seed.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-07-11-8pt-spacing-audit.md
git commit -m "docs(mobile): spacing audit report for 8pt migration"
```

---

## Migration tasks (3–10) — shared procedure

Every migration task follows the identical per-file loop. **Do not restate — apply this procedure to each file the task lists.**

1. Read the file. Replace the `tokens` import so `space` is dropped and `spacing` added, e.g.
   `import { radius, space, weight } from '../theme/tokens';`
   → `import { radius, weight } from '../theme/tokens';` **plus** `import { spacing } from '../theme/spacing';`
   (keep `radius`/`weight`/etc.; adjust `../` depth to the file).
2. Replace every `space[N]` per the Canonical Snap Map → `spacing.<token>`. For `*` tie-values, apply the friendship default unless the audit flags an override for that site.
3. Replace raw numeric `padding*/margin*/gap/rowGap/columnGap` literals per the same map. Keep literal `0` and structural offsets (see Global Constraints).
4. Where a component stacks `marginTop`+`marginBottom` between flex siblings, prefer a single `gap` on the parent — only if structurally equivalent (no layout change).
5. Enforce inner ≤ outer within the component; note any deviation in the commit body.
6. Typecheck the app: `cd mobile && npx tsc --noEmit` → no new errors (legacy `space` still exists, so untouched files stay green).
7. Commit per file: `git commit -m "refactor(mobile): 8pt spacing — <file>"`.

Green invariant: because `space` remains in `tokens.ts` until Task 11, every task compiles independently.

---

### Task 3: Shared components + theme

**Files (apply shared procedure to each):**
`components/ui.tsx` (11), `components/charts.tsx` (4), `components/BottomSheet.tsx` (3), `components/CalendarPicker.tsx` (4), `components/CalendarRangePicker.tsx` (4), `components/FormSheet.tsx` (6), `components/IconPickerSheet.tsx` (4), `components/MSeg.tsx` (1), `components/SourceTag.tsx` (1), `components/Glass.tsx` (padding literal noted in comment — verify actual style), `theme/tokens.ts` (1 — the lone `space[14]` in a comment/example; migrate or leave if comment-only).

- [ ] **Step 1:** Apply the shared per-file procedure to every file above. `ui.tsx` is the highest-fanout file (shared primitives) — get its friendship tokens right first; sibling screens inherit its rhythm.
- [ ] **Step 2:** `cd mobile && npx tsc --noEmit` → clean.
- [ ] **Step 3:** Commit each file (per shared procedure).

---

### Task 4: App shell + sheets

**Files:** `app/AddTxSheet.tsx` (20), `app/PayBillSheet.tsx` (7), `app/MoreSheet.tsx` (5), `app/ProfileSheet.tsx` (4), `app/CardSetupSheet.tsx` (3), `app/TabBar.tsx` (3 + `marginTop:0`), `app/FabActions.tsx` (1), `app/NavBar.tsx` (`gap:0` literal — keep), `app/useStatementImportLauncher.tsx` (1).

- [ ] **Step 1:** Apply shared procedure to each. `AddTxSheet` is the largest sheet — treat its form-field group with `md`, label↔input with `xs`.
- [ ] **Step 2:** `npx tsc --noEmit` → clean.
- [ ] **Step 3:** Commit per file.

---

### Task 5: Core screens

**Files:** `screens/Home.tsx` (22), `screens/Reports.tsx` (24), `screens/Accounts.tsx` (9), `screens/Budgets.tsx` (10), `screens/Txns.tsx` (7), `screens/TxDetail.tsx` (8), `screens/TxCategories.tsx` (7), `screens/Search.tsx` (7 + `padding:0` keep), `screens/Settings.tsx` (7), `screens/Invest.tsx` (7), `screens/Notifications.tsx` (4), `screens/MonitoredApps.tsx` (2), `screens/BackendUrlCard.tsx` (4), `screens/_MPageShell.tsx` (1).

- [ ] **Step 1:** Apply shared procedure. Enforce the `md` screen gutter on every screen's outer horizontal padding; the summary-header ↔ list ↔ Munshi-entry breaks are `xl` strangers.
- [ ] **Step 2:** `npx tsc --noEmit` → clean.
- [ ] **Step 3:** Commit per file.

---

### Task 6: Detail / card / statement / sync screens

**Files:** `screens/CardDetail.tsx` (19), `screens/AccountDetail.tsx` (6), `screens/CategoryDetail.tsx` (6), `screens/SubDetailSheet.tsx` (15), `screens/SubscriptionsScreen.tsx` (15), `screens/SubscriptionsReview.tsx` (8 + `padding:0` keep), `screens/StatementReviewScreen.tsx` (11 + `paddingBottom:110` keep as structural), `screens/Sync.tsx` (10), `screens/DetectedCard.tsx` (5), `screens/ChatTxCard.tsx` (5), `screens/SwipeRow.tsx` (3).

- [ ] **Step 1:** Apply shared procedure. Note `Sync.tsx`'s comment referencing `DetectedCard marginBottom:12` — keep the two consistent (`sm`).
- [ ] **Step 2:** `npx tsc --noEmit` → clean.
- [ ] **Step 3:** Commit per file.

---

### Task 7: Chat

**Files:** `screens/Chat.tsx` (24), `screens/chat/WidgetRenderer.tsx` (12), `screens/chat/ConfirmationCard.tsx` (5), `screens/chat/ThreadsSheet.tsx` (4), `screens/chat/ToolStatusChip.tsx` (1).

- [ ] **Step 1:** Apply shared procedure. `ToolStatusChip` is a dense chip → `xxs` internal is allowed.
- [ ] **Step 2:** `npx tsc --noEmit` → clean.
- [ ] **Step 3:** Commit per file.

---

### Task 8: Events

**Files:** `screens/events/CreateEventSheet.tsx` (15), `screens/events/EventItemSheet.tsx` (13), `screens/events/Events.tsx` (10), `screens/events/EventDetail.tsx` (7), `screens/events/ExpenseRow.tsx` (5 + two `padding:0` keep), `screens/events/ExpenseDragList.tsx` (4).

- [ ] **Step 1:** Apply shared procedure. Keep `ExpenseRow` and `ExpenseDragList` row rhythm identical (same list pattern).
- [ ] **Step 2:** `npx tsc --noEmit` → clean.
- [ ] **Step 3:** Commit per file.

---

### Task 9: Auth

**Files:** `screens/auth/Signup.tsx` (9), `screens/auth/Welcome.tsx` (7), `screens/auth/authUi.tsx` (7 + `paddingBottom:0` keep), `screens/auth/AuthFlow.tsx` (6), `screens/auth/Login.tsx` (5), `screens/auth/LockScreen.tsx` (4), `screens/auth/ResetPassword.tsx` (2).

- [ ] **Step 1:** Apply shared procedure. `authUi.tsx` holds the shared auth primitives — set its tokens first, other auth screens inherit.
- [ ] **Step 2:** `npx tsc --noEmit` → clean.
- [ ] **Step 3:** Commit per file.

---

### Task 10: Onboarding + home strip + feedback

**Files:** `screens/onboarding/steps.tsx` (24), `screens/onboarding/obUi.tsx` (9), `screens/onboarding/Done.tsx` (6), `screens/home/AiInsightsStrip.tsx` (3), `feedback/FeedbackProvider.tsx` (raw literals: `paddingHorizontal:18→md`, `paddingVertical:11→sm`, `paddingVertical:14→md`, `paddingBottom:10→xs`, `gap:13→sm`, `gap:8→xs`, `marginTop:6→xs`, `marginBottom:8→xs`, `marginLeft:4→xxs`, `paddingHorizontal:16→md`; keep `gap:0`).

- [ ] **Step 1:** Apply shared procedure. `obUi.tsx` holds shared onboarding primitives — set first.
- [ ] **Step 2:** `npx tsc --noEmit` → clean.
- [ ] **Step 3:** Commit per file.

---

### Task 11: Retire the legacy `space` scale + final verification

**Files:**
- Modify: `mobile/src/theme/tokens.ts` (remove `space` object + `Space` type + their doc block)
- Modify: `mobile/src/theme/tokens.spec.ts` (remove the `describe('spacing scale', …)` block asserting the 2px grid; keep the liquid-glass block)

**Interfaces:**
- Consumes: confirmation that zero `space[` references remain in `src/`.

- [ ] **Step 1: Verify no remaining references**

Run: `cd mobile && grep -rn "space\[" src --include='*.tsx' --include='*.ts' | grep -v spacing.spec`
Expected: no output. If any remain, migrate them (loop back to the owning task) before continuing.

- [ ] **Step 2: Remove `space` + `Space`** from `tokens.ts` (lines 128–164 block) and remove the now-dead `space` import wherever unused.

- [ ] **Step 3: Update `tokens.spec.ts`** — delete the `describe('spacing scale', …)` block (it asserts the retired 2px grid); the 8pt grid is now covered by `spacing.spec.ts`.

- [ ] **Step 4: Full verification**

Run: `cd mobile && npx tsc --noEmit && npx jest src/theme`
Expected: tsc clean; jest green.

- [ ] **Step 5: Emulator eyeball** — build/run and visually check representative screens (Home, Reports, Chat, a detail sheet, auth, onboarding) for broken rhythm or inner>outer regressions. (May require the user to drive the emulator; flag if unavailable.)

- [ ] **Step 6: Commit**

```bash
git add mobile/src/theme/tokens.ts mobile/src/theme/tokens.spec.ts
git commit -m "refactor(mobile): retire legacy 2px space scale; 8pt grid is source of truth"
```

---

## Self-Review

- **Spec coverage:** Step 1 (create `spacing.ts`, typed `Spacing`) → Task 1. Step 2 (audit, off-grid flags, sibling inconsistencies) → Task 2. Step 3 (refactor with friendship hierarchy, all screens/components, no off-scale values, inner ≤ outer, `md` gutter, prefer `gap`) → Tasks 3–10 + Global Constraints. Step 4 (tsc + emulator) → per-task tsc + Task 11 verification. ✓
- **Placeholder scan:** Snap decisions are concrete (Canonical Snap Map); ambiguous sites are resolved by named friendship rules + the audit, not "handle appropriately." ✓
- **Type consistency:** `spacing` / `Spacing` / `SpacingToken` names used identically in Task 1 and all consumers. ✓
- **Green invariant:** legacy `space` retained through Task 10, removed only in Task 11 after zero references verified. ✓
