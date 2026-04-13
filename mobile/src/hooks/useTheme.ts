// src/hooks/useTheme.ts
//
// Reactive theme hook that follows the device color scheme and
// exposes the full semantic color token set. Every component
// imports `useTheme()` — never reads palette values directly.

import { useColorScheme } from 'react-native';
import { colors, type ColorScheme } from '@/constants/theme';

export function useTheme() {
  const systemScheme = useColorScheme();
  const scheme: ColorScheme = systemScheme === 'dark' ? 'dark' : 'light';
  return {
    scheme,
    isDark: scheme === 'dark',
    colors: colors(scheme),
  };
}
