import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import type { TextInputInstance } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { mentionsGather, shouldAutoSuggest } from '@shared/safety.ts';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Avatar, Button, Chip, EmptyState, ErrorState, IconButton, Input, Notice, Sheet, SkeletonList, Text } from '@/components/ui';
import { DemoBanner } from '@/components/common/DemoBanner';
import { MessageBubble, SystemMessage, DayDivider } from '@/components/chat/MessageBubble';
import { AiMessage, AiThinking } from '@/components/chat/AiMessage';
import { Composer } from '@/components/chat/Composer';
import { PollCard } from '@/components/polls/PollCard';
import { PlanCard } from '@/components/plans/PlanCard';
import { RecommendationCard } from '@/components/recommendations/RecommendationCard';
import { RecommendationSheet } from '@/components/recommendations/RecommendationSheet';
import { useGroup, usePlan, usePoll, useAiUsage, qk } from '@/hooks/data';
import { useChat } from '@/hooks/useChat';
import { useSaveToggle } from '@/hooks/useSaveToggle';
import { useShareRecommendation } from '@/hooks/useShareRecommendation';
import { backend } from '@/services/backend';
import { useDrafts } from '@/state/drafts';
import { useSession } from '@/state/session';
import { toast } from '@/state/toast';
import type { Message, Profile, Recommendation } from '@/types/models';

const QUICK_PROMPTS = ['Food + something active', 'Cheap & close by', 'Indoors — it might rain', 'Chill night in the evening', 'Something new we haven’t tried'];

function PlanMessage({ planId, body }: { planId: string; body: string }) {
  const { data } = usePlan(planId);
  return (
    <View style={{ marginVertical: 8, gap: 6 }}>
      <SystemMessage text={body} />
      {data ? <PlanCard plan={data} compact /> : null}
    </View>
  );
}

function PollMessage({ pollId, meId, group }: { pollId: string; meId: string; group: NonNullable<ReturnType<typeof useGroup>['data']> }) {
  const { colors } = useTheme();
  usePoll(pollId);
  return (
    <View style={{ marginVertical: 8, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <PollCard pollId={pollId} meId={meId} members={group.members} myRole={group.myRole} />
    </View>
  );
}

export default function GroupChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = String(id);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const me = useSession((s) => s.profile!);
  const group = useGroup(groupId);
  const usage = useAiUsage();
  const chat = useChat(groupId);
  const [text, setText] = useState('');
  const [planning, setPlanning] = useState(false);
  const [planSheet, setPlanSheet] = useState(false);
  const [planPrompt, setPlanPrompt] = useState('');
  const [detail, setDetail] = useState<Recommendation | null>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const { isSaved, toggle, version: savedVersion } = useSaveToggle();
  const [pollTick, setPollTick] = useState(0);
  const share = useShareRecommendation();
  const aiPolls = useDrafts((s) => s.aiPolls);
  const linkAiPoll = useDrafts((s) => s.linkAiPoll);
  const setPollRecs = useDrafts((s) => s.setPollRecommendations);

  const members = useMemo(() => new Map<string, Profile>((group.data?.members ?? []).map((m) => [m.userId, m.profile])), [group.data]);

  const askGather = async (prompt: string | undefined, trigger: 'mention' | 'button' | 'auto') => {
    setPlanning(true);
    try {
      await backend().ai.planForGroup(groupId, { prompt, trigger });
    } catch (e) {
      if (trigger !== 'auto') toast.error(e);
    } finally {
      setPlanning(false);
      qc.invalidateQueries({ queryKey: qk.usage });
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      await chat.send(body, { senderId: me.id });
      if (mentionsGather(body)) {
        await askGather(body.replace(/@gather/gi, '').trim() || undefined, 'mention');
      } else if (group.data?.aiAutoSuggest) {
        const human = chat.messages.filter((m) => m.kind === 'text' && m.senderId).slice(-12);
        const lastAi = [...chat.messages].reverse().find((m) => m.kind === 'ai');
        const now = Date.now();
        const ok = shouldAutoSuggest({
          groupOptedIn: true,
          lastAutoSuggestAt: null, // server enforces the 2h cooldown authoritatively
          lastAiMessageAt: lastAi ? new Date(lastAi.createdAt).getTime() : null,
          recent: [...human.map((m) => ({ authorId: m.senderId!, text: m.body, at: new Date(m.createdAt).getTime() })), { authorId: me.id, text: body, at: now }],
          now,
        });
        if (ok) askGather(undefined, 'auto');
      }
    } catch {
      /* failed state is shown on the bubble with retry */
    }
  };

  const voteFromCard = async (message: Message, rec: Recommendation) => {
    if (message.payload?.type !== 'ai') return;
    const recs = message.payload.response.recommendations;
    try {
      let pollId = aiPolls[message.id];
      let poll = pollId ? await backend().polls.get(pollId).catch(() => null) : null;
      if (!poll || poll.status === 'closed') {
        poll = await backend().polls.create(groupId, {
          question: 'Which one should we do?',
          allowMultiple: false,
          options: recs.slice(0, 6).map((r) => ({ label: r.title.slice(0, 80), description: r.estimatedCost?.label ?? r.locationText ?? null, recommendation: r })),
        });
        linkAiPoll(message.id, poll.id);
        toast.success('Started a poll with these options');
      }
      pollId = poll.id;
      const option = poll.options.find((o) => o.recommendation?.id === rec.id) ?? poll.options.find((o) => o.label === rec.title.slice(0, 80));
      if (option) {
        await backend().polls.vote(pollId, [option.id]);
        qc.invalidateQueries({ queryKey: qk.poll(pollId) });
      }
    } catch (e) {
      toast.error(e);
    }
  };

  React.useEffect(() => qc.getQueryCache().subscribe((e) => {
    // Only real data changes — observer events fire on every render and would loop.
    if (e.type === 'updated' && e.action.type === 'success' && e.query.queryKey[0] === 'poll') setPollTick((t) => t + 1);
  }), [qc]);

  const votedRecIds = (message: Message): Set<string> => {
    const pollId = aiPolls[message.id];
    const poll = pollId ? (qc.getQueryData(qk.poll(pollId)) as import('@/types/models').Poll | undefined) : undefined;
    if (!poll) return new Set();
    const mine = new Set(poll.votes.filter((v) => v.userId === me.id).map((v) => v.optionId));
    return new Set(poll.options.filter((o) => mine.has(o.id)).map((o) => o.recommendation?.id ?? ''));
  };

  // Build render rows (chronological), then reverse for the inverted list.
  const rows = useMemo(() => {
    const list = chat.messages;
    const out: { key: string; m: Message; first: boolean; last: boolean; day: boolean }[] = [];
    list.forEach((m, i) => {
      const prev = list[i - 1];
      const next = list[i + 1];
      const groupable = (x?: Message) => !!x && (x.kind === 'text' || x.kind === 'share');
      const close = (a?: Message, b?: Message) => !!a && !!b && Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) < 5 * 60_000;
      const first = !(groupable(prev) && groupable(m) && prev!.senderId === m.senderId && close(prev, m));
      const last = !(groupable(next) && groupable(m) && next!.senderId === m.senderId && close(m, next));
      const day = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
      out.push({ key: m.id, m, first, last, day });
    });
    return out.reverse();
  }, [chat.messages]);

  const renderRow = ({ item }: { item: (typeof rows)[number] }) => {
    const { m } = item;
    let body: React.ReactNode;
    if (m.kind === 'system') body = <SystemMessage text={m.body} />;
    else if (m.kind === 'ai' && m.payload?.type === 'ai') {
      const p = m.payload;
      const voted = votedRecIds(m);
      body = (
        <AiMessage
          response={p.response}
          createdAt={m.createdAt}
          trigger={p.trigger}
          requesterName={p.requestedBy ? (p.requestedBy === me.id ? 'you' : members.get(p.requestedBy)?.displayName) : null}
          cardProps={(r) => ({ onPress: () => setDetail(r), onVote: () => voteFromCard(m, r), voted: voted.has(r.id), onSave: () => toggle(r), saved: isSaved(r) })}
          onCreatePoll={() => { setPollRecs(p.response.recommendations); router.push({ pathname: '/poll/new', params: { groupId } }); }}
          onAnswer={() => { setText('@Gather '); inputRef.current?.focus(); }}
        />
      );
    } else if (m.kind === 'poll' && m.payload?.type === 'poll' && group.data) body = <PollMessage pollId={m.payload.pollId} meId={me.id} group={group.data} />;
    else if (m.kind === 'plan' && m.payload?.type === 'plan') body = <PlanMessage planId={m.payload.planId} body={m.body} />;
    else {
      const mine = m.senderId === me.id;
      const sender = m.senderId ? members.get(m.senderId) ?? null : null;
      body = (
        <MessageBubble message={m} mine={mine} sender={sender} firstInGroup={item.first} lastInGroup={item.last} onRetry={() => chat.retry(m).catch(() => {})}>
          {m.kind === 'share' && m.payload?.type === 'share' ? (
            <View style={{ gap: 8, marginVertical: 2 }}>
              <Text variant="caption" color={mine ? '#fff' : 'muted'}>{mine ? 'You shared' : `${sender?.displayName ?? 'Someone'} shared`}</Text>
              <RecommendationCard rec={m.payload.recommendation} width={240} compact onPress={() => setDetail((m.payload as { recommendation: Recommendation }).recommendation)} onSave={() => toggle((m.payload as { recommendation: Recommendation }).recommendation)} saved={isSaved(m.payload.recommendation)} />
            </View>
          ) : undefined}
        </MessageBubble>
      );
    }
    return (
      <View>
        {item.day ? <DayDivider iso={m.createdAt} /> : null}
        {body}
      </View>
    );
  };

  if (group.error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingHorizontal: 20 }}>
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <ErrorState error={group.error} />
      </View>
    );
  }

  const g = group.data;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <DemoBanner />
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 4, gap: 4 }}>
          <IconButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chats'))} />
          <Pressable accessibilityRole="button" accessibilityLabel="Group info" onPress={() => router.push(`/chat/info/${groupId}`)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={g?.name ?? ''} uri={g?.photoUrl} seed={groupId} size={38} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>{g?.name ?? ' '}</Text>
              <Text variant="tiny" color="muted" numberOfLines={1}>{g ? `${g.members.length} members${g.myMembership.muted ? ' · muted' : ''}` : ' '}</Text>
            </View>
          </Pressable>
          <IconButton icon="calendar-outline" label="New plan" onPress={() => { useDrafts.getState().setPlanPlace(null); router.push({ pathname: '/plan/new', params: { groupId } }); }} />
          <IconButton icon="stats-chart-outline" label="New poll" onPress={() => { setPollRecs([]); router.push({ pathname: '/poll/new', params: { groupId } }); }} />
        </View>
        {chat.connection !== 'connected' ? (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, backgroundColor: colors.warningSoft }}>
            <ActivityIndicator size="small" color={colors.warning} />
            <Text variant="tiny" color={colors.warning}>{chat.connection === 'offline' ? 'You’re offline — messages will retry' : 'Reconnecting…'}</Text>
          </View>
        ) : null}
      </View>

      {chat.loading ? (
        <View style={{ flex: 1, padding: 20 }}><SkeletonList rows={6} /></View>
      ) : chat.error ? (
        <ErrorState error={chat.error} onRetry={chat.reload} />
      ) : (
        <FlatList
          inverted
          data={rows}
          extraData={[savedVersion, aiPolls, pollTick, planning]}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12 }}
          onEndReached={() => chat.loadOlder().catch(() => {})}
          onEndReachedThreshold={0.3}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={planning ? <AiThinking /> : undefined}
          ListEmptyComponent={<View style={{ transform: [{ scaleY: -1 }] }}><EmptyState icon="chatbubble-ellipses-outline" title="Start the conversation" body="Say what you’re in the mood for — then tap Plan and Gather will find options." /></View>}
        />
      )}

      <View style={{ paddingBottom: insets.bottom, backgroundColor: colors.surface }}>
        <Composer ref={inputRef} value={text} onChange={setText} onSend={send} onPlan={() => setPlanSheet(true)} planning={planning} />
      </View>

      <Sheet visible={planSheet} onClose={() => setPlanSheet(false)} title="Help us plan ✨">
        <View style={{ gap: 14 }}>
          <Text variant="body" color="muted">Gather reads the recent chat plus each member’s shared preferences (as a group summary — never who said what privately) and suggests options.</Text>
          <Input placeholder="Anything specific? (optional)" value={planPrompt} onChangeText={setPlanPrompt} maxLength={300} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {QUICK_PROMPTS.map((q) => <Chip key={q} label={q} selected={planPrompt === q} onPress={() => setPlanPrompt(planPrompt === q ? '' : q)} />)}
          </View>
          {g && g.members.some((m) => !m.aiSharePrefs) ? <Notice text="Some members turned off AI preferences for this group — Gather treats their preferences as unknown." /> : null}
          {usage.data ? <Text variant="caption" color="subtle">{Math.max(0, usage.data.dailyLimit - usage.data.usedToday)} of {usage.data.dailyLimit} AI requests left today</Text> : null}
          <Button
            title="Get suggestions"
            icon="sparkles"
            variant="ai"
            size="lg"
            loading={planning}
            onPress={() => {
              setPlanSheet(false);
              const p = planPrompt.trim();
              setPlanPrompt('');
              askGather(p || undefined, 'button');
            }}
            full
            testID="get-suggestions"
          />
          <Text variant="caption" color="subtle" align="center">Tip: you can also mention @Gather in a message.</Text>
        </View>
      </Sheet>
      <RecommendationSheet rec={detail} onClose={() => setDetail(null)} onShare={(r) => { setDetail(null); share.open(r); }} />
      {share.sheet}
    </KeyboardAvoidingView>
  );
}
