const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
  },
}));

import { getToggles, setToggle } from './toggleStore';

beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

it('returns an empty map when nothing is stored', async () => {
  expect(await getToggles()).toEqual({});
});

it('round-trips a toggle', async () => {
  await setToggle('com.phonepe.app', false);
  expect(await getToggles()).toEqual({ 'com.phonepe.app': false });
  await setToggle('com.phonepe.app', true);
  expect(await getToggles()).toEqual({ 'com.phonepe.app': true });
});
