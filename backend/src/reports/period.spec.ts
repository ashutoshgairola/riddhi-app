import { periodStartDate } from './reports.service';

// Format local Y-M-D so assertions don't depend on the runner's timezone.
const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

describe('periodStartDate', () => {
  it('subtracts one month for 1m in the common case', () => {
    expect(ymd(periodStartDate('1m', new Date('2026-07-06T12:00:00')))).toBe(
      '2026-06-06',
    );
  });

  it('does not overflow when today has no equivalent day last month (Mar 31 → Feb 28)', () => {
    // Bug: setMonth(-1) on Mar 31 rolls to Mar 2/3. Correct is end of Feb.
    expect(ymd(periodStartDate('1m', new Date('2026-03-31T12:00:00')))).toBe(
      '2026-02-28',
    );
  });

  it('does not overflow for 3m on May 31 (→ Feb 28)', () => {
    expect(ymd(periodStartDate('3m', new Date('2026-05-31T12:00:00')))).toBe(
      '2026-02-28',
    );
  });

  it('handles 1y across a leap day (Feb 29 2028 → Feb 28 2027)', () => {
    expect(ymd(periodStartDate('1y', new Date('2028-02-29T12:00:00')))).toBe(
      '2027-02-28',
    );
  });

  it('normalizes to start of day', () => {
    const start = periodStartDate('6m', new Date('2026-07-06T15:45:30'));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
  });
});
