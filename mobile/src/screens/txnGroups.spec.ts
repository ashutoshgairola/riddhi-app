import { groupTxByDate } from './txnGroups';
import type { SwipeTx } from './SwipeRow';

const tx = (o: Partial<SwipeTx> & Pick<SwipeTx, 'id' | 'date'>): SwipeTx => ({
  icon: '🍕',
  desc: 'Test',
  cat: 'Food',
  cCol: '#000',
  amount: 100,
  type: 'exp',
  ...o,
});

describe('groupTxByDate', () => {
  it('groups an earlier-timed and a later-timed same-day transaction under one "Today" header', () => {
    const now = new Date();
    const earlier = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 1, 0, 0);
    // 23:59:59 local today — later than "now" whenever the test runs before midnight.
    const later = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const groups = groupTxByDate([
      tx({ id: 1, date: earlier.toISOString() }),
      tx({ id: 2, date: later.toISOString() }),
    ]);

    const todayGroups = groups.filter((g) => g.label === 'Today');
    expect(todayGroups).toHaveLength(1);
    expect(todayGroups[0].txs).toHaveLength(2);
    expect(groups.every((g) => g.label === 'Today')).toBe(true);
  });

  it('labels yesterday and older dates correctly', () => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0);
    const lastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 12, 0, 0);

    const groups = groupTxByDate([
      tx({ id: 1, date: yesterday.toISOString() }),
      tx({ id: 2, date: lastWeek.toISOString() }),
    ]);

    expect(groups.find((g) => g.txs[0].id === 1)?.label).toBe('Yesterday');
    expect(groups.find((g) => g.txs[0].id === 2)?.label).not.toBe('Today');
    expect(groups.find((g) => g.txs[0].id === 2)?.label).not.toBe('Yesterday');
  });
});
