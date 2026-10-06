import { redirect } from 'next/navigation';

import { SavedExperience } from '@/components/saved/saved-experience';
import { getServerSupabase } from '@/lib/supabase/server';

import styles from './page.module.css';

export default async function SavedPage() {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/sign-in?next=/saved');

  return (
    <main className="container">
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>Saved</h1>
        <p className={styles.heroSubtitle}>Events and places you&apos;ve favorited, all in one place.</p>
      </div>
      <SavedExperience />
    </main>
  );
}
