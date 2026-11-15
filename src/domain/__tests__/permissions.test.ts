import { describe, expect, it } from 'vitest';
import {
  canAddToGroup, canClosePoll, canEditPlan, canPostMessage, canReadGroup, canSendFriendRequest,
  validateEmail, validatePassword, validateUsername,
} from '../permissions';

const friends: [string, string][] = [['a', 'b'], ['a', 'c']];

describe('friend requests', () => {
  const base = { senderId: 'a', receiverId: 'd', blocks: [], friendships: friends, receiverAllowsRequests: true, hasPendingBetween: false };
  it('allows a normal request', () => expect(canSendFriendRequest(base).ok).toBe(true));
  it('blocks self, duplicates, existing friends', () => {
    expect(canSendFriendRequest({ ...base, receiverId: 'a' }).ok).toBe(false);
    expect(canSendFriendRequest({ ...base, hasPendingBetween: true }).ok).toBe(false);
    expect(canSendFriendRequest({ ...base, receiverId: 'b' }).ok).toBe(false);
  });
  it('blocked users cannot send requests in either direction, without revealing the block', () => {
    const r1 = canSendFriendRequest({ ...base, blocks: [{ blockerId: 'd', blockedId: 'a' }] });
    const r2 = canSendFriendRequest({ ...base, receiverAllowsRequests: false });
    expect(r1).toEqual(r2);
    expect(canSendFriendRequest({ ...base, blocks: [{ blockerId: 'a', blockedId: 'd' }] }).ok).toBe(false);
  });
});

describe('group membership', () => {
  it('non-members cannot read or post', () => {
    expect(canReadGroup(null)).toBe(false);
    expect(canPostMessage(null, 'hi').ok).toBe(false);
    expect(canPostMessage('member', 'hi').ok).toBe(true);
    expect(canPostMessage('member', '   ').ok).toBe(false);
  });
  it('only friends can be added, never blocked users, never by non-members', () => {
    const base = { actorId: 'a', actorRole: 'member' as const, targetId: 'b', friendships: friends, blocks: [], alreadyMember: false };
    expect(canAddToGroup(base).ok).toBe(true);
    expect(canAddToGroup({ ...base, targetId: 'z' }).ok).toBe(false);
    expect(canAddToGroup({ ...base, actorRole: null }).ok).toBe(false);
    expect(canAddToGroup({ ...base, blocks: [{ blockerId: 'b', blockedId: 'a' }] }).ok).toBe(false);
    expect(canAddToGroup({ ...base, alreadyMember: true }).ok).toBe(false);
  });
  it('poll closing: creator or admin only', () => {
    expect(canClosePoll({ userId: 'a', pollCreatorId: 'a', role: 'member' }).ok).toBe(true);
    expect(canClosePoll({ userId: 'b', pollCreatorId: 'a', role: 'member' }).ok).toBe(false);
    expect(canClosePoll({ userId: 'b', pollCreatorId: 'a', role: 'admin' }).ok).toBe(true);
    expect(canClosePoll({ userId: 'b', pollCreatorId: 'a', role: null }).ok).toBe(false);
  });
  it('plan editing: organizer or group admin', () => {
    expect(canEditPlan({ userId: 'a', createdBy: 'a', groupRole: null, isParticipant: true }).ok).toBe(true);
    expect(canEditPlan({ userId: 'b', createdBy: 'a', groupRole: 'member', isParticipant: true }).ok).toBe(false);
    expect(canEditPlan({ userId: 'b', createdBy: 'a', groupRole: 'owner', isParticipant: false }).ok).toBe(true);
  });
});

describe('auth validation', () => {
  it('usernames', () => {
    expect(validateUsername('maya_k').ok).toBe(true);
    expect(validateUsername('Maya').ok).toBe(false);
    expect(validateUsername('ab').ok).toBe(false);
    expect(validateUsername('_maya').ok).toBe(false);
    expect(validateUsername('gather_team').ok).toBe(false);
  });
  it('passwords and emails', () => {
    expect(validatePassword('short1').ok).toBe(false);
    expect(validatePassword('longpassword').ok).toBe(false);
    expect(validatePassword('longpass1').ok).toBe(true);
    expect(validateEmail('a@b.co').ok).toBe(true);
    expect(validateEmail('nope').ok).toBe(false);
  });
});
