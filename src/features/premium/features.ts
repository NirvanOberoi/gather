/**
 * Premium feature registry. Gate features with `hasFeature(tier, key)` so the paywall,
 * server limits and UI stay in sync when billing ships (see README → Premium).
 */
import type { IconName } from '@/components/ui';

export type PremiumFeatureKey = 'ai_limits' | 'advanced_personalization' | 'itineraries' | 'advanced_suggestions' | 'customization';

export const PREMIUM_FEATURES: { key: PremiumFeatureKey; title: string; body: string; icon: IconName; status: 'available' | 'planned' }[] = [
  { key: 'ai_limits', title: '10× more AI planning', body: '150 Gather AI requests a day instead of 15.', icon: 'flash', status: 'available' },
  { key: 'advanced_personalization', title: 'Deeper personalization', body: 'Learns from plans you loved (with your OK) to sharpen suggestions.', icon: 'heart-circle', status: 'planned' },
  { key: 'itineraries', title: 'Detailed itineraries', body: 'Multi-stop plans with timing, e.g. climb → tacos → dessert.', icon: 'map', status: 'planned' },
  { key: 'advanced_suggestions', title: 'Smarter group suggestions', body: 'Trade-off breakdowns and backup options when plans fall through.', icon: 'bulb', status: 'planned' },
  { key: 'customization', title: 'Custom themes & group styles', body: 'Make your group chats look like yours.', icon: 'color-palette', status: 'planned' },
];

export function hasFeature(tier: 'free' | 'premium', key: PremiumFeatureKey): boolean {
  if (tier === 'premium') return PREMIUM_FEATURES.some((f) => f.key === key && f.status === 'available');
  return false;
}
