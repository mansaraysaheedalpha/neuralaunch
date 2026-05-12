// src/app/discovery/archetype.tsx
//
// Mobile counterpart to client/src/app/(app)/discovery/ArchetypePicker.tsx.
// 6-option selection surface gated behind the noIdeaEnabled feature flag
// (extra.noIdeaEnabled in app.json). Picking "no_idea" navigates to
// /discovery/no-idea/mindset (Stage 0). Any other pick lands on the
// existing /discovery chat — preseed support (audienceType, scenario)
// is intentionally a Phase B follow-up; behaviour for non-no_idea
// archetypes matches today's mobile chat in the interim.

import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronRight } from 'lucide-react-native';
import { useAuth } from '@/services/auth';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card, ScreenContainer } from '@/components/ui';
import { spacing, iconSize } from '@/constants/theme';

type ArchetypeId =
  | 'no_idea'
  | 'LOST_GRADUATE'
  | 'ASPIRING_BUILDER'
  | 'STUCK_FOUNDER'
  | 'ESTABLISHED_OWNER'
  | 'MID_JOURNEY_PROFESSIONAL';

interface ArchetypeOption {
  id:          ArchetypeId;
  label:       string;
  description: string;
}

// Copy and ordering are kept in lock-step with the web ArchetypePicker
// at client/src/app/(app)/discovery/ArchetypePicker.tsx — when product
// edits one, edit both.
const ARCHETYPES: ArchetypeOption[] = [
  {
    id:          'no_idea',
    label:       "I don't have a business idea yet",
    description: 'Define what kind of outcome would fit your life, then we find the idea together.',
  },
  {
    id:          'LOST_GRADUATE',
    label:       "I'm early in my career and figuring out my direction",
    description: 'Early career, weighing whether to build something instead of (or alongside) a traditional job.',
  },
  {
    id:          'ASPIRING_BUILDER',
    label:       'I have an idea I want to build',
    description: 'You know roughly what you want to make; we help you decide whether and how.',
  },
  {
    id:          'STUCK_FOUNDER',
    label:       "I've started something and I'm stuck",
    description: 'A venture is already underway and the path forward is unclear.',
  },
  {
    id:          'ESTABLISHED_OWNER',
    label:       'I run a business and want to grow it',
    description: 'Running operation, looking for the next leverage point.',
  },
  {
    id:          'MID_JOURNEY_PROFESSIONAL',
    label:       "I'm mid-career, thinking about a change",
    description: 'Considering leaving employment to build something, evaluating the trade-offs.',
  },
];

export default function ArchetypePickerScreen() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const firstName = useAuth(s => s.user?.name?.split(' ')[0] ?? '');
  const [pending, setPending] = useState(false);

  function handlePick(opt: ArchetypeOption) {
    if (pending) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (opt.id === 'no_idea') {
      setPending(true);
      router.push('/discovery/no-idea/mindset' as any);
      return;
    }

    // Non-no_idea picks fall through to today's mobile chat. Preseed
    // support (audienceType + scenario lock) is a Phase B follow-up;
    // the existing useDiscovery hook does not yet thread these.
    router.push('/discovery' as any);
  }

  return (
    <ScreenContainer>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: '',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <View style={styles.header}>
        <Text variant="heading">
          {firstName ? `${firstName}, where are you starting from?` : 'Where are you starting from?'}
        </Text>
        <Text variant="body" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
          Each option leads to a different experience built for that situation. Pick the one that fits.
        </Text>
      </View>

      <View style={styles.list}>
        {ARCHETYPES.map(opt => (
          <Pressable
            key={opt.id}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            disabled={pending}
            onPress={() => handlePick(opt)}
            style={({ pressed }) => [{ opacity: pending ? 0.5 : pressed ? 0.85 : 1 }]}
          >
            <Card>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text variant="label">{opt.label}</Text>
                  <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                    {opt.description}
                  </Text>
                </View>
                <ChevronRight size={iconSize.md} color={c.mutedForeground} />
              </View>
            </Card>
          </Pressable>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing[6],
    paddingBottom: spacing[6],
  },
  list: {
    gap: spacing[3],
    paddingBottom: spacing[6],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
});
