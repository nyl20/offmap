import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CalendarBlankIcon, MapPinIcon, TicketIcon } from '@phosphor-icons/react/ssr';

import { getEventById } from '@offmap/db';
import { buildDirectionsUrl, formatEventDateTime, formatPrice, toOffmapEvent } from '@offmap/shared';

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
  const row = await getEventById(getServerSupabase(), id);
  if (!row) return { title: 'Event not found — OFFMAP' };
  return { title: `${row.title} — OFFMAP`, description: row.description ?? undefined };
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params;
  const row = await getEventById(getServerSupabase(), id);
  if (!row) notFound();

  const event = toOffmapEvent(row);
  const accent = event.category?.accent ?? 'mint';

  return (
    <main className={`container ${styles.page}`}>
      <DetailHero
        imageUrl={event.imageUrl}
        accent={accent}
        icon={
          event.category ? (
            <CategoryIcon category={event.category.id} size={64} />
          ) : (
            <MapPinIcon weight="duotone" size={64} />
          )
        }
        kind="event"
        id={event.id}
      />

      <div className={styles.body}>
        <Pill accent={accent}>{event.category?.label ?? 'Event'}</Pill>
        <h1 className={styles.title}>{event.title}</h1>

        <div className={styles.venueRow}>
          <MapPinIcon weight="regular" size={15} />
          <span>
            <b>{event.venue.name}</b> — {event.venue.address}
          </span>
        </div>

        <div className={styles.factGrid}>
          <FactCard
            accent={accent}
            label="Date & time"
            value={formatEventDateTime(event.startTime, event.endTime)}
            icon={<CalendarBlankIcon weight="regular" size={15} />}
          />
          <FactCard
            accent={accent}
            label="Price"
            value={formatPrice(event.priceText, event.isFree)}
            icon={<TicketIcon weight="regular" size={15} />}
          />
        </div>

        {event.description ? (
          <div className={styles.section}>
            <h4>About</h4>
            <p>{event.description}</p>
          </div>
        ) : null}

        <ActionButtons websiteUrl={event.websiteUrl} directionsUrl={buildDirectionsUrl(event.venue.address)} />
      </div>
    </main>
  );
}
