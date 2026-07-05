import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import { api, authApi, setAuthToken } from '../api';
import type { ApiUser, AuthResponse, OnboardingPayload } from '../api';
import {
  clearPin,
  clearTokens,
  getBiometricEnabled,
  hasPin,
  loadTokens,
  saveTokens,
  verifyPin,
} from './tokenStore';

export type AuthStatus = 'loading' | 'signedOut' | 'onboarding' | 'signedIn' | 'locked';

/** Background dwell before the app re-locks (spec: 60 s grace). */
const LOCK_GRACE_MS = 60_000;

/** App lock applies whenever either credential is configured on-device. */
async function lockConfigured(): Promise<boolean> {
  const [pin, bio] = await Promise.all([hasPin(), getBiometricEnabled()]);
  return pin || bio;
}

export interface AuthContextValue {
  status: AuthStatus;
  user: ApiUser | null;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  googleSignIn(idToken: string): Promise<void>;
  biometricLogin(): Promise<boolean>;
  canBiometricLogin: boolean;
  unlockWithBiometric(): Promise<boolean>;
  unlockWithPin(pin: string): Promise<boolean>;
  completeOnboarding(payload: OnboardingPayload): Promise<void>;
  skipToApp(): void;
  updateProfile(name: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<ApiUser | null>(null);
  const [canBiometricLogin, setCanBiometricLogin] = useState(false);

  const enterSession = useCallback(async (res: AuthResponse) => {
    await saveTokens(res.accessToken, res.refreshToken);
    setAuthToken(res.accessToken);
    setUser(res.user);
    setStatus(res.user.isFirstLogin ? 'onboarding' : 'signedIn');
  }, []);

  // Restore session on launch: refresh token -> new pair -> /users/me.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { refreshToken } = await loadTokens();
        if (!refreshToken) {
          if (!cancelled) setStatus('signedOut');
          return;
        }
        const tokens = await authApi.refresh(refreshToken);
        await saveTokens(tokens.accessToken, tokens.refreshToken);
        setAuthToken(tokens.accessToken);
        const me = await authApi.me();
        const locked = !me.isFirstLogin && (await lockConfigured());
        if (cancelled) return;
        setUser(me);
        setStatus(me.isFirstLogin ? 'onboarding' : locked ? 'locked' : 'signedIn');
      } catch {
        setAuthToken(null);
        if (!cancelled) setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Face-ID quick login availability (Login screen button visibility).
  useEffect(() => {
    if (status !== 'signedOut') return;
    let cancelled = false;
    (async () => {
      const [{ refreshToken }, flag, hardware, enrolled] = await Promise.all([
        loadTokens(),
        getBiometricEnabled(),
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!cancelled) setCanBiometricLogin(Boolean(refreshToken) && flag && hardware && enrolled);
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  // Re-lock when the app returns from background after the grace period.
  // iOS reports 'inactive' for transient overlays (Face ID sheet, control
  // center); only a real 'background' arms the timer.
  useEffect(() => {
    if (status !== 'signedIn') return;
    let backgroundedAt: number | null = null;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        backgroundedAt = Date.now();
        return;
      }
      if (next !== 'active' || backgroundedAt == null) return;
      const away = Date.now() - backgroundedAt;
      backgroundedAt = null;
      if (away < LOCK_GRACE_MS) return;
      void lockConfigured().then((lock) => {
        if (lock) setStatus('locked');
      });
    });
    return () => sub.remove();
  }, [status]);

  const login = useCallback(
    async (email: string, password: string) => {
      await enterSession(await authApi.login(email, password));
    },
    [enterSession],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      await enterSession(await authApi.register(name, email, password));
    },
    [enterSession],
  );

  const googleSignIn = useCallback(
    async (idToken: string) => {
      await enterSession(await authApi.google(idToken));
    },
    [enterSession],
  );

  const biometricLogin = useCallback(async (): Promise<boolean> => {
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Riddhi',
    });
    if (!auth.success) return false;
    try {
      const { refreshToken } = await loadTokens();
      if (!refreshToken) return false;
      const tokens = await authApi.refresh(refreshToken);
      await saveTokens(tokens.accessToken, tokens.refreshToken);
      setAuthToken(tokens.accessToken);
      const me = await authApi.me();
      setUser(me);
      setStatus(me.isFirstLogin ? 'onboarding' : 'signedIn');
      return true;
    } catch {
      return false;
    }
  }, []);

  // App-lock unlocks: the session is already in memory; these only gate UI.
  const unlockWithBiometric = useCallback(async (): Promise<boolean> => {
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Riddhi',
    });
    if (!auth.success) return false;
    setStatus('signedIn');
    return true;
  }, []);

  const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
    if (!(await verifyPin(pin))) return false;
    setStatus('signedIn');
    return true;
  }, []);

  const completeOnboarding = useCallback(async (payload: OnboardingPayload) => {
    const { user: updated } = await authApi.completeOnboarding(payload);
    setUser(updated);
    setStatus('signedIn');
  }, []);

  const skipToApp = useCallback(() => setStatus('signedIn'), []);

  const updateProfile = useCallback(async (name: string) => {
    // Persist (no-ops in mock mode) then reflect locally so every consumer
    // of `user` re-renders with the new name.
    await api.users.updateProfile({ name });
    setUser((u) => (u ? { ...u, name } : u));
  }, []);

  const logout = useCallback(async () => {
    await clearTokens();
    await clearPin();
    setAuthToken(null);
    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      register,
      googleSignIn,
      biometricLogin,
      canBiometricLogin,
      unlockWithBiometric,
      unlockWithPin,
      completeOnboarding,
      skipToApp,
      updateProfile,
      logout,
    }),
    [status, user, login, register, googleSignIn, biometricLogin, canBiometricLogin, unlockWithBiometric, unlockWithPin, completeOnboarding, skipToApp, updateProfile, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
