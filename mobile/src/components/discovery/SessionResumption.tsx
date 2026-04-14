// src/components/discovery/SessionResumption.tsx
//
// Shown when the founder opens /discovery and has an incomplete
// session (ACTIVE status, >0 questions answered, not yet synthesized).
// Mirrors the web app's SessionResumption component.

import { View, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card, Button } from '@/components/ui';
import { spacing } from '@/constants/theme';

interface Props {
  questionCount: number;
  onResume:      () => void;
  onDiscard:     () => void;
  loading:       boolean;
}

export function SessionResumption({
  questionCount,
  onResume,
  onDiscard,
  loading,
}: Props) {
  const { colors: c } = useTheme();

  function handleResume() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onResume();
  }

  function handleDiscard() {
    void Haptics.selectionAsync();
    onDiscard();
  }

  return (
    <View style={styles.container}>
      <Card variant="primary" style={styles.card}>
        <Text variant="title" align="center">
          Your session was paused
        </Text>
        <Text
          variant="body"
          color={c.mutedForeground}
          align="center"
          style={{ marginTop: spacing[2] }}
        >
          You were partway through your discovery interview.
          {questionCount > 0 && ` You had answered ${questionCount} question${questionCount !== 1 ? 's' : ''}.`}
          {' '}Pick up where you left off — everything is still here.
        </Text>

        <View style={styles.buttons}>
          <Button
            title={loading ? 'Loading your session…' : 'Continue where you left off'}
            onPress={handleResume}
            loading={loading}
            size="lg"
            fullWidth
          />
          <Button
            title="Start a new session"
            onPress={handleDiscard}
            variant="ghost"
            size="md"
            fullWidth
          />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[5],
  },
  card: {
    width: '100%',
    maxWidth: 400,
    padding: spacing[6],
    alignItems: 'center',
  },
  buttons: {
    width: '100%',
    gap: spacing[2],
    marginTop: spacing[6],
  },
});
