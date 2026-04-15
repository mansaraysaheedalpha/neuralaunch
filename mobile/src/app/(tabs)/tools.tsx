// src/app/(tabs)/tools.tsx
//
// Tools tab — lists available execution tools with descriptions.
// Each card navigates to the standalone tool flow (coach, composer).
// Also shows recent standalone tool sessions.

import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MessageSquare, Send, Search, ArrowRight, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card, Badge, ScreenContainer } from '@/components/ui';
import { spacing, iconSize } from '@/constants/theme';

interface ToolDefinition {
  id:          string;
  title:       string;
  description: string;
  badge?:      string;
  route:       string;
  icon:        LucideIcon;
}

const TOOLS: ToolDefinition[] = [
  {
    id:          'conversation_coach',
    title:       'Conversation Coach',
    description: 'Prepare for and rehearse high-stakes conversations. Get scripts, objection handling, fallback positions, and role-play rehearsal with the AI playing the other party.',
    badge:       'Popular',
    route:       '/tools/coach',
    icon:        MessageSquare,
  },
  {
    id:          'outreach_composer',
    title:       'Outreach Composer',
    description: 'Generate personalised outreach messages for cold emails, LinkedIn, WhatsApp, and more — adapted to your market, your product, and your audience.',
    route:       '/tools/outreach',
    icon:        Send,
  },
  {
    id:          'research_tool',
    title:       'Research Tool',
    description: 'Ask anything — find customers, check regulations, compare competitors, verify pricing. The agent plans, executes a deep multi-source investigation, and returns a cited report tied back to your roadmap.',
    route:       '/tools/research',
    icon:        Search,
  },
];

export default function ToolsScreen() {
  const { colors: c } = useTheme();
  const router = useRouter();

  function handleToolPress(tool: ToolDefinition) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // For now, tools launched from this tab are standalone (not task-level).
    // They'll need a roadmap context — route to a picker or the most recent roadmap.
    router.push(tool.route as any);
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading">Tools</Text>
        <Text variant="caption" color={c.mutedForeground}>
          Execution tools to help you work through your roadmap
        </Text>
      </View>

      <View style={styles.toolList}>
        {TOOLS.map(tool => {
          const Icon = tool.icon;
          return (
            <Pressable
              key={tool.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${tool.title}`}
              onPress={() => handleToolPress(tool)}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <Card style={styles.toolCard}>
                <View style={styles.toolHeader}>
                  <View style={[styles.iconBadge, { backgroundColor: c.primaryAlpha10 }]}>
                    <Icon size={iconSize.md} color={c.primary} />
                  </View>
                  <Text variant="title" style={{ flex: 1 }}>{tool.title}</Text>
                  {tool.badge && <Badge label={tool.badge} variant="primary" />}
                </View>
                <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
                  {tool.description}
                </Text>
                <View style={styles.toolCta}>
                  <Text variant="label" color={c.primary}>Open tool</Text>
                  <ArrowRight size={iconSize.sm} color={c.primary} />
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>

      {/* Future: recent standalone sessions list */}
      <View style={styles.section}>
        <Text variant="overline" color={c.mutedForeground}>
          Recent sessions
        </Text>
        <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
          Your standalone tool sessions will appear here.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
    gap: spacing[1],
  },
  toolList: {
    gap: spacing[3],
  },
  toolCard: {
    gap: spacing[0.5],
  },
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[3],
  },
  section: {
    marginTop: spacing[8],
  },
});
