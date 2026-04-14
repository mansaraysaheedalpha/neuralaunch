// src/app/(tabs)/settings.tsx
//
// Settings tab (replaces the old Profile tab). Account identity card,
// navigation to past work, training-data consent, notification
// preferences, and sign-out.

import { useState, useEffect } from 'react';
import { View, Switch, StyleSheet, Alert, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Sparkles, FileCheck, Bell, ChevronRight } from 'lucide-react-native';
import { useAuth } from '@/services/auth';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import { Text, Button, Card, Separator, ScreenContainer } from '@/components/ui';
import { spacing, iconSize } from '@/constants/theme';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { colors: c } = useTheme();
  const router = useRouter();

  const [consent, setConsent]       = useState(false);
  const [consentLoading, setConsentLoading] = useState(true);
  const [nudgeEnabled, setNudgeEnabled] = useState(true);

  // Load current consent state
  useEffect(() => {
    async function load() {
      try {
        const data = await api<{ consent: boolean }>('/api/user/training-consent');
        setConsent(data.consent);
      } catch { /* default false */ }
      setConsentLoading(false);
    }
    void load();
  }, []);

  async function handleConsentToggle(value: boolean) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const previous = consent;
    setConsent(value);
    try {
      await api('/api/user/training-consent', {
        method: 'PATCH',
        body: { consent: value },
      });
      if (!value) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      setConsent(previous);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  async function handleNudgeToggle(value: boolean) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const previous = nudgeEnabled;
    setNudgeEnabled(value);
    try {
      await api('/api/user/push-preferences', {
        method: 'PATCH',
        body: { nudgesEnabled: value },
      });
    } catch {
      setNudgeEnabled(previous);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  function handleSignOut() {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => { void signOut(); },
        },
      ],
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="caption" color={c.mutedForeground}>Account & preferences</Text>
        <Text variant="heading">Settings</Text>
      </View>

      {/* User card */}
      <Card style={styles.userCard}>
        <View style={styles.avatarRow}>
          <View style={[styles.avatar, { backgroundColor: c.primaryAlpha10 }]}>
            <Text variant="title" color={c.primary}>
              {(user?.name?.[0] ?? 'F').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="title">{user?.name ?? 'Founder'}</Text>
            <Text variant="caption" color={c.mutedForeground}>
              {user?.email ?? ''}
            </Text>
          </View>
        </View>
      </Card>

      {/* Your work navigation */}
      <View style={styles.section}>
        <Text variant="overline" color={c.mutedForeground}>Your work</Text>
        <Card noPadding>
          <NavRow
            icon={Sparkles}
            label="Past recommendations"
            onPress={() => router.push('/recommendations')}
            colors={c}
          />
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <NavRow
            icon={FileCheck}
            label="Validation pages"
            onPress={() => router.push('/validation')}
            colors={c}
          />
        </Card>
      </View>

      {/* Notifications */}
      <View style={styles.section}>
        <Text variant="overline" color={c.mutedForeground}>Notifications</Text>
        <Card>
          <View style={styles.toggleRow}>
            <Bell size={iconSize.md} color={c.mutedForeground} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text variant="label">Task nudges</Text>
              <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                When a task has been in progress longer than expected, we'll send a push asking how it went.
              </Text>
            </View>
            <Switch
              value={nudgeEnabled}
              onValueChange={handleNudgeToggle}
              trackColor={{ false: c.muted, true: c.primaryAlpha20 }}
              thumbColor={nudgeEnabled ? c.primary : c.mutedForeground}
            />
          </View>
        </Card>
      </View>

      {/* Privacy / training consent */}
      <View style={styles.section}>
        <Text variant="overline" color={c.mutedForeground}>Privacy</Text>
        <Card>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text variant="label">Training data consent</Text>
              <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                Allow your anonymised outcomes to improve NeuraLaunch
                for future founders. Revoking deletes all previously
                stored training data immediately.
              </Text>
            </View>
            <Switch
              value={consent}
              onValueChange={handleConsentToggle}
              disabled={consentLoading}
              trackColor={{ false: c.muted, true: c.primaryAlpha20 }}
              thumbColor={consent ? c.primary : c.mutedForeground}
            />
          </View>
        </Card>
      </View>

      <Separator />

      {/* Sign out */}
      <Button
        title="Sign out"
        onPress={handleSignOut}
        variant="ghost"
        fullWidth
      />

      <Text variant="caption" color={c.mutedForeground} align="center" style={{ marginTop: spacing[4] }}>
        NeuraLaunch v1.0.0
      </Text>
    </ScreenContainer>
  );
}

function NavRow({
  icon: Icon,
  label,
  onPress,
  colors: c,
}: {
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  onPress: () => void;
  colors: Record<string, string>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [navStyles.row, pressed && { opacity: 0.6 }]}
    >
      {Icon && <Icon size={iconSize.md} color={c.mutedForeground} />}
      <Text variant="label" color={c.foreground} style={navStyles.label}>
        {label}
      </Text>
      <ChevronRight size={iconSize.md} color={c.mutedForeground} />
    </Pressable>
  );
}

const navStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3.5],
  },
  label: {
    flex: 1,
  },
});

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
  },
  userCard: {
    marginBottom: spacing[6],
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  divider: {
    height: 1,
  },
});
