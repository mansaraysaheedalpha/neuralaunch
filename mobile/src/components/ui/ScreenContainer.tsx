// src/components/ui/ScreenContainer.tsx
//
// Root container for every screen. Handles safe area insets,
// background color, and the standard scroll/non-scroll layout.

import { View, ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
  /** Use a plain View instead of ScrollView — for screens with their own scroll (e.g. FlatList) */
  scroll?: boolean;
  /** Remove horizontal padding — for edge-to-edge layouts */
  noPadding?: boolean;
  style?: ViewStyle;
}

export function ScreenContainer({
  children,
  scroll = true,
  noPadding = false,
  style,
}: Props) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: c.background,
    paddingTop: insets.top,
    paddingBottom: insets.bottom,
    ...(!noPadding && { paddingHorizontal: spacing[5] }),
  };

  if (!scroll) {
    return <View style={[containerStyle, style]}>{children}</View>;
  }

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: c.background }]}
      contentContainerStyle={[
        styles.scrollContent,
        containerStyle,
        { paddingBottom: insets.bottom + spacing[8] },
        style,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
});
