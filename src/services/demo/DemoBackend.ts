/**
 * DemoBackend — a fully working, on-device implementation of the Backend contract.
 *
 * - Data lives in memory and is persisted to device storage, so demos survive restarts.
 * - The same permission rules as production (src/domain/permissions) are enforced.
 * - Sample friends respond (reply, vote, RSVP, add availability) on short timers so the
 *   realtime UI can be demonstrated without a server.
 * - AI responses come from the deterministic demo planner over SAMPLE places and are
 *   labelled as such. Nothing here is presented as live data.
 */
import { filterPreferences, summarizeGroupPreferences, type Preferences, type PrivacySettings } from '@shared/preferences.ts';
import { checkRateLimit, moderateText, redactPII, DEFAULT_RATE_LIMITS } from '@shared/safety.ts';
import { placeToRecommendation, type Recommendation } from '@shared/recommendation.ts';
import {
  areFriends, canAddToGroup, canClosePoll, canEditPlan, canManageGroup, canPostMessage, canSendFriendRequest,
  isBlockedEitherWay, validateUsername, type GroupRole,
} from '@/domain/permissions';
import { applyVote, resolveClose, tally, validateVote } from '@/domain/voting';
import { planForGroup, planPrivate } from '@/domain/planner/demoPlanner';
import { addDaysISO, localRangeToInterval, todayISOInZone } from '@/domain/time';
import type {
  AiMessage, AppNotification, FriendRequest, GroupDetail, GroupMember, GroupSummary, Message, NotificationType, Plan,
  Poll, ProfileWithRelation, SavedItem,
} from '@/types/models';
import { BackendError, type AuthEvent, type Backend, type RealtimeEvent, type SessionUser, type Unsubscribe } from '../backend/types';
import { createSeed, demoId, ME, nextSaturdayISO, SAMPLE_REPLIES, type DemoDB } from './seed';
import { SAMPLE_PLACES } from './samplePlaces';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const STORAGE_KEY = 'gather.demo.db.v3';
const SESSION_KEY = 'gather.demo.session';
const now = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const clone = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export class DemoBackend implements Backend {
  readonly mode = 'demo' as const;
  private db: DemoDB | null = null;
  private listeners = new Map<string, Set<(e: RealtimeEvent) => void>>();
  private authListeners = new Set<(e: AuthEvent) => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private storage: KeyValueStorage,
    private opts: { simulate: boolean; latencyMs: number } = { simulate: true, latencyMs: 250 },
  ) {
    // Behave like a network API: callers always get copies, never references into the
    // in-memory store (otherwise in-place mutations are invisible to React Query's
    // structural sharing and the UI doesn't update).
    const namespaces = ['profiles', 'settings', 'friends', 'groups', 'messages', 'polls', 'plans', 'availability', 'notifications', 'saved', 'ai', 'places', 'subscription'] as const;
    for (const ns of namespaces) {
      const api = this[ns] as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      for (const key of Object.keys(api)) {
        const fn = api[key];
        api[key] = async (...args: unknown[]) => clone(await fn(...args));
      }
    }
  }

  // ---------------------------------------------------------------- internals
  private async load(): Promise<DemoDB | null> {
    if (this.db) return this.db;
    const signedIn = await this.storage.getItem(SESSION_KEY);
    if (!signedIn) return null;
    const raw = await this.storage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as DemoDB;
        if (parsed.version === 3) this.db = parsed;
      } catch {
        /* corrupted → reseed below */
      }
    }
    if (!this.db) {
      this.db = createSeed(null);
      this.persist();
    }
    return this.db;
  }

  private async d(): Promise<DemoDB> {
    const db = await this.load();
    if (!db) throw new BackendError('You’re signed out.', 'unauthenticated');
    if (this.opts.latencyMs) await sleep(this.opts.latencyMs * (0.5 + Math.random()));
    return db;
  }

  /** Coalesce writes within a tick; `flush()` forces a write (app backgrounding / page unload). */
  private persist() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), 30);
  }

  flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.db) return;
    const db = this.db;
    const copy: DemoDB = {
      ...db,
      aiConversations: db.aiConversations.filter((c) => !c.ephemeral),
      aiMessages: db.aiMessages.filter((m) => !db.aiConversations.find((c) => c.id === m.conversationId)?.ephemeral),
    };
    void this.storage.setItem(STORAGE_KEY, JSON.stringify(copy));
  }

  private emit(topic: string, event: RealtimeEvent) {
    this.listeners.get(topic)?.forEach((cb) => {
      try {
        cb(clone(event));
      } catch (err) {
        console.warn('[demo] listener error', err);
      }
    });
  }

  private later(ms: number, fn: () => void) {
    if (!this.opts.simulate) return;
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (this.db) fn();
    }, ms);
    this.timers.add(t);
  }

  private role(db: DemoDB, groupId: string, userId = db.meId): GroupRole | null {
    return db.members.find((m) => m.groupId === groupId && m.userId === userId)?.role ?? null;
  }

  private requireMember(db: DemoDB, groupId: string): GroupRole {
    const r = this.role(db, groupId);
    if (!r) throw new BackendError('You’re not a member of this group.', 'forbidden');
    return r;
  }

  private notify(db: DemoDB, userId: string, type: NotificationType, title: string, body: string, data: AppNotification['data']) {
    if (userId !== db.meId) return; // only the demo user has an inbox
    const s = db.notifSettings;
    const allowed: Record<NotificationType, boolean> = {
      friend_request: s.friendRequests, friend_accepted: s.friendRequests, group_added: s.groupAdds, mention: s.mentions,
      poll_created: s.polls, poll_closed: s.polls, plan_invite: s.plans, plan_updated: s.plans, plan_reminder: s.reminders,
    };
    if (!allowed[type]) return;
    if (data.groupId && db.members.find((m) => m.groupId === data.groupId && m.userId === db.meId)?.muted && type !== 'mention') return;
    db.notifications.unshift({ id: demoId('n'), type, title, body, data, readAt: null, createdAt: now() });
    this.emit('user', { type: 'notifications' });
  }

  private postMessage(db: DemoDB, m: Omit<Message, 'id' | 'createdAt' | 'clientId'> & { clientId?: string | null }): Message {
    const message: Message = { ...m, id: demoId('m'), clientId: m.clientId ?? null, createdAt: now() };
    db.messages.push(message);
    this.persist();
    this.emit(`group:${m.groupId}`, { type: 'message', groupId: m.groupId, message });
    this.emit('user', { type: 'groups' });
    return message;
  }

  private name(db: DemoDB, id: string | null) {
    if (!id) return 'Gather';
    return db.profiles[id]?.displayName || db.profiles[id]?.username || 'Someone';
  }

  private relation(db: DemoDB, id: string): ProfileWithRelation['relation'] {
    if (id === db.meId) return 'self';
    if (db.blocks.some((b) => b.blockerId === db.meId && b.blockedId === id)) return 'blocked';
    if (areFriends(db.friendships, db.meId, id)) return 'friend';
    const r = db.requests.find((x) => x.status === 'pending' && ((x.senderId === db.meId && x.receiverId === id) || (x.senderId === id && x.receiverId === db.meId)));
    if (r) return r.senderId === db.meId ? 'outgoing' : 'incoming';
    return 'none';
  }

  private planFull(db: DemoDB, p: DemoDB['plans'][number]): Plan {
    return {
      ...p,
      participants: db.participants.filter((x) => x.planId === p.id).map((x) => ({ ...x, profile: db.profiles[x.userId] })),
    };
  }

  private pollFull(db: DemoDB, id: string): Poll {
    const p = db.polls.find((x) => x.id === id);
    if (!p) throw new BackendError('Poll not found.', 'not_found');
    this.requireMember(db, p.groupId);
    // Same rule as get_poll() in SQL: others' identities are hidden unless they allow it.
    let hidden = 0;
    const votes = db.votes
      .filter((v) => v.pollId === id)
      .map((v) => (v.userId === db.meId || db.privacy[v.userId]?.showVoteIdentity !== false ? v : { ...v, userId: `hidden:${v.optionId}:${hidden++}` }));
    return {
      ...p,
      options: db.pollOptions.filter((o) => o.pollId === id).sort((a, b) => a.position - b.position),
      votes,
    };
  }

  // ---------------------------------------------------------------- auth
  auth: Backend['auth'] = {
    getSession: async () => {
      const db = await this.load();
      return db ? { id: db.meId, email: db.email } : null;
    },
    signUp: async () => {
      throw new BackendError('Accounts aren’t available in demo mode. Use “Explore the demo” instead.', 'not_configured');
    },
    signIn: async (): Promise<SessionUser> => {
      // Demo "sign in": create a fresh sample world for this device.
      this.db = createSeed('demo@gather.sample');
      await this.storage.setItem(SESSION_KEY, '1');
      this.persist();
      const user = { id: ME, email: this.db.email };
      this.authListeners.forEach((cb) => cb({ type: 'signed_in', user }));
      return user;
    },
    signOut: async () => {
      this.timers.forEach(clearTimeout);
      this.timers.clear();
      await this.storage.removeItem(SESSION_KEY);
      this.db = null;
      this.authListeners.forEach((cb) => cb({ type: 'signed_out', reason: 'user' }));
    },
    requestPasswordReset: async () => {
      throw new BackendError('Password reset needs a live Supabase project.', 'not_configured');
    },
    updatePassword: async () => {
      throw new BackendError('Passwords aren’t used in demo mode.', 'not_configured');
    },
    handleAuthRedirect: async () => false,
    updateEmail: async () => {
      throw new BackendError('Email changes need a live Supabase project.', 'not_configured');
    },
    deleteAccount: async () => {
      this.timers.forEach(clearTimeout);
      this.timers.clear();
      await this.storage.removeItem(STORAGE_KEY);
      await this.storage.removeItem(SESSION_KEY);
      this.db = null;
      this.authListeners.forEach((cb) => cb({ type: 'signed_out', reason: 'deleted' }));
    },
    onChange: (cb) => {
      this.authListeners.add(cb);
      return () => this.authListeners.delete(cb);
    },
  };

  // ---------------------------------------------------------------- profiles
  profiles: Backend['profiles'] = {
    me: async () => (await this.d()).profiles[ME],
    get: async (id) => {
      const db = await this.d();
      const p = db.profiles[id];
      if (!p || (id !== db.meId && db.blocks.some((b) => b.blockerId === id && b.blockedId === db.meId))) throw new BackendError('Profile not found.', 'not_found');
      const mutual = db.friendships.filter(([a, b]) => a === id || b === id).map(([a, b]) => (a === id ? b : a)).filter((x) => areFriends(db.friendships, db.meId, x)).length;
      const r = db.requests.find((x) => x.status === 'pending' && ((x.senderId === db.meId && x.receiverId === id) || (x.senderId === id && x.receiverId === db.meId)));
      return { ...p, relation: this.relation(db, id), requestId: r?.id, mutualCount: mutual };
    },
    update: async (patch) => {
      const db = await this.d();
      if (patch.username !== undefined && patch.username !== null) {
        const u = patch.username.toLowerCase();
        const v = validateUsername(u);
        if (!v.ok) throw new BackendError(v.error, 'validation');
        if (Object.values(db.profiles).some((p) => p.id !== ME && p.username === u)) throw new BackendError('That username is taken.', 'validation');
        patch = { ...patch, username: u };
      }
      if (patch.displayName !== undefined && patch.displayName.trim().length > 40) throw new BackendError('Name is too long.', 'validation');
      db.profiles[ME] = { ...db.profiles[ME], ...patch };
      this.persist();
      return db.profiles[ME];
    },
    isUsernameAvailable: async (username) => {
      const db = await this.d();
      return !Object.values(db.profiles).some((p) => p.id !== ME && p.username === username.toLowerCase());
    },
    uploadAvatar: async (uri) => {
      const db = await this.d();
      db.profiles[ME] = { ...db.profiles[ME], avatarUrl: uri };
      this.persist();
      return uri;
    },
    search: async (query) => {
      const db = await this.d();
      const q = query.trim().toLowerCase().replace(/^@/, '');
      if (q.length < 2) return [];
      return Object.values(db.profiles)
        .filter((p) => p.id !== ME && db.privacy[p.id]?.discoverable !== false)
        .filter((p) => !isBlockedEitherWay(db.blocks, db.meId, p.id) || db.blocks.some((b) => b.blockerId === db.meId && b.blockedId === p.id))
        .filter((p) => (p.username ?? '').includes(q) || p.displayName.toLowerCase().includes(q))
        .slice(0, 20)
        .map((p) => {
          const r = db.requests.find((x) => x.status === 'pending' && ((x.senderId === db.meId && x.receiverId === p.id) || (x.senderId === p.id && x.receiverId === db.meId)));
          return { ...p, relation: this.relation(db, p.id), requestId: r?.id };
        });
    },
    visiblePreferences: async (userId) => {
      const db = await this.d();
      if (userId !== ME && !areFriends(db.friendships, ME, userId)) return {};
      const prefs = db.prefs[userId];
      const privacy = db.privacy[userId];
      if (!prefs || !privacy) return {};
      return userId === ME ? prefs : filterPreferences(prefs, privacy, 'friends');
    },
  };

  // ---------------------------------------------------------------- settings
  settings: Backend['settings'] = {
    getPreferences: async () => (await this.d()).prefs[ME],
    savePreferences: async (p) => {
      const db = await this.d();
      db.prefs[ME] = p;
      this.persist();
    },
    getPrivacy: async () => (await this.d()).privacy[ME],
    savePrivacy: async (p) => {
      const db = await this.d();
      db.privacy[ME] = p;
      if (!p.storePrivateAiHistory) db.aiConversations.forEach((c) => (c.ephemeral = true));
      this.persist();
    },
    getNotificationSettings: async () => (await this.d()).notifSettings,
    saveNotificationSettings: async (s) => {
      const db = await this.d();
      db.notifSettings = s;
      this.persist();
    },
    exportMyData: async () => {
      const db = await this.d();
      return {
        note: 'Demo mode export — sample data stored only on this device.',
        profile: db.profiles[ME],
        preferences: db.prefs[ME],
        privacy: db.privacy[ME],
        notificationSettings: db.notifSettings,
        friends: db.friendships.map(([a, b]) => (a === ME ? b : a)),
        messagesSent: db.messages.filter((m) => m.senderId === ME).length,
        savedItems: db.saved,
        privateAiConversations: db.aiConversations.length,
      };
    },
  };

  // ---------------------------------------------------------------- friends
  friends: Backend['friends'] = {
    list: async () => {
      const db = await this.d();
      return db.friendships
        .filter(([a, b]) => a === ME || b === ME)
        .map(([a, b]) => db.profiles[a === ME ? b : a])
        .filter(Boolean)
        .sort((x, y) => x.displayName.localeCompare(y.displayName));
    },
    requests: async () => {
      const db = await this.d();
      const toFR = (r: DemoDB['requests'][number], other: string): FriendRequest => ({ ...r, other: db.profiles[other] });
      return {
        incoming: db.requests.filter((r) => r.status === 'pending' && r.receiverId === ME).map((r) => toFR(r, r.senderId)),
        outgoing: db.requests.filter((r) => r.status === 'pending' && r.senderId === ME).map((r) => toFR(r, r.receiverId)),
      };
    },
    send: async (userId) => {
      const db = await this.d();
      const check = canSendFriendRequest({
        senderId: ME, receiverId: userId, blocks: db.blocks, friendships: db.friendships,
        receiverAllowsRequests: db.privacy[userId]?.allowFriendRequests !== false,
        hasPendingBetween: db.requests.some((r) => r.status === 'pending' && ((r.senderId === ME && r.receiverId === userId) || (r.senderId === userId && r.receiverId === ME))),
      });
      if (!check.ok) throw new BackendError(check.error, 'forbidden');
      const req = { id: demoId('fr'), senderId: ME, receiverId: userId, status: 'pending' as const, createdAt: now() };
      db.requests.push(req);
      this.persist();
      this.emit('user', { type: 'friends' });
      // Sample users accept after a moment.
      this.later(2500, () => {
        const d = this.db!;
        const r = d.requests.find((x) => x.id === req.id);
        if (!r || r.status !== 'pending') return;
        r.status = 'accepted';
        d.friendships.push([ME, userId]);
        this.notify(d, ME, 'friend_accepted', `${this.name(d, userId)} accepted your request`, 'You can now add them to groups.', { userId });
        this.persist();
        this.emit('user', { type: 'friends' });
      });
    },
    respond: async (requestId, accept) => {
      const db = await this.d();
      const r = db.requests.find((x) => x.id === requestId && x.receiverId === ME && x.status === 'pending');
      if (!r) throw new BackendError('Request not found.', 'not_found');
      r.status = accept ? 'accepted' : 'declined';
      if (accept && !areFriends(db.friendships, ME, r.senderId)) db.friendships.push([ME, r.senderId]);
      this.persist();
      this.emit('user', { type: 'friends' });
    },
    cancel: async (requestId) => {
      const db = await this.d();
      const r = db.requests.find((x) => x.id === requestId && x.senderId === ME && x.status === 'pending');
      if (!r) throw new BackendError('Request not found.', 'not_found');
      r.status = 'canceled';
      this.persist();
      this.emit('user', { type: 'friends' });
    },
    remove: async (userId) => {
      const db = await this.d();
      db.friendships = db.friendships.filter(([a, b]) => !((a === ME && b === userId) || (a === userId && b === ME)));
      this.persist();
      this.emit('user', { type: 'friends' });
    },
    block: async (userId) => {
      const db = await this.d();
      if (userId === ME) throw new BackendError('You can’t block yourself.', 'validation');
      if (!db.blocks.some((b) => b.blockerId === ME && b.blockedId === userId)) db.blocks.push({ blockerId: ME, blockedId: userId });
      db.friendships = db.friendships.filter(([a, b]) => !((a === ME && b === userId) || (a === userId && b === ME)));
      db.requests.forEach((r) => {
        if (r.status === 'pending' && (r.senderId === userId || r.receiverId === userId)) r.status = 'canceled';
      });
      this.persist();
      this.emit('user', { type: 'friends' });
    },
    unblock: async (userId) => {
      const db = await this.d();
      db.blocks = db.blocks.filter((b) => !(b.blockerId === ME && b.blockedId === userId));
      this.persist();
      this.emit('user', { type: 'friends' });
    },
    blocked: async () => {
      const db = await this.d();
      return db.blocks.filter((b) => b.blockerId === ME).map((b) => db.profiles[b.blockedId]).filter(Boolean);
    },
  };

  // ---------------------------------------------------------------- groups
  groups: Backend['groups'] = {
    list: async () => {
      const db = await this.d();
      const mine = db.members.filter((m) => m.userId === ME);
      const out: GroupSummary[] = mine.map((m) => {
        const g = db.groups.find((x) => x.id === m.groupId)!;
        const msgs = db.messages.filter((x) => x.groupId === g.id);
        const last = msgs[msgs.length - 1] ?? null;
        const members = db.members.filter((x) => x.groupId === g.id);
        return {
          ...g,
          memberCount: members.length,
          memberPreview: members.filter((x) => x.userId !== ME).slice(0, 3).map((x) => db.profiles[x.userId]),
          lastMessage: last,
          unreadCount: msgs.filter((x) => x.createdAt > m.lastReadAt && x.senderId !== ME).length,
          muted: m.muted,
        };
      });
      return out.sort((a, b) => (b.lastMessage?.createdAt ?? b.createdAt).localeCompare(a.lastMessage?.createdAt ?? a.createdAt));
    },
    get: async (id) => {
      const db = await this.d();
      const role = this.requireMember(db, id);
      const g = db.groups.find((x) => x.id === id)!;
      const members: GroupMember[] = db.members
        .filter((m) => m.groupId === id)
        .map((m) => ({ groupId: m.groupId, userId: m.userId, role: m.role, muted: m.muted, aiSharePrefs: m.aiSharePrefs, joinedAt: m.joinedAt, profile: db.profiles[m.userId] }));
      return { ...g, members, myRole: role, myMembership: members.find((m) => m.userId === ME)! };
    },
    create: async ({ name, memberIds, photoUri }) => {
      const db = await this.d();
      const n = name.trim();
      if (n.length < 1 || n.length > 50) throw new BackendError('Group names need 1–50 characters.', 'validation');
      const unique = Array.from(new Set(memberIds.filter((x) => x !== ME)));
      for (const uid of unique) {
        const c = canAddToGroup({ actorId: ME, actorRole: 'owner', targetId: uid, friendships: db.friendships, blocks: db.blocks, alreadyMember: false });
        if (!c.ok) throw new BackendError(`${this.name(db, uid)}: ${c.error}`, 'forbidden');
      }
      const id = demoId('g');
      db.groups.push({ id, name: n, photoUrl: photoUri ?? null, createdBy: ME, aiAutoSuggest: false, createdAt: now(), lastAutoSuggestAt: null });
      db.members.push({ groupId: id, userId: ME, role: 'owner', muted: false, aiSharePrefs: true, joinedAt: now(), lastReadAt: now() });
      for (const uid of unique) db.members.push({ groupId: id, userId: uid, role: 'member', muted: false, aiSharePrefs: true, joinedAt: now(), lastReadAt: now() });
      this.postMessage(db, { groupId: id, senderId: null, kind: 'system', body: `${this.name(db, ME) || 'You'} created “${n}”`, payload: null });
      this.later(3000, () => {
        if (!unique.length) return;
        this.postMessage(this.db!, { groupId: id, senderId: pick(unique), kind: 'text', body: pick(['yooo new group 🎉', 'ok what’s the plan', 'hiii']), payload: null });
      });
      return this.groups.get(id);
    },
    update: async (id, patch) => {
      const db = await this.d();
      const role = this.requireMember(db, id);
      const g = db.groups.find((x) => x.id === id)!;
      if ((patch.name !== undefined || patch.photoUri !== undefined || patch.aiAutoSuggest !== undefined) && !canManageGroup(role))
        throw new BackendError('Only group admins can change group settings.', 'forbidden');
      if (patch.name !== undefined) {
        const n = patch.name.trim();
        if (!n || n.length > 50) throw new BackendError('Group names need 1–50 characters.', 'validation');
        g.name = n;
        this.postMessage(db, { groupId: id, senderId: null, kind: 'system', body: `Group renamed to “${n}”`, payload: null });
      }
      if (patch.photoUri !== undefined) g.photoUrl = patch.photoUri;
      if (patch.aiAutoSuggest !== undefined) {
        g.aiAutoSuggest = patch.aiAutoSuggest;
        this.postMessage(db, { groupId: id, senderId: null, kind: 'system', body: patch.aiAutoSuggest ? 'Automatic Gather suggestions turned on (at most once every 2 hours).' : 'Automatic Gather suggestions turned off.', payload: null });
      }
      this.persist();
      this.emit('user', { type: 'groups' });
    },
    addMembers: async (id, userIds) => {
      const db = await this.d();
      const role = this.requireMember(db, id);
      for (const uid of userIds) {
        const c = canAddToGroup({ actorId: ME, actorRole: role, targetId: uid, friendships: db.friendships, blocks: db.blocks, alreadyMember: !!this.role(db, id, uid) });
        if (!c.ok) throw new BackendError(`${this.name(db, uid)}: ${c.error}`, 'forbidden');
      }
      for (const uid of userIds) {
        db.members.push({ groupId: id, userId: uid, role: 'member', muted: false, aiSharePrefs: true, joinedAt: now(), lastReadAt: now() });
        this.postMessage(db, { groupId: id, senderId: null, kind: 'system', body: `${this.name(db, ME)} added ${this.name(db, uid)}`, payload: null });
      }
      this.persist();
    },
    removeMember: async (id, userId) => {
      const db = await this.d();
      const role = this.requireMember(db, id);
      if (!canManageGroup(role)) throw new BackendError('Only group admins can remove people.', 'forbidden');
      if (this.role(db, id, userId) === 'owner') throw new BackendError('The group owner can’t be removed.', 'forbidden');
      db.members = db.members.filter((m) => !(m.groupId === id && m.userId === userId));
      this.postMessage(db, { groupId: id, senderId: null, kind: 'system', body: `${this.name(db, userId)} was removed`, payload: null });
    },
    leave: async (id) => {
      const db = await this.d();
      const role = this.requireMember(db, id);
      db.members = db.members.filter((m) => !(m.groupId === id && m.userId === ME));
      const rest = db.members.filter((m) => m.groupId === id);
      if (role === 'owner' && rest.length) rest[0].role = 'owner';
      if (!rest.length) {
        db.groups = db.groups.filter((g) => g.id !== id);
        db.messages = db.messages.filter((m) => m.groupId !== id);
      } else this.postMessage(db, { groupId: id, senderId: null, kind: 'system', body: `${this.name(db, ME)} left the group`, payload: null });
      this.persist();
      this.emit('user', { type: 'groups' });
    },
    setMuted: async (id, muted) => {
      const db = await this.d();
      this.requireMember(db, id);
      db.members.find((m) => m.groupId === id && m.userId === ME)!.muted = muted;
      this.persist();
      this.emit('user', { type: 'groups' });
    },
    setAiSharePrefs: async (id, value) => {
      const db = await this.d();
      this.requireMember(db, id);
      db.members.find((m) => m.groupId === id && m.userId === ME)!.aiSharePrefs = value;
      this.persist();
    },
    markRead: async (id) => {
      const db = await this.load();
      const m = db?.members.find((x) => x.groupId === id && x.userId === ME);
      if (!m) return;
      m.lastReadAt = now();
      this.persist();
      this.emit('user', { type: 'groups' });
    },
  };

  // ---------------------------------------------------------------- messages
  messages: Backend['messages'] = {
    list: async (groupId, opts) => {
      const db = await this.d();
      this.requireMember(db, groupId);
      const hidden = new Set(db.blocks.filter((b) => b.blockerId === ME).map((b) => b.blockedId));
      let msgs = db.messages.filter((m) => m.groupId === groupId && !(m.senderId && hidden.has(m.senderId)));
      if (opts?.before) msgs = msgs.filter((m) => m.createdAt < opts.before!);
      return msgs.slice(-(opts?.limit ?? 60));
    },
    send: async (groupId, { body, clientId, kind = 'text', payload = null }) => {
      const db = await this.d();
      const role = this.role(db, groupId);
      const check = canPostMessage(role, kind === 'share' ? body || 'shared' : body);
      if (!check.ok) throw new BackendError(check.error, 'forbidden');
      const existing = db.messages.find((m) => m.clientId === clientId);
      if (existing) return existing; // idempotent retries
      const message = this.postMessage(db, { groupId, senderId: ME, kind, body: body.trim(), payload, clientId });
      // Occasionally a sample friend replies (not to @gather requests).
      if (kind === 'text' && !/@gather/i.test(body) && Math.random() < 0.45) {
        const others = db.members.filter((m) => m.groupId === groupId && m.userId !== ME).map((m) => m.userId);
        if (others.length) this.later(1800 + Math.random() * 2500, () => this.postMessage(this.db!, { groupId, senderId: pick(others), kind: 'text', body: pick(SAMPLE_REPLIES), payload: null }));
      }
      return message;
    },
  };

  // ---------------------------------------------------------------- polls
  polls: Backend['polls'] = {
    get: async (id) => this.pollFull(await this.d(), id),
    listForGroup: async (groupId) => {
      const db = await this.d();
      this.requireMember(db, groupId);
      return db.polls.filter((p) => p.groupId === groupId).map((p) => this.pollFull(db, p.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    create: async (groupId, input) => {
      const db = await this.d();
      this.requireMember(db, groupId);
      const q = input.question.trim();
      if (!q || q.length > 140) throw new BackendError('Ask a question (up to 140 characters).', 'validation');
      const opts = input.options.filter((o) => o.label.trim());
      if (opts.length < 2 || opts.length > 8) throw new BackendError('Polls need 2–8 options.', 'validation');
      const id = demoId('p');
      db.polls.push({ id, groupId, createdBy: ME, question: q, allowMultiple: input.allowMultiple, status: 'open', winningOptionId: null, planId: null, createdAt: now(), closedAt: null });
      opts.forEach((o, i) => db.pollOptions.push({ id: demoId('po'), pollId: id, label: o.label.trim().slice(0, 80), description: o.description ?? null, recommendation: o.recommendation ?? null, position: i }));
      this.postMessage(db, { groupId, senderId: ME, kind: 'poll', body: `Poll: ${q}`, payload: { type: 'poll', pollId: id } });
      // Sample members vote over the next few seconds.
      const voters = db.members.filter((m) => m.groupId === groupId && m.userId !== ME).map((m) => m.userId);
      const optionIds = db.pollOptions.filter((o) => o.pollId === id).map((o) => o.id);
      voters.forEach((uid, i) =>
        this.later(2000 + i * 1300 + Math.random() * 1000, () => {
          const d = this.db!;
          const poll = d.polls.find((p) => p.id === id);
          if (!poll || poll.status !== 'open' || d.votes.some((v) => v.pollId === id && v.userId === uid)) return;
          // Bias toward the first two options (the top-ranked recommendations).
          const choice = Math.random() < 0.7 ? optionIds[Math.floor(Math.random() * Math.min(2, optionIds.length))] : pick(optionIds);
          d.votes = applyVote(d.votes.filter((v) => v.pollId === id), uid, [choice]).map((v) => ({ ...v, pollId: id })).concat(d.votes.filter((v) => v.pollId !== id));
          this.persist();
          this.emit(`group:${groupId}`, { type: 'poll', groupId, pollId: id });
        }),
      );
      return this.pollFull(db, id);
    },
    vote: async (pollId, optionIds) => {
      const db = await this.d();
      const p = this.pollFull(db, pollId);
      const v = validateVote({ status: p.status, allowMultiple: p.allowMultiple, optionIds: p.options.map((o) => o.id) }, optionIds, !!this.role(db, p.groupId));
      if (!v.ok) throw new BackendError(v.error, 'validation');
      const others = db.votes.filter((x) => x.pollId !== pollId);
      const mine = applyVote(db.votes.filter((x) => x.pollId === pollId), ME, v.optionIds).map((x) => ({ ...x, pollId }));
      db.votes = [...others, ...mine];
      this.persist();
      this.emit(`group:${p.groupId}`, { type: 'poll', groupId: p.groupId, pollId });
    },
    close: async (pollId, winnerOptionId) => {
      const db = await this.d();
      const p = this.pollFull(db, pollId);
      const c = canClosePoll({ userId: ME, pollCreatorId: p.createdBy, role: this.role(db, p.groupId) });
      if (!c.ok) throw new BackendError(c.error, 'forbidden');
      if (p.status === 'closed') throw new BackendError('This poll is already closed.', 'validation');
      const { rows } = tally(p.options.map((o) => o.id), p.votes);
      const r = resolveClose(rows, winnerOptionId);
      if (!r.ok) throw new BackendError(r.error, 'validation');
      const raw = db.polls.find((x) => x.id === pollId)!;
      raw.status = 'closed';
      raw.closedAt = now();
      raw.winningOptionId = r.winnerId;
      const winner = p.options.find((o) => o.id === r.winnerId);
      this.postMessage(db, { groupId: p.groupId, senderId: null, kind: 'system', body: winner ? `Poll closed — “${winner.label}” won! 🎉` : 'Poll closed with no votes.', payload: null });
      this.emit(`group:${p.groupId}`, { type: 'poll', groupId: p.groupId, pollId });
      return this.pollFull(db, pollId);
    },
  };

  // ---------------------------------------------------------------- plans
  plans: Backend['plans'] = {
    list: async () => {
      const db = await this.d();
      const myGroups = new Set(db.members.filter((m) => m.userId === ME).map((m) => m.groupId));
      return db.plans
        .filter((p) => db.participants.some((x) => x.planId === p.id && x.userId === ME) || (p.groupId && myGroups.has(p.groupId)))
        .map((p) => this.planFull(db, p));
    },
    get: async (id) => {
      const db = await this.d();
      const p = db.plans.find((x) => x.id === id);
      const isP = db.participants.some((x) => x.planId === id && x.userId === ME);
      if (!p || (!isP && !(p.groupId && this.role(db, p.groupId)))) throw new BackendError('Plan not found.', 'not_found');
      return this.planFull(db, p);
    },
    create: async (input) => {
      const db = await this.d();
      const title = input.title.trim();
      if (!title || title.length > 80) throw new BackendError('Give the plan a title (up to 80 characters).', 'validation');
      if (input.groupId) this.requireMember(db, input.groupId);
      if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) throw new BackendError('End time must be after start time.', 'validation');
      const id = demoId('pl');
      db.plans.push({
        id, groupId: input.groupId, createdBy: ME, title, description: input.description ?? null, activity: input.activity ?? null, place: input.place ?? null,
        startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, timezone: input.timezone, locationText: input.locationText ?? input.place?.locationText ?? null,
        budgetText: input.budgetText ?? null, status: input.status ?? 'planning', sourcePollId: input.sourcePollId ?? null, createdAt: now(), updatedAt: now(),
      });
      const invitees = input.participantIds ?? (input.groupId ? db.members.filter((m) => m.groupId === input.groupId).map((m) => m.userId) : []);
      const allowed = Array.from(new Set([ME, ...invitees])).filter((u) => u === ME || (input.groupId ? !!this.role(db, input.groupId, u) : areFriends(db.friendships, ME, u)));
      for (const u of allowed) db.participants.push({ planId: id, userId: u, rsvp: u === ME ? 'going' : 'invited', role: u === ME ? 'organizer' : 'member' });
      if (input.groupId) this.postMessage(db, { groupId: input.groupId, senderId: ME, kind: 'plan', body: `New plan: ${title}`, payload: { type: 'plan', planId: id } });
      this.simulatePlanResponses(id);
      this.emit('user', { type: 'groups' });
      return this.planFull(db, db.plans.find((p) => p.id === id)!);
    },
    createFromPoll: async (pollId, extra) => {
      const db = await this.d();
      const poll = this.pollFull(db, pollId);
      if (poll.status !== 'closed' || !poll.winningOptionId) throw new BackendError('Close the poll with a winner first.', 'validation');
      if (poll.planId) return this.plans.get(poll.planId);
      const winner = poll.options.find((o) => o.id === poll.winningOptionId)!;
      const plan = await this.plans.create({
        groupId: poll.groupId, title: extra.title ?? winner.label, activity: winner.label, place: winner.recommendation, timezone: extra.timezone,
        locationText: winner.recommendation?.locationText ?? null, budgetText: winner.recommendation?.estimatedCost?.label ?? null, sourcePollId: pollId,
        description: `Picked by the group from “${poll.question}”.`,
      });
      db.polls.find((p) => p.id === pollId)!.planId = plan.id;
      this.persist();
      return plan;
    },
    update: async (id, patch) => {
      const db = await this.d();
      const p = db.plans.find((x) => x.id === id);
      if (!p) throw new BackendError('Plan not found.', 'not_found');
      const c = canEditPlan({ userId: ME, createdBy: p.createdBy, groupRole: p.groupId ? this.role(db, p.groupId) : null, isParticipant: db.participants.some((x) => x.planId === id && x.userId === ME) });
      if (!c.ok) throw new BackendError(c.error, 'forbidden');
      const next = { ...p, ...Object.fromEntries(Object.entries(patch).filter(([k]) => k !== 'participantIds' && k !== 'groupId')), updatedAt: now() } as typeof p;
      if (next.startsAt && next.endsAt && next.endsAt <= next.startsAt) throw new BackendError('End time must be after start time.', 'validation');
      if (next.status === 'confirmed' && !next.startsAt) throw new BackendError('Pick a time before confirming the plan.', 'validation');
      Object.assign(p, next);
      if (p.groupId) {
        const what = patch.status === 'confirmed' ? `✅ Plan confirmed: ${p.title}` : patch.status === 'canceled' ? `Plan canceled: ${p.title}` : patch.startsAt ? `🕒 Time set for ${p.title}` : `Plan updated: ${p.title}`;
        this.postMessage(db, { groupId: p.groupId, senderId: null, kind: 'plan', body: what, payload: { type: 'plan', planId: p.id } });
      }
      this.persist();
      this.emit(`plan:${id}`, { type: 'plan', planId: id });
      return this.planFull(db, p);
    },
    setRsvp: async (planId, rsvp) => {
      const db = await this.d();
      const part = db.participants.find((x) => x.planId === planId && x.userId === ME);
      if (!part) {
        const p = db.plans.find((x) => x.id === planId);
        if (!p?.groupId || !this.role(db, p.groupId)) throw new BackendError('You’re not part of this plan.', 'forbidden');
        db.participants.push({ planId, userId: ME, rsvp, role: 'member' });
      } else part.rsvp = rsvp;
      this.persist();
      this.emit(`plan:${planId}`, { type: 'plan', planId });
    },
    invite: async (planId, userIds) => {
      const db = await this.d();
      const p = db.plans.find((x) => x.id === planId);
      if (!p) throw new BackendError('Plan not found.', 'not_found');
      if (!db.participants.some((x) => x.planId === planId && x.userId === ME)) throw new BackendError('You’re not part of this plan.', 'forbidden');
      for (const u of userIds) {
        if (isBlockedEitherWay(db.blocks, ME, u)) continue;
        const ok = p.groupId ? !!this.role(db, p.groupId, u) || areFriends(db.friendships, ME, u) : areFriends(db.friendships, ME, u);
        if (!ok) throw new BackendError('You can only invite friends or group members.', 'forbidden');
        if (!db.participants.some((x) => x.planId === planId && x.userId === u)) db.participants.push({ planId, userId: u, rsvp: 'invited', role: 'member' });
      }
      this.persist();
      this.simulatePlanResponses(planId);
      this.emit(`plan:${planId}`, { type: 'plan', planId });
    },
    shareToGroup: async (planId, groupId) => {
      const db = await this.d();
      this.requireMember(db, groupId);
      const p = await this.plans.get(planId);
      this.postMessage(db, { groupId, senderId: ME, kind: 'plan', body: `Shared a plan: ${p.title}`, payload: { type: 'plan', planId } });
    },
  };

  private simulatePlanResponses(planId: string) {
    const db = this.db!;
    const others = db.participants.filter((x) => x.planId === planId && x.userId !== ME && x.rsvp === 'invited' && db.profiles[x.userId]?.isSample);
    others.forEach((x, i) =>
      this.later(2500 + i * 1500, () => {
        const part = this.db!.participants.find((y) => y.planId === planId && y.userId === x.userId);
        if (part && part.rsvp === 'invited') part.rsvp = Math.random() < 0.8 ? 'going' : 'maybe';
        this.persist();
        this.emit(`plan:${planId}`, { type: 'plan', planId });
      }),
    );
  }

  // ---------------------------------------------------------------- availability
  availability: Backend['availability'] = {
    list: async (planId) => {
      const db = await this.d();
      await this.plans.get(planId); // access check
      return db.availability.filter((a) => a.planId === planId);
    },
    setMine: async (planId, ranges) => {
      const db = await this.d();
      const plan = await this.plans.get(planId);
      for (const r of ranges) {
        if (!(new Date(r.endsAt) > new Date(r.startsAt))) throw new BackendError('Each time range needs an end after its start.', 'validation');
        if (new Date(r.endsAt).getTime() - new Date(r.startsAt).getTime() > 24 * 3600_000) throw new BackendError('Ranges can be at most 24 hours.', 'validation');
      }
      if (ranges.length > 20) throw new BackendError('Up to 20 ranges per plan.', 'validation');
      db.availability = db.availability.filter((a) => !(a.planId === planId && a.userId === ME));
      for (const r of ranges) db.availability.push({ id: demoId('av'), planId, userId: ME, ...r });
      this.persist();
      this.emit(`plan:${planId}`, { type: 'availability', planId });
      // Sample participants who haven't answered add plausible availability on the same day.
      const missing = plan.participants.filter((p) => p.userId !== ME && p.profile.isSample && !db.availability.some((a) => a.planId === planId && a.userId === p.userId));
      const baseDay = ranges[0] ? ranges[0].startsAt : null;
      missing.forEach((p, i) =>
        this.later(2000 + i * 1600, () => {
          const d = this.db!;
          const day = baseDay ? todayISOInZone(plan.timezone, new Date(baseDay).getTime()) : nextSaturdayISO(plan.timezone);
          const start = (14 + Math.floor(Math.random() * 5)) * 60;
          const iv = localRangeToInterval(day, start, start + (2 + Math.floor(Math.random() * 4)) * 60, plan.timezone);
          d.availability.push({ id: demoId('av'), planId, userId: p.userId, startsAt: new Date(iv.start).toISOString(), endsAt: new Date(iv.end).toISOString() });
          this.persist();
          this.emit(`plan:${planId}`, { type: 'availability', planId });
        }),
      );
    },
  };

  // ---------------------------------------------------------------- notifications
  notifications: Backend['notifications'] = {
    list: async () => (await this.d()).notifications.slice(0, 100),
    markRead: async (ids) => {
      const db = await this.d();
      db.notifications.forEach((n) => {
        if (ids === 'all' || ids.includes(n.id)) n.readAt = n.readAt ?? now();
      });
      this.persist();
      this.emit('user', { type: 'notifications' });
    },
  };

  // ---------------------------------------------------------------- saved
  saved: Backend['saved'] = {
    list: async () => (await this.d()).saved,
    save: async (rec, collection = 'Saved') => {
      const db = await this.d();
      const existing = db.saved.find((s) => (rec.placeId && s.recommendation.placeId === rec.placeId) || s.recommendation.id === rec.id);
      if (existing) return existing;
      const item: SavedItem = { id: demoId('s'), collection: collection.trim().slice(0, 40) || 'Saved', recommendation: rec, note: null, createdAt: now() };
      db.saved.unshift(item);
      this.persist();
      return item;
    },
    remove: async (id) => {
      const db = await this.d();
      db.saved = db.saved.filter((s) => s.id !== id);
      this.persist();
    },
    move: async (id, collection) => {
      const db = await this.d();
      const s = db.saved.find((x) => x.id === id);
      if (s) s.collection = collection.trim().slice(0, 40) || 'Saved';
      this.persist();
    },
  };

  // ---------------------------------------------------------------- AI
  private useAi(db: DemoDB) {
    const decision = checkRateLimit(db.aiUsage, db.subscription.tier, Date.now(), DEFAULT_RATE_LIMITS);
    if (!decision.allowed) throw new BackendError(decision.userMessage, 'rate_limited');
    db.aiUsage = [...db.aiUsage.filter((t) => t > Date.now() - 86400_000), Date.now()];
  }

  ai: Backend['ai'] = {
    planForGroup: async (groupId, { prompt, trigger }) => {
      const db = await this.d();
      this.requireMember(db, groupId);
      if (prompt) {
        const m = moderateText(prompt);
        if (!m.allowed) throw new BackendError(m.userMessage, 'moderation');
      }
      const g = db.groups.find((x) => x.id === groupId)!;
      if (trigger === 'auto') {
        if (!g.aiAutoSuggest) return null;
        g.lastAutoSuggestAt = now();
      }
      this.useAi(db);
      await sleep(900);
      const lines = db.messages
        .filter((m) => m.groupId === groupId && m.kind === 'text' && m.senderId)
        .slice(-30)
        .map((m) => ({ authorId: m.senderId!, authorName: this.name(db, m.senderId), text: redactPII(m.body.replace(/@gather/gi, '')) }));
      const members = db.members.filter((m) => m.groupId === groupId);
      const summary = summarizeGroupPreferences(members.map((m) => ({ groupOptIn: m.aiSharePrefs, prefs: db.prefs[m.userId], privacy: db.privacy[m.userId] })));
      const { response } = planForGroup({ lines, summary, places: SAMPLE_PLACES, prompt: prompt ? redactPII(prompt) : undefined });
      return this.postMessage(db, {
        groupId, senderId: null, kind: 'ai', body: response.message,
        payload: { type: 'ai', response, requestedBy: trigger === 'auto' ? null : ME, trigger },
      });
    },
    conversations: async () => {
      const db = await this.d();
      return [...db.aiConversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    messages: async (conversationId) => {
      const db = await this.d();
      if (!db.aiConversations.some((c) => c.id === conversationId)) throw new BackendError('Conversation not found.', 'not_found');
      return db.aiMessages.filter((m) => m.conversationId === conversationId);
    },
    sendPrivate: async (conversationId, text) => {
      const db = await this.d();
      const t = text.trim();
      if (!t) throw new BackendError('Type a question first.', 'validation');
      if (t.length > 1000) throw new BackendError('That’s a bit long — keep it under 1000 characters.', 'validation');
      const m = moderateText(t);
      let convId = conversationId;
      if (!convId || !db.aiConversations.some((c) => c.id === convId)) {
        convId = demoId('c');
        db.aiConversations.push({ id: convId, title: t.slice(0, 48), createdAt: now(), updatedAt: now(), ephemeral: !db.privacy[ME].storePrivateAiHistory });
      }
      const userMsg: AiMessage = { id: demoId('am'), conversationId: convId, role: 'user', content: t, response: null, createdAt: now() };
      db.aiMessages.push(userMsg);
      let reply: AiMessage;
      if (!m.allowed) {
        reply = { id: demoId('am'), conversationId: convId, role: 'assistant', content: m.userMessage, response: null, createdAt: now() };
      } else {
        this.useAi(db);
        await sleep(800);
        const history = db.aiMessages.filter((x) => x.conversationId === convId && x.role === 'user' && x.id !== userMsg.id).slice(-4).map((x) => x.content);
        const prefs = filterPreferences(db.prefs[ME], db.privacy[ME], 'ai');
        const response = planPrivate({ prompt: redactPII(t), history, prefs, places: SAMPLE_PLACES });
        reply = { id: demoId('am'), conversationId: convId, role: 'assistant', content: response.message, response, createdAt: now() };
      }
      db.aiMessages.push(reply);
      db.aiConversations.find((c) => c.id === convId)!.updatedAt = now();
      this.persist();
      return { conversationId: convId, messages: [userMsg, reply] };
    },
    deleteConversation: async (id) => {
      const db = await this.d();
      db.aiConversations = db.aiConversations.filter((c) => c.id !== id);
      db.aiMessages = db.aiMessages.filter((m) => m.conversationId !== id);
      this.persist();
    },
    deleteAllPrivate: async () => {
      const db = await this.d();
      db.aiConversations = [];
      db.aiMessages = [];
      this.persist();
    },
    usage: async () => {
      const db = await this.d();
      const used = db.aiUsage.filter((t) => t > Date.now() - 86400_000).length;
      return { usedToday: used, dailyLimit: DEFAULT_RATE_LIMITS.dailyLimit[db.subscription.tier], tier: db.subscription.tier };
    },
  };

  // ---------------------------------------------------------------- places
  places: Backend['places'] = {
    status: async () => 'sample',
    search: async (q) => {
      await this.d();
      const query = (q.query ?? '').trim().toLowerCase();
      const list = SAMPLE_PLACES.filter((p) => {
        if (q.category === 'group') {
          if (!p.goodForGroups) return false;
        } else if (q.category === 'weekend') {
          if (!['outdoors', 'entertainment', 'games', 'food'].includes(p.category)) return false;
        } else if (q.category === 'free') {
          if (p.priceLevel !== 0) return false;
        } else if (q.category && p.category !== q.category) return false;
        if (q.maxPriceLevel !== null && q.maxPriceLevel !== undefined && (p.priceLevel ?? 0) > q.maxPriceLevel) return false;
        if (q.maxDistanceKm && p.distanceKm > q.maxDistanceKm) return false;
        if (query && !(p.name.toLowerCase().includes(query) || p.tags.some((t) => t.includes(query) || query.includes(t)) || p.category.includes(query))) return false;
        return true;
      }).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      return list.map((p) =>
        placeToRecommendation(p, {
          id: `rec_${p.placeId}`,
          whyItFits: [p.goodForGroups ? 'Good for groups' : 'Better for small groups', p.indoor ? 'indoors' : 'outdoors', `${p.distanceKm} km away (sample)`].join(' · '),
        }),
      );
    },
  };

  // ---------------------------------------------------------------- subscription
  subscription: Backend['subscription'] = {
    get: async () => (await this.d()).subscription,
    joinWaitlist: async () => {
      const db = await this.d();
      db.subscription = { ...db.subscription, status: 'waitlist' };
      this.persist();
    },
  };

  // ---------------------------------------------------------------- realtime
  realtime: Backend['realtime'] = {
    subscribe: (topic, cb): Unsubscribe => {
      let set = this.listeners.get(topic);
      if (!set) {
        set = new Set();
        this.listeners.set(topic, set);
      }
      set.add(cb);
      if (topic === 'connection') cb({ type: 'connection', status: 'connected' });
      return () => {
        set!.delete(cb);
      };
    },
  };

  /** Test helper: snapshot of the internal DB. */
  _debugDb() {
    return this.db;
  }
}

// Keep tree-shaking honest for helpers only used in some code paths.
export const _demoInternals = { addDaysISO, placeToRecommendation, ME };
export type { Recommendation, Preferences, PrivacySettings, GroupDetail };
