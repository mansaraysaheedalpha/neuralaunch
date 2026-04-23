// src/components/ventures/ReactivateDialog.tsx
//
// Presented when the founder taps "Reactivate" on an archived venture
// and they're already at their tier cap. Matches the web's
// ReactivateDialog behaviour: radio-style pick which currently-active
// venture to archive in exchange. When the cap has room, the parent
// swaps directly without opening this sheet.
//
// Built on the BottomSheet primitive from feat/mobile-polish-phase-2.

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check, Circle } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, BottomSheet, Button } from '@/components/ui';
import { spacing, radius, iconSize } from '@/constants/theme';

interface ActiveOption {
  id:   string;
  name: string;
}

interface Props {
  visible: boolean;
  /** Venture the founder tapped "reactivate" on. */
  archivedVentureName: string;
  /** The currently-active ventures they must pick one of to archive. */
  activeOptions: ActiveOption[];
  tierLabel: 'Execute' | 'Compound';
  cap: number;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (ventureIdToArchive: string) => void;
}

export function ReactivateDialog({
  visible,
  archivedVentureName,
  activeOptions,
  tierLabel,
  cap,
  busy,
  error,
  onClose,
  onConfirm,
}: Props) {
  const { colors: c } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);

  function handleConfirm() {
    if (!selected) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirm(selected);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={`Reactivate "${archivedVentureName}"`}>
      <Text variant="caption" color={c.mutedForeground} style={styles.copy}>
        You can have {cap} active venture{cap === 1 ? '' : 's'} on your {tierLabel} plan.
        Pick which current active venture to archive in exchange —
        nothing is deleted, the swap is reversible anytime.
      </Text>

      <View style={styles.list}>
        {activeOptions.map(opt => {
          const isSelected = opt.id === selected;
          return (
            <Pressable
              key={opt.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              onPress={() => {
                void Haptics.selectionAsync();
                setSelected(opt.id);
              }}
              style={({ pressed }) => [
                styles.option,
                {
                  borderColor: isSelected ? c.primary : c.border,
                  backgroundColor: isSelected ? c.primaryAlpha5 : c.card,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              {isSelected
                ? <View style={[styles.bullet, { borderColor: c.primary, backgroundColor: c.primary }]}>
                    <Check size={12} color={c.primaryForeground} strokeWidth={3} />
                  </View>
                : <Circle size={iconSize.md} color={c.mutedForeground} />}
              <Text variant="label" style={{ flex: 1 }}>
                Archive “{opt.name}”
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error && (
        <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[3] }}>
          {error}
        </Text>
      )}

      <View style={styles.actions}>
        <Button
          title={busy ? 'Swapping…' : 'Confirm swap'}
          onPress={handleConfirm}
          disabled={!selected || !!busy}
          loading={!!busy}
          size="lg"
          fullWidth
        />
        <Button
          title="Cancel"
          onPress={onClose}
          variant="ghost"
          size="md"
          fullWidth
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  copy: {
    lineHeight: 18,
    marginBottom: spacing[3],
  },
  list: {
    gap: spacing[2],
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  bullet: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    gap: spacing[2],
    marginTop: spacing[5],
  },
});
