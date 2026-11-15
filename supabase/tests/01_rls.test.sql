-- =============================================================================
-- RLS / authorization tests. Each block impersonates a user the way PostgREST does
-- (role = authenticated, request.jwt.claim.sub = user id) and asserts what they can do.
-- =============================================================================
set client_min_messages = warning;
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  perform set_config('role', case when uid is null then 'anon' else 'authenticated' end, false);
end $$;
create function tests.as_admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', false);
  perform set_config('request.jwt.claim.sub', '', false);
end $$;
create function tests.ok(cond boolean, description text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', description; end if;
  raise notice 'ok - %', description;
end $$;
create function tests.throws(stmt text, pattern text, description text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm ~* pattern then raise notice 'ok - % (%)', description, sqlerrm; return; end if;
    raise exception 'FAIL: % — wrong error: %', description, sqlerrm;
  end;
  raise exception 'FAIL: % — expected an error', description;
end $$;
grant execute on all functions in schema tests to anon, authenticated;
set client_min_messages = notice;

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@test'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@test');
\set alice '''00000000-0000-0000-0000-00000000000a'''
\set bob   '''00000000-0000-0000-0000-00000000000b'''
\set carol '''00000000-0000-0000-0000-00000000000c'''
\set dave  '''00000000-0000-0000-0000-00000000000d'''

select tests.ok((select count(*) from profiles) = 4, 'new auth users get profiles');
select tests.ok((select count(*) from privacy_settings) = 4 and (select count(*) from subscription_status) = 4, 'bootstrap rows created');

-- ---------------------------------------------------------------- profiles
select tests.as_user(:alice);
update profiles set username = 'alice', display_name = 'Alice' where id = auth.uid();
update profiles set display_name = 'hacked' where id = :bob;
select tests.as_user(:bob);
update profiles set username = 'bob', display_name = 'Bob' where id = auth.uid();
select tests.ok((select display_name from profiles where id = :bob) = 'Bob', 'users cannot edit other profiles');
select tests.as_user(:carol); update profiles set username = 'carol', display_name = 'Carol' where id = auth.uid();
select tests.as_user(:dave);  update profiles set username = 'dave', display_name = 'Dave' where id = auth.uid();
select tests.throws($$ update profiles set username = 'Bad Name!' where id = auth.uid() $$, 'check', 'username format is enforced');
select tests.throws($$ update profiles set id = gen_random_uuid() where id = auth.uid() $$, 'permission denied', 'profile id is not updatable');
select tests.throws($$ insert into subscription_status (user_id, tier) values (auth.uid(), 'premium') on conflict (user_id) do update set tier = 'premium' $$, 'permission denied', 'users cannot grant themselves premium');

select tests.as_user(null);
select tests.throws($$ select * from profiles $$, 'permission denied', 'anon cannot read profiles');

-- ---------------------------------------------------------------- friends & blocks
select tests.as_user(:alice);
select send_friend_request(:bob);
select tests.throws($$ select send_friend_request('00000000-0000-0000-0000-00000000000b') $$, 'already a pending', 'duplicate friend requests rejected');
select tests.throws($$ insert into friendships values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000c') $$, 'permission denied', 'cannot self-insert friendships');
select tests.as_user(:carol);
select tests.ok((select count(*) from friend_requests) = 0, 'third parties cannot see friend requests');
select tests.as_user(:bob);
select respond_friend_request((select id from friend_requests where receiver_id = auth.uid()), true);
select tests.ok(are_friends(:alice, :bob), 'accepting creates a friendship');
select tests.as_user(:alice);
select tests.ok(exists (select 1 from notifications where type = 'friend_accepted'), 'sender notified of acceptance');
select send_friend_request(:carol);
select tests.as_user(:carol);
select respond_friend_request((select id from friend_requests where receiver_id = auth.uid() and status = 'pending'), true);
select tests.as_user(:dave);
insert into blocks (blocker_id, blocked_id) values (auth.uid(), :alice);
select tests.as_user(:alice);
select tests.throws($$ select send_friend_request('00000000-0000-0000-0000-00000000000d') $$, 'accepting friend requests', 'blocked users cannot send requests (block not revealed)');
select tests.ok((select count(*) from search_profiles('dave')) = 0, 'search hides people who blocked you');
select tests.ok((select count(*) from search_profiles('bo')) = 1, 'search finds discoverable users');
select tests.ok((select count(*) from blocks) = 0, 'cannot see who blocked you');

-- ---------------------------------------------------------------- profile visibility
select tests.as_user(:dave);
update privacy_settings set discoverable = false where user_id = auth.uid();
select tests.as_user(:carol);
select tests.ok((select count(*) from profiles where id = :dave) = 0, 'non-discoverable profiles are hidden from strangers (direct reads too)');
select tests.ok((select count(*) from profiles where id = :alice) = 1, 'discoverable profiles are visible');
select tests.as_user(:alice);
select tests.ok((select count(*) from profiles where id = :dave) = 0, 'people who blocked you are hidden');
select tests.as_user(:dave);
update privacy_settings set discoverable = true where user_id = auth.uid();

-- ---------------------------------------------------------------- preferences privacy
select tests.as_user(:bob);
update user_preferences set budget = 'under_15', cuisines = '{thai}', accessibility = '{wheelchair}' where user_id = auth.uid();
update privacy_settings set show_vote_identity = false where user_id = auth.uid();
select tests.as_user(:alice);
select tests.ok((select count(*) from user_preferences where user_id = :bob) = 0, 'cannot read another user''s raw preferences');
update user_preferences set budget = 'free' where user_id = :bob;
select tests.ok((select get_visible_preferences(:bob)) ? 'cuisines', 'friends see categories shared with friends');
select tests.ok(not (select get_visible_preferences(:bob)) ? 'budget' and not (select get_visible_preferences(:bob)) ? 'accessibility', 'friends do not see private categories');
select tests.as_user(:dave);
select tests.ok((select get_visible_preferences(:bob)) = '{}', 'non-friends see no preferences');
update privacy_settings set discoverable = false where user_id = auth.uid();
insert into blocks (blocker_id, blocked_id) values (auth.uid(), :carol);
select tests.as_user(:carol);
update privacy_settings set discoverable = false where user_id = auth.uid();
select tests.as_user(:dave);
select tests.ok((select count(*) from profiles where id = :carol) = 1, 'you can still see people on your own block list');
delete from blocks where blocker_id = auth.uid() and blocked_id = :carol;
update privacy_settings set discoverable = true where user_id = auth.uid();
select tests.as_user(:carol);
update privacy_settings set discoverable = true where user_id = auth.uid();
select tests.as_user(:bob);
select tests.ok((select budget from user_preferences) = 'under_15', 'preferences unchanged by other users');

-- ---------------------------------------------------------------- groups & messages
select tests.as_user(:alice);
select tests.throws($$ select create_group('Bad', array['00000000-0000-0000-0000-00000000000d']::uuid[]) $$, 'only add friends', 'cannot add non-friends/blockers to a group');
select create_group('Weekend Plans', array[:bob::uuid]) as gid \gset
select tests.ok((select count(*) from group_members where group_id = :'gid') = 2, 'group created with members');
select tests.as_user(:bob);
insert into messages (group_id, sender_id, body, client_id) values (:'gid', auth.uid(), 'hi @alice', gen_random_uuid());
select tests.throws(format($$ insert into messages (group_id, sender_id, body) values (%L, '00000000-0000-0000-0000-00000000000a', 'spoof') $$, :'gid'), 'row-level security', 'cannot post as another user');
select tests.throws(format($$ insert into messages (group_id, sender_id, kind, body) values (%L, auth.uid(), 'ai', 'fake AI') $$, :'gid'), 'row-level security', 'cannot forge AI messages');
select tests.throws(format($$ update group_members set role = 'owner' where group_id = %L and user_id = auth.uid() $$, :'gid'), 'permission denied', 'cannot promote yourself');
update group_members set muted = true where group_id = :'gid' and user_id = auth.uid();
select tests.ok((select muted from group_members where group_id = :'gid' and user_id = auth.uid()), 'members can mute');
update groups set name = 'mine now' where id = :'gid';
select tests.ok((select name from groups where id = :'gid') = 'Weekend Plans', 'non-admins cannot rename the group');
select tests.as_user(:alice);
select tests.ok(exists (select 1 from notifications where type = 'mention'), '@mentions notify the mentioned member');
select tests.as_user(:carol);
select tests.ok((select count(*) from messages where group_id = :'gid') = 0, 'non-members cannot read messages');
select tests.ok((select count(*) from groups where id = :'gid') = 0, 'non-members cannot see the group');
select tests.ok((select count(*) from group_members where group_id = :'gid') = 0, 'non-members cannot list members');
select tests.throws(format($$ insert into messages (group_id, sender_id, body) values (%L, auth.uid(), 'let me in') $$, :'gid'), 'row-level security', 'non-members cannot post');
select tests.throws(format($$ select add_group_members(%L, array['00000000-0000-0000-0000-00000000000c']::uuid[]) $$, :'gid'), 'not a member', 'non-members cannot add themselves');
select tests.as_user(:bob);
select tests.throws(format($$ select add_group_members(%L, array['00000000-0000-0000-0000-00000000000c']::uuid[]) $$, :'gid'), 'only add friends', 'members can only add their own friends');
select tests.as_user(:alice);
select add_group_members(:'gid', array[:carol::uuid]);
select tests.as_user(:carol);
select tests.ok((select count(*) from messages where group_id = :'gid') >= 2, 'new members can read history');

-- ---------------------------------------------------------------- polls & voting
select tests.as_user(:alice);
select create_poll(:'gid', 'What should we do?', false, '[{"label":"Bowling"},{"label":"Tacos"},{"label":"Movie"}]') as pid \gset
select tests.as_user(:bob);
select cast_vote(:'pid', array[(select id from poll_options where poll_id = :'pid' and label = 'Tacos')]);
select cast_vote(:'pid', array[(select id from poll_options where poll_id = :'pid' and label = 'Bowling')]);
select tests.ok((select count(*) from poll_votes) = 1, 'changing a vote replaces the ballot');
select tests.throws(format($$ select cast_vote(%L, (select array_agg(id) from poll_options where poll_id = %L)) $$, :'pid', :'pid'), 'one choice', 'single-choice polls reject multiple votes');
select tests.throws(format($$ insert into poll_votes select %L, id, '00000000-0000-0000-0000-00000000000a' from poll_options where poll_id = %L limit 1 $$, :'pid', :'pid'), 'permission denied', 'cannot vote as another user');
select tests.throws(format($$ select close_poll(%L) $$, :'pid'), 'creator or a group admin', 'only creator/admin can close');
select tests.as_user(:carol);
select cast_vote(:'pid', array[(select id from poll_options where poll_id = :'pid' and label = 'Bowling')]);
select tests.ok((select count(*) from poll_votes) = 1, 'users only see their own ballot rows');
select tests.as_user(:alice);
select tests.ok((select (o ->> 'vote_count')::int from jsonb_array_elements(get_poll(:'pid') -> 'options') o where o ->> 'label' = 'Bowling') = 2, 'get_poll returns tallies');
select tests.ok(not exists (select 1 from jsonb_array_elements(get_poll(:'pid') -> 'options') o, jsonb_array_elements_text(o -> 'visible_voters') v where v = :bob), 'hidden voter identities stay hidden');
select tests.as_user(:dave);
select tests.throws(format($$ select get_poll(%L) $$, :'pid'), 'not found', 'outsiders cannot read polls');
select tests.throws(format($$ select cast_vote(%L, array[]::uuid[]) $$, :'pid'), 'Only group members', 'outsiders cannot vote');
select tests.as_user(:alice);
select close_poll(:'pid');
select tests.ok((select o.label from polls p join poll_options o on o.id = p.winning_option_id where p.id = :'pid') = 'Bowling', 'winner is the top option');
select tests.as_user(:bob);
select tests.throws(format($$ select cast_vote(%L, array[]::uuid[]) $$, :'pid'), 'closed', 'cannot vote on closed polls');

-- ---------------------------------------------------------------- plans & availability
select tests.as_user(:alice);
select create_plan_from_poll(:'pid', 'America/Los_Angeles') as plid \gset
select tests.ok(create_plan_from_poll(:'pid', 'UTC') = :'plid'::uuid, 'plan-from-poll is idempotent');
select tests.ok((select count(*) from plan_participants where plan_id = :'plid') = 3, 'group members invited to plan');
select tests.throws(format($$ update plans set status = 'confirmed' where id = %L $$, :'plid'), 'check', 'cannot confirm without a time');
update plans set starts_at = '2026-11-21 17:00-08', ends_at = '2026-11-21 19:00-08', status = 'confirmed' where id = :'plid';
select tests.ok((select status from plans where id = :'plid') = 'confirmed', 'organizer can confirm');
select tests.as_user(:bob);
update plans set title = 'pwned' where id = :'plid';
select tests.ok((select title from plans where id = :'plid') = 'Bowling', 'participants cannot edit plans they don''t organize');
select set_rsvp(:'plid', 'going');
select tests.throws(format($$ update plan_participants set role = 'organizer' where plan_id = %L and user_id = auth.uid() $$, :'plid'), 'permission denied', 'cannot make yourself organizer');
select set_availability(:'plid', '[{"startsAt":"2026-11-21T16:00:00-08:00","endsAt":"2026-11-21T21:00:00-08:00"}]');
select tests.throws(format($$ select set_availability(%L, '[{"startsAt":"2026-11-21T16:00:00Z","endsAt":"2026-11-21T15:00:00Z"}]') $$, :'plid'), 'check', 'availability end must be after start');
select tests.as_user(:dave);
select tests.ok((select count(*) from plans where id = :'plid') = 0, 'outsiders cannot see plans');
select tests.ok((select count(*) from availability_slots) = 0, 'outsiders cannot see availability');
select tests.throws(format($$ select set_availability(%L, '[]') $$, :'plid'), 'not part of this plan', 'outsiders cannot add availability');
select tests.as_user(:carol);
select tests.ok((select count(*) from availability_slots where plan_id = :'plid') = 1, 'participants can see availability');

-- ---------------------------------------------------------------- private AI
select tests.as_user(:alice);
insert into ai_conversations (user_id, title) values (auth.uid(), 'weekend ideas') returning id as cid \gset
insert into ai_messages (conversation_id, user_id, role, content) values (:'cid', auth.uid(), 'user', 'ideas?');
select tests.as_user(:bob);
select tests.ok((select count(*) from ai_conversations) = 0 and (select count(*) from ai_messages) = 0, 'private AI chats are invisible to others');
select tests.throws(format($$ insert into ai_messages (conversation_id, user_id, role, content) values (%L, auth.uid(), 'user', 'x') $$, :'cid'), 'row-level security', 'cannot write into someone else''s AI chat');
select tests.ok((select count(*) from notifications where user_id = :alice) = 0, 'cannot read others'' notifications');

-- ---------------------------------------------------------------- blocking & leaving
select tests.as_user(:alice);
insert into blocks (blocker_id, blocked_id) values (auth.uid(), :bob);
select tests.ok(not are_friends(:alice, :bob), 'blocking removes the friendship');
select tests.as_user(:bob);
select tests.throws($$ select create_group('x', array['00000000-0000-0000-0000-00000000000a']::uuid[]) $$, 'only add friends', 'blocked users cannot add you to groups');
select tests.as_user(:alice);
select leave_group(:'gid');
select tests.as_user(:bob);
select tests.ok((select role from group_members where group_id = :'gid' and user_id = auth.uid()) = 'owner', 'ownership transfers when the owner leaves');

-- ---------------------------------------------------------------- account deletion
select tests.as_admin();
delete from auth.users where id = :carol;
select tests.ok(not exists (select 1 from profiles where id = :carol) and not exists (select 1 from group_members where user_id = :carol)
  and not exists (select 1 from poll_votes where user_id = :carol) and not exists (select 1 from messages where sender_id = :carol), 'deleting an account removes personal data');

\echo 'All RLS tests passed.'
