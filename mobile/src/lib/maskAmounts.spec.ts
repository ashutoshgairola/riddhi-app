import { maskAmounts } from './maskAmounts';

const MASKED = '••••••';

it('masks multiple ₹ tokens and keeps trailing units intact', () => {
  expect(maskAmounts('₹19,550 left — ₹889/day')).toBe(`${MASKED} left — ${MASKED}/day`);
});

it('masks a ₹ token followed by prose', () => {
  expect(maskAmounts('₹450 — Lunch at cafe')).toBe(`${MASKED} — Lunch at cafe`);
});

it('leaves strings with no ₹ token unchanged', () => {
  expect(maskAmounts('No amounts here today')).toBe('No amounts here today');
});

it('masks lakh-suffixed amounts', () => {
  expect(maskAmounts('₹1.2L')).toBe(MASKED);
});

it('does not eat a trailing punctuation comma after the amount', () => {
  expect(maskAmounts('₹5,000, up 10%')).toBe(`${MASKED}, up 10%`);
});

it('still fully masks internal thousands grouping', () => {
  expect(maskAmounts('₹19,550')).toBe(MASKED);
});
