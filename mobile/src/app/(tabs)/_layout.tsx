// src/app/(tabs)/_layout.tsx
//
// Tab navigator — the primary navigation surface. Four tabs that
// map to the core product surfaces. Icons are Unicode symbols for
// now — swap for a proper icon library (lucide-react-native) in
// the polish pass.

import { Tabs } from 'expo-router';
import { View, StyleSheet, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { typography, spacing, radius } from '@/constants/theme';

export default function TabLayout() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();

  const labelStyle: TextStyle = {
    fontSize: typography.size['2xs'],
    fontWeight: typography.weight.medium,
    letterSpacing: 0.3,
  };

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
          paddingTop: spacing[2],
          height: 60 + (insets.bottom > 0 ? insets.bottom : spacing[2]),
        },
        tabBarLabelStyle: labelStyle,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabIcon label="⊕" color={color} />,
        }}
      />
      <Tabs.Screen
        name="roadmap"
        options={{
          title: 'Roadmap',
          tabBarIcon: ({ color }) => <TabIcon label="☰" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: 'Tools',
          tabBarIcon: ({ color }) => <TabIcon label="⚡" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon label="●" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ label, color }: { label: string; color: string }) {
  return (
    <View style={styles.iconContainer}>
      <View style={[styles.iconText]}>
        <View>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <View>
              <View style={{ fontSize: 20, color } as any}>
                {/* Placeholder — replace with lucide-react-native icons */}
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
  },
  iconText: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
