import React from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Recommendation } from '@shared/recommendation.ts';
import { useTheme } from '@/theme/ThemeProvider';
import { categoryArt, radius, shadows } from '@/theme/tokens';
import { Button, Icon, Pill, Text } from '@/components/ui';
import { PlaceArt } from './PlaceArt';
import { SourceBadge } from './SourceBadge';

export interface RecommendationCardProps {
  rec: Recommendation;
  width?: number;
  onPress?: () => void;
  onVote?: () => void;
  voteLabel?: string;
  voted?: boolean;
  onSave?: () => void;
  saved?: boolean;
  compact?: boolean;
}

export function RecommendationCard({ rec, width = 286, onPress, onVote, voteLabel = 'Vote', voted, onSave, saved, compact }: RecommendationCardProps) {
  const { colors, dark } = useTheme();
  const art = categoryArt[rec.category] ?? categoryArt.other;
  const dense = width < 210; // 2-column grids on phones
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${rec.title}. ${rec.whyItFits}`}
      onPress={onPress}
      style={({ pressed }) => [
        { width, borderRadius: radius.xxl, backgroundColor: colors.surface, overflow: 'hidden', borderWidth: dark ? 1 : 0, borderColor: colors.border, transform: [{ scale: pressed ? 0.985 : 1 }] },
        !dark && shadows.card,
      ]}
    >
      <View>
        <PlaceArt imageUrl={rec.imageUrl} category={rec.category} height={dense ? 92 : compact ? 110 : 140} />
        <View style={{ position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: radius.pill }}>
            <SourceBadge source={rec.source} />
          </View>
          {onSave ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={saved ? 'Saved' : 'Save'}
              hitSlop={10}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onSave();
              }}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name={saved ? 'heart' : 'heart-outline'} size={19} color={saved ? '#FF6B8B' : '#fff'} />
            </Pressable>
          ) : null}
        </View>
        {dense ? null : <View style={{ position: 'absolute', bottom: 10, left: 12, flexDirection: 'row', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill }}>
            <Icon name={art.icon} size={11} color="#fff" />
            <Text variant="tiny" color="#fff">{art.label}</Text>
          </View>
          {rec.rating !== null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill }}>
              <Icon name="star" size={11} color="#FFD15C" />
              <Text variant="tiny" color="#fff">{rec.rating.toFixed(1)}{rec.source === 'demo_sample' ? ' (sample)' : ''}</Text>
            </View>
          ) : null}
        </View>}
      </View>
      <View style={{ padding: dense ? 10 : 14, gap: 8 }}>
        <Text variant={dense ? 'bodyStrong' : 'subheading'} numberOfLines={dense ? 2 : 1} style={{ fontFamily: 'PlusJakartaSans_700Bold' }}>{rec.title}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {rec.estimatedCost ? <Pill label={rec.estimatedCost.label} tone="primary" icon="wallet-outline" /> : <Pill label="Price unknown" tone="neutral" icon="wallet-outline" />}
          {rec.locationText ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 }}>
              <Icon name="location-outline" size={13} color={colors.textMuted} />
              <Text variant="caption" color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>{rec.locationText}</Text>
            </View>
          ) : null}
        </View>
        {!compact && rec.description ? <Text variant="caption" color="muted" numberOfLines={2}>{rec.description}</Text> : null}
        {dense ? null : <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.primarySoft }}>
          <Icon name="sparkles" size={14} color={colors.primary} />
          <Text variant="caption" color={colors.primary} numberOfLines={compact ? 2 : 3} style={{ flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{rec.whyItFits}</Text>
        </View>}
        {rec.tradeoffs && !compact ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Icon name="alert-circle-outline" size={14} color={colors.warning} />
            <Text variant="caption" color={colors.warning} numberOfLines={2} style={{ flex: 1 }}>{rec.tradeoffs}</Text>
          </View>
        ) : null}
        {(onVote || onPress) && !dense ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {onVote ? <Button title={voted ? 'Voted' : voteLabel} icon={voted ? 'checkmark-circle' : 'hand-left-outline'} size="sm" variant={voted ? 'secondary' : 'primary'} onPress={onVote} style={{ flex: 1 }} /> : null}
            {onPress ? <Button title="Details" size="sm" variant="outline" onPress={onPress} style={{ flex: onVote ? undefined : 1 }} /> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
