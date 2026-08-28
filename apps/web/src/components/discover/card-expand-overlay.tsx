'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPinIcon } from '@phosphor-icons/react/ssr';

import type { VenueRow } from '@offmap/db';
import { primaryCategory } from '@offmap/shared';

import { CategoryIcon } from '@/lib/icons';
import styles from './card-expand-overlay.module.css';

// Must stay in sync with the durations declared in card-expand-overlay.module.css
// — driving the phase timing from JS (rather than a `transitionend` listener)
// is simpler and can't get stuck if a property transition is interrupted or
// coalesced by the browser.
const EXPAND_MS = 420;
// Brief pause once the hero has finished expanding, before revealing the
// real page underneath — gives Next a little more time to finish painting
// behind the backdrop so the reveal lands on a settled page, not one still
// assembling.
const HOLD_MS = 90;
const FADE_MS = 280;

const HEADER_HEIGHT = 72;
const CONTAINER_MAX_WIDTH = 1280;
const SIDE_PADDING = 24;

// The destination rect approximates the venue detail page's hero geometry
// (see detail-hero.module.css's full-bleed, ~16/7 aspect hero) rather than
// measuring the not-yet-mounted real DOM — that's what keeps this transition
// decoupled from Next's async route rendering. See the plan's scope note.
function computeDestRect() {
  const viewportWidth = window.innerWidth;
  const contentWidth = Math.min(viewportWidth, CONTAINER_MAX_WIDTH) - SIDE_PADDING * 2;
  const left = (viewportWidth - contentWidth) / 2;
  const top = HEADER_HEIGHT + 24;
  const height = Math.min(contentWidth * (7 / 16), window.innerHeight - top - 40);
  return { top, left, width: contentWidth, height };
}

export type CardExpandTarget = { venue: VenueRow; originRect: DOMRect };

type CardExpandOverlayProps = {
  target: CardExpandTarget;
  onFinished: () => void;
};

export function CardExpandOverlay({ target, onFinished }: CardExpandOverlayProps) {
  const { venue, originRect } = target;
  const elRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<'invert' | 'expand' | 'hold' | 'fade'>('invert');
  const [backdropVisible, setBackdropVisible] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const category = primaryCategory(venue.categories);
  const accent = category?.accent ?? 'lavender';
  const showImage = venue.image_url && !imageFailed;

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const dest = computeDestRect();

    // FLIP "invert" step: the element is laid out at full destination size,
    // then an initial transform makes it visually match the small origin
    // rect — a following frame clears the transform so the already-attached
    // CSS transition animates it out to identity/full size.
    el.style.transform = `translate(${originRect.left - dest.left}px, ${originRect.top - dest.top}px) scale(${
      originRect.width / dest.width
    }, ${originRect.height / dest.height})`;
    el.style.borderRadius = '18px';

    const raf = requestAnimationFrame(() => {
      // The backdrop is what actually hides the instant page-swap
      // underneath (the hero box only ever covers a hero-sized area, never
      // the header/panel/rest of the page) — fading it in up front, ahead
      // of the hero's own longer expand animation, is what makes the whole
      // thing read as one continuous motion instead of a box animating over
      // a page that's already visibly jump-cut behind it.
      setBackdropVisible(true);
      requestAnimationFrame(() => {
        setPhase('expand');
        const current = elRef.current;
        if (current) {
          current.style.transform = 'none';
          current.style.borderRadius = '0px';
        }
      });
    });

    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'expand') return;
    const timer = setTimeout(() => setPhase('hold'), EXPAND_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'hold') return;
    const timer = setTimeout(() => setPhase('fade'), HOLD_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'fade') return;
    const timer = setTimeout(onFinished, FADE_MS);
    return () => clearTimeout(timer);
  }, [phase, onFinished]);

  const dest = computeDestRect();
  const fading = phase === 'fade';

  return (
    <div
      className={`${styles.backdrop} ${backdropVisible ? styles.backdropVisible : ''} ${fading ? styles.fading : ''}`}
      aria-hidden="true"
    >
      <div
        ref={elRef}
        className={`${styles.overlay} ${fading ? styles.fading : ''}`}
        style={{ top: dest.top, left: dest.left, width: dest.width, height: dest.height }}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={venue.image_url!} alt="" onError={() => setImageFailed(true)} />
        ) : (
          <div className={styles.fallback} style={{ background: `var(--color-${accent}-soft)` }}>
            {category ? <CategoryIcon category={category.id} size={48} /> : <MapPinIcon weight="duotone" size={48} />}
          </div>
        )}
        <div className={styles.scrim} />
        <p className={styles.title}>{venue.name}</p>
      </div>
    </div>
  );
}
