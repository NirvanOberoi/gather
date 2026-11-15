/**
 * Basic content moderation, PII minimisation and AI usage limits.
 * Shared by the app (demo mode / pre-checks) and the edge functions (authoritative).
 */

export type ModerationResult = { allowed: true } | { allowed: false; reason: 'self_harm' | 'violence' | 'sexual_minors' | 'harassment' | 'drugs'; userMessage: string };

const PATTERNS: { reason: Exclude<ModerationResult, { allowed: true }>['reason']; re: RegExp; userMessage: string }[] = [
  {
    reason: 'self_harm',
    re: /\b(kill myself|suicide|self[- ]harm|end my life|want to die|hurt myself)\b/i,
    userMessage:
      'It sounds like you might be going through something really hard. You deserve support — in the US you can call or text 988 (Suicide & Crisis Lifeline), or contact local emergency services. Talking to someone you trust can help too.',
  },
  {
    reason: 'sexual_minors',
    re: /\b(nudes?|sext(ing)?|hook ?up with (a )?(minor|kid|teen))\b/i,
    userMessage: 'Gather can’t help with that. Let’s keep planning safe hangouts.',
  },
  {
    reason: 'violence',
    re: /\b(bring (a )?(gun|knife|weapon)|beat (him|her|them) up|jump (him|her|them)|shoot (up|someone))\b/i,
    userMessage: 'Gather can’t help plan anything that could hurt someone.',
  },
  {
    reason: 'drugs',
    re: /\b(buy (weed|coke|cocaine|molly|xanax|pills)|get (us )?(drunk|high) (underage|without id)|fake id)\b/i,
    userMessage: 'Gather can’t help with that, but I’m happy to find something fun for the group.',
  },
  {
    reason: 'harassment',
    re: /\b(kys|go die|retard(ed)?)\b/i,
    userMessage: 'Let’s keep it friendly — Gather won’t respond to harassment.',
  },
];

export function moderateText(text: string): ModerationResult {
  for (const p of PATTERNS) {
    if (p.re.test(text)) return { allowed: false, reason: p.reason, userMessage: p.userMessage };
  }
  return { allowed: true };
}

/**
 * Remove personal contact details and precise addresses before text is sent to an
 * AI provider. Planning doesn't need them.
 */
export function redactPII(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]')
    .replace(/\b\d{1,5}\s+([A-Z][a-z]+\s){1,3}(St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Dr|Drive|Ct|Court|Way)\b\.?/g, '[address]')
    .replace(/-?\d{1,3}\.\d{4,},\s*-?\d{1,3}\.\d{4,}/g, '[coordinates]');
}

export type Tier = 'free' | 'premium';

export interface RateLimitConfig {
  dailyLimit: Record<Tier, number>;
  /** Max requests in any rolling 60s window, regardless of tier. */
  burstPerMinute: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  dailyLimit: { free: 15, premium: 150 },
  burstPerMinute: 5,
};

export type RateLimitDecision =
  | { allowed: true; remainingToday: number }
  | { allowed: false; reason: 'daily_limit' | 'burst'; retryAfterSeconds: number; userMessage: string };

/** `recent` = timestamps (ms) of this user's AI requests in the last 24h. */
export function checkRateLimit(recent: number[], tier: Tier, now: number, cfg: RateLimitConfig = DEFAULT_RATE_LIMITS): RateLimitDecision {
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const today = recent.filter((t) => t > dayAgo && t <= now).sort((a, b) => a - b);
  const limit = cfg.dailyLimit[tier];
  if (today.length >= limit) {
    const oldest = today[today.length - limit];
    return {
      allowed: false,
      reason: 'daily_limit',
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + 24 * 60 * 60 * 1000 - now) / 1000)),
      userMessage:
        tier === 'free'
          ? `You’ve used all ${limit} Gather AI requests for today. They refresh over the next 24 hours — Gather Plus raises the limit.`
          : `You’ve reached today’s Gather AI limit (${limit}). It refreshes over the next 24 hours.`,
    };
  }
  const minuteAgo = now - 60 * 1000;
  const lastMinute = today.filter((t) => t > minuteAgo);
  if (lastMinute.length >= cfg.burstPerMinute) {
    return {
      allowed: false,
      reason: 'burst',
      retryAfterSeconds: Math.max(1, Math.ceil((lastMinute[0] + 60 * 1000 - now) / 1000)),
      userMessage: 'Whoa, that’s a lot of requests at once. Give Gather a few seconds and try again.',
    };
  }
  return { allowed: true, remainingToday: limit - today.length - 1 };
}

/** Planning-intent detector used for opt-in automatic suggestions. */
const PLANNING_RE =
  /\b(plans?|what (should|do) we do|wanna|want to|let'?s|hang ?out|this weekend|tonight|tomorrow|saturday|sunday|friday|free (after|at|on)|budget|\$\d+|go (to|out)|grab (food|dinner|lunch)|movie|bowling|down for|anyone (free|down))\b/i;

export function isPlanningMessage(text: string): boolean {
  return PLANNING_RE.test(text);
}

export interface AutoSuggestInput {
  groupOptedIn: boolean;
  lastAutoSuggestAt: number | null;
  /** Most recent messages, newest last. Only human messages. */
  recent: { authorId: string; text: string; at: number }[];
  /** Was the last AI message (of any kind) within the cooldown? */
  lastAiMessageAt: number | null;
  now: number;
}

export const AUTO_SUGGEST_COOLDOWN_MS = 2 * 60 * 60 * 1000;

/**
 * Automatic suggestions are OFF unless the group opts in. When on, Gather only chimes in
 * when ≥2 people have sent ≥3 planning messages in the last 20 minutes, and at most once
 * every 2 hours (also not right after someone already asked Gather).
 */
export function shouldAutoSuggest(i: AutoSuggestInput): boolean {
  if (!i.groupOptedIn) return false;
  if (i.lastAutoSuggestAt !== null && i.now - i.lastAutoSuggestAt < AUTO_SUGGEST_COOLDOWN_MS) return false;
  if (i.lastAiMessageAt !== null && i.now - i.lastAiMessageAt < 30 * 60 * 1000) return false;
  const window = i.recent.filter((m) => i.now - m.at <= 20 * 60 * 1000 && isPlanningMessage(m.text));
  const people = new Set(window.map((m) => m.authorId));
  return window.length >= 3 && people.size >= 2;
}

export function mentionsGather(text: string): boolean {
  return /(^|\s)@gather\b/i.test(text);
}
