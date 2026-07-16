import {
  crossedThresholds,
  goalMilestonesCrossed,
  isLargeTransaction,
} from './notification-rules';

describe('notification-rules', () => {
  it('detects newly crossed budget thresholds', () => {
    expect(crossedThresholds(0.5, 0.8, [0.75, 1])).toEqual([0.75]);
    expect(crossedThresholds(0.5, 1.1, [0.75, 1])).toEqual([0.75, 1]);
    expect(crossedThresholds(0.8, 0.9, [0.75, 1])).toEqual([]); // already past 0.75
    expect(crossedThresholds(1.2, 1.3, [0.75, 1])).toEqual([]);
  });

  it('detects goal milestone buckets crossed', () => {
    expect(goalMilestonesCrossed(20, 55)).toEqual([25, 50]);
    expect(goalMilestonesCrossed(60, 60)).toEqual([]);
    expect(goalMilestonesCrossed(90, 100)).toEqual([100]);
    expect(goalMilestonesCrossed(0, 20)).toEqual([]);
  });

  it('flags large transactions at/over threshold', () => {
    expect(isLargeTransaction(20000, 20000)).toBe(true);
    expect(isLargeTransaction(19999, 20000)).toBe(false);
  });
});
