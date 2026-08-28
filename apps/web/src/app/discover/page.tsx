import { getVenues } from '@offmap/db';

import { DiscoverExperience } from '@/components/discover/discover-experience';
import { getServerSupabase } from '@/lib/supabase/server';

import styles from './page.module.css';

export const revalidate = 300;

export default async function DiscoverPage() {
  const supabase = getServerSupabase();
  const venues = await getVenues(supabase, { onlyGeocoded: true });

  return (
    <div className={styles.wrap}>
      <DiscoverExperience venues={venues} />
    </div>
  );
}
