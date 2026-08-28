'use client';

import { CaretLeftIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react/ssr';

import { CATEGORIES, type OffmapCategory } from '@offmap/shared';

import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { CategoryIcon } from '@/lib/icons';
import styles from './map-filters-overlay.module.css';

export type DiscoverKindFilter = 'all' | 'events' | 'places';

const KIND_ITEMS = [
  { key: 'all', label: 'All' },
  { key: 'events', label: 'Events' },
  { key: 'places', label: 'Places' },
];

type MapFiltersOverlayProps = {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  kindFilter: DiscoverKindFilter;
  onKindChange: (kind: DiscoverKindFilter) => void;
  activeCategory: OffmapCategory | null;
  onCategoryChange: (category: OffmapCategory | null) => void;
  subcategories: string[];
  activeSubcategory: string | null;
  onSubcategoryChange: (sub: string | null) => void;
};

export function MapFiltersOverlay({
  searchTerm,
  onSearchChange,
  kindFilter,
  onKindChange,
  activeCategory,
  onCategoryChange,
  subcategories,
  activeSubcategory,
  onSubcategoryChange,
}: MapFiltersOverlayProps) {
  const activeCategoryMeta = CATEGORIES.find((c) => c.id === activeCategory);

  return (
    <div className={styles.overlay}>
      <div className={styles.topRow}>
        <div className={styles.search}>
          <MagnifyingGlassIcon weight="regular" size={15} />
          <input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search events, venues, neighborhoods"
            aria-label="Filter map"
          />
          {searchTerm ? (
            <button
              type="button"
              className={styles.clear}
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
            >
              <XIcon weight="bold" size={13} />
            </button>
          ) : null}
        </div>
        <SegmentedToggle
          items={KIND_ITEMS}
          activeKey={kindFilter}
          onChange={(key) => onKindChange(key as DiscoverKindFilter)}
          size="sm"
          aria-label="Filter by kind"
        />
      </div>

      {activeCategoryMeta ? (
        <div className={styles.pills}>
          <button type="button" className={`${styles.pill} ${styles.backPill}`} onClick={() => onCategoryChange(null)}>
            <CaretLeftIcon weight="bold" size={11} />
            <CategoryIcon category={activeCategoryMeta.id} size={14} weight="regular" />
            {activeCategoryMeta.shortLabel}
          </button>
          <button
            type="button"
            className={`${styles.pill} ${activeSubcategory === null ? styles.pillActive : ''}`}
            onClick={() => onSubcategoryChange(null)}
          >
            All {activeCategoryMeta.shortLabel}
          </button>
          {subcategories.map((sub) => (
            <button
              key={sub}
              type="button"
              className={`${styles.pill} ${activeSubcategory === sub ? styles.pillActive : ''}`}
              onClick={() => onSubcategoryChange(activeSubcategory === sub ? null : sub)}
            >
              {sub}
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.pills}>
          <button
            type="button"
            className={`${styles.pill} ${activeCategory === null ? styles.pillActive : ''}`}
            onClick={() => onCategoryChange(null)}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button key={cat.id} type="button" className={styles.pill} onClick={() => onCategoryChange(cat.id)}>
              <CategoryIcon category={cat.id} size={14} weight="regular" />
              {cat.shortLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
