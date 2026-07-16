import { parseYMD, toYMD, eachDayYMD, formatDayShort, formatRange } from './eventDates';

describe('eventDates', () => {
  it('round-trips YMD as a local date', () => {
    const d = parseYMD('2026-07-08')!;
    expect(toYMD(d)).toBe('2026-07-08');
    expect(d.getDate()).toBe(8); // local, not shifted by UTC
  });

  it('enumerates an inclusive day range', () => {
    expect(eachDayYMD('2026-07-08', '2026-07-10')).toEqual(['2026-07-08', '2026-07-09', '2026-07-10']);
  });

  it('formats a short day label', () => {
    expect(formatDayShort('2026-07-08')).toBe('Wed 8 Jul');
  });

  it('formats a compact range within the same month', () => {
    expect(formatRange('2026-07-08', '2026-07-10')).toBe('8–10 Jul');
  });
});
