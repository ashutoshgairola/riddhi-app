import { resolveAllowlist, type CatalogEntry } from './allowlistResolver';

const cat: CatalogEntry[] = [
  { packageName: 'com.phonepe.app', displayName: 'PhonePe', category: 'upi' },
  { packageName: 'com.ubercab', displayName: 'Uber', category: 'merchant' },
  { packageName: 'com.newbank', displayName: 'New Bank', category: 'bank' }, // not in <queries>
];
const declared = ['com.phonepe.app', 'com.ubercab']; // com.newbank NOT declared

it('includes installed declared packages', () => {
  const r = resolveAllowlist(cat, ['com.phonepe.app'], declared, {});
  expect(r).toContain('com.phonepe.app');
});

it('excludes declared-but-not-installed packages', () => {
  const r = resolveAllowlist(cat, ['com.phonepe.app'], declared, {});
  expect(r).not.toContain('com.ubercab');
});

it('includes undeclared (unknown-visibility) packages regardless of install list', () => {
  const r = resolveAllowlist(cat, ['com.phonepe.app'], declared, {});
  expect(r).toContain('com.newbank');
});

it('excludes packages explicitly toggled off', () => {
  const r = resolveAllowlist(cat, ['com.phonepe.app'], declared, { 'com.phonepe.app': false });
  expect(r).not.toContain('com.phonepe.app');
});

it('defaults to on when toggle key is absent', () => {
  const r = resolveAllowlist(cat, ['com.phonepe.app'], declared, { 'com.ubercab': true });
  expect(r).toContain('com.phonepe.app');
});

it('empty catalog yields empty list', () => {
  expect(resolveAllowlist([], ['com.phonepe.app'], declared, {})).toEqual([]);
});
