import type { CategoryAccent } from '@offmap/shared';

import { IconChip } from '@/components/ui/icon-chip';
import styles from './fact-card.module.css';

type FactCardProps = {
  icon: React.ReactNode;
  accent: CategoryAccent;
  label: string;
  value: string;
};

export function FactCard({ icon, accent, label, value }: FactCardProps) {
  return (
    <div className={styles.card}>
      <IconChip accent={accent} size="sm">
        {icon}
      </IconChip>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>
  );
}
