'use client';

import { SparkleIcon } from '@phosphor-icons/react/ssr';

import type { CategoryMeta, OffmapCategory } from '@offmap/shared';

import { CategoryIcon } from '@/lib/icons';
import styles from './category-chips.module.css';

type CategoryChipsProps = {
  categories: CategoryMeta[];
  activeId: OffmapCategory | null;
  onSelect: (id: OffmapCategory | null) => void;
};

// Single-select — "For You" is the browse-everything view, clicking any
// other category drills into it (CategoryDrilldown), it doesn't filter the
// browse view in place.
export function CategoryChips({ categories, activeId, onSelect }: CategoryChipsProps) {
  const forYouActive = activeId === null;

  return (
    <div className={styles.row} role="group" aria-label="Browse by category">
      <button type="button" className={styles.chip} onClick={() => onSelect(null)} aria-pressed={forYouActive}>
        <span className={`${styles.circle} ${forYouActive ? styles.circleActive : ''}`}>
          <SparkleIcon weight="duotone" size={22} />
        </span>
        <span className={`${styles.label} ${forYouActive ? styles.labelActive : ''}`}>For You</span>
      </button>

      {categories.map((cat) => {
        const active = activeId === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            className={styles.chip}
            onClick={() => onSelect(cat.id)}
            aria-pressed={active}
          >
            <span className={`${styles.circle} ${active ? styles.circleActive : ''}`}>
              <CategoryIcon category={cat.id} size={22} />
            </span>
            <span className={`${styles.label} ${active ? styles.labelActive : ''}`}>{cat.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
