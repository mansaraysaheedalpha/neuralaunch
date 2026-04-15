// src/app/tools/research.tsx
//
// Standalone Research Tool — thin wrapper that finds the user's
// active roadmap and hands off to the task-agnostic research screen.

import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { StandaloneToolLauncher } from '@/components/tools/StandaloneToolLauncher';

export default function StandaloneResearchScreen() {
  const { colors: c } = useTheme();
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Research Tool',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />
      <StandaloneToolLauncher tool="research" label="Research Tool" />
    </>
  );
}
