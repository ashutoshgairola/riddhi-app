import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { User } from './user.entity';
import { UserPreferences } from './user-preferences.entity';
import { GoalsService } from '../goals/goals.service';
import { GoalType } from '../common/enums';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly goalsService: GoalsService,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    Object.assign(user, dto);
    return this.usersRepository.save(user);
  }

  async getPreferences(userId: string): Promise<UserPreferences> {
    let prefs = await this.usersRepository.findPreferencesByUserId(userId);
    if (!prefs) {
      prefs = this.usersRepository.createDefaultPreferences(userId);
      prefs = await this.usersRepository.savePreferences(prefs);
    }
    return prefs;
  }

  async updatePreferences(
    userId: string,
    dto: UpdatePreferencesDto,
  ): Promise<UserPreferences> {
    const prefs = await this.getPreferences(userId);
    Object.assign(prefs, dto);
    return this.usersRepository.savePreferences(prefs);
  }

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
      });
    }

    return { user: savedUser, preferences };
  }
}
