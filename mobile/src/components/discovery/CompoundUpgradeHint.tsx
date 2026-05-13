// src/components/discovery/CompoundUpgradeHint.tsx
//
// Mobile counterpart to
// client/src/app/(app)/discovery/CompoundUpgradeHint.tsx.
//
// Surfaced on the discovery archetype picker when an Execute-tier
// founder is about to start a new discovery session AND already has
// at least one paused or completed venture. The signal is fetched
// from /api/user/compound-hint-signal — the server encapsulates the
// "execute + ≥1 non-active venture" check so the mobile bundle stays
// thin.
//
// Dismissal lives in module-level state (an in-memory subscriber set
// + useSyncExternalStore). This mirrors the web's per-tab
// sessionStorage semantics: dismissal lasts until the app process is
// killed and re-launched, at which point the hint can re-appear so
// the founder doesn't permanently lose the upgrade prompt.
//
// "See Compound" opens the marketing pricing page in the in-app
// browser — Apple/Google's in-app subscription policies make a
// native checkout an entirely separate sprint (matches the existing
// BillingSection's "Manage billing" approach).

import { useEffect, useState, useSyncExternalStore } from 'react';
import { View, StyleSheet, Pressable, Linking } from 'react-native';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Sparkles, X } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import { Text, Button } from '@/components/ui';
import { spacing, iconSize, radius } from '@/constants/theme';

// ---------- Per-app-session dismissal store ---------------------------------

const subscribers = new Set<() => void>();
let dismissedSnapshot = false;

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}
function getDismissedSnapshot(): boolean {
  return dismissedSnapshot;
}
function dismissNow() {
  if (dismissedSnapshot) return;
  dismissedSnapshot = true;
  for (const fn of subscribers) fn();
}

// ---------- Component ------------------------------------------------------

interface Props {
  /** True when the founder has a resumable session — the web hides
   *  the hint in that branch too (line 150 in discovery/page.tsx).
   *  Callers pass this directly so the hint never competes with a
   *  resumption banner. */
  hasResumableSession?: boolean;
}

export function CompoundUpgradeHint({ hasResumableSession = false }: Props) {
  const { colors: c } = useTheme();
  const dismissed = useSyncExternalStore(subscribe, getDismissedSnapshot, getDismissedSnapshot);
  const [signalLoaded, setSignalLoaded] = useState(false);
  const [shouldShow,   setShouldShow]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (hasResumableSession) {
      setSignalLoaded(true);
      return;
    }
    void (async () => {
      try {
        const data = await api<{ shouldShow: boolean }>('/api/user/compound-hint-signal');
        if (!cancelled) {
          setShouldShow(data.shouldShow);
          setSignalLoaded(true);
        }
      } catch {
        // Signal endpoint failing is non-fatal — the hint just stays
        // hidden. We don't want a transient API failure to break the
        // archetype picker, which is the actual job of this screen.
        if (!cancelled) setSignalLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [hasResumableSession]);

  if (!signalLoaded || !shouldShow || dismissed) return null;

  async function openPricing() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const apiUrl = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? '';
    if (!apiUrl) return;
    try {
      await Linking.openURL(`${apiUrl}/#pricing`);
    } catch { /* best-effort */ }
  }

  return (
    <View
      style={[
        styles.card,
        { borderColor: c.primary, backgroundColor: c.primaryAlpha10 },
      ]}
    >
      <Sparkles size={iconSize.sm} color={c.primary} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text variant="label" color={c.foreground}>
          Starting another direction?
        </Text>
        <Text variant="caption" color={c.foreground} style={{ marginTop: spacing[2] }}>
          You're on Execute — one venture at a time, with up to 2 paused on the side. If
          you keep taking on new directions while old ones sit, Compound runs{' '}
          <Text variant="caption" color={c.foreground} weight="semibold">
            3 ventures in parallel
          </Text>
          {' '}with shared learning across them, so each new cycle gets sharper from what
          the others taught.
        </Text>
        <View style={styles.actions}>
          <Button
            title="See Compound"
            onPress={() => { void openPricing(); }}
            variant="primary"
            size="sm"
          />
          <Pressable onPress={dismissNow} hitSlop={6}>
            <Text variant="caption" color={c.mutedForeground} style={styles.dismissText}>
              Continue with Execute
            </Text>
          </Pressable>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss upgrade hint"
        onPress={dismissNow}
        hitSlop={8}
        style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
      >
        <X size={iconSize.sm} color={c.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    padding: spacing[4],
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: spacing[4],
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginTop: spacing[3],
  },
  dismissText: {
    textDecorationLine: 'underline',
  },
  closeBtn: {
    padding: spacing[1],
  },
});
