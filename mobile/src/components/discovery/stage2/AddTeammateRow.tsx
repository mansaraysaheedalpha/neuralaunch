// src/components/discovery/stage2/AddTeammateRow.tsx
//
// Inline form for adding a new teammate to the Stage 2 skill canvas.
// Owns its own input state so SkillCanvas doesn't have to thread it —
// the parent only needs to handle the submit (POST) and cancel
// (dismiss) callbacks. Extracted from SkillCanvas during the
// self-review refactor.

import { useState } from 'react';
import { View, Keyboard, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button, TextInput } from '@/components/ui';
import { spacing, radius } from '@/constants/theme';

interface Props {
  /** Submit handler — receives the trimmed name. Returns a Promise so
   *  the row can stay "busy" until the server confirms. */
  onSubmit:  (name: string) => Promise<void>;
  onCancel:  () => void;
  /** Disabled while a canvas write is in flight elsewhere. */
  disabled?: boolean;
}

export function AddTeammateRow({ onSubmit, onCancel, disabled = false }: Props) {
  const { colors: c } = useTheme();
  const [input, setInput] = useState('');

  async function handleSubmit() {
    const name = input.trim();
    if (!name) return;
    Keyboard.dismiss();
    try {
      await onSubmit(name);
      setInput('');
    } catch { /* parent surfaces the error via turnError */ }
  }

  function handleCancel() {
    Keyboard.dismiss();
    setInput('');
    onCancel();
  }

  return (
    <View style={[styles.row, { borderColor: c.border, backgroundColor: c.card }]}>
      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder="Teammate name"
        autoFocus
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={() => { void handleSubmit(); }}
        editable={!disabled}
        containerStyle={{ flex: 1 }}
      />
      <Button
        title="Add"
        onPress={() => { void handleSubmit(); }}
        variant="primary"
        size="sm"
        disabled={disabled || !input.trim()}
      />
      <Button
        title="Cancel"
        onPress={handleCancel}
        variant="ghost"
        size="sm"
        disabled={disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
    padding: spacing[3],
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: spacing[3],
  },
});
