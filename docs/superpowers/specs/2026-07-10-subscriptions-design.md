# Slice D — Subscriptions · Design

**Date:** 2026-07-10
**Branch:** `feat/riddhi-build`
**Status:** Design approved; plan pending.
**Prior slices:** A (payment-source), B (credit-card mgmt), C (statement import) and the
B/C follow-up batch are BUILT. This is the fourth money-management slice.

## Summary

Subscriptions are first-class, **auto-detected from recurring debits already in Riddhi**
(transactions + SMS/statement-imported charges). Riddhi surfaces monthly burn, a yearly
projection, an upcoming-renewal timeline, price-hike / renewal-soon / possibly-forgotten
flags, and per-subscription pause / cancel / renewal-reminder controls.

**Hard exclusions (decided):** NO Gmail parsing, NO Google Play API (Google exposes no
public API for a user's Play subscriptions). Detection reads only money-movement data
Riddhi already holds. Frame the feature as "auto-detect subscriptions," never "Play sync."

## Key decisions (locked in brainstorming)

1. **Detect → confirm → persist.** A pure deterministic detector surfaces *candidates* in a
   review UI (reusing the app's established SMS-sync / statement-import "review then add"
   pattern). The user confirms; confirmed candidates become persisted `Subscription` rows.
   Manual add is also allowed. Burn / upcoming / flags read the persisted rows.
2. **Deterministic grouping for the judgment; catalog-first naming with a thin LLM fallback
   for display polish only.** The decision "is this a subscription?" is fully deterministic
   and unit-tested (matches Slice C's "LLM parses, never judges" philosophy). Naming/emoji
   come from the `contentIcons` merchant catalog; an unknown descriptor may trigger an
   optional Claude call that resolves **display name + emoji only**, with graceful fallback
   to the cleaned descriptor if the call fails or is unavailable. The LLM never decides
   whether something is a subscription.
3. **Flags = price-hike + renewal-soon + a conservative possibly-forgotten nudge.** The
   prototype's "unused" flag needs app-usage data Riddhi does not have (we only see money
   movement, never whether you opened Netflix). Price-hike and renewal-soon are cleanly
   derivable. "Possibly-forgotten" is an honest reframe: a soft nudge on the strongest case
   only (a costly sub whose detail the user has never opened), worded "still paying for
   this?" — never a false "unused" claim.
4. **Live renewal reminders via the existing notifications/push module.** A per-sub
   `reminderDays` setting plus a daily scheduled check emits a real notification when a
   renewal approaches. Reuses `notifications.scheduler.ts` (already `@Cron` daily 9am IST)
   and the existing push dispatch — no new scheduler infrastructure.
5. **Investment SIPs deliberately excluded** from detection. SIPs are recurring debits but
   not subscriptions; excluded by category/type. There is a separate `investments` module.
6. **Aggregator billing is first-class** (learned from real notifications, 2026-07-10). A bank
   UPI-mandate SMS names the aggregator ("Google Play"), not the service ("Truecaller"), so
   detection amount-clusters within a descriptor group and naming enriches from the captured
   Play/Gmail notification when available, else stays generic + user-editable. See §2.
7. **`paymentMethod === 'autopay'` is the recurring signal**, already populated by the parse
   layer — not the unpopulated `isRecurring` boolean. No parse-layer changes needed.

## 1. Data model

New backend module `subscriptions/` mirroring the `credit-card/` layout (entity + pure
compute fns with specs + service + controller + module + dtos). `synchronize: true` means
new entities and nullable columns need **no migration**.

### `Subscription` entity

| field | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `userId` | uuid FK (`onDelete: CASCADE`) | |
| `name` | varchar | display name (catalog / LLM-resolved) |
| `merchantDescriptor` | varchar | normalized matcher key (see §2) |
| `emoji` | varchar | from `contentIcons` catalog |
| `color` | varchar | from `contentIcons` catalog |
| `amount` | numeric(18,2) | current per-cycle charge |
| `cycle` | enum `monthly \| yearly` | |
| `nextRenewalDate` | date | predicted from last charge + cadence |
| `firstSeenDate` | date | "since" (earliest matched charge) |
| `status` | enum `active \| paused \| cancelled` | default `active` |
| `accountId` | uuid FK nullable (`SET NULL`) | payment source (bank/card) |
| `paymentMethod` | enum `PaymentMethod` nullable | reuses the existing enum (upi/card/ach…) |
| `categoryId` | uuid FK nullable (`SET NULL`) | defaults to the `Subscriptions` category |
| `reminderDays` | int nullable | null = reminders off; e.g. `2` = 2 days before |
| `priceHistory` | jsonb nullable | `[{ amount, since }]` → powers the hike flag |
| `detailOpenedAt` | timestamptz nullable | set the first time the user opens the detail sheet; feeds the possibly-forgotten flag |
| `lastReminderSentFor` | date nullable | idempotency guard for the daily reminder cron |
| `createdAt` / `updatedAt` | timestamptz | |

### Transaction linkage

`Transaction` gains a nullable `subscriptionId` FK (same pattern as the existing nullable
`accountId` / `importFingerprint` columns; no migration). It is set:
- on confirm — back-links the matched historical charges to the new subscription;
- on future matches — SMS/statement-imported recurring charges attribute to an existing
  subscription (see §6).

This linkage lets us (a) recompute `amount` / `nextRenewalDate` / `priceHistory` from real
charges, (b) attribute incoming charges, (c) render a per-subscription ledger.

## 2. Detection (pure, deterministic)

`subscriptions/detect-subscriptions.ts` — pure `detectSubscriptions(transactions, existingSubs, today)
→ SubscriptionCandidate[]`, unit-tested like `card-summary.ts`.

- Consider only **expenses**. Exclude transfers, income, and investment SIPs (by
  category/type) — a deliberate call, documented.
- Group by **normalized merchant descriptor + payment source**. Normalization strips
  trailing reference numbers, dates, city/terminal suffixes, and case — enough to collapse
  "NETFLIX.COM 12345" and "NETFLIX.COM BILLDESK" into one group.
- **Amount-cluster within each group** (critical for aggregators). A single bank debit
  descriptor covers *many* distinct subscriptions when billing goes through an aggregator:
  a UPI-mandate SMS reads *"Sent Rs.99.00 … To Google Play"* — the descriptor is **"Google
  Play"**, not "Truecaller", so every Play/Apple/Razorpay/PayU-billed subscription on the
  same account collapses into one descriptor group. Within each descriptor+account group,
  partition transactions into **amount clusters** (sort by amount; start a new cluster where
  amount exceeds the previous by more than ×1.5 — a price hike like ₹499→₹649 stays one
  cluster, but ₹99 vs ₹149 split). Each cluster is evaluated as its own candidate.
- A cluster qualifies as a candidate when it has:
  - **≥2 occurrences** at a **regular cadence** — median inter-charge gap 26–33 days →
    `monthly`, 350–380 days → `yearly` (bands widened for the boosted case below); OR
  - **exactly 1 occurrence but the charge is `paymentMethod === 'autopay'`** — surfaced with
    a default `monthly` cycle (editable at confirm), so a brand-new mandate appears
    immediately rather than after two cycles.
  - Amounts within a cluster are consistent by construction; increases across occurrences are
    recorded as hikes.
- **Strong recurring signal — `paymentMethod === 'autopay'`.** The SMS/notification parse
  layer already tags mandate / e-mandate / autopay / SI / standing-instruction / ACH / NACH
  / SIP debits as `PaymentMethod.AUTOPAY` (see `sms-sync.service.ts#extractPaymentMethod` and
  notification-sync's `autopay` rail). This — NOT the never-populated `isRecurring` boolean —
  is the primary boost: it widens the cadence bands and lets a single charge qualify. A
  transaction already flagged `isRecurring=true` or sitting in the `Subscriptions` category is
  an additional booster.
- Predict `nextRenewalDate = lastCharge.date + cadence`. Build `priceHistory` from the
  amount timeline across the cluster's occurrences.
- **Dedup vs persisted:** skip descriptors already tied to a confirmed `Subscription` so
  detection never re-surfaces an existing sub.

### Naming (display polish only)

Naming order (the LLM is never consulted on whether a group *is* a subscription):

1. **Catalog** — resolve name / emoji / color from the deterministic merchant catalog
   (`subscription-catalog.ts`; direct-billed merchants like Netflix / Spotify auto-name
   perfectly). The catalog also holds **aggregator entries** (Google Play, Apple, Razorpay,
   PayU) that resolve to a generic name + aggregator icon.
2. **Notification hint (aggregators only)** — the aggregator's real service name lives only in
   the Play/Gmail *notification* Riddhi already captures (`captured_notification.text` =
   *"Your subscription from True Software Scandinavia AB on Google Play has renewed…"*). For an
   aggregator candidate, a **read-only** lookup finds a captured notification from the
   Play/Gmail package posted within ±2 days of the charge and extracts the service name via a
   pure `extractServiceName(text)` regex. This modifies nothing in notification-sync — it only
   reads its entity. When found, the extracted name wins over the generic aggregator name.
3. **Thin LLM fallback (non-aggregator unknowns only)** — an optional injected Claude call
   resolving display name + emoji only, behind graceful fallback.
4. **Title-cased descriptor** — final fallback when nothing else resolves.

Either way, the confirm/review screen lets the user **edit the name/emoji before saving**, so
an aggregator sub with no notification hint (named "Google Play · ₹99/yr") is relabelled
"Truecaller" once, by the user.

## 3. Confirmation flow (backend + mobile)

Backend endpoints (module `subscriptions/`):
- `GET  /subscriptions/detect` → candidates (computed, **not persisted**).
- `POST /subscriptions` → confirm/create: persists a row and back-links its matched
  transactions (sets `subscriptionId`). Also serves manual add.
- `GET  /subscriptions` → the user's persisted subscriptions.
- `PATCH /subscriptions/:id` → pause / resume / cancel, edit `reminderDays`, amount, name,
  cycle, payment source.
- `DELETE /subscriptions/:id`.

Mobile:
- A **review screen** listing candidates with confirm / dismiss (same muscle as SMS-sync and
  statement review). Dismissed candidates are suppressed via a lightweight per-descriptor
  ignore list so they don't re-surface on the next detect.
- **Manual add** for subscriptions the detector can't see yet.

## 4. Summary & derived views (pure)

`subscriptions/subscription-summary.ts` — pure `computeSubscriptionSummary(subs, today)
→ { monthlyBurn, yearlyProjection, activeCount, upcoming[], flags[] }`, unit-tested.
`monthlyEquiv` = yearly/12; burn and projection computed over **active** subscriptions only.

Mobile `Subscriptions` screen (ports `project/riddhi/MobileSubs.jsx`):
- **Burn hero** — monthly burn (count-up), yearly total, active count, this-month total.
- **"Worth a look" flags:**
  - 📈 **Price-hike** — `amount` rose across `priceHistory` (shows old→new, %, extra ₹/yr).
  - 🗓️ **Renewal-soon (big annuals)** — a yearly subscription renewing within N days.
  - 💤 **Possibly-forgotten** — conservative soft nudge, worded "still paying for this?"
    (never a false "unused" claim). Fires only on the strongest case, derivable without any
    usage data: subscription is `active`, `detailOpenedAt IS NULL` (user has never opened
    its detail sheet), `firstSeenDate` is older than a threshold (long-standing), and yearly
    cost is above a threshold (worth surfacing). All three conditions required.
- **Upcoming charges** timeline (next ~35 days).
- **All subscriptions** list with All / Active / Paused segmented tabs.
- **Detail sheet** — cost grid (per-cycle + yearly), next charge, billing cycle, flags, and
  **pause / resume · remind me · cancel** actions (all PATCH-backed).

Registered in mobile navigation alongside the other money-management screens, with a thin
entry point from Home / menu. The prominent home surface for subscriptions is Slice E.

## 5. Reminders (live, via existing notifications)

- Add `NotificationType.SUBSCRIPTION_RENEWAL = 'subscription_renewal'`.
- Extend `notifications.scheduler.ts` (already `@Cron('0 9 * * *', { timeZone: 'Asia/Kolkata' })`)
  with a daily pass: for each active subscription with `reminderDays != null` whose
  `nextRenewalDate` falls within `reminderDays`, emit a notification (→ existing push
  dispatch) and stamp `lastReminderSentFor` for idempotency (never remind twice for the same
  renewal).
- When a renewal date passes (a matching charge lands, or the date elapses), roll
  `nextRenewalDate` forward by the cycle so the next reminder arms.

## 6. Cross-module consistency (standing user directive)

Every slice keeps the rest of the app in sync as part of that slice.

- **Munshi (ai-chat):** snapshot gains subscription burn + next renewals; a `subscriptions`
  read tool so Munshi can answer "what am I paying for?" (mirrors the accounts / cards
  tools and their specs).
- **SMS-sync / statement-import:** a newly created recurring charge is attributed to an
  existing subscription — back-links `subscriptionId` and updates `amount` /
  `nextRenewalDate` / `priceHistory` via the shared descriptor matcher. Same reverse-linking
  pattern as Slice C's `accountId` resolution.
- **Reports / insights:** subscription burn surfaced as a line, reusing the `Subscriptions`
  category aggregation.
- **Budgets:** the existing `Subscriptions` category already aggregates these charges; no
  new wiring beyond ensuring confirmed subs' charges carry that category.
- **CSV export:** unchanged — subscriptions are a view over transactions that are already
  exported. Explicitly out of scope.
- **Slice E (home widgets):** reads `computeSubscriptionSummary`'s upcoming list; built
  later.

## 7. Testing

- **Backend (real jest, TDD):**
  - `detect-subscriptions.spec.ts` — cadence detection, amount tolerance, hike capture,
    threshold + `isRecurring`/category boost, exclusions (transfers/income/SIP), dedup vs
    persisted subs.
  - `subscription-summary.spec.ts` — monthly burn, yearly projection, upcoming window, each
    flag.
  - Service + controller specs (confirm back-linking, pause/cancel, ignore list).
  - Scheduler reminder spec (within-window fire, idempotency, roll-forward).
  - Munshi tool + snapshot specs.
- **Mobile (ts-jest pure-logic harness):** summary/flag helpers, review-mapping, matcher
  normalization. RN screens verified via `npx tsc --noEmit` + driving the app (no component
  tests — jest-expo is blocked by an RN peer-dep). Do NOT touch `mobile/tsconfig.json`.

## Scope guardrails (YAGNI)

Out of scope: Gmail parsing, Google Play API, free-trial tracking, bank-API auto-cancel,
shared/family subscriptions, multi-currency. Investment SIPs deliberately excluded from
detection.
