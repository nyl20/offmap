import { getUpcomingEvents, getVenues } from '@offmap/db';
import { CATEGORIES, toOffmapEvent } from '@offmap/shared';

import { HomeExperience } from '@/components/home/home-experience';
import { PullChain } from '@/components/home/pull-chain';
import { getServerSupabase } from '@/lib/supabase/server';

import styles from './page.module.css';

export const revalidate = 300;

const PREVIEW_LIMIT = 8;

export default async function HomePage() {
  const supabase = getServerSupabase();

  const results = await Promise.all(
    CATEGORIES.map(async (category) => {
      const [eventRows, places] = await Promise.all([
        getUpcomingEvents(supabase, { category: category.id, limit: PREVIEW_LIMIT }),
        // onlyGeocoded: false — Home lists places, it doesn't need map
        // coordinates the way Discover's pins do.
        getVenues(supabase, { category: category.id, onlyGeocoded: false, limit: PREVIEW_LIMIT }),
      ]);
      return { category, events: eventRows.map(toOffmapEvent), places };
    })
  );

  // Categories with neither an upcoming event nor a place right now are
  // hidden from the homepage rather than rendering an empty rail — Discover
  // still lists all 12 in its filter chips.
  const sections = results.filter((section) => section.events.length > 0 || section.places.length > 0);

  return (
    <main className="container">
      <PullChain />
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>What&apos;s happening around the city</h1>
        <p className={styles.heroSubtitle}>
          Real events and permanent spots across NYC, pulled live — music, food, museums, wellness and more.
        </p>
      </div>
      <HomeExperience sections={sections} />
    </main>
  );
}
