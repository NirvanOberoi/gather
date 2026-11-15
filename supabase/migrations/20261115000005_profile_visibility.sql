-- =============================================================================
-- Tighten profile visibility: "Findable by username = off" must also hide a profile from
-- direct API reads, not just from search. A profile is readable by:
--   yourself · friends · people you share a group or plan with · either side of a pending
--   friend request · anyone (signed in) if the owner is discoverable —
-- and never by someone the owner has blocked.
-- =============================================================================
create or replace function public.can_see_profile(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select target = auth.uid()
    or (
      not exists (select 1 from blocks b where b.blocker_id = target and b.blocked_id = auth.uid())
      and (
        coalesce((select discoverable from privacy_settings where user_id = target), false)
        or public.are_friends(auth.uid(), target)
        or exists (select 1 from blocks b where b.blocker_id = auth.uid() and b.blocked_id = target) -- your own block list
        or exists (select 1 from group_members a join group_members b on a.group_id = b.group_id where a.user_id = auth.uid() and b.user_id = target)
        or exists (select 1 from plan_participants a join plan_participants b on a.plan_id = b.plan_id where a.user_id = auth.uid() and b.user_id = target)
        or exists (select 1 from friend_requests r where r.status = 'pending' and ((r.sender_id = auth.uid() and r.receiver_id = target) or (r.sender_id = target and r.receiver_id = auth.uid())))
      )
    );
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (public.can_see_profile(id));
