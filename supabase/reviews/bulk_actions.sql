-- One-time cleanup: purge already-inserted kids/senior/family-only events
-- that predate the isExcludedAudience() filter added to
-- src/scrapers/runner.js (src/scrapers/utils.js:EXCLUDED_AUDIENCE_PATTERNS).
--
-- Not part of the regular pipeline — run once by hand in the Supabase SQL
-- Editor. Going forward, runner.js drops these before they're ever written,
-- so this script should not need to be re-run after the next full scrape.
--
-- Keep this keyword list in sync with EXCLUDED_AUDIENCE_PATTERNS in
-- src/scrapers/utils.js — update both together.
--
-- DESTRUCTIVE — this permanently deletes matching rows, with no soft-delete
-- or backup. Review the SELECT below before running the DELETE.

-- Preview what would be deleted:
-- select id, title, source_name, source_url
-- from events
-- where title ILIKE ANY (ARRAY[
--   '%kids%', '%for kids%', '%for children%', '%kid-friendly%', '%kidfriendly%', '%children''s%',
--   '%childrens%', '%toddler%', '%storytime%', '%story time%', '%youth%', '%junior%',
--   '%after school%', '%afterschool%', '%school break%', '%camp%', '%little ones%',
--   '%baby%', '%babies%', '%ages 5%', '%ages 3%', '%under 12%',
--   '%seniors%', '%senior center%', '%elderly%', '%55+%', '%60+%', '%65+%', '%70+%',
--   '%aging%', '%older adults%', '%caregiver%', '%dementia%', '%memory care%',
--   '%retirement%', '%aarp%',
--   '%family friendly%', '%family-friendly%', '%all ages%', '%all-ages%',
--   '%bring the kids%', '%bring your kids%', '%families welcome%',
--   '%kids welcome%', '%children welcome%'
-- ])
-- or description ILIKE ANY (ARRAY[
--   '%kids%', '%for kids%', '%for children%', '%kid-friendly%', '%kidfriendly%', '%children''s%',
--   '%childrens%', '%toddler%', '%storytime%', '%story time%', '%youth%', '%junior%',
--   '%after school%', '%afterschool%', '%school break%', '%camp%', '%little ones%',
--   '%baby%', '%babies%', '%ages 5%', '%ages 3%', '%under 12%',
--   '%seniors%', '%senior center%', '%elderly%', '%55+%', '%60+%', '%65+%', '%70+%',
--   '%aging%', '%older adults%', '%caregiver%', '%dementia%', '%memory care%',
--   '%retirement%', '%aarp%',
--   '%family friendly%', '%family-friendly%', '%all ages%', '%all-ages%',
--   '%bring the kids%', '%bring your kids%', '%families welcome%',
--   '%kids welcome%', '%children welcome%'
-- ]);

DELETE FROM events
WHERE title ILIKE ANY (ARRAY[
  '%kids%', '%for kids%', '%for children%', '%kid-friendly%', '%kidfriendly%', '%children''s%',
  '%childrens%', '%toddler%', '%storytime%', '%story time%', '%youth%', '%junior%',
  '%after school%', '%afterschool%', '%school break%', '%camp%', '%little ones%',
  '%baby%', '%babies%', '%ages 5%', '%ages 3%', '%under 12%',
  '%seniors%', '%senior center%', '%elderly%', '%55+%', '%60+%', '%65+%', '%70+%',
  '%aging%', '%older adults%', '%caregiver%', '%dementia%', '%memory care%',
  '%retirement%', '%aarp%',
  '%family friendly%', '%family-friendly%', '%all ages%', '%all-ages%',
  '%bring the kids%', '%bring your kids%', '%families welcome%',
  '%kids welcome%', '%children welcome%'
])
OR description ILIKE ANY (ARRAY[
  '%kids%', '%for kids%', '%for children%', '%kid-friendly%', '%kidfriendly%', '%children''s%',
  '%childrens%', '%toddler%', '%storytime%', '%story time%', '%youth%', '%junior%',
  '%after school%', '%afterschool%', '%school break%', '%camp%', '%little ones%',
  '%baby%', '%babies%', '%ages 5%', '%ages 3%', '%under 12%',
  '%seniors%', '%senior center%', '%elderly%', '%55+%', '%60+%', '%65+%', '%70+%',
  '%aging%', '%older adults%', '%caregiver%', '%dementia%', '%memory care%',
  '%retirement%', '%aarp%',
  '%family friendly%', '%family-friendly%', '%all ages%', '%all-ages%',
  '%bring the kids%', '%bring your kids%', '%families welcome%',
  '%kids welcome%', '%children welcome%'
]);

-- One-time cleanup: purge already-inserted events whose start_time has
-- already passed, matching the past-event filter added to
-- src/scrapers/runner.js. Going forward, runner.js drops these before
-- they're ever written, so this should not need to be re-run after the
-- next full scrape.
--
-- DESTRUCTIVE — permanently deletes matching rows, no soft-delete/backup.

DELETE FROM events WHERE start_time < now();
