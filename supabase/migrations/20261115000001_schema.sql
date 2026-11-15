-- =============================================================================
-- Gather — core schema
-- All user-owned data hangs off public.profiles(id) which mirrors auth.users(id),
-- so deleting an auth user cascades through their personal data.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- utilities
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text unique check (username ~ '^[a-z0-9_.]{3,20}$' and username !~ '^[._]|[._]$'),
  display_name  text not null default '' check (char_length(display_name) <= 40),
  avatar_url    text check (char_length(avatar_url) <= 500),
  bio           text check (char_length(bio) <= 160),
  city          text check (char_length(city) <= 60),
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

create table public.user_preferences (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  cuisines            text[] not null default '{}',
  dietary             text[] not null default '{}',
  restaurant_styles   text[] not null default '{}',
  activities          text[] not null default '{}',
  custom_interests    text[] not null default '{}',
  budget              text check (budget in ('free', 'under_15', '15_30', '30_50', '50_plus')),
  max_distance_km     integer check (max_distance_km between 0 and 500),
  favorite_activities text[] not null default '{}',
  disliked_activities text[] not null default '{}',
  preferred_times     text[] not null default '{}',
  accessibility       text[] not null default '{}',
  updated_at          timestamptz not null default now(),
  check (cardinality(cuisines) <= 30 and cardinality(activities) <= 40 and cardinality(custom_interests) <= 20)
);
create trigger user_preferences_updated before update on public.user_preferences for each row execute function public.set_updated_at();

-- Per-category sharing flags. Keys: food, activities, budget, distance, times, dislikes, accessibility
create table public.privacy_settings (
  user_id                  uuid primary key references public.profiles (id) on delete cascade,
  ai_share                 jsonb not null default '{"food":true,"activities":true,"budget":true,"distance":true,"times":true,"dislikes":true,"accessibility":false}',
  friends_share            jsonb not null default '{"food":true,"activities":true,"budget":false,"distance":false,"times":false,"dislikes":false,"accessibility":false}',
  show_vote_identity       boolean not null default true,
  discoverable             boolean not null default true,
  allow_friend_requests    boolean not null default true,
  store_private_ai_history boolean not null default true,
  updated_at               timestamptz not null default now()
);
create trigger privacy_settings_updated before update on public.privacy_settings for each row execute function public.set_updated_at();

create table public.notification_settings (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  friend_requests boolean not null default true,
  group_adds      boolean not null default true,
  messages        boolean not null default true,
  mentions        boolean not null default true,
  polls           boolean not null default true,
  plans           boolean not null default true,
  reminders       boolean not null default true,
  push_token      text,
  updated_at      timestamptz not null default now()
);
create trigger notification_settings_updated before update on public.notification_settings for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- social graph
create table public.friend_requests (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.profiles (id) on delete cascade,
  receiver_id  uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'canceled')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> receiver_id)
);
create unique index friend_requests_one_pending on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id)) where status = 'pending';
create index friend_requests_receiver on public.friend_requests (receiver_id) where status = 'pending';

create table public.friendships (
  user_a     uuid not null references public.profiles (id) on delete cascade,
  user_b     uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index friendships_b on public.friendships (user_b);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked on public.blocks (blocked_id);

-- ---------------------------------------------------------------- groups & chat
create table public.groups (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(btrim(name)) between 1 and 50),
  photo_url       text check (char_length(photo_url) <= 500),
  created_by      uuid references public.profiles (id) on delete set null,
  ai_auto_suggest boolean not null default false,
  ai_last_auto_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger groups_updated before update on public.groups for each row execute function public.set_updated_at();

create table public.group_members (
  group_id       uuid not null references public.groups (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  role           text not null default 'member' check (role in ('owner', 'admin', 'member')),
  muted          boolean not null default false,
  ai_share_prefs boolean not null default true,
  joined_at      timestamptz not null default now(),
  last_read_at   timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user on public.group_members (user_id);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  sender_id  uuid references public.profiles (id) on delete cascade, -- null = Gather AI / system
  kind       text not null default 'text' check (kind in ('text', 'ai', 'system', 'poll', 'plan', 'share')),
  body       text not null default '' check (char_length(body) <= 4000),
  payload    jsonb,
  client_id  uuid,
  created_at timestamptz not null default now(),
  check (kind in ('ai', 'system') or sender_id is not null or kind in ('poll', 'plan'))
);
create index messages_group_created on public.messages (group_id, created_at desc, id desc);
create unique index messages_client_id on public.messages (sender_id, client_id) where client_id is not null;

-- ---------------------------------------------------------------- AI
create table public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null default 'New chat' check (char_length(title) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user on public.ai_conversations (user_id, updated_at desc);
create trigger ai_conversations_updated before update on public.ai_conversations for each row execute function public.set_updated_at();

create table public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null check (char_length(content) <= 4000),
  response        jsonb,
  created_at      timestamptz not null default now()
);
create index ai_messages_conv on public.ai_messages (conversation_id, created_at);

-- Every recommendation the AI produced (for linking polls/plans/saves and quality review).
create table public.recommendations (
  id              uuid primary key default gen_random_uuid(),
  requested_by    uuid references public.profiles (id) on delete set null,
  group_id        uuid references public.groups (id) on delete cascade,
  conversation_id uuid references public.ai_conversations (id) on delete cascade,
  data            jsonb not null,
  source          text not null check (source in ('google_places', 'demo_sample', 'ai_idea')),
  created_at      timestamptz not null default now()
);
create index recommendations_group on public.recommendations (group_id, created_at desc);

create table public.ai_usage_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('group', 'private', 'auto')),
  created_at timestamptz not null default now()
);
create index ai_usage_user_time on public.ai_usage_events (user_id, created_at desc);

-- ---------------------------------------------------------------- saved
create table public.saved_places (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  collection     text not null default 'Saved' check (char_length(collection) between 1 and 40),
  recommendation jsonb not null,
  place_key      text not null, -- placeId or recommendation id, for de-duplication
  note           text check (char_length(note) <= 300),
  created_at     timestamptz not null default now(),
  unique (user_id, place_key)
);

-- ---------------------------------------------------------------- polls
create table public.polls (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.groups (id) on delete cascade,
  created_by        uuid references public.profiles (id) on delete set null,
  question          text not null check (char_length(btrim(question)) between 1 and 140),
  allow_multiple    boolean not null default false,
  status            text not null default 'open' check (status in ('open', 'closed')),
  winning_option_id uuid,
  plan_id           uuid,
  vote_version      integer not null default 0, -- bumped on every vote so realtime subscribers refresh
  created_at        timestamptz not null default now(),
  closed_at         timestamptz
);
create index polls_group on public.polls (group_id, created_at desc);

create table public.poll_options (
  id             uuid primary key default gen_random_uuid(),
  poll_id        uuid not null references public.polls (id) on delete cascade,
  label          text not null check (char_length(btrim(label)) between 1 and 80),
  description    text check (char_length(description) <= 200),
  recommendation jsonb,
  position       integer not null default 0
);
create index poll_options_poll on public.poll_options (poll_id, position);
alter table public.polls add constraint polls_winner_fk foreign key (winning_option_id) references public.poll_options (id) on delete set null;

create table public.poll_votes (
  poll_id    uuid not null references public.polls (id) on delete cascade,
  option_id  uuid not null references public.poll_options (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);
create index poll_votes_poll on public.poll_votes (poll_id);

-- ---------------------------------------------------------------- plans
create table public.plans (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid references public.groups (id) on delete cascade,
  created_by     uuid references public.profiles (id) on delete set null,
  title          text not null check (char_length(btrim(title)) between 1 and 80),
  description    text check (char_length(description) <= 1000),
  activity       text check (char_length(activity) <= 120),
  place          jsonb,
  starts_at      timestamptz,
  ends_at        timestamptz,
  timezone       text not null default 'UTC' check (char_length(timezone) <= 64),
  location_text  text check (char_length(location_text) <= 160),
  budget_text    text check (char_length(budget_text) <= 60),
  status         text not null default 'planning' check (status in ('planning', 'confirmed', 'completed', 'canceled')),
  source_poll_id uuid references public.polls (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (status <> 'confirmed' or starts_at is not null)
);
create index plans_group on public.plans (group_id);
create index plans_starts on public.plans (starts_at);
create trigger plans_updated before update on public.plans for each row execute function public.set_updated_at();
alter table public.polls add constraint polls_plan_fk foreign key (plan_id) references public.plans (id) on delete set null;

create table public.plan_participants (
  plan_id    uuid not null references public.plans (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  rsvp       text not null default 'invited' check (rsvp in ('invited', 'going', 'maybe', 'declined')),
  role       text not null default 'member' check (role in ('organizer', 'member')),
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create index plan_participants_user on public.plan_participants (user_id);

create table public.availability_slots (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.plans (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours')
);
create index availability_plan on public.availability_slots (plan_id);

-- ---------------------------------------------------------------- notifications & billing
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (type in ('friend_request', 'friend_accepted', 'group_added', 'mention', 'poll_created', 'poll_closed', 'plan_invite', 'plan_updated', 'plan_reminder')),
  title      text not null check (char_length(title) <= 120),
  body       text not null default '' check (char_length(body) <= 300),
  data       jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on public.notifications (user_id, created_at desc);

-- Written only by the server (future app-store billing webhooks). Clients can read their own row.
create table public.subscription_status (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  tier               text not null default 'free' check (tier in ('free', 'premium')),
  status             text not null default 'none' check (status in ('none', 'active', 'canceled', 'waitlist')),
  provider           text check (provider in ('app_store', 'google_play', 'manual')),
  current_period_end timestamptz,
  updated_at         timestamptz not null default now()
);
create trigger subscription_status_updated before update on public.subscription_status for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- new-user bootstrap
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  insert into public.privacy_settings (user_id) values (new.id) on conflict do nothing;
  insert into public.notification_settings (user_id) values (new.id) on conflict do nothing;
  insert into public.subscription_status (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
