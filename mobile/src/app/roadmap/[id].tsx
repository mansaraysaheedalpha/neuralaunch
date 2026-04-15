// src/app/roadmap/[id].tsx
//
// Stack-pushed roadmap view reached by deep-link, push notification,
// or tap on a specific recommendation. The [id] param is the
// recommendationId (matching the web app's URL). The body is
// RoadmapViewer — same renderer used by the Roadmap tab for the
// founder's active roadmap.

import { useLocalSearchParams, Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { ScreenContainer } from '@/components/ui';
import { RoadmapViewer } from '@/components/roadmap/RoadmapViewer';

export default function RoadmapScreen() {
  const { id: recommendationId } = useLocalSearchParams<{ id: string }>();
  const { colors: c } = useTheme();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Your Roadmap',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <RoadmapViewer recommendationId={recommendationId ?? null} />
      </ScreenContainer>
    </>
  );
}
