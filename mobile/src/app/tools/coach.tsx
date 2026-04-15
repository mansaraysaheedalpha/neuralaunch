// src/app/tools/coach.tsx
//
// Standalone Conversation Coach — thin wrapper that finds the user's
// active roadmap and hands off to the task-agnostic Coach screen.

import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { StandaloneToolLauncher } from '@/components/tools/StandaloneToolLauncher';

export default function StandaloneCoachScreen() {
  const { colors: c } = useTheme();
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Conversation Coach',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />
      <StandaloneToolLauncher tool="coach" label="Conversation Coach" />
    </>
  );
}
