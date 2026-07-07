import { Injectable, NotFoundException } from '@nestjs/common';
import { EventsRepository } from './events.repository';
import { TransactionsService } from '../transactions/transactions.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateEventExpenseDto } from './dto/create-event-expense.dto';
import { UpdateEventExpenseDto } from './dto/update-event-expense.dto';
import { Event } from './event.entity';
import { EventExpense } from './event-expense.entity';
import { computeEventTotals, EventTotals } from './events.totals';

export type ComputedEvent = Event & EventTotals;

@Injectable()
export class EventsService {
  constructor(
    private readonly repo: EventsRepository,
    private readonly transactionsService: TransactionsService,
  ) {}

  private compute(event: Event): ComputedEvent {
    const expenses = event.expenses ?? [];
    const totals = computeEventTotals(expenses, event.budget);
    return Object.assign(event, totals);
  }

  async findAll(userId: string): Promise<ComputedEvent[]> {
    const events = await this.repo.findAllByUser(userId);
    return events.map((e) => this.compute(e));
  }

  async findOne(id: string, userId: string): Promise<ComputedEvent> {
    const event = await this.repo.findOneByUser(id, userId);
    if (!event) throw new NotFoundException('Event not found');
    return this.compute(event);
  }

  async create(userId: string, dto: CreateEventDto): Promise<ComputedEvent> {
    const event = this.repo.create({
      name: dto.name,
      emoji: dto.emoji,
      color: dto.color,
      date: dto.date ?? null,
      budget: dto.budget,
      guests: dto.guests ?? 0,
      userId,
      expenses: dto.expenses.map((e, i) => ({
        categoryId: e.categoryId,
        label: e.label,
        planned: e.planned,
        actual: e.actual ?? 0,
        paid: false, // created events start unticked; ticking is a later PATCH
        transactionId: null,
        sortOrder: e.sortOrder ?? i,
      })) as EventExpense[],
    });
    const saved = await this.repo.save(event);
    return this.findOne(saved.id, userId);
  }

  async update(id: string, userId: string, dto: UpdateEventDto): Promise<ComputedEvent> {
    const event = await this.repo.findOneByUser(id, userId);
    if (!event) throw new NotFoundException('Event not found');
    if (dto.name !== undefined) event.name = dto.name;
    if (dto.emoji !== undefined) event.emoji = dto.emoji;
    if (dto.color !== undefined) event.color = dto.color;
    if (dto.date !== undefined) event.date = dto.date;
    if (dto.budget !== undefined) event.budget = dto.budget;
    if (dto.guests !== undefined) event.guests = dto.guests;
    await this.repo.save(event);
    return this.findOne(id, userId);
  }

  async remove(id: string, userId: string): Promise<void> {
    const event = await this.repo.findOneByUser(id, userId);
    if (!event) throw new NotFoundException('Event not found');
    // transaction.eventId is ON DELETE SET NULL — paid transactions survive.
    await this.repo.remove(event);
  }

  // --- Expense sub-resource: implemented in Task 4. ---

  addExpense(id: string, userId: string, dto: CreateEventExpenseDto): Promise<ComputedEvent> {
    throw new Error('implemented in Task 4');
  }

  updateExpense(
    id: string,
    expenseId: string,
    userId: string,
    dto: UpdateEventExpenseDto,
  ): Promise<ComputedEvent> {
    throw new Error('implemented in Task 4');
  }

  removeExpense(id: string, expenseId: string, userId: string): Promise<ComputedEvent> {
    throw new Error('implemented in Task 4');
  }
}
