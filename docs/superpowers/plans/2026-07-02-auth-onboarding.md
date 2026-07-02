# Auth + Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Welcome/Login/Signup screens and a 6-step onboarding wizard in the Expo app, pixel-faithful to `project/riddhi/MobileAuth.jsx` + `MobileOnboard.jsx`, wired to the NestJS backend (JWT + real Google OAuth), with real device biometrics and a locally stored PIN.

**Architecture:** Backend gains `POST /auth/google` and `POST /users/me/onboarding` plus onboarding columns on `UserPreferences`. Mobile gains an `AuthProvider` context (token persistence + silent refresh) and an auth gate in `Root.tsx` that renders one of: auth flow, onboarding wizard, or the existing `AppShell`.

**Tech Stack:** NestJS 11 + TypeORM (Postgres) + `google-auth-library`; Expo SDK 56 / RN 0.85 with `expo-auth-session`, `expo-local-authentication`, `expo-secure-store`, `expo-crypto`, existing `react-native-reanimated`, `expo-blur`, `react-native-svg`.

**Spec:** `docs/superpowers/specs/2026-07-02-auth-onboarding-design.md`

## Global Constraints

- **UI must match the design handoff exactly**: `project/riddhi/MobileAuth.jsx` (306 lines) and `project/riddhi/MobileOnboard.jsx` (443 lines), rendered by `project/riddhi/Riddhi Auth.html`. Same copy text, spacing, type sizes/weights, emoji, button heights (54/52/50), radii, entrance animations.
- CSS variables map to `mobile/src/theme/tokens.ts` fields: `--em`→`t.em`, `--em-dim`→`t.emDim`, `--em-glow`→`t.emGlow`, `--text-1/2/3`→`t.text1/2/3`, `--bg-2/3`→`t.bg2/bg3`, `--border`→`t.border`, `--border-str`→`t.borderStr`, `--glass-bg`→`t.glassBg`, `--glass-bg-2`→`t.glassBg2`, `--glass-brd`→`t.glassBrd`, `--glass-brd-2`→`t.glassBrd2`, `--red`→`t.red`, `--amber`→`t.amber`, `--blue`→`t.blue`, `--r-md`→`radius.md` (16), `--r-lg`→`radius.lg` (20). Fonts via `weight(n)` from tokens (`--font-num` and `--font-ui` are both Plus Jakarta Sans).
- `.m-spring` = springIn 0.5s `spring` easing: from `opacity:0, translateY(14), scale(0.96)`. `.m-page-enter` = 0.32s `ease`: `translateX(100%)→0`, `opacity 0.4→1`. `.m-press` = scale 0.97 on press.
- Web `px` values transfer 1:1 to RN dp. `em` letter-spacing converts to `fontSize * em` (e.g. `-0.03em` of 26px → `-0.78`).
- Backend commits: run `npm run lint` in `backend/` before each commit. Mobile commits: run `npx tsc --noEmit` in `mobile/` before each commit.
- Git: NO Co-Authored-By trailer. Author email `gairola.ashutosh26@gmail.com` (already set repo-local).
- Backend tests run with `npm test` (Jest, unit tests with mocked repositories — no DB needed).
- Existing patterns: theme via `useTheme()`, toasts via `useFeedback().toast(msg, icon)`, glass via `GlassView`, icons via `MI.<name>`, buttons via `Btn`.

---

### Task 1: Backend — onboarding fields + completion endpoint

**Files:**
- Modify: `backend/src/users/user-preferences.entity.ts`
- Create: `backend/src/users/dto/complete-onboarding.dto.ts`
- Modify: `backend/src/users/users.controller.ts`
- Modify: `backend/src/users/users.service.ts`
- Modify: `backend/src/users/users.module.ts`
- Modify: `backend/src/goals/goals.module.ts` (export `GoalsService` if not already)
- Test: `backend/src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `GoalsService.create(userId: string, dto: CreateGoalDto)` (exists), `UsersRepository` (exists).
- Produces: `POST /users/me/onboarding` accepting `CompleteOnboardingDto`, returning `{ user, preferences }`. `UserPreferences` gains `monthlyIncome: number | null`, `focusGoals: string[]`, `selectedBanks: string[]`, `smsSyncEnabled: boolean`, `biometricEnabled: boolean`, `onboardingCompleted: boolean`. Task 10's mobile payload matches this DTO exactly.

- [ ] **Step 1: Write the failing test**

Create `backend/src/users/users.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { GoalsService } from '../goals/goals.service';
import { User } from './user.entity';
import { UserPreferences } from './user-preferences.entity';

describe('UsersService.completeOnboarding', () => {
  let service: UsersService;

  const user = { id: 'u1', name: 'Riddhi', email: 'r@x.com', isFirstLogin: true } as User;
  const prefs = { id: 'p1', userId: 'u1' } as UserPreferences;

  const usersRepository = {
    findById: jest.fn().mockResolvedValue(user),
    save: jest.fn().mockImplementation((u: User) => Promise.resolve(u)),
    findPreferencesByUserId: jest.fn().mockResolvedValue(prefs),
    savePreferences: jest.fn().mockImplementation((p: UserPreferences) => Promise.resolve(p)),
    createDefaultPreferences: jest.fn().mockReturnValue(prefs),
  };
  const goalsService = { create: jest.fn().mockResolvedValue({ id: 'g1' }) };

  beforeEach(async () => {
    jest.clearAllMocks();
    user.isFirstLogin = true;
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: usersRepository },
        { provide: GoalsService, useValue: goalsService },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('saves preferences, clears isFirstLogin, creates first goal', async () => {
    const result = await service.completeOnboarding('u1', {
      focusGoals: ['track', 'save'],
      monthlyIncome: 60000,
      selectedBanks: ['HDFC Bank'],
      smsSyncEnabled: true,
      biometricEnabled: true,
      firstGoal: { name: 'Goa trip', targetAmount: 50000 },
    });

    expect(usersRepository.savePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        focusGoals: ['track', 'save'],
        monthlyIncome: 60000,
        selectedBanks: ['HDFC Bank'],
        smsSyncEnabled: true,
        biometricEnabled: true,
        onboardingCompleted: true,
      }),
    );
    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isFirstLogin: false }),
    );
    expect(goalsService.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ name: 'Goa trip', targetAmount: 50000 }),
    );
    expect(result.user.isFirstLogin).toBe(false);
  });

  it('skips goal creation when firstGoal absent', async () => {
    await service.completeOnboarding('u1', {
      focusGoals: ['track'],
      smsSyncEnabled: false,
      biometricEnabled: false,
    });
    expect(goalsService.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest users.service.spec -t completeOnboarding`
Expected: FAIL — `completeOnboarding` does not exist / GoalsService provider missing.

- [ ] **Step 3: Implement**

Add to `backend/src/users/user-preferences.entity.ts` (after the `language` column; copy `numericTransformer` from `goal.entity.ts:18-21` to the top of the file):

```ts
const numericTransformer = {
  to: (value: number) => value,
  from: (value: string | null) => (value == null ? null : parseFloat(value)),
};
```

```ts
  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  monthlyIncome: number | null;

  @Column({ type: 'text', array: true, default: '{}' })
  focusGoals: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  selectedBanks: string[];

  @Column({ type: 'boolean', default: false })
  smsSyncEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  biometricEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  onboardingCompleted: boolean;
```

Create `backend/src/users/dto/complete-onboarding.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class FirstGoalDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsNumber()
  @Min(1)
  targetAmount: number;
}

export class CompleteOnboardingDto {
  @IsArray()
  @IsString({ each: true })
  focusGoals: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyIncome?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedBanks?: string[];

  @IsBoolean()
  smsSyncEnabled: boolean;

  @IsBoolean()
  biometricEnabled: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => FirstGoalDto)
  firstGoal?: FirstGoalDto;
}
```

In `backend/src/users/users.service.ts` — inject `GoalsService` and add the method:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { User } from './user.entity';
import { UserPreferences } from './user-preferences.entity';
import { GoalsService } from '../goals/goals.service';
import { GoalType } from '../common/enums';
import { CreateGoalDto } from '../goals/dto/create-goal.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly goalsService: GoalsService,
  ) {}
```

(existing methods unchanged), then:

```ts
  async completeOnboarding(userId: string, dto: CompleteOnboardingDto) {
    const user = await this.findById(userId);
    const prefs = await this.getPreferences(userId);

    Object.assign(prefs, {
      focusGoals: dto.focusGoals,
      monthlyIncome: dto.monthlyIncome ?? null,
      selectedBanks: dto.selectedBanks ?? [],
      smsSyncEnabled: dto.smsSyncEnabled,
      biometricEnabled: dto.biometricEnabled,
      onboardingCompleted: true,
    });
    const preferences = await this.usersRepository.savePreferences(prefs);

    user.isFirstLogin = false;
    const savedUser = await this.usersRepository.save(user);

    if (dto.firstGoal) {
      const now = new Date();
      const inOneYear = new Date(now);
      inOneYear.setFullYear(now.getFullYear() + 1);
      await this.goalsService.create(userId, {
        name: dto.firstGoal.name,
        type: GoalType.SAVINGS,
        targetAmount: dto.firstGoal.targetAmount,
        startDate: now.toISOString(),
        targetDate: inOneYear.toISOString(),
      } as CreateGoalDto);
    }

    return { user: savedUser, preferences };
  }
```

In `backend/src/users/users.controller.ts` — add `Post` to the `@nestjs/common` import and:

```ts
  @Post('me/onboarding')
  completeOnboarding(
    @CurrentUser() user: { userId: string; email: string },
    @Body() dto: CompleteOnboardingDto,
  ) {
    return this.usersService.completeOnboarding(user.userId, dto);
  }
```

(import `CompleteOnboardingDto` at the top.)

In `backend/src/goals/goals.module.ts`: ensure `exports: [GoalsService]` is present (add if missing). In `backend/src/users/users.module.ts`: add `GoalsModule` to `imports` (`import { GoalsModule } from '../goals/goals.module';`). If this creates a circular import (GoalsModule importing UsersModule — it shouldn't, check first), use `forwardRef(() => GoalsModule)`.

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest users.service.spec` → PASS (2 tests). Then `npm run lint` → clean. Then `npm run build` → compiles (catches the module wiring).

- [ ] **Step 5: Commit**

```bash
git add backend/src/users backend/src/goals/goals.module.ts
git commit -m "feat(backend): onboarding fields on preferences + POST /users/me/onboarding"
```

---

### Task 2: Backend — Google OAuth login

**Files:**
- Create: `backend/src/auth/dto/google-auth.dto.ts`
- Modify: `backend/src/auth/auth.service.ts`
- Modify: `backend/src/auth/auth.controller.ts`
- Test: `backend/src/auth/auth.service.spec.ts`
- Modify: `backend/.env` (add `GOOGLE_CLIENT_ID=` placeholder — do NOT commit .env; check `.env.example` exists and add there instead if present)

**Interfaces:**
- Produces: `POST /auth/google` body `{ idToken: string }` → `{ accessToken, refreshToken, user }` (same shape as login). Task 3's `authApi.google(idToken)` calls this.

- [ ] **Step 1: Install dependency**

Run: `cd backend && npm install google-auth-library`

- [ ] **Step 2: Write the failing test**

Create `backend/src/auth/auth.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { User } from '../users/user.entity';

describe('AuthService.googleLogin', () => {
  let service: AuthService;

  const existingUser = {
    id: 'u1',
    name: 'Riddhi',
    email: 'r@gmail.com',
    isFirstLogin: false,
  } as User;

  const userRepo = {
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((u) => u),
    save: jest.fn().mockImplementation((u) => Promise.resolve({ ...u, id: 'u2', isFirstLogin: true })),
  };
  const jwtService = { sign: jest.fn().mockReturnValue('tok') };
  const config = { get: jest.fn().mockReturnValue('secret') };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  function mockVerify(payload: unknown) {
    // googleClient is a private field; override its verifyIdToken for the test.
    (service as any).googleClient = {
      verifyIdToken: jest.fn().mockResolvedValue({ getPayload: () => payload }),
    };
  }

  it('returns tokens for an existing user', async () => {
    mockVerify({ email: 'r@gmail.com', name: 'Riddhi' });
    userRepo.findOne.mockResolvedValue(existingUser);
    const result = await service.googleLogin('id-token');
    expect(result.user.email).toBe('r@gmail.com');
    expect(result.accessToken).toBe('tok');
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('creates a new user when email is unknown', async () => {
    mockVerify({ email: 'new@gmail.com', name: 'New User' });
    userRepo.findOne.mockResolvedValue(null);
    const result = await service.googleLogin('id-token');
    expect(userRepo.save).toHaveBeenCalled();
    expect(result.user.isFirstLogin).toBe(true);
  });

  it('throws UnauthorizedException on invalid token', async () => {
    (service as any).googleClient = {
      verifyIdToken: jest.fn().mockRejectedValue(new Error('bad')),
    };
    await expect(service.googleLogin('bad')).rejects.toThrow(UnauthorizedException);
  });

  it('throws when payload has no email', async () => {
    mockVerify({ name: 'No Email' });
    await expect(service.googleLogin('t')).rejects.toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest auth.service.spec`
Expected: FAIL — `googleLogin` is not a function.

- [ ] **Step 4: Implement**

Create `backend/src/auth/dto/google-auth.dto.ts`:

```ts
import { IsString } from 'class-validator';

export class GoogleAuthDto {
  @IsString()
  idToken: string;
}
```

In `backend/src/auth/auth.service.ts` add imports and the method:

```ts
import { OAuth2Client } from 'google-auth-library';
import { randomBytes } from 'crypto';
```

Inside the class (after the constructor):

```ts
  private googleClient = new OAuth2Client();

  async googleLogin(idToken: string) {
    let payload: { email?: string; name?: string } | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.config.get<string>('GOOGLE_CLIENT_ID'),
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
    if (!payload?.email) {
      throw new UnauthorizedException('Google account has no email');
    }

    let user = await this.userRepo.findOne({ where: { email: payload.email } });
    if (!user) {
      const randomPassword = randomBytes(32).toString('hex');
      const hashed = await bcrypt.hash(randomPassword, 10);
      user = await this.userRepo.save(
        this.userRepo.create({
          name: payload.name ?? payload.email.split('@')[0],
          email: payload.email,
          password: hashed,
        }),
      );
    }
    const tokens = this.signTokens(user);
    return { ...tokens, user: this.safeUser(user) };
  }
```

In `backend/src/auth/auth.controller.ts`:

```ts
import { GoogleAuthDto } from './dto/google-auth.dto';
```

```ts
  @Post('google')
  google(@Body() dto: GoogleAuthDto) {
    return this.authService.googleLogin(dto.idToken);
  }
```

Add `GOOGLE_CLIENT_ID=` to `backend/.env` (leave value empty until the user supplies it; verification fails cleanly as 401 without it).

- [ ] **Step 5: Run tests**

Run: `cd backend && npx jest auth.service.spec` → PASS (4 tests). `npm run lint` → clean. `npm test` → all suites pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth backend/package.json backend/package-lock.json
git commit -m "feat(backend): Google OAuth login via POST /auth/google"
```

---

### Task 3: Mobile — dependencies, auth API layer, token/PIN store

**Files:**
- Modify: `mobile/package.json` (via `npx expo install`)
- Create: `mobile/src/api/auth.ts`
- Modify: `mobile/src/api/index.ts` (re-export)
- Create: `mobile/src/auth/tokenStore.ts`

**Interfaces:**
- Consumes: `apiClient` from `src/api/client.ts` (`get/post/patch/delete`), `setAuthToken`.
- Produces (Task 4 consumes):
  - `authApi.register(name, email, password): Promise<AuthResponse>`
  - `authApi.login(email, password): Promise<AuthResponse>`
  - `authApi.refresh(refreshToken): Promise<AuthTokens>`
  - `authApi.google(idToken): Promise<AuthResponse>`
  - `authApi.me(): Promise<ApiUser>`
  - `authApi.completeOnboarding(payload: OnboardingPayload): Promise<{ user: ApiUser }>`
  - `tokenStore`: `saveTokens/loadTokens/clearTokens`, `savePin/verifyPin/clearPin/hasPin`, `setBiometricEnabled/getBiometricEnabled`
- Types: `ApiUser { id; name; email; isFirstLogin }`, `AuthTokens { accessToken; refreshToken }`, `AuthResponse = AuthTokens & { user: ApiUser }`, `OnboardingPayload { focusGoals: string[]; monthlyIncome?: number; selectedBanks?: string[]; smsSyncEnabled: boolean; biometricEnabled: boolean; firstGoal?: { name: string; targetAmount: number } }`.

- [ ] **Step 1: Install Expo packages**

Run: `cd mobile && npx expo install expo-auth-session expo-web-browser expo-local-authentication expo-secure-store expo-crypto`
Expected: versions matching SDK 56 added to package.json. Per `mobile/AGENTS.md`, verify usage against https://docs.expo.dev/versions/v56.0.0/ if any API below fails to typecheck.

- [ ] **Step 2: Create `mobile/src/api/auth.ts`**

```ts
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
  completeOnboarding(payload: OnboardingPayload): Promise<{ user: ApiUser }> {
    return apiClient.post('/users/me/onboarding', payload);
  },
};
```

Add to `mobile/src/api/index.ts` (near the `setAuthToken` re-export):

```ts
export { authApi } from './auth';
export type { ApiUser, AuthResponse, AuthTokens, OnboardingPayload } from './auth';
```

- [ ] **Step 3: Create `mobile/src/auth/tokenStore.ts`**

```ts
/**
 * tokenStore — persistence for the session (AsyncStorage) and the app-lock
 * PIN (SecureStore; hashed, never plaintext). The PIN is a device-level app
 * lock, not an account credential, so it never leaves the phone (spec §
 * Biometric + PIN).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const ACCESS_KEY = 'riddhi.accessToken';
const REFRESH_KEY = 'riddhi.refreshToken';
const BIOMETRIC_KEY = 'riddhi.biometricEnabled';
const PIN_KEY = 'riddhi.pin';

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await AsyncStorage.multiSet([
    [ACCESS_KEY, accessToken],
    [REFRESH_KEY, refreshToken],
  ]);
}

export async function loadTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  const pairs = await AsyncStorage.multiGet([ACCESS_KEY, REFRESH_KEY]);
  return { accessToken: pairs[0][1], refreshToken: pairs[1][1] };
}

export async function clearTokens(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_KEY, enabled ? '1' : '0');
}

export async function getBiometricEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(BIOMETRIC_KEY)) === '1';
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function savePin(pin: string): Promise<void> {
  const saltBytes = await Crypto.getRandomBytesAsync(16);
  const salt = Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hash = await hashPin(pin, salt);
  await SecureStore.setItemAsync(PIN_KEY, `${salt}:${hash}`);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  return (await hashPin(pin, salt)) === hash;
}

export async function hasPin(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PIN_KEY)) != null;
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
}
```

- [ ] **Step 4: Verify**

Run: `cd mobile && npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/api mobile/src/auth
git commit -m "feat(mobile): auth API layer + token/PIN store"
```

---

### Task 4: Mobile — AuthProvider + auth gate in Root

**Files:**
- Create: `mobile/src/auth/AuthProvider.tsx`
- Modify: `mobile/src/app/Root.tsx`
- Create: `mobile/src/screens/auth/AuthFlow.tsx` (placeholder screens for now — real ones land in Tasks 6–8)
- Create: `mobile/src/screens/onboarding/Wizard.tsx` (placeholder — real one in Task 9/10)

**Interfaces:**
- Consumes: `authApi`, `tokenStore` (Task 3), `setAuthToken` from `src/api`.
- Produces (Tasks 6–10 consume):

```ts
export type AuthStatus = 'loading' | 'signedOut' | 'onboarding' | 'signedIn';
export interface AuthContextValue {
  status: AuthStatus;
  user: ApiUser | null;
  login(email: string, password: string): Promise<void>;      // throws ApiError
  register(name: string, email: string, password: string): Promise<void>; // throws ApiError
  googleSignIn(idToken: string): Promise<void>;               // throws ApiError
  biometricLogin(): Promise<boolean>;                          // false = failed/unavailable
  canBiometricLogin: boolean;                                  // stored refresh + flag + hardware
  completeOnboarding(payload: OnboardingPayload): Promise<void>; // throws ApiError
  skipToApp(): void;                                           // onboarding -> signedIn without API (not used yet)
  logout(): Promise<void>;
}
export function useAuth(): AuthContextValue;
```

- [ ] **Step 1: Create `mobile/src/auth/AuthProvider.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';

import { authApi, setAuthToken } from '../api';
import type { ApiUser, AuthResponse, OnboardingPayload } from '../api';
import {
  clearPin,
  clearTokens,
  getBiometricEnabled,
  loadTokens,
  saveTokens,
} from './tokenStore';

export type AuthStatus = 'loading' | 'signedOut' | 'onboarding' | 'signedIn';

export interface AuthContextValue {
  status: AuthStatus;
  user: ApiUser | null;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  googleSignIn(idToken: string): Promise<void>;
  biometricLogin(): Promise<boolean>;
  canBiometricLogin: boolean;
  completeOnboarding(payload: OnboardingPayload): Promise<void>;
  skipToApp(): void;
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
        if (cancelled) return;
        setUser(me);
        setStatus(me.isFirstLogin ? 'onboarding' : 'signedIn');
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

  const completeOnboarding = useCallback(async (payload: OnboardingPayload) => {
    const { user: updated } = await authApi.completeOnboarding(payload);
    setUser(updated);
    setStatus('signedIn');
  }, []);

  const skipToApp = useCallback(() => setStatus('signedIn'), []);

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
      completeOnboarding,
      skipToApp,
      logout,
    }),
    [status, user, login, register, googleSignIn, biometricLogin, canBiometricLogin, completeOnboarding, skipToApp, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Placeholder flow screens**

Create `mobile/src/screens/auth/AuthFlow.tsx` (replaced by real screens in Tasks 6–8; this placeholder just proves the gate wiring):

```tsx
import { Text, View } from 'react-native';
import { PageBackground } from '../../components/PageBackground';
import { useTheme } from '../../theme/ThemeProvider';
import { weight } from '../../theme/tokens';

export function AuthFlow() {
  const { t } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <PageBackground />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.text1, fontFamily: weight(700) }}>Auth flow — Tasks 6–8</Text>
      </View>
    </View>
  );
}
```

Create `mobile/src/screens/onboarding/Wizard.tsx` with the same shape (`export function OnboardingWizard()`, text "Onboarding — Tasks 9–10").

- [ ] **Step 3: Wire the gate into `mobile/src/app/Root.tsx`**

Replace the `<NavProvider><AppShell /></NavProvider>` block:

```tsx
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { PageBackground } from '../components/PageBackground';
import { FeedbackProvider } from '../feedback/FeedbackProvider';
import { AuthFlow } from '../screens/auth/AuthFlow';
import { OnboardingWizard } from '../screens/onboarding/Wizard';
import { ThemeProvider } from '../theme/ThemeProvider';
import { AppShell } from './AppShell';
import { NavProvider } from './navContext';

function AuthGate() {
  const { status } = useAuth();
  switch (status) {
    case 'loading':
      // Bare page background as splash — fonts are loaded, session restoring.
      return (
        <View style={{ flex: 1 }}>
          <PageBackground />
        </View>
      );
    case 'signedOut':
      return <AuthFlow />;
    case 'onboarding':
      return <OnboardingWizard />;
    case 'signedIn':
      return (
        <NavProvider>
          <AppShell />
        </NavProvider>
      );
  }
}

export default function Root() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FeedbackProvider>
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 4: Verify**

Run: `cd mobile && npx tsc --noEmit` → clean. Optionally `npx expo start` and confirm the placeholder AuthFlow renders (no backend running → restore fails → `signedOut`).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/auth mobile/src/app/Root.tsx mobile/src/screens/auth mobile/src/screens/onboarding
git commit -m "feat(mobile): AuthProvider with session restore + auth gate in Root"
```

---

### Task 5: Mobile — shared auth UI atoms (exact design port)

**Files:**
- Create: `mobile/src/screens/auth/authUi.tsx`

**Interfaces (Tasks 6–10 consume):**
- `Wordmark({ size?: number })` — default 40
- `SpringIn({ delay?: number; style?; children })` — `.m-spring` entrance
- `AuthInput(props: TextInputProps)` — `.m-input`
- `Field({ label, children })` — `.m-label` + 14 bottom margin
- `PasswordField({ value, onChange, placeholder? })` — eye toggle
- `SocialRow({ onGoogle, onApple })` — Google/Apple glass buttons
- `AuthDivider({ label })`
- `AuthShell({ onBack?, children })` — scrollable page, back topbar when `onBack`
- `PressableScale({ onPress, disabled?, style?, children })` — `.m-press` (scale 0.97)

Source of truth: `project/riddhi/MobileAuth.jsx:1-86` (Wordmark, GoogleG, AppleG, SocialRow, Divider, Field, PasswordField, AuthShell), `mobile.css:521-549` (`.m-input`/`.m-label`), `mobile.css:634-642` (`.m-spring`), `mobile.css:712-713` (`.m-press`).

- [ ] **Step 1: Create `mobile/src/screens/auth/authUi.tsx`**

```tsx
/**
 * Shared auth UI atoms — RN port of project/riddhi/MobileAuth.jsx:1-86
 * plus .m-input/.m-label (mobile.css:521-549), .m-spring (634-642) and
 * .m-press (712-713). Design-handoff fidelity is a hard requirement:
 * dimensions/copy match the mockup exactly.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { IconButton } from '../../components/ui';
import { MI } from '../../components/icons';
import { PageBackground } from '../../components/PageBackground';
import { useTheme } from '../../theme/ThemeProvider';
import { spring, weight } from '../../theme/tokens';

// ── .m-spring: springIn .5s var(--spring) backwards ────────────────
const SPRING_MS = 500;

export function SpringIn({ delay = 0, style, children }: { delay?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: SPRING_MS, easing: spring }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const a = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 14 }, { scale: 0.96 + p.value * 0.04 }],
  }));
  return <Animated.View style={[a, style]}>{children}</Animated.View>;
}

// ── .m-press ────────────────────────────────────────────────────────
export function PressableScale({
  onPress,
  disabled = false,
  style,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled}>
      {({ pressed }) => (
        <View style={[style, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>{children}</View>
      )}
    </Pressable>
  );
}

// ── Brand wordmark (MobileAuth.jsx:4-11) ────────────────────────────
export function Wordmark({ size = 40 }: { size?: number }) {
  const { t } = useTheme();
  const ls = -0.035 * size;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={{ fontSize: size, color: t.em, fontFamily: weight(800), letterSpacing: ls, lineHeight: size * 1.05 }}>₹</Text>
      <Text style={{ fontSize: size, color: t.text1, fontFamily: weight(800), letterSpacing: ls, lineHeight: size * 1.05 }}>iddhi</Text>
    </View>
  );
}

// ── Google / Apple glyphs (MobileAuth.jsx:14-19) ────────────────────
export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

export function AppleG({ size = 17, color }: { size?: number; color?: string }) {
  const { t } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color ?? t.text1}>
      <Path d="M17.05 12.53c-.02-2.02 1.65-2.99 1.72-3.04-.94-1.37-2.4-1.56-2.92-1.58-1.24-.13-2.42.73-3.05.73-.63 0-1.6-.71-2.63-.69-1.35.02-2.6.79-3.29 2-1.4 2.43-.36 6.03 1.01 8 .67.96 1.47 2.04 2.51 2 1.01-.04 1.39-.65 2.61-.65 1.22 0 1.56.65 2.63.63 1.09-.02 1.77-.98 2.44-1.95.77-1.12 1.09-2.2 1.1-2.26-.02-.01-2.11-.81-2.13-3.2zM15.05 6.3c.56-.68.94-1.62.84-2.56-.81.03-1.79.54-2.37 1.21-.52.6-.97 1.56-.85 2.48.9.07 1.82-.46 2.38-1.13z" />
    </Svg>
  );
}

// ── SocialRow (MobileAuth.jsx:21-32): two 50px glass buttons ────────
export function SocialRow({ onGoogle, onApple }: { onGoogle: () => void; onApple: () => void }) {
  const { t } = useTheme();
  const btn = [styles.socialBtn, { backgroundColor: t.glassBg, borderColor: t.glassBrd }];
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <PressableScale onPress={onGoogle} style={{ flex: 1 }}>
        <View style={btn}>
          <GoogleG />
          <Text style={[styles.socialLabel, { color: t.text1, fontFamily: weight(600) }]}>Google</Text>
        </View>
      </PressableScale>
      <PressableScale onPress={onApple} style={{ flex: 1 }}>
        <View style={btn}>
          <AppleG />
          <Text style={[styles.socialLabel, { color: t.text1, fontFamily: weight(600) }]}>Apple</Text>
        </View>
      </PressableScale>
    </View>
  );
}

// ── Divider (MobileAuth.jsx:34-42) ──────────────────────────────────
export function AuthDivider({ label }: { label: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.divider}>
      <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
      <Text style={[styles.dividerLabel, { color: t.text3, fontFamily: weight(600) }]}>{label.toUpperCase()}</Text>
      <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
    </View>
  );
}

// ── .m-input (mobile.css:521-537) ───────────────────────────────────
export function AuthInput(props: TextInputProps) {
  const { t } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={t.text3}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[
        styles.input,
        {
          backgroundColor: focused ? t.glassBg2 : t.glassBg,
          borderColor: focused ? t.emGlow : t.glassBrd,
          color: t.text1,
          fontFamily: weight(500),
        },
        props.style,
      ]}
    />
  );
}

// ── Field (MobileAuth.jsx:45-52) + .m-label (mobile.css:541-549) ────
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.label, { color: t.text3, fontFamily: weight(700) }]}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

// ── PasswordField (MobileAuth.jsx:54-68) ────────────────────────────
export function PasswordField({
  value,
  onChange,
  placeholder = '••••••••',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const { t } = useTheme();
  const [show, setShow] = useState(false);
  return (
    <View style={{ position: 'relative' }}>
      <AuthInput
        secureTextEntry={!show}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        autoCapitalize="none"
        style={{ paddingRight: 48 }}
      />
      <Pressable onPress={() => setShow((s) => !s)} style={styles.eyeBtn}>
        {show ? <MI.eye size={18} color={t.text3} /> : <MI.eyeOff size={18} color={t.text3} />}
      </Pressable>
    </View>
  );
}

// ── AuthShell (MobileAuth.jsx:71-86) ────────────────────────────────
export function AuthShell({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <PageBackground />
      {onBack ? (
        <View style={styles.topbar}>
          <IconButton onPress={onBack}>
            <MI.back size={20} color={t.text1} />
          </IconButton>
        </View>
      ) : null}
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: onBack ? 8 : 30,
          paddingHorizontal: 26,
          paddingBottom: onBack ? 30 : 30,
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  socialBtn: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 16,
    borderWidth: 1,
  },
  socialLabel: {
    fontSize: 14,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    fontSize: 11.5,
    letterSpacing: 0.69, // 0.06em of 11.5px
  },
  input: {
    width: '100%',
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.88, // 0.08em of 11px
    marginBottom: 8,
  },
  eyeBtn: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topbar: {
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 0,
  },
});
```

Note: mockup uses `MI.eye` when `show` is true (field visible) — keep that mapping exactly as above.

- [ ] **Step 2: Verify**

Run: `cd mobile && npx tsc --noEmit` → clean.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/auth/authUi.tsx
git commit -m "feat(mobile): shared auth UI atoms ported from design handoff"
```

---

### Task 6: Mobile — Welcome screen + AuthFlow orchestrator

**Files:**
- Create: `mobile/src/screens/auth/Welcome.tsx`
- Modify: `mobile/src/screens/auth/AuthFlow.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `authUi` atoms (Task 5), `Btn` (exists).
- Produces: `Welcome({ onSignup, onLogin })`; `AuthFlow()` renders `welcome | login | signup` with the `.m-page-enter` transition keyed on screen. Tasks 7–8 plug `Login`/`Signup` into the same switch.

Source: `MobileAuth.jsx:91-143` (AuthWelcome), `MobileAuth.jsx:279-304` (AuthApp orchestrator — the RN version's `onDone` paths are handled by AuthProvider status changes instead of `go('app')`).

- [ ] **Step 1: Create `mobile/src/screens/auth/Welcome.tsx`**

```tsx
/** Welcome — RN port of AuthWelcome (project/riddhi/MobileAuth.jsx:91-143). */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { Btn } from '../../components/ui';
import { PageBackground } from '../../components/PageBackground';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, weight } from '../../theme/tokens';
import { PressableScale, SpringIn, Wordmark } from './authUi';

const FEATS = [
  { i: '🔄', c: '#7faf93', l: 'Auto-sync from bank SMS', d: 'Transactions logged on-device' },
  { i: '◎', c: '#c9a86a', l: 'Smart budgets & goals', d: 'Know what’s safe to spend' },
  { i: '💬', c: '#9d8bd6', l: 'Ask Riddhi anything', d: 'Plan and log by chatting' },
];

export function Welcome({ onSignup, onLogin }: { onSignup: () => void; onLogin: () => void }) {
  const { t } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <PageBackground />
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26 }}
      >
        {/* Hero (MobileAuth.jsx:102-113): 280px radial glow behind wordmark */}
        <View style={{ paddingTop: 64, paddingBottom: 24 }}>
          <View pointerEvents="none" style={styles.heroGlow}>
            <Svg width={280} height={280}>
              <Defs>
                <RadialGradient id="heroGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor="rgba(182,164,243,0.32)" />
                  <Stop offset="68%" stopColor="rgba(182,164,243,0)" />
                </RadialGradient>
              </Defs>
              <Circle cx={140} cy={140} r={140} fill="url(#heroGlow)" />
            </Svg>
          </View>
          <SpringIn>
            <Wordmark size={52} />
            <Text style={[styles.heroTitle, { color: t.text1, fontFamily: weight(700) }]}>
              Money, clear as day.
            </Text>
            <Text style={[styles.heroSub, { color: t.text2, fontFamily: weight(500) }]}>
              India’s calmest way to track spending, budget with intent, and grow what you keep.
            </Text>
          </SpringIn>
        </View>

        {/* Feature list (MobileAuth.jsx:116-129) */}
        <View style={{ gap: 10, marginTop: 6 }}>
          {FEATS.map((f, i) => (
            <SpringIn key={f.l} delay={60 + i * 60}>
              <View style={[styles.featCard, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
                <View style={[styles.featIcon, { backgroundColor: f.c + '22' }]}>
                  <Text style={{ fontSize: 19, color: f.c }}>{f.i}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, color: t.text1, fontFamily: weight(700) }}>{f.l}</Text>
                  <Text style={{ fontSize: 11.5, color: t.text3, marginTop: 2, fontFamily: weight(500) }}>{f.d}</Text>
                </View>
              </View>
            </SpringIn>
          ))}
        </View>

        {/* CTAs (MobileAuth.jsx:132-138) */}
        <View style={{ marginTop: 'auto', paddingTop: 28, paddingBottom: 8 }}>
          <Btn onPress={onSignup} style={{ height: 54 }}>
            <Text style={{ fontSize: 16, color: '#1a1228', fontFamily: weight(600) }}>Create account</Text>
          </Btn>
          <PressableScale onPress={onLogin}>
            <View style={[styles.ghostBtn, { borderColor: t.glassBrd }]}>
              <Text style={{ fontSize: 15, color: t.text1, fontFamily: weight(600) }}>I already have an account</Text>
            </View>
          </PressableScale>
          <Text style={[styles.terms, { color: t.text3, fontFamily: weight(500) }]}>
            By continuing you agree to our Terms & Privacy Policy
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  heroGlow: {
    position: 'absolute',
    top: -20,
    alignSelf: 'center',
  },
  heroTitle: {
    fontSize: 20,
    letterSpacing: -0.4, // -0.02em of 20px
    marginTop: 22,
    lineHeight: 25,
  },
  heroSub: {
    fontSize: 14.5,
    marginTop: 8,
    lineHeight: 21.75,
    maxWidth: 280,
  },
  featCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  featIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtn: {
    height: 52,
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  terms: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16.5,
  },
});
```

- [ ] **Step 2: Replace `AuthFlow.tsx` with the orchestrator**

```tsx
/**
 * AuthFlow — RN port of the AuthApp orchestrator (MobileAuth.jsx:279-304).
 * `.m-page-enter` transition (mobile.css:173-179) re-fires on each screen
 * change: translateX 100%->0, opacity .4->1, 0.32s ease.
 */
import { useEffect, useState } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ease } from '../../theme/tokens';
import { Welcome } from './Welcome';

type AuthScreen = 'welcome' | 'login' | 'signup';
const ENTER_MS = 320;

export function AuthFlow() {
  const [screen, setScreen] = useState<AuthScreen>('welcome');
  const progress = useSharedValue(1);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: ENTER_MS, easing: ease });
  }, [screen, progress]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + 0.6 * progress.value,
    transform: [{ translateX: (1 - progress.value) * Dimensions.get('window').width }],
  }));

  const render = () => {
    switch (screen) {
      case 'welcome':
        return <Welcome onSignup={() => setScreen('signup')} onLogin={() => setScreen('login')} />;
      case 'login':
        // Task 7 replaces this with <Login .../>
        return <Welcome onSignup={() => setScreen('signup')} onLogin={() => setScreen('login')} />;
      case 'signup':
        // Task 8 replaces this with <Signup .../>
        return <Welcome onSignup={() => setScreen('signup')} onLogin={() => setScreen('login')} />;
    }
  };

  return <Animated.View style={[styles.page, enterStyle]}>{render()}</Animated.View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
});
```

- [ ] **Step 3: Verify**

`cd mobile && npx tsc --noEmit` → clean. Run `npx expo start`, confirm the Welcome screen matches the handoff (compare against `Riddhi Auth.html` opened in a browser): glow behind wordmark, three glass feature cards with staggered spring entrance, both CTAs, terms line.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/auth
git commit -m "feat(mobile): Welcome screen + auth flow orchestrator"
```

---

### Task 7: Mobile — Login screen (password, Face ID, Google, Apple stub)

**Files:**
- Create: `mobile/src/screens/auth/Login.tsx`
- Create: `mobile/src/screens/auth/useGoogleAuth.ts`
- Modify: `mobile/src/screens/auth/AuthFlow.tsx` (plug in `Login`)

**Interfaces:**
- Consumes: `useAuth()` (`login`, `googleSignIn`, `biometricLogin`, `canBiometricLogin`), `useFeedback().toast`, authUi atoms.
- Produces: `Login({ onBack, onSignup })` — success needs no callback (AuthProvider status change unmounts the flow). `useGoogleAuth(): { promptGoogle: () => Promise<void>; googleConfigured: boolean }` (Task 8 reuses it).

Source: `MobileAuth.jsx:148-190`.

- [ ] **Step 1: Create `mobile/src/screens/auth/useGoogleAuth.ts`**

```ts
/**
 * Google sign-in via expo-auth-session. Requires EXPO_PUBLIC_GOOGLE_CLIENT_ID
 * (spec: button shows a "not configured" toast until it's set).
 * Verify API shape against https://docs.expo.dev/versions/v56.0.0/sdk/auth-session/
 * if this drifts from SDK 56.
 */
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { useFeedback } from '../../feedback/FeedbackProvider';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = process.env['EXPO_PUBLIC_GOOGLE_CLIENT_ID'] ?? '';

export function useGoogleAuth() {
  const { googleSignIn } = useAuth();
  const { toast } = useFeedback();
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: CLIENT_ID || 'unconfigured.apps.googleusercontent.com',
  });

  useEffect(() => {
    if (response?.type === 'success' && response.params['id_token']) {
      googleSignIn(response.params['id_token']).catch(() => {
        toast('Google sign-in failed', '⚠️');
      });
    }
  }, [response, googleSignIn, toast]);

  const promptGoogle = useCallback(async () => {
    if (!CLIENT_ID) {
      toast('Google sign-in not configured yet', '🔵');
      return;
    }
    await promptAsync();
  }, [promptAsync, toast]);

  return { promptGoogle, googleConfigured: Boolean(CLIENT_ID) && Boolean(request) };
}
```

- [ ] **Step 2: Create `mobile/src/screens/auth/Login.tsx`**

```tsx
/** Login — RN port of AuthLogin (project/riddhi/MobileAuth.jsx:148-190). */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useAuth } from '../../auth/AuthProvider';
import { Btn } from '../../components/ui';
import { useFeedback } from '../../feedback/FeedbackProvider';
import { ApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { weight } from '../../theme/tokens';
import {
  AuthDivider,
  AuthInput,
  AuthShell,
  Field,
  PasswordField,
  PressableScale,
  SocialRow,
  SpringIn,
  Wordmark,
} from './authUi';
import { useGoogleAuth } from './useGoogleAuth';

/** Face-ID glyph (MobileAuth.jsx:177). */
function FaceIdGlyph({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2a5 5 0 0 0-5 5v3a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5z" />
      <Path d="M4 11v2a8 8 0 0 0 16 0v-2" />
    </Svg>
  );
}

export function Login({ onBack, onSignup }: { onBack: () => void; onSignup: () => void }) {
  const { t } = useTheme();
  const { toast } = useFeedback();
  const { login, biometricLogin, canBiometricLogin } = useAuth();
  const { promptGoogle } = useGoogleAuth();
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending) return;
    setPending(true);
    try {
      await login(email.trim(), pwd);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) toast('Invalid email or password', '⚠️');
      else toast('Could not reach the server', '📡');
    } finally {
      setPending(false);
    }
  };

  const faceId = async () => {
    toast('Authenticating…', '🔒');
    const ok = await biometricLogin();
    if (!ok) toast('Face ID sign-in failed', '⚠️');
  };

  return (
    <AuthShell onBack={onBack}>
      <SpringIn style={{ marginTop: 8, marginBottom: 24 }}>
        <Wordmark size={30} />
        <Text style={[styles.title, { color: t.text1, fontFamily: weight(800) }]}>Welcome back</Text>
        <Text style={[styles.sub, { color: t.text2, fontFamily: weight(500) }]}>Log in to pick up where you left off.</Text>
      </SpringIn>

      <SpringIn delay={50}>
        <Field label="Email or phone">
          <AuthInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </Field>
        <Field label="Password">
          <PasswordField value={pwd} onChange={setPwd} />
        </Field>
        <Pressable onPress={() => toast('Reset link sent', '📧')} style={{ alignSelf: 'flex-end', marginTop: -2, marginBottom: 18 }}>
          <Text style={{ fontSize: 13, color: t.em, fontFamily: weight(600) }}>Forgot password?</Text>
        </Pressable>

        <Btn onPress={submit} disabled={pending} style={{ height: 54 }}>
          <Text style={{ fontSize: 16, color: '#1a1228', fontFamily: weight(600) }}>
            {pending ? 'Logging in…' : 'Log in'}
          </Text>
        </Btn>

        {canBiometricLogin ? (
          <PressableScale onPress={faceId}>
            <View style={[styles.faceIdBtn, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
              <FaceIdGlyph color={t.text1} />
              <Text style={{ fontSize: 14, color: t.text1, fontFamily: weight(600) }}>Use Face ID</Text>
            </View>
          </PressableScale>
        ) : null}

        <AuthDivider label="or" />
        <SocialRow onGoogle={promptGoogle} onApple={() => toast('Apple sign-in coming soon', '🍎')} />
      </SpringIn>

      <View style={{ alignItems: 'center', marginTop: 28, flexDirection: 'row', justifyContent: 'center' }}>
        <Text style={{ fontSize: 14, color: t.text2, fontFamily: weight(500) }}>New to Riddhi? </Text>
        <Pressable onPress={onSignup}>
          <Text style={{ fontSize: 14, color: t.em, fontFamily: weight(700) }}>Create an account</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 26,
    letterSpacing: -0.78, // -0.03em of 26px
    marginTop: 20,
  },
  sub: {
    fontSize: 14,
    marginTop: 6,
  },
  faceIdBtn: {
    height: 50,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 16,
    borderWidth: 1,
  },
});
```

Design note: the mockup always shows "Use Face ID"; the real screen shows it only when a biometric quick-login is actually possible (`canBiometricLogin`) — an agreed functional deviation (spec § Biometric), visuals identical when shown. The mockup's prefilled `riddhi@example.com` is demo data, not design — field starts empty with the design's placeholder.

- [ ] **Step 3: Plug into AuthFlow**

In `AuthFlow.tsx` replace the `case 'login'` placeholder:

```tsx
      case 'login':
        return <Login onBack={() => setScreen('welcome')} onSignup={() => setScreen('signup')} />;
```

(add `import { Login } from './Login';`)

- [ ] **Step 4: Verify**

`cd mobile && npx tsc --noEmit` → clean. With `backend` running (`npm run start:dev`) and `EXPO_PUBLIC_API_URL` pointed at it, verify: bad credentials → toast; seeded user (`riddhi@example.com` — check `backend/src/database/seed.ts` for password) → lands in AppShell.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/auth
git commit -m "feat(mobile): Login screen with password, Face ID and Google sign-in"
```

---

### Task 8: Mobile — Signup screen

**Files:**
- Create: `mobile/src/screens/auth/Signup.tsx`
- Modify: `mobile/src/screens/auth/AuthFlow.tsx` (plug in `Signup`)

**Interfaces:**
- Consumes: `useAuth().register`, `useGoogleAuth`, authUi atoms.
- Produces: `Signup({ onBack, onLogin })` — success flips AuthProvider to `onboarding`, unmounting the flow.

Source: `MobileAuth.jsx:193-274` (pwStrength + AuthSignup).

- [ ] **Step 1: Create `mobile/src/screens/auth/Signup.tsx`**

```tsx
/** Signup — RN port of AuthSignup (project/riddhi/MobileAuth.jsx:193-274). */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { useAuth } from '../../auth/AuthProvider';
import { Btn } from '../../components/ui';
import { useFeedback } from '../../feedback/FeedbackProvider';
import { ApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { weight } from '../../theme/tokens';
import {
  AuthDivider,
  AuthInput,
  AuthShell,
  Field,
  PasswordField,
  SocialRow,
  SpringIn,
  Wordmark,
} from './authUi';
import { useGoogleAuth } from './useGoogleAuth';

/** Password strength 0..4 (MobileAuth.jsx:193-200). */
export function pwStrength(p: string): number {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s;
}

const S_LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Check({ color = '#1a1228', size = 13, strokeWidth = 3.4 }: { color?: string; size?: number; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

export function Signup({ onBack, onLogin }: { onBack: () => void; onLogin: () => void }) {
  const { t } = useTheme();
  const { toast } = useFeedback();
  const { register } = useAuth();
  const { promptGoogle } = useGoogleAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pwd, setPwd] = useState('');
  const [agree, setAgree] = useState(false);
  const [pending, setPending] = useState(false);

  const strength = pwStrength(pwd);
  const sColors = [t.red, t.red, t.amber, t.blue, t.em];
  const canSubmit =
    name.trim().length > 0 && EMAIL_RE.test(email.trim()) && phone.length === 10 && strength >= 2 && agree;

  const submit = async () => {
    if (!canSubmit || pending) return;
    setPending(true);
    try {
      await register(name.trim(), email.trim(), pwd);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) toast('Email already in use', '⚠️');
      else toast('Could not reach the server', '📡');
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell onBack={onBack}>
      <SpringIn style={{ marginTop: 8, marginBottom: 22 }}>
        <Wordmark size={30} />
        <Text style={[styles.title, { color: t.text1, fontFamily: weight(800) }]}>Create your account</Text>
        <Text style={[styles.sub, { color: t.text2, fontFamily: weight(500) }]}>Two minutes to set up. Free forever to start.</Text>
      </SpringIn>

      <SpringIn delay={50}>
        <Field label="Full name">
          <AuthInput value={name} onChangeText={setName} placeholder="Riddhi Desai" autoComplete="name" />
        </Field>
        <Field label="Email">
          <AuthInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </Field>
        <Field label="Mobile number">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.ccBox, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
              <Text style={{ fontSize: 15, color: t.text2, fontFamily: weight(600) }}>🇮🇳 +91</Text>
            </View>
            <View style={{ flex: 1 }}>
              <AuthInput
                value={phone}
                onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
                placeholder="98765 43210"
                keyboardType="phone-pad"
              />
            </View>
          </View>
        </Field>
        <Field label="Password">
          <PasswordField value={pwd} onChange={setPwd} placeholder="Create a password" />
          {pwd ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 9 }}>
              <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={{ flex: 1, height: 4, borderRadius: 99, backgroundColor: i < strength ? sColors[strength] : t.bg3 }}
                  />
                ))}
              </View>
              <Text style={{ fontSize: 11.5, fontFamily: weight(700), color: sColors[strength], minWidth: 56, textAlign: 'right' }}>
                {S_LABELS[strength]}
              </Text>
            </View>
          ) : null}
        </Field>

        {/* Terms (MobileAuth.jsx:253-261) */}
        <Pressable onPress={() => setAgree((a) => !a)} style={styles.termsRow}>
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: agree ? t.em : t.glassBg,
                borderColor: agree ? t.em : t.glassBrd2,
              },
            ]}
          >
            {agree ? <Check /> : null}
          </View>
          <Text style={{ flex: 1, fontSize: 12.5, color: t.text2, lineHeight: 18.75, fontFamily: weight(500) }}>
            I agree to Riddhi’s <Text style={{ color: t.em, fontFamily: weight(600) }}>Terms of Service</Text> and{' '}
            <Text style={{ color: t.em, fontFamily: weight(600) }}>Privacy Policy</Text>.
          </Text>
        </Pressable>

        <Btn onPress={submit} disabled={!canSubmit || pending} style={{ height: 54, opacity: canSubmit ? 1 : 0.45 }}>
          <Text style={{ fontSize: 16, color: '#1a1228', fontFamily: weight(600) }}>
            {pending ? 'Creating…' : 'Create account'}
          </Text>
        </Btn>

        <AuthDivider label="or sign up with" />
        <SocialRow onGoogle={promptGoogle} onApple={() => toast('Apple sign-in coming soon', '🍎')} />
      </SpringIn>

      <View style={{ alignItems: 'center', marginTop: 26, flexDirection: 'row', justifyContent: 'center' }}>
        <Text style={{ fontSize: 14, color: t.text2, fontFamily: weight(500) }}>Already have an account? </Text>
        <Pressable onPress={onLogin}>
          <Text style={{ fontSize: 14, color: t.em, fontFamily: weight(700) }}>Log in</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 26,
    letterSpacing: -0.78,
    marginTop: 20,
  },
  sub: {
    fontSize: 14,
    marginTop: 6,
  },
  ccBox: {
    height: 50,
    paddingHorizontal: 15,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    marginTop: 6,
    marginHorizontal: 2,
    marginBottom: 20,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    marginTop: 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

Note: the phone number is collected per the design but not sent to `POST /auth/register` (the backend DTO has no phone field) — this matches the spec's scope. The `Btn` disabled opacity is overridden to the mockup's 0.45 via the style prop (Btn's own is 0.5; the style wins since opacity is on the outer wrapper — verify visually; if Btn's internal opacity applies instead, this 0.05 difference is acceptable).

- [ ] **Step 2: Plug into AuthFlow**

```tsx
      case 'signup':
        return <Signup onBack={() => setScreen('welcome')} onLogin={() => setScreen('login')} />;
```

(add `import { Signup } from './Signup';`)

- [ ] **Step 3: Verify**

`cd mobile && npx tsc --noEmit` → clean. Manual: strength meter animates through colors; submit disabled until all fields valid + terms; successful signup lands on the onboarding placeholder.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/auth
git commit -m "feat(mobile): Signup screen with password strength + terms"
```

---

### Task 9: Mobile — onboarding wizard scaffold + steps 1–3

**Files:**
- Create: `mobile/src/screens/onboarding/obUi.tsx` (OBProgress, OBStep, OBKeypad, OBFooter)
- Create: `mobile/src/screens/onboarding/steps.tsx` (OBGoals, OBIncome, OBAccounts — steps 4–6 added in Task 10)

**Interfaces:**
- Produces (Task 10 consumes):
  - `OBStep({ step, total, onBack, kicker?, title, sub?, footer, children })`
  - `OBKeypad({ onKey: (k: string) => void })` — keys `'1'..'9' '.' '0' 'del'`
  - `OBFooter({ canNext, label, onNext, onSkip? })`
  - `OBGoals({ value: string[], onChange })` — ids `track|save|budget|invest|debt`
  - `OBIncome({ value: string, onChange: (updater: (a: string) => string) => void })`
  - `OBAccounts({ value: string[], onChange })` — ids `hdfc|icici|sbi|axis|paytm|zerodha`; `BANKS` export maps id→display name
  - `amountKey(a: string, k: string): string` — shared keypad reducer (9-digit cap, no decimals, leading-zero swap)

Source: `MobileOnboard.jsx:1-178`.

- [ ] **Step 1: Create `mobile/src/screens/onboarding/obUi.tsx`**

```tsx
/**
 * Onboarding scaffold — RN port of OBProgress/OBStep/OBKeypad + the footer
 * factory (project/riddhi/MobileOnboard.jsx:6-47, 85-101, 382-387).
 */
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, IconButton } from '../../components/ui';
import { MI } from '../../components/icons';
import { PageBackground } from '../../components/PageBackground';
import { useTheme } from '../../theme/ThemeProvider';
import { weight } from '../../theme/tokens';
import { PressableScale, SpringIn } from '../auth/authUi';

// ── Progress bar (MobileOnboard.jsx:6-19) ───────────────────────────
export function OBProgress({ step, total }: { step: number; total: number }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.progressTrack, { backgroundColor: t.bg3 }]}>
          <View
            style={{
              height: '100%',
              borderRadius: 99,
              backgroundColor: t.em,
              width: i <= step ? '100%' : '0%',
              opacity: i <= step ? 1 : 0,
            }}
          />
        </View>
      ))}
    </View>
  );
}

// ── Step scaffold (MobileOnboard.jsx:22-47) ─────────────────────────
export function OBStep({
  step,
  total,
  onBack,
  kicker,
  title,
  sub,
  children,
  footer,
}: {
  step: number;
  total: number;
  onBack: () => void;
  kicker?: string;
  title: string;
  sub?: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <PageBackground />
      <View style={styles.topbar}>
        <IconButton onPress={onBack}>
          <MI.back size={20} color={t.text1} />
        </IconButton>
        <View style={{ flex: 1 }}>
          <OBProgress step={step} total={total} />
        </View>
        <Text style={{ fontSize: 12.5, color: t.text3, fontFamily: weight(700) }}>
          {step + 1}/{total}
        </Text>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 26, paddingBottom: 24 }}
      >
        <SpringIn>
          {kicker ? (
            <Text style={[styles.kicker, { color: t.em, fontFamily: weight(700) }]}>{kicker.toUpperCase()}</Text>
          ) : null}
          <Text style={[styles.title, { color: t.text1, fontFamily: weight(800) }]}>{title}</Text>
          {sub ? <Text style={[styles.sub, { color: t.text2, fontFamily: weight(500) }]}>{sub}</Text> : null}
        </SpringIn>
        <SpringIn delay={50} style={{ marginTop: 22 }}>
          {children}
        </SpringIn>
      </ScrollView>
      {/* Sticky footer (MobileOnboard.jsx:40-44): border-top + frosted bg. */}
      <View
        style={[
          styles.footer,
          {
            borderTopColor: t.border,
            backgroundColor: t.tabbarBg,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        {footer}
      </View>
    </View>
  );
}

// ── Footer factory (MobileOnboard.jsx:382-387) ──────────────────────
export function OBFooter({
  canNext,
  label,
  onNext,
  onSkip,
}: {
  canNext: boolean;
  label: string;
  onNext: () => void;
  onSkip?: () => void;
}) {
  const { t } = useTheme();
  return (
    <View>
      <Btn onPress={onNext} disabled={!canNext} style={{ height: 54, opacity: canNext ? 1 : 0.45 }}>
        <Text style={{ fontSize: 16, color: '#1a1228', fontFamily: weight(600) }}>{label}</Text>
      </Btn>
      {onSkip ? (
        <Pressable onPress={onSkip} style={{ paddingVertical: 8, marginTop: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 13.5, color: t.text3, fontFamily: weight(600) }}>Skip for now</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Numeric keypad (MobileOnboard.jsx:85-101) ───────────────────────
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

function DelIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
      <Line x1={18} y1={9} x2={12} y2={15} />
      <Line x1={12} y1={9} x2={18} y2={15} />
    </Svg>
  );
}

export function OBKeypad({ onKey }: { onKey: (k: string) => void }) {
  const { t } = useTheme();
  return (
    <View style={styles.keypad}>
      {KEYS.map((k) => (
        <PressableScale key={k} onPress={() => onKey(k)} style={styles.keyWrap}>
          <View style={[styles.key, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
            {k === 'del' ? (
              <DelIcon color={t.text1} />
            ) : (
              <Text style={{ fontSize: 22, color: t.text1, fontFamily: weight(600) }}>{k}</Text>
            )}
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

/** Shared amount reducer (MobileOnboard.jsx:105-111 / 231-237). */
export function amountKey(a: string, k: string): string {
  if (k === 'del') return a.slice(0, -1);
  if (k === '.') return a;
  if (a.replace(/\D/g, '').length >= 9) return a;
  if (a === '0') return k;
  return a + k;
}

const styles = StyleSheet.create({
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 99,
    overflow: 'hidden',
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  kicker: {
    fontSize: 11.5,
    letterSpacing: 1.15, // 0.1em of 11.5px
    marginBottom: 10,
  },
  title: {
    fontSize: 25,
    letterSpacing: -0.75, // -0.03em of 25px
    lineHeight: 28.75,
  },
  sub: {
    fontSize: 14,
    marginTop: 8,
    lineHeight: 21,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: 26,
    borderTopWidth: 1,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keyWrap: {
    flexBasis: '31%',
    flexGrow: 1,
  },
  key: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

- [ ] **Step 2: Create `mobile/src/screens/onboarding/steps.tsx` with steps 1–3**

```tsx
/**
 * Wizard step bodies — RN port of OBGoals/OBIncome/OBAccounts
 * (project/riddhi/MobileOnboard.jsx:50-178). Steps 4-6 (OBSync/OBGoal/
 * OBSecure) are appended in the next task.
 */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Polyline, Rect } from 'react-native-svg';

import { Chip } from '../../components/ui';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, weight } from '../../theme/tokens';
import { PressableScale } from '../auth/authUi';
import { OBKeypad, amountKey } from './obUi';

export function CheckSm({ color = '#1a1228', size = 13, strokeWidth = 3.4 }: { color?: string; size?: number; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

// ── Step 1: Goals (MobileOnboard.jsx:50-82) ─────────────────────────
export const GOAL_OPTS = [
  { id: 'track', i: '📊', l: 'Track my spending', d: 'See where money goes' },
  { id: 'save', i: '🌱', l: 'Save more', d: 'Build a cushion' },
  { id: 'budget', i: '◎', l: 'Stick to a budget', d: 'Spend with intent' },
  { id: 'invest', i: '▲', l: 'Grow investments', d: 'Track my portfolio' },
  { id: 'debt', i: '✂️', l: 'Pay off debt', d: 'Clear cards & loans' },
];

export function OBGoals({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTheme();
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <View style={{ gap: 10 }}>
      {GOAL_OPTS.map((o) => {
        const on = value.includes(o.id);
        return (
          <PressableScale key={o.id} onPress={() => toggle(o.id)}>
            <View
              style={[
                styles.optRow,
                { backgroundColor: on ? t.emDim : t.glassBg, borderColor: on ? t.emGlow : t.glassBrd },
              ]}
            >
              <View style={[styles.optIcon, { backgroundColor: on ? t.em : t.bg3 }]}>
                <Text style={{ fontSize: 20, color: on ? '#1a1228' : t.text2 }}>{o.i}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14.5, fontFamily: weight(700), color: on ? t.em : t.text1 }}>{o.l}</Text>
                <Text style={{ fontSize: 11.5, color: t.text3, marginTop: 2, fontFamily: weight(500) }}>{o.d}</Text>
              </View>
              <View
                style={[
                  styles.radio,
                  { backgroundColor: on ? t.em : 'transparent', borderColor: on ? t.em : t.borderStr },
                ]}
              >
                {on ? <CheckSm /> : null}
              </View>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

// ── Step 2: Income (MobileOnboard.jsx:104-136) ──────────────────────
const INCOME_PRESETS = [30000, 60000, 100000, 200000];

export function OBIncome({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTheme();
  return (
    <View>
      <View style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
          <Text style={{ fontSize: 28, color: t.text3, fontFamily: weight(600) }}>₹</Text>
          <Text
            style={{
              fontSize: 54,
              fontFamily: weight(800),
              letterSpacing: -1.89, // -0.035em of 54px
              color: value === '' ? t.text3 : t.text1,
              lineHeight: 58,
            }}
          >
            {value === '' ? '0' : Number(value).toLocaleString('en-IN')}
          </Text>
        </View>
        <Text style={{ fontSize: 12.5, color: t.text3, marginTop: 8, fontFamily: weight(500) }}>
          per month · you can change this later
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 22 }}>
        {INCOME_PRESETS.map((p) => (
          <Chip key={p} onPress={() => onChange(String(p))}>
            {`₹${p >= 100000 ? `${p / 100000}L` : `${p / 1000}K`}`}
          </Chip>
        ))}
      </View>

      <OBKeypad onKey={(k) => onChange(amountKey(value, k))} />
    </View>
  );
}

// ── Step 3: Accounts (MobileOnboard.jsx:139-178) ────────────────────
export const BANKS = [
  { id: 'hdfc', n: 'HDFC Bank', logo: 'H', col: '#004c8f' },
  { id: 'icici', n: 'ICICI Bank', logo: 'I', col: '#ae282e' },
  { id: 'sbi', n: 'SBI', logo: 'S', col: '#2d4d8f' },
  { id: 'axis', n: 'Axis Bank', logo: 'A', col: '#97144d' },
  { id: 'paytm', n: 'Paytm', logo: 'P', col: '#00398f' },
  { id: 'zerodha', n: 'Zerodha', logo: 'Z', col: '#387ed1' },
];

function LockIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={11} width={18} height={11} rx={2} />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Svg>
  );
}

export function OBAccounts({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTheme();
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <View>
      <View style={styles.bankGrid}>
        {BANKS.map((b) => {
          const on = value.includes(b.id);
          return (
            <PressableScale key={b.id} onPress={() => toggle(b.id)} style={styles.bankCell}>
              <View
                style={[
                  styles.bankRow,
                  { backgroundColor: on ? t.emDim : t.glassBg, borderColor: on ? t.emGlow : t.glassBrd },
                ]}
              >
                <View style={[styles.bankLogo, { backgroundColor: b.col }]}>
                  <Text style={{ fontSize: 15, color: '#fff', fontFamily: weight(700) }}>{b.logo}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 13, color: t.text1, fontFamily: weight(700) }} numberOfLines={1}>
                  {b.n}
                </Text>
                {on ? (
                  <View style={[styles.bankCheck, { backgroundColor: t.em }]}>
                    <CheckSm size={11} strokeWidth={3.6} />
                  </View>
                ) : null}
              </View>
            </PressableScale>
          );
        })}
      </View>
      <View style={[styles.securityNote, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
        <View style={{ marginTop: 1 }}>
          <LockIcon color={t.em} />
        </View>
        <Text style={{ flex: 1, fontSize: 11.5, color: t.text3, lineHeight: 17.25, fontFamily: weight(500) }}>
          Bank-grade 256-bit encryption. Riddhi is read-only — we can never move your money.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  optIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bankCell: {
    flexBasis: '47%',
    flexGrow: 1,
  },
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  bankLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
```

- [ ] **Step 3: Verify**

`cd mobile && npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/onboarding
git commit -m "feat(mobile): onboarding scaffold + goals/income/accounts steps"
```

---

### Task 10: Mobile — steps 4–6, Done screen, wizard orchestrator, completion wiring

**Files:**
- Modify: `mobile/src/screens/onboarding/steps.tsx` (append OBSync, OBGoal, OBSecure)
- Create: `mobile/src/screens/onboarding/Done.tsx`
- Modify: `mobile/src/screens/onboarding/Wizard.tsx` (replace placeholder with orchestrator)

**Interfaces:**
- Consumes: everything from Tasks 3–5, 9; `useAuth().completeOnboarding/logout`; `tokenStore.savePin/setBiometricEnabled`; `Toggle` from `components/ui`; `LocalAuthentication`.
- Produces: `OnboardingWizard()` (already imported by Root from Task 4).

Source: `MobileOnboard.jsx:181-443`.

- [ ] **Step 1: Append steps 4–6 to `steps.tsx`**

```tsx
// ── Step 4: Auto-sync (MobileOnboard.jsx:181-221) ───────────────────
const SYNC_FEATS = [
  { i: '⚡', l: 'Zero manual entry', d: 'Spends, salary and bills appear on their own' },
  { i: '🔒', l: 'Fully on-device', d: 'Message content never leaves your phone' },
  { i: '🏷', l: 'Auto-categorized', d: 'Riddhi tags the merchant and category' },
];

function SyncIcon({ color }: { color: string }) {
  return (
    <Svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <Path d="M3 3v5h5" />
      <Path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <Path d="M16 16h5v5" />
    </Svg>
  );
}

export function OBSync({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTheme();
  return (
    <View>
      <View style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 22 }}>
        <View style={[styles.syncBadge, { backgroundColor: value ? t.emDim : t.bg3 }]}>
          <SyncIcon color={value ? t.em : t.text3} />
        </View>
      </View>

      <PressableScale onPress={() => onChange(!value)}>
        <View style={[styles.syncToggleRow, { backgroundColor: t.glassBg, borderColor: value ? t.emGlow : t.glassBrd }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, color: t.text1, fontFamily: weight(700) }}>Read bank SMS</Text>
            <Text style={{ fontSize: 12, color: t.text3, marginTop: 3, fontFamily: weight(500) }}>
              Auto-log transactions as they arrive
            </Text>
          </View>
          <Toggle on={value} onChange={onChange} />
        </View>
      </PressableScale>

      <View style={{ gap: 12, marginTop: 22 }}>
        {SYNC_FEATS.map((x) => (
          <View key={x.l} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={[styles.syncFeatIcon, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
              <Text style={{ fontSize: 15 }}>{x.i}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, color: t.text1, fontFamily: weight(700) }}>{x.l}</Text>
              <Text style={{ fontSize: 11.5, color: t.text3, marginTop: 2, lineHeight: 16.1, fontFamily: weight(500) }}>{x.d}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Step 5: First goal (MobileOnboard.jsx:224-268) ──────────────────
export const GOAL_PRESETS = [
  { l: 'Emergency fund', i: '🛟', amt: 200000 },
  { l: 'Goa trip', i: '🏖', amt: 50000 },
  { l: 'New iPhone', i: '📱', amt: 80000 },
  { l: 'House down pay', i: '🏠', amt: 1000000 },
];

export function OBGoal({
  name,
  onName,
  target,
  onTarget,
}: {
  name: string;
  onName: (v: string) => void;
  target: string;
  onTarget: (v: string) => void;
}) {
  const { t } = useTheme();
  return (
    <View>
      <AuthInput value={name} onChangeText={onName} placeholder="Name your goal" style={{ marginBottom: 12 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {GOAL_PRESETS.map((p) => {
          const on = name === p.l;
          return (
            <Pressable
              key={p.l}
              onPress={() => {
                onName(p.l);
                onTarget(String(p.amt));
              }}
            >
              <View
                style={[
                  styles.goalPreset,
                  { backgroundColor: on ? t.emDim : t.bg2, borderColor: on ? t.emGlow : t.border },
                ]}
              >
                <Text style={{ fontSize: 15 }}>{p.i}</Text>
                <Text style={{ fontSize: 13, color: on ? t.em : t.text2, fontFamily: weight(600) }}>{p.l}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ alignItems: 'center', paddingTop: 20, paddingBottom: 16 }}>
        <Text style={[styles.targetLabel, { color: t.text3, fontFamily: weight(700) }]}>TARGET AMOUNT</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
          <Text style={{ fontSize: 26, color: t.text3, fontFamily: weight(600) }}>₹</Text>
          <Text
            style={{
              fontSize: 48,
              fontFamily: weight(800),
              letterSpacing: -1.68, // -0.035em of 48px
              color: target === '' ? t.text3 : t.em,
              lineHeight: 52,
            }}
          >
            {target === '' ? '0' : Number(target).toLocaleString('en-IN')}
          </Text>
        </View>
      </View>

      <OBKeypad onKey={(k) => onTarget(amountKey(target, k))} />
    </View>
  );
}

// ── Step 6: Secure (MobileOnboard.jsx:271-308) ──────────────────────
function FaceIdSm({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2a5 5 0 0 0-5 5v3a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5z" />
      <Path d="M4 11v2a8 8 0 0 0 16 0v-2" />
    </Svg>
  );
}

export function OBSecure({
  pin,
  onPin,
  biometric,
  onBiometric,
}: {
  pin: string;
  onPin: (v: string) => void;
  biometric: boolean;
  onBiometric: (v: boolean) => void;
}) {
  const { t } = useTheme();
  const press = (k: string) => {
    if (k === 'del') return onPin(pin.slice(0, -1));
    if (k === '.') return;
    if (pin.length >= 4) return;
    onPin(pin + k);
  };
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, paddingTop: 8, paddingBottom: 26 }}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: i < pin.length ? t.em : 'transparent',
              borderWidth: 2,
              borderColor: i < pin.length ? t.em : t.borderStr,
              transform: [{ scale: i < pin.length ? 1.1 : 1 }],
            }}
          />
        ))}
      </View>

      <OBKeypad onKey={press} />

      <PressableScale onPress={() => onBiometric(!biometric)}>
        <View style={[styles.bioRow, { backgroundColor: t.glassBg, borderColor: biometric ? t.emGlow : t.glassBrd }]}>
          <View style={[styles.bioIcon, { backgroundColor: biometric ? t.emDim : t.bg3 }]}>
            <FaceIdSm color={biometric ? t.em : t.text3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5, color: t.text1, fontFamily: weight(700) }}>Enable Face ID</Text>
            <Text style={{ fontSize: 11.5, color: t.text3, marginTop: 2, fontFamily: weight(500) }}>
              Unlock without typing your PIN
            </Text>
          </View>
          <Toggle on={biometric} onChange={onBiometric} />
        </View>
      </PressableScale>
    </View>
  );
}
```

Also extend `steps.tsx` imports: add `Pressable, ScrollView` to the `react-native` import, `Toggle` to the `components/ui` import, `AuthInput` to the `../auth/authUi` import, and append to `styles`:

```ts
  syncBadge: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  syncToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: 1 },
  syncFeatIcon: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  goalPreset: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1 },
  targetLabel: { fontSize: 11.5, letterSpacing: 0.92, marginBottom: 8 },
  bioRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15, paddingHorizontal: 16, marginTop: 20, borderRadius: radius.lg, borderWidth: 1 },
  bioIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
```

- [ ] **Step 2: Create `mobile/src/screens/onboarding/Done.tsx`**

```tsx
/** Success screen — RN port of OBDone (project/riddhi/MobileOnboard.jsx:311-350). */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Polyline, RadialGradient, Stop } from 'react-native-svg';

import { Btn } from '../../components/ui';
import { PageBackground } from '../../components/PageBackground';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, weight } from '../../theme/tokens';
import { SpringIn } from '../auth/authUi';

export interface DoneSummaryItem {
  i: string;
  l: string;
  v: string;
}

export function OBDone({
  summary,
  onEnter,
  entering,
}: {
  summary: DoneSummaryItem[];
  onEnter: () => void;
  entering: boolean;
}) {
  const { t } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <PageBackground />
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26 }}
      >
        <View style={{ paddingTop: 72, alignItems: 'center' }}>
          <SpringIn>
            <View style={{ width: 104, height: 104, marginBottom: 26 }}>
              <View pointerEvents="none" style={styles.doneGlow}>
                <Svg width={152} height={152}>
                  <Defs>
                    <RadialGradient id="doneGlow" cx="50%" cy="50%" r="50%">
                      <Stop offset="0%" stopColor="rgba(182,164,243,0.35)" />
                      <Stop offset="70%" stopColor="rgba(182,164,243,0)" />
                    </RadialGradient>
                  </Defs>
                  <Circle cx={76} cy={76} r={76} fill="url(#doneGlow)" />
                </Svg>
              </View>
              <LinearGradient
                colors={[t.em, '#9d8bd6']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={styles.doneBadge}
              >
                <Svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke="#1a1228" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
                  <Polyline points="20 6 9 17 4 12" />
                </Svg>
              </LinearGradient>
            </View>
          </SpringIn>
          <SpringIn delay={60} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 28, color: t.text1, fontFamily: weight(800), letterSpacing: -0.84 }}>
              You’re all set
            </Text>
            <Text style={styles.doneSubWrap(t.text2)}>
              Riddhi is tuned to your money. Here’s what we set up:
            </Text>
          </SpringIn>
        </View>

        <SpringIn delay={120} style={{ marginTop: 26, gap: 10 }}>
          {summary.map((s) => (
            <View key={s.l} style={[styles.sumRow, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
              <View style={[styles.sumIcon, { backgroundColor: t.emDim }]}>
                <Text style={{ fontSize: 16, color: t.em }}>{s.i}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 11, color: t.text3, fontFamily: weight(600), letterSpacing: 0.66 }}>
                  {s.l.toUpperCase()}
                </Text>
                <Text style={{ fontSize: 14, color: t.text1, fontFamily: weight(700), marginTop: 2 }}>{s.v}</Text>
              </View>
            </View>
          ))}
        </SpringIn>

        <View style={{ marginTop: 'auto', paddingTop: 28, paddingBottom: 20 }}>
          <Btn onPress={onEnter} disabled={entering} style={{ height: 54 }}>
            <Text style={{ fontSize: 16, color: '#1a1228', fontFamily: weight(600) }}>
              {entering ? 'Setting up…' : 'Enter Riddhi'}
            </Text>
          </Btn>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = {
  doneGlow: { position: 'absolute' as const, top: -24, left: -24 },
  doneBadge: {
    width: 104,
    height: 104,
    borderRadius: radius.xl2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    shadowColor: 'rgba(139,108,240,0.4)',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 1,
    shadowRadius: 40,
    elevation: 12,
  },
  doneSubWrap: (color: string) => ({
    fontSize: 14.5,
    color,
    marginTop: 10,
    lineHeight: 21.75,
    maxWidth: 280,
    textAlign: 'center' as const,
    fontFamily: weight(500),
  }),
  sumRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 13,
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  sumIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
```

(If the object-literal style form fights the linter, convert to `StyleSheet.create` with the `doneSubWrap` inlined at the call site.)

- [ ] **Step 3: Replace `Wizard.tsx` with the orchestrator**

```tsx
/**
 * Onboarding wizard — RN port of the Onboarding orchestrator
 * (project/riddhi/MobileOnboard.jsx:355-441). Completion calls
 * POST /users/me/onboarding via useAuth().completeOnboarding; PIN and
 * biometric flag are stored on-device (spec § Biometric + PIN).
 */
import { useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';

import { useAuth } from '../../auth/AuthProvider';
import { useFeedback } from '../../feedback/FeedbackProvider';
import { savePin, setBiometricEnabled } from '../../auth/tokenStore';
import { OBDone } from './Done';
import { OBFooter, OBStep } from './obUi';
import { BANKS, OBAccounts, OBGoal, OBGoals, OBIncome, OBSecure, OBSync } from './steps';

const TOTAL = 6;

export function OnboardingWizard() {
  const { completeOnboarding, logout } = useAuth();
  const { toast } = useFeedback();

  const [step, setStep] = useState(0);
  const [goals, setGoals] = useState<string[]>(['track']);
  const [income, setIncome] = useState('');
  const [accounts, setAccounts] = useState<string[]>([]);
  const [sync, setSync] = useState(true);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [pin, setPin] = useState('');
  const [biometric, setBiometric] = useState(true);
  const [entering, setEntering] = useState(false);

  const next = () => setStep((s) => Math.min(s + 1, TOTAL));
  const back = () => {
    if (step === 0) {
      // Exiting the wizard signs the fresh account out, back to Welcome.
      void logout();
    } else {
      setStep((s) => s - 1);
    }
  };

  // Real biometric check before enabling the toggle (spec § Biometric).
  const onBiometric = async (v: boolean) => {
    if (!v) {
      setBiometric(false);
      return;
    }
    const hardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hardware || !enrolled) {
      toast('Face ID not available on this device', '🔒');
      return;
    }
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Enable Face ID' });
    if (res.success) setBiometric(true);
  };

  const fmtAmt = (n: string) => (n === '' ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);

  const summary = [
    { i: '🎯', l: 'Focus', v: goals.length ? `${goals.length} goal${goals.length > 1 ? 's' : ''} selected` : 'Getting started' },
    { i: '💰', l: 'Monthly income', v: fmtAmt(income) },
    { i: '🏦', l: 'Accounts', v: accounts.length ? `${accounts.length} connected` : 'Add later' },
    { i: '🌱', l: 'First goal', v: goalName ? `${goalName} · ${fmtAmt(goalTarget)}` : 'Skipped' },
    { i: '🔒', l: 'Security', v: `PIN${biometric ? ' + Face ID' : ''}` },
  ];

  const enter = async () => {
    if (entering) return;
    setEntering(true);
    try {
      await savePin(pin);
      await setBiometricEnabled(biometric);
      await completeOnboarding({
        focusGoals: goals,
        monthlyIncome: income === '' ? undefined : Number(income),
        selectedBanks: accounts.map((id) => BANKS.find((b) => b.id === id)?.n ?? id),
        smsSyncEnabled: sync,
        biometricEnabled: biometric,
        firstGoal:
          goalName && goalTarget ? { name: goalName, targetAmount: Number(goalTarget) } : undefined,
      });
      // Success: AuthProvider flips status to signedIn and unmounts us.
    } catch {
      toast('Could not finish setup — tap to retry', '📡');
      setEntering(false);
    }
  };

  if (step >= TOTAL) {
    return <OBDone summary={summary} onEnter={enter} entering={entering} />;
  }

  const common = { step, total: TOTAL, onBack: back };

  switch (step) {
    case 0:
      return (
        <OBStep {...common} kicker="Let's personalize" title="What brings you to Riddhi?" sub="Pick all that apply — we'll shape your home screen around them."
          footer={<OBFooter canNext={goals.length > 0} label="Continue" onNext={next} />}>
          <OBGoals value={goals} onChange={setGoals} />
        </OBStep>
      );
    case 1:
      return (
        <OBStep {...common} kicker="Your baseline" title="What's your monthly income?" sub="This helps Riddhi suggest budgets and a healthy savings rate."
          footer={<OBFooter canNext={income !== ''} label="Continue" onNext={next} onSkip={next} />}>
          <OBIncome value={income} onChange={setIncome} />
        </OBStep>
      );
    case 2:
      return (
        <OBStep {...common} kicker="Connect" title="Link your accounts" sub="Select the banks and wallets you use. You can add more anytime."
          footer={
            <OBFooter
              canNext
              label={accounts.length ? `Connect ${accounts.length} account${accounts.length > 1 ? 's' : ''}` : 'Continue'}
              onNext={next}
              onSkip={accounts.length === 0 ? next : undefined}
            />
          }>
          <OBAccounts value={accounts} onChange={setAccounts} />
        </OBStep>
      );
    case 3:
      return (
        <OBStep {...common} kicker="Automate" title="Log spends automatically" sub="Riddhi reads your bank's transaction SMS so you never type an expense again."
          footer={<OBFooter canNext label={sync ? 'Turn on auto-sync' : 'Continue'} onNext={next} />}>
          <OBSync value={sync} onChange={setSync} />
        </OBStep>
      );
    case 4:
      return (
        <OBStep {...common} kicker="Aim" title="Set your first goal" sub="A target to save toward. Pick a preset or make your own."
          footer={
            <OBFooter
              canNext
              label={goalName && goalTarget ? 'Create goal' : 'Continue'}
              onNext={next}
              onSkip={!(goalName && goalTarget) ? next : undefined}
            />
          }>
          <OBGoal name={goalName} onName={setGoalName} target={goalTarget} onTarget={setGoalTarget} />
        </OBStep>
      );
    case 5:
      return (
        <OBStep {...common} kicker="Protect" title="Secure your money" sub="Set a 4-digit PIN to lock the app. Add Face ID for one-tap access."
          footer={<OBFooter canNext={pin.length === 4} label="Finish setup" onNext={next} />}>
          <OBSecure pin={pin} onPin={setPin} biometric={biometric} onBiometric={(v) => void onBiometric(v)} />
        </OBStep>
      );
    default:
      return null;
  }
}
```

Check `expo-linear-gradient` is in `mobile/package.json` dependencies (it is: `~56.0.4`).

- [ ] **Step 4: Verify end-to-end**

1. `cd mobile && npx tsc --noEmit` → clean.
2. Backend running with fresh DB (or a new email): signup → wizard appears; walk all 6 steps; skip paths work; Done summary reflects choices; "Enter Riddhi" → lands in AppShell.
3. Verify server state: `curl -s -H "Authorization: Bearer <token>" http://localhost:3000/users/me/preferences` shows `onboardingCompleted: true`, income, focusGoals, selectedBanks; `/goals` contains the first goal (if set).
4. Kill + relaunch the app → session restores straight into AppShell (no auth screens).
5. Compare each screen side-by-side with `Riddhi Auth.html` in a browser for design fidelity.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/onboarding
git commit -m "feat(mobile): onboarding wizard steps 4-6, success screen and completion wiring"
```

---

### Task 11: Final verification sweep

**Files:** none new.

- [ ] **Step 1: Backend checks**

```bash
cd backend && npm run lint && npm test && npm run build
```
Expected: all pass.

- [ ] **Step 2: Mobile checks**

```bash
cd mobile && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Manual smoke matrix**

- Login with wrong password → "Invalid email or password" toast.
- Signup with an existing email → "Email already in use" toast.
- Google button without `EXPO_PUBLIC_GOOGLE_CLIENT_ID` → "Google sign-in not configured yet" toast.
- Apple button → "Apple sign-in coming soon" toast.
- Onboarding back from step 0 → returns to Welcome (signed out).
- Onboarding completion with backend stopped → retry toast, button re-enabled.
- Relaunch after completion → straight to AppShell; relaunch after logout → Welcome.

- [ ] **Step 4: Commit any fixes, then report**

Summarize deviations (if any) from the design handoff for user sign-off.
