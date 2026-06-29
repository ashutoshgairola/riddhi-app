/**
 * Theme context + AsyncStorage persistence.
 *
 * Mirrors the web prototype's theme handling (project/riddhi/App.jsx,
 * MobileScreens.jsx:548): a single `mode` of `'dark' | 'light'` persisted
 * under the storage key `riddhi-theme`, defaulting to `'dark'` when unset.
 *
 * To avoid a flash of the wrong theme we render children immediately with
 * the default (`'dark'`) and swap to the persisted mode once AsyncStorage
 * has been read (tracked via a `hydrated` flag, not currently surfaced —
 * the default already matches the prototype's default so there's nothing
 * to gate rendering on).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { dark, light, type Tokens } from './tokens';

const STORAGE_KEY = 'riddhi-theme';

export type ThemeMode = 'dark' | 'light';

export interface ThemeContextValue {
  t: Tokens;
  mode: ThemeMode;
  setMode(m: ThemeMode): void;
  toggle(): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(v: unknown): v is ThemeMode {
  return v === 'dark' || v === 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  // Guards against a stale AsyncStorage read clobbering a user toggle that
  // happened before hydration finished.
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (isThemeMode(stored)) {
          setModeState(stored);
        }
      })
      .catch(() => {
        // Ignore read failures; keep the default mode.
      })
      .finally(() => {
        if (!cancelled) hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    hydratedRef.current = true;
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {
      // Ignore write failures; in-memory state is still updated.
    });
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === 'light' ? 'dark' : 'light';
      hydratedRef.current = true;
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      t: mode === 'light' ? light : dark,
      mode,
      setMode,
      toggle,
    }),
    [mode, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
