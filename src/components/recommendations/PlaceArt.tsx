import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { Category } from '@shared/recommendation.ts';
import { categoryArt } from '@/theme/tokens';
import { Icon } from '@/components/ui';

/** Photo when the provider supplied one; otherwise category gradient art (never a fake photo). */
export function PlaceArt({ imageUrl, category, height, radius = 0 }: { imageUrl: string | null; category: Category; height: number; radius?: number }) {
  const art = categoryArt[category] ?? categoryArt.other;
  if (imageUrl) return <Image source={{ uri: imageUrl }} style={{ height, borderRadius: radius }} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />;
  return (
    <LinearGradient colors={art.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height, borderRadius: radius, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: height * 1.4, height: height * 1.4, borderRadius: height, backgroundColor: 'rgba(255,255,255,0.08)', right: -height * 0.6, top: -height * 0.5 }} />
      <View style={{ position: 'absolute', width: height, height, borderRadius: height, backgroundColor: 'rgba(255,255,255,0.07)', left: -height * 0.4, bottom: -height * 0.6 }} />
      <Icon name={art.icon} size={Math.min(56, height * 0.42)} color="rgba(255,255,255,0.95)" />
    </LinearGradient>
  );
}
