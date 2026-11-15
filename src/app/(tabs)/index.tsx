import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Avatar, AvatarStack, Card, EmptyState, Icon, IconButton, Screen, SectionHeader, SkeletonList, Text } from '@/components/ui';
import { DemoBanner } from '@/components/common/DemoBanner';
import { PlanCard } from '@/components/plans/PlanCard';
import { RecommendationCarousel } from '@/components/recommendations/RecommendationCarousel';
import { RecommendationSheet } from '@/components/recommendations/RecommendationSheet';
import { GroupPickerSheet } from '@/components/common/GroupPickerSheet';
import { useGroups, useNotifications, usePlaces, usePlans, usePreferences } from '@/hooks/data';
import { useSaveToggle } from '@/hooks/useSaveToggle';
import { useShareRecommendation } from '@/hooks/useShareRecommendation';
import { useSession } from '@/state/session';
import { relativeTime } from '@/domain/time';
import type { Recommendation } from '@/types/models';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const { colors } = useTheme();
  const profile = useSession((s) => s.profile);
  const plans = usePlans();
  const groups = useGroups();
  const notifications = useNotifications();
  const prefs = usePreferences();
  const interest = prefs.data?.activities[0];
  const category = interest === 'restaurants' ? 'food' : interest === 'cafes' ? 'cafe' : interest === 'outdoors' ? 'outdoors' : interest === 'movies' ? 'entertainment' : interest === 'gaming' || interest === 'arcades' ? 'games' : interest === 'sports' ? 'sports' : null;
  const places = usePlaces({ category, maxPriceLevel: null });
  const { isSaved, toggle } = useSaveToggle();
  const share = useShareRecommendation();
  const [detail, setDetail] = useState<Recommendation | null>(null);
  const [pickGroup, setPickGroup] = useState(false);
  const [now] = useState(() => Date.now());
  const unread = notifications.data?.filter((n) => !n.readAt).length ?? 0;

  const upcoming = useMemo(
    () => (plans.data ?? []).filter((p) => p.status === 'confirmed' && p.startsAt && new Date(p.endsAt ?? p.startsAt).getTime() > now).sort((a, b) => a.startsAt!.localeCompare(b.startsAt!)),
    [plans.data, now],
  );
  const planning = (plans.data ?? []).filter((p) => p.status === 'planning');

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={plans.isRefetching} onRefresh={() => { plans.refetch(); groups.refetch(); places.refetch(); }} padded={false}>
        <DemoBanner />
        <View style={{ paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => router.push('/(tabs)/profile')}>
              <Avatar name={profile?.displayName || '?'} uri={profile?.avatarUrl} size={44} seed={profile?.id} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="muted">{greeting()},</Text>
              <Text variant="heading">{profile?.displayName || 'friend'} 👋</Text>
            </View>
            <IconButton icon="notifications-outline" label={`Notifications${unread ? `, ${unread} unread` : ''}`} onPress={() => router.push('/notifications')} background={colors.surface} badge={unread} />
          </View>

          <Animated.View entering={FadeInDown.duration(400)}>
            <LinearGradient colors={colors.aiGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ marginTop: 20, borderRadius: radius.xxl, padding: 20, gap: 14, overflow: 'hidden' }}>
              <View style={{ position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.1)' }} />
              <Text variant="title" color="#fff">What are we doing?</Text>
              <Text variant="body" color="rgba(255,255,255,0.88)">Start a plan with friends and let Gather find something everyone’s into.</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable accessibilityRole="button" onPress={() => setPickGroup(true)} style={{ flex: 1, backgroundColor: '#fff', borderRadius: radius.pill, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Icon name="people" size={18} color={colors.primary} />
                  <Text variant="bodyStrong" color={colors.primary}>Start planning</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Ask Gather privately" onPress={() => router.push('/assistant')} style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.pill, height: 46, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="sparkles" size={18} color="#fff" />
                  <Text variant="bodyStrong" color="#fff">Ask Gather</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </Animated.View>

          <SectionHeader title="Upcoming plans" action={plans.data?.length ? 'See all' : undefined} onAction={() => router.push('/(tabs)/plans')} />
          {plans.isLoading ? <SkeletonList rows={2} /> : null}
          {upcoming.slice(0, 2).map((p) => <View key={p.id} style={{ marginBottom: 10 }}><PlanCard plan={p} /></View>)}
          {planning.length ? (
            <Card onPress={() => router.push(`/plan/${planning[0].id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name="hourglass-outline" size={20} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{planning.length} plan{planning.length > 1 ? 's' : ''} still being figured out</Text>
                <Text variant="caption" color="muted">{planning[0].title} — add your availability</Text>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.textSubtle} />
            </Card>
          ) : null}
          {!plans.isLoading && !upcoming.length && !planning.length ? (
            <EmptyState compact icon="calendar-outline" title="Nothing on the calendar" body="Plans you make with friends show up here." />
          ) : null}

          <SectionHeader title="Recent chats" action="All chats" onAction={() => router.push('/(tabs)/chats')} />
          {groups.isLoading ? <SkeletonList rows={2} /> : null}
          {groups.data?.slice(0, 3).map((g) => (
            <Card key={g.id} onPress={() => router.push(`/chat/${g.id}`)} style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={g.name} uri={g.photoUrl} seed={g.id} size={44} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>{g.name}</Text>
                <Text variant="caption" color="muted" numberOfLines={1}>{g.lastMessage ? g.lastMessage.body : 'No messages yet'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                {g.lastMessage ? <Text variant="tiny" color="subtle">{relativeTime(g.lastMessage.createdAt)}</Text> : null}
                <AvatarStack people={g.memberPreview.map((m) => ({ id: m.id, name: m.displayName || m.username || '?', uri: m.avatarUrl }))} size={20} max={3} />
              </View>
            </Card>
          ))}
          {groups.data && !groups.data.length ? (
            <EmptyState compact icon="chatbubbles-outline" title="No group chats yet" body="Create one and invite your friends." action="New group" onAction={() => router.push('/chat/new')} />
          ) : null}

          <SectionHeader title="Ideas for you" action="Explore" onAction={() => router.push('/(tabs)/explore')} />
        </View>
        {places.isLoading ? <View style={{ paddingHorizontal: 20 }}><SkeletonList rows={1} avatar={false} /></View> : null}
        {places.data?.length ? (
          <RecommendationCarousel recs={places.data.slice(0, 8)} inset={20} cardProps={(r) => ({ compact: true, onPress: () => setDetail(r), onSave: () => toggle(r), saved: isSaved(r) })} />
        ) : !places.isLoading ? (
          <View style={{ paddingHorizontal: 20 }}><EmptyState compact icon="compass-outline" title="No ideas yet" body="Place search isn’t connected. Try the private assistant for general ideas." /></View>
        ) : null}
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Card onPress={() => router.push('/assistant')} style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <Avatar name="Gather" ai size={46} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Your private planner</Text>
              <Text variant="caption" color="muted">“Fun things to do this weekend under $20?” — only you can see these chats.</Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.textSubtle} />
          </Card>
        </View>
      </Screen>
      <RecommendationSheet rec={detail} onClose={() => setDetail(null)} onShare={(r) => { setDetail(null); share.open(r); }} />
      {share.sheet}
      <GroupPickerSheet
        visible={pickGroup}
        title="Plan with which group?"
        allowCreate
        onClose={() => setPickGroup(false)}
        onPick={(id) => { setPickGroup(false); router.push(`/chat/${id}`); }}
      />
    </View>
  );
}
