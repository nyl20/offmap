// Hand-written row types matching the live schema in supabase/migrations.
// No `supabase gen types typescript` yet — no Supabase CLI project link exists
// in this repo. Re-generate from the CLI once one does; until then keep these
// in sync with supabase/migrations/20260621000000_init_schema.sql,
// 20260626000000_add_categories.sql, 20260626110000_add_venue_permanence.sql,
// and 20260703000000_add_venue_enrichment_fields.sql by hand.

export type VenueRow = {
  id: number;
  name: string;
  address: string;
  address_line: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
  venue_opening_hours: string | null;
  is_permanent: boolean;
  website_url: string | null;
  description: string | null;
  phone: string | null;
  image_url: string | null;
  categories: string[];
  sub_categories: string[];
};

export type EventRow = {
  id: number;
  venue_id: number;
  title: string;
  description: string | null;
  categories: string[];
  sub_categories: string[];
  start_time: string;
  end_time: string | null;
  price_text: string | null;
  is_free: boolean;
  image_url: string | null;
  source_url: string;
  ticket_url: string | null;
  organizer_name: string | null;
};

// Minimal venue shape embedded in an event-with-venue join — just enough for
// address/hours/website on an event detail page, not the full VenueRow.
export type EventVenueRow = Pick<
  VenueRow,
  | 'id'
  | 'name'
  | 'address'
  | 'address_line'
  | 'city'
  | 'region'
  | 'neighborhood'
  | 'website_url'
  | 'venue_opening_hours'
  | 'latitude'
  | 'longitude'
>;

export type EventWithVenueRow = EventRow & {
  venues: EventVenueRow | null;
};
