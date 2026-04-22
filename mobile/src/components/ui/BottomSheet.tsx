// src/components/ui/BottomSheet.tsx
//
// Platform-idiomatic bottom sheet for contextual actions — used for
// status changes, confirmations, and short secondary flows. Renders via
// React Native's built-in Modal so it sits above everything without
// requiring a root-level provider. Drag-to-dismiss, backdrop-tap, and
// hardware back button all close the sheet.
//
// Expo Go compatible. Uses PanResponder instead of gesture-handler so
// the sheet has no native dependency beyond what Modal already pulls.

import { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Pressable,
  Animated,
  Dimensions,
  StyleSheet,
  PanResponder,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';
import { animation, radius, spacing } from '@/constants/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;
// How far the user must drag down before release to commit to dismiss.
const DISMISS_THRESHOLD = 120;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Optional sheet title rendered at the top under the handle. */
  title?: string;
  children: React.ReactNode;
  /** Additional style applied to the sheet container (e.g. custom padding). */
  contentStyle?: ViewStyle;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  contentStyle,
}: Props) {
  const { colors: c, shadows: s } = useTheme();
  const insets = useSafeAreaInsets();

  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  // Animate in/out whenever `visible` flips. Opening uses a spring for
  // the natural settle; closing uses timing so it feels decisive.
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          friction: 10,
          tension: 90,
        }),
        Animated.timing(backdrop, {
          toValue: 1,
          duration: animation.fast,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: animation.fast,
          useNativeDriver: true,
        }),
        Animated.timing(backdrop, {
          toValue: 0,
          duration: animation.fast,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, backdrop]);

  // Drag-to-dismiss: only responds to downward drags, snaps back on
  // small drags, commits to close above the threshold.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DISMISS_THRESHOLD) {
          onClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            friction: 10,
            tension: 120,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop — fades in with the sheet; tapping it dismisses. */}
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss sheet"
        />
      </Animated.View>

      {/* Sheet — slides up from the bottom. */}
      <Animated.View
        style={[
          styles.sheet,
          s.lg,
          {
            backgroundColor: c.card,
            paddingBottom: insets.bottom + spacing[4],
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={styles.handleRow}>
          <View style={[styles.handle, { backgroundColor: c.border }]} />
        </View>

        {title && (
          <Text variant="label" color={c.foreground} style={styles.title}>
            {title}
          </Text>
        )}

        <View style={[styles.content, contentStyle]}>{children}</View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing[2],
  },
  handleRow: {
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  title: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[1],
  },
});
