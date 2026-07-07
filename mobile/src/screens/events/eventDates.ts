const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse 'YYYY-MM-DD' as a LOCAL date (never UTC). Mirrors CreateEventSheet.parseYMD. */
export function parseYMD(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toYMD(d: Date): string {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${day}`;
}

/** Inclusive list of 'YYYY-MM-DD' from start to end. Empty if end < start or unparseable. */
export function eachDayYMD(start: string, end: string): string[] {
  const s = parseYMD(start);
  const e = parseYMD(end);
  if (!s || !e || e < s) return [];
  const out: string[] = [];
  const cur = new Date(s);
  while (cur <= e) {
    out.push(toYMD(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** '2026-07-08' -> 'Wed 8 Jul'. */
export function formatDayShort(ymd: string): string {
  const d = parseYMD(ymd);
  if (!d) return ymd;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Compact range: same month -> '8–10 Jul'; cross-month -> '30 Jul – 2 Aug'. */
export function formatRange(start: string, end: string): string {
  const s = parseYMD(start);
  const e = parseYMD(end);
  if (!s || !e) return start;
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]}`;
  }
  return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}`;
}
