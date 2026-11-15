// Gather AI planner — group suggestions and the private assistant.
//
// POST { mode: 'group', groupId, prompt?, trigger: 'button'|'mention'|'auto' } → { message }
// POST { mode: 'private', conversationId?, prompt }                        → { conversationId, messages }
//
// Secrets (ANTHROPIC_API_KEY, GOOGLE_MAPS_API_KEY) stay server-side.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mergeModelOutput, ModelOutputSchema, type ModelOutput, type PlaceResult, type PlanResponse } from '../_shared/recommendation.ts';
import { DEFAULT_PRIVACY, EMPTY_PREFERENCES, describeSummary, filterPreferences, summarizeGroupPreferences, type Preferences, type PrivacySettings } from '../_shared/preferences.ts';
import { checkRateLimit, moderateText, redactPII, shouldAutoSuggest, type Tier } from '../_shared/safety.ts';
import { authenticate, env, HttpError, json, serve } from '../_server/http.ts';
import { searchPlaces } from '../_server/googlePlaces.ts';
import { buildGroupRequest, buildPrivateRequest, SEARCH_TOOL, SYSTEM_PROMPT, type ChatLine } from './prompt.ts';

const MODEL = Deno.env.get('GATHER_AI_MODEL') || 'claude-opus-5-5';
const EFFORT = (Deno.env.get('GATHER_AI_EFFORT') || 'medium') as 'low' | 'medium' | 'high';
const LIMITS = {
  dailyLimit: { free: Number(Deno.env.get('AI_DAILY_LIMIT_FREE') || 15), premium: Number(Deno.env.get('AI_DAILY_LIMIT_PREMIUM') || 150) },
  burstPerMinute: 5,
};

const RequestSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('group'), groupId: z.string().uuid(), prompt: z.string().max(500).nullable().optional(), trigger: z.enum(['button', 'mention', 'auto']) }),
  z.object({ mode: z.literal('private'), conversationId: z.string().uuid().nullable().optional(), prompt: z.string().min(1).max(1000) }),
]);

// deno-lint-ignore no-explicit-any -- PostgREST rows are untyped until DB types are generated
type Row = Record<string, any>;

// ---------------------------------------------------------------- helpers
function toPrefs(r: Row | undefined): Preferences {
  if (!r) return EMPTY_PREFERENCES;
  return {
    cuisines: r.cuisines ?? [], dietary: r.dietary ?? [], restaurantStyles: r.restaurant_styles ?? [], activities: r.activities ?? [],
    customInterests: r.custom_interests ?? [], budget: r.budget ?? null, maxDistanceKm: r.max_distance_km ?? null,
    favoriteActivities: r.favorite_activities ?? [], dislikedActivities: r.disliked_activities ?? [], preferredTimes: r.preferred_times ?? [], accessibility: r.accessibility ?? [],
  };
}

function toPrivacy(r: Row | undefined): PrivacySettings {
  if (!r) return { ...DEFAULT_PRIVACY, aiShare: { food: false, activities: false, budget: false, distance: false, times: false, dislikes: false, accessibility: false } };
  return {
    aiShare: { ...DEFAULT_PRIVACY.aiShare, ...(r.ai_share ?? {}) }, friendsShare: { ...DEFAULT_PRIVACY.friendsShare, ...(r.friends_share ?? {}) },
    showVoteIdentity: r.show_vote_identity, discoverable: r.discoverable, allowFriendRequests: r.allow_friend_requests, storePrivateAiHistory: r.store_private_ai_history,
  };
}

async function enforceRateLimit(admin: SupabaseClient, userId: string, kind: 'group' | 'private' | 'auto') {
  const since = new Date(Date.now() - 86400_000).toISOString();
  const [{ data: events }, { data: sub }] = await Promise.all([
    admin.from('ai_usage_events').select('created_at').eq('user_id', userId).gte('created_at', since),
    admin.from('subscription_status').select('tier, status').eq('user_id', userId).maybeSingle(),
  ]);
  const tier: Tier = sub?.tier === 'premium' && sub?.status === 'active' ? 'premium' : 'free';
  const decision = checkRateLimit((events ?? []).map((e: Row) => new Date(e.created_at).getTime()), tier, Date.now(), LIMITS);
  if (!decision.allowed) throw new HttpError(429, decision.userMessage, 'rate_limited');
  await admin.from('ai_usage_events').insert({ user_id: userId, kind });
}

/** Run Claude with the place-search tool and a structured final answer. */
async function runPlanner(requestText: string, opts: { area: string | null; coords?: null }): Promise<{ output: ModelOutput; places: Map<string, PlaceResult>; liveData: boolean }> {
  const anthropic = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), maxRetries: 2, timeout: 60_000 });
  const mapsKey = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';
  const known = new Map<string, PlaceResult>();
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content: requestText }];

  for (let turn = 0; turn < 5; turn++) {
    let response: Anthropic.Beta.Messages.BetaMessage;
    try {
      response = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT_CACHED,
        tools: mapsKey ? [SEARCH_TOOL] : [],
        messages,
        output_config: { effort: EFFORT, format: zodOutputFormat(ModelOutputSchema) },
        // Server-side refusal fallback: routes a declined request to an appropriate model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'Gather AI is busy right now — try again in a minute.', 'rate_limited');
      if (e instanceof Anthropic.AuthenticationError) throw new HttpError(503, 'Gather AI isn’t configured correctly on the server.', 'not_configured');
      if (e instanceof Anthropic.APIConnectionError) throw new HttpError(503, 'Couldn’t reach Gather AI. Try again shortly.', 'unknown');
      if (e instanceof Anthropic.APIError) throw new HttpError(502, 'Gather AI had a problem answering. Try again.', 'unknown');
      throw e;
    }

    if (response.stop_reason === 'refusal') {
      return {
        output: { kind: 'message', message: 'I can’t help with that one — but I’m happy to find something fun and safe for the group.', constraints: emptyConstraints(), recommendations: [], clarifyingQuestions: [] },
        places: known,
        liveData: !!mapsKey,
      };
    }
    messages.push({ role: 'assistant', content: response.content });
    if (response.stop_reason === 'pause_turn') continue;
    if (response.stop_reason === 'tool_use') {
      const calls = response.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use');
      const results = await Promise.all(
        calls.map(async (c): Promise<Anthropic.Beta.Messages.BetaToolResultBlockParam> => {
          const input = c.input as { query?: unknown; area?: unknown; max_price_level?: unknown };
          const query = typeof input.query === 'string' ? input.query.slice(0, 120) : '';
          const area = typeof input.area === 'string' && input.area ? input.area.slice(0, 120) : opts.area;
          if (!query || !area) return { type: 'tool_result', tool_use_id: c.id, is_error: true, content: 'No area known. Ask the group where to look.' };
          try {
            const found = await searchPlaces(mapsKey, { query, area, maxPriceLevel: typeof input.max_price_level === 'number' ? input.max_price_level : null, limit: 6 });
            found.forEach((p) => known.set(p.placeId, p));
            const compact = found.map((p) => ({ placeId: p.placeId, name: p.name, category: p.category, priceLevel: p.priceLevel, rating: p.rating, area: p.area, summary: p.description }));
            return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(compact) };
          } catch {
            return { type: 'tool_result', tool_use_id: c.id, is_error: true, content: 'Place search failed. Give general ideas instead and say live info is unavailable.' };
          }
        }),
      );
      messages.push({ role: 'user', content: results });
      continue;
    }
    if (response.stop_reason === 'max_tokens') throw new HttpError(502, 'Gather AI ran out of room answering. Try a shorter request.', 'unknown');

    const text = response.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new HttpError(502, 'Gather AI returned an unexpected answer. Try again.', 'unknown');
    }
    const result = ModelOutputSchema.safeParse(parsed);
    if (!result.success) throw new HttpError(502, 'Gather AI returned an unexpected answer. Try again.', 'unknown');
    return { output: result.data, places: known, liveData: !!mapsKey };
  }
  throw new HttpError(502, 'Gather AI took too many steps. Try a more specific request.', 'unknown');
}

// Stable system prompt with a cache breakpoint (tools + system are identical across requests).
const SYSTEM_PROMPT_CACHED: Anthropic.Beta.Messages.BetaTextBlockParam[] = [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }];

function emptyConstraints(): ModelOutput['constraints'] {
  return { budgetMaxPerPerson: null, timeWindow: null, area: null, groupSize: null, interests: [], avoid: [], nearbyOnly: false };
}

function finalize(run: Awaited<ReturnType<typeof runPlanner>>): PlanResponse {
  const { response, droppedUnknownPlaces } = mergeModelOutput(run.output, run.places, { makeId: () => crypto.randomUUID(), liveDataAvailable: run.liveData, generatedBy: 'gather_ai' });
  if (droppedUnknownPlaces) console.warn(`[gather] dropped ${droppedUnknownPlaces} recommendation(s) with unknown placeIds`);
  return response;
}

// ---------------------------------------------------------------- group mode
async function handleGroup(req: { groupId: string; prompt?: string | null; trigger: 'button' | 'mention' | 'auto' }, ctx: Awaited<ReturnType<typeof authenticate>>) {
  const { user, userClient, admin } = ctx;
  // RLS: this only succeeds if the caller is a member of the group.
  const { data: group } = await userClient.from('groups').select('id, name, ai_auto_suggest').eq('id', req.groupId).maybeSingle();
  if (!group) throw new HttpError(403, 'You’re not a member of this group.', 'forbidden');

  if (req.prompt) {
    const m = moderateText(req.prompt);
    if (!m.allowed) throw new HttpError(400, m.userMessage, 'moderation');
  }

  const { data: recent } = await userClient
    .from('messages').select('sender_id, kind, body, created_at').eq('group_id', req.groupId)
    .gte('created_at', new Date(Date.now() - 48 * 3600_000).toISOString())
    .order('created_at', { ascending: false }).limit(40);
  const rows = (recent ?? []).reverse();

  if (req.trigger === 'auto') {
    const human = rows.filter((r: Row) => r.kind === 'text' && r.sender_id);
    const lastAi = [...rows].reverse().find((r: Row) => r.kind === 'ai');
    const ok = shouldAutoSuggest({
      groupOptedIn: !!group.ai_auto_suggest, lastAutoSuggestAt: null,
      lastAiMessageAt: lastAi ? new Date(lastAi.created_at).getTime() : null,
      recent: human.map((r: Row) => ({ authorId: r.sender_id, text: r.body, at: new Date(r.created_at).getTime() })), now: Date.now(),
    });
    if (!ok) return json({ message: null });
    // Atomically claim the 2-hour cooldown so concurrent clients can't double-post.
    const { data: claimed } = await admin.from('groups').update({ ai_last_auto_at: new Date().toISOString() })
      .eq('id', req.groupId).eq('ai_auto_suggest', true)
      .or(`ai_last_auto_at.is.null,ai_last_auto_at.lt.${new Date(Date.now() - 2 * 3600_000).toISOString()}`).select('id');
    if (!claimed?.length) return json({ message: null });
  }

  await enforceRateLimit(admin, user.id, req.trigger === 'auto' ? 'auto' : 'group');

  // Members + their AI-shareable preferences (aggregated, never attributed).
  const { data: memberRows } = await admin.from('group_members').select('user_id, ai_share_prefs, profile:profiles(display_name, username, city)').eq('group_id', req.groupId);
  const members = (memberRows ?? []) as Row[];
  const ids = (members ?? []).map((m: Row) => m.user_id);
  const [{ data: prefs }, { data: privacy }] = await Promise.all([
    admin.from('user_preferences').select('*').in('user_id', ids),
    admin.from('privacy_settings').select('*').in('user_id', ids),
  ]);
  const summary = summarizeGroupPreferences((members ?? []).map((m: Row) => ({
    groupOptIn: m.ai_share_prefs,
    prefs: toPrefs(prefs?.find((p: Row) => p.user_id === m.user_id)),
    privacy: toPrivacy(privacy?.find((p: Row) => p.user_id === m.user_id)),
  })));
  const names = new Map((members ?? []).map((m: Row) => [m.user_id, (m.profile?.display_name || m.profile?.username || 'Someone').split(' ')[0]]));
  const lines: ChatLine[] = rows
    .filter((r: Row) => r.kind === 'text' && r.sender_id)
    .slice(-30)
    .map((r: Row) => ({ name: names.get(r.sender_id) ?? 'Someone', text: redactPII(String(r.body)).replace(/@gather/gi, '').slice(0, 400), at: new Date(r.created_at).toISOString().slice(0, 16) }));
  const requester = (members ?? []).find((m: Row) => m.user_id === user.id);
  const defaultArea = (requester?.profile?.city as string | undefined) ?? null;

  const run = await runPlanner(
    buildGroupRequest({
      groupName: group.name, memberCount: ids.length, lines, preferenceSummary: describeSummary(summary),
      prompt: req.prompt ? redactPII(req.prompt) : null, defaultArea, placesAvailable: !!Deno.env.get('GOOGLE_MAPS_API_KEY'),
      now: new Date().toISOString(), timezone: 'UTC',
    }),
    { area: defaultArea },
  );
  const response = finalize(run);

  const { data: message, error } = await admin.from('messages').insert({
    group_id: req.groupId, sender_id: null, kind: 'ai', body: response.message,
    payload: { type: 'ai', response, requestedBy: req.trigger === 'auto' ? null : user.id, trigger: req.trigger },
  }).select('*').single();
  if (error) throw new HttpError(500, 'Couldn’t post Gather’s reply.', 'unknown');
  if (response.recommendations.length) {
    await admin.from('recommendations').insert(response.recommendations.map((r) => ({ requested_by: user.id, group_id: req.groupId, data: r, source: r.source })));
  }
  return json({ message });
}

// ---------------------------------------------------------------- private mode
async function handlePrivate(req: { conversationId?: string | null; prompt: string }, ctx: Awaited<ReturnType<typeof authenticate>>) {
  const { user, userClient, admin } = ctx;
  const prompt = req.prompt.trim();
  let conversationId = req.conversationId ?? null;
  if (conversationId) {
    const { data } = await userClient.from('ai_conversations').select('id').eq('id', conversationId).maybeSingle();
    if (!data) conversationId = null;
  }
  if (!conversationId) {
    const { data, error } = await userClient.from('ai_conversations').insert({ user_id: user.id, title: prompt.slice(0, 60) }).select('id').single();
    if (error) throw new HttpError(500, 'Couldn’t start a conversation.', 'unknown');
    conversationId = data.id as string;
  }
  const { data: history } = await userClient.from('ai_messages').select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(8);
  const { data: userMsg } = await userClient.from('ai_messages').insert({ conversation_id: conversationId, user_id: user.id, role: 'user', content: prompt }).select('*').single();

  const moderation = moderateText(prompt);
  let content: string;
  let response: PlanResponse | null = null;
  if (!moderation.allowed) {
    content = moderation.userMessage;
  } else {
    await enforceRateLimit(admin, user.id, 'private');
    const [{ data: p }, { data: s }, { data: profile }] = await Promise.all([
      userClient.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle(),
      userClient.from('privacy_settings').select('*').eq('user_id', user.id).maybeSingle(),
      userClient.from('profiles').select('city').eq('id', user.id).maybeSingle(),
    ]);
    const shared = filterPreferences(toPrefs(p ?? undefined), toPrivacy(s ?? undefined), 'ai');
    const prefText = Object.entries(shared).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n');
    const run = await runPlanner(
      buildPrivateRequest({
        history: (history ?? []).reverse().map((h: Row) => ({ role: h.role, content: redactPII(String(h.content)).slice(0, 600) })),
        prompt: redactPII(prompt), preferences: prefText, defaultArea: profile?.city ?? null,
        placesAvailable: !!Deno.env.get('GOOGLE_MAPS_API_KEY'), now: new Date().toISOString(), timezone: 'UTC',
      }),
      { area: profile?.city ?? null },
    );
    response = finalize(run);
    content = response.message;
  }
  const { data: reply } = await userClient.from('ai_messages').insert({ conversation_id: conversationId, user_id: user.id, role: 'assistant', content, response }).select('*').single();
  await userClient.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);

  const toMsg = (r: Row) => ({ id: r.id, conversationId: r.conversation_id, role: r.role, content: r.content, response: r.response ?? null, createdAt: r.created_at });
  const messages = [userMsg, reply].filter(Boolean).map((r) => toMsg(r as Row));

  // History off → don't retain the conversation server-side.
  const { data: privacyRow } = await userClient.from('privacy_settings').select('store_private_ai_history').eq('user_id', user.id).maybeSingle();
  if (privacyRow && privacyRow.store_private_ai_history === false) await userClient.from('ai_conversations').delete().eq('id', conversationId);

  return json({ conversationId, messages });
}

serve(async (req) => {
  const ctx = await authenticate(req);
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, 'Invalid request.', 'validation');
  return parsed.data.mode === 'group' ? handleGroup(parsed.data, ctx) : handlePrivate(parsed.data, ctx);
});
