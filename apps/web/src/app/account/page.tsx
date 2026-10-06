import { redirect } from 'next/navigation';

import { AccountExperience } from '@/components/account/account-experience';
import { getServerSupabase } from '@/lib/supabase/server';

import styles from './page.module.css';

export default async function AccountPage() {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/sign-in?next=/account');

  return (
    <main className="container">
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>Account</h1>
        <p className={styles.heroSubtitle}>Manage how you sign in, and your account.</p>
      </div>
      <AccountExperience email={data.user.email ?? null} phone={data.user.phone ?? null} />
    </main>
  );
}
