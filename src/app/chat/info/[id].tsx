import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { confirm } from '@/lib/confirm';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Button, Card, Divider, ErrorState, Header, Icon, Input, ListRow, Pill, Screen, Sheet, SkeletonList, Text, ToggleRow } from '@/components/ui';
import { useFriends, useGroup, qk } from '@/hooks/data';
import { backend } from '@/services/backend';
import { canManageGroup } from '@/domain/permissions';
import { useSession } from '@/state/session';
import { toast } from '@/state/toast';

export default function GroupInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gid = String(id);
  const { colors } = useTheme();
  const qc = useQueryClient();
  const meId = useSession((s) => s.profile?.id);
  const group = useGroup(gid);
  const friends = useFriends();
  const [rename, setRename] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.group(gid) });
    qc.invalidateQueries({ queryKey: qk.groups });
  };
  const run = async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      refresh();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(e);
    }
  };

  if (group.isLoading) return <Screen><Header title="Group" /><SkeletonList rows={5} /></Screen>;
  if (group.error || !group.data) return <Screen><Header title="Group" /><ErrorState error={group.error} onRetry={() => group.refetch()} /></Screen>;
  const g = group.data;
  const admin = canManageGroup(g.myRole);
  const addable = (friends.data ?? []).filter((f) => !g.members.some((m) => m.userId === f.id));

  return (
    <Screen>
      <Header title="Group info" />
      <View style={{ alignItems: 'center', gap: 8, marginVertical: 12 }}>
        <Pressable
          disabled={!admin}
          accessibilityRole="button"
          accessibilityLabel="Change group photo"
          onPress={async () => {
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
            if (!r.canceled && r.assets[0]) run(() => backend().groups.update(gid, { photoUri: r.assets[0].uri }), 'Photo updated');
          }}
        >
          <Avatar name={g.name} uri={g.photoUrl} seed={gid} size={88} />
        </Pressable>
        <Text variant="title" align="center">{g.name}</Text>
        {admin ? <Button title="Rename" size="sm" variant="outline" icon="create-outline" onPress={() => setRename(g.name)} /> : null}
      </View>

      <Card style={{ paddingVertical: 4 }}>
        <ToggleRow icon="notifications-off-outline" title="Mute notifications" subtitle="You’ll still get @mentions" value={g.myMembership.muted} onChange={(v) => run(() => backend().groups.setMuted(gid, v))} />
        <Divider />
        <ToggleRow icon="sparkles-outline" title="Let Gather AI use my preferences here" subtitle="Off = your preferences count as unknown in this group" value={g.myMembership.aiSharePrefs} onChange={(v) => run(() => backend().groups.setAiSharePrefs(gid, v))} />
        <Divider />
        <ToggleRow
          icon="flash-outline"
          title="Automatic suggestions"
          subtitle={admin ? 'Gather may chime in when it notices planning — max once every 2 hours' : 'Only admins can change this'}
          value={g.aiAutoSuggest}
          disabled={!admin}
          onChange={(v) => run(() => backend().groups.update(gid, { aiAutoSuggest: v }))}
        />
      </Card>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 8 }}>
        <Text variant="heading" style={{ flex: 1 }}>{g.members.length} members</Text>
        <Button title="Add" size="sm" icon="person-add-outline" variant="secondary" onPress={() => setAdding(true)} />
      </View>
      <Card style={{ paddingVertical: 4 }}>
        {g.members.map((m, i) => (
          <View key={m.userId}>
            {i ? <Divider /> : null}
            <ListRow
              left={<Avatar name={m.profile.displayName || m.profile.username || '?'} uri={m.profile.avatarUrl} seed={m.userId} size={42} />}
              title={`${m.profile.displayName || m.profile.username}${m.userId === meId ? ' (you)' : ''}`}
              subtitle={`@${m.profile.username ?? 'deleted'}${m.profile.isSample ? ' · sample user' : ''}`}
              onPress={m.userId === meId ? undefined : () => router.push(`/user/${m.userId}`)}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {m.role !== 'member' ? <Pill label={m.role === 'owner' ? 'Owner' : 'Admin'} /> : null}
                  {admin && m.userId !== meId && m.role !== 'owner' ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${m.profile.displayName}`} hitSlop={10} onPress={() => confirm('Remove member?', `${m.profile.displayName} will be removed from ${g.name}.`, 'Remove', () => run(() => backend().groups.removeMember(gid, m.userId), 'Removed'))}>
                      <Icon name="remove-circle-outline" size={22} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
              }
            />
          </View>
        ))}
      </Card>

      <Button
        title="Leave group"
        variant="ghost"
        icon="exit-outline"
        style={{ marginTop: 20 }}
        onPress={() => confirm('Leave group?', 'You won’t see new messages unless someone adds you back.', 'Leave', () => run(async () => { await backend().groups.leave(gid); router.replace('/(tabs)/chats'); }))}
      />

      <Sheet visible={rename !== null} onClose={() => setRename(null)} title="Rename group">
        <View style={{ gap: 12 }}>
          <Input value={rename ?? ''} onChangeText={setRename} maxLength={50} />
          <Button title="Save" onPress={() => { const n = rename ?? ''; setRename(null); run(() => backend().groups.update(gid, { name: n }), 'Renamed'); }} full />
        </View>
      </Sheet>
      <Sheet visible={adding} onClose={() => setAdding(false)} title="Add friends">
        {addable.length ? (
          addable.map((f) => (
            <ListRow key={f.id} left={<Avatar name={f.displayName} uri={f.avatarUrl} seed={f.id} size={40} />} title={f.displayName} subtitle={`@${f.username}`} right={<Button title="Add" size="sm" onPress={() => run(() => backend().groups.addMembers(gid, [f.id]), `Added ${f.displayName}`)} />} />
          ))
        ) : (
          <Text variant="body" color="muted" style={{ paddingVertical: 20 }}>All your friends are already here. Add more friends from the Friends screen.</Text>
        )}
      </Sheet>
    </Screen>
  );
}
