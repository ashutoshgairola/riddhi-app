const get = jest.fn();
jest.mock('../api/client', () => ({ apiClient: { get: (...a: any[]) => get(...a) } }));

const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
  },
}));

jest.mock('../../modules/notification-listener', () => ({
  DEFAULT_ALLOWLIST: ['com.phonepe.app', 'com.ubercab'],
}));

import { fetchCatalog } from './catalogSource';

const remote = [{ packageName: 'com.remote.bank', displayName: 'Remote', category: 'bank' }];

beforeEach(() => { get.mockReset(); for (const k of Object.keys(store)) delete store[k]; });

it('fetches from backend and caches the result', async () => {
  get.mockResolvedValueOnce(remote);
  const r = await fetchCatalog();
  expect(get).toHaveBeenCalledWith('/notification-sync/catalog');
  expect(r).toEqual(remote);
  // second call, backend now failing → served from cache
  get.mockRejectedValueOnce(new Error('offline'));
  const r2 = await fetchCatalog();
  expect(r2).toEqual(remote);
});

it('falls back to the bundled seed when never cached and backend fails', async () => {
  get.mockRejectedValueOnce(new Error('offline'));
  const r = await fetchCatalog();
  expect(r.map((c) => c.packageName)).toEqual(['com.phonepe.app', 'com.ubercab']);
  expect(r.every((c) => c.displayName && c.category)).toBe(true);
});
