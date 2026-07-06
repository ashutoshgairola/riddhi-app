/**
 * authApi — live auth endpoints. Unlike the mock-first `api.*` methods in
 * index.ts, auth ALWAYS hits the real backend (there is no meaningful mock
 * for register/login).
 */
import { apiClient } from './client';

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  isFirstLogin: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type AuthResponse = AuthTokens & { user: ApiUser };

export interface OnboardingPayload {
  focusGoals: string[];
  monthlyIncome?: number;
  selectedBanks?: string[];
  smsSyncEnabled: boolean;
  biometricEnabled: boolean;
  firstGoal?: { name: string; targetAmount: number };
}

export const authApi = {
  register(name: string, email: string, password: string): Promise<AuthResponse> {
    return apiClient.post('/auth/register', { name, email, password });
  },
  login(email: string, password: string): Promise<AuthResponse> {
    return apiClient.post('/auth/login', { email, password });
  },
  refresh(refreshToken: string): Promise<AuthTokens> {
    return apiClient.post('/auth/refresh', { refreshToken });
  },
  google(idToken: string): Promise<AuthResponse> {
    return apiClient.post('/auth/google', { idToken });
  },
  me(): Promise<ApiUser> {
    return apiClient.get('/users/me');
  },
  /** Always resolves `{ok:true}` server-side (no account enumeration). */
  forgotPassword(email: string): Promise<{ ok: boolean }> {
    return apiClient.post('/auth/forgot-password', { email });
  },
  updateProfile(patch: { name?: string }): Promise<ApiUser> {
    return apiClient.patch('/users/me', patch);
  },
  deleteAccount(): Promise<void> {
    return apiClient.delete('/users/me');
  },
  completeOnboarding(payload: OnboardingPayload): Promise<{ user: ApiUser }> {
    return apiClient.post('/users/me/onboarding', payload);
  },
};
