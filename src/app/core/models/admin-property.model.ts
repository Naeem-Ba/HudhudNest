// Admin dashboard — one row of the "user's ads" screen served by
// GET /api/admin/users/{id}/properties (AdminListingService.GetUserPropertiesAsync on
// the backend). Deliberately a small, admin-only shape — not the public Property model.

export type AdminPropertyStatus = 'Available' | 'Reserved' | 'Sold' | 'Rented' | 'Archived' | 'Expired';

export interface AdminPropertySummary {
  id: string;
  title: string;
  status: AdminPropertyStatus;
  isPublished: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  isTakenDown: boolean;
  takenDownReason: string | null;
  isFeatured: boolean;
  featuredUntil: string | null;
  createdAt: string;
}
