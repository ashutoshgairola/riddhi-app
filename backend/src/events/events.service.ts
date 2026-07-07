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
import { TransactionType } from '../common/enums';

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

  // --- Expense sub-resource ---

  async addExpense(
    id: string,
    userId: string,
    dto: CreateEventExpenseDto,
  ): Promise<ComputedEvent> {
    const event = await this.repo.findOneByUser(id, userId);
    if (!event) throw new NotFoundException('Event not found');

    const paid = dto.paid ?? false;
    const actual = dto.actual ?? (paid ? dto.planned : 0);
    let expense = this.repo.createExpense({
      eventId: id,
      categoryId: dto.categoryId,
      label: dto.label,
      planned: dto.planned,
      actual,
      paid,
      transactionId: null,
      sortOrder: dto.sortOrder ?? (event.expenses?.length ?? 0),
    });
    expense = await this.repo.saveExpense(expense);

    if (paid) {
      const tx = await this.createLinkedTx(userId, event, expense);
      expense.transactionId = tx.id;
      await this.repo.saveExpense(expense);
    }
    return this.findOne(id, userId);
  }

  async updateExpense(
    id: string,
    expenseId: string,
    userId: string,
    dto: UpdateEventExpenseDto,
  ): Promise<ComputedEvent> {
    const event = await this.repo.findOneByUser(id, userId);
    if (!event) throw new NotFoundException('Event not found');
    const expense = await this.repo.findExpense(expenseId, id);
    if (!expense) throw new NotFoundException('Expense not found');

    const wasPaid = expense.paid;

    if (dto.categoryId !== undefined) expense.categoryId = dto.categoryId;
    if (dto.label !== undefined) expense.label = dto.label;
    if (dto.planned !== undefined) expense.planned = dto.planned;
    if (dto.sortOrder !== undefined) expense.sortOrder = dto.sortOrder;
    if (dto.actual !== undefined) expense.actual = dto.actual;
    if (dto.paid !== undefined) expense.paid = dto.paid;

    // Ticking with no actual yet defaults the spend to the planned amount
    // (mirrors the prototype's togglePaid, MobileEvents.jsx:241-242).
    if (!wasPaid && expense.paid && (dto.actual === undefined || !expense.actual)) {
      expense.actual = expense.planned;
    }

    // Reconcile the linked transaction.
    if (!wasPaid && expense.paid) {
      const tx = await this.createLinkedTx(userId, event, expense);
      expense.transactionId = tx.id;
    } else if (wasPaid && !expense.paid) {
      if (expense.transactionId) {
        await this.transactionsService.remove(expense.transactionId, userId);
      }
      expense.transactionId = null;
    } else if (wasPaid && expense.paid && expense.transactionId) {
      await this.transactionsService.update(expense.transactionId, userId, {
        amount: expense.actual,
        categoryId: expense.categoryId,
        description: expense.label,
      } as any);
    }

    await this.repo.saveExpense(expense);
    return this.findOne(id, userId);
  }

  async removeExpense(
    id: string,
    expenseId: string,
    userId: string,
  ): Promise<ComputedEvent> {
    const event = await this.repo.findOneByUser(id, userId);
    if (!event) throw new NotFoundException('Event not found');
    const expense = await this.repo.findExpense(expenseId, id);
    if (!expense) throw new NotFoundException('Expense not found');

    if (expense.transactionId) {
      await this.transactionsService.remove(expense.transactionId, userId);
    }
    await this.repo.removeExpense(expense);
    return this.findOne(id, userId);
  }

  /** Creates the account-less expense transaction that mirrors a paid item. */
  private createLinkedTx(userId: string, event: Event, expense: EventExpense) {
    return this.transactionsService.create(userId, {
      date: new Date().toISOString().slice(0, 10),
      description: expense.label,
      amount: expense.actual,
      type: TransactionType.EXPENSE,
      categoryId: expense.categoryId,
      notes: `For ${event.name}`,
      eventId: event.id,
    } as any);
  }
}
