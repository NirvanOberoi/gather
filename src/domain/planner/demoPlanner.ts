/**
 * Deterministic, offline planner used in DEMO MODE ONLY.
 *
 * It mimics the live Gather AI pipeline (constraints → authorized preferences → rank →
 * explain → structured response) against the clearly-labelled sample catalog, and its
 * output is validated with the same schema the live AI uses. Responses are marked
 * `generatedBy: 'demo_planner'` and carry a data notice so they're never mistaken for live data.
 */
import {
  BUDGET_MAX,
  type GroupPreferenceSummary,
  type Preferences,
} from '@shared/preferences.ts';
import {
  PlanResponseSchema,
  placeToRecommendation,
  type Category,
  type Constraints,
  type PlanResponse,
  type PlaceResult,
} from '@shared/recommendation.ts';
import { extractSignals, type ChatLine, type Signal } from './extract';

export interface RankablePlace extends PlaceResult {
  tags: string[];
  distanceKm: number;
  goodForGroups: boolean;
  indoor: boolean;
}

const PRICE_MAX: Record<number, number> = { 0: 0, 1: 15, 2: 30, 3: 50, 4: 80 };
const PRICE_MIN: Record<number, number> = { 0: 0, 1: 0, 2: 15, 3: 30, 4: 50 };

const ACTIVE_CATS: Category[] = ['sports', 'outdoors', 'games'];

interface Scored {
  place: RankablePlace;
  score: number;
  reasons: string[];
  tradeoffs: string[];
}

export function scorePlace(place: RankablePlace, c: Constraints, s: GroupPreferenceSummary | null, opts: { rainy?: boolean } = {}): Scored {
  let score = (place.rating ?? 3.5) / 5; // 0..1 base
  const reasons: string[] = [];
  const tradeoffs: string[] = [];

  // Interests
  const wanted = new Set(c.interests);
  if (s) for (const [k] of Object.entries(s.interests).sort((a, b) => b[1] - a[1]).slice(0, 4)) wanted.add(mapInterest(k));
  if (wanted.has(place.category)) {
    score += 2;
    reasons.push(interestReason(place.category));
  } else if (wanted.has('sports') && place.tags.includes('active')) {
    score += 1.6;
    reasons.push('gets everyone moving');
  } else if (wanted.size > 0) {
    score -= 0.5;
  }

  // Avoid list
  const avoidHit = c.avoid.find((a) => place.tags.some((t) => a.includes(t)) || a.includes(place.category));
  if (avoidHit) {
    score -= 3;
    tradeoffs.push(`someone said ${avoidHit}`);
  }
  if (s) {
    const disliked = Object.keys(s.dislikes).find((d) => place.tags.includes(d) || d.includes(place.category));
    if (disliked) {
      score -= 1.5;
      tradeoffs.push(`at least one person would rather skip ${disliked}`);
    }
  }

  // Budget: use the lowest ceiling from chat or shared prefs
  const budget = minNullable(c.budgetMaxPerPerson, s?.budgetCeiling ?? null);
  if (budget !== null && place.priceLevel !== null) {
    if (PRICE_MAX[place.priceLevel] <= budget) {
      score += 1.2;
      reasons.push(place.priceLevel === 0 ? 'free' : `fits the ~$${budget} budget`);
    } else if (PRICE_MIN[place.priceLevel] <= budget) {
      score += 0.2;
      tradeoffs.push(`could run over $${budget} for some people`);
    } else {
      score -= 2;
      tradeoffs.push(`likely over the $${budget} budget`);
    }
  }

  // Distance
  const maxKm = c.nearbyOnly ? 3 : (s?.maxDistanceKm ?? null);
  if (maxKm !== null) {
    if (place.distanceKm <= maxKm) {
      score += 1;
      reasons.push(`close by (${place.distanceKm} km)`);
    } else {
      score -= 1.2;
      tradeoffs.push(`a bit farther (${place.distanceKm} km)`);
    }
  }

  if ((c.groupSize ?? s?.memberCount ?? 0) >= 4 && place.goodForGroups) score += 0.4;
  if (opts.rainy && !place.indoor) {
    score -= 3;
    tradeoffs.push('outdoors — not great in rain');
  } else if (opts.rainy) {
    score += 0.5;
    reasons.push('indoors');
  }
  if (s?.accessibility.length && !place.indoor) tradeoffs.push('check accessibility before going');
  return { place, score, reasons, tradeoffs };
}

function mapInterest(k: string): Category {
  const map: Record<string, Category> = {
    sports: 'sports', bowling: 'sports', climbing: 'sports', active: 'sports',
    movies: 'entertainment', entertainment: 'entertainment', concerts: 'entertainment',
    outdoors: 'outdoors', hiking: 'outdoors', parks: 'outdoors',
    shopping: 'shopping', thrifting: 'shopping',
    gaming: 'games', arcades: 'games', games: 'games', karaoke: 'games',
    cafes: 'cafe', coffee: 'cafe', boba: 'cafe',
    restaurants: 'food', food: 'food', 'trying new food': 'food',
    art: 'arts', museums: 'arts', arts: 'arts',
    'exploring new places': 'outdoors',
  };
  return map[k] ?? 'other';
}

function interestReason(c: Category): string {
  switch (c) {
    case 'food': return 'covers the food craving';
    case 'sports': return 'something active';
    case 'entertainment': return 'easy group entertainment';
    case 'outdoors': return 'gets everyone outside';
    case 'shopping': return 'good for browsing together';
    case 'cafe': return 'chill spot to hang';
    case 'games': return 'games everyone can join';
    case 'arts': return 'something creative';
    case 'free': return 'costs nothing';
    default: return 'matches what people mentioned';
  }
}

function minNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

let counter = 0;
const makeId = () => `rec_${Date.now().toString(36)}_${(counter++).toString(36)}`;

const DEMO_NOTICE = 'Demo mode: these are SAMPLE places, not real businesses or live prices.';

function toResponse(
  scored: Scored[],
  c: Constraints,
  message: string,
  questions: string[],
): PlanResponse {
  const recs = scored.map((x) =>
    placeToRecommendation(x.place, {
      id: makeId(),
      whyItFits: x.reasons.length ? capitalize(Array.from(new Set(x.reasons)).slice(0, 3).join(', ')) + '.' : 'A solid all-round option for the group.',
      tradeoffs: x.tradeoffs.length ? capitalize(Array.from(new Set(x.tradeoffs)).join('; ')) + '.' : null,
    }),
  );
  return PlanResponseSchema.parse({
    kind: recs.length ? 'recommendations' : questions.length ? 'clarifying_question' : 'message',
    message,
    constraints: c,
    recommendations: recs,
    clarifyingQuestions: questions,
    dataNotice: recs.length ? DEMO_NOTICE : null,
    generatedBy: 'demo_planner',
  });
}

/** Pick up to `n` places, preferring variety; requested interests get the first slots round-robin. */
function pickDiverse(scored: Scored[], n: number, lead: Category[] = []): Scored[] {
  const sorted = [...scored].filter((x) => x.score > 0.5).sort((a, b) => b.score - a.score);
  const out: Scored[] = [];
  const matches = (x: Scored, c: Category) => x.place.category === c || (c === 'sports' && x.place.tags.includes('active'));
  for (const c of lead) {
    const best = sorted.find((x) => matches(x, c) && !out.includes(x));
    if (best) out.push(best);
  }
  const perCat = new Map<string, number>();
  for (const x of out) perCat.set(x.place.category, (perCat.get(x.place.category) ?? 0) + 1);
  for (const x of sorted) {
    if (out.length >= n) break;
    if (out.includes(x)) continue;
    const used = perCat.get(x.place.category) ?? 0;
    if (used >= 2) continue;
    out.push(x);
    perCat.set(x.place.category, used + 1);
    if (out.length >= n) break;
  }
  return out;
}

export interface GroupPlanInput {
  lines: ChatLine[];
  summary: GroupPreferenceSummary | null;
  places: RankablePlace[];
  prompt?: string;
}

export function planForGroup(input: GroupPlanInput): { response: PlanResponse; signals: Signal[] } {
  const all = input.prompt ? [...input.lines, { authorId: 'prompt', authorName: 'request', text: input.prompt }] : input.lines;
  const { signals, constraints } = extractSignals(all);
  const c: Constraints = { ...constraints, groupSize: constraints.groupSize ?? input.summary?.memberCount ?? null };
  const s = input.summary;

  const haveInterests = c.interests.length > 0 || (s && Object.keys(s.interests).length > 0);
  const haveBudget = c.budgetMaxPerPerson !== null || (s?.budgetCeiling ?? null) !== null;
  const haveTime = c.timeWindow !== null;

  const questions: string[] = [];
  if (!haveBudget) questions.push('What’s everyone’s budget per person?');
  if (!haveTime) questions.push('What day and time works best?');
  if (!c.nearbyOnly && (s?.maxDistanceKm ?? null) === null) questions.push('How far is everyone willing to travel?');

  if (!haveInterests && !haveBudget) {
    return {
      signals,
      response: toResponse(
        [],
        c,
        'I’d love to help! I don’t have enough to go on yet — tell me a bit about what you’re in the mood for and I’ll pull together options.',
        ['What kind of thing are you all in the mood for — food, something active, a movie…?', ...questions].slice(0, 3),
      ),
    };
  }

  const rainy = /\b(rain|raining|rainy|indoors?|inside)\b/i.test(all.map((l) => l.text).join(' '));
  const scored = input.places.map((p) => scorePlace(p, c, s, { rainy }));
  // Lead with what people explicitly asked for (active first when both, since food pairs with anything).
  const lead = [...c.interests].sort((a, b) => (ACTIVE_CATS.includes(b as Category) ? 1 : 0) - (ACTIVE_CATS.includes(a as Category) ? 1 : 0)) as Category[];
  const picks = pickDiverse(scored, 5, lead);

  // Headline: summarise what we heard (from public chat only) + a combo idea.
  const heard: string[] = [];
  const budget = minNullable(c.budgetMaxPerPerson, s?.budgetCeiling ?? null);
  if (budget !== null) heard.push(budget === 0 ? 'free' : budget <= 20 ? 'affordable' : `under ~$${budget}`);
  if (c.nearbyOnly) heard.push('close by');
  const wantsFood = c.interests.includes('food');
  const wantsActive = c.interests.some((i) => ACTIVE_CATS.includes(i as Category));
  const active = picks.find((x) => ACTIVE_CATS.includes(x.place.category) || x.place.tags.includes('active'));
  const food = picks.find((x) => x.place.category === 'food');

  let message = heard.length ? `Looks like everyone wants something ${heard.join(' and ')}.` : 'Here’s what I picked up from the chat.';
  if (wantsFood && wantsActive && active && food) {
    message += ` How about ${active.place.name} followed by food at ${food.place.name}? Here are a few options that fit.`;
  } else if (picks[0]) {
    message += ` ${picks[0].place.name} looks like the strongest fit — here are a few options.`;
  }
  if (c.timeWindow) message += ` Timing: ${c.timeWindow}.`;
  if (s && s.unknownCount > 0) {
    message += ` ${s.unknownCount === 1 ? '1 person hasn’t' : `${s.unknownCount} people haven’t`} shared preferences, so I didn’t assume anything for them.`;
  }
  const conflicts = picks.some((x) => x.tradeoffs.length > 0);
  if (conflicts) message += ' Some picks have tradeoffs — I noted them on each card.';

  return { signals, response: toResponse(picks, c, message, questions.slice(0, 2)) };
}

export interface PrivatePlanInput {
  prompt: string;
  history: string[];
  prefs: Partial<Preferences> | null;
  places: RankablePlace[];
}

export function planPrivate(input: PrivatePlanInput): PlanResponse {
  const lines: ChatLine[] = [...input.history, input.prompt].map((text) => ({ authorId: 'me', authorName: 'you', text }));
  const { constraints } = extractSignals(lines);
  const prefs = input.prefs ?? {};
  const summary: GroupPreferenceSummary = {
    memberCount: 1,
    unknownCount: Object.keys(prefs).length ? 0 : 1,
    budgetCeiling: prefs.budget ? BUDGET_MAX[prefs.budget] : null,
    budgetSharedBy: prefs.budget ? 1 : 0,
    maxDistanceKm: prefs.maxDistanceKm ?? null,
    interests: Object.fromEntries([...(prefs.activities ?? []), ...(prefs.favoriteActivities ?? [])].map((a) => [a.toLowerCase(), 1])),
    cuisines: Object.fromEntries((prefs.cuisines ?? []).map((a) => [a.toLowerCase(), 1])),
    dietary: prefs.dietary ?? [],
    dislikes: Object.fromEntries((prefs.dislikedActivities ?? []).map((a) => [a.toLowerCase(), 1])),
    preferredTimes: {},
    accessibility: prefs.accessibility ?? [],
  };
  const t = input.prompt.toLowerCase();
  if (/birthday|celebrat/.test(t) && !constraints.interests.length) constraints.interests.push('food', 'games');
  if (/eat|food|restaurant|hungry/.test(t) && !constraints.interests.includes('food')) constraints.interests.push('food');
  const rainy = /\b(rain|raining|rainy|indoors?|inside)\b/.test(t);
  if (rainy && !constraints.interests.length) constraints.interests.push('games', 'entertainment', 'arts', 'cafe');
  if (/weekend|fun|bored|ideas?/.test(t) && !constraints.interests.length && !Object.keys(summary.interests).length)
    constraints.interests.push('entertainment', 'outdoors', 'food');

  const scored = input.places.map((p) => scorePlace(p, constraints, summary, { rainy }));
  const picks = pickDiverse(scored, 5);
  const usedPrefs = Object.keys(prefs).length > 0;
  const bits: string[] = [];
  if (constraints.budgetMaxPerPerson !== null) bits.push(constraints.budgetMaxPerPerson === 0 ? 'free' : `under $${constraints.budgetMaxPerPerson} each`);
  if (constraints.groupSize) bits.push(`for ${constraints.groupSize}`);
  if (rainy) bits.push('indoors');
  let message = picks.length
    ? `Here are some ideas${bits.length ? ` (${bits.join(', ')})` : ''}${usedPrefs ? ', tuned to the preferences you’ve shared' : ''}.`
    : 'I couldn’t find a good match in the sample catalog. Try loosening the budget or asking for a different kind of activity.';
  if (/birthday/.test(t)) message += ' For a birthday, a booked group activity + a casual dinner usually works well.';
  const questions = constraints.budgetMaxPerPerson === null && !prefs.budget ? ['What budget per person should I aim for?'] : [];
  return toResponse(picks, constraints, message, questions);
}
