# Vendor Mappings — set-once merchant rules for auto-sync

**Date:** 2026-07-16
**Status:** Approved

## Problem

Synced detections carry the payee descriptor banks/receipts use ("True Software
Scandinavia AB", "Google Play"), not the service the user knows ("Truecaller").
Every renewal lands in the review queue and needs the same manual rename +
categorize. The user wants to set the rule once during review and have every
future payment to that vendor sync automatically — correct name, correct
category, no review — for both transactions and subscriptions.

## Decision summary

Server-side per-user vendor mappings, applied inside the notification-sync
analysis pipeline. Client-side storage was rejected (the analysis cron runs
server-side; auto-confirm must work with the app closed). LLM-prompt feedback
was rejected (non-deterministic; the user wants a hard rule).

## Data model

New entity `vendor_mapping` in the existing `notification-sync` module:

| column        | type                | notes                                        |
|---------------|---------------------|----------------------------------------------|
| `id`          | uuid PK             |                                              |
| `userId`      | uuid, FK users      | CASCADE delete                               |
| `matchKey`    | varchar             | normalized merchant descriptor               |
| `displayName` | varchar             | e.g. "Truecaller"                            |
| `categoryId`  | uuid, FK categories | applied to auto-confirmed transactions       |
| `createdAt` / `updatedAt` | timestamptz |                                          |

Unique index on `(userId, matchKey)`.

`matchKey` = `normalizeDescriptor(merchant)` — reuse the pure function already
exported by `backend/src/subscriptions/detect-subscriptions.ts` (lowercases,
strips long refs and rail words like upi/mandate/autopay). It is imported
directly (pure module, no Nest wiring, no circular dependency).

The key is whatever merchant string the LLM extracted for the detection the
user created the rule from. If the same vendor later surfaces under a different
descriptor (bank SMS says "Google Play", receipt says "True Software
Scandinavia AB"), that's a second rule the user creates the same way.

## Creating a mapping (review flow)

- `ConfirmDetectedDto` gains optional `remember?: boolean`.
- Mobile: the Sync screen's "Edit detection" FormSheet gains a "Remember this
  vendor" switch (off by default). When on, confirm sends `remember: true`.
- Backend `confirm()` with `remember: true`:
  1. Upserts the mapping: `matchKey = normalizeDescriptor(det.merchant)`,
     `displayName = dto.description`, `categoryId = dto.categoryId`.
     (No-op when `det.merchant` is null/normalizes to empty.)
  2. Sweeps the current pending queue: every other PENDING detection of this
     user whose normalized merchant equals `matchKey` **and** whose `accountId`
     resolved is confirmed on the spot through the same confirm path
     (description = displayName, categoryId from mapping, date = `postedAt` ??
     now, notes defaulted from source captures as today). Unresolved-account
     matches stay pending.

## Auto-apply on sync

In `runAnalysisForUser`, after payment-source resolution and the existing
reverse-dedup check, look up the mapping by `normalizeDescriptor(g.merchant)`:

- **Match + `accountId` resolved** → create the transaction immediately
  (description = `displayName`, category = mapping's `categoryId`, date =
  `postedAt` ?? now, notes = source notification text, paymentMethod/type from
  the detection). Save the detection with `status = CONFIRMED` and
  `transactionId` set — it never appears in the review queue but remains as an
  audit row.
- **Match + account unresolved** → save the detection PENDING but pre-filled:
  `merchant = displayName`, `suggestedCategory` = mapping category's name. The
  user only has to pick the account.
- **No match** → unchanged behavior.

Auto-confirmed detections are excluded from the "New transactions to review"
push notification count (only still-pending ones are announced).

Reverse-dedup keeps running before auto-confirm, so a charge already imported
from a statement is still skipped, not double-entered.

## Subscriptions

No subscription-specific mapping logic. Auto-confirmed transactions carry the
mapped description, so:

- `TRANSACTION_CREATED` → existing `SubscriptionsListener.attachTransaction`
  attributes the charge to the matching subscription (autopay/recurring only,
  as today).
- `detect-subscriptions` groups future candidates under the mapped descriptor
  ("truecaller"), so the surfaced subscription gets the right name, and its
  transactions the right category.

Pre-existing subscriptions keyed on the old descriptor ("google play") are not
renamed retroactively; the user can edit them as today.

## Manage UI (view/edit/delete)

- Endpoints on the existing notification-sync controller:
  - `GET /notification-sync/vendor-mappings` — list (id, matchKey, displayName,
    categoryId).
  - `PATCH /notification-sync/vendor-mappings/:id` — update `displayName`
    and/or `categoryId` (matchKey immutable; recreate to change it).
  - `DELETE /notification-sync/vendor-mappings/:id`.
- Mobile: a "Vendor rules" row on the Sync screen opens a list screen — one row
  per mapping (displayName, category chip, matchKey as caption), tap to edit
  name/category via the existing FormSheet pattern, swipe/button to delete.
- Editing a mapping affects future syncs only; already-created transactions are
  not rewritten.

## Error handling

- Mapping upsert races (two confirms with `remember`) resolved by the unique
  index: `ON CONFLICT (userId, matchKey) DO UPDATE`.
- A mapping whose `categoryId` was deleted: FK is `ON DELETE CASCADE` on the
  mapping row (a rule without its category is meaningless; vendor falls back to
  normal review).
- Amount is never part of the rule — price hikes still auto-sync.

## Testing

- Unit: matchKey normalization round-trips the real descriptors ("True Software
  Scandinavia AB", "Google Play" with ref numbers).
- Service specs (pattern of existing `notification-sync.service.spec.ts`):
  - confirm with `remember: true` upserts mapping + sweeps pending same-key
    resolved-account detections.
  - analysis pass auto-confirms a mapped detection (transaction created,
    detection CONFIRMED, excluded from notification count).
  - mapped detection with unresolved account stays PENDING pre-filled.
  - reverse-dedup still suppresses a mapped duplicate.
- Mobile: `applyDetectedEdit`-style pure-function specs for any new merge
  logic; manual verify of the switch + Vendor rules screen.
