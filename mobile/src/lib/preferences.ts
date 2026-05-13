// src/lib/preferences.ts
//
// Tiny key/value store for non-secret persistent UI preferences (banner
// dismissals, "don't show again" toggles). Built on expo-secure-store
// (already a dep for auth tokens) rather than pulling in
// @react-native-async-storage/async-storage — the perf overhead of the
// OS keychain is negligible for boolean flags called once per mount,
// and avoiding a new native dependency keeps Expo builds simpler.
//
// Read failures fall back to `null` so a corrupted item or a fresh
// install never breaks the calling screen. Write failures swallow the
// error and log to console — a banner that fails to persist its
// dismissal will re-appear next launch, which is recoverable; an
// unhandled rejection in a UX surface is not.

import * as SecureStore from 'expo-secure-store';

export async function getPref(key: string): Promise<string | null> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setPref(key: string, value: string): Promise<void> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return;
    await SecureStore.setItemAsync(key, value);
  } catch (err) {
    // Best-effort — the surface is non-critical UI state, the worst
    // case is a dismissed banner re-appearing on next launch.
    // eslint-disable-next-line no-console
    console.warn('[preferences] setPref failed', { key, err });
  }
}

export async function clearPref(key: string): Promise<void> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return;
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* swallow */
  }
}
