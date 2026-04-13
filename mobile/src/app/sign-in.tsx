// src/app/sign-in.tsx
//
// Sign-in screen — minimal, premium, two OAuth buttons.

import { View, StyleSheet, Image } from 'react-native';
import { useAuth } from '@/services/auth';
import { useTheme } from '@/hooks/useTheme';
import { Text, Button, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const { colors: c } = useTheme();

  return (
    <ScreenContainer scroll={false}>
      <View style={styles.container}>
        {/* Brand */}
        <View style={styles.brand}>
          <Text variant="heading" color={c.primary} align="center">
            NeuraLaunch
          </Text>
          <Text
            variant="body"
            color={c.mutedForeground}
            align="center"
            style={{ marginTop: spacing[2] }}
          >
            From lost to launched.{'\n'}For everyone.
          </Text>
        </View>

        {/* OAuth buttons */}
        <View style={styles.buttons}>
          <Button
            title="Continue with Google"
            onPress={() => { void signIn('google'); }}
            variant="secondary"
            size="lg"
            fullWidth
          />
          <Button
            title="Continue with GitHub"
            onPress={() => { void signIn('github'); }}
            variant="secondary"
            size="lg"
            fullWidth
          />
        </View>

        {/* Footer */}
        <Text
          variant="caption"
          color={c.mutedForeground}
          align="center"
          style={{ marginTop: spacing[8] }}
        >
          By continuing, you agree to our terms and privacy policy.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  brand: {
    alignItems: 'center',
    marginBottom: spacing[12],
  },
  buttons: {
    gap: spacing[3],
  },
});
