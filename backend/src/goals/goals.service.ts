import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GoalsRepository } from './goals.repository';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { Goal } from './goal.entity';
import { ContributionFrequency } from '../common/enums';
import { GOAL_UPDATED } from '../notifications/notification-events';

const PERIODS_PER_YEAR: Record<ContributionFrequency, number> = {
  [ContributionFrequency.DAILY]: 365,
  [ContributionFrequency.WEEKLY]: 52,
  [ContributionFrequency.BIWEEKLY]: 26,
  [ContributionFrequency.MONTHLY]: 12,
};

export function computeGoalFields(goal: Goal) {
  const targetAmount = Number(goal.targetAmount);
  const saved =
    goal.account != null
      ? Number(goal.account.balance)
      : Number(goal.currentAmount);

  const progressPct =
    targetAmount > 0
      ? Math.round(Math.min(Math.max((saved / targetAmount) * 100, 0), 100))
      : 0;
  const remaining = Math.max(targetAmount - saved, 0);

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
    saved,
    projectedCompletionDate,
  };
}

@Injectable()
export class GoalsService {
  constructor(
    private readonly goalsRepository: GoalsRepository,
    private readonly events: EventEmitter2,
  ) {}

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
    const previousPct = computeGoalFields(goal).progressPct;
    Object.assign(goal, dto);
    const saved = await this.goalsRepository.save(goal);
    const computed = computeGoalFields(saved);
    if (computed.progressPct !== previousPct) {
      this.events.emit(GOAL_UPDATED, {
        userId,
        goalId: saved.id,
        previousPct,
        newPct: computed.progressPct,
      });
    }
    return computed;
  }

  async remove(id: string, userId: string): Promise<void> {
    const goal = await this.goalsRepository.findOneByUser(id, userId);
    if (!goal) throw new NotFoundException('Goal not found');
    await this.goalsRepository.remove(goal);
  }
}
