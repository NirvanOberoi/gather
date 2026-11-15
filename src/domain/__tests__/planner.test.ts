import { describe, expect, it } from 'vitest';
import { PlanResponseSchema } from '@shared/recommendation.ts';
import { DEFAULT_PRIVACY, EMPTY_PREFERENCES, summarizeGroupPreferences } from '@shared/preferences.ts';
import { planForGroup, planPrivate } from '../planner/demoPlanner';
import { extractBudget, extractSignals, extractTime } from '../planner/extract';
import { SAMPLE_PLACES } from '../../services/demo/samplePlaces';

const spec = [
  { authorId: 'a', authorName: 'Maya', text: 'I want to get food.' },
  { authorId: 'b', authorName: 'Jordan', text: 'I want to do something active.' },
  { authorId: 'c', authorName: 'Priya', text: "I don't want to spend more than $20." },
  { authorId: 'd', authorName: 'Leo', text: 'I want something nearby.' },
  { authorId: 'e', authorName: 'Sam', text: "I'm free after 4." },
];

describe('constraint extraction', () => {
  it('extracts budgets', () => {
    expect(extractBudget("I don't want to spend more than $20")).toBe(20);
    expect(extractBudget('under 15 bucks')).toBe(15);
    expect(extractBudget('im broke lol')).toBe(0);
    expect(extractBudget('sounds good')).toBeNull();
  });
  it('extracts times', () => {
    expect(extractTime("I'm free after 4")).toBe('after 4 PM');
    expect(extractTime('saturday works')).toBe('saturday');
  });
  it('extracts the spec conversation', () => {
    const { constraints } = extractSignals(spec);
    expect(constraints.budgetMaxPerPerson).toBe(20);
    expect(constraints.nearbyOnly).toBe(true);
    expect(constraints.interests).toEqual(expect.arrayContaining(['food', 'sports']));
    expect(constraints.timeWindow).toContain('after 4');
  });
  it('detects negated interests as things to avoid', () => {
    const { constraints } = extractSignals([{ authorId: 'a', authorName: 'A', text: "I don't want to see a movie" }]);
    expect(constraints.avoid).toContain('entertainment');
    expect(constraints.interests).not.toContain('entertainment');
  });
});

describe('demo planner', () => {
  it('produces schema-valid, clearly-labelled recommendations for the spec example', () => {
    const { response } = planForGroup({ lines: spec, summary: null, places: SAMPLE_PLACES });
    expect(() => PlanResponseSchema.parse(response)).not.toThrow();
    expect(response.kind).toBe('recommendations');
    expect(response.generatedBy).toBe('demo_planner');
    expect(response.dataNotice).toMatch(/SAMPLE/);
    expect(response.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(response.recommendations.every((r) => r.source === 'demo_sample')).toBe(true);
    expect(response.message).toMatch(/affordable and close by/);
    expect(response.message).toMatch(/followed by food/);
    // Both requested interests lead the list (active + food), not two of the same kind
    const firstTwo = response.recommendations.slice(0, 2).map((r) => r.category);
    expect(firstTwo).toContain('food');
    expect(firstTwo.some((c) => ['sports', 'games', 'outdoors'].includes(c))).toBe(true);
    // Nothing over budget should be top ranked
    expect(response.recommendations[0].estimatedCost!.max!).toBeLessThanOrEqual(20);
  });
  it('asks clarifying questions when there is nothing to go on', () => {
    const { response } = planForGroup({ lines: [{ authorId: 'a', authorName: 'A', text: 'hey' }], summary: null, places: SAMPLE_PLACES });
    expect(response.kind).toBe('clarifying_question');
    expect(response.recommendations).toHaveLength(0);
    expect(response.clarifyingQuestions.length).toBeGreaterThan(0);
  });
  it('treats members without shared preferences as unknown and says so', () => {
    const summary = summarizeGroupPreferences([
      { groupOptIn: true, prefs: { ...EMPTY_PREFERENCES, budget: 'under_15' }, privacy: DEFAULT_PRIVACY },
      { groupOptIn: false, prefs: { ...EMPTY_PREFERENCES, budget: '50_plus' }, privacy: DEFAULT_PRIVACY },
    ]);
    const { response } = planForGroup({ lines: spec, summary, places: SAMPLE_PLACES });
    expect(response.message).toMatch(/1 person hasn’t shared preferences/);
  });
  it('private assistant handles rainy-day requests with indoor picks', () => {
    const r = planPrivate({ prompt: 'What can I do indoors when it’s raining?', history: [], prefs: null, places: SAMPLE_PLACES });
    expect(r.recommendations.length).toBeGreaterThan(0);
    const ids = r.recommendations.map((x) => x.placeId);
    expect(ids).not.toContain('demo_trail');
  });
  it('private assistant respects budget for groups', () => {
    const r = planPrivate({ prompt: 'Find activities for five friends under $25 each', history: [], prefs: null, places: SAMPLE_PLACES });
    expect(r.constraints?.budgetMaxPerPerson).toBe(25);
    expect(r.constraints?.groupSize).toBe(5);
    expect(r.recommendations.slice(0, 3).every((x) => (x.estimatedCost?.max ?? 0) <= 30)).toBe(true);
  });
});
