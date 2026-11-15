/**
 * User preferences + privacy filtering.
 *
 * Every preference belongs to a category. Each user decides, per category, whether it
 * can be (a) used by Gather AI and (b) seen by friends / group members. Anything not
 * explicitly shared is treated as UNKNOWN — never as a default value.
 */

export const BUDGET_TIERS = ['free', 'under_15', '15_30', '30_50', '50_plus'] as const;
export type BudgetTier = (typeof BUDGET_TIERS)[number];

export const BUDGET_MAX: Record<BudgetTier, number | null> = {
  free: 0,
  under_15: 15,
  '15_30': 30,
  '30_50': 50,
  '50_plus': null,
};

export const BUDGET_LABEL: Record<BudgetTier, string> = {
  free: 'Free',
  under_15: 'Under $15',
  '15_30': '$15–30',
  '30_50': '$30–50',
  '50_plus': '$50+',
};

export interface Preferences {
  cuisines: string[];
  dietary: string[];
  restaurantStyles: string[];
  activities: string[];
  customInterests: string[];
  budget: BudgetTier | null;
  maxDistanceKm: number | null;
  favoriteActivities: string[];
  dislikedActivities: string[];
  preferredTimes: string[];
  accessibility: string[];
}

export const EMPTY_PREFERENCES: Preferences = {
  cuisines: [],
  dietary: [],
  restaurantStyles: [],
  activities: [],
  customInterests: [],
  budget: null,
  maxDistanceKm: null,
  favoriteActivities: [],
  dislikedActivities: [],
  preferredTimes: [],
  accessibility: [],
};

export const PREFERENCE_CATEGORIES = ['food', 'activities', 'budget', 'distance', 'times', 'dislikes', 'accessibility'] as const;
export type PreferenceCategory = (typeof PREFERENCE_CATEGORIES)[number];

export const CATEGORY_FIELDS: Record<PreferenceCategory, (keyof Preferences)[]> = {
  food: ['cuisines', 'dietary', 'restaurantStyles'],
  activities: ['activities', 'customInterests', 'favoriteActivities'],
  budget: ['budget'],
  distance: ['maxDistanceKm'],
  times: ['preferredTimes'],
  dislikes: ['dislikedActivities'],
  accessibility: ['accessibility'],
};

export const CATEGORY_LABEL: Record<PreferenceCategory, string> = {
  food: 'Food & dietary',
  activities: 'Activities & interests',
  budget: 'Budget',
  distance: 'Travel distance',
  times: 'Preferred times',
  dislikes: 'Things I’d rather skip',
  accessibility: 'Accessibility needs',
};

export type CategoryFlags = Record<PreferenceCategory, boolean>;

export interface PrivacySettings {
  /** Which categories Gather AI may use when planning for groups / you. */
  aiShare: CategoryFlags;
  /** Which categories friends and group members can see on your profile. */
  friendsShare: CategoryFlags;
  /** Show your name next to your poll votes. */
  showVoteIdentity: boolean;
  /** Can people find you by username search. */
  discoverable: boolean;
  allowFriendRequests: boolean;
  /** Keep private-assistant history (otherwise conversations are deleted after use). */
  storePrivateAiHistory: boolean;
}

const flags = (v: boolean, overrides: Partial<CategoryFlags> = {}): CategoryFlags => ({
  food: v,
  activities: v,
  budget: v,
  distance: v,
  times: v,
  dislikes: v,
  accessibility: v,
  ...overrides,
});

/** Privacy-protective defaults: AI can use most things, friends see little, accessibility stays private. */
export const DEFAULT_PRIVACY: PrivacySettings = {
  aiShare: flags(true, { accessibility: false }),
  friendsShare: flags(false, { activities: true, food: true }),
  showVoteIdentity: true,
  discoverable: true,
  allowFriendRequests: true,
  storePrivateAiHistory: true,
};

export type Audience = 'ai' | 'friends';

/** Returns a copy of `prefs` where every non-shared category is blanked (unknown). */
export function filterPreferences(prefs: Preferences, privacy: PrivacySettings, audience: Audience): Partial<Preferences> {
  const allowed = audience === 'ai' ? privacy.aiShare : privacy.friendsShare;
  const out: Partial<Preferences> = {};
  for (const cat of PREFERENCE_CATEGORIES) {
    if (!allowed[cat]) continue;
    for (const field of CATEGORY_FIELDS[cat]) {
      const value = prefs[field];
      if (Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined) {
        (out as Record<string, unknown>)[field] = Array.isArray(value) ? [...value] : value;
      }
    }
  }
  return out;
}

export interface MemberPrefsInput {
  /** Whether the member allowed preferences to be used in THIS group (per-group switch). */
  groupOptIn: boolean;
  prefs: Preferences;
  privacy: PrivacySettings;
}

export interface GroupPreferenceSummary {
  memberCount: number;
  /** Members who shared nothing usable with the AI — their preferences are unknown. */
  unknownCount: number;
  /** Lowest budget ceiling among members who shared a budget, in USD per person. */
  budgetCeiling: number | null;
  budgetSharedBy: number;
  /** Smallest travel distance among members who shared it. */
  maxDistanceKm: number | null;
  /** item -> how many members mentioned it. Unattributed on purpose. */
  interests: Record<string, number>;
  cuisines: Record<string, number>;
  dietary: string[];
  dislikes: Record<string, number>;
  preferredTimes: Record<string, number>;
  accessibility: string[];
}

function bump(map: Record<string, number>, items: string[] | undefined) {
  for (const raw of items ?? []) {
    const k = raw.trim().toLowerCase();
    if (!k) continue;
    map[k] = (map[k] ?? 0) + 1;
  }
}

/**
 * Aggregate group preferences for the AI. The output is deliberately unattributed:
 * the AI learns "2 people prefer under $15" — never "Maya's budget is $15" — so a
 * group member's private preferences can't be revealed through the assistant.
 */
export function summarizeGroupPreferences(members: MemberPrefsInput[]): GroupPreferenceSummary {
  const s: GroupPreferenceSummary = {
    memberCount: members.length,
    unknownCount: 0,
    budgetCeiling: null,
    budgetSharedBy: 0,
    maxDistanceKm: null,
    interests: {},
    cuisines: {},
    dietary: [],
    dislikes: {},
    preferredTimes: {},
    accessibility: [],
  };
  for (const m of members) {
    if (!m.groupOptIn) {
      s.unknownCount++;
      continue;
    }
    const p = filterPreferences(m.prefs, m.privacy, 'ai');
    if (Object.keys(p).length === 0) {
      s.unknownCount++;
      continue;
    }
    if (p.budget) {
      s.budgetSharedBy++;
      const max = BUDGET_MAX[p.budget];
      if (max !== null) s.budgetCeiling = s.budgetCeiling === null ? max : Math.min(s.budgetCeiling, max);
    }
    if (typeof p.maxDistanceKm === 'number') {
      s.maxDistanceKm = s.maxDistanceKm === null ? p.maxDistanceKm : Math.min(s.maxDistanceKm, p.maxDistanceKm);
    }
    bump(s.interests, [...(p.activities ?? []), ...(p.favoriteActivities ?? []), ...(p.customInterests ?? [])]);
    bump(s.cuisines, p.cuisines);
    bump(s.dislikes, p.dislikedActivities);
    bump(s.preferredTimes, p.preferredTimes);
    for (const d of p.dietary ?? []) if (!s.dietary.includes(d)) s.dietary.push(d);
    for (const a of p.accessibility ?? []) if (!s.accessibility.includes(a)) s.accessibility.push(a);
  }
  return s;
}

/** Render a summary as compact text for an LLM prompt. */
export function describeSummary(s: GroupPreferenceSummary): string {
  const top = (m: Record<string, number>, n = 8) =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => `${k} (${v})`)
      .join(', ') || 'none shared';
  const lines = [
    `Members: ${s.memberCount}. Members with no shared preferences (treat as unknown, not as agreement): ${s.unknownCount}.`,
    `Budget: ${s.budgetCeiling === null ? (s.budgetSharedBy ? 'no upper limit shared' : 'unknown') : `lowest shared ceiling is $${s.budgetCeiling}/person (${s.budgetSharedBy} shared a budget)`}.`,
    `Travel distance: ${s.maxDistanceKm === null ? 'unknown' : `at most ${s.maxDistanceKm} km for someone`}.`,
    `Interests (count of members): ${top(s.interests)}.`,
    `Cuisines: ${top(s.cuisines)}. Dietary needs: ${s.dietary.join(', ') || 'none shared'}.`,
    `Would rather skip: ${top(s.dislikes)}.`,
    `Preferred times: ${top(s.preferredTimes)}.`,
    `Accessibility needs: ${s.accessibility.join(', ') || 'none shared'}.`,
  ];
  return lines.join('\n');
}
