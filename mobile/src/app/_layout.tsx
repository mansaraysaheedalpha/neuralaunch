// src/app/_layout.tsx
//
// Root layout — initialises auth + notifications, sets status bar
// style, and wraps the entire app in the navigation container.
// expo-router handles the Stack/Tabs structure from the file system.

import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/services/auth';
import {
  configureForegroundPresentation,
  attachNotificationTapListener,
  handleColdLaunchNotification,
} from '@/services/notifications';

// Configure at module load — before any notification fires. This is
// the intended spot per the expo-notifications docs.
configureForegroundPresentation();

export default function RootLayout() {
  const { isDark, colors: c } = useTheme();
  const router = useRouter();
  const hydrate = useAuth((s: { hydrate: () => Promise<void> }) => s.hydrate);

  // Hydrate the auth session from secure store on app launch
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Notification tap listener — routes to /roadmap/[id] when a nudge
  // push with a roadmapId payload is tapped. Covers both the warm
  // case (app in background) and the cold case (app launched by tap).
  useEffect(() => {
    const detach = attachNotificationTapListener(router);
    void handleColdLaunchNotification(router);
    return detach;
  }, [router]);

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: c.background },
          }}
        />
      </SafeAreaProvider>
    </View>
  );
}
