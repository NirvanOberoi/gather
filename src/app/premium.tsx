import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Button, Card, Header, Icon, Notice, Pill, Screen, Text } from '@/components/ui';
import { useAiUsage, useSubscription, qk } from '@/hooks/data';
import { backend } from '@/services/backend';
import { toast } from '@/state/toast';
import { DEFAULT_RATE_LIMITS } from '@shared/safety.ts';
import { PREMIUM_FEATURES } from '@/features/premium/features';

export default function Premium() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const sub = useSubscription();
  const usage = useAiUsage();
  const onWaitlist = sub.data?.status === 'waitlist';
  return (
    <Screen>
      <Header title="" />
      <LinearGradient colors={colors.aiGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xxl, padding: 24, gap: 10 }}>
        <Icon name="diamond" size={30} color="#fff" />
        <Text variant="title" color="#fff">Gather Plus</Text>
        <Text variant="body" color="rgba(255,255,255,0.9)">For the friend who always ends up planning everything.</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
          <Text variant="display" color="#fff">$3.99</Text>
          <Text variant="body" color="rgba(255,255,255,0.85)">/ month (planned)</Text>
        </View>
      </LinearGradient>

      <View style={{ gap: 10, marginTop: 20 }}>
        {PREMIUM_FEATURES.map((f) => (
          <Card key={f.title} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={f.icon} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text variant="bodyStrong">{f.title}</Text>
                <Pill label={f.status === 'available' ? 'Ready' : 'Coming soon'} tone={f.status === 'available' ? 'success' : 'neutral'} />
              </View>
              <Text variant="caption" color="muted">{f.body}</Text>
            </View>
          </Card>
        ))}
      </View>

      <Card style={{ marginTop: 16, gap: 6 }}>
        <Text variant="bodyStrong">Free vs Plus</Text>
        <Text variant="caption" color="muted">Free: messaging, friends, polls, availability, plans and {DEFAULT_RATE_LIMITS.dailyLimit.free} AI requests/day.</Text>
        <Text variant="caption" color="muted">Plus: {DEFAULT_RATE_LIMITS.dailyLimit.premium} AI requests/day and the features above.</Text>
        {usage.data ? <Text variant="caption" color="primary">You’ve used {usage.data.usedToday} of {usage.data.dailyLimit} today.</Text> : null}
      </Card>

      <View style={{ marginTop: 18, gap: 10 }}>
        <Notice text="Subscriptions aren’t on sale yet. When they launch they’ll be billed through the App Store or Google Play — Gather will never ask for card details in the app." />
        <Button
          title={onWaitlist ? 'You’re on the waitlist ✓' : 'Notify me when Plus launches'}
          variant={onWaitlist ? 'secondary' : 'ai'}
          size="lg"
          disabled={onWaitlist}
          onPress={async () => {
            try {
              await backend().subscription.joinWaitlist();
              qc.invalidateQueries({ queryKey: qk.subscription });
              toast.success('We’ll let you know!');
            } catch (e) { toast.error(e); }
          }}
          full
        />
        <Text variant="tiny" color="subtle" align="center">$3.99/month is an early pricing hypothesis and may change before launch.</Text>
      </View>
    </Screen>
  );
}
