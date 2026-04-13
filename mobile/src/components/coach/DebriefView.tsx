// src/components/coach/DebriefView.tsx
//
// Debrief after the role-play rehearsal — what went well, what to
// watch for, and any revised sections of the preparation package.

import { View, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card, Button } from '@/components/ui';
import { spacing } from '@/constants/theme';

interface Debrief {
  whatWentWell:    string[];
  whatToWatchFor:  string[];
  revisedSections?: {
    openingScript?:      string;
    additionalObjection?: {
      objection: string;
      response:  string;
    };
  };
}

interface Props {
  debrief: Debrief | null;
  loading: boolean;
  onDone:  () => void;
}

export function DebriefView({ debrief, loading, onDone }: Props) {
  const { colors: c } = useTheme();

  if (loading || !debrief) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text variant="label" color={c.mutedForeground} style={{ marginTop: spacing[3] }}>
          Reviewing your rehearsal…
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInUp.delay(0)}>
        <Text variant="heading">Debrief</Text>
        <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
          Here's what I noticed from your rehearsal.
        </Text>
      </Animated.View>

      {/* What went well */}
      <Animated.View entering={FadeInUp.delay(100)}>
        <Card variant="primary">
          <Text variant="overline" color={c.primary}>What Went Well</Text>
          <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
            {debrief.whatWentWell.map((item, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text variant="body" color={c.success}>✓</Text>
                <Text variant="body" style={{ flex: 1 }}>{item}</Text>
              </View>
            ))}
          </View>
        </Card>
      </Animated.View>

      {/* What to watch for */}
      <Animated.View entering={FadeInUp.delay(200)}>
        <Card>
          <Text variant="overline" color={c.mutedForeground}>What to Watch For</Text>
          <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
            {debrief.whatToWatchFor.map((item, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text variant="body" color={c.warning}>→</Text>
                <Text variant="body" style={{ flex: 1 }}>{item}</Text>
              </View>
            ))}
          </View>
        </Card>
      </Animated.View>

      {/* Revised opening script */}
      {debrief.revisedSections?.openingScript && (
        <Animated.View entering={FadeInUp.delay(300)}>
          <Card>
            <Text variant="overline" color={c.primary}>Revised Opening Script</Text>
            <Text variant="body" style={{ marginTop: spacing[2] }}>
              {debrief.revisedSections.openingScript}
            </Text>
          </Card>
        </Animated.View>
      )}

      {/* New objection discovered */}
      {debrief.revisedSections?.additionalObjection && (
        <Animated.View entering={FadeInUp.delay(400)}>
          <Card>
            <Text variant="overline" color={c.destructive}>New Objection Discovered</Text>
            <Text variant="label" style={{ marginTop: spacing[2] }}>
              {debrief.revisedSections.additionalObjection.objection}
            </Text>
            <Text variant="body" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
              {debrief.revisedSections.additionalObjection.response}
            </Text>
          </Card>
        </Animated.View>
      )}

      {/* Done */}
      <Animated.View entering={FadeInUp.delay(500)}>
        <Button
          title="Done — back to my roadmap"
          onPress={onDone}
          size="lg"
          fullWidth
          style={{ marginTop: spacing[4] }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[4],
    padding: spacing[5],
    paddingBottom: spacing[12],
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[8],
  },
  bulletRow: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'flex-start',
  },
});
