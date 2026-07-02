import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDb } from '../db/supabase.js';
import { NYC } from '../db/funnel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '../../public');

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
      const { error: recomputeError } = await db.rpc('recompute_can_display');
      if (recomputeError) throw recomputeError;

      res.json({ ok: true, id: Number(req.params.id), status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}
