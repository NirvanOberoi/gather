import React, { useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import type { TextInputInstance } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/tokens';
import { Avatar, Button, Chip, EmptyState, Icon, IconButton, ListRow, Notice, Sheet, Text } from '@/components/ui';
import { DemoBanner } from '@/components/common/DemoBanner';
import { AiMessage, AiThinking } from '@/components/chat/AiMessage';
import { RecommendationSheet } from '@/components/recommendations/RecommendationSheet';
import { useAiConversations, useAiMessages, useAiUsage, usePrivacy, qk } from '@/hooks/data';
import { useSaveToggle } from '@/hooks/useSaveToggle';
import { useShareRecommendation } from '@/hooks/useShareRecommendation';
import { backend } from '@/services/backend';
import { useDrafts } from '@/state/drafts';
import { toast } from '@/state/toast';
import { confirm } from '@/lib/confirm';
import { relativeTime } from '@/domain/time';
import type { AiMessage as AiMsg, Recommendation } from '@/types/models';

const STARTERS = [
  'What are some fun things I can do this weekend?',
  'Find activities for five friends under $25 each',
  'What are some good places to eat nearby?',
  'Help me plan a birthday hangout',
  'What can I do indoors when it’s raining?',
];

function optimisticUserMessage(conversationId: string | null, content: string): AiMsg {
  return { id: `tmp_${Math.random().toString(36).slice(2)}`, conversationId: conversationId ?? '', role: 'user', content, response: null, createdAt: new Date().toISOString() };
}

export default function Assistant() {
  const params = useLocalSearchParams<{ c?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(params.c ?? null);
  const convs = useAiConversations();
  const history = useAiMessages(conversationId);
  const usage = useAiUsage();
  const privacy = usePrivacy();
  // Messages added in this session (optimistic + fresh replies), merged over server history.
  const [pending, setPending] = useState<AiMsg[]>([]);
  const local = useMemo(() => {
    const base = conversationId ? history.data ?? [] : [];
    const seen = new Set(base.map((m) => m.id));
    return [...base, ...pending.filter((m) => !seen.has(m.id))];
  }, [conversationId, history.data, pending]);
  const setLocal = setPending;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detail, setDetail] = useState<Recommendation | null>(null);
  const { isSaved, toggle, version: savedVersion } = useSaveToggle();
  const share = useShareRecommendation();
  const setPlanPlace = useDrafts((s) => s.setPlanPlace);
  const listRef = useRef<FlatList<AiMsg>>(null);
  const inputRef = useRef<TextInputInstance>(null);

  const send = async (q?: string) => {
    const body = (q ?? text).trim();
    if (!body || busy) return;
    setText('');
    setBusy(true);
    const optimistic = optimisticUserMessage(conversationId, body);
    setLocal((l) => [...l, optimistic]);
    try {
      const r = await backend().ai.sendPrivate(conversationId, body);
      setConversationId(r.conversationId);
      setLocal((l) => [...l.filter((m) => m.id !== optimistic.id), ...r.messages]);
      qc.invalidateQueries({ queryKey: qk.aiConvs });
      qc.invalidateQueries({ queryKey: qk.usage });
    } catch (e) {
      setLocal((l) => l.filter((m) => m.id !== optimistic.id));
      setText(body);
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const remaining = usage.data ? Math.max(0, usage.data.dailyLimit - usage.data.usedToday) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <DemoBanner />
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 4 }}>
          <IconButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <Avatar name="Gather" ai size={36} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text variant="bodyStrong">Gather AI</Text>
            <Text variant="tiny" color="muted">Private · only you can see this</Text>
          </View>
          <IconButton icon="time-outline" label="Chat history" onPress={() => setHistoryOpen(true)} />
          <IconButton icon="create-outline" label="New chat" onPress={() => { setConversationId(null); setLocal([]); }} />
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={local}
        extraData={savedVersion}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 20, flexGrow: 1 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={{ gap: 14, paddingTop: 20 }}>
            <EmptyState icon="sparkles" title="What are you in the mood for?" body="I use the preferences you’ve chosen to share with Gather AI, plus anything you tell me here." compact />
            {privacy.data && !privacy.data.storePrivateAiHistory ? <Notice text="Chat history is off — this conversation won’t be saved." /> : null}
            <View style={{ gap: 8 }}>
              {STARTERS.map((s) => <Chip key={s} label={s} icon="sparkles-outline" onPress={() => send(s)} />)}
            </View>
          </View>
        }
        renderItem={({ item }) =>
          item.role === 'user' ? (
            <View style={{ alignSelf: 'flex-end', maxWidth: '82%', marginVertical: 6, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.xl, borderBottomRightRadius: 6 }}>
              <Text variant="body" color="#fff">{item.content}</Text>
            </View>
          ) : item.response ? (
            <AiMessage
              response={item.response}
              createdAt={item.createdAt}
              cardProps={(r) => ({ onPress: () => setDetail(r), onSave: () => toggle(r), saved: isSaved(r), onVote: () => { setPlanPlace(r); router.push('/plan/new'); }, voteLabel: 'Plan it' })}
              onAnswer={() => inputRef.current?.focus()}
            />
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>
              <Avatar name="Gather" ai size={30} />
              <View style={{ flex: 1, backgroundColor: colors.primarySoft, padding: 12, borderRadius: radius.xl, borderTopLeftRadius: 6 }}>
                <Text variant="body">{item.content}</Text>
              </View>
            </View>
          )
        }
        ListFooterComponent={busy ? <AiThinking label="Finding ideas that fit what you’ve shared…" /> : undefined}
      />

      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, padding: 10, paddingBottom: insets.bottom + 10, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.xl, paddingHorizontal: 14, minHeight: 46, justifyContent: 'center' }}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder="Ask for ideas, follow up, change the budget…"
              placeholderTextColor={colors.textSubtle}
              multiline
              maxLength={1000}
              accessibilityLabel="Ask Gather"
              style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 15, paddingVertical: 11, maxHeight: 120 }}
            />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!text.trim() || busy} onPress={() => send()} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: text.trim() && !busy ? colors.primary : colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="arrow-up" size={21} color={text.trim() && !busy ? '#fff' : colors.textSubtle} />
          </Pressable>
        </View>
        {remaining !== null ? (
          <Text variant="tiny" color="subtle" align="center">
            {remaining} AI requests left today{usage.data?.tier === 'free' ? ' · ' : ''}
            {usage.data?.tier === 'free' ? <Text variant="tiny" color="primary" onPress={() => router.push('/premium')}>Get more with Plus</Text> : null}
          </Text>
        ) : null}
      </View>

      <Sheet visible={historyOpen} onClose={() => setHistoryOpen(false)} title="Your private chats">
        {convs.data?.length ? (
          <>
            {convs.data.map((c) => (
              <ListRow
                key={c.id}
                icon="chatbubble-ellipses-outline"
                title={c.title}
                subtitle={relativeTime(c.updatedAt)}
                onPress={() => { setConversationId(c.id); setPending([]); setHistoryOpen(false); }}
                right={
                  <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${c.title}`} hitSlop={10} onPress={async () => {
                    try {
                      await backend().ai.deleteConversation(c.id);
                      if (c.id === conversationId) { setConversationId(null); setLocal([]); }
                      qc.invalidateQueries({ queryKey: qk.aiConvs });
                    } catch (e) { toast.error(e); }
                  }}>
                    <Icon name="trash-outline" size={19} color={colors.danger} />
                  </Pressable>
                }
              />
            ))}
            <Button title="Delete all private chats" variant="ghost" icon="trash-outline" onPress={() => confirm('Delete all private chats?', 'This permanently removes your assistant history.', 'Delete', async () => {
              try {
                await backend().ai.deleteAllPrivate();
                setConversationId(null);
                setLocal([]);
                qc.invalidateQueries({ queryKey: qk.aiConvs });
                setHistoryOpen(false);
                toast.success('Deleted');
              } catch (e) { toast.error(e); }
            })} />
          </>
        ) : (
          <Text variant="body" color="muted" style={{ paddingVertical: 16 }}>No saved conversations.</Text>
        )}
      </Sheet>
      <RecommendationSheet rec={detail} onClose={() => setDetail(null)} onShare={(r) => { setDetail(null); share.open(r); }} />
      {share.sheet}
    </KeyboardAvoidingView>
  );
}
