/**
 * Heuristic constraint extraction from a planning conversation. Used by the offline
 * demo planner, and to show "what Gather picked up" chips. The live AI does its own
 * (better) extraction server-side.
 */
import type { Category, Constraints } from '@shared/recommendation.ts';

export interface ChatLine {
  authorId: string;
  authorName: string;
  text: string;
}

export interface Signal {
  kind: 'budget' | 'interest' | 'nearby' | 'time' | 'avoid' | 'size';
  label: string;
  authorName: string;
}

const INTEREST_KEYWORDS: { category: Category; label: string; re: RegExp }[] = [
  { category: 'food', label: 'food', re: /\b(food|eat|hungry|dinner|lunch|brunch|tacos?|pizza|burgers?|sushi|ramen|boba|dessert|ice cream|restaurant|snacks?)\b/i },
  { category: 'sports', label: 'something active', re: /\b(active|sports?|bowling|climb(ing)?|bouldering|basketball|soccer|skate|skating|trampoline|gym|run|swim|tennis|pickleball|laser tag|mini golf|go[- ]?karts?)\b/i },
  { category: 'entertainment', label: 'entertainment', re: /\b(movies?|film|cinema|concert|show|comedy|escape room|theater)\b/i },
  { category: 'outdoors', label: 'outdoors', re: /\b(outside|outdoors?|hike|hiking|park|beach|trail|picnic|lake|bike)\b/i },
  { category: 'shopping', label: 'shopping', re: /\b(shop(ping)?|mall|thrift(ing)?|market)\b/i },
  { category: 'cafe', label: 'coffee / cafe', re: /\b(coffee|cafe|café|matcha|tea|study spot)\b/i },
  { category: 'games', label: 'games', re: /\b(arcade|games?|gaming|board games?|karaoke|vr)\b/i },
  { category: 'arts', label: 'arts', re: /\b(museum|art|gallery|pottery|paint(ing)?|craft)\b/i },
  { category: 'free', label: 'free stuff', re: /\b(free stuff|something free|no money|broke)\b/i },
];

const SIZE_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const WORD_NUM: Record<string, number> = { five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50 };

export function extractBudget(text: string): number | null {
  const t = text.toLowerCase();
  if (/\b(broke|no money|free stuff|something free|can'?t spend)\b/.test(t)) return 0;
  const m =
    t.match(/(?:under|below|less than|max|no more than|more than|up to|cap(?:ped)? at|budget(?: is| of)?|around|like)\s*\$?\s*(\d{1,3})/) ??
    t.match(/\$\s*(\d{1,3})/) ??
    t.match(/(\d{1,3})\s*(?:bucks|dollars)/);
  if (m) return Number(m[1]);
  const w = t.match(/(?:under|less than|max|more than|up to)\s+(five|ten|fifteen|twenty|thirty|forty|fifty)/);
  if (w) return WORD_NUM[w[1]];
  if (/\b(cheap|affordable|not expensive|budget)\b/.test(t)) return 20;
  return null;
}

export function extractTime(text: string): string | null {
  const t = text.toLowerCase();
  const after = t.match(/(?:free|available|out|off|done)?\s*(?:after|from|at|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  const day = t.match(/\b(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this weekend|weekend)\b/);
  const parts: string[] = [];
  if (day) parts.push(day[1]);
  if (after && /(after|free|available|from)/.test(t)) {
    const h = after[1];
    const mm = after[2] ? `:${after[2]}` : '';
    const suffix = after[3] ?? (Number(h) <= 11 && Number(h) >= 1 ? 'pm' : '');
    parts.push(`after ${h}${mm}${suffix ? ' ' + suffix.toUpperCase() : ''}`);
  }
  return parts.length ? parts.join(', ') : null;
}

export function extractSignals(lines: ChatLine[]): { signals: Signal[]; constraints: Constraints } {
  const signals: Signal[] = [];
  let budget: number | null = null;
  const times: string[] = [];
  const interests = new Set<string>();
  const avoid = new Set<string>();
  let nearby = false;
  let groupSize: number | null = null;
  let area: string | null = null;

  for (const line of lines) {
    const text = line.text;
    const b = extractBudget(text);
    if (b !== null) {
      budget = budget === null ? b : Math.min(budget, b);
      signals.push({ kind: 'budget', label: b === 0 ? 'free' : `≤ $${b}`, authorName: line.authorName });
    }
    for (const k of INTEREST_KEYWORDS) {
      const m = k.re.exec(text);
      if (!m) continue;
      // Negated if a negation word appears within the ~30 chars before the keyword.
      const before = text.slice(Math.max(0, m.index - 30), m.index);
      const isNegated = /\b(not|no|don'?t|do not|hate|skip|anything but|rather not|tired of)\b/i.test(before);
      if (isNegated) {
        avoid.add(k.label);
        signals.push({ kind: 'avoid', label: `no ${k.label}`, authorName: line.authorName });
      } else {
        interests.add(k.category);
        signals.push({ kind: 'interest', label: k.label, authorName: line.authorName });
      }
    }
    if (/\b(nearby|close by|close to|near (me|us|here)|walking distance|not far|local|around here|close)\b/i.test(text)) {
      nearby = true;
      signals.push({ kind: 'nearby', label: 'nearby', authorName: line.authorName });
    }
    const t = extractTime(text);
    if (t) {
      times.push(t);
      signals.push({ kind: 'time', label: t, authorName: line.authorName });
    }
    const size = text.match(/\b(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|twelve) (?:people|friends|of us)\b/i);
    if (size) {
      groupSize = /^\d+$/.test(size[1]) ? Number(size[1]) : SIZE_WORDS[size[1].toLowerCase()];
      signals.push({ kind: 'size', label: `${groupSize} people`, authorName: line.authorName });
    }
    const inArea = text.match(/\bin ([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?)\b/);
    if (inArea) area = inArea[1];
  }

  return {
    signals,
    constraints: {
      budgetMaxPerPerson: budget,
      timeWindow: times.length ? Array.from(new Set(times)).join('; ') : null,
      area,
      groupSize,
      interests: Array.from(interests),
      avoid: Array.from(avoid),
      nearbyOnly: nearby,
    },
  };
}
