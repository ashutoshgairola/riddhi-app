import { Injectable, NotFoundException } from '@nestjs/common';
import { GoalsRepository } from './goals.repository';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { Goal } from './goal.entity';
import { ContributionFrequency } from '../common/enums';

const PERIODS_PER_YEAR: Record<ContributionFrequency, number> = {
  [ContributionFrequency.DAILY]: 365,
  [ContributionFrequency.WEEKLY]: 52,
  [ContributionFrequency.BIWEEKLY]: 26,
  [ContributionFrequency.MONTHLY]: 12,
};

function computeGoalFields(goal: Goal) {
  const targetAmount = Number(goal.targetAmount);
  const currentAmount = Number(goal.currentAmount);

  const progressPct =
    targetAmount > 0
      ? Math.round(
          Math.min(Math.max((currentAmount / targetAmount) * 100, 0), 100),
        )
      : 0;
  const remaining = Math.max(targetAmount - currentAmount, 0);

  let projectedCompletionDate: string | null = null;

  if (
    goal.contributionAmount != null &&
    Number(goal.contributionAmount) > 0 &&
    goal.contributionFrequency != null
  ) {
    const periodsPerYear = PERIODS_PER_YEAR[goal.contributionFrequency];
    const amountPerYear = Number(goal.contributionAmount) * periodsPerYear;
    const yearsToGo = remaining / amountPerYear;
    const date = new Date(Date.now() + yearsToGo * 365.25 * 24 * 3600 * 1000);
    projectedCompletionDate = date.toISOString().split('T')[0];
  }

  return {
    ...goal,
    progressPct,
    remaining,
    projectedCompletionDate,
  };
}

@Injectable()
export class GoalsService {
  constructor(private readonly goalsRepository: GoalsRepository) {}

  async findAll(userId: string) {
    const goals = await this.goalsRepository.findAllByUser(userId);
    return goals.map(computeGoalFields);
  }

  async findOne(id: string, userId: string) {
    const goal = await this.goalsRepository.findOneByUser(id, userId);
    if (!goal) throw new NotFoundException('Goal not found');
    return computeGoalFields(goal);
  }

  async create(userId: string, dto: CreateGoalDto) {
    const goal = this.goalsRepository.create({
      ...dto,
      userId,
      startDate: new Date(dto.startDate),
      targetDate: new Date(dto.targetDate),
    });
    const saved = await this.goalsRepository.save(goal);
    return computeGoalFields(saved);
  }

  async update(id: string, userId: string, dto: UpdateGoalDto) {
    const goal = await this.goalsRepository.findOneByUser(id, userId);
    if (!goal) throw new NotFoundException('Goal not found');
    Object.assign(goal, dto);
    const saved = await this.goalsRepository.save(goal);
    return computeGoalFields(saved);
  }

  async remove(id: string, userId: string): Promise<void> {
    const goal = await this.goalsRepository.findOneByUser(id, userId);
    if (!goal) throw new NotFoundException('Goal not found');
    await this.goalsRepository.remove(goal);
  }
}
