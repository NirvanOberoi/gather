import React from 'react';
import { Platform, View } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';
import { Icon, type IconName } from '@/components/ui';
import { useGroups, useUserRealtime } from '@/hooks/data';

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['home', 'home-outline'],
  chats: ['chatbubbles', 'chatbubbles-outline'],
  explore: ['compass', 'compass-outline'],
  plans: ['calendar', 'calendar-outline'],
  profile: ['person-circle', 'person-circle-outline'],
};

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  useUserRealtime();
  const { data: groups } = useGroups();
  const unread = groups?.reduce((n, g) => n + (g.muted ? 0 : g.unreadCount), 0) ?? 0;
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          height: 62 + (Platform.OS === 'web' ? 8 : insets.bottom),
          paddingTop: 6,
        },
        tabBarIcon: ({ focused, color }) => (
          <View style={{ alignItems: 'center' }}>
            <Icon name={ICONS[route.name]?.[focused ? 0 : 1] ?? 'ellipse'} size={24} color={String(color)} />
          </View>
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarBadge: unread ? (unread > 9 ? '9+' : unread) : undefined, tabBarBadgeStyle: { backgroundColor: colors.danger, fontFamily: fonts.bold, fontSize: 10 } }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
      <Tabs.Screen name="plans" options={{ title: 'Plans' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
