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
 * Base URL for the NeuraLaunch API. Resolution order:
 *
 *   1. `Constants.expoConfig.extra.apiUrl` — set in mobile/app.json.
 *      In production builds (EAS / App Store / Play Store) this is
 *      the only source that should be used.
 *
 *   2. `__DEV__` fallback — only when the bundler is in dev mode AND
 *      `extra.apiUrl` is absent. Points at `http://localhost:3000`.
 *      This path is deliberately unreachable in production.
 *
 * Rationale: the previous implementation silently fell back to
 * localhost in every environment. On a physical phone, `localhost`
 * resolves to the phone itself and sign-in died. Forcing production
 * to require `extra.apiUrl` makes misconfiguration loud instead of
 * silent.
 */
const configuredApiUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;
const API_BASE_URL: string = configuredApiUrl
  ?? (__DEV__ ? 'http://localhost:3000' : '');

if (!API_BASE_URL) {
  // Fail loud at module-load time. A mis-built app with no apiUrl
  // would otherwise issue requests to a relative URL against the
  // mobile bundle host and fail in confusing ways at first API call.
  // eslint-disable-next-line no-console
  console.error(
    '[api-client] No API URL configured. Set extra.apiUrl in mobile/app.json.',
  );
}

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

// Request timeout — matches the typical p99 for the slowest endpoints
// (synthesis routes take ~25s; anything beyond 30s means the request is
// hung, not slow). On 3G the app would otherwise spin forever.
const REQUEST_TIMEOUT_MS = 30_000;

// Retry config — two retries (three total attempts) with exponential
// backoff on 5xx responses and network errors. 4xx never retries; an
// AbortError from the caller's signal never retries.
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [500, 1500] as const;

function shouldRetry(err: unknown): boolean {
  if (err instanceof ApiError) return err.status >= 500;
  // Network failures thrown by fetch show up as TypeError with a
  // platform-specific message ("Network request failed" on iOS/Android).
  if (err instanceof TypeError) return true;
  return false;
}

function linkSignals(
  userSignal: AbortSignal | undefined,
  timeoutController: AbortController,
): () => void {
  if (!userSignal) return () => {};
  if (userSignal.aborted) {
    timeoutController.abort();
    return () => {};
  }
  const onAbort = () => timeoutController.abort();
  userSignal.addEventListener('abort', onAbort);
  return () => userSignal.removeEventListener('abort', onAbort);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

  let attempt = 0;
  for (;;) {
    // Each attempt gets its own controller so the 30s timeout is fresh.
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(
      () => timeoutController.abort(),
      REQUEST_TIMEOUT_MS,
    );
    const unlink = linkSignals(signal, timeoutController);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: timeoutController.signal,
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
    } catch (err) {
      // A caller-initiated abort propagates untouched — no retry, no
      // transformation. Timeout-induced aborts surface as a clear error.
      if (signal?.aborted) throw err;
      if (
        err instanceof Error &&
        err.name === 'AbortError' &&
        timeoutController.signal.aborted
      ) {
        throw new ApiError(
          0,
          `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`,
        );
      }

      if (attempt >= MAX_RETRIES || !shouldRetry(err)) throw err;

      await delay(RETRY_DELAYS_MS[attempt]!);
      attempt += 1;
      continue;
    } finally {
      clearTimeout(timeoutId);
      unlink();
    }
  }
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
