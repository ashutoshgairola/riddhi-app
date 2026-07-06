/**
 * useApiData — small data-fetching hook used by screens to route through
 * the api/ layer while always having content to render.
 *
 * Runs `fetcher()` on mount and again whenever the api layer signals that
 * data changed (`bumpData()` in refresh.ts — fired by every mutation).
 * While the first fetch is in flight, `data` is the caller-supplied
 * `fallback` (so the UI renders immediately with the screen's existing
 * mock, no blank/loading states to design around). If the fetch resolves,
 * `data` becomes the resolved value; if it rejects, `data` stays on the
 * last good value (or `fallback`) and `error` is set.
 *
 * When `USE_BACKEND` is false the `api.*` fetchers resolve with the
 * canonical (now mutable) mocks synchronously, so this path is exercised
 * even without a live server — screens render identically to before.
 */
import { useEffect, useRef, useState } from 'react';

import { subscribeData } from './refresh';

export interface UseApiDataResult<T> {
  data: T;
  loading: boolean;
  error: unknown;
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
  // Incremented by the refresh signal to re-run the fetch effect.
  const [version, setVersion] = useState(0);
  // Keep the latest fetcher/fallback available without retriggering the effect
  // (screens pass inline closures).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  useEffect(() => subscribeData(() => setVersion((v) => v + 1)), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);

  return { data, loading, error };
}
