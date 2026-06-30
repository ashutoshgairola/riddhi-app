/**
 * askRiddhi — AI helper behind the "Ask Riddhi" chat screen.
 *
 * Source of truth: project/riddhi/MobileChat.jsx:27–36 (`CHAT_CONTEXT`,
 * copied verbatim) and :70–82 (`async function askRiddhi(history)`). The
 * web prototype calls a host-injected `window.claude.complete` helper that
 * doesn't exist in RN; this port replaces that single call with a 2-step
 * fallback chain per the Task 5.2 spec, while keeping the prompt assembly
 * (`CHAT_CONTEXT` + conversation transcript) and the "slice JSON between
 * first `{` and last `}`" parse identical to the source:
 *
 *   1. POST {EXPO_PUBLIC_API_URL}/ai-chat with the conversation — lets a
 *      real backend own the model call/key when one is configured.
 *   2. Else call the Anthropic Messages API directly from the client using
 *      EXPO_PUBLIC_ANTHROPIC_API_KEY (dev/demo convenience — not meant for
 *      production secret hygiene).
 *   3. On ANY failure (no key/URL configured, network error, bad JSON) —
 *      fall through to `localParse`, so the chat always works offline.
 *
 * Expo inlines `EXPO_PUBLIC_*` env vars into the bundle at build time
 * (see `.env.example`); reading them via `process.env.EXPO_PUBLIC_*` here
 * is the standard Expo pattern and works whether or not the var is set
 * (unset -> undefined -> that branch of the fallback chain is skipped).
 */
import { localParse, type ChatTx } from './localParse';

export interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
}

export interface AskRiddhiResult {
  reply: string;
  transaction: ChatTx | null;
}

// MobileChat.jsx:27–36, verbatim.
const CHAT_CONTEXT = `You are Riddhi, a warm, concise personal-finance assistant inside an Indian expense-tracker app. Currency is INR (₹).
The user's situation:
- Monthly budget ₹1,00,000; spent ₹91,000 so far; 5 days left in the month; safe-to-spend ₹1,800/day.
- Top spend categories this month: Housing ₹29k, Food ₹20k, Transport ₹13k, Shopping ₹10.8k (₹1.8k over its ₹9k cap).
- Goal "New Bike" — target ₹1,20,000, saved ₹45,000.
- Accounts: HDFC Savings, ICICI Credit Card.
When the user states a spend or income in natural language (e.g. "ordered pizza at 5 for 1000"), extract a transaction.
Respond with ONLY a raw JSON object (no markdown, no code fences) shaped exactly:
{"reply":"<one or two warm sentences>","transaction":{"merchant":"<short name>","amount":<number; negative for expense, positive for income>,"category":"Food|Transport|Shopping|Groceries|Bills|Health|Fun|Income|Other","time":"<like 5:00 PM, or empty>"}}
If it's a question or not a transaction, set "transaction" to null and put a genuinely helpful, specific answer in "reply" (up to 4 short sentences; use the numbers above; you may use ₹).`;

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_MAX_TOKENS = 512;

function buildPrompt(history: ChatMessage[]): string {
  const convo = history.map((m) => `${m.role === 'user' ? 'User' : 'Riddhi'}: ${m.text}`).join('\n');
  return `${CHAT_CONTEXT}\n\nConversation so far:\n${convo}\n\nRespond now as JSON:`;
}

/** Slices the JSON object out of a raw model response (between the first
 * `{` and the last `}`) and parses it — mirrors MobileChat.jsx:76–77. */
function parseJsonObject(raw: string): AskRiddhiResult {
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s === -1 || e === -1 || e < s) {
    throw new Error('askRiddhi: no JSON object found in response');
  }
  const obj = JSON.parse(raw.slice(s, e + 1));
  return { reply: obj.reply || '…', transaction: obj.transaction || null };
}

/** Step 1: try a backend endpoint, if configured. Returns null (rather
 * than throwing) when the API URL isn't set, so the caller can move on to
 * the next fallback without distinguishing "not configured" from "failed". */
async function tryBackend(history: ChatMessage[]): Promise<AskRiddhiResult | null> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return null;

  const res = await fetch(`${apiUrl}/ai-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: history }),
  });
  if (!res.ok) throw new Error(`askRiddhi: backend responded ${res.status}`);
  const data = await res.json();
  // Accept either an already-shaped {reply, transaction} payload or a raw
  // model string under `text`/`content` that still needs JSON-slicing.
  if (typeof data === 'object' && data !== null && 'reply' in data) {
    return { reply: data.reply || '…', transaction: data.transaction || null };
  }
  const raw = typeof data === 'string' ? data : data.text ?? data.content ?? '';
  return parseJsonObject(raw);
}

/** Step 2: call the Anthropic Messages API directly. Returns null when no
 * API key is configured. */
async function tryAnthropic(history: ChatMessage[]): Promise<AskRiddhiResult | null> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = buildPrompt(history);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`askRiddhi: Anthropic API responded ${res.status}`);
  const data = await res.json();
  const raw: string = data?.content?.[0]?.text ?? '';
  return parseJsonObject(raw);
}

/**
 * Resolves a reply (+ optional extracted transaction) for the current
 * chat history. Tries the backend, then the Anthropic API directly, then
 * falls back to the local regex-based parser on any error — so the chat
 * always produces a usable response, even fully offline / unconfigured.
 */
export async function askRiddhi(history: ChatMessage[]): Promise<AskRiddhiResult> {
  try {
    const fromBackend = await tryBackend(history);
    if (fromBackend) return fromBackend;

    const fromAnthropic = await tryAnthropic(history);
    if (fromAnthropic) return fromAnthropic;

    return localParse(history[history.length - 1].text);
  } catch (err) {
    return localParse(history[history.length - 1].text);
  }
}
