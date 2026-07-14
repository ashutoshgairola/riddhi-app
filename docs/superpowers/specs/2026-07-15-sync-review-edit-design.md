# Editable Needs-review items on Auto-sync — Design

**Date:** 2026-07-15
**Status:** Approved

## Problem

On the Auto-sync page, "Needs review" cards (backend-detected transactions from
notification/SMS capture) can only be confirmed as-is or ignored. Detection is
imperfect — merchant names are raw payee strings, category is often
Uncategorized, the account may be unresolved — so users need to fix
name/category/account/amount/date/type *before* tapping Add transaction.

## Scope

Mobile only. No backend change: `confirmDetected` (`POST
/notification-sync/detected/:id/confirm` via `lib/notificationSync.ts`) already
accepts `date`, `description`, `amount`, `type`, `categoryId`, `accountId`,
`paymentMethod`. Edits are client-side patches to the `detected` state array in
`Sync.tsx`; the card display (`toDetectedCardTx`) and the confirm payload
(`confirmDetectedItem`) both already derive from that array, so edited values
flow through with no other changes.

## Design

### DetectedCard (`mobile/src/screens/DetectedCard.tsx`)

Three edit surfaces, two new optional props: `onEdit(id)` and
`onEditCategory(id)`.

1. **Actions row becomes three buttons:** Ignore | ✏️ Edit | ✓ Add transaction.
   Edit is the visible affordance; it calls `onEdit`.
2. **Card body tap** (parsed row + raw source row wrapped in a Pressable) also
   calls `onEdit`.
3. **Category chip tap** calls `onEditCategory`.

Confirm/dismiss slide+collapse animation unchanged.

### Sync (`mobile/src/screens/Sync.tsx`)

- Load accounts once: `useApiData(() => api.accounts.list(), EMPTY_ACCOUNTS)` —
  needed for the Account select.
- `editDetectedItem(id)` — opens the existing `useFeedback().form` sheet (same
  FormSheet TxDetail's Edit uses), prefilled from the `DetectedView`:
  - Description (text) — merchant
  - Amount (₹) (amount kind) — absolute value
  - Category (select of the user's categories)
  - Account (select: "Unlinked" (empty value) + real accounts)
  - Date (date kind) — from `postedAt`
  - Type (select: Expense / Income)

  On submit, patch the item in `detected` via `applyDetectedEdit`.
- `openDetectedCategoryPicker(id)` — `useFeedback().sheet` listing all
  categories (current one marked selected) plus a **"New category…"** option
  that opens a one-field form — exactly StatementReview's `openCategoryPicker`
  pattern. Picking/typing a name patches `suggestedCategory` on the item.
  `api.categories.resolveId` at confirm time already creates any brand-new
  name server-side.

### Edit merge (`mobile/src/lib/notificationSync.ts`)

Pure `applyDetectedEdit(d: DetectedView, values: Record<string, string>):
DetectedView` — maps form values back onto the view: `merchant`, `amount`
(absolute), `type`, `suggestedCategory`, `accountId` (empty string →
undefined), and `postedAt` (replaces the date part, keeps the original
time-of-day when present). Unit-tested in the existing
`notificationSync.spec.ts`.

## Out of scope / skipped

- Backend persistence of edits before confirm (edits live in client state;
  navigating away discards them — acceptable, confirm is the very next tap).
- Editing `paymentMethod` (detection is reliable for it; add if asked).
- Inline pickers for account/name on the card (the form covers them).
