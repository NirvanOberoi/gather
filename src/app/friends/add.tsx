import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, Divider, EmptyState, Header, Input, ListRow, Notice, Screen, SkeletonList } from '@/components/ui';
import { backend } from '@/services/backend';
import { useSession } from '@/state/session';
import { toast } from '@/state/toast';
import type { ProfileWithRelation } from '@/types/models';

export default function AddFriends() {
  const qc = useQueryClient();
  const mode = useSession((s) => s.mode);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  // Debounce typing; the timer callback (not the effect body) updates state.
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const search = useQuery({ queryKey: ['userSearch', term], queryFn: () => backend().profiles.search(term), enabled: term.length >= 2 });
  const results: ProfileWithRelation[] | null = term.length >= 2 ? search.data ?? null : null;
  const loading = search.isFetching && !search.data;

  const act = async (fn: () => Promise<void>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      ['friends', 'requests', 'userSearch'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) {
      toast.error(e);
    }
  };

  const action = (p: ProfileWithRelation) => {
    switch (p.relation) {
      case 'friend': return <Button title="Friends" size="sm" variant="secondary" icon="checkmark" />;
      case 'outgoing': return <Button title="Requested" size="sm" variant="ghost" onPress={() => p.requestId && act(() => backend().friends.cancel(p.requestId!), 'Request canceled')} />;
      case 'incoming': return <Button title="Accept" size="sm" onPress={() => p.requestId && act(() => backend().friends.respond(p.requestId!, true), 'You’re now friends')} />;
      case 'blocked': return <Button title="Blocked" size="sm" variant="ghost" />;
      default: return <Button title="Add" size="sm" icon="person-add-outline" onPress={() => act(() => backend().friends.send(p.id), 'Request sent')} />;
    }
  };

  return (
    <Screen keyboard>
      <Header title="Add friends" />
      <Input icon="search" placeholder="Search by username" value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} autoFocus />
      {mode === 'demo' ? <View style={{ marginTop: 12 }}><Notice tone="warning" text="Demo: try “ava”, “noah” or “zoe”. Sample users accept requests automatically." /></View> : null}
      <View style={{ marginTop: 16 }}>
        {loading ? <SkeletonList rows={3} /> : null}
        {results && !results.length && !loading ? <EmptyState icon="search-outline" title="No one found" body="Check the spelling, or ask your friend for their exact username." compact /> : null}
        {results?.length ? (
          <Card style={{ paddingVertical: 4 }}>
            {results.map((p, i) => (
              <View key={p.id}>
                {i ? <Divider /> : null}
                <ListRow left={<Avatar name={p.displayName || p.username || '?'} uri={p.avatarUrl} seed={p.id} size={44} />} title={p.displayName || p.username || ''} subtitle={`@${p.username}${p.isSample ? ' · sample' : ''}`} onPress={() => router.push(`/user/${p.id}`)} right={action(p)} />
              </View>
            ))}
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
