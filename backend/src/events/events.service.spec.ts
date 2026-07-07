import { NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';

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
