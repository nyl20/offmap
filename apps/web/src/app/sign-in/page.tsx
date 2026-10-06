import { SignInExperience } from '@/components/auth/sign-in-experience';

import styles from './page.module.css';

type PageProps = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function SignInPage({ searchParams }: PageProps) {
  const { next, error } = await searchParams;

  return (
    <main className="container">
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>Sign in</h1>
        <p className={styles.heroSubtitle}>Sign in to save events and places, and pick up where you left off.</p>
      </div>
      <SignInExperience
        next={next ?? '/'}
        initialError={error === 'auth' ? 'That link expired or was already used — try again.' : null}
      />
    </main>
  );
}
