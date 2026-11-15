import React from 'react';
import { FlatList, useWindowDimensions } from 'react-native';
import type { Recommendation } from '@shared/recommendation.ts';
import { RecommendationCard, type RecommendationCardProps } from './RecommendationCard';

export function RecommendationCarousel({ recs, cardProps, inset = 0 }: { recs: Recommendation[]; cardProps: (r: Recommendation) => Partial<RecommendationCardProps>; inset?: number }) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(300, width * 0.74);
  return (
    <FlatList
      horizontal
      data={recs}
      extraData={cardProps /* new identity when saved/voted state changes */}
      keyExtractor={(r) => r.id}
      showsHorizontalScrollIndicator={false}
      snapToInterval={cardWidth + 12}
      decelerationRate="fast"
      contentContainerStyle={{ gap: 12, paddingHorizontal: inset, paddingVertical: 6 }}
      renderItem={({ item }) => <RecommendationCard rec={item} width={cardWidth} {...cardProps(item)} />}
    />
  );
}
