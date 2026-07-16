import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

function makeRepo(seed: any[] = []) {
  const rows = [...seed];
  return {
    rows,
    findOneByUser: jest.fn(async (id: string, userId: string) =>
      rows.find((r) => r.id === id && r.userId === userId) ?? null),
    save: jest.fn(async (c: any) => { const i = rows.findIndex((r) => r.id === c.id); if (i >= 0) rows[i] = c; return c; }),
    remove: jest.fn(async (c: any) => { const i = rows.findIndex((r) => r.id === c.id); if (i >= 0) rows.splice(i, 1); }),
    create: jest.fn((d: any) => ({ ...d })),
  };
}

describe('CategoriesService', () => {
  it('update applies a partial and persists it', async () => {
    const repo = makeRepo([{ id: 'c1', userId: 'u1', name: 'Food', icon: 'cart', color: '#c9a86a' }]);
    const svc = new CategoriesService(repo as any);
    const out = await svc.update('c1', 'u1', { name: 'Groceries', color: '#7faf93' } as any);
    expect(out).toMatchObject({ id: 'c1', name: 'Groceries', color: '#7faf93', icon: 'cart' });
    expect(repo.save).toHaveBeenCalled();
  });

  it('update throws NotFound for another user\'s category', async () => {
    const repo = makeRepo([{ id: 'c1', userId: 'u1', name: 'Food' }]);
    const svc = new CategoriesService(repo as any);
    await expect(svc.update('c1', 'u2', { name: 'X' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove deletes a category with no transactions', async () => {
    const repo = makeRepo([{ id: 'c1', userId: 'u1', name: 'Food' }]);
    const svc = new CategoriesService(repo as any);
    await svc.remove('c1', 'u1');
    expect(repo.remove).toHaveBeenCalled();
    expect(repo.rows).toHaveLength(0);
  });

  it('remove rethrows a FK violation (23503) as ConflictException', async () => {
    const repo = makeRepo([{ id: 'c1', userId: 'u1', name: 'Food' }]);
    repo.remove = jest.fn(async () => { throw Object.assign(new Error('fk'), { code: '23503' }); });
    const svc = new CategoriesService(repo as any);
    await expect(svc.remove('c1', 'u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('remove rethrows a FK violation nested under driverError', async () => {
    const repo = makeRepo([{ id: 'c1', userId: 'u1', name: 'Food' }]);
    repo.remove = jest.fn(async () => { throw Object.assign(new Error('fk'), { driverError: { code: '23503' } }); });
    const svc = new CategoriesService(repo as any);
    await expect(svc.remove('c1', 'u1')).rejects.toBeInstanceOf(ConflictException);
  });
});
