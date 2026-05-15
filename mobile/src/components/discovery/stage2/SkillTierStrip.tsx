// src/components/discovery/stage2/SkillTierStrip.tsx
//
// Single skill row on the Stage 2 SkillCanvas:
//
//   [ Skill name (left) ]   [ tier strip with draggable pill (right) ]
//
// The tier strip is a 4-segment track (unknown | bad | acceptable | good).
// Two complementary interactions:
//
//   - TAP   — any of the 4 tier positions is tappable; tapping snaps
//             the pill there and fires onTierChange.
//   - DRAG  — long-press-grip on the pill (or just press-and-drag) lets
//             the founder slide the pill across the track. Reanimated
//             worklets handle the live motion; on release the pill
//             snaps to the nearest tier and fires onTierChange if the
//             tier actually changed.
//
// Both interactions live in user-space gestures (gesture-handler v2's
// Gesture.Tap / Gesture.Pan). PanGesture.activeOffsetX([-6, 6]) means
// vertical scroll of the parent ScrollView is unaffected — the pan
// only activates after the founder has moved at least 6dp horizontally.
//
// Disabled state (e.g. while a network write is pending) shows the
// strip at reduced opacity and ignores all gestures.

import { useEffect } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui';
import type { SkillTier } from '@/lib/ideation-types';
import { TIER_LABEL, TIER_ORDER } from './labels';
import { spacing, radius } from '@/constants/theme';

// Reanimated has no built-in "AnimatedPressable" — we need an Animated
// View wrapping a Pressable for the segment hit areas. But the pill is
// just an Animated View driven by the shared value.

interface SkillTierStripProps {
  skillLabel: string;
  /** The current tier (server-authoritative — the strip reflects
   *  this and does not own its own state aside from the visual
   *  position during gesture). */
  tier: SkillTier;
  /** Called after either a tap or a drag-release lands the pill on a
   *  new tier. Identical-tier writes are suppressed by the strip — the
   *  parent only sees genuine changes. */
  onTierChange: (next: SkillTier) => void;
  /** When true, gestures are ignored and the strip dims. Use during
   *  in-flight server writes so the founder doesn't fire a race. */
  disabled?: boolean;
}

// Strip + pill geometry. The strip is full-width inside its parent; the
// pill width is one-quarter of the strip width and rides at the
// matching tier index. Indices come from TIER_ORDER (left = unknown,
// right = good).
const SEGMENTS = TIER_ORDER.length;

export function SkillTierStrip({
  skillLabel,
  tier,
  onTierChange,
  disabled = false,
}: SkillTierStripProps) {
  const { colors: c } = useTheme();
  // Live track width — set on layout. translateX of the pill is computed
  // against this so the strip remains responsive to parent resize.
  const trackWidth = useSharedValue(0);
  // Pill position as fraction in [0, SEGMENTS - 1]. Tap → animate to
  // target index; drag → set directly to live fraction.
  const indexFraction = useSharedValue(TIER_ORDER.indexOf(tier));

  // Sync external tier prop into the pill position whenever the server
  // pushes a new value (e.g. after a chat turn the agent updates the
  // tier). Spring-in to feel like the agent "moved" the chip.
  useEffect(() => {
    const targetIndex = TIER_ORDER.indexOf(tier);
    if (targetIndex < 0) return;
    indexFraction.value = withSpring(targetIndex, { damping: 18, stiffness: 240 });
  }, [tier, indexFraction]);

  const pillStyle = useAnimatedStyle(() => {
    const segmentWidth = trackWidth.value / SEGMENTS;
    return {
      width: segmentWidth,
      transform: [{ translateX: indexFraction.value * segmentWidth }],
    };
  });

  // Tap on a segment → snap to that index. The hit area is the full
  // segment; we use Pressable per segment because TapGesture cannot
  // easily distinguish which segment received the tap without extra
  // hit-detection plumbing.
  const handleSegmentTap = (index: number) => {
    if (disabled) return;
    const next = TIER_ORDER[index];
    if (!next || next === tier) return;
    void Haptics.selectionAsync();
    indexFraction.value = withSpring(index, { damping: 16, stiffness: 220 });
    onTierChange(next);
  };

  // Pan gesture on the pill. activeOffsetX gates the gesture so it
  // only steals the touch after ~6dp of horizontal movement; below
  // that threshold the parent ScrollView keeps the touch and the
  // founder can still scroll vertically through the canvas.
  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onChange(e => {
      'worklet';
      const segmentWidth = trackWidth.value / SEGMENTS;
      if (segmentWidth <= 0) return;
      const delta = e.changeX / segmentWidth;
      const next = Math.max(0, Math.min(SEGMENTS - 1, indexFraction.value + delta));
      indexFraction.value = next;
    })
    .onEnd(() => {
      'worklet';
      const snapped = Math.round(indexFraction.value);
      indexFraction.value = withTiming(snapped, { duration: 140 });
      const nextTier = TIER_ORDER[snapped];
      const prevTier = tier;
      if (nextTier && nextTier !== prevTier) {
        runOnJS(Haptics.selectionAsync)();
        runOnJS(onTierChange)(nextTier);
      }
    });

  // Color treatment: pill background reflects the active tier so the
  // founder gets reinforcement that the strip's intent maps to the
  // tier semantics (good = primary, bad = destructive, etc.).
  const pillColor = tierToPillColor(tier, c);

  return (
    <View style={[styles.row, disabled && { opacity: 0.5 }]}>
      <Text variant="label" style={styles.skillName} numberOfLines={1}>
        {skillLabel}
      </Text>

      <View
        style={[styles.track, { backgroundColor: c.muted, borderColor: c.border }]}
        onLayout={e => {
          trackWidth.value = e.nativeEvent.layout.width;
        }}
      >
        {/* Segment hit areas — tap to jump */}
        {TIER_ORDER.map((seg, idx) => (
          <Pressable
            key={seg}
            accessibilityRole="button"
            accessibilityLabel={`Set ${skillLabel} to ${TIER_LABEL[seg]}`}
            accessibilityState={{ selected: tier === seg, disabled }}
            disabled={disabled}
            onPress={() => handleSegmentTap(idx)}
            style={styles.segment}
          >
            <Text
              variant="caption"
              color={tier === seg ? c.foreground : c.mutedForeground}
              numberOfLines={1}
              style={styles.segmentLabel}
            >
              {TIER_LABEL[seg]}
            </Text>
          </Pressable>
        ))}

        {/* The draggable pill — sits absolutely on top of the segments */}
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.pill,
              pillStyle,
              {
                backgroundColor: pillColor.background,
                borderColor:     pillColor.border,
              },
            ]}
          />
        </GestureDetector>
      </View>
    </View>
  );
}

function tierToPillColor(
  tier: SkillTier,
  c: ReturnType<typeof useTheme>['colors'],
): { background: string; border: string } {
  switch (tier) {
    case 'good':       return { background: c.primaryAlpha20, border: c.primary };
    case 'acceptable': return { background: c.secondaryAlpha20, border: c.secondary };
    case 'bad':        return { background: c.destructiveMuted, border: c.destructive };
    case 'unknown':
    default:           return { background: c.card, border: c.border };
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[2],
  },
  skillName: {
    width: 132,
  },
  track: {
    flex: 1,
    height: 36,
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[1],
  },
  segmentLabel: {
    fontSize: 10,
  },
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderWidth: 2,
    borderRadius: radius.md,
  },
});
