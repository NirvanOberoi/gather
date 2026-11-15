import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar, Button, EmptyState, Header, Icon, Input, Screen, SkeletonList, Text } from '@/components/ui';
import { useFriends, qk } from '@/hooks/data';
import { backend } from '@/services/backend';
import { toast } from '@/state/toast';

export default function NewGroup() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const friends = useFriends();
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return setError('Give your group a name.');
    if (!selected.length) return setError('Add at least one friend.');
    setBusy(true);
    try {
      const g = await backend().groups.create({ name: name.trim(), memberIds: selected, photoUri: photo });
      qc.invalidateQueries({ queryKey: qk.groups });
      router.replace(`/chat/${g.id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard>
      <Header title="New group" right={<Button title="Create" size="sm" onPress={create} loading={busy} />} />
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add group photo"
          onPress={async () => {
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
            if (!r.canceled && r.assets[0]) setPhoto(r.assets[0].uri);
          }}
          style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
        >
          {photo ? <Avatar name={name || 'G'} uri={photo} size={64} /> : <Icon name="camera-outline" size={26} color={colors.primary} />}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Input placeholder="Group name (e.g. Weekend crew)" value={name} onChangeText={(t) => { setName(t); setError(null); }} maxLength={50} error={error} />
        </View>
      </View>
      <Text variant="label" color="muted" style={{ marginTop: 24, marginBottom: 8 }}>Add friends · {selected.length} selected</Text>
      {friends.isLoading ? <SkeletonList rows={4} /> : null}
      {friends.data && !friends.data.length ? <EmptyState icon="person-add-outline" title="Add friends first" body="You can only add friends to a group." action="Find friends" onAction={() => router.push('/friends/add')} /> : null}
      {friends.data?.map((f) => {
        const on = selected.includes(f.id);
        return (
          <Pressable key={f.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={f.displayName} onPress={() => setSelected(on ? selected.filter((x) => x !== f.id) : [...selected, f.id])} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
            <Avatar name={f.displayName || f.username || '?'} uri={f.avatarUrl} seed={f.id} size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{f.displayName}{f.isSample ? ' · sample' : ''}</Text>
              <Text variant="caption" color="muted">@{f.username}</Text>
            </View>
            <Icon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? colors.primary : colors.border} />
          </Pressable>
        );
      })}
    </Screen>
  );
}
