import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Goal } from './goal.entity';

@Injectable()
export class GoalsRepository {
  constructor(
    @InjectRepository(Goal)
    private readonly repo: Repository<Goal>,
  ) {}

  findAllByUser(userId: string): Promise<Goal[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
      relations: ['account'],
    });
  }

  findOneByUser(id: string, userId: string): Promise<Goal | null> {
    return this.repo.findOne({ where: { id, userId }, relations: ['account'] });
  }

  create(data: Partial<Goal>): Goal {
    return this.repo.create(data);
  }

  save(goal: Goal): Promise<Goal> {
    return this.repo.save(goal);
  }

  async remove(goal: Goal): Promise<void> {
    await this.repo.remove(goal);
  }
}
