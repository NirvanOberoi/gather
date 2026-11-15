import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, Divider, EmptyState, Header, IconButton, ListRow, Screen, SectionHeader, SkeletonList, Text } from '@/components/ui';
import { useBlocked, useFriendRequests, useFriends } from '@/hooks/data';
import { backend } from '@/services/backend';
import { toast } from '@/state/toast';
import { useTheme } from '@/theme/ThemeProvider';

export default function Friends() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const friends = useFriends();
  const requests = useFriendRequests();
  const blocked = useBlocked();
  const refresh = () => ['friends', 'requests', 'blocked'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const act = async (fn: () => Promise<void>, msg?: string) => {
    try {
      await fn();
      refresh();
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Screen refreshing={friends.isRefetching} onRefresh={refresh}>
      <Header title="Friends" right={<IconButton icon="person-add" label="Add friends" color="#fff" background={colors.primary} onPress={() => router.push('/friends/add')} />} />
      {requests.data?.incoming.length ? (
        <>
          <SectionHeader title={`Requests · ${requests.data.incoming.length}`} />
          <Card style={{ paddingVertical: 4 }}>
            {requests.data.incoming.map((r, i) => (
              <View key={r.id}>
                {i ? <Divider /> : null}
                <ListRow
                  left={<Avatar name={r.other.displayName || r.other.username || '?'} uri={r.other.avatarUrl} seed={r.other.id} size={44} />}
                  title={r.other.displayName || r.other.username || 'Someone'}
                  subtitle={`@${r.other.username}${r.other.isSample ? ' · sample' : ''}`}
                  onPress={() => router.push(`/user/${r.other.id}`)}
                  right={
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Button title="Accept" size="sm" onPress={() => act(() => backend().friends.respond(r.id, true), `You and ${r.other.displayName} are friends`)} />
                      <IconButton icon="close" label="Decline" size={36} background={colors.surfaceAlt} onPress={() => act(() => backend().friends.respond(r.id, false))} />
                    </View>
                  }
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}
      {requests.data?.outgoing.length ? (
        <>
          <SectionHeader title="Sent" />
          <Card style={{ paddingVertical: 4 }}>
            {requests.data.outgoing.map((r) => (
              <ListRow key={r.id} left={<Avatar name={r.other.displayName || '?'} uri={r.other.avatarUrl} seed={r.other.id} size={40} />} title={r.other.displayName} subtitle="Pending" right={<Button title="Cancel" size="sm" variant="ghost" onPress={() => act(() => backend().friends.cancel(r.id))} />} />
            ))}
          </Card>
        </>
      ) : null}
      <SectionHeader title={`Your friends${friends.data ? ` · ${friends.data.length}` : ''}`} />
      {friends.isLoading ? <SkeletonList rows={4} /> : null}
      {friends.data && !friends.data.length ? <EmptyState icon="people-outline" title="No friends yet" body="Search by username to add people you know." action="Find friends" onAction={() => router.push('/friends/add')} /> : null}
      {friends.data?.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {friends.data.map((f, i) => (
            <View key={f.id}>
              {i ? <Divider /> : null}
              <ListRow left={<Avatar name={f.displayName || f.username || '?'} uri={f.avatarUrl} seed={f.id} size={44} />} title={f.displayName} subtitle={`@${f.username}${f.isSample ? ' · sample user' : ''}`} onPress={() => router.push(`/user/${f.id}`)} />
            </View>
          ))}
        </Card>
      ) : null}
      {blocked.data?.length ? (
        <>
          <SectionHeader title="Blocked" />
          <Card style={{ paddingVertical: 4 }}>
            {blocked.data.map((b) => (
              <ListRow key={b.id} left={<Avatar name={b.displayName || '?'} size={36} seed={b.id} />} title={b.displayName || b.username || 'User'} right={<Button title="Unblock" size="sm" variant="ghost" onPress={() => act(() => backend().friends.unblock(b.id), 'Unblocked')} />} />
            ))}
          </Card>
          <Text variant="caption" color="subtle" style={{ marginTop: 8 }}>Blocked people can’t find you, send requests, or add you to groups.</Text>
        </>
      ) : null}
    </Screen>
  );
}
