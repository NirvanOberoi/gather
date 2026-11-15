import React, { useMemo, useState } from 'react';
import { Linking, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { categoryArt, radius } from '@/theme/tokens';
import { Avatar, Button, Card, Divider, ErrorState, Icon, IconButton, Input, ListRow, Notice, Pill, Screen, Segmented, Sheet, SkeletonList, Text } from '@/components/ui';
import { StatusPill } from '@/components/plans/StatusPill';
import { RecommendationCard } from '@/components/recommendations/RecommendationCard';
import { RecommendationSheet } from '@/components/recommendations/RecommendationSheet';
import { GroupPickerSheet } from '@/components/common/GroupPickerSheet';
import { useAvailability, useFriends, useGroup, usePlan, usePlanRealtime, qk } from '@/hooks/data';
import { backend } from '@/services/backend';
import { canEditPlan } from '@/domain/permissions';
import { bestWindows, summarizeBestWindow } from '@/domain/availability';
import { formatRange } from '@/domain/time';
import { useSession } from '@/state/session';
import { toast } from '@/state/toast';
import type { Recommendation, Rsvp } from '@/types/models';

export default function PlanDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const planId = String(id);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const meId = useSession((s) => s.profile?.id ?? '');
  const plan = usePlan(planId);
  usePlanRealtime(planId);
  const availability = useAvailability(planId);
  const group = useGroup(plan.data?.groupId ?? '');
  const friends = useFriends();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', budgetText: '', locationText: '' });
  const [shareGroup, setShareGroup] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [detail, setDetail] = useState<Recommendation | null>(null);

  const p = plan.data;
  const windows = useMemo(
    () => bestWindows((availability.data ?? []).map((a) => ({ userId: a.userId, start: new Date(a.startsAt).getTime(), end: new Date(a.endsAt).getTime() }))),
    [availability.data],
  );

  if (plan.isLoading) return <Screen><SkeletonList rows={5} /></Screen>;
  if (plan.error || !p) return <Screen><IconButton icon="chevron-back" label="Back" onPress={() => router.back()} /><ErrorState error={plan.error} onRetry={() => plan.refetch()} /></Screen>;

  const me = p.participants.find((x) => x.userId === meId);
  const canEdit = canEditPlan({ userId: meId, createdBy: p.createdBy, groupRole: group.data?.myRole ?? null, isParticipant: !!me }).ok;
  const organizer = p.participants.find((x) => x.userId === p.createdBy)?.profile;
  const art = categoryArt[p.place?.category ?? 'other'];
  const respondents = new Set((availability.data ?? []).map((a) => a.userId)).size;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.plan(planId) });
    qc.invalidateQueries({ queryKey: qk.plans });
  };
  const update = async (patch: Parameters<ReturnType<typeof backend>['plans']['update']>[1], msg?: string) => {
    try {
      await backend().plans.update(planId, patch);
      refresh();
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error(e);
    }
  };
  const rsvp = async (v: Rsvp) => {
    try {
      await backend().plans.setRsvp(planId, v);
      refresh();
    } catch (e) {
      toast.error(e);
    }
  };
  const shareOut = async () => {
    const when = p.startsAt ? formatRange(new Date(p.startsAt).getTime(), new Date(p.endsAt ?? p.startsAt).getTime(), p.timezone) : 'time TBD';
    await Share.share({ message: `${p.title} — ${when}${p.place ? ` · ${p.place.title}` : ''}${p.locationText ? ` (${p.locationText})` : ''}\nPlanned with Gather` }).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen padded={false} edges={[]}>
        <LinearGradient colors={art.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top + 4, paddingBottom: 26, paddingHorizontal: 12, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IconButton icon="chevron-back" label="Back" color="#fff" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/plans'))} />
            <View style={{ flex: 1 }} />
            <IconButton icon="share-outline" label="Share plan" color="#fff" onPress={shareOut} />
            {canEdit ? <IconButton icon="create-outline" label="Edit plan" color="#fff" onPress={() => { setForm({ title: p.title, description: p.description ?? '', budgetText: p.budgetText ?? '', locationText: p.locationText ?? '' }); setEditing(true); }} /> : null}
          </View>
          <View style={{ paddingHorizontal: 8, gap: 8, marginTop: 6 }}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.92)', alignSelf: 'flex-start', borderRadius: radius.pill }}><StatusPill status={p.status} /></View>
            <Text variant="title" color="#fff">{p.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="time-outline" size={16} color="#fff" />
              <Text variant="bodyStrong" color="#fff">{p.startsAt ? formatRange(new Date(p.startsAt).getTime(), new Date(p.endsAt ?? p.startsAt).getTime(), p.timezone) : 'Time TBD'}</Text>
            </View>
            {organizer ? <Text variant="caption" color="rgba(255,255,255,0.85)">Organized by {organizer.id === meId ? 'you' : organizer.displayName}{group.data ? ` · ${group.data.name}` : ''}</Text> : null}
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 20, gap: 16, marginTop: 18 }}>
          {p.status !== 'canceled' && p.status !== 'completed' ? (
            <View style={{ gap: 8 }}>
              <Text variant="label" color="muted">Are you going?</Text>
              <Segmented<Rsvp>
                value={me?.rsvp === 'invited' || !me ? ('' as Rsvp) : me.rsvp}
                onChange={rsvp}
                options={[{ value: 'going', label: '🙌 Going' }, { value: 'maybe', label: '🤔 Maybe' }, { value: 'declined', label: '😕 Can’t' }]}
              />
            </View>
          ) : null}

          {p.status === 'planning' ? (
            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="people-circle-outline" size={22} color={colors.primary} />
                <Text variant="bodyStrong" style={{ flex: 1 }}>Find a time</Text>
                <Pill label={`${respondents}/${p.participants.length} added`} tone="neutral" />
              </View>
              <Text variant="body" color={windows.length ? 'text' : 'muted'}>{summarizeBestWindow(windows, p.participants.length, p.timezone)}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Add availability" icon="calendar-outline" size="sm" onPress={() => router.push(`/plan/availability/${planId}`)} style={{ flex: 1 }} />
                {canEdit && windows[0] ? (
                  <Button title="Use best time" size="sm" variant="secondary" onPress={() => update({ startsAt: new Date(windows[0].start).toISOString(), endsAt: new Date(windows[0].end).toISOString() }, 'Time set')} style={{ flex: 1 }} />
                ) : null}
              </View>
            </Card>
          ) : null}

          {canEdit && p.status === 'planning' ? (
            p.startsAt ? <Button title="Confirm plan" icon="checkmark-circle" variant="ai" size="lg" onPress={() => update({ status: 'confirmed' }, 'Plan confirmed 🎉')} full />
              : <Notice text="Set a time (use the best overlap above) to confirm the plan." />
          ) : null}

          {p.place ? (
            <View style={{ gap: 8 }}>
              <Text variant="label" color="muted">The plan</Text>
              <RecommendationCard rec={p.place} width={340} onPress={() => setDetail(p.place)} />
            </View>
          ) : p.activity ? <ListRow icon="sparkles-outline" title={p.activity} chevron={false} /> : null}

          <Card style={{ paddingVertical: 4 }}>
            {p.locationText ? <ListRow icon="location-outline" title={p.locationText} subtitle="General area" onPress={p.place?.mapsUrl && p.place.source !== 'demo_sample' ? () => Linking.openURL(p.place!.mapsUrl!) : undefined} chevron={false} /> : null}
            {p.budgetText ? <><Divider /><ListRow icon="wallet-outline" title={p.budgetText} subtitle="Budget" chevron={false} /></> : null}
            {p.description ? <><Divider /><ListRow icon="document-text-outline" title={p.description} chevron={false} /></> : null}
            {!p.locationText && !p.budgetText && !p.description ? <ListRow icon="information-circle-outline" title="No extra details yet" chevron={false} /> : null}
          </Card>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="heading" style={{ flex: 1 }}>Who’s in · {p.participants.filter((x) => x.rsvp === 'going').length}</Text>
            {me ? <Button title="Invite" icon="person-add-outline" size="sm" variant="secondary" onPress={() => setInviting(true)} /> : null}
          </View>
          <Card style={{ paddingVertical: 4 }}>
            {p.participants.map((x, i) => (
              <View key={x.userId}>
                {i ? <Divider /> : null}
                <ListRow
                  left={<Avatar name={x.profile?.displayName || '?'} uri={x.profile?.avatarUrl} seed={x.userId} size={40} />}
                  title={`${x.profile?.displayName ?? 'Deleted user'}${x.userId === meId ? ' (you)' : ''}`}
                  subtitle={x.role === 'organizer' ? 'Organizer' : undefined}
                  chevron={false}
                  right={<Pill label={x.rsvp === 'going' ? 'Going' : x.rsvp === 'maybe' ? 'Maybe' : x.rsvp === 'declined' ? 'Can’t' : 'Invited'} tone={x.rsvp === 'going' ? 'success' : x.rsvp === 'declined' ? 'danger' : x.rsvp === 'maybe' ? 'warning' : 'neutral'} />}
                />
              </View>
            ))}
          </Card>

          <View style={{ gap: 10 }}>
            <Button title="Share to a group chat" icon="chatbubbles-outline" variant="outline" onPress={() => setShareGroup(true)} full />
            {canEdit && p.status === 'confirmed' ? <Button title="Mark as completed" icon="flag-outline" variant="secondary" onPress={() => update({ status: 'completed' }, 'Nice! Marked completed')} full /> : null}
            {canEdit && (p.status === 'planning' || p.status === 'confirmed') ? <Button title="Cancel plan" variant="ghost" icon="close-circle-outline" onPress={() => update({ status: 'canceled' }, 'Plan canceled')} full /> : null}
          </View>
        </View>
      </Screen>

      <Sheet visible={editing} onClose={() => setEditing(false)} title="Edit plan">
        <View style={{ gap: 12 }}>
          <Input label="Title" value={form.title} onChangeText={(title) => setForm({ ...form, title })} maxLength={80} />
          <Input label="General location" value={form.locationText} onChangeText={(locationText) => setForm({ ...form, locationText })} maxLength={160} />
          <Input label="Budget" value={form.budgetText} onChangeText={(budgetText) => setForm({ ...form, budgetText })} maxLength={60} />
          <Input label="Notes" value={form.description} onChangeText={(description) => setForm({ ...form, description })} maxLength={1000} multiline />
          <Button title="Change time" variant="secondary" icon="time-outline" onPress={() => { setEditing(false); router.push(`/plan/availability/${planId}`); }} full />
          <Button title="Save" onPress={() => { setEditing(false); update({ title: form.title.trim(), description: form.description.trim() || null, budgetText: form.budgetText.trim() || null, locationText: form.locationText.trim() || null }, 'Plan updated'); }} full />
        </View>
      </Sheet>
      <GroupPickerSheet visible={shareGroup} onClose={() => setShareGroup(false)} onPick={async (gid) => { setShareGroup(false); try { await backend().plans.shareToGroup(planId, gid); toast.success('Shared to the group'); } catch (e) { toast.error(e); } }} />
      <Sheet visible={inviting} onClose={() => setInviting(false)} title="Invite friends">
        {(friends.data ?? []).filter((f) => !p.participants.some((x) => x.userId === f.id)).map((f) => (
          <ListRow key={f.id} left={<Avatar name={f.displayName} uri={f.avatarUrl} seed={f.id} size={40} />} title={f.displayName} subtitle={`@${f.username}`}
            right={<Button title="Invite" size="sm" onPress={async () => { try { await backend().plans.invite(planId, [f.id]); refresh(); toast.success(`Invited ${f.displayName}`); } catch (e) { toast.error(e); } }} />} />
        ))}
        {(friends.data ?? []).every((f) => p.participants.some((x) => x.userId === f.id)) ? <Text variant="body" color="muted" style={{ paddingVertical: 16 }}>Everyone’s already invited.</Text> : null}
      </Sheet>
      <RecommendationSheet rec={detail} onClose={() => setDetail(null)} />
    </View>
  );
}
