import { describe, expect, it } from 'vitest';
import { applyVote, determineWinner, resolveClose, tally, validateVote, visibleVoters } from '../voting';

const poll = { status: 'open' as const, allowMultiple: false, optionIds: ['o1', 'o2', 'o3'] };

describe('voting', () => {
  it('rejects non-members, closed polls and unknown options', () => {
    expect(validateVote(poll, ['o1'], false).ok).toBe(false);
    expect(validateVote({ ...poll, status: 'closed' }, ['o1'], true).ok).toBe(false);
    expect(validateVote(poll, ['nope'], true).ok).toBe(false);
  });
  it('enforces single choice unless multiple allowed', () => {
    expect(validateVote(poll, ['o1', 'o2'], true).ok).toBe(false);
    const multi = validateVote({ ...poll, allowMultiple: true }, ['o1', 'o2', 'o1'], true);
    expect(multi).toEqual({ ok: true, optionIds: ['o1', 'o2'] });
  });
  it('changing a vote replaces only that user’s ballot', () => {
    let votes = applyVote([], 'u1', ['o1']);
    votes = applyVote(votes, 'u2', ['o1']);
    votes = applyVote(votes, 'u1', ['o2']);
    expect(votes).toEqual([{ optionId: 'o1', userId: 'u2' }, { optionId: 'o2', userId: 'u1' }]);
    expect(applyVote(votes, 'u1', [])).toEqual([{ optionId: 'o1', userId: 'u2' }]);
  });
  it('tallies voters and shares', () => {
    const { rows, totalVoters } = tally(['o1', 'o2', 'o3'], [
      { optionId: 'o1', userId: 'a' }, { optionId: 'o1', userId: 'b' }, { optionId: 'o2', userId: 'c' },
    ]);
    expect(totalVoters).toBe(3);
    expect(rows.find((r) => r.optionId === 'o1')!.share).toBeCloseTo(2 / 3);
    expect(determineWinner(rows)).toEqual({ status: 'winner', optionId: 'o1' });
  });
  it('detects ties and requires a pick to close', () => {
    const { rows } = tally(['o1', 'o2'], [{ optionId: 'o1', userId: 'a' }, { optionId: 'o2', userId: 'b' }]);
    expect(determineWinner(rows).status).toBe('tie');
    expect(resolveClose(rows, null).ok).toBe(false);
    expect(resolveClose(rows, 'o2')).toEqual({ ok: true, winnerId: 'o2' });
    expect(resolveClose(rows, 'zzz').ok).toBe(false);
  });
  it('no votes closes with no winner', () => {
    const { rows } = tally(['o1'], []);
    expect(resolveClose(rows, null)).toEqual({ ok: true, winnerId: null });
  });
  it('hides voter identities per privacy setting but always shows the viewer', () => {
    const r = visibleVoters(['me', 'a', 'b'], (id) => id === 'a', 'me');
    expect(r).toEqual({ shown: ['me', 'a'], hiddenCount: 1 });
  });
});
