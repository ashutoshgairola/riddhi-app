import { Injectable } from '@nestjs/common';
import { ParseSmsResult } from './dto/parse.dto';
import { BANK_MAP, CATEGORY_KEYWORD_MAP, Category } from './keyword-map';

@Injectable()
export class SmsSyncService {
  parse(raw: string): ParseSmsResult {
    const text = raw; // keep original for matching

    const amount = this.extractAmount(text);
    const type = this.extractType(text);
    const { bank, bankShort } = this.extractBank(text);
    const last4 = this.extractLast4(text);
    const merchant = this.extractMerchant(text, type);
    const category = this.extractCategory(text, merchant, type);
    const account = bank && last4 ? `${bankShort} •${last4}` : null;
    const confidence = this.calcConfidence(amount, bank, last4, merchant, category);

    return { merchant, amount, type, category, account, bank, last4, confidence };
  }

  // ── Amount ────────────────────────────────────────────────────────────────
  private extractAmount(text: string): number | null {
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
  private extractType(text: string): 'income' | 'expense' {
    const lower = text.toLowerCase();
    // Debit verbs. "credit card" must NOT be read as an income signal — a
    // spend on a credit card is an expense (e.g. "ICICI Credit Card ... used").
    const isDebit = /\b(debited|debit|sent|used|spent|paid|withdrawn)\b|purchase/i.test(lower);
    const isCredit =
      /\b(credited|received|deposited)\b/i.test(lower) && !/credit\s*card/i.test(lower);
    if (isDebit) return 'expense';
    if (isCredit) return 'income';
    return 'expense'; // default
  }

  // ── Bank ──────────────────────────────────────────────────────────────────
  private extractBank(text: string): { bank: string | null; bankShort: string } {
    for (const b of BANK_MAP) {
      if (b.pattern.test(text)) {
        return { bank: b.name, bankShort: b.short };
      }
    }
    return { bank: null, bankShort: '' };
  }

  // ── Last4 ─────────────────────────────────────────────────────────────────
  private extractLast4(text: string): string | null {
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
  private extractMerchant(text: string, type: 'income' | 'expense'): string | null {
    // "to SWIGGY" / "at AMAZON" / "for BESCOM BILL PAYMENT" / "by SALARY ACME CORP"
    const merchantRx = /\b(?:to|at|for|by)\s+([A-Z][A-Z0-9 &\-]+?)(?:\s+(?:on|via|ref|avl|using|\.|\d{2}[-\/])|$)/;
    const m = text.match(merchantRx);
    if (m) {
      const raw = m[1].trim();
      return this.titleCase(raw);
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

  // ── Category ──────────────────────────────────────────────────────────────
  private extractCategory(text: string, merchant: string | null, type: 'income' | 'expense'): Category | null {
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
  private calcConfidence(
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
  private titleCase(str: string): string {
    // Special-case all-caps acronyms of 4+ letters that should stay as-is
    return str
      .split(/\s+/)
      .map((word) => {
        if (!word) return word;
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }
}
