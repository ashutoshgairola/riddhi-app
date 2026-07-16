import { rollUpCategorySpend } from './reports.service';

describe('rollUpCategorySpend', () => {
  const categories = [
    { id: 'P', parentId: null, name: 'Food', color: '#aaa' },
    { id: 'C', parentId: 'P', name: 'Restaurants', color: '#bbb' },
    { id: 'T', parentId: null, name: 'Transport', color: '#ccc' },
  ];

  it('aggregates child spend under the top-level parent', () => {
    const rows = [
      { categoryId: 'C', total: 3000 },
      { categoryId: 'P', total: 2000 },
      { categoryId: 'T', total: 6000 },
    ];
    const result = rollUpCategorySpend(rows, categories);

    // Food = 2000 (parent) + 3000 (child); Transport = 6000. Sorted desc.
    expect(result).toEqual([
      { categoryId: 'T', name: 'Transport', color: '#ccc', value: 6000, sharePct: 54.55 },
      { categoryId: 'P', name: 'Food', color: '#aaa', value: 5000, sharePct: 45.45 },
    ]);
  });

  it('handles a lone child whose parent had no direct spend', () => {
    const rows = [{ categoryId: 'C', total: 4000 }];
    const result = rollUpCategorySpend(rows, categories);
    expect(result).toEqual([
      { categoryId: 'P', name: 'Food', color: '#aaa', value: 4000, sharePct: 100 },
    ]);
  });
});
