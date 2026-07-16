# Unified SMS + notification sync pipeline

**Date:** 2026-07-13
**Status:** Approved (design)

## Problem

Riddhi detects transactions from two channels that today run as two disconnected pipelines:

| | SMS (`sms-sync`) | Notifications (`notification-sync`) |
|---|---|---|
| Parser | regex (weak merchant/category) | LLM (correlates, ignores OTP) |
| Trigger | synchronous on "Sync now" | cron 4×/day only |
| Review queue | client `pending` | server `DetectedTransaction` |
| Cross-channel dedup | none | none |

Three reported bugs trace directly to this split:

1. **OTP treated as a transaction.** The SMS regex extracts the amount out of `"OTP is 867317 for txn of INR 1190.00 at BUNDL TECHN"` and surfaces it as a real charge. (An initial guard for this has already landed in `SmsSyncService`; this design moves the gate into the unified path.)
2. **"Sync now" doesn't use notification info.** Notification analysis only runs on a cron (`0 9,13,18,22`), so captures uploaded at sync time aren't analyzed until hours later. At sync time the richer notification data literally doesn't exist yet, and an SMS charge + its merchant-app notification never get correlated — they surface as two cards.
3. **No source notes.** Confirmed transactions don't carry the originating SMS/notification text. (Notes-from-source-text has already landed for both confirm paths; this design keeps it working for SMS-as-captures.)

## Goal

One capture→detect→review pipeline that both channels feed, with on-demand analysis at "Sync now" that runs immediately and independently of the cron.

## Design (Approach A — unify on one pipeline)

### 1. One capture store

SMS stop posting to `/sms-sync/parse-batch`. The mobile SMS reader posts survivors to the existing `POST /notification-sync/ingest` as captures:

- `packageName: "sms"`
- `title: <sender address>`
- `text: <body>`
- `postedAt: <message date>`

The capture table already enforces `UNIQUE (userId, dedupKey)` with `ON CONFLICT DO NOTHING`, so re-syncing the same SMS is a silent no-op. The mobile client keeps its lightweight processed-ids set only to avoid re-uploading bytes; correctness relies on the server dedup.

The `sms-sync` module (controller, `parse-batch` endpoint, DTO) is **deleted**. Its regex logic is relocated into the unified analysis path (below).

### 2. Regex demoted to a cheap gate + fallback (kept, relocated)

The existing parser (`SmsSyncService.parse` / `isOtpMessage`) moves into the notification-sync analysis path and earns three narrow jobs, all before any LLM token is spent:

- **Noise/OTP gate.** `isOtpMessage(text) || extractAmount(text) === null` ⇒ the capture is noise (OTP, promo, balance-only, non-money). Noise is filtered out of the LLM batch and marked `analyzed: true` so it never loops back. Applies to *every* capture regardless of source (harmless on merchant-app notifications, which carry a real amount).
- **Hint extractor.** amount / type / bank / last4, recomputed on the batch at analysis time (pure, microsecond-cheap — not persisted), passed into the LLM prompt so correlation is anchored on authoritative last4/amount.
- **LLM-absent fallback.** When no Anthropic client is configured, regex hints alone produce detections, so SMS users still get suggestions instead of nothing (today `analyze()` returns `[]` with no client).

### 3. One bounded LLM pass

`runAnalysisForUser` batches all unanalyzed **money-candidate** captures (SMS + notification together) into a single LLM call. Because SMS and its merchant-app notification about the same charge are in one batch, the model correlates them into **one** enriched group (merges `sourceKeys`) — cross-channel dedup for free. Existing reverse-dedup against real transactions is unchanged. The regex gate has already removed the junk, so the batch is small and cheap.

Not building: the "skip the LLM for high-confidence standalone SMS" micro-optimization. One small batched call is already cheap; that lever is only worth it if volume later proves it. Conscious cut.

### 4. On-demand analysis at "Sync now"

New endpoint `POST /notification-sync/analyze` runs `runAnalysisForUser` **synchronously** for the calling user and returns `{ detected }`. "Sync now" becomes: upload SMS captures → upload notification captures → call `analyze` → refetch `detected`. Immediate, independent of the cron (which stays as the background safety net, untouched).

- **Self-limiting.** No unanalyzed captures ⇒ early return, no LLM call. Repeated taps are free.
- **In-flight guard.** A per-user in-memory lock prevents a double-tap from racing two analyses over the same captures. `ponytail:` in-process Set; upgrade to a Postgres advisory lock if the backend ever runs multi-instance.
- **No push on interactive sync.** The "New transactions to review" notification is skipped when analysis is user-triggered (they're already on the screen); the cron path still pushes.

### 5. One review queue / UI

Everything is now `DetectedTransaction`. `Sync.tsx` drops the `pending` / `runSync` / regex SMS branch and its separate rendering — one `detected` list, one confirm/dismiss path. Notes-from-source-text (already landed) covers SMS-as-captures because they are captures.

## Data / schema

**No schema or migration changes.**

- SMS rows reuse the existing `captured_notification` table (`packageName: "sms"`).
- The OTP/noise gate reuses the existing `analyzed` boolean; noise is marked analyzed.
- Regex hints are recomputed at analysis time, not persisted — no new columns.
- Detections keep flowing through the existing `DetectedTransaction` + `sourceKeys`.

(The DB runs `synchronize: true`, so additive columns would auto-apply anyway — but none are needed.)

## Trade-offs / conscious ceilings

- **Batch ceiling.** Analysis fetches `take: 150` unanalyzed captures per run. A huge first-time OTP-heavy backlog can fill a batch with noise and clear real candidates a run later; on-demand sync loops until drained. Fine for normal volume — `ponytail:` comment marks the ceiling.
- **Privacy.** Filtered (non-OTP) SMS text is now sent to the Anthropic LLM, same as notification text already is. OTPs are dropped by the regex gate before any LLM call.
- **Synchronous analyze latency.** "Sync now" waits a few seconds for the LLM behind a spinner (vs fire-and-forget). Chosen for immediate, deterministic feedback.

## Effect on the three bugs

1. OTP gate is now central to both channels.
2. On-demand analysis + single batch kills the staleness and gives cross-channel enrichment/dedup.
3. Confirmed transactions carry their source text as notes.

## Out of scope

- Changing the cron cadence or the LLM model.
- Persisting regex hints.
- The skip-LLM-for-confident-SMS optimization.
