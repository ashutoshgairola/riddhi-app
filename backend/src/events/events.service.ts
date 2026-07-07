import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventsRepository } from './events.repository';
import { TransactionsService } from '../transactions/transactions.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateEventExpenseDto } from './dto/create-event-expense.dto';
import { UpdateEventExpenseDto } from './dto/update-event-expense.dto';
import { Event } from './event.entity';
import { EventExpense } from './event-expense.entity';
import { computeEventTotals, computeDayGroups, EventTotals, EventDayGroup } from './events.totals';
import { TransactionType } from '../common/enums';

export type ComputedEvent = Event & EventTotals & { dayGroups: EventDayGroup[] };

@Injectable()
export class EventsService {
  constructor(
    private readonly repo: EventsRepository,
    private readonly transactionsService: TransactionsService,
  ) {}

  private compute(event: Event): ComputedEvent {
    const expenses = event.expenses ?? [];
    const totals = computeEventTotals(expenses, event.budget);
    const dayGroups = computeDayGroups(expenses, event);
    return Object.assign(event, totals, { dayGroups });
  }

  /** Resolve the effective multiDay/start/end for a create or update. Throws on bad ranges. */
  private resolveRange(
    multiDay: boolean,
    start: string | null,
    end: string | null,
  ): { multiDay: boolean; endDate: string | null } {
    if (!multiDay) return { multiDay: false, endDate: null };
    if (!start || !end) {
      throw new BadRequestException('A multi-day event needs both a start and end date.');
    }
    if (end < start) {
      throw new BadRequestException('End date cannot be before the start date.');
    }
    return { multiDay: true, endDate: end };
  }

  /** Validate/normalize an expense day against the event range. Returns the day to store. */
  private resolveDayDate(event: Event, dayDate: string | null | undefined): string | null {
    if (dayDate === undefined || dayDate === null) return null;
    if (!event.multiDay || !event.date || !event.endDate) return null;
    if (dayDate < event.date || dayDate > event.endDate) {
      throw new BadRequestException('Expense day is outside the event date range.');
    }
    return dayDate;
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
    const start = dto.date ?? null;
    const { multiDay, endDate } = this.resolveRange(dto.multiDay ?? false, start, dto.endDate ?? null);
    const event = this.repo.create({
      name: dto.name,
      emoji: dto.emoji,
      color: dto.color,
      date: start,
      multiDay,
      endDate,
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
        dayDate: this.resolveDayDate({ multiDay, date: start, endDate } as any, e.dayDate),
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
    if (dto.budget !== undefined) event.budget = dto.budget;
    if (dto.guests !== undefined) event.guests = dto.guests;

    const nextStart = dto.date !== undefined ? dto.date : event.date;
    const nextMultiDay = dto.multiDay !== undefined ? dto.multiDay : event.multiDay;
    const nextEnd = dto.endDate !== undefined ? dto.endDate : event.endDate;
    const range = this.resolveRange(nextMultiDay, nextStart, nextEnd ?? null);
    event.date = nextStart;
    event.multiDay = range.multiDay;
    event.endDate = range.endDate;
    // Reset any expense day now outside the (possibly narrowed / cleared) range.
    for (const x of event.expenses ?? []) {
      if (x.dayDate && (!range.multiDay || !event.date || !range.endDate || x.dayDate < event.date || x.dayDate > range.endDate)) {
        x.dayDate = null;
        await this.repo.saveExpense(x);
      }
    }
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

    const dayDate = this.resolveDayDate(event, dto.dayDate);
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
      dayDate,
      sortOrder: dto.sortOrder ?? (event.expenses?.length ?? 0),
    });
    if (paid) {
      const tx = await this.createLinkedTx(userId, event, expense);
      expense.transactionId = tx.id;
    }
    expense = await this.repo.saveExpense(expense);
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
    if (dto.dayDate !== undefined) expense.dayDate = this.resolveDayDate(event, dto.dayDate);

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
