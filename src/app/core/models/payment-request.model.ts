/** A user's paid-plan request waiting for an administrator to confirm payment. */
export interface PendingPlanRequest {
  requestId: string;
  userId: string;
  userName: string;
  email: string | null;
  tier: string;
  priceUsd: number | null;
  requestedAt: string;
}

/** An owner's featured-placement fee waiting for an administrator to confirm payment. */
export interface PendingFeaturedPayment {
  transactionId: string;
  propertyId: string;
  propertyTitle: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string | null;
  amountUsd: number;
  requestedAt: string;
}

export interface PendingPaymentRequests {
  plans: PendingPlanRequest[];
  featured: PendingFeaturedPayment[];
}
