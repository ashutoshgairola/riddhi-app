import { BANK_MAP, CATEGORY_KEYWORD_MAP, Category } from './keyword-map';

export interface ParsedSms {
  merchant: string | null;
  amount: number | null;
  type: 'income' | 'expense';
  category: Category | null;
  bank: string | null;
  last4: string | null;
  confidence: number;
  paymentMethod: 'upi' | 'card' | 'autopay';
}

/** True for OTP / verification SMS, which must not become transactions.
 * A completed money-movement verb marks a real alert, so those are never
 * OTPs even when they carry an "…never share your OTP" footer with a
 * helpline/ref number nearby. Otherwise, an OTP keyword plus any 3–8
 * digit code (either word order) is an OTP request. */
export function isOtpMessage(text: string): boolean {
  if (
    /\b(?:debited|credited|spent|paid|withdrawn|sent|deposited|received|purchased?)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return (
    /\b(?:otp|one[\s-]?time\s*password|verification\s*(?:code|pin))\b/i.test(text) &&
    /\b\d{3,8}\b/.test(text)
  );
}

export function parseSms(raw: string): ParsedSms {
  const text = raw;
  const amount = extractAmount(text);
  const type = extractType(text);
  const { bank, bankShort: _bankShort } = extractBank(text);
  const last4 = extractLast4(text);
  const merchant = extractMerchant(text, type);
  const category = extractCategory(text, merchant, type);
  const confidence = calcConfidence(amount, bank, last4, merchant, category);
  const paymentMethod = extractPaymentMethod(text);
  return { merchant, amount, type, category, bank, last4, confidence, paymentMethod };
}

// ── Amount ────────────────────────────────────────────────────────────────
function extractAmount(text: string): number | null {
  // Collect every currency-prefixed amount, tagging those immediately
  // preceded by a balance label (Avl Bal / Available Balance / Bal) so the
  // real transaction amount is preferred over an "Avl Bal Rs.X" figure — the
  // balance label is captured adjacent to its amount (group 1) to avoid a
  // positional window bleeding a prior clause's "Bal" onto a later amount.
  const rx =
    /((?:avl|available|avbl)\.?\s*bal(?:ance)?\.?\s*:?\s*|\bbal(?:ance)?\.?\s*:?\s*)?(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/gi;
  const matches: { value: number; isBalance: boolean }[] = [];
  for (const m of text.matchAll(rx)) {
    const value = parseFloat(m[2].replace(/,/g, ''));
    if (isNaN(value)) continue;
    matches.push({ value, isBalance: Boolean(m[1]) });
  }
  if (matches.length === 0) return null;
  // Prefer the first non-balance amount (the actual transaction); fall back
  // to the first amount if every match looks like a balance.
  const txn = matches.find((x) => !x.isBalance) ?? matches[0];
  return txn.value; // always positive
}

// ── Type ──────────────────────────────────────────────────────────────────
function extractType(text: string): 'income' | 'expense' {
  const lower = text.toLowerCase();
  // Debit verbs. "credit card" must NOT be read as an income signal — a
  // spend on a credit card is an expense (e.g. "ICICI Credit Card ... used").
  const isDebit =
    /\b(debited|debit|sent|used|spent|paid|withdrawn)\b|purchase/i.test(
      lower,
    );
  const isCredit =
    /\b(credited|received|deposited)\b/i.test(lower) &&
    !/credit\s*card/i.test(lower);
  if (isDebit) return 'expense';
  if (isCredit) return 'income';
  return 'expense'; // default
}

// ── Bank ──────────────────────────────────────────────────────────────────
function extractBank(text: string): {
  bank: string | null;
  bankShort: string;
} {
  for (const b of BANK_MAP) {
    if (b.pattern.test(text)) {
      return { bank: b.name, bankShort: b.short };
    }
  }
  return { bank: null, bankShort: '' };
}

// ── Last4 ─────────────────────────────────────────────────────────────────
function extractLast4(text: string): string | null {
  // Pattern: A/c x4521 | A/c XX4521 | Card xx8830
  const acRx = /(?:a\/c|ac|card)\s*(?:x{1,4}|no\.?)?\s*(\d{4})/i;
  const acM = text.match(acRx);
  if (acM) return acM[1];

  // Pattern: xx8830 standalone
  const xxRx = /x{2,4}(\d{4})/i;
  const xxM = text.match(xxRx);
  if (xxM) return xxM[1];

  return null;
}

// ── Merchant ──────────────────────────────────────────────────────────────
function extractMerchant(
  text: string,
  type: 'income' | 'expense',
): string | null {
  // "to SWIGGY" / "at AMAZON" / "for BESCOM BILL PAYMENT" / "by SALARY ACME CORP"
  const merchantRx =
    /\b(?:to|at|for|by)\s+([A-Z][A-Z0-9 &\-]+?)(?:\s+(?:on|via|ref|avl|using|\.|\d{2}[-\/])|$)/;
  const m = text.match(merchantRx);
  if (m) {
    const raw = m[1].trim();
    return titleCase(raw);
  }

  // Fallback: keyword-based merchant from known names
  const keywords: Array<{ kw: string; merchant: string }> = [
    { kw: 'swiggy', merchant: 'Swiggy' },
    { kw: 'zomato', merchant: 'Zomato' },
    { kw: 'amazon', merchant: 'Amazon' },
    { kw: 'flipkart', merchant: 'Flipkart' },
    { kw: 'myntra', merchant: 'Myntra' },
    { kw: 'uber', merchant: 'Uber' },
    { kw: 'ola', merchant: 'Ola' },
    { kw: 'netflix', merchant: 'Netflix' },
    { kw: 'blinkit', merchant: 'Blinkit' },
    { kw: 'zepto', merchant: 'Zepto' },
    { kw: 'bigbasket', merchant: 'BigBasket' },
    { kw: 'bescom', merchant: 'BESCOM Electricity' },
    { kw: 'salary', merchant: 'Salary' },
  ];
  const lower = text.toLowerCase();
  for (const entry of keywords) {
    if (lower.includes(entry.kw)) return entry.merchant;
  }

  return null;
}

// ── Payment Method ────────────────────────────────────────────────────────
function extractPaymentMethod(text: string): 'upi' | 'card' | 'autopay' {
  const t = text.toLowerCase();
  if (/\b(e-?mandate|mandate|auto\s?pay|autopay|si\b|standing instruction|ach|nach|sip)\b/.test(t)) {
    return 'autopay';
  }
  if (/credit\s*card|debit\s*card|\bcard\b/.test(t)) {
    return 'card';
  }
  return 'upi';
}

// ── Category ──────────────────────────────────────────────────────────────
function extractCategory(
  text: string,
  merchant: string | null,
  type: 'income' | 'expense',
): Category | null {
  if (type === 'income') return 'Income';

  const haystack = (text + ' ' + (merchant ?? '')).toLowerCase();

  for (const entry of CATEGORY_KEYWORD_MAP) {
    for (const kw of entry.keywords) {
      if (haystack.includes(kw.toLowerCase())) {
        return entry.category;
      }
    }
  }
  return null;
}

// ── Confidence ────────────────────────────────────────────────────────────
function calcConfidence(
  amount: number | null,
  bank: string | null,
  last4: string | null,
  merchant: string | null,
  category: string | null,
): number {
  let score = 0.5;
  if (amount !== null) score += 0.1;
  if (bank !== null) score += 0.1;
  if (last4 !== null) score += 0.1;
  if (merchant !== null) score += 0.1;
  if (category !== null) score += 0.1;
  return Math.min(parseFloat(score.toFixed(2)), 0.99);
}

// ── Helpers ───────────────────────────────────────────────────────────────
function titleCase(str: string): string {
  // Special-case all-caps acronyms of 4+ letters that should stay as-is
  return str
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}
