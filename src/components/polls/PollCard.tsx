import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { AvatarStack, Button, Icon, Pill, ProgressBar, Skeleton, Text } from '@/components/ui';
import { usePoll, qk } from '@/hooks/data';
import { backend } from '@/services/backend';
import { canClosePoll, type GroupRole } from '@/domain/permissions';
import { determineWinner, tally } from '@/domain/voting';
import { deviceTimeZone } from '@/domain/time';
import { toast } from '@/state/toast';
import type { GroupMember } from '@/types/models';

export function PollCard({ pollId, meId, members, myRole }: { pollId: string; meId: string; members: GroupMember[]; myRole: GroupRole | null }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { data: poll, isLoading, error } = usePoll(pollId);
  const [busy, setBusy] = useState<string | null>(null);

  if (isLoading) return <View style={{ gap: 10, padding: 16 }}><Skeleton width="70%" /><Skeleton height={40} /><Skeleton height={40} /></View>;
  if (error || !poll) return <Text variant="caption" color="muted" style={{ padding: 16 }}>This poll isn’t available.</Text>;

  const { rows, totalVoters } = tally(poll.options.map((o) => o.id), poll.votes);
  const mine = new Set(poll.votes.filter((v) => v.userId === meId).map((v) => v.optionId));
  const result = determineWinner(rows);
  const leading = result.status === 'winner' ? result.optionId : null;
  const closed = poll.status === 'closed';
  const canClose = canClosePoll({ userId: meId, pollCreatorId: poll.createdBy, role: myRole }).ok;
  const memberById = new Map(members.map((m) => [m.userId, m.profile]));

  const vote = async (optionId: string) => {
    if (closed) return;
    Haptics.selectionAsync().catch(() => {});
    const next = poll.allowMultiple ? (mine.has(optionId) ? [...mine].filter((x) => x !== optionId) : [...mine, optionId]) : mine.has(optionId) ? [] : [optionId];
    setBusy(optionId);
    // optimistic update
    qc.setQueryData(qk.poll(pollId), { ...poll, votes: [...poll.votes.filter((v) => v.userId !== meId), ...next.map((o) => ({ pollId, optionId: o, userId: meId }))] });
    try {
      await backend().polls.vote(pollId, next);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
      qc.invalidateQueries({ queryKey: qk.poll(pollId) });
    }
  };

  const close = async (winner: string | null) => {
    try {
      await backend().polls.close(pollId, winner);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      qc.invalidateQueries({ queryKey: qk.poll(pollId) });
    } catch (e) {
      toast.error(e);
    }
  };

  const makePlan = async () => {
    try {
      const plan = await backend().plans.createFromPoll(pollId, { timezone: deviceTimeZone() });
      qc.invalidateQueries({ queryKey: qk.plans });
      router.push(`/plan/${plan.id}`);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <View style={{ padding: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="stats-chart" size={16} color={colors.primary} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>{poll.question}</Text>
        <Pill label={closed ? 'Closed' : poll.allowMultiple ? 'Pick any' : 'Pick one'} tone={closed ? 'neutral' : 'primary'} />
      </View>
      {poll.options.map((o) => {
        const row = rows.find((r) => r.optionId === o.id)!;
        const isWinner = closed && poll.winningOptionId === o.id;
        const voters = row.voterIds.filter((id) => !id.startsWith('hidden')).map((id) => ({ id, name: memberById.get(id)?.displayName || memberById.get(id)?.username || '?', uri: memberById.get(id)?.avatarUrl }));
        const hidden = row.voterIds.length - voters.length;
        return (
          <Pressable
            key={o.id}
            disabled={closed || !!busy}
            onPress={() => vote(o.id)}
            accessibilityRole={poll.allowMultiple ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: mine.has(o.id), disabled: closed }}
            accessibilityLabel={`${o.label}, ${row.count} votes`}
            style={({ pressed }) => ({
              padding: 12, borderRadius: radius.lg, gap: 8, opacity: pressed ? 0.8 : 1,
              backgroundColor: isWinner ? colors.successSoft : mine.has(o.id) ? colors.primarySoft : colors.surfaceAlt,
              borderWidth: 1.5, borderColor: isWinner ? colors.success : mine.has(o.id) ? colors.primary : 'transparent',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon
                name={isWinner ? 'trophy' : mine.has(o.id) ? (poll.allowMultiple ? 'checkbox' : 'radio-button-on') : poll.allowMultiple ? 'square-outline' : 'radio-button-off'}
                size={18}
                color={isWinner ? colors.success : mine.has(o.id) ? colors.primary : colors.textSubtle}
              />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>{o.label}</Text>
                {o.description ? <Text variant="caption" color="muted" numberOfLines={1}>{o.description}</Text> : null}
              </View>
              <Text variant="caption" color="muted">{row.count}</Text>
            </View>
            <ProgressBar value={row.share} color={isWinner ? colors.success : leading === o.id ? colors.primary : colors.secondary} />
            {voters.length || hidden ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {voters.length ? <AvatarStack people={voters} size={20} /> : null}
                {hidden ? <Text variant="tiny" color="subtle">+{hidden} private</Text> : null}
              </View>
            ) : null}
          </Pressable>
        );
      })}
      <Text variant="caption" color="muted">
        {totalVoters} of {members.length} voted{!closed && result.status === 'tie' ? ' · tied' : ''}{!closed ? ' · you can change your vote until it closes' : ''}
      </Text>
      {!closed && canClose ? (
        result.status === 'tie' ? (
          <View style={{ gap: 8 }}>
            <Text variant="caption" color="muted">It’s a tie — pick the winner to close:</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {result.optionIds.map((id) => (
                <Button key={id} size="sm" variant="secondary" title={poll.options.find((o) => o.id === id)!.label} onPress={() => close(id)} />
              ))}
            </View>
          </View>
        ) : (
          <Button title="Close poll & pick winner" icon="flag-outline" size="sm" variant="outline" onPress={() => close(null)} />
        )
      ) : null}
      {closed && poll.winningOptionId ? (
        poll.planId ? (
          <Button title="View plan" icon="calendar" size="sm" variant="secondary" onPress={() => router.push(`/plan/${poll.planId}`)} />
        ) : (
          <Button title="Make it a plan" icon="calendar" size="sm" variant="ai" onPress={makePlan} />
        )
      ) : null}
    </View>
  );
}
