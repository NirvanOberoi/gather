-- =============================================================================
-- Gather — RPCs (SECURITY DEFINER) and triggers
-- Each function re-checks authorization explicitly; callers can't bypass the rules by
-- writing tables directly because those writes are revoked in the security migration.
-- =============================================================================

-- ---------------------------------------------------------------- notifications helper
create or replace function public.notify_user(uid uuid, ntype text, ntitle text, nbody text, ndata jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare
  s notification_settings%rowtype;
  muted boolean := false;
  enabled boolean;
begin
  if uid is null or uid = auth.uid() then return; end if;
  select * into s from notification_settings where user_id = uid;
  enabled := case ntype
    when 'friend_request' then coalesce(s.friend_requests, true)
    when 'friend_accepted' then coalesce(s.friend_requests, true)
    when 'group_added' then coalesce(s.group_adds, true)
    when 'mention' then coalesce(s.mentions, true)
    when 'poll_created' then coalesce(s.polls, true)
    when 'poll_closed' then coalesce(s.polls, true)
    when 'plan_invite' then coalesce(s.plans, true)
    when 'plan_updated' then coalesce(s.plans, true)
    when 'plan_reminder' then coalesce(s.reminders, true)
    else true end;
  if not enabled then return; end if;
  if ndata ? 'groupId' and ntype <> 'mention' then
    select gm.muted into muted from group_members gm where gm.group_id = (ndata ->> 'groupId')::uuid and gm.user_id = uid;
    if coalesce(muted, false) then return; end if;
  end if;
  insert into notifications (user_id, type, title, body, data) values (uid, ntype, left(ntitle, 120), left(coalesce(nbody, ''), 300), ndata);
end $$;
revoke all on function public.notify_user(uuid, text, text, text, jsonb) from public, authenticated;

create or replace function public.display_name_of(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(display_name, ''), username, 'Someone') from profiles where id = uid;
$$;

create or replace function public.post_system_message(gid uuid, mkind text, mbody text, mpayload jsonb default null, msender uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  insert into messages (group_id, sender_id, kind, body, payload) values (gid, msender, mkind, left(mbody, 4000), mpayload) returning id into mid;
  return mid;
end $$;
revoke all on function public.post_system_message(uuid, text, text, jsonb, uuid) from public, authenticated;

-- ---------------------------------------------------------------- profiles & search
create or replace function public.search_profiles(q text)
returns table (id uuid, username text, display_name text, avatar_url text, bio text, relation text, request_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); term text := lower(regexp_replace(btrim(q), '^@', ''));
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if char_length(term) < 2 then return; end if;
  return query
    select p.id, p.username, p.display_name, p.avatar_url, p.bio,
      case
        when exists (select 1 from blocks b where b.blocker_id = me and b.blocked_id = p.id) then 'blocked'
        when public.are_friends(me, p.id) then 'friend'
        when fr.sender_id = me then 'outgoing'
        when fr.receiver_id = me then 'incoming'
        else 'none' end,
      fr.id
    from profiles p
    join privacy_settings ps on ps.user_id = p.id
    left join friend_requests fr on fr.status = 'pending'
      and ((fr.sender_id = me and fr.receiver_id = p.id) or (fr.sender_id = p.id and fr.receiver_id = me))
    where p.id <> me
      and p.username is not null
      and (ps.discoverable or public.are_friends(me, p.id))
      and not exists (select 1 from blocks b where b.blocker_id = p.id and b.blocked_id = me)
      and (p.username like term || '%' or lower(p.display_name) like '%' || term || '%')
    order by (p.username = term) desc, p.username
    limit 20;
end $$;

create or replace function public.is_username_available(u text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where username = lower(u) and id <> auth.uid());
$$;

-- Preferences of a friend, filtered to the categories they chose to share with friends.
create or replace function public.get_visible_preferences(target uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p user_preferences%rowtype;
  s privacy_settings%rowtype;
  out jsonb := '{}';
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if target <> me and (not public.are_friends(me, target) or public.is_blocked_between(me, target)) then return '{}'; end if;
  select * into p from user_preferences where user_id = target;
  select * into s from privacy_settings where user_id = target;
  if not found then return '{}'; end if;
  if target = me or (s.friends_share ->> 'food')::boolean then
    out := out || jsonb_build_object('cuisines', p.cuisines, 'dietary', p.dietary, 'restaurantStyles', p.restaurant_styles);
  end if;
  if target = me or (s.friends_share ->> 'activities')::boolean then
    out := out || jsonb_build_object('activities', p.activities, 'customInterests', p.custom_interests, 'favoriteActivities', p.favorite_activities);
  end if;
  if (target = me or (s.friends_share ->> 'budget')::boolean) and p.budget is not null then out := out || jsonb_build_object('budget', p.budget); end if;
  if (target = me or (s.friends_share ->> 'distance')::boolean) and p.max_distance_km is not null then out := out || jsonb_build_object('maxDistanceKm', p.max_distance_km); end if;
  if target = me or (s.friends_share ->> 'times')::boolean then out := out || jsonb_build_object('preferredTimes', p.preferred_times); end if;
  if target = me or (s.friends_share ->> 'dislikes')::boolean then out := out || jsonb_build_object('dislikedActivities', p.disliked_activities); end if;
  if target = me or (s.friends_share ->> 'accessibility')::boolean then out := out || jsonb_build_object('accessibility', p.accessibility); end if;
  return out;
end $$;

-- ---------------------------------------------------------------- friends
create or replace function public.send_friend_request(target uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rid uuid; allows boolean;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if target = me then raise exception 'You can’t add yourself.' using errcode = '22023'; end if;
  select allow_friend_requests into allows from privacy_settings where user_id = target;
  -- Same error for "blocked" and "not accepting" so a block is never revealed.
  if not coalesce(allows, false) or public.is_blocked_between(me, target) then
    raise exception 'This person isn’t accepting friend requests.' using errcode = '42501';
  end if;
  if public.are_friends(me, target) then raise exception 'You’re already friends.' using errcode = '22023'; end if;
  -- If they already asked me, accept instead of creating a second request.
  select id into rid from friend_requests where sender_id = target and receiver_id = me and status = 'pending';
  if rid is not null then
    perform public.respond_friend_request(rid, true);
    return rid;
  end if;
  insert into friend_requests (sender_id, receiver_id) values (me, target) returning id into rid;
  perform public.notify_user(target, 'friend_request', public.display_name_of(me) || ' wants to be friends', 'Tap to respond', jsonb_build_object('userId', me));
  return rid;
exception when unique_violation then
  raise exception 'There’s already a pending request.' using errcode = '22023';
end $$;

create or replace function public.respond_friend_request(request_id uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r friend_requests%rowtype;
begin
  select * into r from friend_requests where id = request_id and receiver_id = me and status = 'pending' for update;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  update friend_requests set status = case when accept then 'accepted' else 'declined' end, responded_at = now() where id = request_id;
  if accept then
    if public.is_blocked_between(me, r.sender_id) then raise exception 'Request not found.' using errcode = 'P0002'; end if;
    insert into friendships (user_a, user_b) values (least(me, r.sender_id), greatest(me, r.sender_id)) on conflict do nothing;
    perform public.notify_user(r.sender_id, 'friend_accepted', public.display_name_of(me) || ' accepted your request', 'You can now add them to groups.', jsonb_build_object('userId', me));
  end if;
end $$;

create or replace function public.cancel_friend_request(request_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update friend_requests set status = 'canceled', responded_at = now()
  where id = request_id and sender_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
end $$;

-- Blocking removes friendship and pending requests in both directions.
create or replace function public.on_block_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from friendships where user_a = least(new.blocker_id, new.blocked_id) and user_b = greatest(new.blocker_id, new.blocked_id);
  update friend_requests set status = 'canceled', responded_at = now()
  where status = 'pending' and ((sender_id = new.blocker_id and receiver_id = new.blocked_id) or (sender_id = new.blocked_id and receiver_id = new.blocker_id));
  return new;
end $$;
create trigger blocks_after_insert after insert on public.blocks for each row execute function public.on_block_created();

-- ---------------------------------------------------------------- groups
create or replace function public.create_group(group_name text, member_ids uuid[], photo text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); gid uuid; uid uuid;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if coalesce(cardinality(member_ids), 0) > 49 then raise exception 'Groups can have up to 50 people.' using errcode = '22023'; end if;
  insert into groups (name, created_by, photo_url) values (btrim(group_name), me, photo) returning id into gid;
  insert into group_members (group_id, user_id, role) values (gid, me, 'owner');
  foreach uid in array coalesce(member_ids, '{}') loop
    continue when uid = me or exists (select 1 from group_members where group_id = gid and user_id = uid);
    if not public.are_friends(me, uid) or public.is_blocked_between(me, uid) then
      raise exception 'You can only add friends to a group.' using errcode = '42501';
    end if;
    insert into group_members (group_id, user_id) values (gid, uid);
    perform public.notify_user(uid, 'group_added', public.display_name_of(me) || ' added you to ' || btrim(group_name), '', jsonb_build_object('groupId', gid));
  end loop;
  perform public.post_system_message(gid, 'system', public.display_name_of(me) || ' created “' || btrim(group_name) || '”');
  return gid;
end $$;

create or replace function public.add_group_members(gid uuid, member_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); uid uuid; gname text;
begin
  if not public.is_group_member(gid) then raise exception 'You’re not a member of this group.' using errcode = '42501'; end if;
  select name into gname from groups where id = gid;
  if (select count(*) from group_members where group_id = gid) + cardinality(member_ids) > 50 then
    raise exception 'Groups can have up to 50 people.' using errcode = '22023';
  end if;
  foreach uid in array member_ids loop
    continue when exists (select 1 from group_members where group_id = gid and user_id = uid);
    if not public.are_friends(me, uid) or public.is_blocked_between(me, uid) then
      raise exception 'You can only add friends to a group.' using errcode = '42501';
    end if;
    insert into group_members (group_id, user_id) values (gid, uid);
    perform public.post_system_message(gid, 'system', public.display_name_of(me) || ' added ' || public.display_name_of(uid));
    perform public.notify_user(uid, 'group_added', public.display_name_of(me) || ' added you to ' || gname, '', jsonb_build_object('groupId', gid));
  end loop;
end $$;

create or replace function public.remove_group_member(gid uuid, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_admin(gid) then raise exception 'Only group admins can remove people.' using errcode = '42501'; end if;
  if public.group_role(gid, uid) = 'owner' then raise exception 'The group owner can’t be removed.' using errcode = '42501'; end if;
  delete from group_members where group_id = gid and user_id = uid;
  perform public.post_system_message(gid, 'system', public.display_name_of(uid) || ' was removed');
end $$;

create or replace function public.leave_group(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); my_role text; heir uuid;
begin
  my_role := public.group_role(gid, me);
  if my_role is null then raise exception 'You’re not a member of this group.' using errcode = '42501'; end if;
  delete from group_members where group_id = gid and user_id = me;
  if not exists (select 1 from group_members where group_id = gid) then
    delete from groups where id = gid; -- last one out: delete the group and its messages
    return;
  end if;
  if my_role = 'owner' then
    select user_id into heir from group_members where group_id = gid order by (role = 'admin') desc, joined_at limit 1;
    update group_members set role = 'owner' where group_id = gid and user_id = heir;
  end if;
  perform public.post_system_message(gid, 'system', public.display_name_of(me) || ' left the group');
end $$;

create or replace function public.on_group_settings_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    perform public.post_system_message(new.id, 'system', 'Group renamed to “' || new.name || '”');
  end if;
  if new.ai_auto_suggest is distinct from old.ai_auto_suggest then
    perform public.post_system_message(new.id, 'system', case when new.ai_auto_suggest
      then 'Automatic Gather suggestions turned on (at most once every 2 hours).'
      else 'Automatic Gather suggestions turned off.' end);
  end if;
  return new;
end $$;
create trigger groups_after_update after update on public.groups for each row execute function public.on_group_settings_changed();

-- Unread counts + last message for the chat list in one round-trip.
create or replace function public.get_group_summaries()
returns table (id uuid, name text, photo_url text, created_by uuid, ai_auto_suggest boolean, created_at timestamptz,
  member_count bigint, member_preview jsonb, last_message jsonb, unread_count bigint, muted boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.photo_url, g.created_by, g.ai_auto_suggest, g.created_at,
    (select count(*) from group_members m where m.group_id = g.id),
    (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url)), '[]')
       from (select p.* from group_members m join profiles p on p.id = m.user_id
             where m.group_id = g.id and m.user_id <> auth.uid() order by m.joined_at limit 3) p),
    (select to_jsonb(x) from (select msg.id, msg.group_id, msg.sender_id, msg.kind, msg.body, msg.created_at
       from messages msg where msg.group_id = g.id order by msg.created_at desc limit 1) x),
    (select count(*) from messages msg where msg.group_id = g.id and msg.created_at > me.last_read_at and msg.sender_id is distinct from auth.uid()),
    me.muted
  from group_members me join groups g on g.id = me.group_id
  where me.user_id = auth.uid();
$$;

-- @username mentions → notifications for mentioned members.
create or replace function public.on_message_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text; uid uuid; gname text;
begin
  if new.kind <> 'text' or new.sender_id is null or position('@' in new.body) = 0 then return new; end if;
  select name into gname from groups where id = new.group_id;
  for uname in select distinct lower(m[1]) from regexp_matches(new.body, '@([a-zA-Z0-9_.]{3,20})', 'g') as m loop
    select p.id into uid from profiles p join group_members gm on gm.user_id = p.id and gm.group_id = new.group_id where p.username = uname;
    if uid is not null and uid <> new.sender_id and not public.is_blocked_between(uid, new.sender_id) then
      perform public.notify_user(uid, 'mention', public.display_name_of(new.sender_id) || ' mentioned you in ' || gname, left(new.body, 140), jsonb_build_object('groupId', new.group_id));
    end if;
    uid := null;
  end loop;
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages for each row execute function public.on_message_created();

-- ---------------------------------------------------------------- polls
create or replace function public.create_poll(gid uuid, question text, allow_multiple boolean, options jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pid uuid; opt jsonb; i int := 0; uid uuid;
begin
  if not public.is_group_member(gid) then raise exception 'You’re not a member of this group.' using errcode = '42501'; end if;
  if jsonb_typeof(options) <> 'array' or jsonb_array_length(options) not between 2 and 8 then
    raise exception 'Polls need 2–8 options.' using errcode = '22023';
  end if;
  insert into polls (group_id, created_by, question, allow_multiple) values (gid, me, btrim(question), allow_multiple) returning id into pid;
  for opt in select * from jsonb_array_elements(options) loop
    insert into poll_options (poll_id, label, description, recommendation, position)
    values (pid, btrim(opt ->> 'label'), opt ->> 'description', case when opt ? 'recommendation' and jsonb_typeof(opt -> 'recommendation') = 'object' then opt -> 'recommendation' end, i);
    i := i + 1;
  end loop;
  perform public.post_system_message(gid, 'poll', 'Poll: ' || btrim(question), jsonb_build_object('type', 'poll', 'pollId', pid), me);
  for uid in select user_id from group_members where group_id = gid and user_id <> me loop
    perform public.notify_user(uid, 'poll_created', public.display_name_of(me) || ' started a poll', btrim(question), jsonb_build_object('groupId', gid, 'pollId', pid));
  end loop;
  return pid;
end $$;

-- Replace the caller's ballot atomically (empty array = retract).
create or replace function public.cast_vote(pid uuid, option_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p polls%rowtype; n int;
begin
  select * into p from polls where id = pid for update;
  if not found or not public.is_group_member(p.group_id) then raise exception 'Only group members can vote.' using errcode = '42501'; end if;
  if p.status <> 'open' then raise exception 'This poll is closed.' using errcode = '22023'; end if;
  select count(distinct x) into n from unnest(coalesce(option_ids, '{}')) x;
  if n > 1 and not p.allow_multiple then raise exception 'This poll allows one choice.' using errcode = '22023'; end if;
  if exists (select 1 from unnest(coalesce(option_ids, '{}')) x where not exists (select 1 from poll_options o where o.id = x and o.poll_id = pid)) then
    raise exception 'That option isn’t part of this poll.' using errcode = '22023';
  end if;
  delete from poll_votes where poll_id = pid and user_id = me;
  insert into poll_votes (poll_id, option_id, user_id) select distinct pid, x, me from unnest(coalesce(option_ids, '{}')) x;
  update polls set vote_version = vote_version + 1 where id = pid;
end $$;

-- Poll with tallies. Voter identities are only included for people who allow it (and yourself).
create or replace function public.get_poll(pid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p polls%rowtype; result jsonb;
begin
  select * into p from polls where id = pid;
  if not found or not public.is_group_member(p.group_id) then raise exception 'Poll not found.' using errcode = 'P0002'; end if;
  select jsonb_build_object(
    'poll', to_jsonb(p),
    'options', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'poll_id', o.poll_id, 'label', o.label, 'description', o.description, 'recommendation', o.recommendation, 'position', o.position,
        'vote_count', (select count(*) from poll_votes v where v.option_id = o.id),
        'visible_voters', coalesce((select jsonb_agg(v.user_id) from poll_votes v join privacy_settings s on s.user_id = v.user_id
                                    where v.option_id = o.id and (v.user_id = auth.uid() or s.show_vote_identity)), '[]')
      ) order by o.position) from poll_options o where o.poll_id = pid), '[]')
  ) into result;
  return result;
end $$;

create or replace function public.close_poll(pid uuid, winner uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p polls%rowtype; top_count int; top_n int; chosen uuid := winner; label text; uid uuid;
begin
  select * into p from polls where id = pid for update;
  if not found or not public.is_group_member(p.group_id) then raise exception 'Poll not found.' using errcode = 'P0002'; end if;
  if p.created_by is distinct from me and not public.is_group_admin(p.group_id) then
    raise exception 'Only the poll creator or a group admin can close this poll.' using errcode = '42501';
  end if;
  if p.status = 'closed' then raise exception 'This poll is already closed.' using errcode = '22023'; end if;
  if chosen is not null and not exists (select 1 from poll_options where id = chosen and poll_id = pid) then
    raise exception 'Unknown option.' using errcode = '22023';
  end if;
  if chosen is null then
    select max(c), count(*) filter (where c = (select max(c2) from (select count(v.user_id) c2 from poll_options o2 left join poll_votes v on v.option_id = o2.id where o2.poll_id = pid group by o2.id) t2))
      into top_count, top_n
      from (select o.id, count(v.user_id) c from poll_options o left join poll_votes v on v.option_id = o.id where o.poll_id = pid group by o.id) t;
    if coalesce(top_count, 0) > 0 then
      if top_n > 1 then raise exception 'It’s a tie — pick the final option to close the poll.' using errcode = '22023'; end if;
      select o.id into chosen from poll_options o left join poll_votes v on v.option_id = o.id where o.poll_id = pid group by o.id order by count(v.user_id) desc limit 1;
    end if;
  end if;
  update polls set status = 'closed', closed_at = now(), winning_option_id = chosen where id = pid;
  select o.label into label from poll_options o where o.id = chosen;
  perform public.post_system_message(p.group_id, 'system', case when label is null then 'Poll closed with no votes.' else 'Poll closed — “' || label || '” won! 🎉' end);
  for uid in select user_id from group_members where group_id = p.group_id loop
    perform public.notify_user(uid, 'poll_closed', 'Poll results are in', coalesce('“' || label || '” won: ', '') || p.question, jsonb_build_object('groupId', p.group_id, 'pollId', pid));
  end loop;
end $$;

-- ---------------------------------------------------------------- plans
create or replace function public.create_plan(input jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); gid uuid := nullif(input ->> 'groupId', '')::uuid; pl uuid; uid uuid; title text := btrim(input ->> 'title');
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if gid is not null and not public.is_group_member(gid) then raise exception 'You’re not a member of this group.' using errcode = '42501'; end if;
  insert into plans (group_id, created_by, title, description, activity, place, starts_at, ends_at, timezone, location_text, budget_text, status, source_poll_id)
  values (gid, me, title, input ->> 'description', input ->> 'activity', case when jsonb_typeof(input -> 'place') = 'object' then input -> 'place' end,
          (input ->> 'startsAt')::timestamptz, (input ->> 'endsAt')::timestamptz, coalesce(input ->> 'timezone', 'UTC'),
          input ->> 'locationText', input ->> 'budgetText', coalesce(input ->> 'status', 'planning'), nullif(input ->> 'sourcePollId', '')::uuid)
  returning id into pl;
  insert into plan_participants (plan_id, user_id, rsvp, role) values (pl, me, 'going', 'organizer');
  for uid in
    select distinct x::uuid from jsonb_array_elements_text(coalesce(input -> 'participantIds',
      case when gid is not null then (select jsonb_agg(user_id) from group_members where group_id = gid) else '[]' end)) x
  loop
    continue when uid = me;
    -- Invite only group members (for group plans) or friends; never blocked users.
    if public.is_blocked_between(me, uid) or not (
      (gid is not null and exists (select 1 from group_members where group_id = gid and user_id = uid)) or public.are_friends(me, uid)
    ) then continue; end if;
    insert into plan_participants (plan_id, user_id) values (pl, uid) on conflict do nothing;
    perform public.notify_user(uid, 'plan_invite', 'You’re invited: ' || title, public.display_name_of(me) || ' added you to a plan', jsonb_build_object('planId', pl, 'groupId', gid));
  end loop;
  if gid is not null then
    perform public.post_system_message(gid, 'plan', 'New plan: ' || title, jsonb_build_object('type', 'plan', 'planId', pl), me);
  end if;
  return pl;
end $$;

create or replace function public.create_plan_from_poll(pid uuid, tz text, plan_title text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare p polls%rowtype; o poll_options%rowtype; pl uuid;
begin
  select * into p from polls where id = pid for update;
  if not found or not public.is_group_member(p.group_id) then raise exception 'Poll not found.' using errcode = 'P0002'; end if;
  if p.plan_id is not null then return p.plan_id; end if;
  if p.status <> 'closed' or p.winning_option_id is null then raise exception 'Close the poll with a winner first.' using errcode = '22023'; end if;
  select * into o from poll_options where id = p.winning_option_id;
  pl := public.create_plan(jsonb_build_object(
    'groupId', p.group_id, 'title', coalesce(nullif(btrim(plan_title), ''), o.label), 'activity', o.label, 'place', o.recommendation,
    'timezone', tz, 'locationText', o.recommendation ->> 'locationText', 'budgetText', o.recommendation -> 'estimatedCost' ->> 'label',
    'sourcePollId', pid, 'description', 'Picked by the group from “' || p.question || '”.'));
  update polls set plan_id = pl where id = pid;
  return pl;
end $$;

create or replace function public.set_rsvp(pid uuid, value text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if value not in ('going', 'maybe', 'declined') then raise exception 'Invalid RSVP.' using errcode = '22023'; end if;
  if not public.can_view_plan(pid) then raise exception 'You’re not part of this plan.' using errcode = '42501'; end if;
  insert into plan_participants (plan_id, user_id, rsvp) values (pid, me, value)
  on conflict (plan_id, user_id) do update set rsvp = excluded.rsvp;
end $$;

create or replace function public.invite_to_plan(pid uuid, user_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); gid uuid; title text; uid uuid;
begin
  if not public.is_plan_participant(pid) then raise exception 'You’re not part of this plan.' using errcode = '42501'; end if;
  select group_id, plans.title into gid, title from plans where id = pid;
  foreach uid in array user_ids loop
    continue when public.is_blocked_between(me, uid);
    if not (public.are_friends(me, uid) or (gid is not null and exists (select 1 from group_members where group_id = gid and user_id = uid))) then
      raise exception 'You can only invite friends or group members.' using errcode = '42501';
    end if;
    insert into plan_participants (plan_id, user_id) values (pid, uid) on conflict do nothing;
    if found then
      perform public.notify_user(uid, 'plan_invite', 'You’re invited: ' || title, public.display_name_of(me) || ' added you to a plan', jsonb_build_object('planId', pid));
    end if;
  end loop;
end $$;

create or replace function public.share_plan_to_group(pid uuid, gid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not public.can_view_plan(pid) or not public.is_group_member(gid) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  select title into t from plans where id = pid;
  perform public.post_system_message(gid, 'plan', 'Shared a plan: ' || t, jsonb_build_object('type', 'plan', 'planId', pid), auth.uid());
end $$;

-- Replace the caller's availability for a plan atomically.
create or replace function public.set_availability(pid uuid, ranges jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if not public.can_view_plan(pid) then raise exception 'You’re not part of this plan.' using errcode = '42501'; end if;
  if jsonb_typeof(ranges) <> 'array' or jsonb_array_length(ranges) > 20 then raise exception 'Up to 20 ranges per plan.' using errcode = '22023'; end if;
  delete from availability_slots where plan_id = pid and user_id = me;
  for r in select * from jsonb_array_elements(ranges) loop
    insert into availability_slots (plan_id, user_id, starts_at, ends_at) values (pid, me, (r ->> 'startsAt')::timestamptz, (r ->> 'endsAt')::timestamptz);
  end loop;
end $$;

-- Plan edits: announce in the group + notify participants.
create or replace function public.on_plan_updated() returns trigger
language plpgsql security definer set search_path = public as $$
declare msg text; uid uuid;
begin
  if new.status is distinct from old.status and new.status = 'confirmed' then msg := '✅ Plan confirmed: ' || new.title;
  elsif new.status is distinct from old.status and new.status = 'canceled' then msg := 'Plan canceled: ' || new.title;
  elsif new.starts_at is distinct from old.starts_at then msg := '🕒 Time set for ' || new.title;
  elsif row(new.title, new.place, new.location_text, new.description) is distinct from row(old.title, old.place, old.location_text, old.description) then msg := 'Plan updated: ' || new.title;
  end if;
  if msg is null then return new; end if;
  if new.group_id is not null then
    perform public.post_system_message(new.group_id, 'plan', msg, jsonb_build_object('type', 'plan', 'planId', new.id));
  end if;
  for uid in select user_id from plan_participants where plan_id = new.id loop
    perform public.notify_user(uid, 'plan_updated', msg, '', jsonb_build_object('planId', new.id));
  end loop;
  return new;
end $$;
create trigger plans_after_update after update on public.plans for each row execute function public.on_plan_updated();

-- ---------------------------------------------------------------- misc
create or replace function public.mark_notifications_read(ids uuid[] default null) returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null and (ids is null or id = any (ids));
$$;

create or replace function public.join_premium_waitlist() returns void
language sql security definer set search_path = public as $$
  update subscription_status set status = 'waitlist' where user_id = auth.uid() and status = 'none';
$$;

-- Upcoming-plan reminders. Schedule hourly with pg_cron:  select cron.schedule('plan-reminders', '0 * * * *', 'select public.send_plan_reminders()');
create or replace function public.send_plan_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select pp.user_id, p.id, p.title from plans p join plan_participants pp on pp.plan_id = p.id
    where p.status = 'confirmed' and pp.rsvp in ('going', 'maybe')
      and p.starts_at between now() + interval '23 hours' and now() + interval '24 hours'
      and not exists (select 1 from notifications n where n.user_id = pp.user_id and n.type = 'plan_reminder' and n.data ->> 'planId' = p.id::text)
  loop
    perform public.notify_user(r.user_id, 'plan_reminder', 'Tomorrow: ' || r.title, 'Don’t forget your plan!', jsonb_build_object('planId', r.id));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.send_plan_reminders() from public, authenticated;

-- Functions callable by signed-in users
revoke all on function public.search_profiles(text), public.is_username_available(text), public.get_visible_preferences(uuid),
  public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean), public.cancel_friend_request(uuid),
  public.create_group(text, uuid[], text), public.add_group_members(uuid, uuid[]), public.remove_group_member(uuid, uuid),
  public.leave_group(uuid), public.get_group_summaries(), public.create_poll(uuid, text, boolean, jsonb),
  public.cast_vote(uuid, uuid[]), public.get_poll(uuid), public.close_poll(uuid, uuid), public.create_plan(jsonb),
  public.create_plan_from_poll(uuid, text, text), public.set_rsvp(uuid, text), public.invite_to_plan(uuid, uuid[]),
  public.share_plan_to_group(uuid, uuid), public.set_availability(uuid, jsonb), public.mark_notifications_read(uuid[]),
  public.join_premium_waitlist() from public, anon;
grant execute on function public.search_profiles(text), public.is_username_available(text), public.get_visible_preferences(uuid),
  public.send_friend_request(uuid), public.respond_friend_request(uuid, boolean), public.cancel_friend_request(uuid),
  public.create_group(text, uuid[], text), public.add_group_members(uuid, uuid[]), public.remove_group_member(uuid, uuid),
  public.leave_group(uuid), public.get_group_summaries(), public.create_poll(uuid, text, boolean, jsonb),
  public.cast_vote(uuid, uuid[]), public.get_poll(uuid), public.close_poll(uuid, uuid), public.create_plan(jsonb),
  public.create_plan_from_poll(uuid, text, text), public.set_rsvp(uuid, text), public.invite_to_plan(uuid, uuid[]),
  public.share_plan_to_group(uuid, uuid), public.set_availability(uuid, jsonb), public.mark_notifications_read(uuid[]),
  public.join_premium_waitlist() to authenticated;

-- ---------------------------------------------------------------- realtime
-- Realtime respects RLS: subscribers only receive rows they can select.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.polls, public.group_members, public.notifications,
      public.plans, public.plan_participants, public.availability_slots, public.friend_requests, public.friendships;
  end if;
end $$;
