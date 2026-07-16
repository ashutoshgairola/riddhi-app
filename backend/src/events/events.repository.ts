import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './event.entity';
import { EventExpense } from './event-expense.entity';

@Injectable()
export class EventsRepository {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    @InjectRepository(EventExpense)
    private readonly expenseRepo: Repository<EventExpense>,
  ) {}

  findAllByUser(userId: string): Promise<Event[]> {
    return this.eventRepo.find({
      where: { userId },
      relations: ['expenses'],
      order: { createdAt: 'DESC' },
    });
  }

  findOneByUser(id: string, userId: string): Promise<Event | null> {
    return this.eventRepo.findOne({
      where: { id, userId },
      relations: ['expenses'],
    });
  }

  create(data: Partial<Event>): Event {
    return this.eventRepo.create(data);
  }

  save(event: Event): Promise<Event> {
    return this.eventRepo.save(event);
  }

  async remove(event: Event): Promise<void> {
    await this.eventRepo.remove(event);
  }

  findExpense(id: string, eventId: string): Promise<EventExpense | null> {
    return this.expenseRepo.findOne({ where: { id, eventId } });
  }

  createExpense(data: Partial<EventExpense>): EventExpense {
    return this.expenseRepo.create(data);
  }

  saveExpense(expense: EventExpense): Promise<EventExpense> {
    return this.expenseRepo.save(expense);
  }

  async removeExpense(expense: EventExpense): Promise<void> {
    await this.expenseRepo.remove(expense);
  }
}
