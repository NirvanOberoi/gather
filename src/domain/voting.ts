/** Poll voting rules. Mirrored server-side by the `cast_vote` / `close_poll` SQL functions. */

export interface PollRules {
  status: 'open' | 'closed';
  allowMultiple: boolean;
  optionIds: string[];
}

export interface Vote {
  optionId: string;
  userId: string;
}

export type VoteValidation = { ok: true; optionIds: string[] } | { ok: false; error: string };

export function validateVote(poll: PollRules, optionIds: string[], isMember: boolean): VoteValidation {
  if (!isMember) return { ok: false, error: 'Only group members can vote.' };
  if (poll.status !== 'open') return { ok: false, error: 'This poll is closed.' };
  const unique = Array.from(new Set(optionIds));
  if (unique.some((id) => !poll.optionIds.includes(id))) return { ok: false, error: 'That option isn’t part of this poll.' };
  if (!poll.allowMultiple && unique.length > 1) return { ok: false, error: 'This poll allows one choice.' };
  return { ok: true, optionIds: unique };
}

/** Replace a user's ballot (empty array = retract vote). Other users' votes are untouched. */
export function applyVote(votes: Vote[], userId: string, optionIds: string[]): Vote[] {
  return [...votes.filter((v) => v.userId !== userId), ...optionIds.map((optionId) => ({ optionId, userId }))];
}

export interface TallyRow {
  optionId: string;
  count: number;
  voterIds: string[];
  /** Fraction of voters (not votes) who picked this option, 0..1 */
  share: number;
}

export function tally(optionIds: string[], votes: Vote[]): { rows: TallyRow[]; totalVoters: number } {
  const voters = new Set(votes.filter((v) => optionIds.includes(v.optionId)).map((v) => v.userId));
  const totalVoters = voters.size;
  const rows = optionIds.map((optionId) => {
    const voterIds = Array.from(new Set(votes.filter((v) => v.optionId === optionId).map((v) => v.userId)));
    return { optionId, count: voterIds.length, voterIds, share: totalVoters ? voterIds.length / totalVoters : 0 };
  });
  return { rows, totalVoters };
}

export type WinnerResult = { status: 'winner'; optionId: string } | { status: 'tie'; optionIds: string[] } | { status: 'no_votes' };

export function determineWinner(rows: TallyRow[]): WinnerResult {
  const max = Math.max(0, ...rows.map((r) => r.count));
  if (max === 0) return { status: 'no_votes' };
  const top = rows.filter((r) => r.count === max).map((r) => r.optionId);
  return top.length === 1 ? { status: 'winner', optionId: top[0] } : { status: 'tie', optionIds: top };
}

/**
 * Resolve the final choice when closing: an explicit pick (must be one of the top options
 * when there's a tie, or any option if the closer overrides) else the unique winner.
 */
export function resolveClose(rows: TallyRow[], chosen: string | null): { ok: true; winnerId: string | null } | { ok: false; error: string } {
  const result = determineWinner(rows);
  if (chosen) {
    if (!rows.some((r) => r.optionId === chosen)) return { ok: false, error: 'Unknown option.' };
    return { ok: true, winnerId: chosen };
  }
  if (result.status === 'winner') return { ok: true, winnerId: result.optionId };
  if (result.status === 'tie') return { ok: false, error: 'It’s a tie — pick the final option to close the poll.' };
  return { ok: true, winnerId: null };
}

/** Hide identities of voters who chose not to show who they voted for. */
export function visibleVoters(voterIds: string[], showIdentity: (userId: string) => boolean, viewerId: string): { shown: string[]; hiddenCount: number } {
  const shown = voterIds.filter((id) => id === viewerId || showIdentity(id));
  return { shown, hiddenCount: voterIds.length - shown.length };
}
