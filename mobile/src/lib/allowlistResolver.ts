export type CatalogCategory = 'bank' | 'upi' | 'wallet' | 'merchant';

export interface CatalogEntry {
  packageName: string;
  displayName: string;
  category: CatalogCategory;
  region?: string;
}

/** Computes the effective notification allowlist from the catalog, the probed
 * install list, the set of packages we can actually probe (manifest <queries>),
 * and the user's per-app toggles.
 *
 * A package is a *candidate* when it is installed OR its visibility is unknown
 * (not declared in <queries>, so the probe can't confirm it). Candidates are
 * included unless the user has explicitly toggled them off. */
export function resolveAllowlist(
  catalog: CatalogEntry[],
  installed: string[],
  declaredQueries: string[],
  toggles: Record<string, boolean>,
): string[] {
  const installedSet = new Set(installed);
  const declaredSet = new Set(declaredQueries);
  return catalog
    .map((c) => c.packageName)
    .filter((pkg) => {
      const isCandidate = installedSet.has(pkg) || !declaredSet.has(pkg);
      return isCandidate && toggles[pkg] !== false;
    });
}
