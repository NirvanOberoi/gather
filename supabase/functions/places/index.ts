// Place search proxy. POST { action: 'status' } | { action: 'search', query?, category?, area?, coords?, maxPriceLevel?, maxDistanceKm? }
// Keeps the Google Maps key on the server; returns Recommendation objects built only from provider data.
import { z } from 'zod';
import { placeToRecommendation } from '../_shared/recommendation.ts';
import { authenticate, HttpError, json, serve } from '../_server/http.ts';
import { searchPlaces } from '../_server/googlePlaces.ts';

const CATEGORY_QUERIES: Record<string, string> = {
  food: 'popular casual restaurants', cafe: 'cafes', entertainment: 'fun things to do entertainment', sports: 'sports and activities like bowling or climbing',
  outdoors: 'parks and hiking', shopping: 'shopping and markets', free: 'free things to do parks', group: 'fun group activities', weekend: 'weekend activities',
  games: 'arcade or karaoke', arts: 'museums and art galleries',
};

const Search = z.object({
  action: z.literal('search'),
  query: z.string().max(120).optional(),
  category: z.string().max(30).nullable().optional(),
  area: z.string().max(120).nullable().optional(),
  // Rounded on the client (~1 km); never stored.
  coords: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().optional(),
  maxPriceLevel: z.number().int().min(0).max(4).nullable().optional(),
  maxDistanceKm: z.number().min(1).max(50).nullable().optional(),
});

serve(async (req) => {
  await authenticate(req);
  const body = await req.json().catch(() => null);
  const key = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';
  if (body?.action === 'status') return json({ live: !!key });
  const parsed = Search.safeParse(body);
  if (!parsed.success) throw new HttpError(400, 'Invalid search.', 'validation');
  if (!key) throw new HttpError(503, 'Place search isn’t configured on this server.', 'not_configured');
  const q = parsed.data;
  const query = q.query?.trim() || CATEGORY_QUERIES[q.category ?? ''] || 'fun things to do';
  if (!q.area && !q.coords) throw new HttpError(400, 'Choose an area or use your approximate location.', 'validation');
  let results = await searchPlaces(key, { query, area: q.area ?? null, coords: q.coords ?? null, maxPriceLevel: q.maxPriceLevel ?? null, maxDistanceKm: q.maxDistanceKm ?? null, limit: 10 });
  if (q.category === 'free') results = results.filter((r) => r.priceLevel === 0 || r.category === 'outdoors');
  return json({
    results: results.map((p) => placeToRecommendation(p, { id: `gp_${p.placeId}`, whyItFits: [p.rating ? `Rated ${p.rating.toFixed(1)} on Google` : null, p.area].filter(Boolean).join(' · ') || 'From Google Places' })),
  });
});
