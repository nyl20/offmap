import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ClockIcon, MapPinIcon, PhoneIcon } from '@phosphor-icons/react/ssr';

import { getVenueById } from '@offmap/db';
import { buildDirectionsUrl, formatVenueHours, primaryCategory } from '@offmap/shared';

import { ActionButtons } from '@/components/detail/action-buttons';
import { DetailHero } from '@/components/detail/detail-hero';
import { FactCard } from '@/components/detail/fact-card';
import { Pill } from '@/components/ui/pill';
import { CategoryIcon } from '@/lib/icons';
import { getServerSupabase } from '@/lib/supabase/server';

import styles from './page.module.css';

export const revalidate = 300;

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const venue = await getVenueById(getServerSupabase(), id);
  if (!venue) return { title: 'Spot not found — OFFMAP' };
  return { title: `${venue.name} — OFFMAP`, description: venue.description ?? undefined };
}

export default async function VenueDetailPage({ params }: PageProps) {
  const { id } = await params;
  const venue = await getVenueById(getServerSupabase(), id);
  if (!venue) notFound();

  const category = primaryCategory(venue.categories);
  const accent = category?.accent ?? 'lavender';

  return (
    <main className={`container ${styles.page}`}>
      <DetailHero
        imageUrl={venue.image_url}
        accent={accent}
        icon={category ? <CategoryIcon category={category.id} size={64} /> : <MapPinIcon weight="duotone" size={64} />}
        kind="venue"
        id={venue.id}
      />

      <div className={styles.body}>
        <Pill accent={accent}>{category?.label ?? 'Permanent spot'}</Pill>
        <h1 className={styles.title}>{venue.name}</h1>

        <div className={styles.venueRow}>
          <MapPinIcon weight="regular" size={15} />
          <span>
            {venue.address}
            {venue.neighborhood ? ` · ${venue.neighborhood}` : ''}
          </span>
        </div>

        <div className={styles.factGrid}>
          <FactCard
            accent={accent}
            label="Hours"
            value={formatVenueHours(venue.venue_opening_hours) ?? 'Not listed'}
            icon={<ClockIcon weight="regular" size={15} />}
          />
          <FactCard
            accent={accent}
            label="Phone"
            value={venue.phone ?? 'Not listed'}
            icon={<PhoneIcon weight="regular" size={15} />}
          />
        </div>

        {venue.description ? (
          <div className={styles.section}>
            <h4>About</h4>
            <p>{venue.description}</p>
          </div>
        ) : null}

        <ActionButtons websiteUrl={venue.website_url} directionsUrl={buildDirectionsUrl(venue.address)} />
      </div>
    </main>
  );
}
