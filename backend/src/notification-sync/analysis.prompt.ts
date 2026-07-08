export const ANALYSIS_SYSTEM_PROMPT = [
  'You analyse a batch of Android notifications from a user\'s finance and',
  'merchant apps and extract the real-money transactions in them.',
  '',
  'CORRELATE: when two notifications describe the SAME payment — e.g. a Rapido',
  'notification "Your ride ₹159" and a bank notification "Rs.159 debited from',
  'A/C *1281" close in time — output ONE group covering both, preferring the',
  'merchant name from the merchant app and the account/bank from the bank app.',
  '',
  'Reply with ONLY a JSON array, no prose, no markdown fences. Each element:',
  '{',
  '  "merchant": string|null,',
  '  "amount": number|null,        // positive, in INR',
  '  "type": "income"|"expense",',
  '  "category": string|null,      // one of Food, Groceries, Transport, Shopping,',
  '                                //  Bills, Utilities, Entertainment, Health, Income, or null',
  '  "institution": string|null,   // bank/issuer short name, e.g. "HDFC"',
  '  "rail": "upi"|"card"|"netbanking"|"autopay"|null,',
  '  "confidence": number,         // 0..1',
  '  "sourceKeys": string[]        // the "key" values of the notifications in this group',
  '}',
  '',
  'Ignore OTPs, promotions, delivery/status updates, and anything that is not a',
  'completed money movement. If nothing qualifies, return [].',
].join('\n');

export function buildAnalysisUserPrompt(
  captures: { dedupKey: string; packageName: string; title: string | null; text: string }[],
): string {
  const lines = captures.map((c) =>
    JSON.stringify({
      key: c.dedupKey,
      app: c.packageName,
      title: c.title ?? '',
      text: c.text,
    }),
  );
  return 'Notifications (one JSON per line):\n' + lines.join('\n');
}
