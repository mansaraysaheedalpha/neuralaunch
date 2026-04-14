// src/app/tools/outreach.tsx
//
// Standalone Outreach Composer — thin wrapper that finds the user's
// active roadmap and hands off to the task-agnostic Composer screen.

import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { StandaloneToolLauncher } from '@/components/tools/StandaloneToolLauncher';

export default function StandaloneOutreachScreen() {
  const { colors: c } = useTheme();
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Outreach Composer',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />
      <StandaloneToolLauncher tool="outreach" label="Outreach Composer" />
    </>
  );
}
