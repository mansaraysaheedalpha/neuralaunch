// src/services/notifications.ts
//
// Runtime configuration for push notifications:
//   · foreground behaviour — how the notification should render when
//     the app is open (default: show banner + play sound, no alert)
//   · tap handler — when the user taps a nudge push, route them to
//     the relevant roadmap
//
// Installed once at app launch from the root layout.

import * as Notifications from 'expo-notifications';
import type { Router } from 'expo-router';

/**
 * Configure foreground presentation. Without this, notifications
 * received while the app is open simply do not render — Expo's
 * default is to suppress them.
 */
export function configureForegroundPresentation(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList:   true,
      shouldPlaySound:  true,
      shouldSetBadge:   false,
    }),
  });
}

/**
 * Attach a listener for taps on notifications. When a nudge push
 * includes `{ roadmapId }` in its data payload, we navigate the
 * founder to that roadmap. Other payloads are ignored.
 *
 * Returns a cleanup function — call it on unmount.
 */
export function attachNotificationTapListener(router: Router): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    if (!data) return;

    const roadmapId = typeof data.roadmapId === 'string' ? data.roadmapId : null;
    if (roadmapId) {
      // Use push so back returns to wherever the user was when the
      // tap landed — typically not the previous screen state anyway
      // because the app may have launched cold from the tap.
      router.push(`/roadmap/${roadmapId}`);
    }
  });

  return () => sub.remove();
}

/**
 * Handle the case where the app was launched cold by a notification
 * tap. expo-notifications queues the triggering response and exposes
 * it via getLastNotificationResponseAsync(); we read it once after
 * the router is ready.
 */
export async function handleColdLaunchNotification(router: Router): Promise<void> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return;
    const data = response.notification.request.content.data;
    const roadmapId = typeof data?.roadmapId === 'string' ? data.roadmapId : null;
    if (roadmapId) {
      router.push(`/roadmap/${roadmapId}`);
    }
  } catch { /* best-effort */ }
}
