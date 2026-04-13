// src/app/(tabs)/tools.tsx
//
// Tools tab — placeholder. Will list available execution tools
// (Conversation Coach, Outreach Composer, etc.) and standalone
// tool sessions.

import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';

export default function ToolsScreen() {
  const { colors: c } = useTheme();

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading">Tools</Text>
        <Text variant="caption" color={c.mutedForeground}>
          Execution tools to help you work through your roadmap
        </Text>
      </View>

      <Card>
        <Text variant="label">Conversation Coach</Text>
        <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
          Prepare for and rehearse high-stakes conversations with
          AI-powered scripts, objection handling, and role-play.
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
