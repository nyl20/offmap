import { SavedExperience } from '@/components/saved/saved-experience';

import styles from './page.module.css';

export default function SavedPage() {
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
