// Google Places API (New) client. Runs server-side only; the key never reaches devices.
import { CATEGORIES, type Category, type PlaceResult } from '../_shared/recommendation.ts';

const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.shortFormattedAddress', 'places.priceLevel',
  'places.rating', 'places.googleMapsUri', 'places.primaryType', 'places.types', 'places.photos', 'places.editorialSummary',
].join(',');

const PRICE: Record<string, PlaceResult['priceLevel']> = {
  PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
};
const PRICE_ENUM = ['PRICE_LEVEL_FREE', 'PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE', 'PRICE_LEVEL_EXPENSIVE', 'PRICE_LEVEL_VERY_EXPENSIVE'];

// Venues that aren't appropriate to suggest to a teen-heavy audience.
const EXCLUDED_TYPES = new Set(['bar', 'night_club', 'liquor_store', 'casino', 'adult_entertainment_store', 'cannabis_store', 'wine_bar', 'pub']);

function categorize(types: string[]): Category {
  const t = new Set(types);
  const has = (...xs: string[]) => xs.some((x) => t.has(x));
  if (has('cafe', 'coffee_shop', 'tea_house', 'bakery')) return 'cafe';
  if (has('restaurant', 'meal_takeaway', 'food_court', 'ice_cream_shop', 'dessert_shop', 'fast_food_restaurant')) return 'food';
  if (has('bowling_alley', 'gym', 'sports_complex', 'stadium', 'swimming_pool', 'ice_skating_rink', 'climbing_gym', 'fitness_center', 'golf_course')) return 'sports';
  if (has('park', 'hiking_area', 'national_park', 'beach', 'garden', 'campground', 'dog_park')) return 'outdoors';
  if (has('movie_theater', 'amusement_park', 'aquarium', 'zoo', 'performing_arts_theater', 'concert_hall', 'comedy_club', 'escape_room')) return 'entertainment';
  if (has('amusement_center', 'video_arcade', 'karaoke')) return 'games';
  if (has('museum', 'art_gallery', 'cultural_center')) return 'arts';
  if (has('shopping_mall', 'clothing_store', 'market', 'book_store', 'store')) return 'shopping';
  return 'other';
}

interface GPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  priceLevel?: string;
  rating?: number;
  googleMapsUri?: string;
  primaryType?: string;
  types?: string[];
  photos?: { name: string }[];
  editorialSummary?: { text: string };
}

export interface PlaceSearch {
  query: string;
  area?: string | null;
  coords?: { lat: number; lng: number } | null;
  maxPriceLevel?: number | null;
  maxDistanceKm?: number | null;
  limit?: number;
}

async function photoUri(apiKey: string, name: string): Promise<string | null> {
  try {
    const r = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=640&skipHttpRedirect=true&key=${apiKey}`);
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j.photoUri === 'string' ? j.photoUri : null; // key-less googleusercontent URL
  } catch {
    return null;
  }
}

export async function searchPlaces(apiKey: string, s: PlaceSearch): Promise<PlaceResult[]> {
  const textQuery = s.area && !s.coords ? `${s.query} in ${s.area}` : s.query;
  const body: Record<string, unknown> = { textQuery, maxResultCount: Math.min(s.limit ?? 8, 10) };
  if (s.coords) {
    body.locationBias = { circle: { center: { latitude: s.coords.lat, longitude: s.coords.lng }, radius: Math.min(50000, (s.maxDistanceKm ?? 10) * 1000) } };
  }
  if (s.maxPriceLevel !== null && s.maxPriceLevel !== undefined && s.maxPriceLevel >= 1) {
    body.priceLevels = PRICE_ENUM.slice(1, s.maxPriceLevel + 1); // FREE isn't accepted as a filter value
  }
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('[gather] places search failed', res.status);
    throw new Error(`Place search failed (${res.status})`);
  }
  const data = (await res.json()) as { places?: GPlace[] };
  const places = (data.places ?? []).filter((p) => !(p.types ?? []).some((t) => EXCLUDED_TYPES.has(t)));
  return Promise.all(
    places.map(async (p): Promise<PlaceResult> => {
      const category = categorize([p.primaryType ?? '', ...(p.types ?? [])]);
      return {
        placeId: p.id,
        name: p.displayName?.text ?? 'Unnamed place',
        category: (CATEGORIES as readonly string[]).includes(category) ? category : 'other',
        address: p.formattedAddress ?? null,
        area: p.shortFormattedAddress ?? null,
        priceLevel: p.priceLevel ? PRICE[p.priceLevel] ?? null : null,
        rating: typeof p.rating === 'number' ? p.rating : null,
        imageUrl: p.photos?.[0] ? await photoUri(apiKey, p.photos[0].name) : null,
        mapsUrl: p.googleMapsUri ?? null,
        description: p.editorialSummary?.text ?? null,
        source: 'google_places',
      };
    }),
  );
}
