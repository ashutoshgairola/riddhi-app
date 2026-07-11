import { spacing } from './spacing';

describe('8pt spacing scale', () => {
  it('every step is a multiple of 4 with 8 as the base unit', () => {
    for (const v of Object.values(spacing)) {
      expect(v % 4).toBe(0);
    }
    expect(spacing.xs).toBe(8);
  });
  it('is strictly ascending xxs→xxl with the exact 8pt ladder', () => {
    expect(Object.values(spacing)).toEqual([4, 8, 12, 16, 24, 32, 48]);
  });
});
