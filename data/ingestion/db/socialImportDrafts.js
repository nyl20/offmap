// social_import_drafts CRUD — parallel to db/eventSources.js but for the
// pre-confirmation staging table behind "paste a link" imports (TikTok
// first). Plain `.from('social_import_drafts')` calls, same reasoning as
// eventSources.js: nothing here needs PostGIS construction or a
// COALESCE-based progressive merge, just straightforward row writes.

export async function createDraft(db, { platform, sourceUrl, rawData, extractedFields, submittedByUserId = null }) {
  const { data, error } = await db.from('social_import_drafts')
    .insert({
      platform,
      source_url: sourceUrl,
      raw_data: rawData,
      extracted_fields: extractedFields,
      submitted_by_user_id: submittedByUserId,
      status: 'draft',
    })
    .select('*')
    .single();
  if (error) throw new Error(`createDraft failed: ${error.message}`);
  return data;
}

export async function getDraftById(db, id) {
  const { data, error } = await db.from('social_import_drafts').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`getDraftById failed: ${error.message}`);
  return data;
}

export async function markDraftConfirmed(db, id, { eventId = null, venueId = null }) {
  const { error } = await db.from('social_import_drafts')
    .update({ status: 'confirmed', event_id: eventId, venue_id: venueId })
    .eq('id', id);
  if (error) throw new Error(`markDraftConfirmed failed: ${error.message}`);
}

export async function markDraftDiscarded(db, id) {
  const { error } = await db.from('social_import_drafts').update({ status: 'discarded' }).eq('id', id);
  if (error) throw new Error(`markDraftDiscarded failed: ${error.message}`);
}
