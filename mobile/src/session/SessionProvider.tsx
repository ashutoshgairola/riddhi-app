/**
 * SessionProvider — dev/API session bootstrap for the mock-first api/
 * layer (Task 5.3). This is DIFFERENT from `src/auth/AuthProvider.tsx`,
 * which drives the real sign-in UI flow (login/register/onboarding
 * screens) and always runs. `SessionProvider` only matters once
 * `USE_BACKEND` (src/api/index.ts) is flipped to `true`: it silently
 * establishes a bearer token so `api.*` calls succeed without forcing a
 * developer through the login screen every time the app reloads.
 *
 * Behavior:
 *  - `USE_BACKEND` false (default / mock mode): status is 'ready'
 *    immediately, no network/storage activity at all. This is a no-op in
 *    the app's default configuration.
 *  - `USE_BACKEND` true: on mount, try to restore a saved token from
 *    AsyncStorage (`riddhi-token`). If present, apply it and go 'ready'.
 *    Otherwise POST /auth/login with dev credentials
 *    (EXPO_PUBLIC_DEV_EMAIL / EXPO_PUBLIC_DEV_PASSWORD, defaulting to
 *    riddhi@example.com / password123), persist + apply the returned
 *    token, and go 'ready'.
 *  - Any failure (no network, bad creds, etc.) sets status 'error' but
 *    never blocks rendering — the app falls through to the api/ layer's
 *    mock data, which is always available regardless of session state.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { USE_BACKEND, authApi, setAuthToken } from '../api';
import type { ApiUser } from '../api';

const TOKEN_KEY = 'riddhi-token';

const DEV_EMAIL = process.env['EXPO_PUBLIC_DEV_EMAIL'] ?? 'riddhi@example.com';
const DEV_PASSWORD = process.env['EXPO_PUBLIC_DEV_PASSWORD'] ?? 'password123';

export type SessionStatus = 'loading' | 'ready' | 'error' | 'offline';

export interface SessionContextValue {
  status: SessionStatus;
  user: ApiUser | null;
  retry(): void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(USE_BACKEND ? 'loading' : 'ready');
  const [user, setUser] = useState<ApiUser | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!USE_BACKEND) {
      // Mock mode: nothing to bootstrap, api.* already returns mocks.
      setStatus('ready');
      return;
    }

    let cancelled = false;
    (async () => {
      setStatus('loading');
      try {
        const savedToken = await AsyncStorage.getItem(TOKEN_KEY);
        if (savedToken) {
          setAuthToken(savedToken);
          if (!cancelled) {
            setStatus('ready');
          }
          return;
        }

        const res = await authApi.login(DEV_EMAIL, DEV_PASSWORD);
        await AsyncStorage.setItem(TOKEN_KEY, res.accessToken);
        setAuthToken(res.accessToken);
        if (!cancelled) {
          setUser(res.user);
          setStatus('ready');
        }
      } catch {
        // Graceful fallback: never block the app. api.* calls still work
        // via mock data even without a session.
        if (!cancelled) {
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo<SessionContextValue>(
    () => ({ status, user, retry }),
    [status, user, retry],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
