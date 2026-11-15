import type { Plan } from '@/types/models';

export type PlanBucket = 'upcoming' | 'planning' | 'past';

export function bucketPlan(p: Pick<Plan, 'status' | 'startsAt' | 'endsAt'>, now = Date.now()): PlanBucket {
  const end = p.endsAt ?? p.startsAt;
  if (p.status === 'completed' || p.status === 'canceled' || (end && new Date(end).getTime() < now)) return 'past';
  if (p.status === 'planning') return 'planning';
  return 'upcoming';
}
