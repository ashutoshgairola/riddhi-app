# Auth + Onboarding Wizard — Design Spec

**Date:** 2026-07-02
**Scope:** Welcome / Login / Signup screens and 6-step onboarding wizard in the Expo mobile app, wired to the NestJS backend, with real Google OAuth and real device biometrics.

## Goal

New users can create an account (email/password or Google), complete a personalized onboarding wizard, and land in the app. Returning users log in (password, Google, or Face ID quick-login) and skip onboarding. **The UI must match the design handoff exactly** — `project/riddhi/Riddhi Auth.html` rendering `MobileAuth.jsx` + `MobileOnboard.jsx`.

## UI Fidelity Requirement (hard constraint)

The RN screens must be a faithful translation of the mockup JSX: same layout, spacing, type sizes/weights, copy text, emoji/icons, glass card treatment, progress bar, ₹ keypad, PIN dots, toggles, chips, button heights (54/52/50), radii, animation feel (spring-in staggered entrances, page-enter transitions). Colors and fonts come from the existing `src/theme/tokens.ts` equivalents of the CSS variables (`--em`, `--text-1..3`, `--glass-*`, `--bg-*`, `--font-num`). Where RN cannot reproduce a web effect (e.g. `backdrop-filter`), use the project's existing `Glass.tsx` / `expo-blur` treatment as every other screen already does.

## Architecture (Approach A — approved)

The app keeps its custom navigation pattern. `Root.tsx` gains an `AuthProvider`; an `AuthGate` renders one of three branches:

- `signedOut` → auth flow: `welcome | login | signup` (local screen state, like mockup's `AuthApp`)
- `onboarding` → 6-step wizard + success screen
- `signedIn` → existing `AppShell`
- `loading` → splash (wordmark) while restoring session

## Backend changes

1. **`POST /auth/google`** — body `{ idToken }`. Verify with `google-auth-library` (`OAuth2Client.verifyIdToken`, audience = `GOOGLE_CLIENT_ID` env). Find user by email or create one (`name` from token payload, random 32-byte password). Returns the same `{ user, accessToken, refreshToken }` shape as login.
2. **`UserPreferences` entity gains:** `monthlyIncome` (numeric, nullable), `focusGoals` (text array, default `[]`), `selectedBanks` (text array, default `[]`), `smsSyncEnabled` (bool, default false), `biometricEnabled` (bool, default false), `onboardingCompleted` (bool, default false).
3. **`POST /users/me/onboarding`** — one-shot completion. Body: `{ focusGoals, monthlyIncome?, banks?, smsSyncEnabled, biometricEnabled, firstGoal? { name, targetAmount } }`. Saves preferences, sets `user.isFirstLogin = false`, `onboardingCompleted = true`, creates goal via `GoalsService` when `firstGoal` present. Returns updated user + preferences.

## Mobile structure

```text
src/auth/AuthProvider.tsx      — context: status, user, login/register/googleSignIn/logout/completeOnboarding
src/auth/tokenStore.ts         — AsyncStorage persistence of access+refresh tokens; PIN hash in expo-secure-store
src/screens/auth/Welcome.tsx   — hero wordmark + glow, 3 feature cards, CTAs, terms line
src/screens/auth/Login.tsx     — email/password, forgot-password toast, Face ID button, social row
src/screens/auth/Signup.tsx    — name/email/+91 phone/password + strength meter, terms checkbox, social row
src/screens/auth/authUi.tsx    — shared: Wordmark, SocialRow, Divider, Field, PasswordField, AuthShell
src/screens/onboarding/Wizard.tsx — orchestrator: step state, wizard data, OBStep scaffold, progress bar
src/screens/onboarding/steps.tsx  — OBGoals, OBIncome (₹ keypad), OBAccounts, OBSync, OBGoal, OBSecure (PIN+biometric)
src/screens/onboarding/Done.tsx   — success summary screen
```

### Session lifecycle

- Launch: read tokens from AsyncStorage → if refresh token, call `/auth/refresh`; success → fetch `/auth/me`; `isFirstLogin`/`!onboardingCompleted` decides `onboarding` vs `signedIn`. Failure (401) → `signedOut`.
- Login/register: store both tokens, set `api.setAuthToken(access)`.
- Signup → `onboarding`; Login → `signedIn` (skips wizard unless `isFirstLogin` still true).
- Logout: clear tokens + secure store, → `signedOut`.

### Google sign-in (real)

`expo-auth-session` Google provider with `EXPO_PUBLIC_GOOGLE_CLIENT_ID`. On success, POST id_token to `/auth/google`. If env var unset, button shows toast "Google sign-in not configured yet". Google flow lands like login (existing user) or into onboarding (new user, `isFirstLogin`).

### Apple (stubbed)

Button rendered per design; tap → toast "Apple sign-in coming soon".

### Biometric + PIN (real, local)

- `expo-local-authentication` for Face ID/fingerprint.
- Onboarding Secure step: 4-digit PIN (hashed with `expo-crypto` SHA-256 + random salt, stored in `expo-secure-store`); biometric toggle runs a real `authenticateAsync` check before enabling; flag also persisted to preferences.
- Login screen "Use Face ID": shown only when a stored refresh token + `biometricEnabled` exist; biometric success → silent refresh → signed in.

## Error handling

- API errors surface via existing `FeedbackProvider` toasts (409 email exists, 401 bad credentials, network failure).
- Refresh failure at launch never blocks: falls back to `signedOut`.
- Signup client validation mirrors backend DTO: min 8-char password (strength ≥ "Fair"), valid email, 10-digit phone, terms checked.
- Onboarding completion failure: toast + stay on success screen with retry ("Enter Riddhi" retries).

## New dependencies

Mobile: `expo-auth-session`, `expo-web-browser`, `expo-local-authentication`, `expo-secure-store`, `expo-crypto` (Expo SDK 56 versions). Backend: `google-auth-library`.

## Testing

- Backend: e2e specs following existing patterns — `/auth/google` with mocked token verifier (new user, existing user, invalid token), onboarding endpoint (with/without firstGoal, flags persisted, isFirstLogin cleared).
- Mobile: `tsc --noEmit` clean; manual flow verification in Expo.

## Out of scope

Apple OAuth backend, phone/OTP auth, real bank linking (Accounts step stores selected bank names in `selectedBanks`; no actual account connection), PIN lock screen on app resume (PIN is captured/stored; enforcement UI is a follow-up).
