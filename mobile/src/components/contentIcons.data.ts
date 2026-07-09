// Content-icon data module (pure logic — no JSX/React).
//
// Ported verbatim from the web design mock's icon library:
// project/riddhi/MobileCore.jsx
//   - MICONS keys      -> ICON_NAMES  (lines 235-313)
//   - M_EMOJI map      -> M_EMOJI     (lines 316-329)
//   - MICON_LIST       -> ICON_LIST   (lines 349-361)
//
// This module only carries the data + resolver logic. JSX icon components,
// the picker UI, and the app rollout are handled in later tasks.

export const ICON_NAMES = [
  'home2', 'food', 'cart', 'bag', 'car', 'train', 'plane', 'bolt', 'pill', 'film',
  'gradCap', 'briefcase', 'laptop', 'undo', 'gift', 'bank2', 'card2', 'wallet', 'cash',
  'coins', 'piggy', 'trendUp', 'trendDown', 'chart', 'target', 'ledger', 'sync', 'repeat2',
  'transfer', 'party', 'cake', 'ring', 'flame', 'drink', 'trophy', 'ball', 'music',
  'headphones', 'play', 'pause', 'package', 'cloud', 'dumbbell', 'apple', 'tree', 'plant',
  'scissors', 'lifebuoy', 'umbrella', 'phone', 'calendar2', 'users', 'trash', 'pencil',
  'plus2', 'sun', 'moon', 'globe', 'eye2', 'lock', 'key', 'logout', 'mail', 'export',
  'help', 'check', 'warn', 'doc', 'sparkle2', 'star', 'heart', 'fuel', 'settings2', 'tag',
  'bell3', 'search2', 'dot',
] as const;

export type ContentIconName = (typeof ICON_NAMES)[number];

export const M_EMOJI: Record<string, ContentIconName> = {
  '📒': 'ledger', '🔄': 'sync', '🔁': 'repeat2', '⊙': 'target', '🎯': 'target', '🎉': 'party', '🥳': 'party', '🎊': 'party',
  '▲': 'trendUp', '📈': 'trendUp', '📉': 'trendDown', '≋': 'chart', '📊': 'chart', '💳': 'card2', '🏷': 'tag', '🔔': 'bell3',
  '⚙': 'settings2', '🍽': 'food', '🚗': 'car', '🚕': 'car', '🛍': 'bag', '🛒': 'cart', '⚡': 'bolt', '💊': 'pill', '🎬': 'film',
  '💼': 'briefcase', '💻': 'laptop', '↩': 'undo', '🎁': 'gift', '🏦': 'bank2', '✅': 'check', '✓': 'check', '📤': 'export',
  '❓': 'help', '💸': 'cash', '💰': 'coins', '🪙': 'coins', '📧': 'mail', '✉': 'mail', '🔒': 'lock', '🍎': 'apple', '⚠': 'warn',
  '📄': 'doc', '📑': 'doc', '📜': 'doc', '📋': 'doc', '🧾': 'doc', '✨': 'sparkle2', '🎄': 'tree', '🏡': 'home2', '🏠': 'home2',
  '🎓': 'gradCap', '🍾': 'drink', '🏆': 'trophy', '🎃': 'flame', '⚽': 'ball', '🎸': 'music', '🐣': 'plant', '➕': 'plus2',
  '🗑': 'trash', '🗓': 'calendar2', '📅': 'calendar2', '📆': 'calendar2', '👥': 'users', '🚇': 'train', '🌱': 'plant',
  '✂': 'scissors', '🛟': 'lifebuoy', '🏖': 'umbrella', '📱': 'phone', '👛': 'wallet', '✏': 'pencil', '✎': 'pencil', '↔': 'transfer',
  '☀': 'sun', '🌙': 'moon', '☾': 'moon', '💤': 'moon', '🌐': 'globe', '👁': 'eye2', '🔑': 'key', '🚪': 'logout', '↻': 'sync',
  '🐖': 'piggy', '✈': 'plane', '▶': 'play', '⏸': 'pause', '🎧': 'headphones', '📦': 'package', '☁': 'cloud', '🏋': 'dumbbell',
  '🎂': 'cake', '💍': 'ring', '🪔': 'flame', '⛽': 'fuel', '🔎': 'search2', '🔵': 'globe', '•': 'dot',
};

export const ICON_LIST: readonly (readonly [ContentIconName, string])[] = [
  ['home2', 'Home'], ['food', 'Food'], ['cart', 'Groceries'], ['bag', 'Shopping'], ['car', 'Car'], ['fuel', 'Fuel'],
  ['train', 'Transit'], ['plane', 'Travel'], ['umbrella', 'Beach'], ['bolt', 'Utilities'], ['pill', 'Health'],
  ['dumbbell', 'Fitness'], ['heart', 'Care'], ['film', 'Movies'], ['play', 'Streaming'], ['music', 'Music'],
  ['headphones', 'Audio'], ['gradCap', 'Education'], ['briefcase', 'Work'], ['laptop', 'Tech'], ['phone', 'Phone'],
  ['bank2', 'Bank'], ['card2', 'Card'], ['wallet', 'Wallet'], ['cash', 'Cash'], ['coins', 'Coins'], ['piggy', 'Savings'],
  ['trendUp', 'Invest'], ['chart', 'Reports'], ['target', 'Goal'], ['repeat2', 'Recurring'], ['gift', 'Gift'],
  ['party', 'Party'], ['cake', 'Birthday'], ['ring', 'Wedding'], ['tree', 'Holiday'], ['flame', 'Festival'],
  ['drink', 'Drinks'], ['trophy', 'Sports'], ['ball', 'Games'], ['plant', 'Garden'], ['users', 'Family'],
  ['package', 'Delivery'], ['cloud', 'Cloud'], ['doc', 'Documents'], ['calendar2', 'Calendar'], ['bell3', 'Reminder'],
  ['sparkle2', 'Sparkle'], ['star', 'Star'], ['sun', 'Sun'], ['moon', 'Night'], ['globe', 'World'], ['key', 'Keys'],
  ['lock', 'Security'], ['scissors', 'Services'], ['tag', 'Label'], ['apple', 'Apple'], ['ledger', 'Ledger'],
] as const;

export function resolveIconName(value: string | null | undefined): ContentIconName | null {
  if (value == null || value === '') return null;
  const key = String(value).replace(/️/g, ''); // strip variation selector (U+FE0F)
  if ((ICON_NAMES as readonly string[]).includes(key)) return key as ContentIconName;
  return M_EMOJI[key] ?? null;
}
