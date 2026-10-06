import { redirect } from 'next/navigation';

import { SubmitExperience } from '@/components/submit/submit-experience';
import { getServerSupabase } from '@/lib/supabase/server';

import styles from './page.module.css';

export default async function SubmitPage() {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/sign-in?next=/submit');

  return (
    <main className="container">
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>Add a spot from TikTok</h1>
        <p className={styles.heroSubtitle}>
          Paste a link and we&apos;ll try to pull out the name, address, and category — review and fix
          anything before it goes in.
        </p>
      </div>
      <SubmitExperience />
    </main>
  );
}
