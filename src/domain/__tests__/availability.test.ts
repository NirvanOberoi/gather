import { describe, expect, it } from 'vitest';
import { bestWindows, computeOverlaps, summarizeBestWindow, type AvailabilityInterval } from '../availability';
import { localRangeToInterval, zonedTimeToUtc, formatTime } from '../time';

const TZ = 'America/Los_Angeles';
const day = '2026-11-21'; // a Saturday
const range = (userId: string, s: number, e: number, date = day, tz = TZ): AvailabilityInterval => ({ userId, ...localRangeToInterval(date, s * 60, e * 60, tz) });

describe('availability overlap', () => {
  it('finds the window where everyone is free (spec example)', () => {
    const slots = [range('a', 15, 20), range('b', 16, 21), range('c', 17, 19)];
    const best = bestWindows(slots);
    expect(best[0].count).toBe(3);
    expect(formatTime(best[0].start, TZ)).toBe('5 PM');
    expect(formatTime(best[0].end, TZ)).toBe('7 PM');
    expect(summarizeBestWindow(best, 3, TZ)).toMatch(/^Everyone is available Sat, Nov 21, 5 PM – 7 PM\.$/);
  });

  it('handles ranges that cross midnight', () => {
    const a = range('a', 21, 1); // 9 PM – 1 AM next day
    expect(a.end - a.start).toBe(4 * 3600_000);
    const b = range('b', 23, 2); // 11 PM – 2 AM
    const best = bestWindows([a, b]);
    expect(best[0].count).toBe(2);
    expect(best[0].end - best[0].start).toBe(2 * 3600_000);
    expect(formatTime(best[0].start, TZ)).toBe('11 PM');
    expect(formatTime(best[0].end, TZ)).toBe('1 AM');
  });

  it('uses the plan time zone, not the device zone', () => {
    const ny = range('a', 18, 20, day, 'America/New_York');
    const la = range('b', 15, 17, day, TZ); // 3–5 PM LA == 6–8 PM NY
    const best = bestWindows([ny, la]);
    expect(best[0].count).toBe(2);
    expect(best[0].end - best[0].start).toBe(2 * 3600_000);
  });

  it('is DST-safe (fall back day has 25 hours)', () => {
    const start = zonedTimeToUtc('2026-11-01', 0, TZ);
    const end = zonedTimeToUtc('2026-11-02', 0, TZ);
    expect(end - start).toBe(25 * 3600_000);
  });

  it('does not double count a user with overlapping entries', () => {
    const segs = computeOverlaps([range('a', 15, 18), range('a', 17, 20), range('b', 16, 17)]);
    expect(Math.max(...segs.map((s) => s.count))).toBe(2);
  });

  it('returns the best partial window when not everyone overlaps', () => {
    const best = bestWindows([range('a', 10, 12), range('b', 11, 13), range('c', 18, 20)]);
    expect(best[0].count).toBe(2);
    expect(summarizeBestWindow(best, 3, TZ)).toMatch(/^2 of 3 people/);
  });

  it('ignores windows shorter than the minimum duration', () => {
    const a: AvailabilityInterval = { userId: 'a', start: 0, end: 10 * 60_000 };
    const b: AvailabilityInterval = { userId: 'b', start: 5 * 60_000, end: 60 * 60_000 };
    expect(bestWindows([a, b]).every((w) => w.count === 1)).toBe(true);
  });

  it('rejects invalid ranges', () => {
    expect(() => localRangeToInterval(day, -5, 60, TZ)).toThrow();
    expect(bestWindows([])).toEqual([]);
  });
});
