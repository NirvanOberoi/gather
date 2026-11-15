/** Row ⇄ model mappers for the Supabase backend (snake_case DB, camelCase app). */
import { DEFAULT_PRIVACY, EMPTY_PREFERENCES, type Preferences, type PrivacySettings } from '@shared/preferences.ts';
import type {
  AppNotification, AvailabilitySlot, Message, NotificationSettings, Plan, PlanParticipant, Poll, PollOption, PollVote, Profile,
} from '@/types/models';

type Row = Record<string, any>;

export function toProfile(r: Row | null | undefined): Profile {
  if (!r) return { id: 'deleted', username: null, displayName: 'Deleted user', avatarUrl: null, bio: null, city: null, onboardedAt: null, createdAt: new Date(0).toISOString() };
  return {
    id: r.id,
    username: r.username ?? null,
    displayName: r.display_name || r.username || '',
    avatarUrl: r.avatar_url ?? null,
    bio: r.bio ?? null,
    city: r.city ?? null,
    onboardedAt: r.onboarded_at ?? null,
    createdAt: r.created_at ?? new Date(0).toISOString(),
  };
}

export function toPreferences(r: Row | null): Preferences {
  if (!r) return EMPTY_PREFERENCES;
  return {
    cuisines: r.cuisines ?? [],
    dietary: r.dietary ?? [],
    restaurantStyles: r.restaurant_styles ?? [],
    activities: r.activities ?? [],
    customInterests: r.custom_interests ?? [],
    budget: r.budget ?? null,
    maxDistanceKm: r.max_distance_km ?? null,
    favoriteActivities: r.favorite_activities ?? [],
    dislikedActivities: r.disliked_activities ?? [],
    preferredTimes: r.preferred_times ?? [],
    accessibility: r.accessibility ?? [],
  };
}

export function fromPreferences(p: Preferences) {
  return {
    cuisines: p.cuisines,
    dietary: p.dietary,
    restaurant_styles: p.restaurantStyles,
    activities: p.activities,
    custom_interests: p.customInterests,
    budget: p.budget,
    max_distance_km: p.maxDistanceKm,
    favorite_activities: p.favoriteActivities,
    disliked_activities: p.dislikedActivities,
    preferred_times: p.preferredTimes,
    accessibility: p.accessibility,
  };
}

export function toPrivacy(r: Row | null): PrivacySettings {
  if (!r) return DEFAULT_PRIVACY;
  return {
    aiShare: { ...DEFAULT_PRIVACY.aiShare, ...(r.ai_share ?? {}) },
    friendsShare: { ...DEFAULT_PRIVACY.friendsShare, ...(r.friends_share ?? {}) },
    showVoteIdentity: r.show_vote_identity,
    discoverable: r.discoverable,
    allowFriendRequests: r.allow_friend_requests,
    storePrivateAiHistory: r.store_private_ai_history,
  };
}

export function fromPrivacy(p: PrivacySettings) {
  return {
    ai_share: p.aiShare,
    friends_share: p.friendsShare,
    show_vote_identity: p.showVoteIdentity,
    discoverable: p.discoverable,
    allow_friend_requests: p.allowFriendRequests,
    store_private_ai_history: p.storePrivateAiHistory,
  };
}

export function toNotificationSettings(r: Row): NotificationSettings {
  return {
    friendRequests: r.friend_requests, groupAdds: r.group_adds, messages: r.messages, mentions: r.mentions,
    polls: r.polls, plans: r.plans, reminders: r.reminders,
  };
}

export function fromNotificationSettings(s: NotificationSettings) {
  return {
    friend_requests: s.friendRequests, group_adds: s.groupAdds, messages: s.messages, mentions: s.mentions,
    polls: s.polls, plans: s.plans, reminders: s.reminders,
  };
}

export function toMessage(r: Row): Message {
  return {
    id: r.id,
    groupId: r.group_id,
    senderId: r.sender_id ?? null,
    kind: r.kind,
    body: r.body ?? '',
    payload: r.payload ?? null,
    clientId: r.client_id ?? null,
    createdAt: r.created_at,
    status: 'sent',
  };
}

/** get_poll() JSON → Poll. Hidden voters become anonymous placeholder ids so counts stay right. */
export function toPoll(j: { poll: Row; options: Row[] }): Poll {
  const options: PollOption[] = j.options.map((o) => ({
    id: o.id, pollId: o.poll_id, label: o.label, description: o.description ?? null, recommendation: o.recommendation ?? null, position: o.position,
  }));
  const votes: PollVote[] = [];
  for (const o of j.options) {
    const visible: string[] = o.visible_voters ?? [];
    for (const u of visible) votes.push({ pollId: j.poll.id, optionId: o.id, userId: u });
    for (let i = visible.length; i < (o.vote_count ?? 0); i++) votes.push({ pollId: j.poll.id, optionId: o.id, userId: `hidden:${o.id}:${i}` });
  }
  const p = j.poll;
  return {
    id: p.id, groupId: p.group_id, createdBy: p.created_by, question: p.question, allowMultiple: p.allow_multiple, status: p.status,
    winningOptionId: p.winning_option_id ?? null, planId: p.plan_id ?? null, createdAt: p.created_at, closedAt: p.closed_at ?? null, options, votes,
  };
}

export function toPlan(r: Row): Plan {
  const participants: PlanParticipant[] = (r.plan_participants ?? []).map((x: Row) => ({
    planId: x.plan_id, userId: x.user_id, rsvp: x.rsvp, role: x.role, profile: toProfile(x.profile),
  }));
  return {
    id: r.id, groupId: r.group_id ?? null, createdBy: r.created_by, title: r.title, description: r.description ?? null, activity: r.activity ?? null,
    place: r.place ?? null, startsAt: r.starts_at ?? null, endsAt: r.ends_at ?? null, timezone: r.timezone, locationText: r.location_text ?? null,
    budgetText: r.budget_text ?? null, status: r.status, sourcePollId: r.source_poll_id ?? null, createdAt: r.created_at, updatedAt: r.updated_at, participants,
  };
}

export function toSlot(r: Row): AvailabilitySlot {
  return { id: r.id, planId: r.plan_id, userId: r.user_id, startsAt: r.starts_at, endsAt: r.ends_at };
}

export function toNotification(r: Row): AppNotification {
  return { id: r.id, type: r.type, title: r.title, body: r.body, data: r.data ?? {}, readAt: r.read_at ?? null, createdAt: r.created_at };
}
