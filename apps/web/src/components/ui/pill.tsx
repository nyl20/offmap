import type { CategoryAccent } from '@offmap/shared';

import styles from './pill.module.css';

const ACCENT_VARS: Record<CategoryAccent, string> = {
  mint: 'var(--color-mint)',
  gold: 'var(--color-gold)',
  lavender: 'var(--color-lavender)',
  coral: 'var(--color-coral)',
};

const ACCENT_SOFT_VARS: Record<CategoryAccent, string> = {
  mint: 'var(--color-mint-soft)',
  gold: 'var(--color-gold-soft)',
  lavender: 'var(--color-lavender-soft)',
  coral: 'var(--color-coral-soft)',
};

type PillProps = {
  accent?: CategoryAccent;
  children: React.ReactNode;
};

export function Pill({ accent = 'mint', children }: PillProps) {
  return (
    <span
      className={styles.pill}
      style={{ background: ACCENT_SOFT_VARS[accent], color: ACCENT_VARS[accent] }}
    >
      {children}
    </span>
  );
}
