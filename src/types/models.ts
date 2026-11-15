import type { PlanResponse, Recommendation } from '@shared/recommendation.ts';
import type { Preferences, PrivacySettings } from '@shared/preferences.ts';
import type { GroupRole } from '@/domain/permissions';

export type { PlanResponse, Recommendation, Preferences, PrivacySettings, GroupRole };

export interface Profile {
  id: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  city: string | null;
  isSample?: boolean;
  onboardedAt: string | null;
  createdAt: string;
}

export type Relation = 'self' | 'friend' | 'incoming' | 'outgoing' | 'none' | 'blocked';

export interface ProfileWithRelation extends Profile {
  relation: Relation;
  requestId?: string;
  mutualCount?: number;
}

export interface NotificationSettings {
  friendRequests: boolean;
  groupAdds: boolean;
  messages: boolean;
  mentions: boolean;
  polls: boolean;
  plans: boolean;
  reminders: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  friendRequests: true,
  groupAdds: true,
  messages: true,
  mentions: true,
  polls: true,
  plans: true,
  reminders: true,
};

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'declined' | 'canceled';
  createdAt: string;
  other: Profile;
}

export interface GroupMember {
  groupId: string;
  userId: string;
  role: GroupRole;
  muted: boolean;
  aiSharePrefs: boolean;
  joinedAt: string;
  profile: Profile;
}

export interface Group {
  id: string;
  name: string;
  photoUrl: string | null;
  createdBy: string;
  aiAutoSuggest: boolean;
  createdAt: string;
}

export interface GroupSummary extends Group {
  memberCount: number;
  memberPreview: Profile[];
  lastMessage: Message | null;
  unreadCount: number;
  muted: boolean;
}

export interface GroupDetail extends Group {
  members: GroupMember[];
  myRole: GroupRole;
  myMembership: GroupMember;
}

export type MessageKind = 'text' | 'ai' | 'system' | 'poll' | 'plan' | 'share';

export type MessagePayload =
  | { type: 'ai'; response: PlanResponse; requestedBy: string | null; trigger: 'mention' | 'button' | 'auto' }
  | { type: 'poll'; pollId: string }
  | { type: 'plan'; planId: string }
  | { type: 'share'; recommendation: Recommendation }
  | null;

export interface Message {
  id: string;
  groupId: string;
  senderId: string | null;
  kind: MessageKind;
  body: string;
  payload: MessagePayload;
  clientId: string | null;
  createdAt: string;
  /** client-only */
  status?: 'sending' | 'failed' | 'sent';
}

export interface PollOption {
  id: string;
  pollId: string;
  label: string;
  description: string | null;
  recommendation: Recommendation | null;
  position: number;
}

export interface PollVote {
  pollId: string;
  optionId: string;
  userId: string;
}

export interface Poll {
  id: string;
  groupId: string;
  createdBy: string;
  question: string;
  allowMultiple: boolean;
  status: 'open' | 'closed';
  winningOptionId: string | null;
  planId: string | null;
  createdAt: string;
  closedAt: string | null;
  options: PollOption[];
  votes: PollVote[];
}

export type PlanStatus = 'planning' | 'confirmed' | 'completed' | 'canceled';
export type Rsvp = 'invited' | 'going' | 'maybe' | 'declined';

export interface PlanParticipant {
  planId: string;
  userId: string;
  rsvp: Rsvp;
  role: 'organizer' | 'member';
  profile: Profile;
}

export interface Plan {
  id: string;
  groupId: string | null;
  createdBy: string;
  title: string;
  description: string | null;
  activity: string | null;
  place: Recommendation | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  locationText: string | null;
  budgetText: string | null;
  status: PlanStatus;
  sourcePollId: string | null;
  createdAt: string;
  updatedAt: string;
  participants: PlanParticipant[];
}

export interface PlanInput {
  groupId: string | null;
  title: string;
  description?: string | null;
  activity?: string | null;
  place?: Recommendation | null;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone: string;
  locationText?: string | null;
  budgetText?: string | null;
  status?: PlanStatus;
  sourcePollId?: string | null;
  participantIds?: string[];
}

export interface AvailabilitySlot {
  id: string;
  planId: string;
  userId: string;
  startsAt: string;
  endsAt: string;
}

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'group_added'
  | 'mention'
  | 'poll_created'
  | 'poll_closed'
  | 'plan_invite'
  | 'plan_updated'
  | 'plan_reminder';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: { groupId?: string; planId?: string; pollId?: string; userId?: string };
  readAt: string | null;
  createdAt: string;
}

export interface SavedItem {
  id: string;
  collection: string;
  recommendation: Recommendation;
  note: string | null;
  createdAt: string;
}

export interface AiConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  response: PlanResponse | null;
  createdAt: string;
}

export interface Subscription {
  tier: 'free' | 'premium';
  status: 'none' | 'active' | 'canceled' | 'waitlist';
  currentPeriodEnd: string | null;
}

export interface AiUsage {
  usedToday: number;
  dailyLimit: number;
  tier: 'free' | 'premium';
}

export interface PlaceQuery {
  query?: string;
  category?: string | null;
  maxPriceLevel?: number | null;
  maxDistanceKm?: number | null;
  area?: string | null;
  coords?: { lat: number; lng: number } | null;
}
