// src/services/onboarding.ts
//
// Tracks whether this device has seen the pre-sign-in onboarding
// carousel. We persist a single boolean flag in SecureStore (already
// in the dependency tree — adding async-storage just for one boolean
// would be wasteful).
//
// `hasCompletedOnboarding()` is async; the entry-point splash already
// awaits other async state (auth hydrate) so this fits naturally.

import * as SecureStore from 'expo-secure-store';

const KEY = 'nl_onboarding_complete';

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    return v === '1';
  } catch {
    // If SecureStore fails on this device, assume yes — better to skip
    // onboarding than trap the user in a loop.
    return true;
  }
}

export async function markOnboardingComplete(): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, '1');
  } catch { /* best-effort */ }
}
