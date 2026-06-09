import { create } from 'zustand';

import type { EventCategory } from '@/types/event';

type EventFilterState = {
  categories: EventCategory[];
  radiusMiles: number;
  freeOnly: boolean;
  setCategories: (categories: EventCategory[]) => void;
  setRadiusMiles: (radiusMiles: number) => void;
  setFreeOnly: (freeOnly: boolean) => void;
};

export const useEventFilterStore = create<EventFilterState>((set) => ({
  categories: [],
  radiusMiles: 5,
  freeOnly: false,
  setCategories: (categories) => set({ categories }),
  setRadiusMiles: (radiusMiles) => set({ radiusMiles }),
  setFreeOnly: (freeOnly) => set({ freeOnly }),
}));
