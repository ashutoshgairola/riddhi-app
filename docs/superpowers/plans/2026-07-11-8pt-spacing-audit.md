# Spacing Audit — 8pt Grid Migration (2026-07-11)

Baseline snapshot at commit `bfb6457`, before any migration. This is the authoritative inventory the per-screen migration tasks (3–10) consult for ambiguous/override sites.

## Summary

- The app was **already fully tokenized** on a deliberate **2px-grid** `space` scale (`mobile/src/theme/tokens.ts`), used across **68 files (~950 call sites)**. Only **25 raw numeric spacing literals** remain outside the scale (mostly in `feedback/FeedbackProvider.tsx`).
- The migration target is a strict **8pt grid** (`xxs:4 xs:8 sm:12 md:16 lg:24 xl:32 xxl:48`, see `spacing.ts`).
- **~494 call sites** use tokens that are OFF the 8pt grid (`space[2/6/10/14/18/20]`, plus a few `space[28/40]`) and must be re-snapped.

### Off-grid token totals (whole app)

| token | uses | default snap | tie? |
|------:|-----:|:-------------|:-----|
| `space[2]`  | 72  | `xxs` (4)  | no  |
| `space[6]`  | 74  | `xs` (8)   | tie 4/8 |
| `space[10]` | 125 | `xs` (8)   | tie 8/12 → default 8 to keep `sm` rare |
| `space[14]` | 153 | `md` (16)  | tie 12/16 |
| `space[18]` | 41  | `md` (16)  | no |
| `space[20]` | 29  | `lg` (24)  | tie 16/24 |
| `space[28]` | 23  | `lg` (24)  | tie 24/32 |
| `space[40]` | 1   | `xxl` (48) | tie 32/48 |

On-grid tokens that map 1:1 (no visual change): `space[4]→xxs`, `space[8]→xs`, `space[12]→sm`, `space[16]→md`, `space[24]→lg`, `space[32]→xl`, `space[48]→xxl`, `space[0]→literal 0`.

## Canonical Snap Map + friendship overrides

See the plan's Global Constraints (`2026-07-11-8pt-spacing-migration.md`). Tie-values (`*`) take the default unless a component's semantic clearly calls for the neighbor:
- `14→sm` for a tight label↔value pair; `14→md` for row/section gaps (default).
- `10→xxs` inside a dense chip/badge; `10→sm` where 8 is visibly too tight; else `xs` (default).
- `6→xxs` for icon↔label; else `xs` (default).
- `20`/`28→xl` at a true section break (strangers); else `lg` (default).

## Per-file off-grid inventory

Counts of each off-grid token per file (`2 / 6 / 10 / 14 / 18 / 20`, TOTAL). Files not listed have zero off-grid tokens.

| file | 2 | 6 | 10 | 14 | 18 | 20 | total |
|------|--:|--:|---:|---:|---:|---:|------:|
| app/AddTxSheet.tsx | 6 | 2 | 5 | 5 | 1 | 1 | 20 |
| app/CardSetupSheet.tsx | 0 | 1 | 0 | 2 | 0 | 0 | 3 |
| app/FabActions.tsx | 0 | 0 | 1 | 0 | 0 | 0 | 1 |
| app/MoreSheet.tsx | 2 | 0 | 2 | 1 | 0 | 0 | 5 |
| app/PayBillSheet.tsx | 1 | 1 | 2 | 2 | 1 | 0 | 7 |
| app/ProfileSheet.tsx | 0 | 1 | 0 | 2 | 0 | 1 | 4 |
| app/TabBar.tsx | 0 | 1 | 1 | 1 | 0 | 0 | 3 |
| app/useStatementImportLauncher.tsx | 0 | 0 | 0 | 1 | 0 | 0 | 1 |
| components/BottomSheet.tsx | 0 | 1 | 1 | 1 | 0 | 0 | 3 |
| components/CalendarPicker.tsx | 0 | 1 | 2 | 1 | 0 | 0 | 4 |
| components/CalendarRangePicker.tsx | 0 | 1 | 2 | 1 | 0 | 0 | 4 |
| components/FormSheet.tsx | 0 | 1 | 3 | 2 | 0 | 0 | 6 |
| components/IconPickerSheet.tsx | 0 | 1 | 1 | 2 | 0 | 0 | 4 |
| components/MSeg.tsx | 0 | 0 | 1 | 0 | 0 | 0 | 1 |
| components/SourceTag.tsx | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| components/charts.tsx | 1 | 3 | 0 | 0 | 0 | 0 | 4 |
| components/ui.tsx | 0 | 2 | 1 | 5 | 2 | 1 | 11 |
| screens/AccountDetail.tsx | 1 | 1 | 1 | 2 | 1 | 0 | 6 |
| screens/Accounts.tsx | 3 | 1 | 0 | 4 | 0 | 1 | 9 |
| screens/BackendUrlCard.tsx | 0 | 0 | 3 | 0 | 1 | 0 | 4 |
| screens/Budgets.tsx | 2 | 1 | 4 | 0 | 2 | 1 | 10 |
| screens/CardDetail.tsx | 4 | 5 | 1 | 8 | 0 | 1 | 19 |
| screens/CategoryDetail.tsx | 0 | 0 | 3 | 2 | 0 | 1 | 6 |
| screens/Chat.tsx | 0 | 4 | 8 | 10 | 2 | 0 | 24 |
| screens/ChatTxCard.tsx | 2 | 0 | 1 | 2 | 0 | 0 | 5 |
| screens/DetectedCard.tsx | 2 | 0 | 1 | 2 | 0 | 0 | 5 |
| screens/Goals.tsx | 1 | 0 | 1 | 3 | 2 | 0 | 7 |
| screens/Home.tsx | 4 | 1 | 2 | 10 | 3 | 2 | 22 |
| screens/Invest.tsx | 2 | 2 | 1 | 0 | 1 | 1 | 7 |
| screens/MonitoredApps.tsx | 1 | 0 | 0 | 0 | 0 | 1 | 2 |
| screens/Notifications.tsx | 0 | 0 | 2 | 2 | 0 | 0 | 4 |
| screens/Reports.tsx | 3 | 4 | 8 | 5 | 4 | 0 | 24 |
| screens/Search.tsx | 1 | 0 | 1 | 2 | 3 | 0 | 7 |
| screens/Settings.tsx | 1 | 1 | 0 | 2 | 2 | 1 | 7 |
| screens/StatementReviewScreen.tsx | 1 | 0 | 3 | 5 | 2 | 0 | 11 |
| screens/SubDetailSheet.tsx | 1 | 1 | 6 | 6 | 1 | 0 | 15 |
| screens/SubscriptionsReview.tsx | 1 | 2 | 2 | 3 | 0 | 0 | 8 |
| screens/SubscriptionsScreen.tsx | 7 | 1 | 2 | 4 | 0 | 1 | 15 |
| screens/SwipeRow.tsx | 1 | 1 | 0 | 1 | 0 | 0 | 3 |
| screens/Sync.tsx | 3 | 2 | 1 | 2 | 0 | 2 | 10 |
| screens/TxCategories.tsx | 1 | 1 | 3 | 2 | 0 | 0 | 7 |
| screens/TxDetail.tsx | 0 | 3 | 1 | 3 | 1 | 0 | 8 |
| screens/Txns.tsx | 0 | 0 | 2 | 1 | 2 | 2 | 7 |
| screens/_MPageShell.tsx | 0 | 0 | 0 | 0 | 1 | 0 | 1 |
| screens/auth/AuthFlow.tsx | 0 | 2 | 2 | 0 | 0 | 2 | 6 |
| screens/auth/LockScreen.tsx | 0 | 1 | 1 | 2 | 0 | 0 | 4 |
| screens/auth/Login.tsx | 0 | 1 | 2 | 0 | 1 | 1 | 5 |
| screens/auth/ResetPassword.tsx | 0 | 1 | 0 | 1 | 0 | 0 | 2 |
| screens/auth/Signup.tsx | 2 | 2 | 3 | 0 | 0 | 2 | 9 |
| screens/auth/Welcome.tsx | 1 | 1 | 3 | 2 | 0 | 0 | 7 |
| screens/auth/authUi.tsx | 0 | 0 | 2 | 3 | 1 | 1 | 7 |
| screens/chat/ConfirmationCard.tsx | 0 | 2 | 2 | 1 | 0 | 0 | 5 |
| screens/chat/ThreadsSheet.tsx | 0 | 1 | 1 | 2 | 0 | 0 | 4 |
| screens/chat/ToolStatusChip.tsx | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| screens/chat/WidgetRenderer.tsx | 1 | 3 | 6 | 2 | 0 | 0 | 12 |
| screens/events/CreateEventSheet.tsx | 2 | 1 | 4 | 6 | 2 | 0 | 15 |
| screens/events/EventDetail.tsx | 0 | 0 | 2 | 4 | 1 | 0 | 7 |
| screens/events/EventItemSheet.tsx | 3 | 1 | 3 | 6 | 0 | 0 | 13 |
| screens/events/Events.tsx | 0 | 1 | 3 | 3 | 2 | 1 | 10 |
| screens/events/ExpenseDragList.tsx | 1 | 1 | 2 | 0 | 0 | 0 | 4 |
| screens/events/ExpenseRow.tsx | 2 | 1 | 0 | 2 | 0 | 0 | 5 |
| screens/home/AiInsightsStrip.tsx | 0 | 2 | 1 | 0 | 0 | 0 | 3 |
| screens/onboarding/Done.tsx | 1 | 0 | 2 | 2 | 0 | 1 | 6 |
| screens/onboarding/obUi.tsx | 1 | 1 | 3 | 2 | 1 | 1 | 9 |
| screens/onboarding/steps.tsx | 5 | 4 | 4 | 7 | 1 | 3 | 24 |
| theme/tokens.ts | 0 | 0 | 0 | 1 | 0 | 0 | 1 |

## Raw (non-token) numeric spacing literals

| file:line | literal | action |
|-----------|---------|--------|
| feedback/FeedbackProvider.tsx:339,345,372 | `gap: 8` | → `spacing.xs` |
| feedback/FeedbackProvider.tsx:346 | `paddingHorizontal: 18` | → `spacing.md` |
| feedback/FeedbackProvider.tsx:347 | `paddingVertical: 11` | → `spacing.sm` |
| feedback/FeedbackProvider.tsx:373 | `paddingBottom: 10` | → `spacing.xs` |
| feedback/FeedbackProvider.tsx:378 | `gap: 13` | → `spacing.sm` |
| feedback/FeedbackProvider.tsx:379 | `paddingHorizontal: 16` | → `spacing.md` |
| feedback/FeedbackProvider.tsx:380 | `paddingVertical: 14` | → `spacing.md` |
| feedback/FeedbackProvider.tsx:393 | `marginTop: 6` | → `spacing.xs` |
| feedback/FeedbackProvider.tsx:399 | `marginBottom: 8` | → `spacing.xs` |
| feedback/FeedbackProvider.tsx:400 | `marginLeft: 4` | → `spacing.xxs` |

### Structural literals to KEEP (not rhythm spacing — do not touch)

| file:line | literal | why keep |
|-----------|---------|----------|
| app/NavBar.tsx:177 | `gap: 0` | intentional no-gap |
| app/TabBar.tsx:217 | `marginTop: 0` | reset |
| screens/StatementReviewScreen.tsx:363 | `paddingBottom: 110` | scroll/FAB safe-area clearance |
| screens/Search.tsx:230, SubscriptionsReview.tsx:357, events/ExpenseRow.tsx:115,118, auth/authUi.tsx:301 | `padding: 0` / `paddingBottom: 0` | resets |

## Sibling-consistency flags (resolve during migration)

- **List-row internal gaps** vary across screens for the same visual pattern (mix of `space[10]`/`space[12]`/`space[14]`). Post-migration these must land on one token per pattern: `md` for card-row spacing, `xs` for label↔value pairs. Watch `Accounts` vs `Txns` vs `Budgets` vs `events/ExpenseRow` list rows.
- **Sheet padding**: sheets (`AddTxSheet`, `PayBillSheet`, `SubDetailSheet`, `EventItemSheet`) should share one card/sheet padding token (`lg`).
- **Shared primitives first**: `components/ui.tsx`, `screens/auth/authUi.tsx`, `screens/onboarding/obUi.tsx` are inherited by their sibling screens — snap these first so children inherit consistent rhythm.
- **DetectedCard ↔ Sync**: `Sync.tsx` comment references `DetectedCard marginBottom:12`; keep both on `sm`.
