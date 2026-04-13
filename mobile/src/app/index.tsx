// src/app/index.tsx
//
// Entry point — routes to the auth screen or the main app based
// on session state. Shows a branded splash while auth hydrates.

import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/services/auth';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui';
import { spacing } from '@/constants/theme';

export default function EntryScreen() {
  const { isLoading, isSignedIn } = useAuth();
  const { colors: c } = useTheme();

  if (isLoading) {
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

  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
