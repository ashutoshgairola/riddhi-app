import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';
import { computeDayGroups } from './events.totals';

function makeRepo(events: any[]) {
  return {
    findAllByUser: jest.fn(async (uid: string) => events.filter((e) => e.userId === uid)),
    findOneByUser: jest.fn(async (id: string, uid: string) =>
      events.find((e) => e.id === id && e.userId === uid) ?? null),
    create: jest.fn((data: any) => ({ id: 'ev-new', ...data })),
    save: jest.fn(async (e: any) => { if (!events.includes(e)) events.push(e); return e; }),
    remove: jest.fn(async (e: any) => { events.splice(events.indexOf(e), 1); }),
  } as any;
}

describe('EventsService CRUD', () => {
  it('findAll flattens computed totals onto each event', async () => {
    const repo = makeRepo([{
      id: 'ev1', userId: 'u1', budget: 25000,
      expenses: [{ planned: 6000, actual: 6000, paid: true }, { planned: 8000, actual: 0, paid: false }],
    }]);
    const svc = new EventsService(repo, {} as any);
    const [e] = await svc.findAll('u1');
    expect(e.paid).toBe(6000);
    expect(e.projected).toBe(14000);
    expect(e.over).toBe(false);
  });

  it('findOne throws when the event is not owned', async () => {
    const repo = makeRepo([]);
    const svc = new EventsService(repo, {} as any);
    await expect(svc.findOne('nope', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create forces new expenses to unpaid', async () => {
    const repo = makeRepo([]);
    repo.findOneByUser.mockImplementation(async (id: string) => ({
      id, userId: 'u1', budget: 100, expenses: [{ planned: 100, actual: 0, paid: false }],
    }));
    const svc = new EventsService(repo, {} as any);
    await svc.create('u1', {
      name: 'X', emoji: '🎉', color: '#fff', budget: 100,
      expenses: [{ categoryId: 'c1', label: 'A', planned: 100, paid: true }],
    } as any);
    const created = repo.create.mock.calls[0][0];
    expect(created.expenses[0].paid).toBe(false);
  });
});

function makeRepoWithExpenses(events: any[]) {
  const repo = makeRepo(events);
  repo.findExpense = jest.fn(async (expId: string, evId: string) => {
    const ev = events.find((e) => e.id === evId);
    return ev?.expenses?.find((x: any) => x.id === expId) ?? null;
  });
  repo.saveExpense = jest.fn(async (x: any) => x);
  repo.createExpense = jest.fn((x: any) => ({ id: 'exp-new', ...x }));
  return repo;
}

describe('EventsService multi-day', () => {
  it('rejects multiDay create without endDate', async () => {
    const svc = new EventsService(makeRepo([]), {} as any);
    await expect(
      svc.create('u1', { name: 'Trip', emoji: '✈️', color: '#fff', budget: 100, date: '2026-07-08', multiDay: true, expenses: [] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects endDate before start', async () => {
    const svc = new EventsService(makeRepo([]), {} as any);
    await expect(
      svc.create('u1', { name: 'Trip', emoji: '✈️', color: '#fff', budget: 100, date: '2026-07-10', endDate: '2026-07-08', multiDay: true, expenses: [] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forces endDate to null when not multiDay on update', async () => {
    const events = [{ id: 'ev1', userId: 'u1', budget: 100, multiDay: true, date: '2026-07-08', endDate: '2026-07-10', expenses: [] }];
    const svc = new EventsService(makeRepoWithExpenses(events), {} as any);
    await svc.update('ev1', 'u1', { multiDay: false } as any);
    expect(events[0].endDate).toBeNull();
  });

  it('rejects an out-of-range expense dayDate on create', async () => {
    const svc = new EventsService(makeRepo([]), {} as any);
    await expect(
      svc.create('u1', {
        name: 'Trip', emoji: '✈️', color: '#fff', budget: 100,
        date: '2026-07-08', endDate: '2026-07-10', multiDay: true,
        expenses: [{ categoryId: 'c1', label: 'A', planned: 10, dayDate: '2026-07-20' }],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an out-of-range dayDate on addExpense', async () => {
    const events = [{ id: 'ev1', userId: 'u1', budget: 100, multiDay: true, date: '2026-07-08', endDate: '2026-07-10', expenses: [] }];
    const svc = new EventsService(makeRepoWithExpenses(events), {} as any);
    await expect(
      svc.addExpense('ev1', 'u1', { categoryId: 'c1', label: 'A', planned: 10, dayDate: '2026-07-20' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('coerces dayDate to null for a single-day event', async () => {
    const events = [{ id: 'ev1', userId: 'u1', budget: 100, multiDay: false, date: '2026-07-08', endDate: null, expenses: [] }];
    const repo = makeRepoWithExpenses(events);
    const svc = new EventsService(repo, {} as any);
    await svc.addExpense('ev1', 'u1', { categoryId: 'c1', label: 'A', planned: 10, dayDate: '2026-07-08' } as any);
    expect(repo.createExpense.mock.calls[0][0].dayDate).toBeNull();
  });

  it('resets out-of-range expense days when the range shrinks', async () => {
    const events = [{
      id: 'ev1', userId: 'u1', budget: 100, multiDay: true, date: '2026-07-08', endDate: '2026-07-12',
      expenses: [{ id: 'x1', dayDate: '2026-07-11', planned: 10, actual: 0, paid: false }],
    }];
    const svc = new EventsService(makeRepoWithExpenses(events), {} as any);
    await svc.update('ev1', 'u1', { endDate: '2026-07-09' } as any);
    expect(events[0].expenses[0].dayDate).toBeNull();
  });

  it('clears expense days when multiDay is turned off on update', async () => {
    const events = [{
      id: 'ev1', userId: 'u1', budget: 100, multiDay: true, date: '2026-07-08', endDate: '2026-07-12',
      expenses: [{ id: 'x1', dayDate: '2026-07-11', planned: 10, actual: 0, paid: false }],
    }];
    const svc = new EventsService(makeRepoWithExpenses(events), {} as any);
    await svc.update('ev1', 'u1', { multiDay: false } as any);
    expect(events[0].expenses[0].dayDate).toBeNull();
  });

  it('appends a moved expense to the end of the target day (bumps sortOrder past the max)', async () => {
    const events = [{
      id: 'ev1', userId: 'u1', budget: 100, multiDay: true, date: '2026-07-08', endDate: '2026-07-10',
      expenses: [
        { id: 'x1', dayDate: '2026-07-08', sortOrder: 0, planned: 10, actual: 0, paid: false },
        { id: 'x2', dayDate: '2026-07-09', sortOrder: 5, planned: 10, actual: 0, paid: false },
      ],
    }];
    const svc = new EventsService(makeRepoWithExpenses(events), {} as any);
    await svc.updateExpense('ev1', 'x1', 'u1', { dayDate: '2026-07-09' } as any);
    expect(events[0].expenses[0].dayDate).toBe('2026-07-09');
    expect(events[0].expenses[0].sortOrder).toBe(6);
  });

  it('leaves sortOrder untouched when the day does not change', async () => {
    const events = [{
      id: 'ev1', userId: 'u1', budget: 100, multiDay: true, date: '2026-07-08', endDate: '2026-07-10',
      expenses: [
        { id: 'x1', dayDate: '2026-07-08', sortOrder: 0, planned: 10, actual: 0, paid: false },
        { id: 'x2', dayDate: '2026-07-09', sortOrder: 5, planned: 10, actual: 0, paid: false },
      ],
    }];
    const svc = new EventsService(makeRepoWithExpenses(events), {} as any);
    await svc.updateExpense('ev1', 'x1', 'u1', { dayDate: '2026-07-08', label: 'Same day' } as any);
    expect(events[0].expenses[0].sortOrder).toBe(0);

    await svc.updateExpense('ev1', 'x1', 'u1', { label: 'No day change at all' } as any);
    expect(events[0].expenses[0].sortOrder).toBe(0);
  });
});
