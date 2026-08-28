import type { CategoryAccent } from '@offmap/shared';

import styles from './icon-chip.module.css';

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

type IconChipProps = {
  accent: CategoryAccent;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  ringed?: boolean;
};

export function IconChip({ accent, size = 'md', children, ringed = false }: IconChipProps) {
  return (
    <span
      className={`${styles.chip} ${styles[size]}`}
      style={{
        background: ACCENT_SOFT_VARS[accent],
        color: ACCENT_VARS[accent],
        boxShadow: ringed ? `0 0 0 2px ${ACCENT_VARS[accent]}` : undefined,
      }}
    >
      {children}
    </span>
  );
}
