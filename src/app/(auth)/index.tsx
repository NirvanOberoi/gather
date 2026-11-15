import React, { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Avatar, Button, Icon, Notice, Text } from '@/components/ui';
import { useSession } from '@/state/session';
import { isLiveConfigured } from '@/services/backend';
import { toast } from '@/state/toast';

function Bubble({ name, text, delay, right }: { name: string; text: string; delay: number; right?: boolean }) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).springify()} style={{ flexDirection: 'row', gap: 8, alignSelf: right ? 'flex-end' : 'flex-start', alignItems: 'flex-end' }}>
      {!right ? <Avatar name={name} size={26} /> : null}
      <View style={{ backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderBottomLeftRadius: right ? 16 : 4, borderBottomRightRadius: right ? 4 : 16 }}>
        <Text variant="caption" color="#fff">{text}</Text>
      </View>
    </Animated.View>
  );
}

export default function Welcome() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const startDemo = useSession((s) => s.startDemo);
  const switchToLive = useSession((s) => s.switchToLive);
  const notice = useSession((s) => s.notice);
  const [loading, setLoading] = useState(false);

  const demo = async () => {
    setLoading(true);
    try {
      await startDemo();
    } catch (e) {
      toast.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient colors={['#2E24A8', '#5145E0', '#2F80FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top + 24, paddingHorizontal: 24, paddingBottom: 36, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, minHeight: height * 0.52 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkles" size={22} color="#fff" />
          </View>
          <Text variant="title" color="#fff">Gather</Text>
        </View>
        <View style={{ gap: 10, marginTop: 28 }}>
          <Bubble name="Maya" text="I want to get food 🌮" delay={150} />
          <Bubble name="Jordan" text="something active!" delay={450} />
          <Bubble name="Priya" text="nothing over $20 pls" delay={750} />
          <Animated.View entering={FadeInUp.delay(1100).springify()} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <Avatar name="Gather" ai size={26} />
            <View style={{ backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 16, borderBottomLeftRadius: 4, maxWidth: '85%' }}>
              <Text variant="caption" color={colors.primary} style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}>Bowling, then tacos nearby? Both under $20. Want to vote? 🗳️</Text>
            </View>
          </Animated.View>
        </View>
      </LinearGradient>

      <Animated.View entering={FadeInDown.delay(250)} style={{ flex: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: insets.bottom + 20, gap: 14 }}>
        <Text variant="display">Less planning.{'\n'}More doing.</Text>
        <Text variant="body" color="muted">Group chats with an AI planner that finds what works for everyone — budgets, schedules and all.</Text>
        {notice ? <Notice text={notice} tone="warning" /> : null}
        <View style={{ flex: 1 }} />
        {isLiveConfigured ? (
          <>
            <Button title="Create account" size="lg" onPress={async () => { await switchToLive(); router.push('/(auth)/sign-up'); }} full />
            <Button title="I already have an account" size="lg" variant="secondary" onPress={async () => { await switchToLive(); router.push('/(auth)/sign-in'); }} full />
            <Button title="Explore the demo" variant="ghost" icon="flask-outline" onPress={demo} loading={loading} full />
          </>
        ) : (
          <>
            <Button title="Explore the demo" size="lg" variant="ai" icon="sparkles" onPress={demo} loading={loading} full testID="start-demo" />
            <Text variant="caption" color="subtle" align="center">
              Accounts are off because no Supabase project is configured. The demo uses clearly-labelled sample people and places, stored only on this device.
            </Text>
          </>
        )}
        <View style={{ height: 4, borderRadius: radius.pill }} />
      </Animated.View>
    </View>
  );
}
