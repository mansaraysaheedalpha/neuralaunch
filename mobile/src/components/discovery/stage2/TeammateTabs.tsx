// src/components/discovery/stage2/TeammateTabs.tsx
//
// Top tab bar for the Stage 2 SkillCanvas. Horizontal scrolling list
// of pills: [Founder] [Teammate 1] [Teammate 2] ... [+ Add].
//
// Selection is controlled — the parent owns `selectedPerson` and
// receives onSelect callbacks. The "+" pill at the end opens an
// add-teammate row (the parent decides what UI to surface). Long-
// pressing a teammate pill opens a rename / remove action sheet via
// the onRequestEdit callback.

import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Plus, Users } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui';
import type { PersonSkills } from '@/lib/ideation-types';
import { spacing, iconSize, radius } from '@/constants/theme';

interface TeammateTabsProps {
  founder:  PersonSkills;
  team:     PersonSkills[];
  /** 'founder' or a teammate index. */
  selected: 'founder' | number;
  onSelect: (next: 'founder' | number) => void;
  /** Tapped when the "+" pill is pressed — the parent surfaces an add
   *  input. We keep the input out of this component so the tab bar
   *  itself stays focused on rendering selection state. */
  onRequestAdd: () => void;
  /** Long-press on a teammate pill — parent surfaces a rename /
   *  remove action sheet keyed by index. Founder pill is non-editable
   *  (no callback fires for index='founder'). */
  onRequestEdit: (index: number) => void;
  /** When true, gestures are blocked. Use during canvas-action
   *  network writes so the tab can't change mid-flight. */
  disabled?: boolean;
}

export function TeammateTabs({
  founder,
  team,
  selected,
  onSelect,
  onRequestAdd,
  onRequestEdit,
  disabled = false,
}: TeammateTabsProps) {
  const { colors: c } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      // Disable horizontal scroll while a write is pending so the
      // founder doesn't keep panning into a stale tab.
      scrollEnabled={!disabled}
    >
      <PersonPill
        label={founder.name ?? 'Founder'}
        active={selected === 'founder'}
        disabled={disabled}
        onPress={() => onSelect('founder')}
        leadingIcon={<Users size={iconSize.xs} color={selected === 'founder' ? c.primary : c.mutedForeground} />}
        colors={c}
      />

      {team.map((mate, idx) => {
        const isActive = selected === idx;
        return (
          <PersonPill
            key={`${idx}-${mate.name}`}
            label={mate.name ?? `Teammate ${idx + 1}`}
            active={isActive}
            disabled={disabled}
            onPress={() => onSelect(idx)}
            onLongPress={() => onRequestEdit(idx)}
            colors={c}
          />
        );
      })}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add teammate"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          void Haptics.selectionAsync();
          onRequestAdd();
        }}
        style={({ pressed }) => [
          styles.pill,
          styles.addPill,
          { borderColor: c.border, backgroundColor: c.card },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Plus size={iconSize.xs} color={c.mutedForeground} />
        <Text variant="caption" color={c.mutedForeground}>
          Add
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function PersonPill({
  label,
  active,
  disabled,
  onPress,
  onLongPress,
  leadingIcon,
  colors: c,
}: {
  label:        string;
  active:       boolean;
  disabled:     boolean;
  onPress:      () => void;
  onLongPress?: () => void;
  leadingIcon?: React.ReactNode;
  colors:       ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      onLongPress={onLongPress
        ? () => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onLongPress();
          }
        : undefined}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.pill,
        {
          borderColor:     active ? c.primary : c.border,
          backgroundColor: active ? c.primaryAlpha10 : c.card,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      {leadingIcon}
      <Text
        variant="caption"
        color={active ? c.primary : c.foreground}
        weight={active ? 'semibold' : undefined}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[1],
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1.5],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: 180,
  },
  addPill: {
    // Slightly dashed look would be ideal but RN's borderStyle: 'dashed'
    // is buggy on some Android skins; stick with solid + reduced
    // visual weight via lighter copy color.
  },
});
