import React from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import type { Recommendation } from '@shared/recommendation.ts';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Button, Icon, Notice, Pill, Sheet, Text } from '@/components/ui';
import { useDrafts } from '@/state/drafts';
import { useSaveToggle } from '@/hooks/useSaveToggle';
import { PlaceArt } from './PlaceArt';
import { SourceBadge } from './SourceBadge';

export function RecommendationSheet({ rec, onClose, onShare }: { rec: Recommendation | null; onClose: () => void; onShare?: (r: Recommendation) => void }) {
  const { colors } = useTheme();
  const { isSaved, toggle } = useSaveToggle();
  const setPlanPlace = useDrafts((s) => s.setPlanPlace);
  if (!rec) return null;
  const saved = isSaved(rec);
  const basisNote =
    rec.estimatedCost?.basis === 'sample_data' ? 'Sample price — illustrative only.'
      : rec.estimatedCost?.basis === 'provider_price_level' ? 'Estimated from the provider’s price level.'
        : rec.estimatedCost?.basis === 'typical_range' ? 'A typical range, not a quote.' : null;
  return (
    <Sheet visible={!!rec} onClose={onClose} title={rec.title}>
      <View style={{ gap: 14 }}>
        <PlaceArt imageUrl={rec.imageUrl} category={rec.category} height={170} radius={radius.xl} />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <SourceBadge source={rec.source} />
          {rec.estimatedCost ? <Pill label={rec.estimatedCost.label} icon="wallet-outline" /> : <Pill label="Price unknown" tone="neutral" />}
          {rec.rating !== null ? <Pill label={`★ ${rec.rating.toFixed(1)}${rec.source === 'demo_sample' ? ' sample' : ''}`} tone="neutral" /> : null}
        </View>
        {rec.source === 'demo_sample' ? <Notice tone="warning" text="This is a fictional sample place for the demo. It isn’t a real business." /> : null}
        {rec.source === 'ai_idea' ? <Notice text="A general idea, not a specific business. Search nearby to find a spot." /> : null}
        {rec.description ? <Text variant="body">{rec.description}</Text> : null}
        {rec.locationText ? (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Icon name="location-outline" size={16} color={colors.textMuted} />
            <Text variant="body" color="muted">{rec.locationText}</Text>
          </View>
        ) : null}
        {basisNote ? <Text variant="caption" color="subtle">{basisNote}</Text> : null}
        <View style={{ padding: 14, borderRadius: radius.lg, backgroundColor: colors.primarySoft, gap: 6 }}>
          <Text variant="label" color="primary">Why it fits</Text>
          <Text variant="body" color={colors.primary}>{rec.whyItFits}</Text>
        </View>
        {rec.tradeoffs ? (
          <View style={{ padding: 14, borderRadius: radius.lg, backgroundColor: colors.warningSoft, gap: 6 }}>
            <Text variant="label" color={colors.warning}>Tradeoffs</Text>
            <Text variant="body" color={colors.warning}>{rec.tradeoffs}</Text>
          </View>
        ) : null}
        <View style={{ gap: 10 }}>
          {rec.mapsUrl && rec.source !== 'demo_sample' ? (
            <Button title={rec.source === 'ai_idea' ? 'Search on Maps' : 'Directions & details'} icon="navigate" onPress={() => Linking.openURL(rec.mapsUrl!)} full />
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title={saved ? 'Saved' : 'Save'} icon={saved ? 'heart' : 'heart-outline'} variant="secondary" onPress={() => toggle(rec)} style={{ flex: 1 }} />
            {onShare ? <Button title="Share" icon="paper-plane-outline" variant="secondary" onPress={() => onShare(rec)} style={{ flex: 1 }} /> : null}
          </View>
          <Button
            title="Start a plan"
            icon="calendar-outline"
            variant="outline"
            onPress={() => {
              setPlanPlace(rec);
              onClose();
              router.push('/plan/new');
            }}
            full
          />
        </View>
      </View>
    </Sheet>
  );
}
