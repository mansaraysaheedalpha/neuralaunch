// src/app/tools/packager.tsx
//
// Standalone Service Packager — thin wrapper that finds the user's
// active roadmap and hands off to the task-agnostic packager screen.

import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { StandaloneToolLauncher } from '@/components/tools/StandaloneToolLauncher';

export default function StandalonePackagerScreen() {
  const { colors: c } = useTheme();
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Service Packager',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />
      <StandaloneToolLauncher tool="packager" label="Service Packager" />
    </>
  );
}
