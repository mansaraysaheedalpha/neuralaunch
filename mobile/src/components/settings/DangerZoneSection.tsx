// src/components/settings/DangerZoneSection.tsx
//
// Mobile counterpart to the web's Settings > Danger zone card. Two-stage
// destructive action: a primary "Delete account" button opens a bottom
// sheet that requires the founder to type DELETE before the actual
// fetch fires. On success we clear the local mobile session and the
// sign-in screen re-renders via the auth-store subscription.
//
// The backend route (/api/user/delete-account) returns 202 — the
// deletion saga runs asynchronously in Inngest. By the time the founder
// sees the sign-in screen the saga has typically completed.

import { useState } from 'react';
import { StyleSheet, View, TextInput as RNTextInput } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AlertTriangle, Loader2 } from 'lucide-react-native';
import { useAuth } from '@/services/auth';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import { Text, Card, Button, BottomSheet } from '@/components/ui';
import { spacing, radius, iconSize, typography } from '@/constants/theme';

export function DangerZoneSection() {
  const { signOut } = useAuth();
  const { colors: c } = useTheme();

  const [open,        setOpen]        = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [pending,     setPending]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const canSubmit = confirmText === 'DELETE' && !pending;

  function handleOpen() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError(null);
    setConfirmText('');
    setOpen(true);
  }

  function handleClose() {
    if (pending) return;
    setOpen(false);
    setConfirmText('');
    setError(null);
  }

  async function handleDelete() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      await api('/api/user/delete-account', {
        method: 'POST',
        body:   { confirmation: 'DELETE' },
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // The saga revokes sessions server-side; clearing the local token
      // here ensures the next API call doesn't 401 in flight and the
      // root layout's auth-store subscription redirects to /sign-in.
      await signOut();
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof Error ? err.message : 'Failed to delete account');
      setPending(false);
    }
  }

  return (
    <>
      <Card style={[styles.dangerCard, { borderColor: c.destructive, backgroundColor: c.destructiveMuted }]}>
        <View style={styles.dangerHeader}>
          <AlertTriangle size={iconSize.md} color={c.destructive} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text variant="label">Delete account</Text>
            <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
              Permanently removes your NeuraLaunch account, cancels any
              active Paddle subscription, signs you out everywhere, and
              deletes your interview history, recommendations, roadmaps,
              and validation pages. This cannot be undone.
            </Text>
          </View>
        </View>
        <Button
          title="Delete account"
          onPress={handleOpen}
          variant="destructive"
          size="sm"
        />
      </Card>

      <BottomSheet visible={open} onClose={handleClose} title="Delete your account?">
        <View style={{ gap: spacing[3] }}>
          <Text variant="caption" color={c.mutedForeground}>
            This will:
          </Text>
          <View style={{ gap: spacing[1.5] }}>
            <BulletRow text="Cancel any active Paddle subscription, immediately." />
            <BulletRow text="Sign you out on every device." />
            <BulletRow text="Delete your discovery sessions, recommendations, roadmaps, validation pages, and tool history." />
            <BulletRow text="Remove your founder profile and all venture data." />
          </View>

          <View style={{ marginTop: spacing[2], gap: spacing[1.5] }}>
            <Text variant="caption" color={c.mutedForeground}>
              Type{' '}
              <Text variant="caption" color={c.foreground} weight="semibold">
                DELETE
              </Text>{' '}
              below to confirm.
            </Text>
            <RNTextInput
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder="DELETE"
              placeholderTextColor={c.placeholder}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              editable={!pending}
              style={[
                styles.input,
                {
                  backgroundColor: c.card,
                  borderColor: error ? c.destructive : c.border,
                  color: c.foreground,
                },
              ]}
            />
            {error && (
              <Text variant="caption" color={c.destructive}>
                {error}
              </Text>
            )}
          </View>

          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button
                title="Cancel"
                onPress={handleClose}
                variant="secondary"
                size="md"
                disabled={pending}
                fullWidth
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title={pending ? 'Deleting…' : 'Delete account'}
                onPress={() => { void handleDelete(); }}
                variant="destructive"
                size="md"
                disabled={!canSubmit}
                loading={pending}
                fullWidth
              />
            </View>
          </View>
        </View>
      </BottomSheet>
    </>
  );
}

function BulletRow({ text }: { text: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.bulletRow}>
      <Text variant="caption" color={c.mutedForeground}>•</Text>
      <Text variant="caption" color={c.mutedForeground} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dangerCard: {
    borderWidth: 1,
    gap: spacing[3],
  },
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  bulletRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2.5],
    fontSize: typography.size.base,
    fontFamily: typography.mono,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[2],
  },
});
