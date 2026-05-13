// src/components/discovery/Stage2Placeholder.tsx
//
// Mobile counterpart to
// client/src/app/(app)/discovery/no-idea/[sessionId]/Stage2Placeholder.tsx.
// Surfaced when the active IdeationStageRun is Stage 2+ — those
// stages aren't built yet on either web or mobile. The copy makes the
// "coming soon" status explicit so the page never feels broken, and
// offers a path back to /recommendations so the founder isn't
// stranded mid-flow.

import { View, StyleSheet } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { Text, Button, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';

interface Props {
  stageNumber: number;
}

export function Stage2Placeholder({ stageNumber }: Props) {
  const { colors: c } = useTheme();
  const router = useRouter();

  return (
    <ScreenContainer>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: `Stage ${stageNumber}`,
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <View style={styles.content}>
        <Text variant="overline" color={c.mutedForeground}>
          Stage {stageNumber} of 5
        </Text>
        <Text variant="title" align="center" style={{ marginTop: spacing[3] }}>
          We're still building this stage
        </Text>
        <Text
          variant="body"
          color={c.mutedForeground}
          align="center"
          style={{ marginTop: spacing[3], paddingHorizontal: spacing[2] }}
        >
          You've committed your Outcome Document. The next stages — where we surface
          real-world pain points and evaluate which ones you can credibly go after —
          are under construction. We'll email you the moment they're live.
        </Text>
        <View style={styles.cta}>
          <Button
            title="Return to your ventures"
            onPress={() => router.replace('/recommendations' as any)}
            variant="secondary"
            size="lg"
            fullWidth
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  cta: {
    marginTop: spacing[8],
    width: '100%',
    maxWidth: 320,
  },
});
