// event_sources CRUD + health-tracking, parallel to db/funnel.js but for
// the generic-URL source registry rather than venues/events. Kept as its
// own module (not folded into funnel.js) since it's read/written
// exclusively by scrapers/genericurl/ and pipelines/onboard-source.js — not
// part of the shared upsertVenue/insertEvent path every other scraper goes
// through.
//
// Plain `.from('event_sources')` calls rather than RPCs for everything but
// the bulk health recompute: unlike upsert_venue/insert_event, nothing here
// needs PostGIS construction or a COALESCE-based progressive merge — a
// straightforward row update is enough, matching how runner.js already
// does plain `.from('venues').update(...)` for its own simple writes.

// Must stay in sync with the reason codes genericurl/pipeline.js can
// produce with a non-null reasonCode that ISN'T a real failure — a pipeline
// limitation (LLM budget hit) or a quality signal (low confidence), not the
// source itself being unreachable/broken.
const SOFT_REASON_CODES = new Set(['llm_budget_exhausted', 'render_unsupported']);

export async function getActiveSources(db) {
  const { data, error } = await db.from('event_sources').select('*').in('status', ['active', 'quiet']);
  if (error) throw new Error(`getActiveSources failed: ${error.message}`);
  return data ?? [];
}

export async function getSourceByUrl(db, url) {
  const { data, error } = await db.from('event_sources').select('*').eq('url', url).maybeSingle();
  if (error) throw new Error(`getSourceByUrl failed: ${error.message}`);
  return data;
}

async function getSourceById(db, id) {
  const { data, error } = await db.from('event_sources').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`getSourceById failed: ${error.message}`);
  return data;
}

// Always inserts as 'candidate' (never 'active') regardless of what the
// caller passes — promoting a freshly onboarded source to 'active' is a
// deliberate manual step (see supabase/reviews/event_sources_review.sql),
// not something the onboarding script decides on its own.
export async function insertSource(db, { url, venueId = null }) {
  const { data, error } = await db.from('event_sources')
    .insert({ url, venue_id: venueId, status: 'candidate' })
    .select('*')
    .single();
  if (error) throw new Error(`insertSource failed: ${error.message}`);
  return data;
}

function maxStartTime(rows) {
  const times = (rows ?? []).map(r => new Date(r.start_time)).filter(d => !isNaN(d));
  if (!times.length) return null;
  return new Date(Math.max(...times.map(d => d.getTime()))).toISOString();
}

// Records the outcome of one genericurl/pipeline.js processSource() call.
// Resets consecutive_failure_count to 0 on any check that wasn't a hard
// failure (even a zero-row 'success_empty'/'unchanged' result — the source
// was still successfully reached); increments it by 1 on a hard failure.
export async function recordSourceCheck(db, id, result) {
  const current = await getSourceById(db, id);
  const isHardFailure = result.reasonCode != null && !SOFT_REASON_CODES.has(result.reasonCode);

  const patch = { last_checked_at: result.checkedAt };

  if (isHardFailure) {
    patch.last_error = result.message ?? result.reasonCode;
    patch.last_error_reason_code = result.reasonCode;
    patch.consecutive_failure_count = (current?.consecutive_failure_count ?? 0) + 1;
  } else {
    patch.consecutive_failure_count = 0;
    patch.last_error = null;
    patch.last_error_reason_code = result.reasonCode ?? null;
  }

  if (result.contentHash)   patch.last_content_hash = result.contentHash;
  if (result.detectionTier) patch.detection_tier = result.detectionTier;
  if (result.renderMode)    patch.render_mode = result.renderMode;
  if (result.platform)      patch.platform = result.platform;

  if (result.status === 'success' || result.status === 'low_confidence') {
    patch.last_success_at = result.checkedAt;
    const newSeenAt = maxStartTime(result.rows);
    const prevSeenAt = current?.last_event_seen_at ? new Date(current.last_event_seen_at) : null;
    if (newSeenAt && (!prevSeenAt || new Date(newSeenAt) > prevSeenAt)) {
      patch.last_event_seen_at = newSeenAt;
    }
  }

  const { error } = await db.from('event_sources').update(patch).eq('id', id);
  if (error) throw new Error(`recordSourceCheck failed: ${error.message}`);
}

export async function recomputeSourceHealth(db) {
  const { data, error } = await db.rpc('recompute_source_health');
  if (error) throw new Error(`recompute_source_health failed: ${error.message}`);
  return data;
}
