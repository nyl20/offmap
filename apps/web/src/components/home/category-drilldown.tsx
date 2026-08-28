'use client';

import { useMemo, useState } from 'react';
import { CaretLeftIcon } from '@phosphor-icons/react/ssr';

import type { VenueRow } from '@offmap/db';
import { deriveSubcategories, type CategoryMeta, type OffmapEvent } from '@offmap/shared';

import { CardRail } from '@/components/ui/card-rail';
import { EmptyState } from '@/components/ui/empty-state';
import { SubcategoryChips } from '@/components/ui/subcategory-chips';
import { CategoryIcon } from '@/lib/icons';

import { EventCard } from './event-card';
import { PlaceCard } from './place-card';
import styles from './category-drilldown.module.css';

type KindFilter = 'all' | 'events' | 'places';

type CategoryDrilldownProps = {
  category: CategoryMeta;
  events: OffmapEvent[];
  places: VenueRow[];
  loading: boolean;
  kindFilter: KindFilter;
  onBack: () => void;
};

export function CategoryDrilldown({ category, events, places, loading, kindFilter, onBack }: CategoryDrilldownProps) {
  const [activeSub, setActiveSub] = useState<string | null>(null);

  const subcategories = useMemo(
    () => deriveSubcategories([...events.map((e) => e.subCategories), ...places.map((p) => p.sub_categories)]),
    [events, places]
  );

  const filteredEvents = useMemo(
    () => (activeSub ? events.filter((e) => e.subCategories.includes(activeSub)) : events),
    [events, activeSub]
  );
  const filteredPlaces = useMemo(
    () => (activeSub ? places.filter((p) => p.sub_categories.includes(activeSub)) : places),
    [places, activeSub]
  );

  const showEvents = kindFilter !== 'places';
  const showPlaces = kindFilter !== 'events';
  const hasEvents = showEvents && filteredEvents.length > 0;
  const hasPlaces = showPlaces && filteredPlaces.length > 0;

  return (
    <div>
      <div className={styles.backRow}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          <CaretLeftIcon weight="regular" size={15} />
          For You
        </button>
      </div>

      <div className={styles.header}>
        <span className={styles.iconTile} style={{ background: `var(--color-${category.accent}-soft)` }}>
          <CategoryIcon category={category.id} size={24} />
        </span>
        <h1 className={styles.title}>{category.label}</h1>
      </div>

      {subcategories.length > 0 ? (
        <div className={styles.subcategoriesWrap}>
          <SubcategoryChips
            subcategories={subcategories}
            activeSubcategory={activeSub}
            onSelect={setActiveSub}
            allLabel={`All ${category.shortLabel}`}
          />
        </div>
      ) : null}

      {loading ? (
        <EmptyState icon={<CategoryIcon category={category.id} size={32} />} title={`Loading ${category.label}…`} />
      ) : hasEvents || hasPlaces ? (
        <>
          {hasEvents ? (
            <CardRail title="Events">
              {filteredEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </CardRail>
          ) : null}
          {hasPlaces ? (
            <CardRail title="Places">
              {filteredPlaces.map((venue) => (
                <PlaceCard key={venue.id} venue={venue} />
              ))}
            </CardRail>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={<CategoryIcon category={category.id} size={32} />}
          title={`Nothing in ${category.label} yet`}
          subtitle={activeSub ? 'Try a different subcategory, or clear the filter.' : 'Check back soon.'}
        />
      )}
    </div>
  );
}
