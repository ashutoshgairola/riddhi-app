/**
 * localParse — RN port of the web app's local fallback transaction/answer
 * parser, used when the AI helper (`askRiddhi`) isn't available.
 *
 * Source of truth: project/riddhi/MobileChat.jsx:38–68 (`function
 * localParse(text)`). Ported verbatim — same regexes, same category
 * keyword map, same time-parse logic, same merchant extraction, same
 * canned goal/budget/overspend answers, same default fallback reply. Only
 * change from the source: TypeScript types and an explicit `ChatTx`
 * return shape (the source returns a plain `{merchant,amount,category,time}`
 * object inline; this gives it a name so `askRiddhi.ts` and the chat
 * screen/`ChatTxCard` can share it).
 */

export interface ChatTx {
  merchant: string;
  amount: number;
  category: string;
  time: string;
}

export interface LocalParseResult {
  reply: string;
  transaction: ChatTx | null;
}

// MobileChat.jsx:39–68
export function localParse(text: string): LocalParseResult {
  const t = text.toLowerCase();
  const m = text.replace(/,/g, '').match(/(?:₹|rs\.?\s*)?(\d{2,7})/);
  const amt = m ? parseInt(m[1], 10) : null;
  const isIncome = /salary|received|got|credited|income|refund/.test(t);
  if (amt && !/goal|budget|plan|how|why|where|should|save/.test(t)) {
    let cat = 'Other';
    if (/pizza|food|lunch|dinner|swiggy|zomato|eat|restaurant|coffee|snack/.test(t)) cat = 'Food';
    else if (/uber|ola|metro|fuel|petrol|cab|bus|transport|auto/.test(t)) cat = 'Transport';
    else if (/amazon|shop|bought|flipkart|clothes|shoes/.test(t)) cat = 'Shopping';
    else if (/grocery|groceries|blinkit|zepto|bigbasket|vegetables/.test(t)) cat = 'Groceries';
    else if (/bill|electricity|recharge|water|gas|rent/.test(t)) cat = 'Bills';
    else if (/movie|netflix|game|fun|concert/.test(t)) cat = 'Fun';
    else if (isIncome) cat = 'Income';
    const timeM = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    let time = '';
    if (timeM) {
      const h = parseInt(timeM[1], 10);
      const ap = timeM[3] ? timeM[3].toUpperCase() : h < 8 ? 'PM' : 'AM';
      time = `${h}:${timeM[2] || '00'} ${ap}`;
    }
    const merchant =
      cat === 'Income'
        ? 'Income'
        : text
            .replace(/[^a-z ]/gi, '')
            .split(/\bfor\b|\bat\b/)[0]
            .trim()
            .split(' ')
            .slice(0, 3)
            .join(' ') || cat;
    return {
      reply: isIncome
        ? `Logged ₹${amt.toLocaleString('en-IN')} income. Nice — that lifts your buffer.`
        : `Got it — ₹${amt.toLocaleString('en-IN')} for ${merchant || cat}. Added to today.`,
      transaction: {
        merchant: merchant ? merchant[0].toUpperCase() + merchant.slice(1) : cat,
        amount: isIncome ? amt : -amt,
        category: cat,
        time,
      },
    };
  }
  // goal / budget advice
  if (/bike|goal/.test(t)) {
    return {
      reply: `Your bike goal needs ₹75,000 more (₹45k of ₹1.2L saved). Setting aside ₹12,500/month finishes it in 6 months. Trimming Shopping back to its ₹9k cap frees up most of that on its own.`,
      transaction: null,
    };
  }
  if (/overspend|over budget|where/.test(t)) {
    return {
      reply: `Shopping is your one red flag — ₹10,800 against a ₹9,000 cap, so ₹1,800 over. Everything else is within budget. Ease off there and you'll close the month with room to spare.`,
      transaction: null,
    };
  }
  return {
    reply: `I can log spends ("chai for ₹40 at 4pm") or help you plan — try asking how to hit your bike goal.`,
    transaction: null,
  };
}
