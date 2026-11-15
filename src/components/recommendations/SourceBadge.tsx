import React from 'react';
import type { Recommendation } from '@shared/recommendation.ts';
import { Pill } from '@/components/ui';

export function SourceBadge({ source }: { source: Recommendation['source'] }) {
  if (source === 'demo_sample') return <Pill label="Sample place" tone="sample" icon="flask" />;
  if (source === 'ai_idea') return <Pill label="General idea" tone="neutral" icon="bulb" />;
  return <Pill label="Google Places" tone="success" icon="location" />;
}
