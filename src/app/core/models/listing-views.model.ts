// Matches the backend ListingViewsController DTOs.

export type ListingViewKind = 'property' | 'shortstay';

/** Answer of POST .../views: whether this call added a view, and the listing's total afterwards. */
export interface ListingViewResult {
  counted: boolean;
  viewCount: number;
  /** Why nothing was added: cooldown | own-listing | automated | test-traffic. */
  reason?: string | null;
}

export interface ListingViewStatsItem {
  kind: 'Property' | 'ShortStay';
  listingId: string;
  title: string;
  totalViews: number;
  views7Days: number;
  views30Days: number;
  uniqueViewers30Days: number;
}

export interface ListingViewStats {
  scope: 'mine' | 'agency';
  generatedAt: string;
  historyRetentionDays: number;
  totalViews: number;
  views7Days: number;
  views30Days: number;
  items: ListingViewStatsItem[];
}

export interface ListingViewTrend {
  kind: 'Property' | 'ShortStay';
  listingId: string;
  days: number;
  totalViews: number;
  points: { date: string; views: number }[];
}
