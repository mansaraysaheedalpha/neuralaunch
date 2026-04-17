// src/app/onboarding.tsx
//
// Pre-sign-in onboarding — four swipeable screens that introduce the
// product before the founder hits the auth gate. Once they reach the
// final screen and tap "Start your discovery" or "Sign in", we mark
// the device as onboarded (SecureStore) so they never see this again.
//
// The carousel is a horizontal ScrollView with paging — no third-party
// dependencies, no reanimated. Plain RN Animated handles the dot
// indicator transitions.

import { useRef, useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  Sparkles,
  MessageSquare,
  MessagesSquare,
  Send,
  Search,
} from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Button } from '@/components/ui';
import { spacing, radius, iconSize } from '@/constants/theme';
import { markOnboardingComplete } from '@/services/onboarding';

const SLIDE_COUNT = 4;

export default function OnboardingScreen() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== page) {
      setPage(next);
      void Haptics.selectionAsync();
    }
  }

  function goToSlide(i: number) {
    scrollRef.current?.scrollTo({ x: width * i, animated: true });
  }

  async function finish(intent: 'discovery' | 'sign-in') {
    await markOnboardingComplete();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Either path lands at /sign-in first (auth required); after sign-in,
    // /discovery will be the natural next step from the Sessions tab.
    // We send everyone to /sign-in here — a polished post-auth router
    // can deep-link to /discovery if they came in via the CTA later.
    router.replace('/sign-in');
  }

  const lastPage = page === SLIDE_COUNT - 1;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
        >
          {/* Slide 1 — brand promise */}
          <Slide width={width} insetsTop={insets.top}>
            <View style={[styles.logoBadge, { backgroundColor: c.primaryAlpha10 }]}>
              <Text variant="heading" color={c.primary}>NL</Text>
            </View>
            <Text variant="heading" align="center" style={styles.title}>
              You know something needs to change.
            </Text>
            <Text
              variant="body"
              color={c.mutedForeground}
              align="center"
              style={styles.subtitle}
            >
              NeuraLaunch helps you figure out exactly what — and then helps you do it.
            </Text>
          </Slide>

          {/* Slide 2 — interview + one recommendation */}
          <Slide width={width} insetsTop={insets.top}>
            <View style={[styles.iconBadge, { backgroundColor: c.primaryAlpha10 }]}>
              <MessagesSquare size={36} color={c.primary} />
            </View>
            <Text variant="heading" align="center" style={styles.title}>
              It starts with a conversation.
            </Text>
            <Text
              variant="body"
              color={c.mutedForeground}
              align="center"
              style={styles.subtitle}
            >
              No forms, no quizzes — just questions that matter, asked in the right order. We listen until we understand.
            </Text>
            <View style={[styles.recommendationCallout, { backgroundColor: c.secondaryAlpha10, borderColor: c.secondary }]}>
              <Sparkles size={iconSize.sm} color={c.secondary} />
              <Text
                variant="caption"
                color={c.foreground}
                style={{ flex: 1, marginLeft: spacing[2] }}
              >
                Then we commit to <Text color={c.secondary} variant="caption">one</Text> recommendation — the right one for you, defended with reasoning.
              </Text>
            </View>
          </Slide>

          {/* Slide 3 — the three tools */}
          <Slide width={width} insetsTop={insets.top}>
            <View style={styles.toolsRow}>
              <ToolBadge icon={MessageSquare} color={c.primary} bg={c.primaryAlpha10} />
              <ToolBadge icon={Send}          color={c.secondary} bg={c.secondaryAlpha10} />
              <ToolBadge icon={Search}        color={c.success}   bg={c.successMuted} />
            </View>
            <Text variant="heading" align="center" style={styles.title}>
              Tools that do the work with you.
            </Text>
            <View style={styles.toolList}>
              <ToolRow color={c.primary}   label="Conversation Coach" copy="Rehearse the pitch, the ask, the negotiation — before it matters." />
              <ToolRow color={c.secondary} label="Outreach Composer"  copy="Ready-to-send messages for WhatsApp, email, and LinkedIn." />
              <ToolRow color={c.success}   label="Research Tool"      copy="Find the people, the prices, the regulations — with sources." />
            </View>
          </Slide>

          {/* Slide 4 — call to action */}
          <Slide width={width} insetsTop={insets.top}>
            <Text variant="heading" align="center" style={[styles.title, { marginTop: spacing[10] }]}>
              Ready?
            </Text>
            <Text
              variant="body"
              color={c.mutedForeground}
              align="center"
              style={styles.subtitle}
            >
              Your first interview and first recommendation are free.
              {'\n'}No credit card required.
            </Text>
            <View style={styles.ctaStack}>
              <Button
                title="Start your discovery"
                onPress={() => { void finish('discovery'); }}
                size="lg"
                fullWidth
              />
              <Button
                title="I already have an account — sign in"
                onPress={() => { void finish('sign-in'); }}
                variant="ghost"
                size="md"
                fullWidth
              />
            </View>
          </Slide>
        </ScrollView>

        {/* Footer: dots + skip */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing[4] }]}>
          <View style={styles.dots}>
            {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === page ? c.primary : c.muted,
                    width: i === page ? 24 : 8,
                  },
                ]}
              />
            ))}
          </View>
          {!lastPage && (
            <Pressable
              onPress={() => goToSlide(SLIDE_COUNT - 1)}
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.skipButton}
            >
              <Text variant="caption" color={c.mutedForeground}>
                Skip
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Slide layout primitive — keeps every slide consistent
// ---------------------------------------------------------------------------

function Slide({
  width,
  insetsTop,
  children,
}: {
  width: number;
  insetsTop: number;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.slide, { width, paddingTop: insetsTop + spacing[8] }]}>
      {children}
    </View>
  );
}

function ToolBadge({
  icon: Icon,
  color,
  bg,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color: string;
  bg: string;
}) {
  return (
    <View style={[styles.toolBadge, { backgroundColor: bg }]}>
      <Icon size={28} color={color} />
    </View>
  );
}

function ToolRow({ color, label, copy }: { color: string; label: string; copy: string }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.toolRow}>
      <View style={[styles.toolBullet, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text variant="label" color={color}>{label}</Text>
        <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[0.5] }}>
          {copy}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  slide: {
    flex: 1,
    paddingHorizontal: spacing[6],
    alignItems: 'center',
  },
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[8],
  },
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[6],
  },
  title: {
    marginBottom: spacing[3],
    maxWidth: 320,
  },
  subtitle: {
    maxWidth: 340,
    marginBottom: spacing[6],
  },
  recommendationCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    maxWidth: 360,
    marginTop: spacing[4],
  },
  toolsRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[6],
  },
  toolBadge: {
    width: 60,
    height: 60,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolList: {
    width: '100%',
    gap: spacing[4],
    marginTop: spacing[4],
    paddingHorizontal: spacing[2],
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  toolBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  ctaStack: {
    width: '100%',
    gap: spacing[3],
    marginTop: spacing[8],
    paddingHorizontal: spacing[2],
  },
  footer: {
    paddingHorizontal: spacing[6],
    paddingTop: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: {
    flexDirection: 'row',
    gap: spacing[1.5],
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  skipButton: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
});
