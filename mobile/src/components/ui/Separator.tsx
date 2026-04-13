// src/components/ui/Separator.tsx

import { View, type ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/constants/theme';

interface Props {
  style?: ViewStyle;
}

export function Separator({ style }: Props) {
  const { colors: c } = useTheme();
  return (
    <View
      style={[
        { height: 1, backgroundColor: c.border, marginVertical: spacing[4] },
        style,
      ]}
    />
  );
}
