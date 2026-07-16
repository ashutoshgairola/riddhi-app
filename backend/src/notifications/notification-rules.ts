const GOAL_BUCKETS = [25, 50, 75, 100];

/** Ratios in `thresholds` that go from strictly-below (before) to at-or-above (after). */
export function crossedThresholds(
  before: number,
  after: number,
  thresholds: number[],
): number[] {
  return thresholds.filter((t) => before < t && after >= t);
}

export function goalMilestonesCrossed(prevPct: number, newPct: number): number[] {
  return GOAL_BUCKETS.filter((b) => prevPct < b && newPct >= b);
}

export function isLargeTransaction(amount: number, threshold: number): boolean {
  return amount >= threshold;
}
