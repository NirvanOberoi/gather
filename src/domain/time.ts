/**
 * Time-zone helpers built on Intl (works on Hermes, web and Node) — no extra deps.
 * All stored times are absolute UTC instants; a plan's IANA time zone is used only to
 * interpret user input ("Sat 3–8 PM") and to display results.
 */

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

/** Wall-clock fields of an instant in a zone. */
export function zonedParts(ms: number, tz: string) {
  const parts = partsFormatter(tz).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') };
}

/** Offset (ms) of `tz` from UTC at instant `ms`. Positive east of UTC. */
export function tzOffsetMs(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Convert a wall-clock date + minutes-after-midnight in `tz` to a UTC instant (DST-safe). */
export function zonedTimeToUtc(dateISO: string, minutes: number, tz: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0) + minutes * 60_000;
  let guess = naive - tzOffsetMs(naive, tz);
  // Re-evaluate once in case we crossed a DST boundary.
  const second = naive - tzOffsetMs(guess, tz);
  if (second !== guess) guess = second;
  return guess;
}

/**
 * A user's availability entry: "on <date>, from <start> to <end>" in the plan's zone.
 * If end <= start the range runs past midnight into the next day (e.g. 9 PM – 1 AM).
 */
export function localRangeToInterval(dateISO: string, startMin: number, endMin: number, tz: string): { start: number; end: number } {
  if (startMin < 0 || startMin >= 1440 || endMin < 0 || endMin > 1440) throw new Error('Times must be within a day');
  const start = zonedTimeToUtc(dateISO, startMin, tz);
  const endDayOffset = endMin <= startMin ? 1440 : 0;
  const end = zonedTimeToUtc(dateISO, endMin + endDayOffset, tz);
  if (end <= start) throw new Error('End must be after start');
  return { start, end };
}

export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function todayISOInZone(tz: string, now = Date.now()): string {
  const p = zonedParts(now, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function formatTime(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })
    .format(new Date(ms))
    .replace(':00', '');
}

export function formatDay(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ms));
}

export function formatDateTime(ms: number, tz: string): string {
  return `${formatDay(ms, tz)} · ${formatTime(ms, tz)}`;
}

export function formatRange(start: number, end: number, tz: string): string {
  const sameDay = formatDay(start, tz) === formatDay(end, tz);
  return sameDay
    ? `${formatDay(start, tz)}, ${formatTime(start, tz)} – ${formatTime(end, tz)}`
    : `${formatDay(start, tz)} ${formatTime(start, tz)} – ${formatDay(end, tz)} ${formatTime(end, tz)}`;
}

export function minutesLabel(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm ? `${h12}:${String(mm).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

/** "Today" / "Yesterday" / "Saturday, Nov 21" for chat day dividers. */
export function dayLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date(now).toDateString()) return 'Today';
  if (d.toDateString() === new Date(now - 86400_000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 45) return 'now';
  if (diff < 3600) return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  if (diff < 7 * 86400) return `${Math.round(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
