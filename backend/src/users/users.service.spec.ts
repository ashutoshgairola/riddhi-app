import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { GoalsService } from '../goals/goals.service';
import { User } from './user.entity';
import { UserPreferences } from './user-preferences.entity';

describe('UsersService.completeOnboarding', () => {
  let service: UsersService;

  const user = {
    id: 'u1',
    name: 'Riddhi',
    email: 'r@x.com',
    isFirstLogin: true,
  } as User;
  const prefs = { id: 'p1', userId: 'u1' } as UserPreferences;

  const usersRepository = {
    findById: jest.fn().mockResolvedValue(user),
    save: jest.fn().mockImplementation((u: User) => Promise.resolve(u)),
    findPreferencesByUserId: jest.fn().mockResolvedValue(prefs),
    savePreferences: jest
      .fn()
      .mockImplementation((p: UserPreferences) => Promise.resolve(p)),
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
        // completeOnboarding doesn't touch the DataSource (only deleteAccount
        // does); a stub satisfies Nest DI.
        { provide: DataSource, useValue: { transaction: jest.fn() } },
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
