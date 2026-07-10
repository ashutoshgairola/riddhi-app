export interface ResolvedName { name: string; emoji: string; color: string }
export type LlmNamer = (descriptor: string) => Promise<{ name: string; emoji: string } | null>;

const DEFAULT_COLOR = '#a78bfa';
const DEFAULT_EMOJI = '🔁';

// keyword (found in the normalized descriptor) → display. Specific merchants
// first; aggregator (generic) entries last so a real merchant never shadows.
const CATALOG: { match: string; name: string; emoji: string; color: string }[] = [
  { match: 'netflix', name: 'Netflix', emoji: '🎬', color: '#c97d8c' },
  { match: 'spotify', name: 'Spotify', emoji: '🎧', color: '#7faf93' },
  { match: 'youtube', name: 'YouTube Premium', emoji: '▶️', color: '#ff6b85' },
  { match: 'prime', name: 'Amazon Prime', emoji: '📦', color: '#6ea8ff' },
  { match: 'hotstar', name: 'Disney+ Hotstar', emoji: '✨', color: '#5ee0d8' },
  { match: 'disney', name: 'Disney+ Hotstar', emoji: '✨', color: '#5ee0d8' },
  { match: 'google one', name: 'Google One', emoji: '☁️', color: '#ffc24b' },
  { match: 'icloud', name: 'iCloud+', emoji: '🍎', color: '#8a8299' },
  { match: 'cult', name: 'Cult.fit', emoji: '🏋️', color: '#a78bfa' },
  { match: 'jio', name: 'JioSaavn', emoji: '🎵', color: '#6ea8ff' },
  // aggregators (generic — the real service is enriched from notification text)
  { match: 'google play', name: 'Google Play', emoji: '🅶', color: '#6ea8ff' },
  { match: 'apple.com', name: 'Apple', emoji: '🍎', color: '#8a8299' },
  { match: 'itunes', name: 'Apple', emoji: '🍎', color: '#8a8299' },
  { match: 'razorpay', name: 'Razorpay', emoji: '💳', color: '#6ea8ff' },
  { match: 'payu', name: 'PayU', emoji: '💳', color: '#6ea8ff' },
];

const AGGREGATORS = ['google play', 'apple.com', 'itunes', 'razorpay', 'payu'];

export function isAggregator(descriptor: string): boolean {
  const d = descriptor.toLowerCase();
  return AGGREGATORS.some((a) => d.includes(a));
}

/** Pull the real service name out of a Play/Gmail subscription-receipt body,
 * e.g. "Your subscription from True Software Scandinavia AB on Google Play…". */
export function extractServiceName(text: string): string | null {
  const m = text.match(/subscription from ([A-Z0-9][\w .&'-]+?) (?:on|has|will|is)\b/i);
  return m ? m[1].trim() : null;
}

function titleCase(descriptor: string): string {
  return descriptor
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function resolveFromCatalog(descriptor: string): ResolvedName | null {
  const d = descriptor.toLowerCase();
  const hit = CATALOG.find((c) => d.includes(c.match));
  return hit ? { name: hit.name, emoji: hit.emoji, color: hit.color } : null;
}

/**
 * Naming order: catalog (specific merchant) → notification hint (aggregators,
 * where the catalog only knows the generic aggregator name) → LLM → title-case.
 * The LLM never decides whether the group is a subscription.
 */
export async function resolveName(
  descriptor: string,
  opts?: { hint?: string | null; llm?: LlmNamer },
): Promise<ResolvedName> {
  const cat = resolveFromCatalog(descriptor);
  // A specific (non-aggregator) catalog hit is authoritative.
  if (cat && !isAggregator(descriptor)) return cat;
  // Aggregator: prefer the real service name from the notification hint.
  if (opts?.hint) return { name: opts.hint, emoji: cat?.emoji ?? DEFAULT_EMOJI, color: cat?.color ?? DEFAULT_COLOR };
  if (cat) return cat; // generic aggregator name (e.g. "Google Play")
  if (opts?.llm) {
    try {
      const r = await opts.llm(descriptor);
      if (r && r.name) return { name: r.name, emoji: r.emoji || DEFAULT_EMOJI, color: DEFAULT_COLOR };
    } catch {
      /* graceful fallback below */
    }
  }
  return { name: titleCase(descriptor), emoji: DEFAULT_EMOJI, color: DEFAULT_COLOR };
}
