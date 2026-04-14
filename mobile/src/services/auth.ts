// src/services/auth.ts
//
// Authentication service — manages OAuth flow and session state.
// Uses expo-web-browser for the OAuth redirect and expo-secure-store
// for token persistence. The web app uses NextAuth with server-side
// sessions; the mobile app uses a token-based flow against a mobile
// auth endpoint that the web backend exposes.

import { create } from 'zustand';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { getToken, setToken, clearToken, api, API_BASE_URL } from './api-client';
import { registerPushToken, clearPushRegistration, unregisterPushToken } from './push';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id:    string;
  name:  string | null;
  email: string | null;
  image: string | null;
}

interface AuthState {
  user:        User | null;
  isLoading:   boolean;
  isSignedIn:  boolean;
  /** Hydrate session from stored token on app launch */
  hydrate:     () => Promise<void>;
  /** Start the OAuth sign-in flow */
  signIn:      (provider: 'google' | 'github') => Promise<void>;
  /** Clear session and token */
  signOut:     () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuth = create<AuthState>((set) => ({
  user:       null,
  isLoading:  true,
  isSignedIn: false,

  hydrate: async () => {
    set({ isLoading: true });
    try {
      const token = await getToken();
      if (!token) {
        set({ user: null, isSignedIn: false, isLoading: false });
        return;
      }
      // Validate the token against the backend
      const data = await api<{ user: User }>('/api/auth/mobile/session');
      set({ user: data.user, isSignedIn: true, isLoading: false });
      // Fire-and-forget push registration so silent re-launches pick
      // up tokens too (Expo rotates; the backend upsert is idempotent).
      void registerPushToken();
    } catch {
      // Token is invalid or expired — clear it
      await clearToken();
      set({ user: null, isSignedIn: false, isLoading: false });
    }
  },

  signIn: async (provider) => {
    try {
      const redirectUri = Linking.createURL('auth/callback');

      // Open the OAuth provider's auth page in a system browser.
      // The web backend handles the OAuth dance and redirects back
      // to our scheme with a session token in the URL fragment.
      const result = await WebBrowser.openAuthSessionAsync(
        `${API_BASE_URL}/api/auth/mobile/${provider}?redirect_uri=${encodeURIComponent(redirectUri)}`,
        redirectUri,
      );

      if (result.type !== 'success' || !result.url) return;

      // Extract the token from the redirect URL
      const url = new URL(result.url);
      const token = url.searchParams.get('token');
      if (!token) return;

      await setToken(token);

      // Fetch the user profile
      const data = await api<{ user: User }>('/api/auth/mobile/session');
      set({ user: data.user, isSignedIn: true });
      void registerPushToken();
    } catch {
      // Silent failure — user can retry
    }
  },

  signOut: async () => {
    // Unregister the push token BEFORE clearing the auth token, or
    // the DELETE request is un-authenticated and rejected. Best-effort
    // so network failures never trap the user in a half-signed-out
    // state.
    await unregisterPushToken();
    clearPushRegistration();
    await clearToken();
    set({ user: null, isSignedIn: false });
  },
}));
