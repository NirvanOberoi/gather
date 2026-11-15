import React, { useCallback, useEffect } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Button, EmptyState, Header, Icon, Screen, SkeletonList, Text, type IconName } from '@/components/ui';
import { useNotifications, qk } from '@/hooks/data';
import { backend } from '@/services/backend';
import { relativeTime } from '@/domain/time';
import type { AppNotification } from '@/types/models';

const ICON: Record<AppNotification['type'], IconName> = {
  friend_request: 'person-add', friend_accepted: 'people', group_added: 'chatbubbles', mention: 'at', poll_created: 'stats-chart',
  poll_closed: 'trophy', plan_invite: 'calendar', plan_updated: 'calendar-outline', plan_reminder: 'alarm',
};

function open(n: AppNotification) {
  if (n.data.planId) return router.push(`/plan/${n.data.planId}`);
  if (n.data.groupId) return router.push(`/chat/${n.data.groupId}`);
  if (n.type === 'friend_request' || n.type === 'friend_accepted') return router.push('/friends');
}

export default function Notifications() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const list = useNotifications();
  const unread = list.data?.filter((n) => !n.readAt).length ?? 0;
  const markAll = useCallback(async () => {
    await backend().notifications.markRead('all').catch(() => {});
    qc.invalidateQueries({ queryKey: qk.notifications });
  }, [qc]);
  useEffect(() => () => { void markAll(); }, [markAll]); // mark everything read when leaving
  return (
    <Screen scroll={false}>
      <Header title="Notifications" right={unread ? <Button title="Mark all read" size="sm" variant="ghost" onPress={markAll} /> : undefined} />
      {list.isLoading ? <SkeletonList rows={5} /> : null}
      <FlatList
        data={list.data ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ gap: 8, paddingBottom: 40 }}
        ListEmptyComponent={!list.isLoading ? <EmptyState icon="notifications-outline" title="You’re all caught up" body="Friend requests, polls and plan updates show up here." /> : undefined}
        renderItem={({ item: n }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${n.title}. ${n.body}`}
            onPress={async () => {
              await backend().notifications.markRead([n.id]).catch(() => {});
              qc.invalidateQueries({ queryKey: qk.notifications });
              open(n);
            }}
            style={({ pressed }) => ({ flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: n.readAt ? colors.surface : colors.primarySoft, opacity: pressed ? 0.8 : 1 })}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: n.readAt ? colors.surfaceAlt : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={ICON[n.type] ?? 'notifications'} size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{n.title}</Text>
              {n.body ? <Text variant="caption" color="muted" numberOfLines={2}>{n.body}</Text> : null}
              <Text variant="tiny" color="subtle">{relativeTime(n.createdAt)}</Text>
            </View>
            {!n.readAt ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 }} /> : null}
          </Pressable>
        )}
      />
    </Screen>
  );
}
