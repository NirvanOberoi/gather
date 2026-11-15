/**
 * The Backend contract. Screens and hooks talk ONLY to this interface, never to Supabase
 * directly. Two implementations:
 *   - LiveBackend  (src/services/supabase)  — Supabase Auth/Postgres/Realtime/Storage + Edge Functions
 *   - DemoBackend  (src/services/demo)      — on-device sample world for demos, clearly labelled
 */
import type {
  AiConversation, AiMessage, AiUsage, AppNotification, AvailabilitySlot, FriendRequest, GroupDetail,
  GroupSummary, Message, MessagePayload, MessageKind, NotificationSettings, Plan, PlanInput, PlaceQuery, Poll,
  Preferences, PrivacySettings, Profile, ProfileWithRelation, Recommendation, Rsvp, SavedItem, Subscription,
} from '@/types/models';

export type BackendMode = 'demo' | 'live';

export interface SessionUser {
  id: string;
  email: string | null;
}

export type AuthEvent = { type: 'signed_in'; user: SessionUser } | { type: 'signed_out'; reason?: 'expired' | 'user' | 'deleted' } | { type: 'password_recovery' };

export type RealtimeEvent =
  | { type: 'message'; groupId: string; message: Message }
  | { type: 'message_deleted'; groupId: string; id: string }
  | { type: 'poll'; groupId: string; pollId: string }
  | { type: 'plan'; planId: string }
  | { type: 'availability'; planId: string }
  | { type: 'groups' }
  | { type: 'friends' }
  | { type: 'notifications' }
  | { type: 'connection'; status: 'connected' | 'reconnecting' | 'offline' };

export type Unsubscribe = () => void;

export class BackendError extends Error {
  constructor(
    message: string,
    public code: 'unauthenticated' | 'forbidden' | 'not_found' | 'validation' | 'rate_limited' | 'not_configured' | 'network' | 'moderation' | 'unknown' = 'unknown',
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

export interface Backend {
  readonly mode: BackendMode;

  auth: {
    getSession(): Promise<SessionUser | null>;
    signUp(email: string, password: string): Promise<{ needsEmailConfirmation: boolean }>;
    signIn(email: string, password: string): Promise<SessionUser>;
    signOut(): Promise<void>;
    requestPasswordReset(email: string): Promise<void>;
    updatePassword(password: string): Promise<void>;
    /** Handle a deep link (email confirmation / password recovery). Returns true if consumed. */
    handleAuthRedirect(url: string): Promise<boolean>;
    updateEmail(email: string): Promise<void>;
    deleteAccount(): Promise<void>;
    onChange(cb: (e: AuthEvent) => void): Unsubscribe;
  };

  profiles: {
    me(): Promise<Profile>;
    get(id: string): Promise<ProfileWithRelation>;
    update(patch: Partial<Pick<Profile, 'username' | 'displayName' | 'bio' | 'city' | 'onboardedAt'>>): Promise<Profile>;
    isUsernameAvailable(username: string): Promise<boolean>;
    uploadAvatar(localUri: string): Promise<string>;
    search(query: string): Promise<ProfileWithRelation[]>;
    /** Friends' visible preferences (only categories they shared with friends). */
    visiblePreferences(userId: string): Promise<Partial<Preferences>>;
  };

  settings: {
    getPreferences(): Promise<Preferences>;
    savePreferences(p: Preferences): Promise<void>;
    getPrivacy(): Promise<PrivacySettings>;
    savePrivacy(p: PrivacySettings): Promise<void>;
    getNotificationSettings(): Promise<NotificationSettings>;
    saveNotificationSettings(s: NotificationSettings): Promise<void>;
    /** Export of everything stored about the user (privacy dashboard). */
    exportMyData(): Promise<Record<string, unknown>>;
  };

  friends: {
    list(): Promise<Profile[]>;
    requests(): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>;
    send(userId: string): Promise<void>;
    respond(requestId: string, accept: boolean): Promise<void>;
    cancel(requestId: string): Promise<void>;
    remove(userId: string): Promise<void>;
    block(userId: string): Promise<void>;
    unblock(userId: string): Promise<void>;
    blocked(): Promise<Profile[]>;
  };

  groups: {
    list(): Promise<GroupSummary[]>;
    get(id: string): Promise<GroupDetail>;
    create(input: { name: string; memberIds: string[]; photoUri?: string | null }): Promise<GroupDetail>;
    update(id: string, patch: { name?: string; photoUri?: string | null; aiAutoSuggest?: boolean }): Promise<void>;
    addMembers(id: string, userIds: string[]): Promise<void>;
    removeMember(id: string, userId: string): Promise<void>;
    leave(id: string): Promise<void>;
    setMuted(id: string, muted: boolean): Promise<void>;
    setAiSharePrefs(id: string, value: boolean): Promise<void>;
    markRead(id: string): Promise<void>;
  };

  messages: {
    list(groupId: string, opts?: { before?: string; limit?: number }): Promise<Message[]>;
    send(groupId: string, input: { body: string; clientId: string; kind?: Extract<MessageKind, 'text' | 'share'>; payload?: MessagePayload }): Promise<Message>;
  };

  polls: {
    get(id: string): Promise<Poll>;
    listForGroup(groupId: string): Promise<Poll[]>;
    create(groupId: string, input: { question: string; allowMultiple: boolean; options: { label: string; description?: string | null; recommendation?: Recommendation | null }[] }): Promise<Poll>;
    vote(pollId: string, optionIds: string[]): Promise<void>;
    close(pollId: string, winnerOptionId: string | null): Promise<Poll>;
  };

  plans: {
    list(): Promise<Plan[]>;
    get(id: string): Promise<Plan>;
    create(input: PlanInput): Promise<Plan>;
    createFromPoll(pollId: string, extra: { timezone: string; title?: string }): Promise<Plan>;
    update(id: string, patch: Partial<PlanInput>): Promise<Plan>;
    setRsvp(planId: string, rsvp: Rsvp): Promise<void>;
    invite(planId: string, userIds: string[]): Promise<void>;
    shareToGroup(planId: string, groupId: string): Promise<void>;
  };

  availability: {
    list(planId: string): Promise<AvailabilitySlot[]>;
    setMine(planId: string, ranges: { startsAt: string; endsAt: string }[]): Promise<void>;
  };

  notifications: {
    list(): Promise<AppNotification[]>;
    markRead(ids: string[] | 'all'): Promise<void>;
  };

  saved: {
    list(): Promise<SavedItem[]>;
    save(rec: Recommendation, collection?: string): Promise<SavedItem>;
    remove(id: string): Promise<void>;
    move(id: string, collection: string): Promise<void>;
  };

  ai: {
    /** Ask Gather AI in a group. The AI reply is posted into the group as a message. */
    planForGroup(groupId: string, input: { prompt?: string; trigger: 'mention' | 'button' | 'auto' }): Promise<Message | null>;
    conversations(): Promise<AiConversation[]>;
    messages(conversationId: string): Promise<AiMessage[]>;
    sendPrivate(conversationId: string | null, text: string): Promise<{ conversationId: string; messages: AiMessage[] }>;
    deleteConversation(id: string): Promise<void>;
    deleteAllPrivate(): Promise<void>;
    usage(): Promise<AiUsage>;
  };

  places: {
    /** 'live' = real provider configured; 'sample' = demo catalog; 'unavailable' = no provider. */
    status(): Promise<'live' | 'sample' | 'unavailable'>;
    search(q: PlaceQuery): Promise<Recommendation[]>;
  };

  subscription: {
    get(): Promise<Subscription>;
    joinWaitlist(): Promise<void>;
  };

  realtime: {
    subscribe(topic: string, cb: (e: RealtimeEvent) => void): Unsubscribe;
  };
}
