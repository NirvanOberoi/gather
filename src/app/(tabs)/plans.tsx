import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { EmptyState, ErrorState, IconButton, Segmented, SkeletonList, Text } from '@/components/ui';
import { DemoBanner } from '@/components/common/DemoBanner';
import { PlanCard } from '@/components/plans/PlanCard';
import { usePlans } from '@/hooks/data';
import { useDrafts } from '@/state/drafts';
import { bucketPlan, type PlanBucket } from '@/domain/plans';

type Tab = PlanBucket;

export default function Plans() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const plans = usePlans();
  const [tab, setTab] = useState<Tab>('upcoming');
  const setPlanPlace = useDrafts((s) => s.setPlanPlace);
  const list = useMemo(() => {
    const items = (plans.data ?? []).filter((p) => bucketPlan(p) === tab);
    return items.sort((a, b) => (tab === 'past' ? -1 : 1) * ((a.startsAt ?? a.createdAt).localeCompare(b.startsAt ?? b.createdAt)));
  }, [plans.data, tab]);
  const counts = useMemo(() => {
    const c = { upcoming: 0, planning: 0, past: 0 };
    for (const p of plans.data ?? []) c[bucketPlan(p)]++;
    return c;
  }, [plans.data]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <DemoBanner />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 }}>
        <Text variant="title" style={{ flex: 1 }} accessibilityRole="header">Plans</Text>
        <IconButton icon="add" label="Create plan" color="#fff" background={colors.primary} onPress={() => { setPlanPlace(null); router.push('/plan/new'); }} />
      </View>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upcoming', label: `Upcoming${counts.upcoming ? ` · ${counts.upcoming}` : ''}` },
            { value: 'planning', label: `Pending${counts.planning ? ` · ${counts.planning}` : ''}` },
            { value: 'past', label: 'Past' },
          ]}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 10 }}
        refreshControl={<RefreshControl refreshing={plans.isRefetching} onRefresh={() => { plans.refetch(); }} tintColor={colors.primary} />}
        ListHeaderComponent={plans.isLoading ? <SkeletonList rows={3} /> : plans.error ? <ErrorState error={plans.error} onRetry={() => plans.refetch()} /> : undefined}
        ListEmptyComponent={
          !plans.isLoading && !plans.error ? (
            tab === 'upcoming' ? (
              <EmptyState icon="calendar-outline" title="No confirmed plans yet" body="When a group locks in a time, it lands here." action="Create a plan" onAction={() => { setPlanPlace(null); router.push('/plan/new'); }} />
            ) : tab === 'planning' ? (
              <EmptyState icon="hourglass-outline" title="Nothing pending" body="Plans that still need a time or a final pick show up here." />
            ) : (
              <EmptyState icon="time-outline" title="No past plans" body="Your hangout history will live here." />
            )
          ) : undefined
        }
        renderItem={({ item }) => <PlanCard plan={item} />}
      />
    </View>
  );
}
