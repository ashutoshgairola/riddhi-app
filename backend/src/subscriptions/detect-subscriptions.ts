import { PriceHistoryEntry, SubscriptionCycle } from './subscription.entity';

export { PriceHistoryEntry };

export interface DetectTxn {
  id: string;
  date: string; // ISO (YYYY-MM-DD or full)
  description: string;
  amount: number; // positive magnitude of the expense
  categoryId: string;
  categoryName: string;
  accountId: string | null;
  paymentMethod: string | null;
  isRecurring: boolean;
}

export interface SubscriptionCandidate {
  merchantDescriptor: string; // normalized key
  rawDescription: string; // representative raw descriptor
  amount: number; // latest charge
  cycle: SubscriptionCycle;
  nextRenewalDate: string; // ISO date
  firstSeenDate: string; // ISO date
  accountId: string | null;
  paymentMethod: string | null;
  categoryId: string;
  priceHistory: PriceHistoryEntry[];
  transactionIds: string[];
  occurrences: number;
}

// Categories whose recurring debits are NOT subscriptions (investments/income/SIPs).
const EXCLUDED_CATEGORIES = new Set(['income', 'investments', 'investment', 'transfer', 'transfers']);
const BOOST_CATEGORY = 'subscriptions';

const dayOnly = (s: string): string => s.slice(0, 10);

export function normalizeDescriptor(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\d{4,}/g, ' ') // long ref numbers
    .replace(/\b(billdesk|autopay|ach|upi|payment|ref|txn|pos|ecom|mandate)\b/g, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Adds one billing cycle to an ISO date (calendar-correct). */
export function addCycle(isoDate: string, cycle: SubscriptionCycle): string {
  const d = new Date(dayOnly(isoDate) + 'T00:00:00Z');
  if (cycle === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(dayOnly(b) + 'T00:00:00Z').getTime() - new Date(dayOnly(a) + 'T00:00:00Z').getTime()) / 86400000,
  );
}

/** Two amounts are "the same service" if within a factor of each other. */
function amountClose(a: number, b: number, factor = 2): boolean {
  return a <= b * factor && b <= a * factor;
}

/** Classify an inter-charge gap as a monthly/yearly cadence (or neither).
 * Bands widen for the boosted (autopay/recurring/subscriptions-category) case. */
function gapBand(g: number, boosted: boolean): SubscriptionCycle | null {
  const m: [number, number] = boosted ? [24, 35] : [26, 33];
  const y: [number, number] = boosted ? [340, 390] : [350, 380];
  if (g >= m[0] && g <= m[1]) return 'monthly';
  if (g >= y[0] && g <= y[1]) return 'yearly';
  return null;
}

function buildPriceHistory(sorted: DetectTxn[]): PriceHistoryEntry[] {
  const out: PriceHistoryEntry[] = [];
  for (const t of sorted) {
    const last = out[out.length - 1];
    if (!last || last.amount !== t.amount) out.push({ amount: t.amount, since: dayOnly(t.date) });
  }
  return out;
}

/**
 * Extract cadence-coherent recurring streams from one descriptor+account
 * group. A bank debit descriptor like "GOOGLE PLAY" covers MANY services
 * (the SMS names the aggregator, not the service), so a single group can
 * hold several independent subscriptions. Greedy chronological assignment
 * separates them: a charge joins an existing stream only if its amount is
 * close (×2) to that stream's latest charge AND the gap is a plausible
 * monthly/yearly cadence. This keeps a ₹499→₹649 hike together (the same
 * cadence continues) while splitting a ₹99/yr and a ₹299/mo sub that merely
 * share the "GOOGLE PLAY" descriptor.
 */
function extractStreams(group: DetectTxn[], boosted: boolean): DetectTxn[][] {
  const sorted = [...group].sort((a, b) => (a.date < b.date ? -1 : 1));
  const streams: DetectTxn[][] = [];
  for (const t of sorted) {
    let placed = false;
    for (const s of streams) {
      const prev = s[s.length - 1];
      if (amountClose(t.amount, prev.amount) && gapBand(daysBetween(prev.date, t.date), boosted)) {
        s.push(t);
        placed = true;
        break;
      }
    }
    if (!placed) streams.push([t]);
  }
  return streams;
}

export function detectSubscriptions(
  txns: DetectTxn[],
  ignoredOrExisting: Set<string>,
  today: Date,
): SubscriptionCandidate[] {
  const groups = new Map<string, DetectTxn[]>();
  for (const t of txns) {
    if (t.amount <= 0) continue;
    if (EXCLUDED_CATEGORIES.has(t.categoryName.toLowerCase())) continue;
    const key = `${normalizeDescriptor(t.description)}::${t.accountId ?? ''}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  const candidates: SubscriptionCandidate[] = [];
  for (const [, group] of groups) {
    const descriptor = normalizeDescriptor(group[0].description);
    if (ignoredOrExisting.has(descriptor)) continue;

    // `paymentMethod === 'autopay'` (set by the SMS/notification parse for
    // mandate/SIP/ACH/NACH/standing-instruction debits) is the primary
    // recurring signal — NOT the never-populated `isRecurring` boolean.
    const boosted =
      group.some((t) => t.paymentMethod === 'autopay' || t.isRecurring) ||
      group[0].categoryName.toLowerCase() === BOOST_CATEGORY;

    for (const stream of extractStreams(group, boosted)) {
      const autopay = stream.some((t) => t.paymentMethod === 'autopay');
      const streamBoosted =
        autopay || stream.some((t) => t.isRecurring) || stream[0].categoryName.toLowerCase() === BOOST_CATEGORY;

      let cycle: SubscriptionCycle | null = null;
      if (stream.length >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < stream.length; i++) gaps.push(daysBetween(stream[i - 1].date, stream[i].date));
        cycle = gapBand(median(gaps), streamBoosted);
      } else if (stream.length === 1 && autopay) {
        cycle = 'monthly'; // brand-new mandate: surface now, editable at confirm
      }
      if (!cycle) continue;

      // Precision guard against two coincidental same-merchant buys: weak
      // evidence (2 non-autopay charges) needs tight amount agreement.
      const qualifies =
        autopay || stream.length >= 3 || (stream.length === 2 && amountClose(stream[0].amount, stream[1].amount, 1.5));
      if (!qualifies) continue;

      const last = stream[stream.length - 1];
      candidates.push({
        merchantDescriptor: descriptor,
        rawDescription: last.description,
        amount: last.amount,
        cycle,
        nextRenewalDate: addCycle(last.date, cycle),
        firstSeenDate: dayOnly(stream[0].date),
        accountId: last.accountId,
        paymentMethod: last.paymentMethod,
        categoryId: last.categoryId,
        priceHistory: buildPriceHistory(stream),
        transactionIds: stream.map((t) => t.id),
        occurrences: stream.length,
      });
    }
  }
  return candidates.sort((a, b) => b.amount - a.amount);
}
