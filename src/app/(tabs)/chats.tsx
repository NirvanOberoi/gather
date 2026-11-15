import React from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Avatar, Card, EmptyState, ErrorState, Icon, IconButton, SkeletonList, Text } from '@/components/ui';
import { DemoBanner } from '@/components/common/DemoBanner';
import { useFriendRequests, useGroups } from '@/hooks/data';
import { relativeTime } from '@/domain/time';
import { useSession } from '@/state/session';
import type { GroupSummary } from '@/types/models';

function preview(g: GroupSummary, meId: string) {
  const m = g.lastMessage;
  if (!m) return 'Say hi 👋';
  if (m.kind === 'ai') return '✨ Gather: ' + m.body;
  if (m.kind === 'poll') return '📊 ' + m.body;
  if (m.kind === 'plan') return '📅 ' + m.body;
  if (m.kind === 'share') return '🔗 ' + m.body;
  return (m.senderId === meId ? 'You: ' : '') + m.body;
}

export default function Chats() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.profile?.id ?? '');
  const groups = useGroups();
  const requests = useFriendRequests();
  const incoming = requests.data?.incoming.length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <DemoBanner />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 }}>
        <Text variant="title" style={{ flex: 1 }} accessibilityRole="header">Chats</Text>
        <IconButton icon="person-add-outline" label="Friends" onPress={() => router.push('/friends')} background={colors.surface} badge={incoming} />
        <IconButton icon="create-outline" label="New group" onPress={() => router.push('/chat/new')} color="#fff" background={colors.primary} />
      </View>
      <FlatList
        data={groups.data ?? []}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30, gap: 4 }}
        refreshControl={<RefreshControl refreshing={groups.isRefetching} onRefresh={() => { groups.refetch(); }} tintColor={colors.primary} />}
        ListHeaderComponent={
          <>
            {incoming ? (
              <Card onPress={() => router.push('/friends')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 }}>
                <Icon name="person-add" size={20} color={colors.primary} />
                <Text variant="bodyStrong" style={{ flex: 1 }}>{incoming} friend request{incoming > 1 ? 's' : ''}</Text>
                <Icon name="chevron-forward" size={18} color={colors.textSubtle} />
              </Card>
            ) : null}
            {groups.isLoading ? <SkeletonList rows={5} /> : null}
            {groups.error ? <ErrorState error={groups.error} onRetry={() => groups.refetch()} /> : null}
          </>
        }
        ListEmptyComponent={
          !groups.isLoading && !groups.error ? (
            <EmptyState icon="chatbubbles-outline" title="No group chats yet" body="Create a group with your friends — Gather AI can help once you start planning." action="Create a group" onAction={() => router.push('/chat/new')} />
          ) : undefined
        }
        renderItem={({ item: g }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${g.name}, ${g.unreadCount} unread`}
            onPress={() => router.push(`/chat/${g.id}`)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: radius.lg, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
          >
            <Avatar name={g.name} uri={g.photoUrl} seed={g.id} size={54} />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{g.name}</Text>
                {g.muted ? <Icon name="notifications-off" size={13} color={colors.textSubtle} /> : null}
              </View>
              <Text variant="caption" color={g.unreadCount ? 'text' : 'muted'} numberOfLines={1} style={g.unreadCount ? { fontFamily: 'PlusJakartaSans_600SemiBold' } : undefined}>{preview(g, me)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text variant="tiny" color={g.unreadCount ? 'primary' : 'subtle'}>{relativeTime(g.lastMessage?.createdAt ?? g.createdAt)}</Text>
              {g.unreadCount ? (
                <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: g.muted ? colors.textSubtle : colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text variant="tiny" color="#fff">{g.unreadCount > 99 ? '99+' : g.unreadCount}</Text>
                </View>
              ) : <View style={{ height: 22 }} />}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
