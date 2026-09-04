import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDb } from '../db/supabase.js';
import { NYC, upsertVenue, insertEvent, classifyRow } from '../db/funnel.js';
import { createDraft, getDraftById, markDraftConfirmed } from '../db/socialImportDrafts.js';
import { extractTikTokImport } from '../scrapers/tiktok/index.js';
import { geocodeAddress, buildGeocodeQuery } from '../geocoding/mapbox.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '../public');

const EVENT_COLUMNS = `
  id, external_id, duplicate_group_id,
  title, normalized_title, description, category, tags, search_text,
  start_time, end_time, timezone, recurrence_rule,
  price_text, is_free, age_restriction,
  ticket_url, organizer_name,
  image_url, image_source_url, image_credit, image_license,
  can_display,
  source_url, source_name, source_fetched_at, source_updated_at, last_verified_at,
  review_status, confidence_score, completeness_score, notes,
  venues!inner(name, normalized_venue_name, address, address_line, city, region, postal_code, country,
    latitude, longitude, neighborhood, venue_opening_hours, geocode_provider, geocode_confidence, geocoded_at)
`;

// Categories change only when new venues/events are scraped in (at most a
// few times a day), so a short TTL cache saves a full-table scan on every
// filter-bar render without meaningfully delaying new categories showing up.
const CATEGORIES_CACHE_MS = 5 * 60 * 1000;
let categoriesCache = null; // { at, data }

// This service has so far only ever been called by the admin page it serves
// itself (same origin) and by internal cron/CLI scripts using the
// service_role key. The /api/import/* routes below are the first thing on
// it a public web frontend calls directly — a different trust boundary —
// so they get their own light request validation and rate limiting rather
// than inheriting the rest of this file's implicit "trusted caller" posture.

const ALLOWED_TIKTOK_HOSTS = /(^|\.)tiktok\.com$/;

// Simple fixed-window in-memory limiter — good enough for a single-instance
// service guarding an expensive (LLM + several outbound fetches) route
// against accidental hammering, not a hardened defense. Resets on restart,
// which is fine for this purpose.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitHits = new Map(); // ip -> { count, windowStart }

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const entry = rateLimitHits.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitHits.set(ip, { count: 1, windowStart: now });
    return next();
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests — try again in a minute.' });
  }
  next();
}

function importCors(req, res, next) {
  const origin = process.env.WEB_APP_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

export function createServer() {
  const app = express();
  const db = getDb();

  // Serve index.html with the Mapbox token injected server-side
  app.get('/', (req, res) => {
    const html = readFileSync(join(PUBLIC, 'index.html'), 'utf8')
      .replace('__MAPBOX_TOKEN__', process.env.MAPBOX_TOKEN ?? '');
    res.type('html').send(html);
  });

  app.use(express.static(PUBLIC));

  // GeoJSON feed — only approved events inside NYC with coordinates
  app.get('/api/events', async (req, res) => {
    try {
      const { category, is_free, from, to, status } = req.query;

      // Allow ?status=candidate for local dev to ALSO preview pre-approval
      // events — but always include 'approved' too, otherwise approving an
      // event (review_status: 'candidate'/'needs_review' -> 'approved')
      // makes it stop matching this filter and vanish from the map.
      const statuses = status === 'candidate' ? ['candidate', 'approved'] : ['approved'];

      let query = db
        .from('events')
        .select(EVENT_COLUMNS)
        .in('review_status', statuses)
        .eq('can_display', true)
        .not('venues.latitude', 'is', null)
        .not('venues.longitude', 'is', null)
        .gte('venues.longitude', NYC.minLng)
        .lte('venues.longitude', NYC.maxLng)
        .gte('venues.latitude', NYC.minLat)
        .lte('venues.latitude', NYC.maxLat)
        .order('start_time', { ascending: true });

      if (category) query = query.eq('category', category);
      if (is_free !== undefined) query = query.eq('is_free', is_free === 'true');
      // Default to "from now" so finished events don't accumulate on the map forever.
      query = query.gte('start_time', from || new Date().toISOString());
      if (to) query = query.lte('start_time', to);

      const { data, error } = await query;
      if (error) throw error;

      // Two sources reporting the same real-world event both pass can_display
      // — recompute_duplicate_groups() only tags them with a shared
      // duplicate_group_id, it doesn't hide either one. Keep just the
      // canonical row per group (the smallest id, which is what
      // duplicate_group_id is built from: 'dup-' + min(id)).
      const deduped = data.filter(e => !e.duplicate_group_id || e.duplicate_group_id === `dup-${e.id}`);

      res.json({
        type: 'FeatureCollection',
        features: deduped.map(e => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [e.venues.longitude, e.venues.latitude] },
          properties: {
            id:                 e.id,
            external_id:        e.external_id,
            duplicate_group_id: e.duplicate_group_id,
            title:              e.title,
            normalized_title:   e.normalized_title,
            description:        e.description,
            category:           e.category,
            tags:               e.tags ?? [],
            search_text:        e.search_text,
            start_time:         e.start_time,
            end_time:           e.end_time,
            timezone:           e.timezone,
            recurrence_rule:    e.recurrence_rule,
            price_text:         e.price_text,
            is_free:            e.is_free,
            age_restriction:    e.age_restriction,
            ticket_url:         e.ticket_url,
            organizer_name:     e.organizer_name,
            image_url:          e.image_url,
            image_source_url:   e.image_source_url,
            image_credit:       e.image_credit,
            image_license:      e.image_license,
            source_url:         e.source_url,
            source_name:        e.source_name,
            source_fetched_at:  e.source_fetched_at,
            source_updated_at:  e.source_updated_at,
            last_verified_at:   e.last_verified_at,
            review_status:      e.review_status,
            confidence_score:   e.confidence_score,
            completeness_score: e.completeness_score,
            notes:              e.notes,
            venue_name:            e.venues.name,
            normalized_venue_name: e.venues.normalized_venue_name,
            venue_address:         e.venues.address,
            address_line:          e.venues.address_line,
            city:                  e.venues.city,
            region:                e.venues.region,
            postal_code:           e.venues.postal_code,
            country:               e.venues.country,
            neighborhood:          e.venues.neighborhood,
            venue_opening_hours:   e.venues.venue_opening_hours,
            geocode_provider:      e.venues.geocode_provider,
            geocode_confidence:    e.venues.geocode_confidence,
            geocoded_at:           e.venues.geocoded_at,
          },
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Distinct categories for filter UI
  app.get('/api/categories', async (req, res) => {
    try {
      if (categoriesCache && Date.now() - categoriesCache.at < CATEGORIES_CACHE_MS) {
        return res.json(categoriesCache.data);
      }

      const { data, error } = await db
        .from('events')
        .select('category, venues!inner(longitude, latitude)')
        .not('category', 'is', null)
        .gte('venues.longitude', NYC.minLng)
        .lte('venues.longitude', NYC.maxLng)
        .gte('venues.latitude', NYC.minLat)
        .lte('venues.latitude', NYC.maxLat);
      if (error) throw error;

      const categories = [...new Set(data.map(r => r.category))].sort();
      categoriesCache = { at: Date.now(), data: categories };
      res.json(categories);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Approve / reject a single event (lightweight review action)
  app.post('/api/events/:id/status', express.json(), async (req, res) => {
    try {
      const { status } = req.body ?? {};
      const allowed = ['approved', 'rejected', 'needs_review'];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
      }

      const { data, error } = await db
        .from('events')
        .update({ review_status: status })
        .eq('id', req.params.id)
        .select('id');
      if (error) throw error;
      if (!data.length) return res.status(404).json({ error: 'Event not found' });

      // can_display is a stored column, not computed on read — without this,
      // an approved event stays invisible until the next `npm run scrape`.
      // Recompute is a full-table pass; don't make the admin wait on it —
      // fire it off and respond immediately, logging failures server-side.
      db.rpc('recompute_can_display').then(({ error: recomputeError }) => {
        if (recomputeError) console.error(`[server] recompute_can_display failed: ${recomputeError.message}`);
      });

      res.json({ ok: true, id: Number(req.params.id), status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // "Paste a TikTok link" import — preview: extract-only, no events/venues
  // write. Persists the raw scrape + extraction as a social_import_drafts
  // row (status='draft') so the provenance survives even after a human
  // edits fields in the review form, and so confirm below doesn't have to
  // re-scrape TikTok (whose unofficial endpoints this relies on may not
  // even be re-fetchable later, e.g. a deleted video).
  app.post('/api/import/tiktok/preview', importCors, rateLimit, express.json(), async (req, res) => {
    try {
      const { url } = req.body ?? {};
      if (typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ error: 'url is required' });
      }

      let hostname;
      try {
        hostname = new URL(url).hostname;
      } catch {
        return res.status(400).json({ error: 'url is not a valid URL' });
      }
      if (!ALLOWED_TIKTOK_HOSTS.test(hostname)) {
        return res.status(400).json({ error: 'url must be a tiktok.com link' });
      }

      const extracted = await extractTikTokImport(url);

      const draft = await createDraft(db, {
        platform: 'tiktok',
        sourceUrl: extracted.canonicalUrl,
        rawData: extracted.rawData,
        extractedFields: extracted.extractedFields,
      });

      res.json({
        draft_id: draft.id,
        source_url: extracted.canonicalUrl,
        thumbnail_url: extracted.thumbnailUrl,
        author_username: extracted.authorUsername,
        venue_name: extracted.extractedFields.venue_name,
        location_text: extracted.extractedFields.location_text,
        categories: extracted.categories,
        sub_categories: extracted.subCategories,
        lat: extracted.lat,
        lng: extracted.lng,
        geocode_confidence: extracted.geocodeConfidence,
      });
    } catch (err) {
      console.error(`[server] tiktok preview failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // "Paste a TikTok link" import — confirm: takes the (possibly user-edited)
  // fields from preview and writes them through the same upsert_venue /
  // insert_event funnel every other scraper uses. Always creates/updates a
  // venue; only creates an event row if the submitter supplied a
  // start_time — most TikTok "here's a spot" content has no scheduled date,
  // matching the existing venue-only pattern (scrapers/museums.js) rather
  // than forcing a fake start_time into a NOT NULL column.
  app.post('/api/import/tiktok/confirm', importCors, rateLimit, express.json(), async (req, res) => {
    try {
      const {
        draft_id, title, venue_name, address, venue_city, venue_region,
        categories, sub_categories, start_time, end_time, description,
        submitted_by_user_id,
      } = req.body ?? {};

      if (!draft_id) return res.status(400).json({ error: 'draft_id is required' });
      if (!venue_name || !address) {
        return res.status(400).json({ error: 'venue_name and address are required' });
      }

      const draft = await getDraftById(db, draft_id);
      if (!draft) return res.status(404).json({ error: 'draft not found' });
      if (draft.status === 'confirmed') {
        return res.status(409).json({ error: 'draft already confirmed' });
      }

      const row = {
        title: title ?? venue_name,
        description: description ?? null,
        venue_name,
        venue_address: address,
        venue_city: venue_city ?? null,
        venue_region: venue_region ?? null,
        // No venue_lat/venue_lng here deliberately — upsertVenue() treats
        // any coords a caller supplies as fully trusted (confidence 1.0),
        // which is right for a scraper's own ground-truth API coords but
        // wrong for a Mapbox guess we made ourselves. Geocode separately
        // below via set_venue_geocode, which carries Mapbox's own
        // real confidence instead of a hardcoded 1.0.
        tags: draft.raw_data?.hashtags ?? [],
        category: null,
        sub_category_hint: sub_categories?.[0] ?? null,
        source_url: draft.source_url,
        source_name: 'tiktok',
        submitted_by_user_id: submitted_by_user_id ?? null,
      };
      // categories/sub_categories from the draft's own extraction take
      // priority over classify()'s generic keyword scan when present —
      // pass them straight through rather than re-classifying.
      const classification = categories?.length
        ? { categories, subCategories: sub_categories ?? [] }
        : classifyRow(row);

      const venueId = await upsertVenue(db, row, classification);

      // Geocode the (possibly user-edited) address as of right now rather
      // than trusting whatever preview computed earlier, and only apply it
      // if the venue doesn't already have coordinates from elsewhere —
      // upsertVenue may have matched an existing, already-geocoded venue
      // via its unique name+address index, and set_venue_geocode has no
      // coalesce guard of its own (see geocoding/mapbox.js).
      const mapboxToken = process.env.MAPBOX_TOKEN;
      if (mapboxToken) {
        try {
          const { data: existing } = await db.from('venues').select('latitude, longitude').eq('id', venueId).single();
          if (existing?.latitude == null || existing?.longitude == null) {
            const geocoded = await geocodeAddress(buildGeocodeQuery(venue_name, address), mapboxToken);
            if (geocoded) {
              await db.rpc('set_venue_geocode', {
                p_venue_id: venueId,
                p_lat: geocoded.latitude,
                p_lng: geocoded.longitude,
                p_neighborhood: geocoded.neighborhood,
                p_confidence: geocoded.confidence,
                p_provider: 'mapbox',
              });
            }
          }
        } catch (err) {
          console.warn(`[server] confirm-time geocode failed: ${err.message}`);
        }
      }

      let eventId = null;
      if (start_time) {
        await insertEvent(db, venueId, {
          ...row,
          start_time,
          end_time: end_time ?? null,
          review_status: 'needs_review',
          confidence_score: draft.extracted_fields?.venue_name?.confidence ?? null,
        }, new Date().toISOString(), classification);
        // insert_event returns only a boolean (ON CONFLICT (source_url) DO
        // NOTHING) — look the row back up by its unique source_url to get
        // the actual id to record on the draft.
        const { data: eventRow } = await db.from('events').select('id').eq('source_url', row.source_url).maybeSingle();
        eventId = eventRow?.id ?? null;
      }

      await markDraftConfirmed(db, draft.id, { eventId, venueId });

      res.json({ ok: true, venue_id: venueId, event_created: Boolean(start_time), draft_id: draft.id });
    } catch (err) {
      console.error(`[server] tiktok confirm failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}
