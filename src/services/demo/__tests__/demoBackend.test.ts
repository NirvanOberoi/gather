import { beforeEach, describe, expect, it } from 'vitest';
import { DemoBackend, type KeyValueStorage } from '../DemoBackend';
import { localRangeToInterval } from '@/domain/time';
import { nextSaturdayISO } from '../seed';

class MemoryStorage implements KeyValueStorage {
  m = new Map<string, string>();
  async getItem(k: string) { return this.m.get(k) ?? null; }
  async setItem(k: string, v: string) { this.m.set(k, v); }
  async removeItem(k: string) { this.m.delete(k); }
}

let be: DemoBackend;
beforeEach(async () => {
  be = new DemoBackend(new MemoryStorage(), { simulate: false, latencyMs: 0 });
  await be.auth.signIn('', '');
});

describe('demo backend: end-to-end planning flow', () => {
  it('sign in → profile → AI → poll → vote → close → plan → availability → confirm', async () => {
    await be.profiles.update({ username: 'alex', displayName: 'Alex', onboardedAt: new Date().toISOString() });
    expect((await be.profiles.me()).username).toBe('alex');

    const groups = await be.groups.list();
    const weekend = groups.find((g) => g.name === 'Weekend Plans')!;
    expect(weekend.memberCount).toBe(6);

    const aiMsg = (await be.ai.planForGroup(weekend.id, { trigger: 'button' }))!;
    expect(aiMsg.kind).toBe('ai');
    if (aiMsg.payload?.type !== 'ai') throw new Error('bad payload');
    const recs = aiMsg.payload.response.recommendations;
    expect(recs.length).toBeGreaterThanOrEqual(3);
    // Sam shares nothing with AI → unknown, and the response says so
    expect(aiMsg.payload.response.message).toMatch(/(hasn’t|haven’t) shared preferences/);

    const poll = await be.polls.create(weekend.id, {
      question: 'What should we do Saturday?', allowMultiple: false,
      options: recs.slice(0, 3).map((r) => ({ label: r.title, recommendation: r })),
    });
    await be.polls.vote(poll.id, [poll.options[0].id]);
    await be.polls.vote(poll.id, [poll.options[1].id]); // change vote
    let p = await be.polls.get(poll.id);
    expect(p.votes.filter((v) => v.userId === 'u_me')).toEqual([{ pollId: poll.id, optionId: poll.options[1].id, userId: 'u_me' }]);
    await expect(be.polls.vote(poll.id, [poll.options[0].id, poll.options[1].id])).rejects.toThrow(/one choice/);

    p = await be.polls.close(poll.id, null);
    expect(p.winningOptionId).toBe(poll.options[1].id);
    await expect(be.polls.vote(poll.id, [poll.options[0].id])).rejects.toThrow(/closed/);

    const plan = await be.plans.createFromPoll(poll.id, { timezone: 'America/Los_Angeles' });
    expect(plan.place?.title).toBe(poll.options[1].label);
    expect(plan.participants.length).toBe(6);
    expect((await be.plans.createFromPoll(poll.id, { timezone: 'UTC' })).id).toBe(plan.id); // idempotent

    const sat = nextSaturdayISO('America/Los_Angeles');
    const iv = localRangeToInterval(sat, 17 * 60, 19 * 60, 'America/Los_Angeles');
    await be.availability.setMine(plan.id, [{ startsAt: new Date(iv.start).toISOString(), endsAt: new Date(iv.end).toISOString() }]);
    expect((await be.availability.list(plan.id)).filter((a) => a.userId === 'u_me')).toHaveLength(1);

    await expect(be.plans.update(plan.id, { status: 'confirmed' })).rejects.toThrow(/Pick a time/);
    const confirmed = await be.plans.update(plan.id, { startsAt: new Date(iv.start).toISOString(), endsAt: new Date(iv.end).toISOString(), status: 'confirmed' });
    expect(confirmed.status).toBe('confirmed');
    expect((await be.plans.list()).some((x) => x.id === plan.id && x.status === 'confirmed')).toBe(true);
  });

  it('private assistant → save → share into a group', async () => {
    const { conversationId, messages } = await be.ai.sendPrivate(null, 'Find activities for five friends under $25 each');
    expect(messages[1].response?.recommendations.length).toBeGreaterThan(0);
    const rec = messages[1].response!.recommendations[0];
    const saved = await be.saved.save(rec);
    expect((await be.saved.list())[0].id).toBe(saved.id);
    expect((await be.saved.save(rec)).id).toBe(saved.id); // no duplicates
    const g = (await be.groups.list())[0];
    const m = await be.messages.send(g.id, { body: rec.title, clientId: 'c1', kind: 'share', payload: { type: 'share', recommendation: rec } });
    expect(m.kind).toBe('share');
    expect((await be.ai.conversations()).map((c) => c.id)).toContain(conversationId);
    await be.ai.deleteAllPrivate();
    expect(await be.ai.conversations()).toHaveLength(0);
  });

  it('moderation blocks harmful prompts', async () => {
    const g = (await be.groups.list())[0];
    await expect(be.ai.planForGroup(g.id, { prompt: 'where to buy weed', trigger: 'mention' })).rejects.toThrow();
    const r = await be.ai.sendPrivate(null, 'I want to kill myself');
    expect(r.messages[1].content).toMatch(/988/);
  });
});

describe('demo backend: privacy & persistence', () => {
  it('hides voter identities of people who opted out (mirrors get_poll in SQL)', async () => {
    const g = (await be.groups.list()).find((x) => x.name === 'Weekend Plans')!;
    const poll = await be.polls.create(g.id, { question: 'Q?', allowMultiple: false, options: [{ label: 'A' }, { label: 'B' }] });
    const db = be._debugDb()!;
    db.votes.push({ pollId: poll.id, optionId: poll.options[0].id, userId: 'u_priya' }, { pollId: poll.id, optionId: poll.options[0].id, userId: 'u_maya' });
    const p = await be.polls.get(poll.id);
    const ids = p.votes.map((v) => v.userId);
    expect(ids).toContain('u_maya');
    expect(ids).not.toContain('u_priya');
    expect(p.votes.filter((v) => v.optionId === poll.options[0].id)).toHaveLength(2); // still counted
  });

  it('persists changes so a fresh app launch sees them', async () => {
    const storage = new MemoryStorage();
    const a = new DemoBackend(storage, { simulate: false, latencyMs: 0 });
    await a.auth.signIn('', '');
    const { messages } = await a.ai.sendPrivate(null, 'fun things this weekend');
    await a.saved.save(messages[1].response!.recommendations[0]);
    a.flush();
    const b = new DemoBackend(storage, { simulate: false, latencyMs: 0 });
    expect(await b.auth.getSession()).not.toBeNull();
    expect(await b.saved.list()).toHaveLength(1);
  });
});

describe('demo backend: authorization', () => {
  it('denies reading and posting in groups you are not in', async () => {
    const db = be._debugDb()!;
    db.groups.push({ id: 'g_secret', name: 'Secret', photoUrl: null, createdBy: 'u_ava', aiAutoSuggest: false, createdAt: '', lastAutoSuggestAt: null });
    db.members.push({ groupId: 'g_secret', userId: 'u_ava', role: 'owner', muted: false, aiSharePrefs: true, joinedAt: '', lastReadAt: '' });
    await expect(be.messages.list('g_secret')).rejects.toThrow(/not a member/);
    await expect(be.messages.send('g_secret', { body: 'hi', clientId: 'x' })).rejects.toThrow(/not a member/);
    await expect(be.groups.get('g_secret')).rejects.toThrow();
    await expect(be.ai.planForGroup('g_secret', { trigger: 'button' })).rejects.toThrow();
  });

  it('only friends can be added to groups; blocked users cannot be requested', async () => {
    await expect(be.groups.create({ name: 'x', memberIds: ['u_ava'] })).rejects.toThrow(/only add friends/);
    await be.friends.block('u_maya');
    expect((await be.friends.list()).map((f) => f.id)).not.toContain('u_maya');
    await expect(be.friends.send('u_maya')).rejects.toThrow(/isn’t accepting/);
    await expect(be.groups.create({ name: 'x', memberIds: ['u_maya'] })).rejects.toThrow();
  });

  it('non-admins cannot change group settings; poll close needs creator/admin', async () => {
    const study = (await be.groups.list()).find((g) => g.name === 'Study Squad')!;
    await expect(be.groups.update(study.id, { name: 'Hacked' })).rejects.toThrow(/admins/);
    await expect(be.polls.close('p_study', null)).rejects.toThrow(/creator or a group admin/);
  });

  it('friends only see preference categories that were shared with friends', async () => {
    const jordan = await be.profiles.visiblePreferences('u_jordan');
    expect(jordan.activities).toBeDefined();
    expect(jordan.budget).toBeUndefined();
    expect(await be.profiles.visiblePreferences('u_ava')).toEqual({}); // not a friend
  });

  it('enforces the free AI daily limit', async () => {
    const db = be._debugDb()!;
    db.aiUsage = Array.from({ length: 15 }, (_, i) => Date.now() - 3600_000 + i);
    const g = (await be.groups.list())[0];
    await expect(be.ai.planForGroup(g.id, { trigger: 'button' })).rejects.toThrow(/used all 15/);
  });

  it('sign out and account deletion clear the session', async () => {
    await be.auth.deleteAccount();
    expect(await be.auth.getSession()).toBeNull();
    await expect(be.groups.list()).rejects.toThrow(/signed out/);
  });
});
