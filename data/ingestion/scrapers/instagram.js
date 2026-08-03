import { extractMedia } from './instagram/extractMedia.js';
import { parseEvents } from './instagram/parseEvent.js';
import { fetchApifyPosts } from './instagram/fetchApify.js';

export const name = 'instagram';
export const envKey = 'APIFY_TOKEN';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export async function fetchEvents() {
  const posts = await fetchApifyPosts();
  console.log(`[instagram] ${posts.length} new posts to process`);

  const events = [];

  for (const post of posts) {
    try {
      const extractedText = await extractMedia(post.media_paths ?? []);

      const parsedEvents = await parseEvents({
        caption:            post.caption,
        extractedMediaText: extractedText,
        postTimestamp:      post.timestamp,
        username:           post.username,
      });

      // Use first non-video CDN URL as the event image (Instagram CDN URLs expire
      // but are useful during the moderation review window)
      const firstImageUrl = (post.media_urls ?? []).find(u => {
        const ext = (u.split('?')[0].split('.').pop() ?? '').toLowerCase();
        return IMAGE_EXTENSIONS.has(ext);
      }) ?? null;

      parsedEvents.forEach((parsed, i) => {
        // Skip if required fields are missing
        if (!parsed?.title || !parsed?.start_time || !parsed?.venue_name) return;

        events.push({
          title:            parsed.title,
          description:      parsed.description ?? null,
          start_time:       parsed.start_time,
          end_time:         parsed.end_time ?? null,
          venue_name:       parsed.venue_name,
          venue_address:    parsed.venue_address ?? `${parsed.venue_name}, New York, NY`,
          venue_city:       'New York',
          venue_region:     'NY',
          venue_country:    'US',
          timezone:         'America/New_York',
          category:         null,
          tags:             Array.isArray(parsed.tags) ? parsed.tags : [],
          price_text:       parsed.price_text ?? null,
          is_free:          parsed.is_free === true ? 'true' : parsed.is_free === false ? 'false' : null,
          ticket_url:       parsed.ticket_url ?? null,
          // events.source_url is unique — a single post can describe several
          // distinct events (e.g. a roundup), so give each a stable per-post
          // suffix once there's more than one to avoid collisions.
          source_url:       parsedEvents.length > 1 ? `${post.post_url}#event-${i}` : post.post_url,
          source_name:      `instagram/@${post.username}`,
          image_url:        firstImageUrl,
          confidence_score: 0.65,
          review_status:    'needs_review',
        });
      });
    } catch (err) {
      console.error(`[instagram] error processing ${post.shortcode}: ${err.message}`);
    }
  }

  return events;
}
