/** React Query hooks over the Backend contract + realtime cache invalidation. */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backend } from '@/services/backend';
import type { RealtimeEvent } from '@/services/backend/types';
import type { PlaceQuery } from '@/types/models';
import { useSession } from '@/state/session';

const enabled = () => useSession.getState().status === 'ready' || useSession.getState().status === 'onboarding';

export const qk = {
  me: ['me'] as const,
  prefs: ['prefs'] as const,
  privacy: ['privacy'] as const,
  notifSettings: ['notifSettings'] as const,
  groups: ['groups'] as const,
  group: (id: string) => ['group', id] as const,
  polls: (groupId: string) => ['polls', groupId] as const,
  poll: (id: string) => ['poll', id] as const,
  plans: ['plans'] as const,
  plan: (id: string) => ['plan', id] as const,
  availability: (id: string) => ['availability', id] as const,
  friends: ['friends'] as const,
  requests: ['requests'] as const,
  blocked: ['blocked'] as const,
  profile: (id: string) => ['profile', id] as const,
  visiblePrefs: (id: string) => ['visiblePrefs', id] as const,
  notifications: ['notifications'] as const,
  saved: ['saved'] as const,
  aiConvs: ['aiConvs'] as const,
  aiMsgs: (id: string) => ['aiMsgs', id] as const,
  usage: ['usage'] as const,
  places: (q: PlaceQuery) => ['places', q] as const,
  placesStatus: ['placesStatus'] as const,
  subscription: ['subscription'] as const,
};

const b = () => backend();

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => b().profiles.me(), enabled: enabled() });
export const usePreferences = () => useQuery({ queryKey: qk.prefs, queryFn: () => b().settings.getPreferences() });
export const usePrivacy = () => useQuery({ queryKey: qk.privacy, queryFn: () => b().settings.getPrivacy() });
export const useNotificationSettings = () => useQuery({ queryKey: qk.notifSettings, queryFn: () => b().settings.getNotificationSettings() });
export const useGroups = () => useQuery({ queryKey: qk.groups, queryFn: () => b().groups.list() });
export const useGroup = (id: string) => useQuery({ queryKey: qk.group(id), queryFn: () => b().groups.get(id), enabled: !!id });
export const usePoll = (id: string) => useQuery({ queryKey: qk.poll(id), queryFn: () => b().polls.get(id), enabled: !!id });
export const usePlans = () => useQuery({ queryKey: qk.plans, queryFn: () => b().plans.list() });
export const usePlan = (id: string) => useQuery({ queryKey: qk.plan(id), queryFn: () => b().plans.get(id), enabled: !!id });
export const useAvailability = (id: string) => useQuery({ queryKey: qk.availability(id), queryFn: () => b().availability.list(id), enabled: !!id });
export const useFriends = () => useQuery({ queryKey: qk.friends, queryFn: () => b().friends.list() });
export const useFriendRequests = () => useQuery({ queryKey: qk.requests, queryFn: () => b().friends.requests() });
export const useBlocked = () => useQuery({ queryKey: qk.blocked, queryFn: () => b().friends.blocked() });
export const useProfile = (id: string) => useQuery({ queryKey: qk.profile(id), queryFn: () => b().profiles.get(id), enabled: !!id });
export const useVisiblePrefs = (id: string) => useQuery({ queryKey: qk.visiblePrefs(id), queryFn: () => b().profiles.visiblePreferences(id), enabled: !!id });
export const useNotifications = () => useQuery({ queryKey: qk.notifications, queryFn: () => b().notifications.list() });
export const useSaved = () => useQuery({ queryKey: qk.saved, queryFn: () => b().saved.list() });
export const useAiConversations = () => useQuery({ queryKey: qk.aiConvs, queryFn: () => b().ai.conversations() });
export const useAiMessages = (id: string | null) => useQuery({ queryKey: qk.aiMsgs(id ?? ''), queryFn: () => b().ai.messages(id!), enabled: !!id });
export const useAiUsage = () => useQuery({ queryKey: qk.usage, queryFn: () => b().ai.usage() });
export const usePlaces = (q: PlaceQuery) => useQuery({ queryKey: qk.places(q), queryFn: () => b().places.search(q) });
export const usePlacesStatus = () => useQuery({ queryKey: qk.placesStatus, queryFn: () => b().places.status(), staleTime: Infinity });
export const useSubscription = () => useQuery({ queryKey: qk.subscription, queryFn: () => b().subscription.get() });

/** Subscribe to a realtime topic for the lifetime of the component. */
export function useRealtime(topic: string | null, handler: (e: RealtimeEvent) => void) {
  useEffect(() => {
    if (!topic) return;
    return b().realtime.subscribe(topic, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);
}

/** App-wide realtime → cache invalidation for the signed-in user. */
export function useUserRealtime() {
  const qc = useQueryClient();
  useRealtime('user', (e) => {
    if (e.type === 'groups') qc.invalidateQueries({ queryKey: qk.groups });
    if (e.type === 'friends') {
      qc.invalidateQueries({ queryKey: qk.friends });
      qc.invalidateQueries({ queryKey: qk.requests });
      qc.invalidateQueries({ queryKey: qk.blocked });
      qc.invalidateQueries({ queryKey: ['profile'] });
    }
    if (e.type === 'notifications') qc.invalidateQueries({ queryKey: qk.notifications });
    if (e.type === 'plan') {
      qc.invalidateQueries({ queryKey: qk.plans });
      qc.invalidateQueries({ queryKey: qk.plan(e.planId) });
    }
  });
}

export function usePlanRealtime(planId: string) {
  const qc = useQueryClient();
  useRealtime(planId ? `plan:${planId}` : null, (e) => {
    if (e.type === 'plan') {
      qc.invalidateQueries({ queryKey: qk.plan(planId) });
      qc.invalidateQueries({ queryKey: qk.plans });
    }
    if (e.type === 'availability') qc.invalidateQueries({ queryKey: qk.availability(planId) });
  });
}

/** Mutation helper that invalidates keys on success. */
export function useAction<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, invalidate: readonly (readonly unknown[])[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k as unknown[] })),
  });
}
