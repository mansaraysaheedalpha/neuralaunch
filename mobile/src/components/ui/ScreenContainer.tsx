// src/components/ui/ScreenContainer.tsx
//
// Root container for every screen. Handles safe area insets,
// background color, and the standard scroll/non-scroll layout.

import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
  /** Use a plain View instead of ScrollView — for screens with their own scroll (e.g. FlatList) */
  scroll?: boolean;
  /** Remove horizontal padding — for edge-to-edge layouts */
  noPadding?: boolean;
  /** When set alongside onRefresh, shows the pull-to-refresh spinner. */
  refreshing?: boolean;
  /** Called when the user pulls down to refresh. */
  onRefresh?: () => void;
  /** Wrap contents in a KeyboardAvoidingView — for screens with form inputs. */
  keyboardAvoid?: boolean;
  style?: ViewStyle;
}

export function ScreenContainer({
  children,
  scroll = true,
  noPadding = false,
  refreshing,
  onRefresh,
  keyboardAvoid = false,
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

  let body: React.ReactNode;
  if (!scroll) {
    body = <View style={[containerStyle, style]}>{children}</View>;
  } else {
    body = (
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
        refreshControl={
          onRefresh
            ? (
              <RefreshControl
                refreshing={refreshing ?? false}
                onRefresh={onRefresh}
                tintColor={c.primary}
                colors={[c.primary]}
              />
            )
            : undefined
        }
      >
        {children}
      </ScrollView>
    );
  }

  if (keyboardAvoid) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: c.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {body}
      </KeyboardAvoidingView>
    );
  }

  return body;
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
});
