import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Avatar, Button, Header, IconButton, Input, Notice, Screen, Segmented, Text } from '@/components/ui';
import { RecommendationCard } from '@/components/recommendations/RecommendationCard';
import { DayPicker, TimeStepper } from '@/components/plans/Pickers';
import { useGroups, qk } from '@/hooks/data';
import { backend } from '@/services/backend';
import { useDrafts } from '@/state/drafts';
import { toast } from '@/state/toast';
import { deviceTimeZone, localRangeToInterval, todayISOInZone, addDaysISO } from '@/domain/time';

export default function NewPlan() {
  const params = useLocalSearchParams<{ groupId?: string }>();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const tz = deviceTimeZone();
  const place = useDrafts((s) => s.planPlace);
  const setPlace = useDrafts((s) => s.setPlanPlace);
  const groups = useGroups();
  const [groupId, setGroupId] = useState<string | null>(params.groupId ?? null);
  const [title, setTitle] = useState(place ? place.title : '');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState(place?.estimatedCost?.label ?? '');
  const [location, setLocation] = useState(place?.locationText ?? '');
  const [timing, setTiming] = useState<'later' | 'set'>('later');
  const [day, setDay] = useState(addDaysISO(todayISOInZone(tz), 1));
  const [start, setStart] = useState(18 * 60);
  const [end, setEnd] = useState(20 * 60);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!title.trim()) return setError('Give your plan a title.');
    setBusy(true);
    try {
      let startsAt: string | null = null;
      let endsAt: string | null = null;
      if (timing === 'set') {
        const iv = localRangeToInterval(day, start, end, tz);
        startsAt = new Date(iv.start).toISOString();
        endsAt = new Date(iv.end).toISOString();
      }
      const plan = await backend().plans.create({
        groupId, title: title.trim(), description: description.trim() || null, activity: place?.title ?? null, place,
        startsAt, endsAt, timezone: tz, locationText: location.trim() || null, budgetText: budget.trim() || null,
      });
      setPlace(null);
      qc.invalidateQueries({ queryKey: qk.plans });
      router.replace(`/plan/${plan.id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard>
      <Header title="New plan" right={<Button title="Create" size="sm" onPress={create} loading={busy} />} />
      <View style={{ gap: 16, marginTop: 6 }}>
        {place ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text variant="label" color="muted" style={{ flex: 1 }}>Activity</Text>
              <IconButton icon="close" label="Remove place" size={30} onPress={() => setPlace(null)} />
            </View>
            <RecommendationCard rec={place} width={300} compact />
          </View>
        ) : null}
        <Input label="Title" value={title} onChangeText={(t) => { setTitle(t); setError(null); }} placeholder="Saturday bowling" maxLength={80} error={error} />
        <Text variant="label" color="muted">Who’s it with?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          <Pressable onPress={() => setGroupId(null)} accessibilityRole="radio" accessibilityState={{ checked: groupId === null }} style={{ paddingHorizontal: 14, height: 44, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: groupId === null ? colors.primary : colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <Text variant="caption" color={groupId === null ? '#fff' : 'text'}>Just me for now</Text>
          </Pressable>
          {groups.data?.map((g) => (
            <Pressable key={g.id} onPress={() => setGroupId(g.id)} accessibilityRole="radio" accessibilityState={{ checked: groupId === g.id }} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 10, height: 44, borderRadius: radius.pill, backgroundColor: groupId === g.id ? colors.primary : colors.surface, borderWidth: 1, borderColor: colors.border }}>
              <Avatar name={g.name} uri={g.photoUrl} seed={g.id} size={26} />
              <Text variant="caption" color={groupId === g.id ? '#fff' : 'text'}>{g.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {groupId ? <Text variant="caption" color="subtle">Everyone in the group is invited and the plan is posted to the chat.</Text> : null}
        <Text variant="label" color="muted">When</Text>
        <Segmented value={timing} onChange={setTiming} options={[{ value: 'later', label: 'Find a time together' }, { value: 'set', label: 'Pick a time' }]} />
        {timing === 'set' ? (
          <View style={{ gap: 12 }}>
            <DayPicker value={day} onChange={setDay} tz={tz} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TimeStepper label="Starts" minutes={start} onChange={setStart} />
              <TimeStepper label="Ends" minutes={end} onChange={setEnd} allowNextDay />
            </View>
            {end <= start ? <Notice text="Ends after midnight — that’s fine, it’ll run into the next day." /> : null}
            <Text variant="caption" color="subtle">Time zone: {tz}</Text>
          </View>
        ) : (
          <Notice text="After creating, everyone adds when they’re free and Gather finds the overlap." />
        )}
        <Input label="General location (optional)" value={location} onChangeText={setLocation} placeholder="Downtown, Riverside Park…" maxLength={160} hint="Keep it general — no home addresses." />
        <Input label="Budget (optional)" value={budget} onChangeText={setBudget} placeholder="Under $20 each" maxLength={60} />
        <Input label="Notes (optional)" value={description} onChangeText={setDescription} placeholder="Bring a jacket, meet at the entrance…" multiline maxLength={1000} />
        <Text variant="caption" color="subtle">Gather never books or buys anything for you.</Text>
      </View>
    </Screen>
  );
}
