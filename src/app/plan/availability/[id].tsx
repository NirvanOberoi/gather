import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Avatar, Button, Card, EmptyState, Header, Icon, Notice, Pill, Screen, SectionHeader, SkeletonList, Text } from '@/components/ui';
import { DayPicker, TimeStepper } from '@/components/plans/Pickers';
import { useAvailability, useGroup, usePlan, usePlanRealtime, qk } from '@/hooks/data';
import { backend } from '@/services/backend';
import { bestWindows, summarizeBestWindow, type OverlapWindow } from '@/domain/availability';
import { canEditPlan } from '@/domain/permissions';
import { formatDay, formatRange, formatTime, localRangeToInterval, todayISOInZone, addDaysISO, zonedParts } from '@/domain/time';
import { useSession } from '@/state/session';
import { toast } from '@/state/toast';

interface Range { day: string; start: number; end: number }

/** Convert a stored UTC range back into a day + minutes in the plan's zone (for editing). */
function toRange(startsAt: string, endsAt: string, tz: string): Range {
  const s = zonedParts(new Date(startsAt).getTime(), tz);
  const e = zonedParts(new Date(endsAt).getTime(), tz);
  const day = `${s.year}-${String(s.month).padStart(2, '0')}-${String(s.day).padStart(2, '0')}`;
  const start = s.hour * 60 + s.minute;
  let end = e.hour * 60 + e.minute;
  if (end === 0 && new Date(endsAt).getTime() > new Date(startsAt).getTime()) end = 1440;
  return { day, start, end };
}

export default function AvailabilityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const planId = String(id);
  const { colors } = useTheme();
  const qc = useQueryClient();
  const meId = useSession((s) => s.profile?.id ?? '');
  const plan = usePlan(planId);
  usePlanRealtime(planId);
  const slots = useAvailability(planId);
  const group = useGroup(plan.data?.groupId ?? '');
  const tz = plan.data?.timezone ?? 'UTC';
  // Local edits; until the user changes something, show what's saved on the server.
  const [edited, setEdited] = useState<Range[] | null>(null);
  const [saving, setSaving] = useState(false);
  const saved = useMemo(() => {
    if (!slots.data) return null;
    const mine = slots.data.filter((s) => s.userId === meId).map((s) => toRange(s.startsAt, s.endsAt, tz));
    return mine.length ? mine : [{ day: addDaysISO(todayISOInZone(tz), 1), start: 17 * 60, end: 20 * 60 }];
  }, [slots.data, meId, tz]);
  const ranges = edited ?? saved;
  const setRanges = setEdited;

  const windows = useMemo(
    () => bestWindows((slots.data ?? []).map((a) => ({ userId: a.userId, start: new Date(a.startsAt).getTime(), end: new Date(a.endsAt).getTime() })), { limit: 4 }),
    [slots.data],
  );

  if (plan.isLoading || slots.isLoading || !ranges) return <Screen><Header title="Availability" /><SkeletonList rows={4} /></Screen>;
  if (!plan.data) return <Screen><Header title="Availability" /><EmptyState icon="alert-circle-outline" title="Plan not found" /></Screen>;
  const p = plan.data;
  const canEdit = canEditPlan({ userId: meId, createdBy: p.createdBy, groupRole: group.data?.myRole ?? null, isParticipant: true }).ok;
  const people = new Map(p.participants.map((x) => [x.userId, x.profile]));

  const save = async () => {
    setSaving(true);
    try {
      const payload = ranges.map((r) => {
        const iv = localRangeToInterval(r.day, r.start, r.end, tz);
        return { startsAt: new Date(iv.start).toISOString(), endsAt: new Date(iv.end).toISOString() };
      });
      await backend().availability.setMine(planId, payload);
      qc.invalidateQueries({ queryKey: qk.availability(planId) });
      toast.success('Availability saved');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const applyWindow = async (w: OverlapWindow) => {
    try {
      await backend().plans.update(planId, { startsAt: new Date(w.start).toISOString(), endsAt: new Date(w.end).toISOString() });
      qc.invalidateQueries({ queryKey: qk.plan(planId) });
      qc.invalidateQueries({ queryKey: qk.plans });
      toast.success('Time saved to the plan');
      router.back();
    } catch (e) {
      toast.error(e);
    }
  };

  // Timeline bounds for the best window's day
  const timeline = (() => {
    if (!slots.data?.length) return null;
    const all = slots.data.map((s) => ({ ...s, s: new Date(s.startsAt).getTime(), e: new Date(s.endsAt).getTime() }));
    const min = Math.min(...all.map((a) => a.s));
    const max = Math.max(...all.map((a) => a.e));
    const span = Math.max(1, max - min);
    const byUser = new Map<string, { s: number; e: number }[]>();
    for (const a of all) byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), { s: a.s, e: a.e }]);
    return { min, max, span, byUser };
  })();

  return (
    <Screen>
      <Header title="When are you free?" subtitle={`${p.title} · times in ${tz}`} />
      <Text variant="body" color="muted" style={{ marginTop: 4 }}>Add the times you could make it. Only this plan’s participants see them — never your calendar.</Text>

      {ranges.map((r, i) => (
        <Card key={i} style={{ marginTop: 14, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="bodyStrong" style={{ flex: 1 }}>Option {i + 1}</Text>
            {ranges.length > 1 ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove option ${i + 1}`} hitSlop={10} onPress={() => setRanges(ranges.filter((_, j) => j !== i))}>
                <Icon name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            ) : null}
          </View>
          <DayPicker value={r.day} onChange={(day) => setRanges(ranges.map((x, j) => (j === i ? { ...x, day } : x)))} tz={tz} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TimeStepper label="From" minutes={r.start} onChange={(start) => setRanges(ranges.map((x, j) => (j === i ? { ...x, start } : x)))} />
            <TimeStepper label="Until" minutes={r.end} allowNextDay onChange={(end) => setRanges(ranges.map((x, j) => (j === i ? { ...x, end } : x)))} />
          </View>
          {r.end <= r.start ? <Text variant="caption" color="muted">Runs past midnight into the next day.</Text> : null}
        </Card>
      ))}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Button title="Add another time" icon="add" variant="secondary" size="sm" onPress={() => setRanges([...ranges, { ...ranges[ranges.length - 1] }])} disabled={ranges.length >= 10} />
        <Button title="Save my times" icon="checkmark" size="sm" onPress={save} loading={saving} style={{ flex: 1 }} testID="save-availability" />
      </View>

      <SectionHeader title="Best times for the group" />
      <Notice tone={windows[0]?.count === p.participants.length ? 'success' : 'info'} text={summarizeBestWindow(windows, p.participants.length, tz)} />
      <View style={{ gap: 10, marginTop: 12 }}>
        {windows.map((w, i) => (
          <Card key={`${w.start}-${w.end}`} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {i === 0 ? <Icon name="trophy" size={18} color={colors.success} /> : <Icon name="time-outline" size={18} color={colors.textMuted} />}
              <Text variant="bodyStrong" style={{ flex: 1 }}>{formatRange(w.start, w.end, tz)}</Text>
              <Pill label={`${w.count}/${p.participants.length}`} tone={w.count === p.participants.length ? 'success' : 'primary'} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {w.userIds.map((u) => (
                <View key={u} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Avatar name={people.get(u)?.displayName ?? '?'} uri={people.get(u)?.avatarUrl} seed={u} size={20} />
                  <Text variant="tiny" color="muted">{u === meId ? 'You' : people.get(u)?.displayName}</Text>
                </View>
              ))}
            </View>
            {canEdit ? <Button title="Use this time" size="sm" variant={i === 0 ? 'primary' : 'secondary'} onPress={() => applyWindow(w)} /> : null}
          </Card>
        ))}
      </View>

      {timeline ? (
        <>
          <SectionHeader title="Everyone’s times" />
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="tiny" color="subtle">{formatDay(timeline.min, tz)} {formatTime(timeline.min, tz)}</Text>
              <Text variant="tiny" color="subtle">{formatDay(timeline.max, tz)} {formatTime(timeline.max, tz)}</Text>
            </View>
            {p.participants.map((x) => {
              const segs = timeline.byUser.get(x.userId) ?? [];
              return (
                <View key={x.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Avatar name={x.profile?.displayName ?? '?'} uri={x.profile?.avatarUrl} seed={x.userId} size={24} />
                  <View style={{ flex: 1, height: 18, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }} accessibilityLabel={`${x.profile?.displayName}: ${segs.length ? segs.map((s) => formatRange(s.s, s.e, tz)).join(', ') : 'no times yet'}`}>
                    {windows[0] ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: `${((windows[0].start - timeline.min) / timeline.span) * 100}%`, width: `${((windows[0].end - windows[0].start) / timeline.span) * 100}%`, backgroundColor: colors.successSoft }} /> : null}
                    {segs.map((s, k) => (
                      <View key={k} style={{ position: 'absolute', top: 3, bottom: 3, borderRadius: 4, left: `${((s.s - timeline.min) / timeline.span) * 100}%`, width: `${((s.e - s.s) / timeline.span) * 100}%`, backgroundColor: x.userId === meId ? colors.primary : colors.secondary }} />
                    ))}
                  </View>
                  {!segs.length ? <Text variant="tiny" color="subtle">—</Text> : null}
                </View>
              );
            })}
            <Text variant="tiny" color="subtle">Green = best overlap. People who haven’t answered aren’t counted as free.</Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
