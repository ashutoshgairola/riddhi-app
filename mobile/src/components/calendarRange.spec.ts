import { nextRangeState } from './calendarRange';

const d = (day: number) => new Date(2026, 6, day); // July 2026

describe('nextRangeState', () => {
  it('first tap sets start and clears end', () => {
    expect(nextRangeState({ start: null, end: null }, d(8))).toEqual({ start: d(8), end: null, committed: false });
  });

  it('tap on/after start completes the range and commits', () => {
    expect(nextRangeState({ start: d(8), end: null }, d(10))).toEqual({ start: d(8), end: d(10), committed: true });
  });

  it('same-day second tap commits a single-day range', () => {
    expect(nextRangeState({ start: d(8), end: null }, d(8))).toEqual({ start: d(8), end: d(8), committed: true });
  });

  it('tap before start restarts the selection', () => {
    expect(nextRangeState({ start: d(8), end: null }, d(5))).toEqual({ start: d(5), end: null, committed: false });
  });

  it('tapping when a full range exists starts fresh', () => {
    expect(nextRangeState({ start: d(8), end: d(10) }, d(12))).toEqual({ start: d(12), end: null, committed: false });
  });
});
