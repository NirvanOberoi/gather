import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { PlanResponse, Recommendation } from '@shared/recommendation.ts';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Avatar, Button, Chip, Notice, Text } from '@/components/ui';
import { RecommendationCarousel } from '@/components/recommendations/RecommendationCarousel';
import type { RecommendationCardProps } from '@/components/recommendations/RecommendationCard';
import { timeLabel } from './MessageBubble';

export function constraintChips(c: PlanResponse['constraints']): string[] {
  if (!c) return [];
  const out: string[] = [];
  if (c.budgetMaxPerPerson !== null) out.push(c.budgetMaxPerPerson === 0 ? '💸 Free' : `💸 ≤ $${c.budgetMaxPerPerson}`);
  if (c.nearbyOnly) out.push('📍 Nearby');
  if (c.timeWindow) out.push(`🕒 ${c.timeWindow}`);
  if (c.groupSize) out.push(`👥 ${c.groupSize}`);
  for (const i of c.interests.slice(0, 4)) out.push(`✨ ${i}`);
  for (const a of c.avoid.slice(0, 2)) out.push(`🚫 ${a}`);
  return out;
}

export function AiMessage({ response, createdAt, requesterName, trigger, cardProps, onCreatePoll, onAnswer, inset = 0 }: {
  response: PlanResponse; createdAt?: string; requesterName?: string | null; trigger?: 'mention' | 'button' | 'auto';
  cardProps: (r: Recommendation) => Partial<RecommendationCardProps>; onCreatePoll?: () => void; onAnswer?: (q: string) => void; inset?: number;
}) {
  const { colors } = useTheme();
  const chips = constraintChips(response.constraints);
  return (
    <View style={{ marginVertical: 12, gap: 10 }} accessibilityLabel="Gather AI message">
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingHorizontal: inset }}>
        <Avatar name="Gather" ai size={30} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text variant="tiny" color="primary">GATHER AI</Text>
            {response.generatedBy === 'demo_planner' ? <Text variant="tiny" color="subtle">· demo planner</Text> : null}
            {trigger === 'auto' ? <Text variant="tiny" color="subtle">· auto-suggestion (group opted in)</Text> : requesterName ? <Text variant="tiny" color="subtle">· asked by {requesterName}</Text> : null}
            {createdAt ? <Text variant="tiny" color="subtle">· {timeLabel(createdAt)}</Text> : null}
          </View>
          <LinearGradient colors={[colors.primarySoft, colors.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xl, borderTopLeftRadius: 6, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border }}>
            <Text variant="body">{response.message}</Text>
            {chips.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {chips.map((c) => <Chip key={c} label={c} size="sm" />)}
              </View>
            ) : null}
            {response.clarifyingQuestions.length ? (
              <View style={{ gap: 6 }}>
                <Text variant="label" color="muted">Quick questions</Text>
                {response.clarifyingQuestions.map((q) => (
                  <Chip key={q} label={q} icon="chatbubble-ellipses-outline" onPress={onAnswer ? () => onAnswer(q) : undefined} tone="primary" />
                ))}
              </View>
            ) : null}
            {response.dataNotice ? <Notice tone={response.generatedBy === 'demo_planner' ? 'warning' : 'info'} text={response.dataNotice} /> : null}
          </LinearGradient>
        </View>
      </View>
      {response.recommendations.length ? (
        <>
          <RecommendationCarousel recs={response.recommendations} cardProps={cardProps} inset={inset + 38} />
          {onCreatePoll && response.recommendations.length > 1 ? (
            <View style={{ paddingLeft: inset + 38, paddingRight: inset, flexDirection: 'row' }}>
              <Button title="Put these to a vote" icon="stats-chart" size="sm" variant="secondary" onPress={onCreatePoll} />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function AiThinking({ label = 'Gather is looking at the chat and everyone’s shared preferences…' }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginVertical: 10 }} accessibilityLiveRegion="polite" accessibilityLabel="Gather is thinking">
      <Avatar name="Gather" ai size={30} />
      <View style={{ flexShrink: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.xl, backgroundColor: colors.primarySoft }}>
        <Text variant="caption" color="primary">{label}</Text>
      </View>
    </View>
  );
}
