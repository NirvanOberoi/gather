-- =============================================================================
-- Gather — Row Level Security
-- Principle: deny by default. Direct table writes are only allowed where a simple
-- ownership rule suffices; everything else goes through SECURITY DEFINER functions
-- (next migration) that check membership / friendship / blocks atomically.
-- =============================================================================

-- ---------------------------------------------------------------- helper predicates
-- SECURITY DEFINER so policies can consult membership without recursive RLS evaluation.
create or replace function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid());
$$;

create or replace function public.group_role(gid uuid, uid uuid default auth.uid()) returns text
language sql stable security definer set search_path = public as $$
  select role from group_members where group_id = gid and user_id = uid;
$$;

create or replace function public.is_group_admin(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.group_role(gid) in ('owner', 'admin'), false);
$$;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where user_a = least(a, b) and user_b = greatest(a, b));
$$;

create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create or replace function public.is_plan_participant(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from plan_participants where plan_id = pid and user_id = auth.uid());
$$;

create or replace function public.can_view_plan(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_plan_participant(pid)
      or exists (select 1 from plans p where p.id = pid and p.group_id is not null and public.is_group_member(p.group_id));
$$;

create or replace function public.can_edit_plan(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from plans p
    where p.id = pid
      and (p.created_by = auth.uid() or (p.group_id is not null and public.is_group_admin(p.group_id)))
  );
$$;

-- Lock helper functions down (they're called by policies/RPCs only).
revoke all on function public.group_role(uuid, uuid) from public;
grant execute on function public.group_role(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- enable RLS everywhere
alter table public.profiles              enable row level security;
alter table public.user_preferences      enable row level security;
alter table public.privacy_settings      enable row level security;
alter table public.notification_settings enable row level security;
alter table public.friend_requests       enable row level security;
alter table public.friendships           enable row level security;
alter table public.blocks                enable row level security;
alter table public.groups                enable row level security;
alter table public.group_members         enable row level security;
alter table public.messages              enable row level security;
alter table public.ai_conversations      enable row level security;
alter table public.ai_messages           enable row level security;
alter table public.recommendations       enable row level security;
alter table public.ai_usage_events       enable row level security;
alter table public.saved_places          enable row level security;
alter table public.polls                 enable row level security;
alter table public.poll_options          enable row level security;
alter table public.poll_votes            enable row level security;
alter table public.plans                 enable row level security;
alter table public.plan_participants     enable row level security;
alter table public.availability_slots    enable row level security;
alter table public.notifications         enable row level security;
alter table public.subscription_status   enable row level security;

-- Anonymous users get nothing.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------- profiles
-- Public profile card (name/username/avatar/bio) is visible to signed-in users, except
-- to people this user has blocked.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or not exists (select 1 from blocks b where b.blocker_id = profiles.id and b.blocked_id = auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url, bio, city, onboarded_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------- private settings: owner only
create policy prefs_own on public.user_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy privacy_own on public.privacy_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_settings_own on public.notification_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- social graph
create policy friend_requests_select on public.friend_requests for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());
-- writes via send/respond/cancel_friend_request()

create policy friendships_select on public.friendships for select to authenticated
  using (auth.uid() in (user_a, user_b));
create policy friendships_delete on public.friendships for delete to authenticated
  using (auth.uid() in (user_a, user_b));

create policy blocks_select on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks for insert to authenticated with check (blocker_id = auth.uid() and blocked_id <> auth.uid());
create policy blocks_delete on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- ---------------------------------------------------------------- groups
create policy groups_select on public.groups for select to authenticated using (public.is_group_member(id));
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));
revoke update on public.groups from authenticated;
grant update (name, photo_url, ai_auto_suggest) on public.groups to authenticated;

create policy group_members_select on public.group_members for select to authenticated using (public.is_group_member(group_id));
-- Members may only change their own personal settings for a group.
create policy group_members_update_self on public.group_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.group_members from authenticated;
grant update (muted, ai_share_prefs, last_read_at) on public.group_members to authenticated;

-- ---------------------------------------------------------------- messages
create policy messages_select on public.messages for select to authenticated using (public.is_group_member(group_id));
-- Users can only post as themselves, only into groups they belong to, and only plain
-- text or shared-card messages. AI/system/poll/plan messages are server-generated.
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_group_member(group_id)
    and kind in ('text', 'share')
    and (payload is null or (kind = 'share' and payload ->> 'type' = 'share'))
  );

-- ---------------------------------------------------------------- AI (private)
create policy ai_conversations_own on public.ai_conversations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_messages_own on public.ai_messages for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy recommendations_select on public.recommendations for select to authenticated
  using (requested_by = auth.uid() or (group_id is not null and public.is_group_member(group_id)));
create policy ai_usage_select on public.ai_usage_events for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- saved
create policy saved_own on public.saved_places for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- polls
create policy polls_select on public.polls for select to authenticated using (public.is_group_member(group_id));
create policy poll_options_select on public.poll_options for select to authenticated
  using (exists (select 1 from polls p where p.id = poll_id and public.is_group_member(p.group_id)));
-- Only your own ballot is directly readable; tallies (with privacy-respecting voter
-- identities) come from get_poll(). Writes only via cast_vote().
create policy poll_votes_select_own on public.poll_votes for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- plans
create policy plans_select on public.plans for select to authenticated using (public.can_view_plan(id));
create policy plans_update on public.plans for update to authenticated
  using (public.can_edit_plan(id)) with check (public.can_edit_plan(id));
revoke update on public.plans from authenticated;
grant update (title, description, activity, place, starts_at, ends_at, timezone, location_text, budget_text, status) on public.plans to authenticated;

create policy plan_participants_select on public.plan_participants for select to authenticated using (public.can_view_plan(plan_id));
create policy plan_participants_rsvp on public.plan_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.plan_participants from authenticated;
grant update (rsvp) on public.plan_participants to authenticated;

create policy availability_select on public.availability_slots for select to authenticated using (public.can_view_plan(plan_id));
-- writes via set_availability()

-- ---------------------------------------------------------------- notifications & billing
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy subscription_select on public.subscription_status for select to authenticated using (user_id = auth.uid());

-- Clients never insert into these directly (functions / service role only).
revoke insert on public.profiles, public.friend_requests, public.friendships, public.groups, public.group_members,
  public.polls, public.poll_options, public.poll_votes, public.plans, public.plan_participants, public.availability_slots,
  public.notifications, public.subscription_status, public.recommendations, public.ai_usage_events from authenticated;
revoke delete on public.profiles, public.friend_requests, public.groups, public.group_members, public.messages,
  public.polls, public.poll_options, public.poll_votes, public.plans, public.plan_participants, public.availability_slots,
  public.subscription_status, public.recommendations, public.ai_usage_events, public.user_preferences,
  public.privacy_settings, public.notification_settings from authenticated;
revoke update on public.friend_requests, public.friendships, public.messages, public.polls, public.poll_options,
  public.poll_votes, public.availability_slots, public.subscription_status, public.recommendations, public.ai_usage_events from authenticated;
