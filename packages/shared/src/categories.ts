// The 12-value vocabulary below is copy-pasted verbatim (not retyped) from
// the CHECK constraints in
// supabase/migrations/20260626000000_add_categories.sql
// (`events_categories_vocab` / `venues_categories_vocab`). Both `events` and
// `venues` rows are schema-enforced to only ever contain these values —
// treat this file as derived from the DB constraint, not the other way
// around, and keep it in sync if that migration ever changes.

export const CATEGORY_IDS = [
  'Music',
  'Nightlife',
  'Visual Arts & Museums',
  'Arts & Crafts',
  'Arts & Performance',
  'Outdoors & Nature',
  'Food & Drink',
  'Community & Culture',
  'Talks & Education',
  'Wellness',
  'Fashion',
  'Shopping',
] as const;

export type OffmapCategory = (typeof CATEGORY_IDS)[number];

export type CategoryAccent = 'mint' | 'gold' | 'lavender' | 'coral';

export type CategoryMeta = {
  id: OffmapCategory;
  label: string;
  shortLabel: string;
  accent: CategoryAccent;
};

// Icon rendering is a web-specific concern (Phosphor React components) and
// deliberately doesn't live here — this package stays framework-agnostic.
// See apps/web/src/lib/icons.tsx for the id -> icon mapping.
//
// Accent assignment extrapolates from the two example category colors shown
// in the reference mockup (mint for music-adjacent culture, gold for
// food/community) across all 12 real categories — reasonable defaults, not
// a literal spec, adjust freely once real chips/pins are visible.
export const CATEGORIES: CategoryMeta[] = [
  { id: 'Music', label: 'Music', shortLabel: 'Music', accent: 'mint' },
  { id: 'Nightlife', label: 'Nightlife', shortLabel: 'Nightlife', accent: 'coral' },
  { id: 'Visual Arts & Museums', label: 'Visual Arts & Museums', shortLabel: 'Museums', accent: 'mint' },
  { id: 'Arts & Crafts', label: 'Arts & Crafts', shortLabel: 'Crafts', accent: 'gold' },
  { id: 'Arts & Performance', label: 'Arts & Performance', shortLabel: 'Performance', accent: 'coral' },
  { id: 'Outdoors & Nature', label: 'Outdoors & Nature', shortLabel: 'Outdoors', accent: 'lavender' },
  { id: 'Food & Drink', label: 'Food & Drink', shortLabel: 'Food &…', accent: 'gold' },
  { id: 'Community & Culture', label: 'Community & Culture', shortLabel: 'Community', accent: 'gold' },
  { id: 'Talks & Education', label: 'Talks & Education', shortLabel: 'Talks', accent: 'lavender' },
  { id: 'Wellness', label: 'Wellness', shortLabel: 'Wellness', accent: 'lavender' },
  { id: 'Fashion', label: 'Fashion', shortLabel: 'Fashion', accent: 'coral' },
  { id: 'Shopping', label: 'Shopping', shortLabel: 'Shopping', accent: 'gold' },
];

const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategoryMeta(id: string): CategoryMeta | undefined {
  return CATEGORY_BY_ID.get(id as OffmapCategory);
}

// Picks one category to represent a row that may carry several (an event
// can land in multiple categories at once, e.g. a farmers market hits both
// Food & Drink and Shopping) — first match against the canonical order above
// wins, so display stays deterministic.
export function primaryCategory(categories: string[]): CategoryMeta | undefined {
  for (const meta of CATEGORIES) {
    if (categories.includes(meta.id)) return meta;
  }
  return undefined;
}

// `sub_categories` is intentionally freeform (unlike the controlled
// `categories` vocabulary) — real values are sparse and activity-type, not a
// fixed taxonomy (see scrapers/classify.js RULES). This just collects
// whatever's actually present across a set of events/venues, alphabetized.
export function deriveSubcategories(lists: string[][]): string[] {
  const set = new Set<string>();
  for (const list of lists) {
    for (const sub of list) set.add(sub);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
