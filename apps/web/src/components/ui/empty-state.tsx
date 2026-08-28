import { MapTrifoldIcon } from '@phosphor-icons/react/ssr';

import styles from './empty-state.module.css';

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
};

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className={styles.wrap}>
      <span className={styles.icon}>{icon ?? <MapTrifoldIcon weight="duotone" size={32} />}</span>
      <p className={styles.title}>{title}</p>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </div>
  );
}
