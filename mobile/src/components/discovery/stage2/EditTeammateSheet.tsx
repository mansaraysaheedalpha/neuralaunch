// src/components/discovery/stage2/EditTeammateSheet.tsx
//
// BottomSheet body for renaming / removing a teammate on the Stage 2
// canvas. Mounts when SkillCanvas's edit affordance fires (long-press
// on a teammate pill). Owns its own rename input state so the parent
// only deals with the rename/remove network calls. Extracted from
// SkillCanvas during the self-review refactor.

import { useState, useEffect } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button, TextInput, BottomSheet } from '@/components/ui';
import { spacing, iconSize } from '@/constants/theme';

interface Props {
  /** Current name of the teammate being edited. Drives the title and
   *  the initial value of the rename input. Null/undefined means the
   *  sheet is closed. */
  currentName:  string | null;
  visible:      boolean;
  onClose:      () => void;
  onRename:     (next: string) => Promise<void>;
  onRemove:     () => Promise<void>;
  /** Disabled while any canvas write (this sheet's or otherwise) is
   *  in flight. */
  busy?:        boolean;
}

export function EditTeammateSheet({
  currentName,
  visible,
  onClose,
  onRename,
  onRemove,
  busy = false,
}: Props) {
  const { colors: c } = useTheme();
  const [renameInput, setRenameInput] = useState('');

  // Sync the input every time the sheet (re-)opens with a new
  // teammate so the field reflects the actual current value, not
  // whatever was last typed before dismissal.
  useEffect(() => {
    if (visible) setRenameInput(currentName ?? '');
  }, [visible, currentName]);

  const trimmed = renameInput.trim();
  const canRename = !busy && trimmed.length > 0 && trimmed !== currentName;

  async function handleRename() {
    if (!canRename) return;
    try {
      await onRename(trimmed);
    } catch { /* parent surfaces error via turnError */ }
  }

  async function handleRemove() {
    if (busy) return;
    try {
      await onRemove();
    } catch { /* parent surfaces error via turnError */ }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={currentName ? `Edit ${currentName}` : ''}
    >
      <View style={styles.body}>
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
          onPress={() => { void handleRename(); }}
          variant="primary"
          size="md"
          fullWidth
          disabled={!canRename}
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
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing[3],
    paddingBottom: spacing[6],
  },
});
