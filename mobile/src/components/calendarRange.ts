/**
 * Pure range-selection logic for CalendarRangePicker, kept RN-free so it can be
 * unit-tested under the pure-logic jest config (see calendarRange.spec.ts).
 * Deliberately does NOT import from ./CalendarPicker (that module imports
 * react-native); the tiny day-comparison helpers are duplicated here instead.
 */

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** true when `a` falls on a strictly later calendar day than `b`. */
function isAfterDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() > startOfDay(b).getTime();
}

/** true when `x` is strictly between a and b (exclusive), day-granular. */
export function isBetween(x: Date, a: Date, b: Date): boolean {
  const t = startOfDay(x).getTime();
  const lo = Math.min(startOfDay(a).getTime(), startOfDay(b).getTime());
  const hi = Math.max(startOfDay(a).getTime(), startOfDay(b).getTime());
  return t > lo && t < hi;
}

/** Pure tap-reducer for range selection — unit-tested in calendarRange.spec.ts. */
export function nextRangeState(
  sel: { start: Date | null; end: Date | null },
  tapped: Date,
): { start: Date | null; end: Date | null; committed: boolean } {
  if (!sel.start || sel.end) return { start: tapped, end: null, committed: false };
  if (isAfterDay(sel.start, tapped)) return { start: tapped, end: null, committed: false };
  return { start: sel.start, end: tapped, committed: true };
}
