// src/components/ventures/ArchivedVenturesSection.tsx
//
// Renders archived ventures in a dedicated section with a Reactivate
// button per row. If the caller is under cap, reactivate happens
// directly; if at cap, ReactivateDialog opens to pick which active
// venture to archive in exchange. Free-tier users see an informational
// banner because they cannot activate anything.

import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import { Text, Card, Button } from '@/components/ui';
import { spacing, radius } from '@/constants/theme';
import type { Venture } from '@/hooks/useVentures';
import { ReactivateDialog } from './ReactivateDialog';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

interface Props {
  archived:      Venture[];
  activeVentures: Venture[];
  tier:          'free' | 'execute' | 'compound';
  cap:          number;
  onAfterSwap:  () => void;
}

export function ArchivedVenturesSection({
  archived,
  activeVentures,
  tier,
  cap,
  onAfterSwap,
}: Props) {
  const { colors: c } = useTheme();
  const [dialogFor, setDialogFor] = useState<Venture | null>(null);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (archived.length === 0) return null;

  const activeCount = activeVentures.length;
  const underCap    = activeCount < cap;
  const tierLabel   = tier === 'compound' ? 'Compound' : tier === 'execute' ? 'Execute' : null;

  async function swap(ventureIdToActivate: string, ventureIdToArchive?: string) {
    setBusy(true);
    setError(null);
    try {
      await api('/api/discovery/ventures/swap', {
        method: 'POST',
        body: { ventureIdToActivate, ventureIdToArchive },
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDialogFor(null);
      onAfterSwap();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reactivate. Try again.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  async function handleReactivate(venture: Venture) {
    if (tier === 'free' || !tierLabel) return;
    if (underCap) {
      // Under cap — fire the swap directly, no dialog.
      void swap(venture.id);
      return;
    }
    // At cap — open the dialog so the founder picks which to archive.
    setDialogFor(venture);
    setError(null);
  }

  return (
    <View style={styles.wrapper}>
      <Text variant="overline" color={c.mutedForeground} style={{ marginBottom: spacing[2] }}>
        Archived
      </Text>

      {tier === 'free' && (
        <Card style={[styles.freeBanner, { borderColor: c.secondary, backgroundColor: c.secondaryAlpha10 }]}>
          <Text variant="caption" color={c.foreground}>
            Your plan doesn't include active ventures. Upgrade to
            Execute or Compound to reactivate these.
          </Text>
        </Card>
      )}

      <View style={styles.list}>
        {archived.map(v => (
          <Card key={v.id} style={[styles.row, { borderColor: c.border }]}>
            <View style={{ flex: 1 }}>
              <Text variant="label">{v.name}</Text>
              <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[0.5] }}>
                {v.cycles.length} cycle{v.cycles.length === 1 ? '' : 's'}
                {v.archivedAt && ` · Archived ${formatDate(v.archivedAt)}`}
              </Text>
            </View>
            {tier !== 'free' && (
              <Button
                title="Reactivate"
                onPress={() => { void handleReactivate(v); }}
                variant="secondary"
                size="sm"
                disabled={busy}
              />
            )}
          </Card>
        ))}
      </View>

      {dialogFor && tierLabel && (
        <ReactivateDialog
          visible={!!dialogFor}
          archivedVentureName={dialogFor.name}
          activeOptions={activeVentures.map(v => ({ id: v.id, name: v.name }))}
          tierLabel={tierLabel}
          cap={cap}
          busy={busy}
          error={error}
          onClose={() => { if (!busy) setDialogFor(null); }}
          onConfirm={(archiveId) => { void swap(dialogFor.id, archiveId); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: spacing[6],
  },
  freeBanner: {
    borderWidth: 1,
    borderRadius: radius.lg,
    marginBottom: spacing[3],
  },
  list: {
    gap: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderWidth: 1,
  },
});
