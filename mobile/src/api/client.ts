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
 */
import { getBaseUrl } from './baseUrl';

let _token: string | null = null;

export function setAuthToken(token: string | null): void {
  _token = token;
}

export function getAuthToken(): string | null {
  return _token;
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

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: 'GET',
    headers: buildHeaders(),
  });
  return handleResponse<T>(res);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: 'PATCH',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  });
  return handleResponse<T>(res);
}

export const apiClient = { get, post, patch, delete: del };
