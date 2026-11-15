import { describe, expect, it } from 'vitest';
import { mergeModelOutput, PlanResponseSchema, type ModelOutput, type PlaceResult } from '../recommendation.ts';
import { DEFAULT_PRIVACY, EMPTY_PREFERENCES, filterPreferences, summarizeGroupPreferences, describeSummary } from '../preferences.ts';
import { checkRateLimit, moderateText, redactPII, shouldAutoSuggest, mentionsGather } from '../safety.ts';

const place: PlaceResult = {
  placeId: 'gp_123', name: 'Real Lanes', category: 'sports', address: '1 Main St', area: 'Downtown',
  priceLevel: 2, rating: 4.5, imageUrl: 'https://example.com/a.jpg', mapsUrl: null, description: null, source: 'google_places',
};
const output = (recs: ModelOutput['recommendations']): ModelOutput => ({
  kind: 'recommendations', message: 'Try these', clarifyingQuestions: [],
  constraints: { budgetMaxPerPerson: 20, timeWindow: null, area: null, groupSize: 5, interests: ['sports'], avoid: [], nearbyOnly: true },
  recommendations: recs,
});
let n = 0;
const opts = { makeId: () => `r${n++}`, liveDataAvailable: true, generatedBy: 'gather_ai' as const };

describe('recommendation validation (anti-hallucination)', () => {
  it('uses provider data for known places and drops unknown place ids', () => {
    const { response, droppedUnknownPlaces } = mergeModelOutput(
      output([
        { placeId: 'gp_123', title: 'whatever the model said', category: 'sports', description: 'Bowling', whyItFits: 'Active + cheap', tradeoffs: null, typicalCostLabel: '$5' },
        { placeId: 'gp_FAKE', title: 'Invented Place', category: 'food', description: '', whyItFits: '', tradeoffs: null, typicalCostLabel: null },
      ]),
      new Map([[place.placeId, place]]),
      opts,
    );
    expect(droppedUnknownPlaces).toBe(1);
    expect(response.recommendations).toHaveLength(1);
    const r = response.recommendations[0];
    expect(r.title).toBe('Real Lanes'); // name from provider, not the model
    expect(r.estimatedCost?.basis).toBe('provider_price_level');
    expect(r.imageUrl).toBe('https://example.com/a.jpg');
    expect(r.source).toBe('google_places');
    expect(() => PlanResponseSchema.parse(response)).not.toThrow();
  });
  it('labels generic ideas and flags missing live data', () => {
    const { response } = mergeModelOutput(
      output([{ placeId: null, title: 'Bowling night', category: 'sports', description: 'Any local alley', whyItFits: 'Active', tradeoffs: null, typicalCostLabel: 'Usually $10–20' }]),
      new Map(), { ...opts, liveDataAvailable: false },
    );
    expect(response.recommendations[0].source).toBe('ai_idea');
    expect(response.recommendations[0].rating).toBeNull();
    expect(response.recommendations[0].estimatedCost?.basis).toBe('typical_range');
    expect(response.dataNotice).toMatch(/isn’t connected/);
  });
  it('downgrades an empty recommendations response to a message', () => {
    const { response } = mergeModelOutput(output([]), new Map(), opts);
    expect(response.kind).toBe('message');
    expect(response.dataNotice).toBeNull();
  });
  it('schema rejects malformed responses', () => {
    expect(PlanResponseSchema.safeParse({ kind: 'recommendations', message: '' }).success).toBe(false);
    expect(PlanResponseSchema.safeParse({ kind: 'nope', message: 'x', constraints: null, recommendations: [], clarifyingQuestions: [], dataNotice: null, generatedBy: 'gather_ai' }).success).toBe(false);
  });
});

describe('preference privacy', () => {
  const prefs = { ...EMPTY_PREFERENCES, budget: 'under_15' as const, cuisines: ['thai'], accessibility: ['wheelchair access'], activities: ['bowling'] };
  it('only shares categories the user allowed for each audience', () => {
    const ai = filterPreferences(prefs, DEFAULT_PRIVACY, 'ai');
    expect(ai.budget).toBe('under_15');
    expect(ai.accessibility).toBeUndefined(); // private by default
    const friends = filterPreferences(prefs, DEFAULT_PRIVACY, 'friends');
    expect(friends.budget).toBeUndefined();
    expect(friends.cuisines).toEqual(['thai']);
  });
  it('group summaries are unattributed and count opted-out members as unknown', () => {
    const s = summarizeGroupPreferences([
      { groupOptIn: true, prefs, privacy: DEFAULT_PRIVACY },
      { groupOptIn: true, prefs: { ...EMPTY_PREFERENCES, budget: '30_50' }, privacy: DEFAULT_PRIVACY },
      { groupOptIn: false, prefs: { ...EMPTY_PREFERENCES, budget: 'free' }, privacy: DEFAULT_PRIVACY },
      { groupOptIn: true, prefs: EMPTY_PREFERENCES, privacy: DEFAULT_PRIVACY },
    ]);
    expect(s.budgetCeiling).toBe(15);
    expect(s.unknownCount).toBe(2);
    expect(s.accessibility).toEqual([]);
    const text = describeSummary(s);
    expect(text).toContain('treat as unknown');
    expect(text).not.toMatch(/maya|user/i);
  });
});

describe('safety', () => {
  it('moderates harmful requests', () => {
    expect(moderateText('lets go bowling').allowed).toBe(true);
    const r = moderateText('i want to kill myself');
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.userMessage).toMatch(/988/);
    expect(moderateText('where can we get a fake id').allowed).toBe(false);
  });
  it('redacts contact info and precise locations before AI calls', () => {
    const t = redactPII('text me at 555-123-4567 or me@x.com, I live at 42 Oak Street (37.77493, -122.41942)');
    expect(t).not.toMatch(/555|me@x|42 Oak|37\.77/);
  });
  it('rate limits by tier and burst', () => {
    const now = 1_000_000_000_000;
    const hourAgo = Array.from({ length: 15 }, (_, i) => now - 3600_000 + i);
    expect(checkRateLimit(hourAgo, 'free', now).allowed).toBe(false);
    expect(checkRateLimit(hourAgo, 'premium', now).allowed).toBe(true);
    const burst = Array.from({ length: 5 }, (_, i) => now - 1000 * i);
    const d = checkRateLimit(burst, 'premium', now);
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe('burst');
    expect(checkRateLimit([now - 25 * 3600_000], 'free', now)).toEqual({ allowed: true, remainingToday: 14 });
  });
  it('auto-suggest requires opt-in, multiple planners and respects cooldown', () => {
    const now = Date.now();
    const recent = [
      { authorId: 'a', text: 'what should we do saturday', at: now - 60_000 },
      { authorId: 'b', text: 'wanna go bowling?', at: now - 50_000 },
      { authorId: 'a', text: 'budget is $20', at: now - 40_000 },
    ];
    const base = { groupOptedIn: true, lastAutoSuggestAt: null, recent, lastAiMessageAt: null, now };
    expect(shouldAutoSuggest(base)).toBe(true);
    expect(shouldAutoSuggest({ ...base, groupOptedIn: false })).toBe(false);
    expect(shouldAutoSuggest({ ...base, lastAutoSuggestAt: now - 60_000 })).toBe(false);
    expect(shouldAutoSuggest({ ...base, recent: recent.map((r) => ({ ...r, authorId: 'a' })) })).toBe(false);
    expect(mentionsGather('hey @gather help')).toBe(true);
    expect(mentionsGather('email@gather.com')).toBe(false);
  });
});
