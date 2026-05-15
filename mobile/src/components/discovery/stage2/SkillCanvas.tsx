// src/components/discovery/stage2/SkillCanvas.tsx
//
// Main canvas surface for Stage 2 — Outcome Requirements. Wires
// together:
//
//   - TeammateTabs (founder + team + add) at the top
//   - An inline "add teammate" input row that toggles open when the
//     founder taps the + pill
//   - 14 SkillTierStrips, one per skill in SKILL_ORDER, each with a
//     draggable + tappable tier pill
//   - A bottom-anchored "Derive Expected Profile" CTA
//   - A BottomSheet for rename/remove on long-press of a teammate pill
//
// State that lives here (selectedPerson, isAddingTeammate, edit sheet
// open/close) is purely UI presentation; persistent canvas state
// (tier values, teammate list) lives in the IdeationStageRun.output
// + FounderProfile.skillInventory and flows in via the `inventory`
// prop. All mutations bubble up through callback props so the parent
// can route them through useStage2Session.

import { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, Keyboard, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Sparkles, ChevronRight, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import {
  Text,
  Button,
  TextInput,
  BottomSheet,
} from '@/components/ui';
import type { SkillInventory, SkillKey, SkillTier } from '@/lib/ideation-types';
import { SkillTierStrip } from './SkillTierStrip';
import { TeammateTabs } from './TeammateTabs';
import { SKILL_LABELS, SKILL_ORDER } from './labels';
import { spacing, iconSize, radius } from '@/constants/theme';

interface SkillCanvasProps {
  inventory: SkillInventory;
  /** Founder asked to derive Expected Profile. Parent flips status
   *  to 'composing' for the ~15s server roundtrip. */
  onDerive:           () => Promise<void> | void;
  onUpdateSkillTier:  (person: 'founder' | number, skill: SkillKey, tier: SkillTier) => Promise<void>;
  onAddTeammate:      (name: string) => Promise<void>;
  onRemoveTeammate:   (index: number) => Promise<void>;
  onRenameTeammate:   (index: number, name: string) => Promise<void>;
  /** True when an in-flight canvas write or derive is pending —
   *  disables tier strips, tab switching, and the derive CTA so the
   *  founder can't fire a race. */
  busy:               boolean;
  /** True while the derive call is in flight — replaces the CTA copy
   *  with a "deriving…" state. */
  isDeriving:         boolean;
  /** True when the session already has a derived Expected Profile —
   *  switches the derive CTA label to "Re-derive". */
  hasExpectedProfile: boolean;
}

export function SkillCanvas({
  inventory,
  onDerive,
  onUpdateSkillTier,
  onAddTeammate,
  onRemoveTeammate,
  onRenameTeammate,
  busy,
  isDeriving,
  hasExpectedProfile,
}: SkillCanvasProps) {
  const { colors: c } = useTheme();
  const [selected,       setSelected]       = useState<'founder' | number>('founder');
  const [isAdding,       setIsAdding]       = useState(false);
  const [addInput,       setAddInput]       = useState('');
  const [editingIdx,     setEditingIdx]     = useState<number | null>(null);
  const [renameInput,    setRenameInput]    = useState('');

  // Clamp selection if the team list shrinks beneath the index (e.g.
  // we just removed a teammate while it was selected). Falls back to
  // 'founder' which always exists.
  const activePerson = useMemo(() => {
    if (selected === 'founder') return inventory.founder;
    const mate = inventory.team[selected];
    if (!mate) return inventory.founder;
    return mate;
  }, [selected, inventory]);

  // Whether the founder has surfaced any non-'unknown' tier yet.
  // The derive CTA is more honest disabled-by-default than dimmed —
  // an Expected Profile from an entirely 'unknown' inventory is
  // garbage, and the agent is the surface that should be doing the
  // calibration in that state, not the derive button.
  const hasAnyTier = useMemo(() => {
    const personTiers = (p: SkillInventory['founder']) =>
      Object.values(p.tiers).some(t => t && t !== 'unknown');
    if (personTiers(inventory.founder)) return true;
    return inventory.team.some(personTiers);
  }, [inventory]);

  function handleSelect(next: 'founder' | number) {
    setSelected(next);
  }

  function handleTierChange(skill: SkillKey, tier: SkillTier) {
    // Fire-and-forget — errors surface via the parent's turnError.
    void onUpdateSkillTier(selected, skill, tier).catch(() => { /* swallow */ });
  }

  async function handleSubmitAdd() {
    const name = addInput.trim();
    if (!name) return;
    Keyboard.dismiss();
    try {
      await onAddTeammate(name);
      setAddInput('');
      setIsAdding(false);
    } catch { /* turnError already set by hook */ }
  }

  function handleCancelAdd() {
    Keyboard.dismiss();
    setAddInput('');
    setIsAdding(false);
  }

  function handleRequestEdit(idx: number) {
    setEditingIdx(idx);
    setRenameInput(inventory.team[idx]?.name ?? '');
  }

  function handleCloseEdit() {
    setEditingIdx(null);
    setRenameInput('');
  }

  async function handleSubmitRename() {
    if (editingIdx === null) return;
    const name = renameInput.trim();
    if (!name) return;
    Keyboard.dismiss();
    try {
      await onRenameTeammate(editingIdx, name);
      handleCloseEdit();
    } catch { /* turnError already set by hook */ }
  }

  async function handleRemove() {
    if (editingIdx === null) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await onRemoveTeammate(editingIdx);
      // If we just removed the selected teammate, fall back to founder.
      if (selected === editingIdx) setSelected('founder');
      // If we removed a teammate whose index was BELOW selected, the
      // remaining selection now points to the wrong person. Clamp to
      // founder for safety — the parent's refetch will resolve to the
      // freshest list shape before the next tier write.
      else if (typeof selected === 'number' && selected > editingIdx) {
        setSelected('founder');
      }
      handleCloseEdit();
    } catch { /* turnError already set by hook */ }
  }

  return (
    <View>
      <TeammateTabs
        founder={inventory.founder}
        team={inventory.team}
        selected={selected}
        disabled={busy}
        onSelect={handleSelect}
        onRequestAdd={() => setIsAdding(true)}
        onRequestEdit={handleRequestEdit}
      />

      {isAdding && (
        <View style={[styles.addRow, { borderColor: c.border, backgroundColor: c.card }]}>
          <TextInput
            value={addInput}
            onChangeText={setAddInput}
            placeholder="Teammate name"
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => { void handleSubmitAdd(); }}
            editable={!busy}
            containerStyle={{ flex: 1 }}
          />
          <Button
            title="Add"
            onPress={() => { void handleSubmitAdd(); }}
            variant="primary"
            size="sm"
            disabled={busy || !addInput.trim()}
          />
          <Button
            title="Cancel"
            onPress={handleCancelAdd}
            variant="ghost"
            size="sm"
            disabled={busy}
          />
        </View>
      )}

      <View style={styles.rows}>
        {SKILL_ORDER.map(skill => {
          const current = (activePerson.tiers[skill] ?? 'unknown') as SkillTier;
          return (
            <SkillTierStrip
              key={skill}
              skillLabel={SKILL_LABELS[skill]}
              tier={current}
              onTierChange={tier => handleTierChange(skill, tier)}
              disabled={busy}
            />
          );
        })}
      </View>

      <View style={styles.deriveSection}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hasExpectedProfile ? 'Re-derive Expected Profile' : 'Derive Expected Profile'}
          accessibilityState={{ disabled: busy || !hasAnyTier }}
          disabled={busy || !hasAnyTier}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            void onDerive();
          }}
          style={({ pressed }) => [
            styles.deriveBtn,
            {
              borderColor:     c.primary,
              backgroundColor: hasAnyTier && !busy ? c.primaryAlpha10 : c.muted,
              opacity:         (busy || !hasAnyTier) && !isDeriving ? 0.6 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Sparkles size={iconSize.sm} color={c.primary} />
          <Text variant="label" color={c.primary} style={{ flex: 1 }}>
            {isDeriving
              ? 'Deriving Expected Profile…'
              : hasExpectedProfile
                ? 'Re-derive Expected Profile'
                : 'Derive Expected Profile'}
          </Text>
          <ChevronRight size={iconSize.sm} color={c.primary} />
        </Pressable>
        {!hasAnyTier && !isDeriving && (
          <Text variant="caption" color={c.mutedForeground} style={styles.deriveHint}>
            Surface at least one skill above unknown before deriving — the agent's first
            pass needs something to ground on.
          </Text>
        )}
      </View>

      <BottomSheet
        visible={editingIdx !== null}
        onClose={handleCloseEdit}
        title={editingIdx !== null ? `Edit ${inventory.team[editingIdx]?.name ?? 'teammate'}` : ''}
      >
        <View style={styles.editSheet}>
          <TextInput
            value={renameInput}
            onChangeText={setRenameInput}
            placeholder="Name"
            autoCapitalize="words"
            autoFocus={Platform.OS !== 'android'}
            editable={!busy}
            label="Rename"
          />
          <Button
            title="Save name"
            onPress={() => { void handleSubmitRename(); }}
            variant="primary"
            size="md"
            fullWidth
            disabled={busy || !renameInput.trim() ||
              renameInput.trim() === (editingIdx !== null ? inventory.team[editingIdx]?.name : '')}
          />
          <Button
            title="Remove teammate"
            onPress={() => { void handleRemove(); }}
            variant="destructive"
            size="md"
            fullWidth
            disabled={busy}
            icon={<Trash2 size={iconSize.sm} color={c.primaryForeground} />}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
    padding: spacing[3],
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: spacing[3],
  },
  rows: {
    gap: spacing[1],
  },
  deriveSection: {
    marginTop: spacing[4],
  },
  deriveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  deriveHint: {
    marginTop: spacing[2],
    paddingHorizontal: spacing[1],
  },
  editSheet: {
    gap: spacing[3],
    paddingBottom: spacing[6],
  },
});
