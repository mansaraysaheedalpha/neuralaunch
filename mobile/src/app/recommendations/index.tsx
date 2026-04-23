// src/app/recommendations/index.tsx
//
// Ventures dashboard — grouped list of the founder's ventures with
// their cycles and progress. Mirrors the web's venture-aware
// Recommendations page. When no ventures exist yet (pre-venture users
// or brand-new founders) falls through to a "Start Discovery" empty
// state.

import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View, RefreshControl } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Sparkles } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { ApiError } from '@/services/api-client';
import { groupVentures, useVentures } from '@/hooks/useVentures';
import {
  Text,
  ScreenContainer,
  ListSkeleton,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import { VentureCard } from '@/components/ventures/VentureCard';
import { ArchivedVenturesSection } from '@/components/ventures/ArchivedVenturesSection';
import { spacing } from '@/constants/theme';

export default function VenturesListScreen() {
  const { colors: c } = useTheme();
  const router = useRouter();

  const { data, isLoading, error, mutate } = useVentures();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    void Haptics.selectionAsync();
    setRefreshing(true);
    try { await mutate(); }
    finally { setRefreshing(false); }
  }, [mutate]);

  const headerOpts = (
    <Stack.Screen
      options={{
        headerShown: true,
        headerTitle: 'Your ventures',
        headerTintColor: c.foreground,
        headerStyle: { backgroundColor: c.background },
        headerShadowVisible: false,
      }}
    />
  );

  if (error && !data) {
    const kind = error instanceof ApiError && error.status === 401 ? 'auth'
      : error instanceof ApiError && error.status === 0 ? 'network'
      : 'generic';
    return (
      <>
        {headerOpts}
        <ScreenContainer scroll={false}>
          <ErrorState kind={kind} onRetry={() => void mutate()} />
        </ScreenContainer>
      </>
    );
  }

  if (isLoading && !data) {
    return (
      <>
        {headerOpts}
        <ScreenContainer>
          <ListSkeleton count={4} />
        </ScreenContainer>
      </>
    );
  }

  if (!data || data.ventures.length === 0) {
    return (
      <>
        {headerOpts}
        <ScreenContainer scroll={false}>
          <EmptyState
            icon={Sparkles}
            title="No ventures yet"
            message="Start a discovery session to get your first personalised recommendation. Each venture groups the recommendations, roadmaps, and cycles that belong to one idea."
            actionLabel="Start Discovery"
            onAction={() => router.push('/discovery')}
          />
        </ScreenContainer>
      </>
    );
  }

  const { active, paused, completed, archived } = groupVentures(data.ventures);

  return (
    <>
      {headerOpts}
      <ScreenContainer scroll={false}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.primary}
              colors={[c.primary]}
            />
          }
        >
          {/* Tier cap reminder — helps the founder read the grouping */}
          <View style={styles.capRow}>
            <Text variant="caption" color={c.mutedForeground}>
              {data.tier === 'free'
                ? 'Free plan — discovery only. Upgrade to activate ventures.'
                : `${data.tier === 'compound' ? 'Compound' : 'Execute'} plan — up to ${data.cap} active venture${data.cap === 1 ? '' : 's'}.`}
            </Text>
          </View>

          {active.length > 0 && (
            <Group label="Active" colors={c}>
              {active.map(v => <VentureCard key={v.id} venture={v} />)}
            </Group>
          )}

          {paused.length > 0 && (
            <Group label="Paused" colors={c}>
              {paused.map(v => <VentureCard key={v.id} venture={v} />)}
            </Group>
          )}

          {completed.length > 0 && (
            <Group label="Completed" colors={c}>
              {completed.map(v => <VentureCard key={v.id} venture={v} />)}
            </Group>
          )}

          {archived.length > 0 && (
            <ArchivedVenturesSection
              archived={archived}
              activeVentures={active}
              tier={data.tier}
              cap={data.cap}
              onAfterSwap={() => { void mutate(); }}
            />
          )}
        </ScrollView>
      </ScreenContainer>
    </>
  );
}

function Group({
  label,
  colors: c,
  children,
}: {
  label: string;
  colors: { mutedForeground: string };
  children: React.ReactNode;
}) {
  return (
    <View style={styles.group}>
      <Text variant="overline" color={c.mutedForeground} style={styles.groupLabel}>
        {label}
      </Text>
      <View style={styles.groupList}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingVertical: spacing[4],
    gap: spacing[4],
  },
  capRow: {
    marginBottom: spacing[1],
  },
  group: {
    gap: spacing[2],
  },
  groupLabel: {
    letterSpacing: 1,
  },
  groupList: {
    gap: spacing[3],
  },
});
