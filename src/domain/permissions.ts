/**
 * Authorization rules in one place. The demo backend enforces these directly; the live
 * backend enforces the same rules in Postgres RLS policies / SECURITY DEFINER functions
 * (see supabase/migrations). Keep both in sync — tests cover both sides.
 */

export type GroupRole = 'owner' | 'admin' | 'member';

export interface Block {
  blockerId: string;
  blockedId: string;
}

export function isBlockedEitherWay(blocks: Block[], a: string, b: string): boolean {
  return blocks.some((x) => (x.blockerId === a && x.blockedId === b) || (x.blockerId === b && x.blockedId === a));
}

export function areFriends(friendships: [string, string][], a: string, b: string): boolean {
  return friendships.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

export type Check = { ok: true } | { ok: false; error: string };
const ok: Check = { ok: true };
const no = (error: string): Check => ({ ok: false, error });

export function canSendFriendRequest(input: {
  senderId: string;
  receiverId: string;
  blocks: Block[];
  friendships: [string, string][];
  receiverAllowsRequests: boolean;
  hasPendingBetween: boolean;
}): Check {
  if (input.senderId === input.receiverId) return no('You can’t add yourself.');
  // Same message whether blocked or not accepting, so blocking isn't revealed.
  if (isBlockedEitherWay(input.blocks, input.senderId, input.receiverId) || !input.receiverAllowsRequests)
    return no('This person isn’t accepting friend requests.');
  if (areFriends(input.friendships, input.senderId, input.receiverId)) return no('You’re already friends.');
  if (input.hasPendingBetween) return no('There’s already a pending request.');
  return ok;
}

/** Members can only add their friends to a group, never someone with a block in either direction. */
export function canAddToGroup(input: {
  actorId: string;
  actorRole: GroupRole | null;
  targetId: string;
  friendships: [string, string][];
  blocks: Block[];
  alreadyMember: boolean;
}): Check {
  if (!input.actorRole) return no('You’re not a member of this group.');
  if (input.alreadyMember) return no('Already in the group.');
  if (isBlockedEitherWay(input.blocks, input.actorId, input.targetId)) return no('You can’t add this person.');
  if (!areFriends(input.friendships, input.actorId, input.targetId)) return no('You can only add friends to a group.');
  return ok;
}

export function canManageGroup(role: GroupRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

export function canReadGroup(role: GroupRole | null): boolean {
  return role !== null;
}

export function canPostMessage(role: GroupRole | null, body: string): Check {
  if (!role) return no('You’re not a member of this group.');
  const t = body.trim();
  if (!t) return no('Message is empty.');
  if (t.length > 4000) return no('Message is too long.');
  return ok;
}

export function canClosePoll(input: { userId: string; pollCreatorId: string; role: GroupRole | null }): Check {
  if (!input.role) return no('You’re not a member of this group.');
  if (input.userId === input.pollCreatorId || canManageGroup(input.role)) return ok;
  return no('Only the poll creator or a group admin can close this poll.');
}

/** Plan editing: the organizer, or a group admin when the plan belongs to a group. */
export function canEditPlan(input: { userId: string; createdBy: string; groupRole: GroupRole | null; isParticipant: boolean }): Check {
  if (input.userId === input.createdBy) return ok;
  if (input.groupRole && canManageGroup(input.groupRole)) return ok;
  return no(input.isParticipant ? 'Only the organizer can edit this plan.' : 'You’re not part of this plan.');
}

export function canViewPlan(input: { isParticipant: boolean; groupRole: GroupRole | null }): boolean {
  return input.isParticipant || input.groupRole !== null;
}

export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
export function validateUsername(u: string): Check {
  if (!USERNAME_RE.test(u)) return no('3–20 characters: lowercase letters, numbers, _ or .');
  if (/^[._]|[._]$/.test(u)) return no('Can’t start or end with . or _');
  if (/(gather|admin|support|official)/.test(u)) return no('That username is reserved.');
  return ok;
}

export function validatePassword(p: string): Check {
  if (p.length < 8) return no('Use at least 8 characters.');
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return no('Include at least one letter and one number.');
  return ok;
}

export function validateEmail(e: string): Check {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim()) ? ok : no('Enter a valid email address.');
}
