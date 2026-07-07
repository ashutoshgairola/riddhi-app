import { toEventView, toEventDetailView } from './adapters';
import type { ApiEvent, ApiCategory } from './types';

const baseEvent: ApiEvent = {
  id: 'ev1', name: 'Goa', emoji: '✈️', color: '#8197c4',
  date: '2026-07-08', multiDay: true, endDate: '2026-07-10',
  budget: 50000, guests: 0,
  planned: 8500, paid: 7500, projected: 9000, over: false,
  paidCount: 1, count: 2, remaining: 42500,
  dayGroups: [{ dayDate: '2026-07-08', planned: 8500, paid: 7500, count: 2, paidCount: 1 }],
  expenses: [
    { id: 'x1', categoryId: 'c1', label: 'Hotel', planned: 8000, actual: 7500, paid: true, transactionId: 't1', sortOrder: 0, dayDate: '2026-07-08' },
    { id: 'x2', categoryId: 'c1', label: 'Snacks', planned: 500, actual: 0, paid: false, transactionId: null, sortOrder: 1, dayDate: null },
  ],
};

const catMap = new Map<string, ApiCategory>([
  ['c1', { id: 'c1', name: 'Travel', icon: '✈️', color: '#8197c4' } as ApiCategory],
]);

describe('event adapter multi-day', () => {
  it('passes multiDay/endDate through toEventView', () => {
    const v = toEventView(baseEvent);
    expect(v.multiDay).toBe(true);
    expect(v.endDate).toBe('2026-07-10');
  });

  it('carries dayGroups and per-expense dayDate in the detail view', () => {
    const v = toEventDetailView(baseEvent, catMap);
    expect(v.dayGroups).toEqual(baseEvent.dayGroups);
    expect(v.expenses.map((e) => e.dayDate)).toEqual(['2026-07-08', null]);
  });
});
