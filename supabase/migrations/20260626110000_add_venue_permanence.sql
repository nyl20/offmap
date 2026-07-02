-- Marks venues that are permanent, standing places (a museum, a park, a
-- botanic garden) as opposed to a venue that only exists in our data because
-- a one-off event happened to be held there (a bar hosting a single pop-up,
-- a warehouse party space, etc). `is_permanent` lets the app surface a
-- "landmarks" view independent of whether the venue currently has any
-- upcoming events, and `website_url` gives that view a place to link out to
-- rather than falling back to event-level source_url (which often points at
-- a single event page, not the venue itself).

alter table venues add column is_permanent boolean not null default false;
alter table venues add column website_url  text;

create index idx_venues_is_permanent on venues (is_permanent) where is_permanent;

-- ---------------------------------------------------------------- heuristic ---
-- scrapers/museums.js (osm_museums) is a venueOnly scraper — it exists
-- specifically to seed permanent museum/gallery venues from OpenStreetMap
-- independent of any event, so anything it has produced is permanent by
-- construction. geocode_provider = 'OpenStreetMap' is set by upsertVenue
-- only when that scraper supplied trusted lat/lng (src/db/funnel.js), making
-- it a reliable fingerprint for "came from the permanent-venue scraper" —
-- gated additionally on the Visual Arts & Museums category so a future OSM
-- source covering some other tag scheme doesn't get swept in here too.
update venues
set is_permanent = true
where geocode_provider = 'OpenStreetMap'
  and categories && array['Visual Arts & Museums']::text[];

-- ----------------------------------------------------------- curated seeds ---
-- Beyond what the scrapers happen to have produced, a short hand-curated
-- list of marquee NYC institutions (the kind a user would expect to always
-- find, MET/Central Park style) — each with its real street address and
-- official website. Matched against existing rows by a distinctive
-- substring of the name (case-insensitive) rather than the exact
-- name+address pair upsert_venue uses, since address formatting from
-- different scrapers/sources varies (e.g. "5th Ave" vs "Fifth Avenue") and
-- an exact-pair match would silently create duplicate rows instead of
-- enriching the existing one.
with seed (match_pattern, name, address, address_line, city, region, postal_code,
           lat, lng, website_url, category) as (
  values
    ('metropolitan museum of art',     'The Metropolitan Museum of Art',     '1000 5th Ave, New York, NY 10028',        '1000 5th Ave',          'New York', 'NY', '10028', 40.7794, -73.9632, 'https://www.metmuseum.org',     'Visual Arts & Museums'),
    ('museum of modern art',           'Museum of Modern Art (MoMA)',        '11 W 53rd St, New York, NY 10019',        '11 W 53rd St',          'New York', 'NY', '10019', 40.7614, -73.9776, 'https://www.moma.org',          'Visual Arts & Museums'),
    ('brooklyn museum',                'Brooklyn Museum',                    '200 Eastern Pkwy, Brooklyn, NY 11238',    '200 Eastern Pkwy',      'Brooklyn', 'NY', '11238', 40.6712, -73.9636, 'https://www.brooklynmuseum.org','Visual Arts & Museums'),
    ('american museum of natural history', 'American Museum of Natural History', '200 Central Park West, New York, NY 10024', '200 Central Park West', 'New York', 'NY', '10024', 40.7813, -73.9740, 'https://www.amnh.org',     'Visual Arts & Museums'),
    ('guggenheim',                     'Solomon R. Guggenheim Museum',       '1071 5th Ave, New York, NY 10128',        '1071 5th Ave',          'New York', 'NY', '10128', 40.7830, -73.9590, 'https://www.guggenheim.org',    'Visual Arts & Museums'),
    ('whitney museum',                 'Whitney Museum of American Art',     '99 Gansevoort St, New York, NY 10014',    '99 Gansevoort St',      'New York', 'NY', '10014', 40.7396, -74.0089, 'https://whitney.org',           'Visual Arts & Museums'),
    ('brooklyn botanic garden',        'Brooklyn Botanic Garden',            '990 Washington Ave, Brooklyn, NY 11225',  '990 Washington Ave',    'Brooklyn', 'NY', '11225', 40.6694, -73.9626, 'https://www.bbg.org',           'Outdoors & Nature'),
    ('new york botanical garden',      'New York Botanical Garden',          '2900 Southern Blvd, Bronx, NY 10458',     '2900 Southern Blvd',    'Bronx',    'NY', '10458', 40.8676, -73.8773, 'https://www.nybg.org',          'Outdoors & Nature'),
    ('central park',                   'Central Park',                       'Central Park, New York, NY 10024',        null,                    'New York', 'NY', '10024', 40.7829, -73.9654, 'https://www.centralparknyc.org','Outdoors & Nature'),
    ('prospect park',                  'Prospect Park',                      '95 Prospect Park West, Brooklyn, NY 11215', '95 Prospect Park West', 'Brooklyn', 'NY', '11215', 40.6602, -73.9690, 'https://www.prospectpark.org', 'Outdoors & Nature'),
    ('bryant park',                    'Bryant Park',                        '1000 6th Ave, New York, NY 10018',        '1000 6th Ave',          'New York', 'NY', '10018', 40.7536, -73.9832, 'https://bryantpark.org',        'Outdoors & Nature'),
    ('high line',                      'The High Line',                      '820 Washington St, New York, NY 10014',   '820 Washington St',     'New York', 'NY', '10014', 40.7480, -74.0048, 'https://www.thehighline.org',   'Outdoors & Nature')
),
matched as (
  update venues v set
    is_permanent       = true,
    website_url        = coalesce(v.website_url, s.website_url),
    address_line       = coalesce(v.address_line, s.address_line),
    city               = coalesce(v.city, s.city),
    region             = coalesce(v.region, s.region),
    postal_code        = coalesce(v.postal_code, s.postal_code),
    categories         = coalesce((select array_agg(distinct c) from unnest(v.categories || array[s.category]) c), '{}'),
    location           = coalesce(v.location, st_setsrid(st_makepoint(s.lng, s.lat), 4326)::geography),
    geocode_provider   = coalesce(v.geocode_provider, 'curated'),
    geocode_confidence = coalesce(v.geocode_confidence, 1.0),
    geocoded_at        = coalesce(v.geocoded_at, now())
  from seed s
  where v.name ilike '%' || s.match_pattern || '%'
  returning s.match_pattern
)
insert into venues (
  name, address, address_line, city, region, postal_code, country,
  normalized_venue_name, categories, location,
  geocode_provider, geocode_confidence, geocoded_at,
  is_permanent, website_url
)
select
  s.name, s.address, s.address_line, s.city, s.region, s.postal_code, 'US',
  trim(regexp_replace(regexp_replace(lower(s.name), '[^a-z0-9\s]', ' ', 'g'), '\s+', ' ', 'g')),
  array[s.category],
  st_setsrid(st_makepoint(s.lng, s.lat), 4326)::geography,
  'curated', 1.0, now(),
  true, s.website_url
from seed s
where s.match_pattern not in (select match_pattern from matched);
