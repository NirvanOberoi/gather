import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeProvider';
import { Button, Header, Icon, Input, Notice, Screen, Text, ToggleRow } from '@/components/ui';
import { backend } from '@/services/backend';
import { useDrafts } from '@/state/drafts';
import { toast } from '@/state/toast';
import { qk } from '@/hooks/data';
import type { Recommendation } from '@/types/models';

interface Opt { label: string; description: string | null; recommendation: Recommendation | null }

export default function NewPoll() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const recs = useDrafts((s) => s.pollRecommendations);
  const [question, setQuestion] = useState(recs.length ? 'What should we do?' : '');
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [options, setOptions] = useState<Opt[]>(
    recs.length ? recs.slice(0, 8).map((r) => ({ label: r.title.slice(0, 80), description: r.estimatedCost?.label ?? r.locationText, recommendation: r })) : [{ label: '', description: null, recommendation: null }, { label: '', description: null, recommendation: null }],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const opts = options.filter((o) => o.label.trim());
    if (!question.trim()) return setError('Ask a question.');
    if (opts.length < 2) return setError('Add at least two options.');
    setBusy(true);
    try {
      await backend().polls.create(String(groupId), { question: question.trim(), allowMultiple, options: opts });
      qc.invalidateQueries({ queryKey: qk.polls(String(groupId)) });
      useDrafts.getState().setPollRecommendations([]);
      router.back();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard>
      <Header title="New poll" right={<Button title="Post" size="sm" onPress={submit} loading={busy} />} />
      <View style={{ gap: 14, marginTop: 8 }}>
        <Input label="Question" value={question} onChangeText={(t) => { setQuestion(t); setError(null); }} placeholder="Where should we eat?" maxLength={140} />
        <Text variant="label" color="muted">Options</Text>
        {options.map((o, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Input value={o.label} onChangeText={(t) => setOptions(options.map((x, j) => (j === i ? { ...x, label: t } : x)))} placeholder={`Option ${i + 1}`} maxLength={80} hint={o.recommendation ? `From Gather · ${o.description ?? ''}` : undefined} />
            </View>
            {options.length > 2 ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove option ${i + 1}`} hitSlop={10} onPress={() => setOptions(options.filter((_, j) => j !== i))}>
                <Icon name="close-circle" size={24} color={colors.textSubtle} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {options.length < 8 ? <Button title="Add option" icon="add" variant="secondary" size="sm" onPress={() => setOptions([...options, { label: '', description: null, recommendation: null }])} style={{ alignSelf: 'flex-start' }} /> : null}
        <ToggleRow icon="checkbox-outline" title="Allow multiple choices" subtitle="Members can pick more than one option" value={allowMultiple} onChange={setAllowMultiple} />
        {error ? <Notice tone="danger" text={error} /> : null}
        <Text variant="caption" color="subtle">Everyone in the group can vote and change their vote until the poll closes. The creator or an admin closes it.</Text>
      </View>
    </Screen>
  );
}
