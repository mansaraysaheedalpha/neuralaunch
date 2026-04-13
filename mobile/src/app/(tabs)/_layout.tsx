// src/app/(tabs)/_layout.tsx
//
// Tab navigator with Lucide icons.

import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Map, Zap, User } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { typography, spacing } from '@/constants/theme';

export default function TabLayout() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.mutedForeground,
        tabBarStyle: {
          backgroundColor: c.card,
          borderTopColor: c.border,
          borderTopWidth: 1,
          paddingBottom: insets.bottom > 0 ? insets.bottom : spacing[2],
          paddingTop: spacing[1.5],
          height: 56 + (insets.bottom > 0 ? insets.bottom : spacing[2]),
        },
        tabBarLabelStyle: {
          fontSize: typography.size['2xs'],
          fontWeight: typography.weight.medium,
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="roadmap"
        options={{
          title: 'Roadmap',
          tabBarIcon: ({ color, size }) => <Map size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: 'Tools',
          tabBarIcon: ({ color, size }) => <Zap size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={size ?? 22} color={color} />,
        }}
      />
    </Tabs>
  );
}
