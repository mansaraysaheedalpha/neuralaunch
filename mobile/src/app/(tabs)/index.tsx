// src/app/(tabs)/index.tsx
//
// Home tab — the founder's dashboard. Shows their current
// recommendation status, active roadmap progress, and quick
// actions. This is the first screen after sign-in.

import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/services/auth';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card, Button, Badge, ScreenContainer } from '@/components/ui';
import { spacing, radius } from '@/constants/theme';

export default function HomeScreen() {
  const { user } = useAuth();
  const { colors: c } = useTheme();
  const router = useRouter();

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <ScreenContainer>
      {/* Greeting */}
      <View style={styles.header}>
        <Text variant="caption" color={c.mutedForeground}>
          Welcome back
        </Text>
        <Text variant="heading">{firstName}</Text>
      </View>

      {/* Quick action — start a discovery session */}
      <Card variant="primary" style={styles.ctaCard}>
        <Text variant="overline" color={c.primary}>
          Ready to discover your path?
        </Text>
        <Text
          variant="body"
          style={{ marginTop: spacing[2], marginBottom: spacing[4] }}
        >
          Start a conversation and get one honest recommendation
          tailored to your exact situation.
        </Text>
        <Button
          title="Start Discovery"
          onPress={() => router.push('/discovery')}
          size="md"
        />
      </Card>

      {/* Placeholder sections — will be populated with real data */}
      <View style={styles.section}>
        <Text variant="title" style={styles.sectionTitle}>
          Your recommendations
        </Text>
        <Card>
          <Text variant="body" color={c.mutedForeground}>
            No recommendations yet. Start a discovery session to get
            your first one.
          </Text>
        </Card>
      </View>

      <View style={styles.section}>
        <Text variant="title" style={styles.sectionTitle}>
          Active roadmaps
        </Text>
        <Card>
          <Text variant="body" color={c.mutedForeground}>
            Your roadmaps will appear here once you accept a
            recommendation and generate your execution plan.
          </Text>
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
  },
  ctaCard: {
    marginBottom: spacing[6],
  },
  section: {
    marginBottom: spacing[6],
  },
  sectionTitle: {
    marginBottom: spacing[3],
  },
});
