// src/services/push.ts
//
// Registers the device's Expo push token with the backend. Called
// once after a successful sign-in (see auth.ts hydrate / signIn).
//
// expo-notifications + expo-device are dynamically required so this
// file type-checks even before the packages are installed. Once
// `pnpm exec expo install expo-notifications expo-device` is run
// inside mobile/, registration activates automatically.
//
// Registration is best-effort — failures are swallowed. A user without
// push never blocks the rest of the app.

import { Platform } from 'react-native';
import { api } from './api-client';

// We only ever want to register once per sign-in session to avoid
// flooding the backend if the auth store re-hydrates. The flag is
// keyed by the token itself so if Expo rotates the token we re-register.
let lastRegisteredToken: string | null = null;

type PushModule = {
  getExpoPushTokenAsync: (opts?: { projectId?: string }) => Promise<{ data: string }>;
  getPermissionsAsync:   () => Promise<{ status: string }>;
  requestPermissionsAsync: () => Promise<{ status: string }>;
  setNotificationChannelAsync?: (id: string, opts: Record<string, unknown>) => Promise<void>;
};

type DeviceModule = {
  isDevice: boolean;
};

function tryRequire<T>(name: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    return require(name) as T;
  } catch {
    return null;
  }
}

/**
 * Register this device's Expo push token with the backend. Idempotent
 * — safe to call on every sign-in or app foreground. Returns true on
 * success, false if the token wasn't obtained (permission denied,
 * simulator, packages not installed, etc.).
 */
export async function registerPushToken(): Promise<boolean> {
  const Notifications = tryRequire<PushModule>('expo-notifications');
  const Device        = tryRequire<DeviceModule>('expo-device');

  if (!Notifications || !Device) {
    // Packages not installed. Graceful no-op.
    return false;
  }

  // Emulators / simulators can't receive push.
  if (!Device.isDevice) return false;

  // Permission flow — request if not already granted.
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return false;

  // Android needs a channel for notifications to fire in the foreground.
  if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: 4, // HIGH
        vibrationPattern: [0, 250, 250, 250],
      });
    } catch { /* best-effort */ }
  }

  let tokenData: { data: string };
  try {
    tokenData = await Notifications.getExpoPushTokenAsync();
  } catch {
    return false;
  }

  const token = tokenData.data;
  if (!token || token === lastRegisteredToken) return true;

  try {
    await api('/api/user/push-token', {
      method: 'POST',
      body: {
        token,
        platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
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
