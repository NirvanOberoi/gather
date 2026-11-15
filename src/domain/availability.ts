/**
 * Availability matching: find the windows where the most people are free.
 * Works on absolute instants, so ranges that cross midnight or DST boundaries are exact.
 */
import { formatRange } from './time';

export interface AvailabilityInterval {
  userId: string;
  start: number; // ms epoch
  end: number; // ms epoch
}

export interface OverlapWindow {
  start: number;
  end: number;
  userIds: string[];
  count: number;
}

/** Merge each user's own overlapping/adjacent intervals so nobody is double counted. */
export function normalizeIntervals(intervals: AvailabilityInterval[]): AvailabilityInterval[] {
  const byUser = new Map<string, AvailabilityInterval[]>();
  for (const iv of intervals) {
    if (!(iv.end > iv.start)) continue;
    const list = byUser.get(iv.userId) ?? [];
    list.push({ ...iv });
    byUser.set(iv.userId, list);
  }
  const out: AvailabilityInterval[] = [];
  for (const [userId, list] of byUser) {
    list.sort((a, b) => a.start - b.start);
    let cur = list[0];
    for (let i = 1; i < list.length; i++) {
      const n = list[i];
      if (n.start <= cur.end) cur = { userId, start: cur.start, end: Math.max(cur.end, n.end) };
      else {
        out.push(cur);
        cur = n;
      }
    }
    out.push(cur);
  }
  return out;
}

/**
 * Sweep-line over all interval boundaries. Returns maximal consecutive segments with a
 * constant set of available people (segments with nobody are omitted).
 */
export function computeOverlaps(intervals: AvailabilityInterval[]): OverlapWindow[] {
  const norm = normalizeIntervals(intervals);
  const points = Array.from(new Set(norm.flatMap((i) => [i.start, i.end]))).sort((a, b) => a - b);
  const segments: OverlapWindow[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const s = points[i];
    const e = points[i + 1];
    const users = norm
      .filter((iv) => iv.start <= s && iv.end >= e)
      .map((iv) => iv.userId)
      .sort();
    if (users.length === 0) continue;
    const prev = segments[segments.length - 1];
    if (prev && prev.end === s && prev.userIds.join('|') === users.join('|')) prev.end = e;
    else segments.push({ start: s, end: e, userIds: users, count: users.length });
  }
  return segments;
}

/**
 * Best windows: most people first, then longest, then earliest. Windows shorter than
 * `minDurationMs` are dropped. Adjacent segments where a superset is free are also
 * considered via the "at least k people" expansion so a long window for k people
 * isn't split by someone briefly joining.
 */
export function bestWindows(
  intervals: AvailabilityInterval[],
  opts: { minDurationMs?: number; limit?: number } = {},
): OverlapWindow[] {
  const minDur = opts.minDurationMs ?? 30 * 60 * 1000;
  const segments = computeOverlaps(intervals);
  if (segments.length === 0) return [];
  const maxCount = Math.max(...segments.map((s) => s.count));
  const candidates: OverlapWindow[] = [];
  for (let k = maxCount; k >= 1; k--) {
    // Merge consecutive segments where at least k people are free, tracking who is free throughout.
    let run: OverlapWindow | null = null;
    for (const seg of segments) {
      if (seg.count >= k && run && run.end === seg.start) {
        const common: string[] = run.userIds.filter((u) => seg.userIds.includes(u));
        if (common.length >= k) {
          run = { start: run.start, end: seg.end, userIds: common, count: common.length };
          continue;
        }
      }
      if (run && run.end - run.start >= minDur) candidates.push(run);
      run = seg.count >= k ? { ...seg, userIds: [...seg.userIds] } : null;
    }
    if (run && run.end - run.start >= minDur) candidates.push(run);
  }
  // Dedupe identical windows, keep best per (start,end).
  const unique = new Map<string, OverlapWindow>();
  for (const c of candidates) {
    const key = `${c.start}-${c.end}`;
    const existing = unique.get(key);
    if (!existing || existing.count < c.count) unique.set(key, c);
  }
  return Array.from(unique.values())
    .sort((a, b) => b.count - a.count || b.end - b.start - (a.end - a.start) || a.start - b.start)
    .filter((w, i, arr) => !arr.slice(0, i).some((o) => o.count >= w.count && o.start <= w.start && o.end >= w.end))
    .slice(0, opts.limit ?? 5);
}

export function summarizeBestWindow(
  windows: OverlapWindow[],
  participantCount: number,
  tz: string,
): string {
  if (windows.length === 0) return 'No overlapping times yet — add availability to find a time.';
  const w = windows[0];
  const range = formatRange(w.start, w.end, tz);
  if (w.count >= participantCount && participantCount > 1) return `Everyone is available ${range}.`;
  return `${w.count} of ${participantCount} people are available ${range}.`;
}
