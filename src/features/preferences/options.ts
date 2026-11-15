export const ACTIVITY_OPTIONS = [
  { value: 'restaurants', label: 'Restaurants', emoji: '🍜' },
  { value: 'cafes', label: 'Cafes', emoji: '☕️' },
  { value: 'movies', label: 'Movies', emoji: '🎬' },
  { value: 'sports', label: 'Sports', emoji: '🏀' },
  { value: 'outdoors', label: 'Outdoors', emoji: '🌲' },
  { value: 'gaming', label: 'Gaming', emoji: '🎮' },
  { value: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { value: 'entertainment', label: 'Shows & events', emoji: '🎤' },
  { value: 'exploring new places', label: 'Exploring new places', emoji: '🧭' },
  { value: 'bowling', label: 'Bowling', emoji: '🎳' },
  { value: 'climbing', label: 'Climbing', emoji: '🧗' },
  { value: 'karaoke', label: 'Karaoke', emoji: '🎙️' },
  { value: 'museums', label: 'Museums & art', emoji: '🖼️' },
  { value: 'thrifting', label: 'Thrifting', emoji: '👕' },
  { value: 'arcades', label: 'Arcades', emoji: '🕹️' },
  { value: 'concerts', label: 'Concerts', emoji: '🎶' },
];

export const CUISINE_OPTIONS = ['mexican', 'japanese', 'korean', 'chinese', 'thai', 'indian', 'italian', 'american', 'mediterranean', 'vietnamese', 'pizza', 'burgers', 'desserts', 'boba'];
export const DIETARY_OPTIONS = ['vegetarian', 'vegan', 'halal', 'kosher', 'gluten-free', 'dairy-free', 'nut allergy'];
export const RESTAURANT_STYLES = ['quick & casual', 'sit-down', 'food trucks', 'late night', 'brunch spots'];
export const TIME_OPTIONS = ['weekday afternoons', 'weekday evenings', 'weekend mornings', 'weekend afternoons', 'weekend evenings'];
export const DISLIKE_OPTIONS = ['crowds', 'loud places', 'long drives', 'scary movies', 'heights', 'shopping', 'spicy food', 'early mornings'];
export const ACCESSIBILITY_OPTIONS = ['wheelchair access', 'step-free entry', 'quiet spaces', 'seating available', 'sensory-friendly'];
export const DISTANCE_OPTIONS = [
  { value: 2, label: 'Walkable', sub: '≤ 2 km' },
  { value: 5, label: 'Short ride', sub: '≤ 5 km' },
  { value: 15, label: 'Across town', sub: '≤ 15 km' },
  { value: 40, label: 'Road trip ok', sub: '≤ 40 km' },
];
export const BUDGET_OPTIONS = [
  { value: 'free', label: 'Free', sub: 'Parks, hangouts', emoji: '🆓' },
  { value: 'under_15', label: 'Under $15', sub: 'Snacks, boba', emoji: '🪙' },
  { value: '15_30', label: '$15–30', sub: 'Most outings', emoji: '💵' },
  { value: '30_50', label: '$30–50', sub: 'Bigger nights', emoji: '💳' },
  { value: '50_plus', label: '$50+', sub: 'Special occasions', emoji: '✨' },
] as const;
