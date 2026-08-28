-- Ongoing manual review workflow for low-confidence cross-name venue
-- duplicate candidates — populated every scrape by
-- queue_low_confidence_venue_duplicates() (see migrations/
-- 20260802000000_add_venue_cross_name_dedup.sql). High-confidence pairs
-- (same website domain, or one name containing the other within 75m) are
-- auto-merged by merge_cross_name_duplicate_venues() and never reach this
-- queue; everything here needs a human to look at it before anything
-- changes — there's no admin UI yet, so this is run by hand in the Supabase
-- SQL Editor, same pattern as bulk_actions.sql.
--
-- Not part of the regular pipeline. Run periodically (e.g. after checking
-- scrape logs) to work through the backlog.

-- 1. See what's pending, highest-similarity first:
select * from pending_venue_duplicate_review;

-- 2. For a pair that IS the same place: pick whichever venue has the more
--    complete data as the winner (see venues.completeness_score), merge the
--    other into it, and mark the candidate reviewed. merge_venue_into()
--    COALESCE-merges fields, repoints events, and deletes the loser row —
--    same function the automatic merge passes use.
--
-- select merge_venue_into(<winner_id>, <loser_id>);
-- update venue_duplicate_candidates
--   set status = 'confirmed_merge', reviewed_at = now()
--   where least(venue_id_a, venue_id_b) = least(<winner_id>, <loser_id>)
--     and greatest(venue_id_a, venue_id_b) = greatest(<winner_id>, <loser_id>);

-- 3. For a pair that is NOT the same place (a false positive — two distinct
--    venues that happen to be near each other with similar names): reject
--    it so it isn't re-queued by a future scrape.
--
-- update venue_duplicate_candidates
--   set status = 'rejected', reviewed_at = now(), reviewed_note = '<why not a match>'
--   where id = <candidate_id>;
