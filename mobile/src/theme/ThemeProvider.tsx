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
        // Bail if unmounted, or if the user already toggled/set the mode
        // before this read resolved — don't clobber their choice.
        if (cancelled || hydratedRef.current) return;
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
  }, []);

  const toggle = useCallback(() => {
    hydratedRef.current = true;
    setModeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  // Persist every change once the initial AsyncStorage read has settled. The
  // hydration gate's purpose is to prevent a user toggle that races the read
  // from being clobbered by the late stored value. Note: when hydration itself
  // applies a stored mode, this effect will write that same value straight back
  // — a redundant but harmless idempotent write of the value just read.
  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {
      // Ignore write failures; in-memory state is still updated.
    });
  }, [mode]);

  // `dark`/`light` are module constants that never change at runtime, so
  // listing them as deps is a no-op in production. But during development
  // Fast Refresh re-evaluates tokens.ts to a *new* object identity on every
  // edit; including them here lets a token change re-run this memo and update
  // `t` live, instead of silently keeping the stale theme until a full reload.
  const value = useMemo<ThemeContextValue>(
    () => ({
      t: mode === 'light' ? light : dark,
      mode,
      setMode,
      toggle,
    }),
    [mode, setMode, toggle, dark, light],
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
