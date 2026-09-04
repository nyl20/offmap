'use client';

import { CSSProperties, useEffect, useRef, useState } from 'react';

import styles from './pull-chain.module.css';

const THEME_KEY = 'offmap-theme';
const HIDE_AFTER_MS = 60_000;
const RETRACT_MS = 600;
const BEAD_COUNT = 10;

// One entry per bead plus a final entry for the grip — index 0 is nearest
// the fixed bracket, the last index is the grip at the free end.
const ITEM_COUNT = BEAD_COUNT + 1;
const LAST_INDEX = ITEM_COUNT - 1;

// The chain doesn't fall/pull as one rigid body — each link gets its own
// delayed copy of the same bounce keyframe, so at any instant beads are at
// different points in the motion and the column reads as bending, not
// translating. Amplitude grows toward the free end (the grip), same as a
// real chain fixed at the top: the anchor barely moves, the tail whips.
const FALL_MS = 650;
const DROP_STEP_MS = 40;
const TUG_STEP_MS = 26;

function dropAmp(i: number) {
  return 3 + i * 2;
}

function dropDelay(i: number) {
  return FALL_MS + i * DROP_STEP_MS;
}

function tugAmp(i: number) {
  return 4 + i * 2.2;
}

function tugDelay(i: number) {
  // Reversed: a pull originates at the grip (the free end) and the give
  // travels back up toward the anchor, so the grip moves first.
  return (LAST_INDEX - i) * TUG_STEP_MS;
}

// A little easter-egg lamp-pull that doubles as the site's only light/dark
// control — deliberately homepage-only, not wired into SiteHeader.
export function PullChain() {
  const [visible, setVisible] = useState(true);
  const [retracting, setRetracting] = useState(false);
  const [tugging, setTugging] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retractTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    hideTimer.current = setTimeout(() => setRetracting(true), HIDE_AFTER_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (tugTimer.current) clearTimeout(tugTimer.current);
      if (retractTimer.current) clearTimeout(retractTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!retracting) return;
    retractTimer.current = setTimeout(() => setVisible(false), RETRACT_MS);
    return () => {
      if (retractTimer.current) clearTimeout(retractTimer.current);
    };
  }, [retracting]);

  if (!visible) return null;

  function handlePull() {
    const root = document.documentElement;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private browsing / storage disabled — theme just won't persist across reloads.
    }

    setTugging(true);
    if (tugTimer.current) clearTimeout(tugTimer.current);
    tugTimer.current = setTimeout(() => setTugging(false), 500);

    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setRetracting(true), HIDE_AFTER_MS);
  }

  return (
    <div className={styles.mount}>
      <div className={`${styles.vertical} ${retracting ? styles.retract : styles.drop}`}>
        <div className={styles.bracket} />
        <div className={styles.swing}>
          <div className={styles.chain}>
            {Array.from({ length: BEAD_COUNT }).map((_, i) => (
              <span
                key={i}
                className={styles.linkWrap}
                style={{ '--amp': `${dropAmp(i)}px`, animationDelay: `${dropDelay(i)}ms` } as CSSProperties}
              >
                <span
                  className={`${styles.bead} ${tugging ? styles.tugAnim : ''}`}
                  style={tugging ? ({ '--amp': `${tugAmp(i)}px`, animationDelay: `${tugDelay(i)}ms` } as CSSProperties) : undefined}
                />
              </span>
            ))}
            <span
              className={styles.linkWrap}
              style={{ '--amp': `${dropAmp(LAST_INDEX)}px`, animationDelay: `${dropDelay(LAST_INDEX)}ms` } as CSSProperties}
            >
              <button
                type="button"
                className={`${styles.grip} ${tugging ? styles.tugAnim : ''}`}
                style={
                  tugging
                    ? ({ '--amp': `${tugAmp(LAST_INDEX)}px`, animationDelay: `${tugDelay(LAST_INDEX)}ms` } as CSSProperties)
                    : undefined
                }
                onClick={handlePull}
                aria-label="Toggle light and dark mode"
              />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
