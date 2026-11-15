/**
 * LiveBackend — Supabase implementation of the Backend contract.
 *
 * Security model: the anon key is public; every read/write is authorized by Postgres RLS
 * and SECURITY DEFINER RPCs (supabase/migrations). AI and place search run in Edge
 * Functions so provider API keys never reach the device.
 */
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { createClient, FunctionsHttpError, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_RATE_LIMITS } from '@shared/safety.ts';
import type { Recommendation } from '@shared/recommendation.ts';
import type { FriendRequest, GroupDetail, GroupMember, GroupSummary, Profile, ProfileWithRelation } from '@/types/models';
import { BackendError, type AuthEvent, type Backend, type RealtimeEvent, type SessionUser, type Unsubscribe } from '../backend/types';
import {
  fromNotificationSettings, fromPreferences, fromPrivacy, toMessage, toNotification, toNotificationSettings, toPlan, toPoll, toPreferences, toPrivacy,
  toProfile, toSlot,
} from './mappers';

type Row = Record<string, any>;

const PLAN_SELECT = '*, plan_participants(*, profile:profiles(*))';

/** Postgres / PostgREST errors → user-friendly BackendError. */
function fail(error: { code?: string; message?: string; details?: string } | null | undefined, fallback = 'Something went wrong.'): never {
  const code = error?.code ?? '';
  const msg = error?.message ?? fallback;
  if (code === '28000' || code === 'PGRST301' || /JWT/i.test(msg)) throw new BackendError('Your session expired. Please sign in again.', 'unauthenticated');
  if (code === '42501') throw new BackendError(/permission denied|row-level security/i.test(msg) ? 'You don’t have permission to do that.' : msg, 'forbidden');
  if (code === 'P0002' || code === 'PGRST116') throw new BackendError(msg.includes('not found') ? msg : 'Not found.', 'not_found');
  if (code === '23505') throw new BackendError(/username/.test(msg) ? 'That username is taken.' : 'That already exists.', 'validation');
  if (code === '23514') throw new BackendError('Some of those details aren’t valid. Please check and try again.', 'validation');
  if (code === '22023' || code === '22P02') throw new BackendError(msg, 'validation');
  if (/Failed to fetch|Network request failed|NetworkError/i.test(msg)) throw new BackendError('You appear to be offline. Check your connection and try again.', 'network');
  throw new BackendError(msg, 'unknown');
}

// PostgREST rows are untyped here (no generated DB types yet) — mappers validate shape.
function must(res: { data: unknown; error: any }): any {
  if (res.error) fail(res.error);
  return res.data;
}

export class LiveBackend implements Backend {
  readonly mode = 'live' as const;
  readonly sb: SupabaseClient;
  private userId: string | null = null;
  private signingOut = false;
  private connectionListeners = new Set<(e: RealtimeEvent) => void>();
  private channelStates = new Map<string, string>();

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce',
      },
    });
    // Only refresh tokens while the app is foregrounded (Supabase RN guidance).
    if (Platform.OS !== 'web') {
      AppState.addEventListener('change', (s) => {
        if (s === 'active') this.sb.auth.startAutoRefresh();
        else this.sb.auth.stopAutoRefresh();
      });
    }
    this.sb.auth.onAuthStateChange((event, session) => {
      this.userId = session?.user.id ?? null;
      if (event === 'SIGNED_OUT') this.realtimeTeardown();
    });
  }

  private async uid(): Promise<string> {
    if (this.userId) return this.userId;
    const { data } = await this.sb.auth.getSession();
    if (!data.session) throw new BackendError('You’re signed out.', 'unauthenticated');
    this.userId = data.session.user.id;
    return this.userId;
  }

  private async rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) fail(error);
    return data as T;
  }

  /** Invoke an Edge Function and surface its JSON error body as a BackendError. */
  private async invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.functions.invoke(name, { body });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        let payload: { error?: string; code?: BackendError['code'] } = {};
        try {
          payload = await error.context.json();
        } catch {
          /* non-JSON */
        }
        throw new BackendError(payload.error ?? 'The server couldn’t complete that request.', payload.code ?? 'unknown');
      }
      throw new BackendError(`${name === 'ai-plan' ? 'Gather AI' : 'The server'} isn’t reachable right now. Check your connection, or make sure the Edge Function is deployed.`, 'network');
    }
    return data as T;
  }

  private async uploadImage(bucket: string, folder: string, localUri: string): Promise<string> {
    const res = await fetch(localUri);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 3 * 1024 * 1024) throw new BackendError('That image is too large (max 3 MB).', 'validation');
    const type = res.headers.get('content-type') || 'image/jpeg';
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    const path = `${folder}/${Date.now()}.${ext}`;
    const { error } = await this.sb.storage.from(bucket).upload(path, buf, { contentType: type, upsert: true });
    if (error) throw new BackendError(error.message, 'unknown');
    return this.sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  // ---------------------------------------------------------------- auth
  auth: Backend['auth'] = {
    getSession: async () => {
      const { data, error } = await this.sb.auth.getSession();
      if (error || !data.session) return null;
      // Validate the session server-side (catches revoked / deleted users).
      const { data: u, error: uErr } = await this.sb.auth.getUser();
      if (uErr || !u.user) {
        await this.sb.auth.signOut({ scope: 'local' }).catch(() => {});
        return null;
      }
      this.userId = u.user.id;
      return { id: u.user.id, email: u.user.email ?? null };
    },
    signUp: async (email, password) => {
      const { data, error } = await this.sb.auth.signUp({ email, password, options: { emailRedirectTo: Linking.createURL('/') } });
      if (error) throw new BackendError(error.message, error.status === 429 ? 'rate_limited' : 'validation');
      if (data.session) this.userId = data.session.user.id;
      return { needsEmailConfirmation: !data.session };
    },
    signIn: async (email, password): Promise<SessionUser> => {
      const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
      if (error) {
        if (/invalid login/i.test(error.message)) throw new BackendError('Email or password is incorrect.', 'validation');
        if (/not confirmed/i.test(error.message)) throw new BackendError('Please confirm your email first — check your inbox.', 'validation');
        throw new BackendError(error.message, error.status === 429 ? 'rate_limited' : 'unknown');
      }
      this.userId = data.user.id;
      return { id: data.user.id, email: data.user.email ?? null };
    },
    signOut: async () => {
      this.signingOut = true;
      try {
        await this.sb.auth.signOut();
      } finally {
        this.signingOut = false;
        this.userId = null;
      }
    },
    requestPasswordReset: async (email) => {
      const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: Linking.createURL('/reset-password') });
      if (error) throw new BackendError(error.message, error.status === 429 ? 'rate_limited' : 'unknown');
    },
    updatePassword: async (password) => {
      const { error } = await this.sb.auth.updateUser({ password });
      if (error) throw new BackendError(error.message, 'validation');
    },
    handleAuthRedirect: async (url) => {
      const parsed = Linking.parse(url);
      const qp = (parsed.queryParams ?? {}) as Record<string, string>;
      const hash = url.includes('#') ? Object.fromEntries(new URLSearchParams(url.split('#')[1])) : {};
      if (qp.code) {
        const { error } = await this.sb.auth.exchangeCodeForSession(qp.code);
        if (error) throw new BackendError(error.message, 'unauthenticated');
        return true;
      }
      if (hash.access_token && hash.refresh_token) {
        const { error } = await this.sb.auth.setSession({ access_token: hash.access_token, refresh_token: hash.refresh_token });
        if (error) throw new BackendError(error.message, 'unauthenticated');
        return true;
      }
      return false;
    },
    updateEmail: async (email) => {
      const { error } = await this.sb.auth.updateUser({ email }, { emailRedirectTo: Linking.createURL('/') });
      if (error) throw new BackendError(error.message, 'validation');
    },
    deleteAccount: async () => {
      await this.invoke('delete-account', {});
      await this.sb.auth.signOut({ scope: 'local' }).catch(() => {});
    },
    onChange: (cb) => {
      const { data } = this.sb.auth.onAuthStateChange((event, session) => {
        let e: AuthEvent | null = null;
        if (event === 'SIGNED_IN' && session) e = { type: 'signed_in', user: { id: session.user.id, email: session.user.email ?? null } };
        if (event === 'SIGNED_OUT') e = { type: 'signed_out', reason: this.signingOut ? 'user' : 'expired' };
        if (event === 'PASSWORD_RECOVERY') e = { type: 'password_recovery' };
        if (e) setTimeout(() => cb(e!), 0); // never call Supabase from inside this callback synchronously
      });
      return () => data.subscription.unsubscribe();
    },
  };

  // ---------------------------------------------------------------- profiles
  profiles: Backend['profiles'] = {
    me: async () => {
      const id = await this.uid();
      return toProfile(must(await this.sb.from('profiles').select('*').eq('id', id).single()));
    },
    get: async (id) => {
      const me = await this.uid();
      const row = must(await this.sb.from('profiles').select('*').eq('id', id).maybeSingle());
      if (!row) throw new BackendError('Profile not found.', 'not_found');
      const [friend, req, block] = await Promise.all([
        this.sb.from('friendships').select('user_a').eq('user_a', me < id ? me : id).eq('user_b', me < id ? id : me).maybeSingle(),
        this.sb.from('friend_requests').select('id, sender_id').eq('status', 'pending').or(`and(sender_id.eq.${me},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${me})`).maybeSingle(),
        this.sb.from('blocks').select('blocked_id').eq('blocker_id', me).eq('blocked_id', id).maybeSingle(),
      ]);
      const relation: ProfileWithRelation['relation'] =
        id === me ? 'self' : block.data ? 'blocked' : friend.data ? 'friend' : req.data ? (req.data.sender_id === me ? 'outgoing' : 'incoming') : 'none';
      return { ...toProfile(row), relation, requestId: req.data?.id };
    },
    update: async (patch) => {
      const id = await this.uid();
      const body: Row = {};
      if (patch.username !== undefined) body.username = patch.username?.toLowerCase() ?? null;
      if (patch.displayName !== undefined) body.display_name = patch.displayName;
      if (patch.bio !== undefined) body.bio = patch.bio;
      if (patch.city !== undefined) body.city = patch.city;
      if (patch.onboardedAt !== undefined) body.onboarded_at = patch.onboardedAt;
      return toProfile(must(await this.sb.from('profiles').update(body).eq('id', id).select('*').single()));
    },
    isUsernameAvailable: (u) => this.rpc<boolean>('is_username_available', { u }),
    uploadAvatar: async (uri) => {
      const id = await this.uid();
      const url = await this.uploadImage('avatars', id, uri);
      must(await this.sb.from('profiles').update({ avatar_url: url }).eq('id', id).select('id').single());
      return url;
    },
    search: async (q) => {
      const rows = await this.rpc<Row[]>('search_profiles', { q });
      return rows.map((r) => ({ ...toProfile(r), relation: r.relation, requestId: r.request_id ?? undefined }));
    },
    visiblePreferences: (userId) => this.rpc('get_visible_preferences', { target: userId }),
  };

  // ---------------------------------------------------------------- settings
  settings: Backend['settings'] = {
    getPreferences: async () => toPreferences(must(await this.sb.from('user_preferences').select('*').eq('user_id', await this.uid()).maybeSingle())),
    savePreferences: async (p) => {
      must(await this.sb.from('user_preferences').update(fromPreferences(p)).eq('user_id', await this.uid()).select('user_id').single());
    },
    getPrivacy: async () => toPrivacy(must(await this.sb.from('privacy_settings').select('*').eq('user_id', await this.uid()).maybeSingle())),
    savePrivacy: async (p) => {
      must(await this.sb.from('privacy_settings').update(fromPrivacy(p)).eq('user_id', await this.uid()).select('user_id').single());
    },
    getNotificationSettings: async () => toNotificationSettings(must(await this.sb.from('notification_settings').select('*').eq('user_id', await this.uid()).single())),
    saveNotificationSettings: async (s) => {
      must(await this.sb.from('notification_settings').update(fromNotificationSettings(s)).eq('user_id', await this.uid()).select('user_id').single());
    },
    exportMyData: async () => {
      const id = await this.uid();
      const tables = ['profiles', 'user_preferences', 'privacy_settings', 'notification_settings', 'saved_places', 'ai_conversations', 'notifications', 'subscription_status'] as const;
      const out: Record<string, unknown> = { exportedAt: new Date().toISOString() };
      for (const t of tables) {
        const col = t === 'profiles' ? 'id' : 'user_id';
        out[t] = (await this.sb.from(t).select('*').eq(col, id)).data;
      }
      out.messagesSent = (await this.sb.from('messages').select('id', { count: 'exact', head: true }).eq('sender_id', id)).count;
      return out;
    },
  };

  // ---------------------------------------------------------------- friends
  friends: Backend['friends'] = {
    list: async () => {
      const me = await this.uid();
      const rows = must(await this.sb.from('friendships').select('user_a, user_b'));
      const ids = rows.map((r: Row) => (r.user_a === me ? r.user_b : r.user_a));
      if (!ids.length) return [];
      const profiles = must(await this.sb.from('profiles').select('*').in('id', ids));
      return profiles.map(toProfile).sort((a: Profile, b: Profile) => a.displayName.localeCompare(b.displayName));
    },
    requests: async () => {
      const me = await this.uid();
      const rows = must(
        await this.sb.from('friend_requests')
          .select('*, sender:profiles!friend_requests_sender_id_fkey(*), receiver:profiles!friend_requests_receiver_id_fkey(*)')
          .eq('status', 'pending').order('created_at', { ascending: false }),
      );
      const map = (r: Row, other: Row): FriendRequest => ({ id: r.id, senderId: r.sender_id, receiverId: r.receiver_id, status: r.status, createdAt: r.created_at, other: toProfile(other) });
      return {
        incoming: rows.filter((r: Row) => r.receiver_id === me).map((r: Row) => map(r, r.sender)),
        outgoing: rows.filter((r: Row) => r.sender_id === me).map((r: Row) => map(r, r.receiver)),
      };
    },
    send: async (userId) => { await this.rpc('send_friend_request', { target: userId }); },
    respond: async (requestId, accept) => { await this.rpc('respond_friend_request', { request_id: requestId, accept }); },
    cancel: async (requestId) => { await this.rpc('cancel_friend_request', { request_id: requestId }); },
    remove: async (userId) => {
      const me = await this.uid();
      must(await this.sb.from('friendships').delete().eq('user_a', me < userId ? me : userId).eq('user_b', me < userId ? userId : me));
    },
    block: async (userId) => {
      const me = await this.uid();
      const { error } = await this.sb.from('blocks').insert({ blocker_id: me, blocked_id: userId });
      if (error && error.code !== '23505') fail(error);
    },
    unblock: async (userId) => {
      must(await this.sb.from('blocks').delete().eq('blocker_id', await this.uid()).eq('blocked_id', userId));
    },
    blocked: async () => {
      const rows = must(await this.sb.from('blocks').select('blocked:profiles!blocks_blocked_id_fkey(*)').eq('blocker_id', await this.uid()));
      return rows.map((r: Row) => toProfile(r.blocked));
    },
  };

  private blockedIds: { at: number; ids: Set<string> } | null = null;
  private async myBlocks(): Promise<Set<string>> {
    if (this.blockedIds && Date.now() - this.blockedIds.at < 30_000) return this.blockedIds.ids;
    const rows = (await this.sb.from('blocks').select('blocked_id')).data ?? [];
    this.blockedIds = { at: Date.now(), ids: new Set(rows.map((r: Row) => r.blocked_id)) };
    return this.blockedIds.ids;
  }

  // ---------------------------------------------------------------- groups
  groups: Backend['groups'] = {
    list: async () => {
      const rows = await this.rpc<Row[]>('get_group_summaries');
      const out: GroupSummary[] = rows.map((r) => ({
        id: r.id, name: r.name, photoUrl: r.photo_url, createdBy: r.created_by, aiAutoSuggest: r.ai_auto_suggest, createdAt: r.created_at,
        memberCount: Number(r.member_count), memberPreview: (r.member_preview ?? []).map(toProfile),
        lastMessage: r.last_message ? toMessage(r.last_message) : null, unreadCount: Number(r.unread_count), muted: r.muted,
      }));
      return out.sort((a, b) => (b.lastMessage?.createdAt ?? b.createdAt).localeCompare(a.lastMessage?.createdAt ?? a.createdAt));
    },
    get: async (id): Promise<GroupDetail> => {
      const me = await this.uid();
      const g = must(await this.sb.from('groups').select('*, group_members(*, profile:profiles(*))').eq('id', id).maybeSingle());
      if (!g) throw new BackendError('This group doesn’t exist or you’re no longer a member.', 'not_found');
      const members: GroupMember[] = g.group_members.map((m: Row) => ({
        groupId: m.group_id, userId: m.user_id, role: m.role, muted: m.muted, aiSharePrefs: m.ai_share_prefs, joinedAt: m.joined_at, profile: toProfile(m.profile),
      }));
      const mine = members.find((m) => m.userId === me);
      if (!mine) throw new BackendError('You’re not a member of this group.', 'forbidden');
      return { id: g.id, name: g.name, photoUrl: g.photo_url, createdBy: g.created_by, aiAutoSuggest: g.ai_auto_suggest, createdAt: g.created_at, members, myRole: mine.role, myMembership: mine };
    },
    create: async ({ name, memberIds, photoUri }) => {
      const gid = await this.rpc<string>('create_group', { group_name: name, member_ids: memberIds, photo: null });
      if (photoUri) {
        try {
          const url = await this.uploadImage('group-photos', gid, photoUri);
          await this.sb.from('groups').update({ photo_url: url }).eq('id', gid);
        } catch {
          /* group still created; photo can be retried from group info */
        }
      }
      return this.groups.get(gid);
    },
    update: async (id, patch) => {
      const body: Row = {};
      if (patch.name !== undefined) body.name = patch.name.trim();
      if (patch.aiAutoSuggest !== undefined) body.ai_auto_suggest = patch.aiAutoSuggest;
      if (patch.photoUri !== undefined) body.photo_url = patch.photoUri ? await this.uploadImage('group-photos', id, patch.photoUri) : null;
      const rows = must(await this.sb.from('groups').update(body).eq('id', id).select('id'));
      if (!rows.length) throw new BackendError('Only group admins can change group settings.', 'forbidden');
    },
    addMembers: async (id, userIds) => { await this.rpc('add_group_members', { gid: id, member_ids: userIds }); },
    removeMember: async (id, userId) => { await this.rpc('remove_group_member', { gid: id, uid: userId }); },
    leave: async (id) => { await this.rpc('leave_group', { gid: id }); },
    setMuted: async (id, muted) => { must(await this.sb.from('group_members').update({ muted }).eq('group_id', id).eq('user_id', await this.uid())); },
    setAiSharePrefs: async (id, value) => { must(await this.sb.from('group_members').update({ ai_share_prefs: value }).eq('group_id', id).eq('user_id', await this.uid())); },
    markRead: async (id) => { await this.sb.from('group_members').update({ last_read_at: new Date().toISOString() }).eq('group_id', id).eq('user_id', await this.uid()); },
  };

  // ---------------------------------------------------------------- messages
  messages: Backend['messages'] = {
    list: async (groupId, opts) => {
      let q = this.sb.from('messages').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(opts?.limit ?? 50);
      if (opts?.before) q = q.lt('created_at', opts.before);
      const rows = must(await q);
      const blocked = await this.myBlocks();
      return rows.map(toMessage).filter((m: ReturnType<typeof toMessage>) => !(m.senderId && blocked.has(m.senderId))).reverse();
    },
    send: async (groupId, { body, clientId, kind = 'text', payload = null }) => {
      const me = await this.uid();
      const { data, error } = await this.sb.from('messages').insert({ group_id: groupId, sender_id: me, body: body.trim(), kind, payload, client_id: clientId }).select('*').single();
      if (error?.code === '23505') {
        // Retried send that already landed — return the stored copy (idempotent).
        return toMessage(must(await this.sb.from('messages').select('*').eq('sender_id', me).eq('client_id', clientId).single()));
      }
      if (error) {
        if (error.code === '42501') throw new BackendError('You’re not a member of this group anymore.', 'forbidden');
        fail(error);
      }
      return toMessage(data);
    },
  };

  // ---------------------------------------------------------------- polls
  polls: Backend['polls'] = {
    get: async (id) => toPoll(await this.rpc('get_poll', { pid: id })),
    listForGroup: async (groupId) => {
      const rows = must(await this.sb.from('polls').select('id').eq('group_id', groupId).order('created_at', { ascending: false }).limit(20));
      return Promise.all(rows.map((r: Row) => this.polls.get(r.id)));
    },
    create: async (groupId, input) => {
      const pid = await this.rpc<string>('create_poll', {
        gid: groupId, question: input.question, allow_multiple: input.allowMultiple,
        options: input.options.map((o) => ({ label: o.label, description: o.description ?? null, recommendation: o.recommendation ?? null })),
      });
      return this.polls.get(pid);
    },
    vote: async (pollId, optionIds) => { await this.rpc('cast_vote', { pid: pollId, option_ids: optionIds }); },
    close: async (pollId, winnerOptionId) => {
      await this.rpc('close_poll', { pid: pollId, winner: winnerOptionId });
      return this.polls.get(pollId);
    },
  };

  // ---------------------------------------------------------------- plans
  plans: Backend['plans'] = {
    list: async () => must(await this.sb.from('plans').select(PLAN_SELECT).order('starts_at', { ascending: true, nullsFirst: false }).limit(200)).map(toPlan),
    get: async (id) => {
      const row = must(await this.sb.from('plans').select(PLAN_SELECT).eq('id', id).maybeSingle());
      if (!row) throw new BackendError('Plan not found.', 'not_found');
      return toPlan(row);
    },
    create: async (input) => {
      const id = await this.rpc<string>('create_plan', {
        input: {
          groupId: input.groupId, title: input.title, description: input.description ?? null, activity: input.activity ?? null, place: input.place ?? null,
          startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, timezone: input.timezone, locationText: input.locationText ?? input.place?.locationText ?? null,
          budgetText: input.budgetText ?? null, status: input.status ?? 'planning', sourcePollId: input.sourcePollId ?? null, participantIds: input.participantIds,
        },
      });
      return this.plans.get(id);
    },
    createFromPoll: async (pollId, extra) => this.plans.get(await this.rpc<string>('create_plan_from_poll', { pid: pollId, tz: extra.timezone, plan_title: extra.title ?? null })),
    update: async (id, patch) => {
      const body: Row = {};
      const map: Record<string, string> = { title: 'title', description: 'description', activity: 'activity', place: 'place', startsAt: 'starts_at', endsAt: 'ends_at', timezone: 'timezone', locationText: 'location_text', budgetText: 'budget_text', status: 'status' };
      for (const [k, v] of Object.entries(patch)) if (map[k]) body[map[k]] = v;
      const { data, error } = await this.sb.from('plans').update(body).eq('id', id).select('id');
      if (error) {
        if (error.code === '23514') throw new BackendError(/check1|starts_at/.test(error.message) ? 'Pick a time before confirming the plan.' : 'End time must be after start time.', 'validation');
        fail(error);
      }
      if (!data?.length) throw new BackendError('Only the organizer can edit this plan.', 'forbidden');
      return this.plans.get(id);
    },
    setRsvp: async (planId, rsvp) => { await this.rpc('set_rsvp', { pid: planId, value: rsvp }); },
    invite: async (planId, userIds) => { await this.rpc('invite_to_plan', { pid: planId, user_ids: userIds }); },
    shareToGroup: async (planId, groupId) => { await this.rpc('share_plan_to_group', { pid: planId, gid: groupId }); },
  };

  // ---------------------------------------------------------------- availability
  availability: Backend['availability'] = {
    list: async (planId) => must(await this.sb.from('availability_slots').select('*').eq('plan_id', planId)).map(toSlot),
    setMine: async (planId, ranges) => { await this.rpc('set_availability', { pid: planId, ranges }); },
  };

  // ---------------------------------------------------------------- notifications
  notifications: Backend['notifications'] = {
    list: async () => must(await this.sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)).map(toNotification),
    markRead: async (ids) => { await this.rpc('mark_notifications_read', { ids: ids === 'all' ? null : ids }); },
  };

  // ---------------------------------------------------------------- saved
  saved: Backend['saved'] = {
    list: async () =>
      must(await this.sb.from('saved_places').select('*').order('created_at', { ascending: false })).map((r: Row) => ({
        id: r.id, collection: r.collection, recommendation: r.recommendation as Recommendation, note: r.note, createdAt: r.created_at,
      })),
    save: async (rec, collection = 'Saved') => {
      const me = await this.uid();
      const placeKey = rec.placeId ?? rec.id;
      const { error } = await this.sb.from('saved_places').upsert({ user_id: me, collection, recommendation: rec, place_key: placeKey }, { onConflict: 'user_id,place_key', ignoreDuplicates: true });
      if (error) fail(error);
      const r = must(await this.sb.from('saved_places').select('*').eq('user_id', me).eq('place_key', placeKey).single());
      return { id: r.id, collection: r.collection, recommendation: r.recommendation, note: r.note, createdAt: r.created_at };
    },
    remove: async (id) => { must(await this.sb.from('saved_places').delete().eq('id', id)); },
    move: async (id, collection) => { must(await this.sb.from('saved_places').update({ collection }).eq('id', id)); },
  };

  // ---------------------------------------------------------------- AI (Edge Function: ai-plan)
  ai: Backend['ai'] = {
    planForGroup: async (groupId, { prompt, trigger }) => {
      const r = await this.invoke<{ message: Row | null }>('ai-plan', { mode: 'group', groupId, prompt: prompt ?? null, trigger });
      return r.message ? toMessage(r.message) : null;
    },
    conversations: async () =>
      must(await this.sb.from('ai_conversations').select('*').order('updated_at', { ascending: false })).map((r: Row) => ({ id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at })),
    messages: async (conversationId) =>
      must(await this.sb.from('ai_messages').select('*').eq('conversation_id', conversationId).order('created_at')).map((r: Row) => ({
        id: r.id, conversationId: r.conversation_id, role: r.role, content: r.content, response: r.response ?? null, createdAt: r.created_at,
      })),
    sendPrivate: async (conversationId, text) => this.invoke('ai-plan', { mode: 'private', conversationId, prompt: text }),
    deleteConversation: async (id) => { must(await this.sb.from('ai_conversations').delete().eq('id', id)); },
    deleteAllPrivate: async () => { must(await this.sb.from('ai_conversations').delete().eq('user_id', await this.uid())); },
    usage: async () => {
      const since = new Date(Date.now() - 86400_000).toISOString();
      const [{ count }, sub] = await Promise.all([
        this.sb.from('ai_usage_events').select('id', { count: 'exact', head: true }).gte('created_at', since),
        this.subscription.get(),
      ]);
      return { usedToday: count ?? 0, dailyLimit: DEFAULT_RATE_LIMITS.dailyLimit[sub.tier], tier: sub.tier };
    },
  };

  // ---------------------------------------------------------------- places (Edge Function: places)
  private placesStatusCache: 'live' | 'unavailable' | null = null;
  places: Backend['places'] = {
    status: async () => {
      if (this.placesStatusCache) return this.placesStatusCache;
      try {
        const r = await this.invoke<{ live: boolean }>('places', { action: 'status' });
        this.placesStatusCache = r.live ? 'live' : 'unavailable';
      } catch {
        this.placesStatusCache = 'unavailable';
      }
      return this.placesStatusCache;
    },
    search: async (q) => {
      if ((await this.places.status()) !== 'live') return []; // never substitute fake data for real results
      if (!q.area && !q.coords && !q.query) return [];
      const r = await this.invoke<{ results: Recommendation[] }>('places', { action: 'search', ...q });
      return r.results;
    },
  };

  // ---------------------------------------------------------------- subscription
  subscription: Backend['subscription'] = {
    get: async () => {
      const r = must(await this.sb.from('subscription_status').select('*').eq('user_id', await this.uid()).maybeSingle());
      return { tier: r?.tier ?? 'free', status: r?.status ?? 'none', currentPeriodEnd: r?.current_period_end ?? null };
    },
    joinWaitlist: async () => { await this.rpc('join_premium_waitlist'); },
  };

  // ---------------------------------------------------------------- realtime
  private channels = new Map<string, { channel: RealtimeChannel; listeners: Set<(e: RealtimeEvent) => void> }>();

  private emitConnection() {
    const states = Array.from(this.channelStates.values());
    const status: 'connected' | 'reconnecting' | 'offline' = states.length === 0 || states.every((s) => s === 'SUBSCRIBED') ? 'connected' : states.some((s) => s === 'CLOSED') ? 'offline' : 'reconnecting';
    this.connectionListeners.forEach((cb) => cb({ type: 'connection', status }));
  }

  private realtimeTeardown() {
    for (const [, c] of this.channels) this.sb.removeChannel(c.channel);
    this.channels.clear();
    this.channelStates.clear();
  }

  private buildChannel(topic: string, emit: (e: RealtimeEvent) => void): RealtimeChannel | null {
    const ch = this.sb.channel(`gather:${topic}:${Math.random().toString(36).slice(2, 8)}`);
    const uid = this.userId;
    if (topic === 'user' && uid) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => emit({ type: 'notifications' }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `user_id=eq.${uid}` }, () => emit({ type: 'groups' }))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => emit({ type: 'groups' }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `receiver_id=eq.${uid}` }, () => emit({ type: 'friends' }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `sender_id=eq.${uid}` }, () => emit({ type: 'friends' }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => emit({ type: 'friends' }));
    } else if (topic.startsWith('group:')) {
      const gid = topic.slice(6);
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${gid}` }, (p) => emit({ type: 'message', groupId: gid, message: toMessage(p.new as Row) }))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `group_id=eq.${gid}` }, (p) => emit({ type: 'message_deleted', groupId: gid, id: (p.old as Row).id }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'polls', filter: `group_id=eq.${gid}` }, (p) => emit({ type: 'poll', groupId: gid, pollId: ((p.new as Row)?.id ?? (p.old as Row)?.id) as string }));
    } else if (topic.startsWith('plan:')) {
      const pid = topic.slice(5);
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'plans', filter: `id=eq.${pid}` }, () => emit({ type: 'plan', planId: pid }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_participants', filter: `plan_id=eq.${pid}` }, () => emit({ type: 'plan', planId: pid }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'availability_slots', filter: `plan_id=eq.${pid}` }, () => emit({ type: 'availability', planId: pid }));
    } else {
      return null;
    }
    ch.subscribe((status) => {
      this.channelStates.set(topic, status);
      this.emitConnection();
    });
    return ch;
  }

  realtime: Backend['realtime'] = {
    subscribe: (topic, cb): Unsubscribe => {
      if (topic === 'connection') {
        this.connectionListeners.add(cb);
        this.emitConnection();
        return () => this.connectionListeners.delete(cb);
      }
      let entry = this.channels.get(topic);
      if (!entry) {
        const listeners = new Set<(e: RealtimeEvent) => void>();
        const channel = this.buildChannel(topic, (e) => listeners.forEach((l) => l(e)));
        if (!channel) return () => {};
        entry = { channel, listeners };
        this.channels.set(topic, entry);
      }
      entry.listeners.add(cb);
      return () => {
        const e = this.channels.get(topic);
        if (!e) return;
        e.listeners.delete(cb);
        if (e.listeners.size === 0) {
          this.sb.removeChannel(e.channel);
          this.channels.delete(topic);
          this.channelStates.delete(topic);
          this.emitConnection();
        }
      };
    },
  };
}
