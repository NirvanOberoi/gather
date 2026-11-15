# Gather architecture

## Layers

```
Screens (src/app)  ──►  hooks (React Query + realtime)  ──►  Backend contract (src/services/backend/types.ts)
                                                                  │
                                       ┌──────────────────────────┴──────────────────────────┐
                                       ▼                                                     ▼
                         LiveBackend (src/services/supabase)                  DemoBackend (src/services/demo)
                         supabase-js → Postgres (RLS + RPCs),                 on-device sample world, same
                         Realtime, Storage, Edge Functions                    permission rules, simulated friends
                                       │
                         Edge Functions (Deno): ai-plan → Claude + Google Places; places; delete-account
```

- **Domain logic is pure** (`src/domain`, `supabase/functions/_shared`) and unit-tested: availability overlap, voting, permissions, time zones, constraint extraction, ranking, privacy filtering, moderation, rate limits, schema validation.
- **`_shared` runs in both runtimes.** The app imports it as `@shared/...`; the Edge Functions import it relatively. It depends only on `zod`.
- **Screens never import Supabase.** Swapping or extending the backend means implementing the `Backend` interface.

## Data model (Postgres)

`profiles` (1:1 with `auth.users`) · `user_preferences` · `privacy_settings` · `notification_settings` · `friend_requests` · `friendships` (ordered pair) · `blocks` · `groups` · `group_members` (role, mute, per-group AI sharing, read marker) · `messages` (kind: text/ai/system/poll/plan/share, JSON payload, client id for idempotent retries) · `ai_conversations` · `ai_messages` · `recommendations` · `ai_usage_events` · `saved_places` · `polls` · `poll_options` · `poll_votes` · `plans` · `plan_participants` · `availability_slots` (absolute UTC instants) · `notifications` · `subscription_status`.

All timestamps are `timestamptz`. Availability is stored as absolute instants; a plan's IANA time zone is used only to interpret input and display output, which makes midnight-spanning ranges and DST transitions exact.

## Authorization

- RLS is enabled on every table; anonymous users get nothing.
- Simple ownership (preferences, saved places, private AI chats, notifications) uses direct RLS.
- Multi-party actions use `SECURITY DEFINER` RPCs that re-check membership/friendship/blocks atomically: `send_friend_request`, `respond_friend_request`, `create_group`, `add_group_members`, `remove_group_member`, `leave_group`, `create_poll`, `cast_vote`, `close_poll`, `get_poll`, `create_plan`, `create_plan_from_poll`, `set_rsvp`, `invite_to_plan`, `set_availability`, `search_profiles`, `get_visible_preferences`, `get_group_summaries`.
- Column-level `GRANT UPDATE` limits which columns clients can change (e.g. members can mute but not change their role).
- AI, system, poll and plan messages can only be written by the server.
- Tested by `npm run test:db` (69 assertions on real PostgreSQL).

## Realtime

Postgres Changes (RLS-filtered) on `messages`, `polls` (a `vote_version` bump on each vote), `group_members`, `notifications`, `plans`, `plan_participants`, `availability_slots`, `friend_requests`, `friendships`. The client maps them to cache invalidations or direct message merges (`useChat`). Optimistic sends carry a client UUID; the unique `(sender_id, client_id)` index makes retries idempotent. Connection loss shows a banner and triggers a gap-filling refetch on reconnect.

## AI pipeline

See README → *Enabling Gather AI*. Key invariants:

1. The model never supplies URLs, photos, ratings or prices for businesses; the server merges those from provider results.
2. Unknown `placeId`s are dropped; generic ideas are labelled `ai_idea`.
3. Every response is validated with `PlanResponseSchema` before it's stored or shown.
4. Preferences reach the model only as an unattributed group summary of AI-shareable categories.
5. Automatic suggestions require group opt-in and are limited server-side to once per 2 hours.

## Adding a feature

1. Add pure logic + tests in `src/domain` (or `_shared` if the server needs it).
2. Extend `Backend` in `services/backend/types.ts`, implement it in `DemoBackend` and `LiveBackend`.
3. Add tables/RPCs + RLS in a new migration and assertions in `supabase/tests/01_rls.test.sql`.
4. Add a query hook in `src/hooks/data.ts` and the screen in `src/app`.
