// src/app/validation/[pageId].tsx
//
// Validation page detail — preview via WebView, distribution tracker,
// build brief panel, and page controls (publish, copy link).

import { useState } from 'react';
import { View, StyleSheet, Pressable, Share } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import useSWR from 'swr';
import { Share2 } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError, API_BASE_URL } from '@/services/api-client';
import {
  Text,
  Card,
  Button,
  Badge,
  ScreenContainer,
  Separator,
  ListSkeleton,
  ErrorState,
} from '@/components/ui';
import { spacing, radius, iconSize } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DistributionChannel {
  channel:        string;
  message:        string;
  expectedYield:  string;
  audienceReason: string;
}

interface BuildBriefReport {
  signalStrength:    string;
  confirmedFeatures: Array<{ taskId: string; title: string; clicks: number; percentage: number; evidence: string }>;
  rejectedFeatures:  Array<{ taskId: string; title: string; clicks: number; reason: string }>;
  surveyInsights:    string;
  buildBrief:        string;
  nextAction:        string;
  usedForMvp:        boolean;
  generatedAt:       string;
}

interface ValidationPageDetail {
  id:                string;
  slug:              string;
  status:            'DRAFT' | 'LIVE' | 'ARCHIVED';
  recommendationId:  string;
  distributionBrief: DistributionChannel[] | null;
  channelsCompleted: string[];
  report:            BuildBriefReport | null;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ValidationDetailScreen() {
  const { pageId } = useLocalSearchParams<{ pageId: string }>();
  const { colors: c } = useTheme();

  const { data: page, isLoading, error, mutate } = useSWR<ValidationPageDetail>(
    pageId ? `/api/discovery/validation/${pageId}` : null,
    (url: string) => api<ValidationPageDetail>(url),
  );

  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);

  if (error && !page) {
    const kind = error instanceof ApiError && error.status === 401 ? 'auth'
      : error instanceof ApiError && error.status === 0 ? 'network'
      : 'generic';
    return (
      <ScreenContainer>
        <ErrorState kind={kind} onRetry={() => void mutate()} />
      </ScreenContainer>
    );
  }

  if (isLoading || !page) {
    return (
      <ScreenContainer>
        <View style={{ marginTop: spacing[6] }}>
          <ListSkeleton count={4} />
        </View>
      </ScreenContainer>
    );
  }

  const pageUrl = `${API_BASE_URL}/lp/${page.slug}`;
  const isLive = page.status === 'LIVE';

  async function handlePublish() {
    setPublishing(true);
    try {
      await api(`/api/discovery/validation/${pageId}/publish`, { method: 'POST' });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void mutate();
    } catch { /* error handling */ }
    setPublishing(false);
  }

  async function handleCopyLink() {
    await Clipboard.setStringAsync(pageUrl);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShareLink() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await Share.share({
        message: pageUrl,
        url:     pageUrl, // iOS uses url; Android uses message
        title:   'NeuraLaunch validation page',
      });
      if (result.action === Share.sharedAction) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch { /* user cancelled or native error — silent */ }
  }

  async function handleToggleChannel(channel: string, completed: boolean) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api(`/api/discovery/validation/${pageId}/channel`, {
        method: 'POST',
        body: { channel, completed },
      });
      void mutate();
    } catch { /* silent */ }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Validation Page',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <ScreenContainer>
        {/* Status + controls */}
        <View style={styles.controlsRow}>
          <Badge
            label={page.status.toLowerCase()}
            variant={isLive ? 'success' : page.status === 'DRAFT' ? 'warning' : 'muted'}
          />
          {isLive && (
            <Text variant="caption" color={c.mutedForeground} numberOfLines={1} style={{ flex: 1 }}>
              {pageUrl}
            </Text>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {!isLive && page.status === 'DRAFT' && (
            <Button
              title={publishing ? 'Publishing…' : 'Publish page'}
              onPress={handlePublish}
              loading={publishing}
              size="lg"
              fullWidth
            />
          )}
          {isLive && (
            <>
              <Button
                title={copied ? '✓ Link copied' : 'Copy link'}
                onPress={() => { void handleCopyLink(); }}
                variant="secondary"
                size="lg"
                fullWidth
              />
              <Button
                title="Share page"
                onPress={() => { void handleShareLink(); }}
                variant="ghost"
                size="lg"
                fullWidth
                icon={<Share2 size={iconSize.sm} color={c.primary} />}
              />
            </>
          )}
        </View>

        {/* Preview hint */}
        <Card variant="muted">
          <Text variant="caption" color={c.mutedForeground}>
            Preview your page in a browser at:
          </Text>
          <Text variant="label" color={c.primary} style={{ marginTop: spacing[1] }}>
            /lp/{page.slug}
          </Text>
        </Card>

        {/* Distribution tracker */}
        {isLive && page.distributionBrief && page.distributionBrief.length > 0 && (
          <>
            <Separator />
            <Text variant="title">Where to share it</Text>
            <Text variant="caption" color={c.mutedForeground} style={{ marginBottom: spacing[3] }}>
              {page.channelsCompleted.length} of {page.distributionBrief.length} shared
            </Text>

            <View style={styles.channelList}>
              {page.distributionBrief.map((ch, i) => {
                const isDone = page.channelsCompleted.includes(ch.channel);
                return (
                  <Card
                    key={`${ch.channel}-${i}`}
                    variant={isDone ? 'primary' : 'default'}
                    style={styles.channelCard}
                  >
                    <View style={styles.channelHeader}>
                      <View style={{ flex: 1 }}>
                        <Text variant="label">{ch.channel}</Text>
                        <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[0.5] }}>
                          {ch.audienceReason}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => { void handleToggleChannel(ch.channel, !isDone); }}
                        style={[
                          styles.checkbox,
                          {
                            borderColor: isDone ? c.primary : c.border,
                            backgroundColor: isDone ? c.primary : 'transparent',
                          },
                        ]}
                      >
                        {isDone && <Text variant="caption" color={c.primaryForeground}>✓</Text>}
                      </Pressable>
                    </View>

                    <Text variant="overline" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
                      Expected yield
                    </Text>
                    <Text variant="caption">{ch.expectedYield}</Text>

                    <View style={[styles.messageBox, { backgroundColor: c.muted, borderColor: c.border }]}>
                      <Text variant="overline" color={c.mutedForeground}>Message to send</Text>
                      <Text variant="caption" style={{ marginTop: spacing[1] }}>{ch.message}</Text>
                      <Pressable
                        onPress={async () => {
                          await Clipboard.setStringAsync(ch.message);
                          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }}
                        style={{ marginTop: spacing[2] }}
                      >
                        <Text variant="label" color={c.primary}>Copy message</Text>
                      </Pressable>
                    </View>
                  </Card>
                );
              })}
            </View>
          </>
        )}

        {/* Build brief */}
        {page.report && (
          <>
            <Separator />
            <View style={styles.briefHeader}>
              <Text variant="title">Build Brief</Text>
              <Badge
                label={`${page.report.signalStrength} signal`}
                variant={
                  page.report.signalStrength === 'strong' ? 'success'
                  : page.report.signalStrength === 'moderate' ? 'warning'
                  : 'destructive'
                }
              />
            </View>

            <Text variant="caption" color={c.mutedForeground}>
              Generated {new Date(page.report.generatedAt).toLocaleDateString()}
            </Text>

            {/* The call */}
            <Card variant="primary">
              <Text variant="overline" color={c.primary}>The call</Text>
              <Text variant="body" style={{ marginTop: spacing[2] }}>{page.report.buildBrief}</Text>
            </Card>

            {/* Confirmed features */}
            {page.report.confirmedFeatures.length > 0 && (
              <View>
                <Text variant="overline" color={c.mutedForeground}>Build these</Text>
                <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
                  {page.report.confirmedFeatures.map(f => (
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
            {page.report.rejectedFeatures.length > 0 && (
              <View>
                <Text variant="overline" color={c.mutedForeground}>Cut or defer</Text>
                <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
                  {page.report.rejectedFeatures.map(f => (
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
            {page.report.surveyInsights && (
              <View>
                <Text variant="overline" color={c.mutedForeground}>What people said</Text>
                <Card style={{ marginTop: spacing[1] }}>
                  <Text variant="caption" style={{ fontStyle: 'italic' }}>{page.report.surveyInsights}</Text>
                </Card>
              </View>
            )}

            {/* Next action */}
            <Card>
              <Text variant="overline" color={c.mutedForeground}>Next 48 hours</Text>
              <Text variant="body" style={{ marginTop: spacing[1] }}>{page.report.nextAction}</Text>
            </Card>

            {/* MVP handoff */}
            {page.report.usedForMvp ? (
              <Card variant="primary">
                <Text variant="label" color={c.primary} align="center">
                  This brief is your MVP spec
                </Text>
              </Card>
            ) : (
              <Button
                title="Use as my MVP spec"
                onPress={async () => {
                  await api(`/api/discovery/validation/${pageId}/report`, {
                    method: 'POST',
                    body: { usedForMvp: true },
                  });
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  void mutate();
                }}
                size="lg"
                fullWidth
              />
            )}
          </>
        )}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  actions: {
    gap: spacing[2],
    marginTop: spacing[3],
    marginBottom: spacing[4],
  },
  channelList: {
    gap: spacing[3],
  },
  channelCard: {
    gap: spacing[1],
  },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBox: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing[3],
    marginTop: spacing[2],
  },
  briefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[1],
  },
  featureHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
});
