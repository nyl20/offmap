'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPinIcon } from '@phosphor-icons/react/ssr';

import { EmptyState } from '@/components/ui/empty-state';
import styles from './nearby-panel.module.css';

export type NearbyPanelItem = {
  id: string;
  href: string;
  icon: React.ReactNode;
  imageUrl?: string | null;
  title: string;
  subtitle: string;
};

const COLLAPSED_COUNT = 10;

type NearbyPanelProps = {
  icon: React.ReactNode;
  label: string;
  items: NearbyPanelItem[];
  loading: boolean;
  emptyTitle: string;
  emptySubtitle: string;
  onClear?: () => void;
};

export function NearbyPanel({ icon, label, items, loading, emptyTitle, emptySubtitle, onClear }: NearbyPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, COLLAPSED_COUNT);
  const hiddenCount = items.length - visible.length;

  return (
    <div className={styles.panel}>
      <div className={styles.handle} />
      <div className={styles.head}>
        <h3>
          {icon}
          <span>{label}</span>
        </h3>
        <div className={styles.headActions}>
          {items.length > 0 ? <span className={styles.count}>{items.length}</span> : null}
          {onClear ? (
            <button type="button" className={styles.clear} onClick={onClear}>
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.list}>
        {loading ? (
          <EmptyState icon={<MapPinIcon weight="duotone" size={32} />} title="Loading…" />
        ) : items.length === 0 ? (
          <EmptyState icon={<MapPinIcon weight="duotone" size={32} />} title={emptyTitle} subtitle={emptySubtitle} />
        ) : (
          <>
            {visible.map((item) => (
              <Link key={item.id} href={item.href} className={styles.row}>
                <RowThumb icon={item.icon} imageUrl={item.imageUrl} />
                <div className={styles.rowCopy}>
                  <p className={styles.rowTitle}>{item.title}</p>
                  <span className={styles.rowSub}>{item.subtitle}</span>
                </div>
              </Link>
            ))}
            {hiddenCount > 0 ? (
              <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
                + {hiddenCount} more nearby
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function RowThumb({ icon, imageUrl }: { icon: React.ReactNode; imageUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed) {
    return (
      <span className={styles.rowThumb}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className={styles.rowIcon}>
      {icon}
    </span>
  );
}
