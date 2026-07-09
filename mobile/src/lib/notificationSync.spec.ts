const getPending = jest.fn();
const markUploaded = jest.fn();
const setAllowlist = jest.fn();
const getInstalledPackages = jest.fn();
jest.mock('../../modules/notification-listener', () => ({
  isNotificationListenerAvailable: true,
  DEFAULT_ALLOWLIST: ['com.rapido.passenger'],
  DECLARED_QUERY_PACKAGES: ['com.rapido.passenger', 'com.ubercab'],
  getPending: (...a: any[]) => getPending(...a),
  markUploaded: (...a: any[]) => markUploaded(...a),
  setAllowlist: (...a: any[]) => setAllowlist(...a),
  getInstalledPackages: (...a: any[]) => getInstalledPackages(...a),
  isEnabled: () => true,
}));
const post = jest.fn();
jest.mock('../api/client', () => ({ apiClient: { post: (...a: any[]) => post(...a), get: jest.fn() } }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
const fetchCatalog = jest.fn();
jest.mock('./catalogSource', () => ({ fetchCatalog: (...a: any[]) => fetchCatalog(...a) }));
const getToggles = jest.fn();
jest.mock('./toggleStore', () => ({ getToggles: (...a: any[]) => getToggles(...a) }));

const asyncStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => asyncStore[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      asyncStore[k] = v;
    }),
  },
}));

import { uploadCaptured, configureAllowlist } from './notificationSync';

describe('uploadCaptured', () => {
  beforeEach(() => { getPending.mockReset(); markUploaded.mockReset(); post.mockReset(); });

  it('uploads pending captures and marks them uploaded', async () => {
    getPending.mockResolvedValueOnce([
      { id: '1', packageName: 'com.rapido.passenger', title: 'Ride', text: '₹159', postedAt: 1 },
    ]);
    post.mockResolvedValueOnce({ inserted: 1 });
    const n = await uploadCaptured();
    expect(post).toHaveBeenCalledWith('/notification-sync/ingest', {
      notifications: [
        { packageName: 'com.rapido.passenger', title: 'Ride', text: '₹159', postedAt: 1 },
      ],
    });
    expect(markUploaded).toHaveBeenCalledWith(['1']);
    expect(n).toBe(1);
  });

  it('no captures → no upload', async () => {
    getPending.mockResolvedValueOnce([]);
    const n = await uploadCaptured();
    expect(post).not.toHaveBeenCalled();
    expect(n).toBe(0);
  });
});

describe('configureAllowlist', () => {
  beforeEach(() => {
    setAllowlist.mockReset();
    getInstalledPackages.mockReset();
    fetchCatalog.mockReset();
    getToggles.mockReset();
    for (const k of Object.keys(asyncStore)) delete asyncStore[k];
  });

  it('pushes the resolved allowlist (installed ∩ catalog, honoring toggles)', async () => {
    fetchCatalog.mockResolvedValueOnce([
      { packageName: 'com.rapido.passenger', displayName: 'Rapido', category: 'merchant' },
      { packageName: 'com.ubercab', displayName: 'Uber', category: 'merchant' },
    ]);
    getInstalledPackages.mockResolvedValueOnce(['com.rapido.passenger']); // uber not installed
    getToggles.mockResolvedValueOnce({});
    await configureAllowlist();
    expect(setAllowlist).toHaveBeenCalledWith(['com.rapido.passenger']);
  });

  it('pushes an empty allowlist and skips catalog work when capture is paused', async () => {
    asyncStore['notification-sync/paused'] = '1';
    await configureAllowlist();
    expect(setAllowlist).toHaveBeenCalledWith([]);
    expect(fetchCatalog).not.toHaveBeenCalled();
  });
});
