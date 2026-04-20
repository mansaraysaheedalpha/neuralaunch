// src/components/research/ReportView.tsx
//
// Final stage of the Research Tool — renders the ResearchReport
// (summary, findings, sources, roadmap connections, suggested next
// steps) plus the follow-up query form.

import { useState } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  TextInput as RNTextInput,
  Linking,
} from 'react-native';
import {
  ExternalLink,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card, Button } from '@/components/ui';
import { spacing, radius, typography, iconSize } from '@/constants/theme';
import { FindingCard } from './FindingCard';
import {
  MAX_FOLLOW_UPS,
  type FollowUpRound,
  type NextStep,
  type ResearchReport,
} from './types';

interface Props {
  report:           ResearchReport;
  followUps:        FollowUpRound[];
  followUpQuery:    string;
  setFollowUpQuery: (s: string) => void;
  onFollowUp:       () => void;
  onNextStep:       (s: NextStep) => void;
  busy:             boolean;
  error:            string | null;
}

export function ReportView({
  report,
  followUps,
  followUpQuery,
  setFollowUpQuery,
  onFollowUp,
  onNextStep,
  busy,
  error,
}: Props) {
  const { colors: c } = useTheme();
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const followUpsRemaining = MAX_FOLLOW_UPS - followUps.length;

  return (
    <>
      <Card variant="primary" style={{ marginBottom: spacing[4] }}>
        <Text variant="overline" color={c.primary}>Summary</Text>
        <Text variant="body" style={{ marginTop: spacing[2] }}>{report.summary}</Text>
      </Card>

      <Text variant="title" style={{ marginBottom: spacing[3] }}>
        Findings ({report.findings.length})
      </Text>
      <View style={{ gap: spacing[3] }}>
        {report.findings.map((f, i) => <FindingCard key={i} finding={f} />)}
      </View>

      {report.roadmapConnections && (
        <Card style={[styles.connectionsCallout, { backgroundColor: c.secondaryAlpha10, borderColor: c.secondary }]}>
          <Text variant="overline" color={c.secondary}>Connections to your roadmap</Text>
          <Text variant="body" style={{ marginTop: spacing[2] }}>
            {report.roadmapConnections}
          </Text>
        </Card>
      )}

      {report.suggestedNextSteps && report.suggestedNextSteps.length > 0 && (
        <View style={{ marginTop: spacing[6] }}>
          <Text variant="title" style={{ marginBottom: spacing[3] }}>Next steps</Text>
          <View style={{ gap: spacing[2] }}>
            {report.suggestedNextSteps.map((s, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={s.action}
                onPress={() => onNextStep(s)}
                disabled={!s.suggestedTool}
              >
                <Card>
                  <View style={styles.nextStepRow}>
                    <Text variant="body" style={{ flex: 1 }}>{s.action}</Text>
                    {s.suggestedTool && <ArrowRight size={iconSize.sm} color={c.primary} />}
                  </View>
                  {s.suggestedTool && (
                    <Text variant="caption" color={c.primary} style={{ marginTop: spacing[1] }}>
                      Open {s.suggestedTool === 'conversation_coach' ? 'Conversation Coach' : s.suggestedTool === 'outreach_composer' ? 'Outreach Composer' : s.suggestedTool === 'service_packager' ? 'Service Packager' : s.suggestedTool}
                    </Text>
                  )}
                </Card>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={{ marginTop: spacing[6] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sourcesOpen ? 'Hide sources' : `Show sources (${report.sources.length})`}
          onPress={() => setSourcesOpen(v => !v)}
          style={styles.sourcesToggle}
        >
          {sourcesOpen
            ? <ChevronUp size={iconSize.sm} color={c.mutedForeground} />
            : <ChevronDown size={iconSize.sm} color={c.mutedForeground} />}
          <Text variant="label" color={c.mutedForeground}>
            {sourcesOpen ? 'Hide' : 'Show'} sources ({report.sources.length})
          </Text>
        </Pressable>
        {sourcesOpen && (
          <View style={styles.sourcesList}>
            {report.sources.map((s, i) => (
              <Pressable
                key={i}
                accessibilityRole="link"
                accessibilityLabel={`Open source: ${s.title}`}
                onPress={() => void Linking.openURL(s.url)}
                style={styles.sourceRow}
              >
                <ExternalLink size={iconSize.xs} color={c.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="caption" color={c.primary}>{s.title}</Text>
                  <Text variant="caption" color={c.mutedForeground} numberOfLines={1}>
                    {s.relevance}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {followUps.length > 0 && (
        <View style={{ marginTop: spacing[6] }}>
          <Text variant="title">Follow-ups</Text>
          {followUps.map((fu, i) => (
            <View key={i} style={{ marginTop: spacing[3] }}>
              <Text variant="caption" color={c.mutedForeground}>
                Round {fu.round}: <Text color={c.foreground} variant="caption">{fu.query}</Text>
              </Text>
              <View style={{ marginTop: spacing[2], gap: spacing[2] }}>
                {fu.findings.map((f, j) => <FindingCard key={j} finding={f} />)}
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ marginTop: spacing[6] }}>
        <Text variant="overline" color={c.mutedForeground}>
          Ask a follow-up · {followUps.length}/{MAX_FOLLOW_UPS} used
        </Text>
        {followUpsRemaining > 0 ? (
          <>
            <View style={[styles.textArea, { backgroundColor: c.card, borderColor: c.border, marginTop: spacing[2] }]}>
              <RNTextInput
                value={followUpQuery}
                onChangeText={setFollowUpQuery}
                placeholder="e.g. Tell me more about the third one"
                placeholderTextColor={c.placeholder}
                multiline
                maxLength={3000}
                style={[styles.input, { color: c.foreground }]}
              />
            </View>
            <Button
              title={busy ? 'Researching…' : 'Ask'}
              onPress={onFollowUp}
              loading={busy}
              disabled={!followUpQuery.trim() || busy}
              size="md"
              fullWidth
              style={{ marginTop: spacing[2] }}
            />
            {error && (
              <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[2] }}>
                {error}
              </Text>
            )}
          </>
        ) : (
          <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
            You've used all {MAX_FOLLOW_UPS} follow-ups for this session. Start a new research session for deeper investigation.
          </Text>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  textArea: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing[3],
  },
  input: {
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.leading.relaxed,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  connectionsCallout: {
    marginTop: spacing[6],
    borderWidth: 1,
  },
  nextStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  sourcesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingVertical: spacing[2],
  },
  sourcesList: {
    gap: spacing[2],
    marginTop: spacing[1],
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[1.5],
  },
});
