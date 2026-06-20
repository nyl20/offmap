export type EventCategory =
  | 'art'
  | 'food'
  | 'music'
  | 'popup'
  | 'museum'
  | 'market'
  | 'other';

export type OffmapEvent = {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  startTime: string;
  endTime: string;
  venueName: string;
  address: string;
  latitude: number;
  longitude: number;
  imageUrl?: string;
  sourceUrl?: string;
  price?: string;
  sharedBy?: string;
  sharedByHandle?: string;
  heardAt?: string;
  communityNote?: string;
  confirmations?: number;
  tags: string[];
  createdAt: string;
};
