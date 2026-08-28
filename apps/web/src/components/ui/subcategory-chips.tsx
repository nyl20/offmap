'use client';

import styles from './subcategory-chips.module.css';

type SubcategoryChipsProps = {
  subcategories: string[];
  activeSubcategory: string | null;
  onSelect: (sub: string | null) => void;
  allLabel?: string;
};

export function SubcategoryChips({ subcategories, activeSubcategory, onSelect, allLabel = 'All' }: SubcategoryChipsProps) {
  if (subcategories.length === 0) return null;

  return (
    <div className={styles.row} role="group" aria-label="Filter by subcategory">
      <button
        type="button"
        className={`${styles.pill} ${activeSubcategory === null ? styles.pillActive : ''}`}
        onClick={() => onSelect(null)}
      >
        {allLabel}
      </button>
      {subcategories.map((sub) => (
        <button
          key={sub}
          type="button"
          className={`${styles.pill} ${activeSubcategory === sub ? styles.pillActive : ''}`}
          onClick={() => onSelect(sub)}
        >
          {sub}
        </button>
      ))}
    </div>
  );
}
