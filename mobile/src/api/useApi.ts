/**
 * useApiData — small data-fetching hook used by screens to route through
 * the api/ layer while always having content to render.
 *
 * Runs `fetcher()` once on mount. While it's in flight, `data` is the
 * caller-supplied `fallback` (so the UI renders immediately with the
 * screen's existing mock, no blank/loading states to design around). If
 * the fetch resolves, `data` becomes the resolved value; if it rejects,
 * `data` stays on `fallback` and `error` is set.
 *
 * When `USE_BACKEND` is false the `api.*` fetchers already resolve with
 * the same canonical mocks synchronously, so this path is exercised even
 * without a live server — screens render identically to before.
 */
import { useEffect, useRef, useState } from 'react';

export interface UseApiDataResult<T> {
  data: T;
  loading: boolean;
  error: unknown;
}

export function useApiData<T>(fetcher: () => Promise<T>, fallback: T): UseApiDataResult<T> {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // Keep the latest fallback available without retriggering the effect.
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setData(fallbackRef.current);
        setError(err);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, error };
}
