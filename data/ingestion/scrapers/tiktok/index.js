import { resolveTikTokLink } from './resolveLink.js';
import { fetchPost } from './fetchPost.js';
import { fetchComments } from './fetchComments.js';
import { extractEvent } from './parseEvent.js';
import { geocodeAddress, buildGeocodeQuery } from '../../geocoding/mapbox.js';
import { classify, CATEGORIES } from '../classify.js';

/**
 * Runs the full TikTok "paste a link" extraction pipeline for one URL:
 * resolve -> fetch post -> fetch comments -> extract -> geocode -> classify.
 * Does NOT write anything to the DB — callers (the /preview API route, or
 * the verification script) decide what to do with the result. This is the
 * "extract" half split out from "write" so a synchronous preview doesn't
 * have to go through the write-then-read-back path every other scraper uses.
 *
 * Returns { canonicalUrl, awemeId, thumbnailUrl, authorUsername, rawData,
 *           extractedFields, venueName, address, categories, subCategories,
 *           lat, lng, geocodeConfidence }
 */
export async function extractTikTokImport(inputUrl) {
  const { canonicalUrl, awemeId } = await resolveTikTokLink(inputUrl);
  const post = await fetchPost(canonicalUrl);
  const comments = post.authorUid
    ? await fetchComments(awemeId, post.authorUid)
    : [];

  const extracted = await extractEvent({
    caption: post.caption,
    hashtags: post.hashtags,
    diversificationLabels: post.diversificationLabels,
    suggestedWords: post.suggestedWords,
    poi: post.poi,
    comments,
  });

  const venueName = extracted.venue_name?.value ?? null;
  const locationText = extracted.location_text?.value ?? null;

  let lat = null;
  let lng = null;
  let geocodeConfidence = null;
  if (locationText) {
    try {
      const token = process.env.MAPBOX_TOKEN;
      if (token) {
        const result = await geocodeAddress(buildGeocodeQuery(venueName, locationText), token);
        if (result) {
          lat = result.latitude;
          lng = result.longitude;
          geocodeConfidence = result.confidence;
        }
      }
    } catch (err) {
      console.warn(`[tiktok] geocode failed for "${locationText}": ${err.message}`);
    }
  }

  // extracted.category (when present) is already a final vocab value from
  // POI_CATEGORY_MAP in parseEvent.js, not a raw source label — classify()'s
  // `category` param instead expects a raw label to run through its
  // CATEGORY_ALIASES lookup (e.g. "market" -> "Shopping"), and "Shopping"
  // itself isn't an alias key, so passing it there is silently dropped.
  // Union it into the result directly instead, same as subCategoryHint's
  // "stronger and more precise than keyword RULES" treatment below, just at
  // the top-category level.
  const { categories: inferredCategories, subCategories } = classify({
    title: post.caption,
    description: null,
    category: null,
    tags: [...(post.hashtags ?? []), ...(extracted.sub_category_hint ? [extracted.sub_category_hint] : [])],
    venue_name: venueName,
    subCategoryHint: extracted.sub_category_hint,
  });
  const categories = extracted.category && CATEGORIES.includes(extracted.category)
    ? [...new Set([...inferredCategories, extracted.category])]
    : inferredCategories;

  return {
    canonicalUrl,
    awemeId,
    thumbnailUrl: post.thumbnailUrl,
    authorUsername: post.authorUsername,
    rawData: {
      caption: post.caption,
      hashtags: post.hashtags,
      diversificationLabels: post.diversificationLabels,
      suggestedWords: post.suggestedWords,
      poi: post.poi,
      comments,
      fetchSource: post.source,
    },
    extractedFields: {
      venue_name: extracted.venue_name,
      location_text: extracted.location_text,
    },
    venueName,
    address: locationText,
    categories,
    subCategories,
    lat,
    lng,
    geocodeConfidence,
  };
}
