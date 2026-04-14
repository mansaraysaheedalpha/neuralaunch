// src/app/_layout.tsx
//
// Root layout — initialises auth, sets status bar style, and wraps
// the entire app in the navigation container. expo-router handles
// the Stack/Tabs structure from the file system.

import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/services/auth';

export default function RootLayout() {
  const { isDark, colors: c } = useTheme();
  const hydrate = useAuth((s: { hydrate: () => Promise<void> }) => s.hydrate);

  // Hydrate the auth session from secure store on app launch
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

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
