// src/app/(tabs)/profile.tsx
//
// Profile tab — user info, settings, sign out.

import { View, StyleSheet } from 'react-native';
import { useAuth } from '@/services/auth';
import { useTheme } from '@/hooks/useTheme';
import { Text, Button, Card, Separator, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { colors: c } = useTheme();

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading">Profile</Text>
      </View>

      <Card style={styles.userCard}>
        <Text variant="title">{user?.name ?? 'Founder'}</Text>
        <Text variant="caption" color={c.mutedForeground}>
          {user?.email ?? ''}
        </Text>
      </Card>

      <View style={styles.section}>
        <Text variant="label" style={styles.sectionTitle}>Settings</Text>

        <Card>
          <Text variant="body">Training data consent</Text>
          <Text variant="caption" color={c.mutedForeground}>
            Control whether your anonymised outcomes are used to improve
            NeuraLaunch recommendations for future founders.
          </Text>
        </Card>
      </View>

      <Separator />

      <Button
        title="Sign out"
        onPress={() => { void signOut(); }}
        variant="ghost"
        fullWidth
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
  },
  userCard: {
    marginBottom: spacing[6],
  },
  section: {
    gap: spacing[3],
  },
  sectionTitle: {
    marginBottom: spacing[1],
  },
});
