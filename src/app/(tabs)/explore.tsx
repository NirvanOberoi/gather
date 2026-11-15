import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { categoryArt, radius } from '@/theme/tokens';
import { Chip, EmptyState, ErrorState, Icon, IconButton, Input, Notice, Sheet, SkeletonList, Text, Button } from '@/components/ui';
import { DemoBanner } from '@/components/common/DemoBanner';
import { RecommendationCard } from '@/components/recommendations/RecommendationCard';
import { RecommendationSheet } from '@/components/recommendations/RecommendationSheet';
import { usePlaces, usePlacesStatus } from '@/hooks/data';
import { useSaveToggle } from '@/hooks/useSaveToggle';
import { useShareRecommendation } from '@/hooks/useShareRecommendation';
import { useSession } from '@/state/session';
import { toast } from '@/state/toast';
import type { PlaceQuery, Recommendation } from '@/types/models';

const CATEGORIES: { value: string | null; label: string; icon: string; colors: [string, string] }[] = [
  { value: null, label: 'All', icon: 'apps', colors: ['#8B7CF6', '#5145E0'] },
  { value: 'food', label: 'Food', icon: categoryArt.food.icon, colors: categoryArt.food.colors },
  { value: 'entertainment', label: 'Entertainment', icon: categoryArt.entertainment.icon, colors: categoryArt.entertainment.colors },
  { value: 'sports', label: 'Sports', icon: categoryArt.sports.icon, colors: categoryArt.sports.colors },
  { value: 'outdoors', label: 'Outdoors', icon: categoryArt.outdoors.icon, colors: categoryArt.outdoors.colors },
  { value: 'shopping', label: 'Shopping', icon: categoryArt.shopping.icon, colors: categoryArt.shopping.colors },
  { value: 'free', label: 'Free', icon: categoryArt.free.icon, colors: categoryArt.free.colors },
  { value: 'group', label: 'Group fun', icon: 'people', colors: ['#5B6CFF', '#9F4CFF'] },
  { value: 'weekend', label: 'Weekend ideas', icon: 'sunny', colors: ['#F7B733', '#FC4A1A'] },
  { value: 'cafe', label: 'Cafes', icon: categoryArt.cafe.icon, colors: categoryArt.cafe.colors },
  { value: 'games', label: 'Games', icon: categoryArt.games.icon, colors: categoryArt.games.colors },
  { value: 'arts', label: 'Arts', icon: categoryArt.arts.icon, colors: categoryArt.arts.colors },
];

const BUDGETS = [
  { value: null, label: 'Any price' },
  { value: 0, label: 'Free' },
  { value: 1, label: '≤ $15' },
  { value: 2, label: '≤ $30' },
  { value: 3, label: '≤ $50' },
];
const DISTANCES = [
  { value: null, label: 'Any distance' },
  { value: 2, label: '≤ 2 km' },
  { value: 5, label: '≤ 5 km' },
  { value: 15, label: '≤ 15 km' },
];

export default function Explore() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const mode = useSession((s) => s.mode);
  const [text, setText] = useState('');
  const [query, setQuery] = useState<PlaceQuery>({ query: '', category: null, maxPriceLevel: null, maxDistanceKm: null, area: null, coords: null });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  const [areaText, setAreaText] = useState('');
  const [detail, setDetail] = useState<Recommendation | null>(null);
  const places = usePlaces(query);
  const status = usePlacesStatus();
  const { isSaved, toggle, version: savedVersion } = useSaveToggle();
  const share = useShareRecommendation();
  const cols = width > 700 ? 3 : 2;
  const cardW = (Math.min(width, 1100) - 40 - (cols - 1) * 12) / cols;
  const activeFilters = (query.maxPriceLevel !== null ? 1 : 0) + (query.maxDistanceKm !== null ? 1 : 0);

  const useMyLocation = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return toast.info('Location permission not granted — you can type an area instead.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      // Rounded to ~1 km and only kept in memory for this search; never shared with friends.
      const coords = { lat: Math.round(pos.coords.latitude * 100) / 100, lng: Math.round(pos.coords.longitude * 100) / 100 };
      setQuery((q) => ({ ...q, coords, area: null }));
      setAreaOpen(false);
      toast.success('Using your approximate location for this search');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <DemoBanner />
      <FlatList
        data={places.data ?? []}
        key={cols}
        numColumns={cols}
        extraData={savedVersion}
        keyExtractor={(r) => r.id}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 12 }}
        refreshControl={<RefreshControl refreshing={places.isRefetching} onRefresh={() => { places.refetch(); }} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 10 }}>
              <Text variant="title" style={{ flex: 1 }} accessibilityRole="header">Explore</Text>
              <IconButton icon="heart-outline" label="Saved" onPress={() => router.push('/saved')} background={colors.surface} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Input icon="search" placeholder="Bowling, tacos, museums…" value={text} onChangeText={setText} returnKeyType="search" onSubmitEditing={() => setQuery((q) => ({ ...q, query: text }))} />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Filters${activeFilters ? `, ${activeFilters} active` : ''}`} onPress={() => setFiltersOpen(true)} style={{ width: 52, height: 52, borderRadius: radius.lg, backgroundColor: activeFilters ? colors.primary : colors.surface, borderWidth: 1.5, borderColor: activeFilters ? colors.primary : colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="options-outline" size={22} color={activeFilters ? '#fff' : colors.text} />
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setAreaOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="location" size={15} color={colors.primary} />
              <Text variant="caption" color="primary" style={{ fontFamily: 'PlusJakartaSans_700Bold' }}>
                {query.coords ? 'Near you (approximate)' : query.area ? query.area : mode === 'demo' ? 'Sample City (demo)' : 'Set an area'}
              </Text>
              <Icon name="chevron-down" size={14} color={colors.primary} />
            </Pressable>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={{ marginHorizontal: -20 }}>
              <View style={{ width: 10 }} />
              {CATEGORIES.map((c) => {
                const on = query.category === c.value;
                return (
                  <Pressable key={c.label} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={c.label} onPress={() => setQuery((q) => ({ ...q, category: c.value }))} style={{ alignItems: 'center', gap: 6, width: 74 }}>
                    <View style={{ width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.colors[1] : colors.surface, borderWidth: on ? 0 : 1, borderColor: colors.border }}>
                      <Icon name={c.icon} size={24} color={on ? '#fff' : c.colors[1]} />
                    </View>
                    <Text variant="tiny" color={on ? 'primary' : 'muted'} align="center" numberOfLines={1}>{c.label}</Text>
                  </Pressable>
                );
              })}
              <View style={{ width: 10 }} />
            </ScrollView>
            {status.data === 'sample' ? <Notice tone="warning" text="Demo mode: these are fictional sample places — not real businesses, prices or ratings." /> : null}
            {status.data === 'unavailable' ? <Notice tone="warning" text="Place search isn’t configured for this server yet (needs a Google Maps API key). Gather AI can still suggest general ideas." /> : null}
            {status.data === 'live' && !query.area && !query.coords ? <Notice text="Set an area or use your approximate location to see places near you." /> : null}
            {places.isLoading ? <SkeletonList rows={3} avatar={false} /> : null}
            {places.error ? <ErrorState error={places.error} onRetry={() => places.refetch()} /> : null}
          </View>
        }
        ListEmptyComponent={!places.isLoading && !places.error ? <EmptyState icon="search-outline" title="No matches" body="Try another category, a wider budget or a different search." /> : undefined}
        renderItem={({ item }) => (
          <RecommendationCard rec={item} width={cardW} compact onPress={() => setDetail(item)} onSave={() => toggle(item)} saved={isSaved(item)} />
        )}
      />
      <Sheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <Text variant="label" color="muted" style={{ marginBottom: 10 }}>Budget per person</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {BUDGETS.map((b) => <Chip key={b.label} label={b.label} selected={query.maxPriceLevel === b.value} onPress={() => setQuery((q) => ({ ...q, maxPriceLevel: b.value }))} />)}
        </View>
        <Text variant="label" color="muted" style={{ marginTop: 20, marginBottom: 10 }}>Distance</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {DISTANCES.map((d) => <Chip key={d.label} label={d.label} selected={query.maxDistanceKm === d.value} onPress={() => setQuery((q) => ({ ...q, maxDistanceKm: d.value }))} />)}
        </View>
        <Button title="Show results" onPress={() => setFiltersOpen(false)} style={{ marginTop: 24 }} full />
      </Sheet>
      <Sheet visible={areaOpen} onClose={() => setAreaOpen(false)} title="Where are you exploring?">
        <View style={{ gap: 12 }}>
          <Input icon="business-outline" placeholder="City or neighborhood (e.g. Austin, TX)" value={areaText} onChangeText={setAreaText} />
          <Button title="Use this area" onPress={() => { setQuery((q) => ({ ...q, area: areaText.trim() || null, coords: null })); setAreaOpen(false); }} full />
          <Button title="Use my approximate location" icon="navigate-outline" variant="secondary" onPress={useMyLocation} full />
          <Text variant="caption" color="subtle">Precise location is only requested when you tap this, rounded to about 1 km, used for this search only, and never shown to friends.</Text>
        </View>
      </Sheet>
      <RecommendationSheet rec={detail} onClose={() => setDetail(null)} onShare={(r) => { setDetail(null); share.open(r); }} />
      {share.sheet}
    </View>
  );
}
