// src/app/index.tsx
//
// Entry point — three-state router:
//   1. First-time device  → /onboarding (4-screen carousel)
//   2. Not signed in      → /sign-in
//   3. Signed in          → /(tabs)
// Shows the branded splash while we resolve auth + onboarding state.

import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/services/auth';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { hasCompletedOnboarding } from '@/services/onboarding';

export default function EntryScreen() {
  const { isLoading: authLoading, isSignedIn } = useAuth();
  const { colors: c } = useTheme();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void hasCompletedOnboarding().then(setOnboarded);
  }, []);

  if (authLoading || onboarded === null) {
    return (
      <View style={[styles.splash, { backgroundColor: c.background }]}>
        <Text variant="heading" color={c.primary}>NeuraLaunch</Text>
        <Text variant="caption" style={{ marginTop: spacing[2] }}>
          From lost to launched
        </Text>
        <ActivityIndicator
          size="small"
          color={c.primary}
          style={{ marginTop: spacing[6] }}
        />
      </View>
    );
  }

  if (!onboarded) return <Redirect href="/onboarding" />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
