// src/services/push.ts
//
// Registers the device's Expo push token with the backend. Called
// once after a successful sign-in (see auth.ts hydrate / signIn).
//
// Registration is best-effort — every failure mode is swallowed and
// the user proceeds without push. Exits early when:
//   · running on an emulator / simulator (Device.isDevice === false)
//   · OS permission was denied
//   · Expo project isn't configured for push (no projectId)
//   · backend POST fails

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from './api-client';

// De-dup re-registrations. Keyed by token so an Expo token rotation
// triggers a fresh POST.
let lastRegisteredToken: string | null = null;

/**
 * Resolve the EAS project ID that Expo uses when minting push tokens.
 * In SDK 49+ `getExpoPushTokenAsync()` requires this on EAS builds.
 *
 * Expo places it at either `expoConfig.extra.eas.projectId` (the value
 * `eas init` writes into app.json) or at `easConfig.projectId` on a
 * fully resolved Constants. We check both paths.
 */
function resolveProjectId(): string | undefined {
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const fromEas   = (Constants as unknown as { easConfig?: { projectId?: string } })
    .easConfig?.projectId;
  return fromExtra ?? fromEas;
}

/**
 * Register this device's Expo push token with the backend.
 * Idempotent — safe to call on every sign-in or app foreground.
 * Returns true when a token was minted and successfully POSTed.
 */
export async function registerPushToken(): Promise<boolean> {
  // Emulators / simulators can't receive push.
  if (!Device.isDevice) return false;

  // Permission flow — request once if not already granted.
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return false;

  // Android needs a notification channel configured or foreground
  // pushes silently drop. One 'default' channel is enough for now.
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    } catch { /* best-effort */ }
  }

  const projectId = resolveProjectId();

  let token: string;
  try {
    // Pass projectId explicitly when we have one. Omitting it works in
    // Expo Go (which uses Expo's shared project) but fails on standalone
    // EAS builds — this distinction matters for production.
    const result = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    token = result.data;
  } catch {
    // Most common cause: EAS build with no configured projectId.
    // Surface via console.warn so the ops team notices, but don't
    // throw — the rest of the app still works without push.
    // eslint-disable-next-line no-console
    console.warn('[push] getExpoPushTokenAsync failed — push disabled this session');
    return false;
  }

  if (!token || token === lastRegisteredToken) return true;

  try {
    await api('/api/user/push-token', {
      method: 'POST',
      body: {
        token,
        platform: Platform.OS === 'ios'
          ? 'ios'
          : Platform.OS === 'android'
            ? 'android'
            : 'web',
      },
    });
    lastRegisteredToken = token;
    return true;
  } catch {
    return false;
  }
}

/** Clear the in-memory registration cache (call on sign-out). */
export function clearPushRegistration(): void {
  lastRegisteredToken = null;
}
