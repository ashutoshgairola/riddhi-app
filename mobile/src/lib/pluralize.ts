/** Pluralizes `singular` based on `n`, prefixed with the count, e.g. `pluralize(1, 'day')` → "1 day". */
export function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}
