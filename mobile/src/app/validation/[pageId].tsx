// src/app/validation/[pageId].tsx
//
// Validation page detail — preview via WebView, distribution tracker,
// build brief panel, and page controls (publish, copy link).

import { useState } from 'react';
import { View, StyleSheet, Pressable, Share } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import useSWR from 'swr';
import { Share2, Eye, Check, Copy } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError, API_BASE_URL } from '@/services/api-client';
import {
  Text,
  Card,
  Button,
  Badge,
  ScreenContainer,
  ListSkeleton,
  ErrorState,
} from '@/components/ui';
// (Separator and radius were used by the inline distribution /
// build-brief blocks before the self-review extraction — now owned
// by DistributionTracker / BuildBriefReportView.)
import {
  DistributionTracker,
  type DistributionChannel,
} from '@/components/validation/DistributionTracker';
import {
  BuildBriefReportView,
  type BuildBriefReport,
} from '@/components/validation/BuildBriefReportView';
import { spacing, iconSize } from '@/constants/theme';

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
  const [publishError, setPublishError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [markingMvp, setMarkingMvp] = useState(false);

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
    setPublishError(null);
    try {
      await api(`/api/discovery/validation/${pageId}/publish`, { method: 'POST' });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void mutate();
    } catch (err) {
      setPublishError(
        err instanceof ApiError ? err.message : 'Could not publish. Try again.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setPublishing(false);
  }

  async function handlePreview() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await WebBrowser.openBrowserAsync(pageUrl);
    } catch { /* user dismissal is not an error */ }
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

  async function handleMarkAsMvp() {
    setMarkingMvp(true);
    try {
      await api(`/api/discovery/validation/${pageId}/report`, {
        method: 'POST',
        body:   { usedForMvp: true },
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void mutate();
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setMarkingMvp(false);
    }
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
            <>
              <Button
                title={publishing ? 'Publishing…' : 'Publish page'}
                onPress={handlePublish}
                loading={publishing}
                size="lg"
                fullWidth
              />
              {publishError && (
                <Text variant="caption" color={c.destructive}>
                  {publishError}
                </Text>
              )}
            </>
          )}
          {isLive && (
            <>
              <Button
                title="Preview live page"
                onPress={() => { void handlePreview(); }}
                size="lg"
                fullWidth
                icon={<Eye size={iconSize.sm} color={c.primaryForeground} />}
              />
              <Button
                title={copied ? 'Link copied' : 'Copy link'}
                onPress={() => { void handleCopyLink(); }}
                variant="secondary"
                size="lg"
                fullWidth
                icon={
                  copied
                    ? <Check size={iconSize.sm} color={c.success} />
                    : <Copy size={iconSize.sm} color={c.foreground} />
                }
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

        {/* Preview hint — card is tappable on LIVE pages so the URL line
            becomes a direct entry point into the in-app browser. */}
        <Pressable
          onPress={isLive ? () => { void handlePreview(); } : undefined}
          disabled={!isLive}
          accessibilityRole={isLive ? 'link' : undefined}
          accessibilityLabel={isLive ? `Open ${pageUrl}` : undefined}
          style={({ pressed }) => [pressed && isLive && { opacity: 0.85 }]}
        >
          <Card variant="muted">
            <Text variant="caption" color={c.mutedForeground}>
              {isLive ? 'Tap to preview your page:' : 'Preview your page in a browser at:'}
            </Text>
            <Text variant="label" color={c.primary} style={{ marginTop: spacing[1] }}>
              /lp/{page.slug}
            </Text>
          </Card>
        </Pressable>

        {isLive && page.distributionBrief && (
          <DistributionTracker
            distributionBrief={page.distributionBrief}
            channelsCompleted={page.channelsCompleted}
            onToggleChannel={handleToggleChannel}
          />
        )}

        {page.report && (
          <BuildBriefReportView
            report={page.report}
            markingMvp={markingMvp}
            onMarkAsMvp={handleMarkAsMvp}
          />
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
});
