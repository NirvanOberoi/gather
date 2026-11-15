import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, Chip, ErrorState, Header, Notice, Screen, SkeletonList, Text } from '@/components/ui';
import { prefsSummary } from '@/features/preferences/PreferenceSections';
import { useProfile, useVisiblePrefs } from '@/hooks/data';
import { backend } from '@/services/backend';
import { confirm } from '@/lib/confirm';
import { toast } from '@/state/toast';

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = String(id);
  const qc = useQueryClient();
  const profile = useProfile(uid);
  const prefs = useVisiblePrefs(uid);
  const refresh = () => ['friends', 'requests', 'blocked', 'profile', 'visiblePrefs'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const act = async (fn: () => Promise<void>, msg: string) => {
    try {
      await fn();
      refresh();
      toast.success(msg);
    } catch (e) {
      toast.error(e);
    }
  };

  if (profile.isLoading) return <Screen><Header title="" /><SkeletonList rows={3} /></Screen>;
  if (profile.error || !profile.data) return <Screen><Header title="" /><ErrorState error={profile.error} /></Screen>;
  const p = profile.data;
  const shared = prefs.data ? prefsSummary(prefs.data) : [];

  return (
    <Screen>
      <Header title="" />
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Avatar name={p.displayName || p.username || '?'} uri={p.avatarUrl} seed={p.id} size={96} />
        <Text variant="title">{p.displayName}</Text>
        <Text variant="body" color="muted">@{p.username}{p.city ? ` · ${p.city}` : ''}</Text>
        {p.isSample ? <Notice tone="warning" text="Sample user — part of the demo, not a real person." /> : null}
        {p.bio ? <Text variant="body" align="center">{p.bio}</Text> : null}
        {p.mutualCount ? <Text variant="caption" color="subtle">{p.mutualCount} mutual friend{p.mutualCount > 1 ? 's' : ''}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, justifyContent: 'center' }}>
        {p.relation === 'none' ? <Button title="Add friend" icon="person-add-outline" onPress={() => act(() => backend().friends.send(uid), 'Request sent')} /> : null}
        {p.relation === 'incoming' && p.requestId ? <Button title="Accept request" onPress={() => act(() => backend().friends.respond(p.requestId!, true), 'You’re now friends')} /> : null}
        {p.relation === 'outgoing' ? <Button title="Requested" variant="secondary" /> : null}
        {p.relation === 'friend' ? <Button title="Friends" icon="checkmark" variant="secondary" /> : null}
        {p.relation === 'blocked' ? <Button title="Unblock" variant="secondary" onPress={() => act(() => backend().friends.unblock(uid), 'Unblocked')} /> : null}
      </View>
      {p.relation === 'friend' ? (
        <Card style={{ marginTop: 20, gap: 10 }}>
          <Text variant="bodyStrong">What {p.displayName} shares with friends</Text>
          {shared.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{shared.map((s) => <Chip key={s} label={s} size="sm" />)}</View>
          ) : (
            <Text variant="caption" color="muted">Nothing shared with friends.</Text>
          )}
        </Card>
      ) : null}
      <View style={{ marginTop: 28, gap: 6 }}>
        {p.relation === 'friend' ? <Button title="Remove friend" variant="ghost" onPress={() => confirm('Remove friend?', `You and ${p.displayName} won’t be friends anymore.`, 'Remove', () => act(() => backend().friends.remove(uid), 'Removed'))} /> : null}
        {p.relation !== 'blocked' ? (
          <Button title="Block" variant="ghost" icon="ban-outline" onPress={() => confirm(`Block ${p.displayName}?`, 'They won’t be able to find you, message you in new groups, or send requests. They aren’t notified.', 'Block', () => act(async () => { await backend().friends.block(uid); router.back(); }, 'Blocked'))} />
        ) : null}
      </View>
    </Screen>
  );
}
