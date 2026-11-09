// Types for the online payment system (HudhudNestApi: /api/payments, /api/admin/payments).
//
// Everything that is money is a number the SERVER computed. The app displays these values and never calculates a price, a tax
// or a total; it also never decides that an order succeeded — an order is paid only when the server says so after the provider
// confirmed it (the return URL of a hosted checkout proves nothing).

export type PaymentProductType = 'PlanSubscription' | 'FeaturedListing' | 'ListingExtension';
export type BillingInterval = 'OneTime' | 'Monthly' | 'Yearly';

export type PaymentOrderStatus =
  | 'Created' | 'Pending' | 'Processing' | 'Succeeded' | 'Failed' | 'Cancelled' | 'Expired'
  | 'RefundPending' | 'PartiallyRefunded' | 'Refunded' | 'Disputed';

/** Statuses after which polling stops. */
export const FINAL_ORDER_STATUSES: readonly PaymentOrderStatus[] = [
  'Succeeded', 'Failed', 'Cancelled', 'Expired', 'PartiallyRefunded', 'Refunded', 'Disputed'
];

export interface PaymentProviderOption {
  code: string;
  displayName: string;
  isSandbox: boolean;
  hostedCheckout: boolean;
  cards: boolean;
  wallets: boolean;
  qrCode: boolean;
  recurring: boolean;
  currencies: string[];
}

export interface PaymentCatalog {
  enabled: boolean;
  providers: PaymentProviderOption[];
  termsVersion: string;
  refundRequestWindowDays: number;
}

export interface PaymentQuote {
  productType: PaymentProductType;
  productCode: string | null;
  propertyId: string | null;
  description: string;
  interval: BillingInterval;
  currencyCode: string;
  unitAmount: number;
  discountAmount: number;
  taxRatePercent: number;
  taxAmount: number;
  totalAmount: number;
  totalAmountUsd: number;
  exchangeRateToUsd: number;
  priceSource: string;
  pricesIncludeTax: boolean;
}

export interface QuoteRequest {
  productType: PaymentProductType;
  planTier?: string | null;
  propertyId?: string | null;
  interval: BillingInterval;
  currencyCode: string;
  billingCountry?: string | null;
}

export interface CreateOrderRequest extends QuoteRequest {
  providerCode: string;
  idempotencyKey: string;
  renewalConsent?: { accepted: boolean; termsVersion: string | null } | null;
}

export interface PaymentOrder {
  id: string;
  orderNumber: string;
  status: PaymentOrderStatus;
  productType: PaymentProductType;
  productCode: string | null;
  propertyId: string | null;
  description: string;
  interval: BillingInterval;
  currencyCode: string;
  unitAmount: number;
  discountAmount: number;
  taxRatePercent: number;
  taxAmount: number;
  totalAmount: number;
  refundedAmount: number;
  providerCode: string | null;
  checkoutUrl: string | null;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  failureCode: string | null;
  entitlementStatus: string | null;
  entitlementFailureReason: string | null;
  isRenewal: boolean;
  invoiceId: string | null;
  canCancel: boolean;
  canRequestRefund: boolean;
  isSandbox: boolean;
}

export interface PaymentInvoice {
  id: string;
  number: string;
  kind: 'Invoice' | 'CreditNote' | string;
  orderId: string;
  orderNumber: string;
  sellerName: string;
  sellerAddress: string;
  sellerTaxId: string | null;
  sellerCountry: string;
  customerName: string;
  customerCountry: string | null;
  description: string;
  currencyCode: string;
  netAmount: number;
  taxRatePercent: number;
  taxAmount: number;
  grossAmount: number;
  issuedAt: string;
  paymentDate: string | null;
  paymentReference: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface PaymentSubscription {
  id: string;
  planTier: string;
  interval: BillingInterval;
  status: 'Active' | 'PastDue' | 'Cancelled' | 'Expired' | string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean;
  renewalAuthorization: string;
  consentAcceptedAt: string | null;
  consentAmount: number | null;
  consentCurrencyCode: string | null;
  pendingPlanTier: string | null;
  graceEndsAt: string | null;
  nextRenewalAttemptAt: string | null;
  renewalAttempts: number;
}

export interface PaymentRefund {
  id: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  currencyCode: string;
  status: string;
  source: string;
  reason: string;
  decisionNote: string | null;
  failureReason: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SubscriptionChangeResult {
  mode: string;
  subscription: PaymentSubscription | null;
}

// ── admin ──────────────────────────────────────────────────────────────────────────────────────────
export interface CurrencyTotal { currencyCode: string; amount: number; count: number }

export interface PaymentDashboard {
  from: string;
  to: string;
  revenueByCurrency: CurrencyTotal[];
  revenueUsd: number;
  totalOrders: number;
  succeeded: number;
  failed: number;
  pending: number;
  expired: number;
  cancelled: number;
  refundedByCurrency: CurrencyTotal[];
  activeSubscriptions: number;
  pastDueSubscriptions: number;
  failedWebhooks: number;
  openRefundRequests: number;
  stalePendingOrders: number;
  failedEntitlements: number;
}

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  userId: string;
  userName: string | null;
  productType: string;
  productCode: string | null;
  totalAmount: number;
  currencyCode: string;
  providerCode: string | null;
  status: string;
  createdAt: string;
  paidAt: string | null;
  providerReference: string | null;
  refundedAmount: number;
  isSandbox: boolean;
}

export interface AdminTransaction {
  id: string; kind: string; providerCode: string; providerReference: string; providerPaymentId: string | null;
  amount: number; currencyCode: string; status: string; rawStatus: string | null; failureCode: string | null;
  createdAt: string; settledAt: string | null;
}

export interface AdminAuditRow {
  id: string; occurredAt: string; actorType: string; actorUserId: string | null; action: string;
  orderId: string | null; refundId: string | null; details: string | null; correlationId: string | null;
}

export interface AdminWebhookRow {
  id: string; providerCode: string; providerEventId: string; eventType: string; status: string; attempts: number;
  lastError: string | null; receivedAt: string; processedAt: string | null; orderId: string | null;
}

export interface AdminOrderDetail {
  order: PaymentOrder;
  userId: string;
  userName: string | null;
  correlationId: string;
  transactions: AdminTransaction[];
  refunds: PaymentRefund[];
  audit: AdminAuditRow[];
  webhooks: AdminWebhookRow[];
}

export interface AdminSubscriptionRow {
  id: string; userId: string; userName: string | null; planTier: string; interval: string; status: string;
  currentPeriodStart: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; autoRenew: boolean;
  renewalAuthorization: string; renewalAttempts: number; graceEndsAt: string | null;
}

export interface AdminRefundRow {
  id: string; orderId: string; orderNumber: string; requestedByUserId: string | null; amount: number; currencyCode: string;
  status: string; source: string; reason: string; decidedByUserId: string | null; decisionNote: string | null;
  failureReason: string | null; createdAt: string; processedAt: string | null;
}

export interface AdminProvider {
  code: string; displayName: string; environment: string; isImplemented: boolean; isAllowedHere: boolean; isEnabled: boolean;
  hostedCheckout: boolean; cards: boolean; wallets: boolean; qrCode: boolean; webhooks: boolean; recurring: boolean; refunds: boolean;
  adapterCurrencies: string[]; currencies: string[]; countries: string[];
  businessApprovalNote: string | null; businessApprovedAt: string | null; notes: string | null;
}

export interface UpdateProviderRequest {
  isEnabled: boolean;
  currencies: string[] | null;
  countries: string[] | null;
  businessApprovalNote: string | null;
}

export interface PaymentReportRow {
  key: string; label: string | null; orders: number; succeeded: number; grossAmount: number; refundedAmount: number; grossAmountUsd: number;
}

export interface PaymentReport { groupBy: string; from: string; to: string; rows: PaymentReportRow[] }

export interface ReconciliationResult { checked: number; resolved: number; stillPending: number; failed: number }

export interface AdminOrderFilter {
  status?: string; product?: string; provider?: string; currency?: string; search?: string; page?: number; pageSize?: number;
}
