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

import { uploadCaptured, configureAllowlist, applyDetectedEdit, type DetectedView } from './notificationSync';

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

describe('applyDetectedEdit', () => {
  const base: DetectedView = {
    id: 'det-1',
    merchant: 'DILIP KUMAR',
    amount: 150,
    type: 'expense',
    suggestedCategory: null,
    accountId: null,
    paymentMethod: 'upi',
    confidence: 0.9,
    postedAt: '2026-07-14T17:36:00.000Z',
  };
  const values = {
    desc: 'Dilip (milk)',
    amount: '180',
    cat: 'Groceries',
    account: 'acc-9',
    date: '2026-07-13',
    type: 'expense',
  };

  it('maps form values onto the view', () => {
    const out = applyDetectedEdit(base, values);
    expect(out).toEqual({
      ...base,
      merchant: 'Dilip (milk)',
      amount: 180,
      type: 'expense',
      suggestedCategory: 'Groceries',
      accountId: 'acc-9',
      postedAt: '2026-07-13T17:36:00.000Z', // date replaced, time-of-day kept
      remember: false,
    });
  });

  it('stores amount as an absolute number and honors income type', () => {
    const out = applyDetectedEdit(base, { ...values, amount: '-250', type: 'income' });
    expect(out.amount).toBe(250);
    expect(out.type).toBe('income');
  });

  it('maps an empty account selection to null (Unlinked)', () => {
    const out = applyDetectedEdit({ ...base, accountId: 'acc-1' }, { ...values, account: '' });
    expect(out.accountId).toBeNull();
  });

  it('builds a midnight-UTC postedAt when the original had none', () => {
    const out = applyDetectedEdit({ ...base, postedAt: null }, values);
    expect(out.postedAt).toBe('2026-07-13T00:00:00.000Z');
  });
});

describe('applyDetectedEdit remember flag', () => {
  const base = {
    id: 'd1',
    merchant: 'True Software Scandinavia AB',
    amount: 249,
    type: 'expense' as const,
    suggestedCategory: 'Entertainment',
    accountId: 'a1',
    paymentMethod: 'autopay',
    confidence: 0.9,
    postedAt: '2026-07-16T13:31:00.000Z',
  };
  const edit = {
    desc: 'Truecaller',
    amount: '249',
    cat: 'Subscriptions',
    account: 'a1',
    date: '2026-07-16',
    type: 'expense',
  };

  it("remember: '1' sets the flag", () => {
    expect(applyDetectedEdit(base, { ...edit, remember: '1' }).remember).toBe(true);
  });

  it('remember unset/empty leaves it false', () => {
    expect(applyDetectedEdit(base, { ...edit, remember: '' }).remember).toBe(false);
    expect(applyDetectedEdit(base, edit).remember).toBe(false);
  });
});
