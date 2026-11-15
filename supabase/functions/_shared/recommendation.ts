/**
 * Recommendation + AI response schemas.
 *
 * Shared by the Expo app (imported as `@shared/recommendation.ts`) and the Deno
 * edge functions. Keep this file dependency-free apart from `zod` so it runs in both.
 */
import { z } from 'zod';

export const CATEGORIES = [
  'food',
  'cafe',
  'entertainment',
  'sports',
  'outdoors',
  'shopping',
  'arts',
  'games',
  'nightlife',
  'free',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const RECOMMENDATION_SOURCES = ['google_places', 'demo_sample', 'ai_idea'] as const;
export type RecommendationSource = (typeof RECOMMENDATION_SOURCES)[number];

export const EstimatedCostSchema = z.object({
  min: z.number().min(0).nullable(),
  max: z.number().min(0).nullable(),
  currency: z.literal('USD'),
  perPerson: z.boolean(),
  /** Human label, e.g. "$10–20 per person" or "Free". */
  label: z.string().min(1).max(60),
  /** Where the estimate came from – shown to users so nothing looks more certain than it is. */
  basis: z.enum(['provider_price_level', 'sample_data', 'typical_range']),
});
export type EstimatedCost = z.infer<typeof EstimatedCostSchema>;

export const RecommendationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  category: z.enum(CATEGORIES),
  description: z.string().max(500),
  whyItFits: z.string().max(500),
  tradeoffs: z.string().max(300).nullable(),
  estimatedCost: EstimatedCostSchema.nullable(),
  locationText: z.string().max(160).nullable(),
  imageUrl: z.string().url().nullable(),
  mapsUrl: z.string().url().nullable(),
  placeId: z.string().nullable(),
  rating: z.number().min(0).max(5).nullable(),
  source: z.enum(RECOMMENDATION_SOURCES),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const ConstraintsSchema = z.object({
  budgetMaxPerPerson: z.number().min(0).nullable(),
  timeWindow: z.string().max(120).nullable(),
  area: z.string().max(120).nullable(),
  groupSize: z.number().int().min(1).max(50).nullable(),
  interests: z.array(z.string().max(40)).max(12),
  avoid: z.array(z.string().max(40)).max(12),
  nearbyOnly: z.boolean(),
});
export type Constraints = z.infer<typeof ConstraintsSchema>;

export const PlanResponseSchema = z.object({
  kind: z.enum(['recommendations', 'clarifying_question', 'message']),
  message: z.string().min(1).max(1500),
  constraints: ConstraintsSchema.nullable(),
  recommendations: z.array(RecommendationSchema).max(6),
  clarifyingQuestions: z.array(z.string().max(200)).max(3),
  /** Shown above cards. Always set when data is sample / not live. */
  dataNotice: z.string().max(240).nullable(),
  generatedBy: z.enum(['gather_ai', 'demo_planner']),
});
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

/**
 * Shape we ask the LLM for. It never supplies URLs, images, ratings or prices for
 * real businesses — those are merged in server-side from provider data, so the model
 * cannot invent them.
 */
export const ModelOutputSchema = z.object({
  kind: z.enum(['recommendations', 'clarifying_question', 'message']),
  message: z.string(),
  constraints: z.object({
    budgetMaxPerPerson: z.number().nullable(),
    timeWindow: z.string().nullable(),
    area: z.string().nullable(),
    groupSize: z.number().nullable(),
    interests: z.array(z.string()),
    avoid: z.array(z.string()),
    nearbyOnly: z.boolean(),
  }),
  recommendations: z.array(
    z.object({
      /** Must be a place id returned by the search_places tool, or null for a generic idea. */
      placeId: z.string().nullable(),
      title: z.string(),
      category: z.enum(CATEGORIES),
      description: z.string(),
      whyItFits: z.string(),
      tradeoffs: z.string().nullable(),
      /** Only for generic ideas (placeId null): a typical range, e.g. "Usually $10–20". */
      typicalCostLabel: z.string().nullable(),
    }),
  ),
  clarifyingQuestions: z.array(z.string()),
});
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

/** A place returned by a provider (Google Places) or the demo catalog. */
export interface PlaceResult {
  placeId: string;
  name: string;
  category: Category;
  address: string | null;
  area: string | null;
  priceLevel: 0 | 1 | 2 | 3 | 4 | null;
  rating: number | null;
  imageUrl: string | null;
  mapsUrl: string | null;
  description: string | null;
  source: 'google_places' | 'demo_sample';
}

export function costFromPriceLevel(level: PlaceResult['priceLevel'], source: PlaceResult['source']): EstimatedCost | null {
  if (level === null || level === undefined) return null;
  const basis = source === 'demo_sample' ? 'sample_data' : 'provider_price_level';
  switch (level) {
    case 0:
      return { min: 0, max: 0, currency: 'USD', perPerson: true, label: 'Free', basis };
    case 1:
      return { min: 0, max: 15, currency: 'USD', perPerson: true, label: 'Under $15 / person', basis };
    case 2:
      return { min: 15, max: 30, currency: 'USD', perPerson: true, label: '$15–30 / person', basis };
    case 3:
      return { min: 30, max: 50, currency: 'USD', perPerson: true, label: '$30–50 / person', basis };
    case 4:
      return { min: 50, max: null, currency: 'USD', perPerson: true, label: '$50+ / person', basis };
    default:
      return null;
  }
}

export function directionsUrl(query: string, placeId?: string | null): string {
  const q = encodeURIComponent(query);
  return placeId && !placeId.startsWith('demo_')
    ? `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${encodeURIComponent(placeId)}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function placeToRecommendation(
  place: PlaceResult,
  extras: { id: string; whyItFits: string; description?: string; tradeoffs?: string | null },
): Recommendation {
  return {
    id: extras.id,
    title: place.name,
    category: place.category,
    description: (extras.description ?? place.description ?? '').slice(0, 500),
    whyItFits: extras.whyItFits.slice(0, 500),
    tradeoffs: extras.tradeoffs ? extras.tradeoffs.slice(0, 300) : null,
    estimatedCost: costFromPriceLevel(place.priceLevel, place.source),
    locationText: place.area ?? place.address,
    imageUrl: place.imageUrl,
    mapsUrl: place.mapsUrl ?? directionsUrl(`${place.name} ${place.address ?? ''}`.trim(), place.placeId),
    placeId: place.placeId,
    rating: place.rating,
    source: place.source,
  };
}

/**
 * Convert raw model output into validated recommendations, using ONLY place data the
 * server actually retrieved. Any recommendation that references an unknown placeId is
 * dropped (never shown as a real business). Generic ideas are labelled `ai_idea`.
 */
export function mergeModelOutput(
  output: ModelOutput,
  knownPlaces: Map<string, PlaceResult>,
  opts: { makeId: () => string; liveDataAvailable: boolean; generatedBy: PlanResponse['generatedBy'] },
): { response: PlanResponse; droppedUnknownPlaces: number } {
  let dropped = 0;
  const recs: Recommendation[] = [];
  const seen = new Set<string>();
  for (const r of output.recommendations.slice(0, 6)) {
    if (r.placeId) {
      const place = knownPlaces.get(r.placeId);
      if (!place) {
        dropped++;
        continue;
      }
      if (seen.has(place.placeId)) continue;
      seen.add(place.placeId);
      recs.push(
        placeToRecommendation(place, {
          id: opts.makeId(),
          whyItFits: r.whyItFits,
          description: r.description,
          tradeoffs: r.tradeoffs,
        }),
      );
    } else {
      recs.push({
        id: opts.makeId(),
        title: r.title.slice(0, 120),
        category: r.category,
        description: r.description.slice(0, 500),
        whyItFits: r.whyItFits.slice(0, 500),
        tradeoffs: r.tradeoffs ? r.tradeoffs.slice(0, 300) : null,
        estimatedCost: r.typicalCostLabel
          ? { min: null, max: null, currency: 'USD', perPerson: true, label: r.typicalCostLabel.slice(0, 60), basis: 'typical_range' }
          : null,
        locationText: null,
        imageUrl: null,
        mapsUrl: directionsUrl(r.title),
        placeId: null,
        rating: null,
        source: 'ai_idea',
      });
    }
  }

  const c = output.constraints;
  const hasIdeas = recs.some((r) => r.source === 'ai_idea');
  const dataNotice = !opts.liveDataAvailable
    ? 'Live place data isn’t connected, so these are general ideas — not specific businesses. Check details before you go.'
    : hasIdeas
      ? 'Some suggestions are general ideas rather than specific places.'
      : 'Place info from Google. Hours, prices and availability can change — check before you go.';

  const response: PlanResponse = {
    kind: recs.length === 0 && output.kind === 'recommendations' ? 'message' : output.kind,
    message: output.message.slice(0, 1500) || 'Here’s what I found.',
    constraints: {
      budgetMaxPerPerson: c.budgetMaxPerPerson !== null && c.budgetMaxPerPerson >= 0 ? c.budgetMaxPerPerson : null,
      timeWindow: c.timeWindow?.slice(0, 120) ?? null,
      area: c.area?.slice(0, 120) ?? null,
      groupSize: c.groupSize && c.groupSize >= 1 && c.groupSize <= 50 ? Math.round(c.groupSize) : null,
      interests: c.interests.slice(0, 12).map((s) => s.slice(0, 40)),
      avoid: c.avoid.slice(0, 12).map((s) => s.slice(0, 40)),
      nearbyOnly: c.nearbyOnly,
    },
    recommendations: recs,
    clarifyingQuestions: output.clarifyingQuestions.slice(0, 3).map((q) => q.slice(0, 200)),
    dataNotice: recs.length ? dataNotice : null,
    generatedBy: opts.generatedBy,
  };
  return { response: PlanResponseSchema.parse(response), droppedUnknownPlaces: dropped };
}
