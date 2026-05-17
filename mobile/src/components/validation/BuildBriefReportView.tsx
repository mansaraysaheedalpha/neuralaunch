// src/components/validation/BuildBriefReportView.tsx
//
// Renders the Build Brief section of a validation page detail —
// signal-strength badge, generated-at timestamp, "the call" callout,
// confirmed / rejected feature lists, survey insights, "next 48
// hours" action, and the "use as my MVP spec" handoff button.
//
// Extracted from /validation/[pageId].tsx during the self-review
// refactor. The MVP-handoff network call lives in the parent so this
// component stays pure presentation — the parent passes onMarkAsMvp.

import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Badge, Card, Button, Separator } from '@/components/ui';
import { spacing } from '@/constants/theme';

interface ConfirmedFeature {
  taskId:     string;
  title:      string;
  clicks:     number;
  percentage: number;
  evidence:   string;
}

interface RejectedFeature {
  taskId: string;
  title:  string;
  clicks: number;
  reason: string;
}

export interface BuildBriefReport {
  signalStrength:    string;
  generatedAt:       string;
  buildBrief:        string;
  confirmedFeatures: ConfirmedFeature[];
  rejectedFeatures:  RejectedFeature[];
  surveyInsights:    string | null;
  nextAction:        string;
  usedForMvp:        boolean;
}

interface Props {
  report:        BuildBriefReport;
  markingMvp:    boolean;
  onMarkAsMvp:   () => Promise<void> | void;
}

export function BuildBriefReportView({ report, markingMvp, onMarkAsMvp }: Props) {
  const { colors: c } = useTheme();

  return (
    <>
      <Separator />
      <View style={styles.header}>
        <Text variant="title">Build Brief</Text>
        <Badge
          label={`${report.signalStrength} signal`}
          variant={
            report.signalStrength === 'strong'   ? 'success'
            : report.signalStrength === 'moderate' ? 'warning'
            :                                       'destructive'
          }
        />
      </View>

      <Text variant="caption" color={c.mutedForeground}>
        Generated {new Date(report.generatedAt).toLocaleDateString()}
      </Text>

      {/* The call */}
      <Card variant="primary">
        <Text variant="overline" color={c.primary}>The call</Text>
        <Text variant="body" style={{ marginTop: spacing[2] }}>{report.buildBrief}</Text>
      </Card>

      {/* Confirmed features */}
      {report.confirmedFeatures.length > 0 && (
        <View>
          <Text variant="overline" color={c.mutedForeground}>Build these</Text>
          <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
            {report.confirmedFeatures.map(f => (
              <Card key={f.taskId}>
                <View style={styles.featureHeader}>
                  <Text variant="label" style={{ flex: 1 }}>{f.title}</Text>
                  <Text variant="caption" color={c.mutedForeground}>{f.clicks} clicks · {f.percentage}%</Text>
                </View>
                <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                  {f.evidence}
                </Text>
              </Card>
            ))}
          </View>
        </View>
      )}

      {/* Rejected features */}
      {report.rejectedFeatures.length > 0 && (
        <View>
          <Text variant="overline" color={c.mutedForeground}>Cut or defer</Text>
          <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
            {report.rejectedFeatures.map(f => (
              <Card key={f.taskId} variant="muted">
                <View style={styles.featureHeader}>
                  <Text variant="label" color={c.mutedForeground} style={{ flex: 1, textDecorationLine: 'line-through' }}>
                    {f.title}
                  </Text>
                  <Text variant="caption" color={c.mutedForeground}>{f.clicks}</Text>
                </View>
                <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                  {f.reason}
                </Text>
              </Card>
            ))}
          </View>
        </View>
      )}

      {/* Survey insights */}
      {report.surveyInsights && (
        <View>
          <Text variant="overline" color={c.mutedForeground}>What people said</Text>
          <Card style={{ marginTop: spacing[1] }}>
            <Text variant="caption" style={{ fontStyle: 'italic' }}>{report.surveyInsights}</Text>
          </Card>
        </View>
      )}

      {/* Next action */}
      <Card>
        <Text variant="overline" color={c.mutedForeground}>Next 48 hours</Text>
        <Text variant="body" style={{ marginTop: spacing[1] }}>{report.nextAction}</Text>
      </Card>

      {/* MVP handoff */}
      {report.usedForMvp ? (
        <Card variant="primary">
          <Text variant="label" color={c.primary} align="center">
            This brief is your MVP spec
          </Text>
        </Card>
      ) : (
        <Button
          title={markingMvp ? 'Saving…' : 'Use as my MVP spec'}
          loading={markingMvp}
          onPress={() => { void onMarkAsMvp(); }}
          size="lg"
          fullWidth
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  featureHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
});
