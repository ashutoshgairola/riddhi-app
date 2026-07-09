/**
 * useApiData — small data-fetching hook used by screens to route through
 * the api/ layer while always having content to render.
 *
 * Runs `fetcher()` on mount and again whenever the api layer signals that
 * data changed (`bumpData()` in refresh.ts — fired by every mutation) or a
 * caller invokes the returned `refetch()`. Both reuse the same `version`
 * bump so there is a single fetch code path.
 *
 * While the first fetch is in flight, `data` is the caller-supplied
 * `fallback` (so the UI renders immediately with the screen's existing
 * mock, no blank/loading states to design around). If the fetch resolves,
 * `data` becomes the resolved value; if it rejects, one automatic retry
 * (after a short backoff) is attempted before settling — if that also
 * fails, `data` stays on the last good value (or `fallback`) and `error`
 * is set. Screens use `error` (with `data` still at the fallback) to show
 * an inline retry affordance instead of silently rendering a fake-empty
 * state (see `components/InlineRetry.tsx`).
 *
 * When `USE_BACKEND` is false the `api.*` fetchers resolve with the
 * canonical (now mutable) mocks synchronously, so this path is exercised
 * even without a live server — screens render identically to before.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { subscribeData } from './refresh';

export interface UseApiDataResult<T> {
  data: T;
  loading: boolean;
  error: unknown;
  /** Re-runs the fetcher (reuses the same `version`-bump mechanism as the
   * `subscribeData` refresh signal). */
  refetch: () => void;
}

/** Backoff before the hook's single automatic retry on a rejected fetch. */
export const RETRY_BACKOFF_MS = 1200;

/**
 * Runs `run()` once; if it rejects, waits (via `wait`) and calls `run()`
 * exactly once more — the second attempt's outcome (success or failure) is
 * what this resolves/rejects with. Never retries more than once, so a
 * persistently-failing `run` settles after exactly two attempts.
 *
 * Framework-free (no React) so the retry/backoff behavior is unit-testable
 * as a plain function — this package's jest config runs pure-logic
 * `.spec.ts` files only, no component-rendering harness (see
 * `jest.config.js`). The hook below supplies a `wait` that stashes the
 * timer id so its effect cleanup can cancel a pending retry.
 */
export function runWithOneRetry<T>(
  run: () => Promise<T>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  backoffMs: number = RETRY_BACKOFF_MS,
): Promise<T> {
  return run().catch(async () => {
    await wait(backoffMs);
    return run();
  });
}

export function useApiData<T>(
  fetcher: () => Promise<T>,
  fallback: T,
  /** Extra values (e.g. a period filter) that should re-run the fetch. */
  deps: readonly unknown[] = [],
): UseApiDataResult<T> {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // Incremented by the refresh signal (or a caller's refetch()) to re-run
  // the fetch effect.
  const [version, setVersion] = useState(0);
  // Keep the latest fetcher/fallback available without retriggering the effect
  // (screens pass inline closures).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  useEffect(() => subscribeData(() => setVersion((v) => v + 1)), []);

  const refetch = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Pending backoff timer for the one auto-retry, if any — cleared on
    // cleanup so a retry never fires (and never re-hits the network) after
    // unmount or a deps change.
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          resolve();
        }, ms);
      });

    setLoading(true);
    setError(null);
    runWithOneRetry(() => fetcherRef.current(), wait)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // Keep whatever was last rendered (initial mount: the fallback).
        setError(err);
        setLoading(false);
      });
    return () => {
      cancelled = true;
      if (retryTimer != null) clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);

  return { data, loading, error, refetch };
}
