/**
 * apiClient — thin fetch wrapper over EXPO_PUBLIC_API_URL.
 *
 * Usage:
 *   setAuthToken(token)           // store bearer token
 *   apiClient.get('/transactions') // returns parsed JSON
 *   apiClient.post('/transactions', body)
 *   apiClient.patch('/transactions/1', body)
 *   apiClient.delete('/transactions/1')
 *
 * Throws ApiError on non-2xx responses.
 *
 * 401 handling: on an Unauthorized response the client transparently refreshes
 * the access token (via injected handlers — see `setSessionHandlers`) and
 * retries the request exactly once. If the refresh can't produce a working
 * token, the session is ended (`onSessionExpired`) and the request rejects.
 * `/auth/*` paths are excluded — a 401 there (bad credentials / dead refresh
 * token) is a real failure and must surface directly, and excluding them keeps
 * the refresh call itself from recursing.
 */
import { getBaseUrl } from './baseUrl';

let _token: string | null = null;

export function setAuthToken(token: string | null): void {
  _token = token;
}

export function getAuthToken(): string | null {
  return _token;
}

// ── Session handlers (injected by AuthProvider to avoid an import cycle) ──
/** Returns a fresh access token, or null when refresh is impossible. */
type RefreshHandler = () => Promise<string | null>;
/** Ends the session and routes the user to Login. */
type SessionExpiredHandler = () => void;

let _onRefresh: RefreshHandler | null = null;
let _onSessionExpired: SessionExpiredHandler | null = null;

export function setSessionHandlers(handlers: {
  onRefresh: RefreshHandler;
  onSessionExpired: SessionExpiredHandler;
}): void {
  _onRefresh = handlers.onRefresh;
  _onSessionExpired = handlers.onSessionExpired;
}

/** In-flight refresh, shared so N concurrent 401s trigger exactly one refresh. */
let _refreshInFlight: Promise<string | null> | null = null;

/**
 * Deduped access-token refresh. Concurrent callers share one in-flight
 * promise; it's cleared once settled so a later 401 can refresh again.
 * Exported so the chat SSE stream reuses the same dedup.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!_onRefresh) return Promise.resolve(null);
  if (!_refreshInFlight) {
    _refreshInFlight = _onRefresh().finally(() => {
      _refreshInFlight = null;
    });
  }
  return _refreshInFlight;
}

/** Trigger the registered session-expired reset (exported for the chat stream). */
export function notifySessionExpired(): void {
  _onSessionExpired?.();
}

/** A 401 on these paths is a real failure, never a stale-token retry. */
function isAuthPath(path: string): boolean {
  return path.startsWith('/auth/');
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'ngrok-skip-browser-warning': 'true',
    ...extra,
  };
  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new ApiError(res.status, `HTTP ${res.status}: ${res.statusText}`, body);
  }
  return body as T;
}

/** One fetch attempt; headers are rebuilt each call so a retry uses the
 * freshly-refreshed token. */
function attempt(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${getBaseUrl()}${path}`, {
    method,
    headers: buildHeaders(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/**
 * Shared request runner for every verb. On a 401 (outside `/auth/*`) it
 * refreshes the token and retries once; if refresh fails or the retry still
 * 401s, it ends the session and rejects.
 */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res = await attempt(method, path, body);
  if (res.status === 401 && !isAuthPath(path)) {
    const token = await refreshAccessToken();
    if (token) {
      res = await attempt(method, path, body);
    }
    if (res.status === 401) {
      notifySessionExpired();
    }
  }
  return handleResponse<T>(res);
}

function get<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

function patch<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PATCH', path, body);
}

function del<T>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}

export const apiClient = { get, post, patch, delete: del };
