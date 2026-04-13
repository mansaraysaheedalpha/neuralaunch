// src/app/(tabs)/roadmap.tsx
//
// Roadmap tab — placeholder. Will show the active roadmap with
// interactive task cards, check-in forms, and progress tracking.

import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';

export default function RoadmapScreen() {
  const { colors: c } = useTheme();

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading">Your Roadmap</Text>
        <Text variant="caption" color={c.mutedForeground}>
          Track progress and check in on each step
        </Text>
      </View>

      <Card>
        <Text variant="body" color={c.mutedForeground}>
          Accept a recommendation to generate your execution roadmap.
          Each task will appear here with check-in support.
        </Text>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
    gap: spacing[1],
  },
});
