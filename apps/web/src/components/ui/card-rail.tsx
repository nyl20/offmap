import styles from './card-rail.module.css';

type CardRailProps = {
  title?: string;
  subtitle?: string;
  layout?: 'rail' | 'grid';
  children: React.ReactNode;
};

// Generic rail/grid shell for a titled row of cards — used for both events
// and places so the two share exactly the same layout instead of two
// near-duplicate components.
export function CardRail({ title, subtitle, layout = 'rail', children }: CardRailProps) {
  return (
    <section className={styles.rowSection}>
      {title ? (
        <div className={styles.rowHead}>
          <h2 className={styles.rowTitle}>{title}</h2>
          {subtitle ? <span className={styles.rowSubtitle}>{subtitle}</span> : null}
        </div>
      ) : null}
      <div className={layout === 'rail' ? styles.rail : styles.grid}>{children}</div>
    </section>
  );
}
