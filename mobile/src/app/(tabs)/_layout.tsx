// src/app/(tabs)/_layout.tsx
//
// Four-tab bottom navigator. Default landing is Roadmap (the active
// roadmap viewer). Sessions is the history + starting point. Tools
// exposes the three standalone tools. Settings is account + prefs.

import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, LayoutGrid, Wrench, Settings } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { typography, spacing, iconSize } from '@/constants/theme';

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
      {/* 1 · Roadmap (default) — the active roadmap viewer */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Roadmap',
          tabBarIcon: ({ color }) => <Home size={iconSize.lg} color={color} />,
        }}
      />
      {/* 2 · Sessions — history + starting point */}
      <Tabs.Screen
        name="sessions"
        options={{
          title: 'Sessions',
          tabBarIcon: ({ color }) => <LayoutGrid size={iconSize.lg} color={color} />,
        }}
      />
      {/* 3 · Tools — Coach, Composer, Research (standalone) */}
      <Tabs.Screen
        name="tools"
        options={{
          title: 'Tools',
          tabBarIcon: ({ color }) => <Wrench size={iconSize.lg} color={color} />,
        }}
      />
      {/* 4 · Settings — account, prefs, sign out */}
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Settings size={iconSize.lg} color={color} />,
        }}
      />
    </Tabs>
  );
}
