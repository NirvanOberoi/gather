/**
 * SAMPLE PLACES — fictional venues used only in demo mode.
 * Every item is labelled `demo_sample` and rendered with a "Sample" badge. They are not
 * real businesses; prices/ratings are illustrative, never presented as live data.
 */
import type { PlaceResult } from '@shared/recommendation.ts';

export interface SamplePlace extends PlaceResult {
  source: 'demo_sample';
  tags: string[];
  distanceKm: number;
  goodForGroups: boolean;
  indoor: boolean;
}

const p = (x: Omit<SamplePlace, 'source' | 'imageUrl' | 'mapsUrl' | 'address'>): SamplePlace => ({
  ...x,
  source: 'demo_sample',
  imageUrl: null,
  mapsUrl: null,
  address: null,
});

export const SAMPLE_PLACES: SamplePlace[] = [
  p({ placeId: 'demo_pinfall', name: 'Pinfall Lanes', category: 'sports', area: 'Downtown · 1.2 km', priceLevel: 1, rating: 4.4, description: 'Glow bowling with group lanes and shoe rental included on weekends.', tags: ['bowling', 'active', 'arcade', 'group'], distanceKm: 1.2, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_summit', name: 'Summit Bouldering Co.', category: 'sports', area: 'Eastside · 3.5 km', priceLevel: 2, rating: 4.7, description: 'Beginner-friendly climbing gym. Day pass + shoes.', tags: ['climbing', 'active', 'bouldering'], distanceKm: 3.5, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_bounce', name: 'Skyline Trampoline Park', category: 'sports', area: 'Northgate · 6 km', priceLevel: 2, rating: 4.1, description: 'Open jump, dodgeball courts and foam pits.', tags: ['trampoline', 'active', 'group'], distanceKm: 6, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_courts', name: 'Riverside Public Courts', category: 'free', area: 'Riverside Park · 1.8 km', priceLevel: 0, rating: 4.3, description: 'Free basketball and pickleball courts. Bring your own ball.', tags: ['basketball', 'pickleball', 'active', 'outdoors', 'free'], distanceKm: 1.8, goodForGroups: true, indoor: false }),
  p({ placeId: 'demo_taqueria', name: 'Taqueria Sol', category: 'food', area: 'Downtown · 1.0 km', priceLevel: 1, rating: 4.6, description: 'Street tacos, big tables, quick service. Vegetarian options.', tags: ['tacos', 'mexican', 'food', 'vegetarian', 'cheap'], distanceKm: 1.0, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_noodle', name: 'Noodle Theory', category: 'food', area: 'Midtown · 2.2 km', priceLevel: 2, rating: 4.5, description: 'Hand-pulled noodles and dumplings. Shareable plates.', tags: ['ramen', 'noodles', 'asian', 'food'], distanceKm: 2.2, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_slice', name: 'Corner Slice Pizza', category: 'food', area: 'Downtown · 0.8 km', priceLevel: 1, rating: 4.2, description: 'Big slices, late hours, vegan cheese available.', tags: ['pizza', 'food', 'cheap', 'vegan', 'late'], distanceKm: 0.8, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_burger', name: 'Stack House Burgers', category: 'food', area: 'Westside · 4 km', priceLevel: 2, rating: 4.4, description: 'Smash burgers, shakes and a patio.', tags: ['burgers', 'american', 'food', 'shakes'], distanceKm: 4, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_sushi', name: 'Koi Conveyor Sushi', category: 'food', area: 'Midtown · 2.5 km', priceLevel: 3, rating: 4.5, description: 'Conveyor-belt sushi — fun for groups, priced per plate.', tags: ['sushi', 'japanese', 'food'], distanceKm: 2.5, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_boba', name: 'Moonleaf Boba', category: 'cafe', area: 'Downtown · 0.6 km', priceLevel: 1, rating: 4.5, description: 'Boba, snacks and board games on the shelf.', tags: ['boba', 'tea', 'cafe', 'board games', 'dessert'], distanceKm: 0.6, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_roast', name: 'Copperline Coffee', category: 'cafe', area: 'Arts District · 1.6 km', priceLevel: 1, rating: 4.6, description: 'Cozy coffee spot with big communal tables.', tags: ['coffee', 'cafe', 'study'], distanceKm: 1.6, goodForGroups: false, indoor: true }),
  p({ placeId: 'demo_cinema', name: 'Starlight Cinema 8', category: 'entertainment', area: 'Midtown · 2.0 km', priceLevel: 2, rating: 4.3, description: 'New releases; discount matinees before 5 PM.', tags: ['movies', 'cinema', 'entertainment'], distanceKm: 2.0, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_escape', name: 'Locked In Escape Rooms', category: 'entertainment', area: 'Eastside · 3.0 km', priceLevel: 3, rating: 4.8, description: '60-minute puzzle rooms for 4–8 players. Booking usually required.', tags: ['escape room', 'puzzle', 'group', 'entertainment'], distanceKm: 3.0, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_comedy', name: 'Laugh Track Comedy Club (All Ages Sundays)', category: 'entertainment', area: 'Downtown · 1.4 km', priceLevel: 2, rating: 4.2, description: 'All-ages comedy showcase on Sunday afternoons.', tags: ['comedy', 'show', 'entertainment'], distanceKm: 1.4, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_arcade', name: 'Pixel Palace Arcade', category: 'games', area: 'Downtown · 1.1 km', priceLevel: 1, rating: 4.4, description: 'Retro + modern arcade games, pay-per-play cards.', tags: ['arcade', 'games', 'gaming'], distanceKm: 1.1, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_karaoke', name: 'Echo Box Karaoke', category: 'games', area: 'Midtown · 2.3 km', priceLevel: 2, rating: 4.3, description: 'Private karaoke rooms priced per hour, split across the group.', tags: ['karaoke', 'music', 'group'], distanceKm: 2.3, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_minigolf', name: 'Lantern Mini Golf', category: 'games', area: 'Northgate · 5 km', priceLevel: 1, rating: 4.2, description: 'Glow-in-the-dark 18-hole mini golf.', tags: ['mini golf', 'games', 'active'], distanceKm: 5, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_trail', name: 'Cedar Ridge Trail', category: 'outdoors', area: 'Cedar Ridge · 8 km', priceLevel: 0, rating: 4.7, description: '3-mile loop with a lookout. Free parking.', tags: ['hike', 'outdoors', 'active', 'free', 'nature'], distanceKm: 8, goodForGroups: true, indoor: false }),
  p({ placeId: 'demo_park', name: 'Riverside Park Lawn', category: 'outdoors', area: 'Riverside Park · 1.8 km', priceLevel: 0, rating: 4.5, description: 'Picnic lawn with sunset views. Food trucks on weekends.', tags: ['picnic', 'park', 'outdoors', 'free', 'sunset'], distanceKm: 1.8, goodForGroups: true, indoor: false }),
  p({ placeId: 'demo_market', name: 'Night Market on 5th', category: 'shopping', area: 'Downtown · 0.9 km', priceLevel: 1, rating: 4.4, description: 'Weekend evening market with food stalls and vintage vendors.', tags: ['market', 'shopping', 'food', 'thrift'], distanceKm: 0.9, goodForGroups: true, indoor: false }),
  p({ placeId: 'demo_thrift', name: 'Second Spin Thrift', category: 'shopping', area: 'Arts District · 1.7 km', priceLevel: 1, rating: 4.1, description: 'Vintage clothes, records and $1 bins.', tags: ['thrift', 'shopping', 'vintage'], distanceKm: 1.7, goodForGroups: false, indoor: true }),
  p({ placeId: 'demo_museum', name: 'City Museum of Art (Free Fridays)', category: 'arts', area: 'Museum Hill · 3.2 km', priceLevel: 0, rating: 4.6, description: 'Free admission Friday evenings; student discount other days.', tags: ['museum', 'art', 'free', 'indoor'], distanceKm: 3.2, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_pottery', name: 'Mud & Glaze Studio', category: 'arts', area: 'Arts District · 1.9 km', priceLevel: 3, rating: 4.7, description: 'Paint-your-own pottery, walk-ins welcome.', tags: ['pottery', 'paint', 'craft', 'art'], distanceKm: 1.9, goodForGroups: true, indoor: true }),
  p({ placeId: 'demo_icecream', name: 'Two Scoops Creamery', category: 'food', area: 'Downtown · 0.7 km', priceLevel: 1, rating: 4.6, description: 'Small-batch ice cream with dairy-free options.', tags: ['ice cream', 'dessert', 'food', 'cheap', 'vegan'], distanceKm: 0.7, goodForGroups: true, indoor: true }),
];

export const SAMPLE_AREA_LABEL = 'Sample City (demo)';
