import React, { useMemo, useState } from 'react';
import { FlatList, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Chip, EmptyState, Header, Input, Screen, Sheet, SkeletonList, Text } from '@/components/ui';
import { RecommendationCard } from '@/components/recommendations/RecommendationCard';
import { RecommendationSheet } from '@/components/recommendations/RecommendationSheet';
import { useSaved, qk } from '@/hooks/data';
import { useShareRecommendation } from '@/hooks/useShareRecommendation';
import { backend } from '@/services/backend';
import { toast } from '@/state/toast';
import type { Recommendation, SavedItem } from '@/types/models';

export default function Saved() {
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const saved = useSaved();
  const share = useShareRecommendation();
  const [filter, setFilter] = useState<string | null>(null);
  const [detail, setDetail] = useState<Recommendation | null>(null);
  const [moving, setMoving] = useState<SavedItem | null>(null);
  const [newCollection, setNewCollection] = useState('');
  const collections = useMemo(() => Array.from(new Set((saved.data ?? []).map((s) => s.collection))), [saved.data]);
  const items = (saved.data ?? []).filter((s) => !filter || s.collection === filter);
  const cols = width > 700 ? 3 : 2;
  const cardW = (Math.min(width, 1100) - 40 - (cols - 1) * 12) / cols;

  const move = async (item: SavedItem, collection: string) => {
    try {
      await backend().saved.move(item.id, collection);
      qc.invalidateQueries({ queryKey: qk.saved });
      setMoving(null);
      setNewCollection('');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Screen scroll={false}>
      <Header title="Saved" subtitle="Places & ideas you want to try" />
      {collections.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }} style={{ flexGrow: 0 }}>
          <Chip label="All" selected={!filter} onPress={() => setFilter(null)} />
          {collections.map((c) => <Chip key={c} label={c} selected={filter === c} onPress={() => setFilter(c)} />)}
        </ScrollView>
      ) : null}
      {saved.isLoading ? <SkeletonList rows={3} /> : null}
      <FlatList
        data={items}
        key={cols}
        numColumns={cols}
        keyExtractor={(s) => s.id}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ gap: 12, paddingBottom: 40, paddingTop: 8 }}
        ListEmptyComponent={!saved.isLoading ? <EmptyState icon="heart-outline" title="Nothing saved yet" body="Tap the heart on any place or AI suggestion to keep it here." action="Explore" onAction={() => router.push('/(tabs)/explore')} /> : undefined}
        renderItem={({ item }) => (
          <View style={{ gap: 6 }}>
            <RecommendationCard rec={item.recommendation} width={cardW} compact onPress={() => setDetail(item.recommendation)} saved onSave={async () => { await backend().saved.remove(item.id).catch(toast.error); qc.invalidateQueries({ queryKey: qk.saved }); }} />
            <Text variant="tiny" color="primary" onPress={() => setMoving(item)} accessibilityRole="button">📁 {item.collection} · move</Text>
          </View>
        )}
      />
      <Sheet visible={!!moving} onClose={() => setMoving(null)} title="Move to collection">
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {['Saved', 'Food spots', 'Weekend ideas', 'Birthday ideas', ...collections].filter((v, i, a) => a.indexOf(v) === i).map((c) => (
              <Chip key={c} label={c} selected={moving?.collection === c} onPress={() => moving && move(moving, c)} />
            ))}
          </View>
          <Input placeholder="New collection name" value={newCollection} onChangeText={setNewCollection} maxLength={40} />
          <Button title="Create & move" onPress={() => moving && newCollection.trim() && move(moving, newCollection.trim())} disabled={!newCollection.trim()} full />
        </View>
      </Sheet>
      <RecommendationSheet rec={detail} onClose={() => setDetail(null)} onShare={(r) => { setDetail(null); share.open(r); }} />
      {share.sheet}
    </Screen>
  );
}
