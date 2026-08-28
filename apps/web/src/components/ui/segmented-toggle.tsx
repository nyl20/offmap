'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';

import styles from './segmented-toggle.module.css';

export type SegmentedToggleItem = {
  key: string;
  label: string;
  /** Present -> renders as a real navigation link. Absent -> client-side onChange. */
  href?: string;
  /** Present -> renders this icon in place of the text label (label becomes the accessible name only). */
  icon?: React.ReactNode;
};

type SegmentedToggleProps = {
  items: SegmentedToggleItem[];
  activeKey: string;
  onChange?: (key: string) => void;
  size?: 'sm' | 'md';
  'aria-label'?: string;
};

export function SegmentedToggle({ items, activeKey, onChange, size = 'md', ...rest }: SegmentedToggleProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    function measure() {
      const track = trackRef.current;
      const el = itemRefs.current.get(activeKey);
      if (!track || !el) return;
      const trackRect = track.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      setIndicator({ left: elRect.left - trackRect.left, width: elRect.width });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeKey, items]);

  return (
    <div className={`${styles.track} ${styles[size]}`} ref={trackRef} role="tablist" aria-label={rest['aria-label']}>
      {indicator ? (
        <div className={styles.indicator} style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }} />
      ) : null}
      {items.map((item) => {
        const isActive = item.key === activeKey;
        const className = `${styles.item} ${item.icon ? styles.itemIcon : ''} ${isActive ? styles.itemActive : ''}`;
        const content = item.icon ? (
          <>
            {item.icon}
            <span className={styles.srOnly}>{item.label}</span>
          </>
        ) : (
          item.label
        );
        const setRef = (el: HTMLElement | null) => {
          if (el) itemRefs.current.set(item.key, el);
        };

        if (item.href) {
          return (
            <Link
              key={item.key}
              href={item.href}
              ref={setRef}
              className={className}
              role="tab"
              aria-selected={isActive}
              aria-label={item.icon ? item.label : undefined}
              title={item.icon ? item.label : undefined}
            >
              {content}
            </Link>
          );
        }
        return (
          <button
            key={item.key}
            type="button"
            ref={setRef}
            className={className}
            role="tab"
            aria-selected={isActive}
            aria-label={item.icon ? item.label : undefined}
            title={item.icon ? item.label : undefined}
            onClick={() => onChange?.(item.key)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
