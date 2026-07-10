import { SubscriptionsService } from './subscriptions.service';

function makeRepo<T extends { id?: string }>(seed: T[] = []) {
  const rows = [...seed];
  return {
    rows,
    find: jest.fn(async (q?: any) => rows.filter((r: any) => !q?.where || Object.entries(q.where).every(([k, v]) => r[k] === v))),
    findOne: jest.fn(async (q: any) => rows.find((r: any) => Object.entries(q.where).every(([k, v]) => r[k] === v)) ?? null),
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => { const r = { id: d.id ?? 'new-id', ...d }; const i = rows.findIndex((x: any) => x.id === r.id); if (i >= 0) rows[i] = r; else rows.push(r); return r; }),
    remove: jest.fn(async (d: any) => { const i = rows.findIndex((x: any) => x.id === d.id); if (i >= 0) rows.splice(i, 1); }),
    update: jest.fn(async () => undefined),
  };
}

describe('SubscriptionsService', () => {
  const categoriesSvc = { findAll: jest.fn(async () => [{ id: 'cat-sub', name: 'Subscriptions', color: '#a78bfa' }, { id: 'cat-ent', name: 'Entertainment', color: null }]) };

  function build(txns: any[] = [], notes: any[] = []) {
    const subRepo = makeRepo<any>();
    const ignoreRepo = makeRepo<any>();
    const txRepo = { ...makeRepo<any>(txns), find: jest.fn(async () => txns) } as any;
    const capturedRepo = { ...makeRepo<any>(notes), find: jest.fn(async () => notes) } as any;
    const svc = new SubscriptionsService(subRepo as any, ignoreRepo as any, txRepo as any, capturedRepo as any, categoriesSvc as any);
    return { svc, subRepo, ignoreRepo, txRepo, capturedRepo };
  }

  it('create persists a row and back-links historical transactions', async () => {
    const { svc, subRepo, txRepo } = build();
    const sub = await svc.create('u1', {
      name: 'Netflix', merchantDescriptor: 'netflix.com', amount: 649, cycle: 'monthly',
      nextRenewalDate: '2026-05-10', firstSeenDate: '2025-01-01', transactionIds: ['t1', 't2'],
    } as any);
    expect(subRepo.save).toHaveBeenCalled();
    expect(txRepo.update).toHaveBeenCalledWith({ id: expect.anything(), userId: 'u1' }, { subscriptionId: sub.id });
  });

  it('update pauses a subscription', async () => {
    const { svc, subRepo } = build();
    subRepo.rows.push({ id: 's1', userId: 'u1', status: 'active', name: 'Netflix' });
    const r = await svc.update('u1', 's1', { status: 'paused' } as any);
    expect(r.status).toBe('paused');
  });

  it('update markDetailOpened stamps detailOpenedAt once', async () => {
    const { svc, subRepo } = build();
    subRepo.rows.push({ id: 's1', userId: 'u1', status: 'active', detailOpenedAt: null });
    const r = await svc.update('u1', 's1', { markDetailOpened: true } as any);
    expect(r.detailOpenedAt).toBeInstanceOf(Date);
  });

  it('dismiss records an ignore row so the descriptor stops surfacing', async () => {
    const { svc, ignoreRepo } = build();
    await svc.dismiss('u1', 'netflix.com');
    expect(ignoreRepo.save).toHaveBeenCalled();
  });

  it('detect excludes descriptors already persisted or ignored', async () => {
    const txns = [
      { id: 't1', date: '2026-03-02', description: 'NETFLIX.COM', amount: 649, categoryId: 'cat-ent', category: { name: 'Entertainment' }, accountId: 'a1', paymentMethod: 'card', isRecurring: false },
      { id: 't2', date: '2026-04-02', description: 'NETFLIX.COM', amount: 649, categoryId: 'cat-ent', category: { name: 'Entertainment' }, accountId: 'a1', paymentMethod: 'card', isRecurring: false },
    ];
    const { svc, subRepo } = build(txns);
    subRepo.rows.push({ id: 's1', userId: 'u1', merchantDescriptor: 'netflix.com', status: 'active' });
    const candidates = await svc.detect('u1');
    expect(candidates).toHaveLength(0);
  });

  it('detect enriches an aggregator name from a captured notification', async () => {
    const txns = [
      { id: 't1', date: '2025-07-08', description: 'GOOGLE PLAY', amount: 99, categoryId: 'cat-ent', category: { name: 'Entertainment' }, accountId: 'a1', paymentMethod: 'autopay', isRecurring: false },
      { id: 't2', date: '2026-07-08', description: 'GOOGLE PLAY', amount: 99, categoryId: 'cat-ent', category: { name: 'Entertainment' }, accountId: 'a1', paymentMethod: 'autopay', isRecurring: false },
    ];
    const notes = [
      { userId: 'u1', title: 'Google Play', text: 'Your subscription from Truecaller on Google Play has renewed for ₹99.', postedAt: new Date('2026-07-08') },
    ];
    const { svc } = build(txns, notes);
    const candidates = await svc.detect('u1');
    expect(candidates[0].name).toBe('Truecaller');
  });

  it('detect keeps the generic aggregator name when no notification matches', async () => {
    const txns = [
      { id: 't1', date: '2025-07-08', description: 'GOOGLE PLAY', amount: 99, categoryId: 'cat-ent', category: { name: 'Entertainment' }, accountId: 'a1', paymentMethod: 'autopay', isRecurring: false },
      { id: 't2', date: '2026-07-08', description: 'GOOGLE PLAY', amount: 99, categoryId: 'cat-ent', category: { name: 'Entertainment' }, accountId: 'a1', paymentMethod: 'autopay', isRecurring: false },
    ];
    const { svc } = build(txns, []);
    const candidates = await svc.detect('u1');
    expect(candidates[0].name).toBe('Google Play');
  });
});
