// src/services/api-client.ts
//
// Centralised API client for all backend communication.
// Manages the auth token lifecycle (store → attach → refresh → clear)
// via expo-secure-store so credentials never touch AsyncStorage.

import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'nl_session_token';

/**
 * Base URL for the NeuraLaunch API. In development this points at the
 * local Next.js dev server; in production it points at the Vercel
 * deployment. Set via EAS build env or app.json extra.
 *
 * Falls back to localhost:3000 for the common Expo Go + local dev
 * server workflow.
 */
const API_BASE_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined)
  ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

export async function setToken(token: string): Promise<void> {
  cachedToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Skip attaching the auth token (for public endpoints like /api/lp/analytics) */
  public?: boolean;
  /** Custom headers to merge */
  headers?: Record<string, string>;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Send a request to the NeuraLaunch API. Handles:
 *   - Auth token attachment from secure store
 *   - JSON serialisation/deserialisation
 *   - Error normalisation into ApiError
 *   - 401 detection for automatic sign-out
 *
 * Every API call in the app goes through this function.
 */
export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, headers: extraHeaders, signal } = options;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...extraHeaders,
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (!options.public) {
    const token = await getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const url = `${API_BASE_URL}${path}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  // 204 No Content — return empty
  if (res.status === 204) return undefined as T;

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    if (!res.ok) {
      throw new ApiError(res.status, `Request failed: ${res.status}`);
    }
    return undefined as T;
  }

  if (!res.ok) {
    const message =
      (json as { error?: string })?.error ??
      `Request failed: ${res.status}`;
    throw new ApiError(res.status, message, json);
  }

  return json as T;
}

/**
 * Stream a text response from the API. Used for discovery interview
 * questions, pushback responses, and coach role-play turns where the
 * server streams text via ReadableStream.
 *
 * Yields accumulated text chunks so the UI can render progressively.
 */
export async function* apiStream(
  path: string,
  options: Omit<RequestOptions, 'method'> & { body: unknown },
): AsyncGenerator<string, void, undefined> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (!options.public) {
    const token = await getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const url = `${API_BASE_URL}${path}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!res.ok) {
    let errorBody: unknown;
    try { errorBody = await res.json(); } catch { /* ignore */ }
    const message =
      (errorBody as { error?: string })?.error ??
      `Stream request failed: ${res.status}`;
    throw new ApiError(res.status, message, errorBody);
  }

  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    accumulated += decoder.decode(value, { stream: true });
    yield accumulated;
  }
}

// ---------------------------------------------------------------------------
// Export the base URL for use in WebView URLs etc.
// ---------------------------------------------------------------------------

export { API_BASE_URL };
