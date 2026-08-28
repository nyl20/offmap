'use client';

import { createContext, useCallback, useContext, useState } from 'react';

import type { VenueRow } from '@offmap/db';

import { CardExpandOverlay, type CardExpandTarget } from '@/components/discover/card-expand-overlay';

type PageTransitionContextValue = {
  startExpand: (venue: VenueRow, originRect: DOMRect) => void;
};

const PageTransitionContext = createContext<PageTransitionContextValue | null>(null);

// Mounted once in the root layout, above `{children}` — the part of the tree
// Next.js actually swaps on navigation. The overlay this renders needs to
// survive that swap to finish its own exit animation on its own timeline;
// rendering it from inside the page being navigated away from (as originally
// built) meant it got unmounted the instant the new route took over,
// cutting the animation short well before it was meant to finish — the
// actual source of the transition feeling jarring, not just an insufficient
// backdrop.
export function PageTransitionProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<CardExpandTarget | null>(null);

  const startExpand = useCallback((venue: VenueRow, originRect: DOMRect) => {
    setTarget({ venue, originRect });
  }, []);

  return (
    <PageTransitionContext.Provider value={{ startExpand }}>
      {children}
      {target ? <CardExpandOverlay target={target} onFinished={() => setTarget(null)} /> : null}
    </PageTransitionContext.Provider>
  );
}

export function usePageTransition() {
  const ctx = useContext(PageTransitionContext);
  if (!ctx) throw new Error('usePageTransition must be used within PageTransitionProvider');
  return ctx;
}
