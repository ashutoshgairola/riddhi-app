import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GoalsRepository } from './goals.repository';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { Goal } from './goal.entity';
import { ContributionFrequency, TransactionType, TransactionStatus } from '../common/enums';
import { GOAL_UPDATED } from '../notifications/notification-events';
import { TransactionsService } from '../transactions/transactions.service';
import { CategoriesService } from '../categories/categories.service';
import { CreateTransactionDto } from '../transactions/dto/create-transaction.dto';

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
    private readonly transactionsService: TransactionsService,
    private readonly categoriesService: CategoriesService,
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

  async contribute(
    id: string,
    userId: string,
    dto: { amount: number; sourceAccountId: string },
  ) {
    const goal = await this.goalsRepository.findOneByUser(id, userId);
    if (!goal) throw new NotFoundException('Goal not found');
    if (!goal.accountId) {
      throw new BadRequestException('Goal has no linked account');
    }
    if (dto.sourceAccountId === goal.accountId) {
      throw new BadRequestException('Source and destination accounts must differ');
    }

    const categories = await this.categoriesService.findAll(userId);
    let transferCat = categories.find((c) => c.name === 'Transfer');
    if (!transferCat) {
      transferCat = await this.categoriesService.create(userId, { name: 'Transfer' });
    }

    const previousPct = computeGoalFields(goal).progressPct;

    const txDto: CreateTransactionDto = {
      date: new Date().toISOString(),
      description: `Savings → ${goal.name}`,
      amount: dto.amount,
      type: TransactionType.TRANSFER,
      categoryId: transferCat.id,
      accountId: dto.sourceAccountId,
      destinationAccountId: goal.accountId,
      status: TransactionStatus.CLEARED,
    } as CreateTransactionDto;

    await this.transactionsService.create(userId, txDto);

    const updated = await this.goalsRepository.findOneByUser(id, userId);
    const computed = computeGoalFields(updated!);
    if (computed.progressPct !== previousPct) {
      this.events.emit(GOAL_UPDATED, {
        userId,
        goalId: goal.id,
        previousPct,
        newPct: computed.progressPct,
      });
    }
    return computed;
  }
}
