/**
 * DEMO SEED — sample users, groups, messages and plans. All sample people are fictional
 * and flagged `isSample: true`; the UI labels them and the demo banner is always visible.
 */
import { DEFAULT_PRIVACY, EMPTY_PREFERENCES, type Preferences, type PrivacySettings } from '@shared/preferences.ts';
import { placeToRecommendation } from '@shared/recommendation.ts';
import type {
  AiConversation, AiMessage, AppNotification, AvailabilitySlot, Group, Message, NotificationSettings, Plan,
  PlanParticipant, Poll, PollOption, PollVote, Profile, SavedItem, Subscription,
} from '@/types/models';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@/types/models';
import type { Block, GroupRole } from '@/domain/permissions';
import { addDaysISO, deviceTimeZone, localRangeToInterval, todayISOInZone, zonedParts } from '@/domain/time';
import { SAMPLE_PLACES } from './samplePlaces';

export interface DemoMember {
  groupId: string;
  userId: string;
  role: GroupRole;
  muted: boolean;
  aiSharePrefs: boolean;
  joinedAt: string;
  lastReadAt: string;
}

export interface DemoRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'declined' | 'canceled';
  createdAt: string;
}

export interface DemoDB {
  version: 3;
  meId: string;
  email: string | null;
  profiles: Record<string, Profile>;
  prefs: Record<string, Preferences>;
  privacy: Record<string, PrivacySettings>;
  notifSettings: NotificationSettings;
  friendships: [string, string][];
  requests: DemoRequest[];
  blocks: Block[];
  groups: (Group & { lastAutoSuggestAt: string | null })[];
  members: DemoMember[];
  messages: Message[];
  polls: Omit<Poll, 'options' | 'votes'>[];
  pollOptions: PollOption[];
  votes: PollVote[];
  plans: Omit<Plan, 'participants'>[];
  participants: Omit<PlanParticipant, 'profile'>[];
  availability: AvailabilitySlot[];
  notifications: AppNotification[];
  saved: SavedItem[];
  aiConversations: (AiConversation & { ephemeral?: boolean })[];
  aiMessages: AiMessage[];
  aiUsage: number[];
  subscription: Subscription;
}

export const ME = 'u_me';

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function sampleProfile(id: string, username: string, displayName: string, bio: string): Profile {
  return { id, username, displayName, avatarUrl: null, bio, city: 'Sample City', isSample: true, onboardedAt: ago(60 * 24 * 30), createdAt: ago(60 * 24 * 60) };
}

function prefs(p: Partial<Preferences>): Preferences {
  return { ...EMPTY_PREFERENCES, ...p };
}

/** Next Saturday (or today if Saturday) as YYYY-MM-DD in the device zone. */
export function nextSaturdayISO(tz = deviceTimeZone()): string {
  const today = todayISOInZone(tz);
  const [y, m, d] = today.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDaysISO(today, (6 - dow + 7) % 7 || 7);
}

let seq = 0;
export const demoId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createSeed(email: string | null): DemoDB {
  const tz = deviceTimeZone();
  const me: Profile = { id: ME, username: null, displayName: '', avatarUrl: null, bio: null, city: null, onboardedAt: null, createdAt: new Date().toISOString() };
  const people = [
    sampleProfile('u_maya', 'maya.eats', 'Maya', 'Always hungry. Will rate your taco spot.'),
    sampleProfile('u_jordan', 'jordan_moves', 'Jordan', 'Climbing, hoops, anything that moves.'),
    sampleProfile('u_priya', 'priya.p', 'Priya', 'Budget queen 💸 thrift + boba'),
    sampleProfile('u_leo', 'leo.local', 'Leo', 'No car, so keep it close 🚲'),
    sampleProfile('u_sam', 'sam_after4', 'Sam', 'Work till 4 most days.'),
    sampleProfile('u_ava', 'ava.k', 'Ava', 'Museums + matcha.'),
    sampleProfile('u_noah', 'noah_r', 'Noah', 'Arcade high-score holder.'),
    sampleProfile('u_zoe', 'zoe.wanders', 'Zoe', 'Trails and sunsets.'),
  ];
  const profiles: Record<string, Profile> = { [ME]: me };
  for (const p of people) profiles[p.id] = p;

  const privacyOpen: PrivacySettings = { ...DEFAULT_PRIVACY, friendsShare: { ...DEFAULT_PRIVACY.friendsShare, budget: true } };
  const privacy: Record<string, PrivacySettings> = {
    [ME]: DEFAULT_PRIVACY,
    u_maya: privacyOpen,
    u_jordan: DEFAULT_PRIVACY,
    u_priya: { ...DEFAULT_PRIVACY, showVoteIdentity: false },
    u_leo: privacyOpen,
    // Sam shares nothing with the AI → treated as "unknown", never assumed.
    u_sam: { ...DEFAULT_PRIVACY, aiShare: { food: false, activities: false, budget: false, distance: false, times: false, dislikes: false, accessibility: false } },
    u_ava: DEFAULT_PRIVACY,
    u_noah: DEFAULT_PRIVACY,
    u_zoe: { ...DEFAULT_PRIVACY, allowFriendRequests: true },
  };
  const prefMap: Record<string, Preferences> = {
    [ME]: prefs({}),
    u_maya: prefs({ cuisines: ['mexican', 'japanese', 'korean'], activities: ['restaurants', 'cafes', 'exploring new places'], budget: '15_30', dietary: [] }),
    u_jordan: prefs({ activities: ['sports', 'outdoors', 'bowling'], favoriteActivities: ['climbing'], budget: '15_30', dislikedActivities: ['shopping'] }),
    u_priya: prefs({ activities: ['shopping', 'cafes'], budget: 'under_15', dietary: ['vegetarian'] }),
    u_leo: prefs({ activities: ['gaming', 'movies'], maxDistanceKm: 3, budget: '15_30' }),
    u_sam: prefs({ activities: ['movies'], budget: '50_plus', preferredTimes: ['evenings'] }),
    u_ava: prefs({ activities: ['art', 'cafes'] }),
    u_noah: prefs({ activities: ['gaming'] }),
    u_zoe: prefs({ activities: ['outdoors'] }),
  };

  const friendships: [string, string][] = ['u_maya', 'u_jordan', 'u_priya', 'u_leo', 'u_sam'].map((f) => [ME, f]);
  const requests: DemoRequest[] = [{ id: 'fr_zoe', senderId: 'u_zoe', receiverId: ME, status: 'pending', createdAt: ago(90) }];

  const groups: DemoDB['groups'] = [
    { id: 'g_weekend', name: 'Weekend Plans', photoUrl: null, createdBy: ME, aiAutoSuggest: false, createdAt: ago(60 * 24 * 3), lastAutoSuggestAt: null },
    { id: 'g_study', name: 'Study Squad', photoUrl: null, createdBy: 'u_priya', aiAutoSuggest: false, createdAt: ago(60 * 24 * 10), lastAutoSuggestAt: null },
  ];
  const mem = (groupId: string, userId: string, role: GroupRole = 'member', readMinutesAgo = 0): DemoMember => ({
    groupId, userId, role, muted: false, aiSharePrefs: true, joinedAt: ago(60 * 24 * 3), lastReadAt: ago(readMinutesAgo),
  });
  const members: DemoMember[] = [
    mem('g_weekend', ME, 'owner', 60 * 24),
    ...['u_maya', 'u_jordan', 'u_priya', 'u_leo', 'u_sam'].map((u) => mem('g_weekend', u)),
    mem('g_study', 'u_priya', 'owner'),
    mem('g_study', 'u_maya'),
    mem('g_study', ME, 'member', 0),
  ];

  const msg = (groupId: string, senderId: string | null, body: string, minutesAgo: number, kind: Message['kind'] = 'text', payload: Message['payload'] = null): Message => ({
    id: demoId('m'), groupId, senderId, kind, body, payload, clientId: null, createdAt: ago(minutesAgo),
  });

  // Study squad poll (a working sample poll)
  const pollId = 'p_study';
  const pollOptions: PollOption[] = [
    { id: 'po_1', pollId, label: 'Copperline Coffee', description: 'Big tables, quiet', recommendation: null, position: 0 },
    { id: 'po_2', pollId, label: 'Moonleaf Boba', description: 'Snacks + board games after', recommendation: null, position: 1 },
    { id: 'po_3', pollId, label: 'Library study rooms', description: 'Free, need to book', recommendation: null, position: 2 },
  ];

  const messages: Message[] = [
    msg('g_weekend', null, 'Sample conversation — everyone here is a demo user.', 130, 'system'),
    msg('g_weekend', ME, 'ok what are we doing saturday??', 125),
    msg('g_weekend', 'u_maya', 'I want to get food 🌮', 124),
    msg('g_weekend', 'u_jordan', 'I want to do something active', 122),
    msg('g_weekend', 'u_priya', "I don't want to spend more than $20", 121),
    msg('g_weekend', 'u_leo', 'something nearby pls, no car this weekend', 119),
    msg('g_weekend', 'u_sam', "I'm free after 4", 118),
    msg('g_weekend', 'u_maya', 'tap Help Us Plan and let Gather sort us out 😂', 117),
    msg('g_study', 'u_priya', 'where are we studying thursday', 60 * 5),
    msg('g_study', null, 'Priya started a poll: Where should we study Thursday?', 60 * 5 - 1, 'poll', { type: 'poll', pollId }),
    msg('g_study', 'u_maya', 'voted! boba wins obviously', 60 * 4),
  ];

  // Plans
  const satISO = nextSaturdayISO(tz);
  const sunISO = addDaysISO(satISO, 1);
  const hike = localRangeToInterval(sunISO, 9 * 60, 12 * 60, tz);
  const pastDay = addDaysISO(todayISOInZone(tz), -12);
  const past = localRangeToInterval(pastDay, 18 * 60, 20 * 60, tz);
  const trail = SAMPLE_PLACES.find((p) => p.placeId === 'demo_trail')!;
  const tacos = SAMPLE_PLACES.find((p) => p.placeId === 'demo_taqueria')!;

  const plans: DemoDB['plans'] = [
    {
      id: 'pl_saturday', groupId: 'g_weekend', createdBy: ME, title: 'Saturday hangout', description: 'Figuring out the time — add when you’re free!',
      activity: null, place: null, startsAt: null, endsAt: null, timezone: tz, locationText: null, budgetText: 'Under $20', status: 'planning',
      sourcePollId: null, createdAt: ago(100), updatedAt: ago(100),
    },
    {
      id: 'pl_hike', groupId: 'g_weekend', createdBy: 'u_jordan', title: 'Sunday sunrise-ish hike', description: 'Bring water + snacks. Carpool from Leo’s.',
      activity: 'Hike', place: placeToRecommendation(trail, { id: 'rec_seed_trail', whyItFits: 'Free, active, and everyone said yes.' }),
      startsAt: new Date(hike.start).toISOString(), endsAt: new Date(hike.end).toISOString(), timezone: tz, locationText: trail.area,
      budgetText: 'Free', status: 'confirmed', sourcePollId: null, createdAt: ago(60 * 24 * 2), updatedAt: ago(60 * 24),
    },
    {
      id: 'pl_tacos', groupId: 'g_weekend', createdBy: 'u_maya', title: 'Taco night', description: 'Maya’s birthday tacos 🎉',
      activity: 'Dinner', place: placeToRecommendation(tacos, { id: 'rec_seed_tacos', whyItFits: 'Cheap, close and Maya’s pick.' }),
      startsAt: new Date(past.start).toISOString(), endsAt: new Date(past.end).toISOString(), timezone: tz, locationText: tacos.area,
      budgetText: 'Under $15', status: 'completed', sourcePollId: null, createdAt: ago(60 * 24 * 20), updatedAt: ago(60 * 24 * 12),
    },
  ];
  const participants: DemoDB['participants'] = [
    ...[ME, 'u_maya', 'u_jordan', 'u_priya', 'u_leo', 'u_sam'].map((u) => ({ planId: 'pl_saturday', userId: u, rsvp: (u === ME ? 'going' : 'invited') as PlanParticipant['rsvp'], role: (u === ME ? 'organizer' : 'member') as PlanParticipant['role'] })),
    ...['u_jordan', ME, 'u_leo', 'u_sam'].map((u) => ({ planId: 'pl_hike', userId: u, rsvp: 'going' as const, role: (u === 'u_jordan' ? 'organizer' : 'member') as PlanParticipant['role'] })),
    ...['u_maya', ME, 'u_jordan', 'u_priya'].map((u) => ({ planId: 'pl_tacos', userId: u, rsvp: 'going' as const, role: (u === 'u_maya' ? 'organizer' : 'member') as PlanParticipant['role'] })),
  ];

  // Friends' availability for Saturday (spec example: 3–8, 4–9, 5–7) + Leo 2–6
  const slot = (userId: string, s: number, e: number): AvailabilitySlot => {
    const iv = localRangeToInterval(satISO, s * 60, e * 60, tz);
    return { id: demoId('av'), planId: 'pl_saturday', userId, startsAt: new Date(iv.start).toISOString(), endsAt: new Date(iv.end).toISOString() };
  };
  const availability = [slot('u_maya', 15, 20), slot('u_jordan', 16, 21), slot('u_priya', 17, 19), slot('u_leo', 14, 18)];

  const notifications: AppNotification[] = [
    { id: demoId('n'), type: 'friend_request', title: 'Zoe wants to be friends', body: '@zoe.wanders sent you a friend request', data: { userId: 'u_zoe' }, readAt: null, createdAt: ago(90) },
    { id: demoId('n'), type: 'plan_invite', title: 'You’re invited: Sunday sunrise-ish hike', body: 'Jordan added you to a plan', data: { planId: 'pl_hike' }, readAt: null, createdAt: ago(60 * 24) },
  ];

  const zp = zonedParts(Date.now(), tz);
  void zp;

  const conversations: AiConversation[] = [];
  const aiMessages: AiMessage[] = [];

  return {
    version: 3,
    meId: ME,
    email,
    profiles,
    prefs: prefMap,
    privacy,
    notifSettings: DEFAULT_NOTIFICATION_SETTINGS,
    friendships,
    requests,
    blocks: [],
    groups,
    members,
    messages,
    polls: [{ id: pollId, groupId: 'g_study', createdBy: 'u_priya', question: 'Where should we study Thursday?', allowMultiple: false, status: 'open', winningOptionId: null, planId: null, createdAt: ago(60 * 5), closedAt: null }],
    pollOptions,
    votes: [{ pollId, optionId: 'po_2', userId: 'u_maya' }, { pollId, optionId: 'po_1', userId: 'u_priya' }],
    plans,
    participants,
    availability,
    notifications,
    saved: [],
    aiConversations: conversations,
    aiMessages,
    aiUsage: [],
    subscription: { tier: 'free', status: 'none', currentPeriodEnd: null },
  };
}

/** Canned replies from sample friends — short, casual, never claims real-world facts. */
export const SAMPLE_REPLIES = ['I’m down 🙌', 'lol yes', 'works for me', 'wait what time tho', 'ok bet', 'sounds fun!', 'can we do food after?', '👀', 'sure as long as it’s cheap'];
