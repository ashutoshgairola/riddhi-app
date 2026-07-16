/**
 * Pure form → PATCH-body builder for the "Set up this card" flow. Kept
 * RN-free so the ts-jest harness can test it. Mirrors the backend
 * UpdateCardDto whitelist (creditLimit, statementDay 1..28, network, last4).
 */
export interface CardSetupFields {
  creditLimit: string;
  statementDay: string;
  network: string;
  last4: string;
}

export interface CardSetupPatch {
  creditLimit: number;
  statementDay: number;
  network?: string;
  last4?: string;
}

function clampDay(raw: string): number {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n > 28 ? 28 : n;
}

export function buildCardSetupPatch(fields: CardSetupFields): CardSetupPatch {
  const creditLimit = Number(fields.creditLimit) || 0;
  const patch: CardSetupPatch = {
    creditLimit,
    statementDay: clampDay(fields.statementDay),
  };
  const network = fields.network.trim();
  if (network) patch.network = network.slice(0, 40);
  const last4 = fields.last4.replace(/\D/g, '').slice(-4);
  if (last4) patch.last4 = last4;
  return patch;
}
