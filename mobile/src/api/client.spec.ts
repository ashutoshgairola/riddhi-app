/**
 * client 401 handling — the transparent refresh → retry → session-expired
 * flow. Mocks `baseUrl` (so no AsyncStorage native module is needed) and
 * `global.fetch`.
 */
jest.mock('./baseUrl', () => ({ getBaseUrl: () => 'https://api.test' }));

import { apiClient, setAuthToken, setSessionHandlers } from './client';

/** Minimal Response stand-in for the client's `handleResponse`. */
function res(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `S${status}`,
    json: async () => body,
  } as unknown as Response;
}

/** Flush pending microtasks + timers so awaited fetches settle. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('apiClient 401 refresh/retry', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    setAuthToken('old');
    setSessionHandlers({ onRefresh: async () => null, onSessionExpired: () => {} });
  });

  it('refreshes and retries once on 401, then resolves with the retry body', async () => {
    const onRefresh = jest.fn(async () => {
      setAuthToken('new');
      return 'new';
    });
    const onSessionExpired = jest.fn();
    setSessionHandlers({ onRefresh, onSessionExpired });
    fetchMock
      .mockResolvedValueOnce(res(401, { message: 'unauth' }))
      .mockResolvedValueOnce(res(200, { ok: true }));

    await expect(apiClient.get('/transactions')).resolves.toEqual({ ok: true });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The retry carries the refreshed bearer token.
    const retryHeaders = (fetchMock.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
    expect(retryHeaders['Authorization']).toBe('Bearer new');
  });

  it('ends the session and rejects when refresh yields no token', async () => {
    const onRefresh = jest.fn(async () => null);
    const onSessionExpired = jest.fn();
    setSessionHandlers({ onRefresh, onSessionExpired });
    fetchMock.mockResolvedValueOnce(res(401));

    await expect(apiClient.get('/transactions')).rejects.toMatchObject({ status: 401 });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry
  });

  it('ends the session and rejects when the retry still 401s', async () => {
    const onRefresh = jest.fn(async () => {
      setAuthToken('new');
      return 'new';
    });
    const onSessionExpired = jest.fn();
    setSessionHandlers({ onRefresh, onSessionExpired });
    fetchMock.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(401));

    await expect(apiClient.get('/x')).rejects.toMatchObject({ status: 401 });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one retry, capped
  });

  it('dedupes concurrent 401s onto a single refresh', async () => {
    let resolveRefresh!: (t: string | null) => void;
    const refresh = new Promise<string | null>((r) => {
      resolveRefresh = r;
    });
    const onRefresh = jest.fn(() => refresh);
    setSessionHandlers({ onRefresh, onSessionExpired: jest.fn() });
    fetchMock
      .mockResolvedValueOnce(res(401))
      .mockResolvedValueOnce(res(401))
      .mockResolvedValue(res(200, { ok: true }));

    const p1 = apiClient.get('/a');
    const p2 = apiClient.get('/b');
    await flush(); // both first requests hit 401 and await the shared refresh

    setAuthToken('new');
    resolveRefresh('new');

    await expect(p1).resolves.toEqual({ ok: true });
    await expect(p2).resolves.toEqual({ ok: true });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh on a 401 from /auth/* — surfaces the error directly', async () => {
    const onRefresh = jest.fn(async () => 'new');
    const onSessionExpired = jest.fn();
    setSessionHandlers({ onRefresh, onSessionExpired });
    fetchMock.mockResolvedValueOnce(res(401, { message: 'bad creds' }));

    await expect(apiClient.post('/auth/login', {})).rejects.toMatchObject({ status: 401 });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('passes non-401 errors through unchanged', async () => {
    const onRefresh = jest.fn(async () => 'new');
    setSessionHandlers({ onRefresh, onSessionExpired: jest.fn() });
    fetchMock.mockResolvedValueOnce(res(500));

    await expect(apiClient.get('/x')).rejects.toMatchObject({ status: 500 });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
