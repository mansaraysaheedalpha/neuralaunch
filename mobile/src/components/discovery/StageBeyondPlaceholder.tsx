// src/components/discovery/StageBeyondPlaceholder.tsx
//
// Mobile counterpart to
// client/src/app/(app)/discovery/no-idea/[sessionId]/StageBeyondPlaceholder.tsx.
// Surfaced for Stage 3+ runs — those stages aren't built on web yet
// either. (Stage 2 has its own placeholder now, Stage2Placeholder.tsx,
// because Stage 2 IS shipped on web — mobile UX just hasn't caught up.)
//
// Copy mirrors the web's StageBeyondPlaceholder text: "committed
// everything available so far" framing, with a path back to
// /recommendations so the founder isn't stranded mid-flow.

import { View, StyleSheet } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { Text, Button, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';

interface Props {
  stageNumber: number;
}

export function StageBeyondPlaceholder({ stageNumber }: Props) {
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
          You've committed everything available so far. The remaining stages — where we
          surface real-world pain points and evaluate which ones you can credibly go
          after — are under construction. We'll email you the moment they're live.
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
