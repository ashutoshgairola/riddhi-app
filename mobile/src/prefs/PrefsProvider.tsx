/**
 * PrefsProvider — user preferences (currency, language, date format,
 * hide-balances, biometric, notification toggles) backed by
 * `GET/PATCH /users/me/preferences`.
 *
 * `set(patch)` is optimistic: local state updates immediately, then the
 * persist call runs; on failure the previous state is restored and the
 * error is rethrown so callers can toast.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api } from '../api';
import type { ApiUserPreferences, PrefsPatch } from '../api/types';

const DEFAULTS: ApiUserPreferences = {
  currency: 'INR',
  dateFormat: 'DD MMM YYYY',
  language: 'en',
  hideBalances: false,
  biometricEnabled: true,
  notificationsEnabled: true,
  budgetAlertsEnabled: true,
  goalMilestonesEnabled: true,
  largeTxAlertsEnabled: true,
  munshiSuggestionsEnabled: true,
  monthlyReportEnabled: true,
  selectedBanks: [],
};

interface PrefsContextValue {
  prefs: ApiUserPreferences;
  /** True once the backend preferences have been fetched (or the fetch
   * failed and defaults stand). Consumers that must not act on the default
   * `biometricEnabled` before the real value loads should gate on this. */
  loaded: boolean;
  set(patch: PrefsPatch): Promise<void>;
}

const PrefsContext = createContext<PrefsContextValue | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ApiUserPreferences>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.prefs
      .get()
      .then((p) => {
        if (!cancelled) setPrefs(p);
      })
      .catch(() => {
        /* keep defaults; next set() will persist over them */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = useCallback(async (patch: PrefsPatch) => {
    let previous: ApiUserPreferences = DEFAULTS;
    setPrefs((p) => {
      previous = p;
      return { ...p, ...patch };
    });
    try {
      const saved = await api.prefs.update(patch);
      setPrefs(saved);
    } catch (err) {
      setPrefs(previous);
      throw err;
    }
  }, []);

  const value = useMemo(() => ({ prefs, loaded, set }), [prefs, loaded, set]);

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsContextValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used within a PrefsProvider');
  return ctx;
}

/** '••••••' stand-in used wherever hide-balances masks an amount. */
export const MASKED_AMOUNT = '••••••';
