// keyword-map.ts — Maps merchant keywords and SMS patterns to categories

export type Category =
  | 'Food'
  | 'Utilities'
  | 'Income'
  | 'Shopping'
  | 'Transport'
  | 'Entertainment'
  | 'Groceries'
  | 'Bills'
  | 'Health';

export interface BankInfo {
  pattern: RegExp;
  name: string;
  short: string;
}

// Bank name patterns → canonical name + short code
export const BANK_MAP: BankInfo[] = [
  { pattern: /hdfc/i,          name: 'HDFC Bank',       short: 'HDFC' },
  { pattern: /icici/i,         name: 'ICICI Bank',      short: 'ICICI' },
  { pattern: /axis/i,          name: 'Axis Bank',       short: 'Axis' },
  { pattern: /\bsbi\b/i,       name: 'SBI',             short: 'SBI' },
  { pattern: /kotak/i,         name: 'Kotak Bank',      short: 'Kotak' },
  { pattern: /\byes\s*bank/i,  name: 'Yes Bank',        short: 'Yes' },
  { pattern: /idfc/i,          name: 'IDFC Bank',       short: 'IDFC' },
  { pattern: /\bpnb\b/i,       name: 'PNB',             short: 'PNB' },
  { pattern: /bank\s*of\s*baroda/i, name: 'Bank of Baroda', short: 'BoB' },
  { pattern: /canara/i,        name: 'Canara Bank',     short: 'Canara' },
];

// Keyword → Category mappings (checked against full SMS text + merchant name)
export const CATEGORY_KEYWORD_MAP: Array<{ keywords: string[]; category: Category }> = [
  {
    keywords: ['swiggy', 'zomato', 'food', 'restaurant', 'cafe', 'dining', 'dominos', 'mcd', 'kfc'],
    category: 'Food',
  },
  {
    keywords: ['bescom', 'electricity', 'water bill', 'gas bill', 'utility', 'torrent power', 'mseb', 'tneb'],
    category: 'Utilities',
  },
  {
    keywords: ['salary', 'payroll', 'stipend', 'wages', 'acme corp', 'credited by'],
    category: 'Income',
  },
  {
    keywords: ['amazon', 'myntra', 'flipkart', 'meesho', 'nykaa', 'ajio', 'shopping', 'store'],
    category: 'Shopping',
  },
  {
    keywords: ['uber', 'ola', 'metro', 'fuel', 'bpcl', 'petrol', 'diesel', 'rapido', 'bus', 'cab', 'taxi', 'hpcl', 'iocl'],
    category: 'Transport',
  },
  {
    keywords: ['netflix', 'hotstar', 'prime', 'spotify', 'youtube', 'entertainment', 'disney'],
    category: 'Entertainment',
  },
  {
    keywords: ['blinkit', 'zepto', 'bigbasket', 'grofer', 'grocery', 'groceries', 'supermarket', 'dmart'],
    category: 'Groceries',
  },
  {
    keywords: ['bill', 'recharge', 'airtel', 'jio', 'vi ', 'vodafone', 'bsnl', 'payment', 'emi'],
    category: 'Bills',
  },
  {
    keywords: ['apollo', 'pharmacy', 'hospital', 'clinic', 'medic', 'health', 'doctor', 'lab', '1mg', 'netmeds'],
    category: 'Health',
  },
];
