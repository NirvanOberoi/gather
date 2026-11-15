import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { categoryArt, radius } from '@/theme/tokens';
import { AvatarStack, Card, Icon, Text } from '@/components/ui';
import { formatDateTime } from '@/domain/time';
import type { Plan } from '@/types/models';
import { StatusPill } from './StatusPill';
import { LinearGradient } from 'expo-linear-gradient';

export function PlanCard({ plan, compact }: { plan: Plan; compact?: boolean }) {
  const { colors } = useTheme();
  const art = categoryArt[plan.place?.category ?? 'other'];
  const going = plan.participants.filter((p) => p.rsvp === 'going');
  return (
    <Card onPress={() => router.push(`/plan/${plan.id}`)} accessibilityLabel={`Plan ${plan.title}`} padded={false}>
      <View style={{ flexDirection: 'row', gap: 14, padding: 14, alignItems: 'center' }}>
        <LinearGradient colors={art.colors} style={{ width: 52, height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={art.icon} size={24} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="bodyStrong" numberOfLines={1}>{plan.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="time-outline" size={13} color={colors.textMuted} />
            <Text variant="caption" color="muted" numberOfLines={1}>{plan.startsAt ? formatDateTime(new Date(plan.startsAt).getTime(), plan.timezone) : 'Time TBD'}</Text>
          </View>
          {!compact && (plan.place?.title || plan.locationText) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="location-outline" size={13} color={colors.textMuted} />
              <Text variant="caption" color="muted" numberOfLines={1}>{plan.place?.title ?? plan.locationText}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <StatusPill status={plan.status} />
          {going.length ? <AvatarStack people={going.map((p) => ({ id: p.userId, name: p.profile?.displayName || p.profile?.username || '?', uri: p.profile?.avatarUrl }))} size={22} max={3} /> : null}
        </View>
      </View>
    </Card>
  );
}
