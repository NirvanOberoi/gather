import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Avatar, EmptyState, ListRow, Sheet, SkeletonList } from '@/components/ui';
import { useGroups } from '@/hooks/data';

export function GroupPickerSheet({ visible, onClose, onPick, title = 'Share to a group', allowCreate }: { visible: boolean; onClose: () => void; onPick: (groupId: string) => void; title?: string; allowCreate?: boolean }) {
  const { data, isLoading } = useGroups();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {isLoading ? <SkeletonList rows={3} /> : null}
      {data && data.length === 0 ? <EmptyState icon="people-outline" title="No groups yet" body="Create a group chat first." compact /> : null}
      <View>
        {allowCreate ? <ListRow icon="add" title="New group" subtitle="Invite friends and start planning" onPress={() => { onClose(); router.push('/chat/new'); }} /> : null}
        {data?.map((g) => (
          <ListRow key={g.id} left={<Avatar name={g.name} uri={g.photoUrl} seed={g.id} size={42} />} title={g.name} subtitle={`${g.memberCount} members`} onPress={() => onPick(g.id)} />
        ))}
      </View>
    </Sheet>
  );
}
