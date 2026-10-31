// Listing reports (moderation). Mirrors the API's ListingReport DTOs. Codes are stable strings the
// UI translates; nothing here is user-facing text.

export const LISTING_REPORT_REASONS = [
  'Fraud', 'IncorrectDetails', 'FakeListing', 'MisleadingPrice', 'FakePhotos', 'CopyrightViolation',
  'Duplicate', 'NoLongerAvailable', 'MisleadingContact', 'Impersonation', 'IllegalContent',
  'OffensiveContent', 'OffPlatformPayment', 'Other'
] as const;
export type ListingReportReason = (typeof LISTING_REPORT_REASONS)[number];

export const REPORT_STATUSES = ['New', 'UnderReview', 'WaitingForInformation', 'ActionRequired', 'Resolved', 'Dismissed'] as const;
export type ListingReportStatus = (typeof REPORT_STATUSES)[number];
export const OPEN_REPORT_STATUSES: readonly ListingReportStatus[] = ['New', 'UnderReview', 'WaitingForInformation', 'ActionRequired'];

export const REPORT_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;
export type ListingReportPriority = (typeof REPORT_PRIORITIES)[number];

/** Dismissals first (no violation established), then the actions. The outcome decides Resolved/Dismissed. */
export const REPORT_OUTCOMES = [
  'NoViolation', 'InsufficientEvidence', 'DuplicateReport',
  'ListingCorrected', 'CorrectionRequested', 'ListingTakenDown', 'AccountActioned', 'OtherAction'
] as const;
export type ListingReportOutcome = (typeof REPORT_OUTCOMES)[number];

export type ReporterReportStatus = 'Submitted' | 'InReview' | 'NeedsYourInfo' | 'Closed';
export type ReporterReportOutcome = 'ActionTaken' | 'NoViolationFound';

export type ListingReportEventType =
  | 'Created' | 'StatusChanged' | 'PriorityChanged' | 'Assigned' | 'Unassigned' | 'NoteAdded'
  | 'InfoRequested' | 'ReporterResponded' | 'ListingTakenDown' | 'ListingRestored' | 'Closed' | 'Reopened';

export interface ListingReportReasonDto {
  code: ListingReportReason;
  requiresDetails: boolean;
  maxDetailsLength: number;
}

export interface SubmitListingReportPayload {
  propertyId: string;
  reason: ListingReportReason;
  details: string | null;
  /** One random id per dialog: a retry of the same submit returns the first report. */
  clientRequestId: string;
}

export interface MyListingReportEventDto {
  type: ListingReportEventType;
  note: string | null;
  createdAt: string;
}

export interface MyListingReportDto {
  id: string;
  referenceNumber: string;
  propertyId: string;
  listingTitle: string;
  reason: ListingReportReason;
  details: string | null;
  status: ReporterReportStatus;
  outcome: ReporterReportOutcome | null;
  infoRequest: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  timeline: MyListingReportEventDto[];
}

export interface MyOpenReportStatusDto {
  hasOpenReport: boolean;
  reportId: string | null;
  referenceNumber: string | null;
  status: ReporterReportStatus | null;
}

export interface ReportPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminListingReportSummaryDto {
  id: string;
  referenceNumber: string;
  propertyId: string;
  listingTitle: string;
  listingType: 'ForRent' | 'ForSale' | 'ForRentAndSale' | null;
  listingDeleted: boolean;
  listingTakenDown: boolean;
  reason: ListingReportReason;
  status: ListingReportStatus;
  priority: ListingReportPriority;
  isOverdue: boolean;
  reporterUserId: string;
  reporterName: string;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminListingReportStatsDto {
  total: number;
  new: number;
  underReview: number;
  waitingForInformation: number;
  actionRequired: number;
  open: number;
  resolved: number;
  dismissed: number;
  highPriorityOpen: number;
  overdue: number;
  averageResolutionHours: number | null;
  resolvedSampleSize: number;
}

export interface AdminListingSnapshotDto {
  id: string;
  currentTitle: string;
  listingType: string;
  status: string;
  isPublished: boolean;
  isTakenDown: boolean;
  takenDownReason: string | null;
  isDeleted: boolean;
  isPubliclyVisible: boolean;
  price: number | null;
  currencyCode: string;
  city: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  ownerId: string;
  ownerName: string;
}

export interface AdminReporterDto {
  id: string;
  name: string;
  totalReports: number;
  dismissedReports: number;
}

export interface AdminRelatedReportDto {
  id: string;
  referenceNumber: string;
  reason: ListingReportReason;
  status: ListingReportStatus;
  priority: ListingReportPriority;
  sameReporter: boolean;
  createdAt: string;
}

export interface AdminListingReportEventDto {
  id: string;
  type: ListingReportEventType;
  actorUserId: string | null;
  actorName: string | null;
  fromValue: string | null;
  toValue: string | null;
  note: string | null;
  isInternal: boolean;
  createdAt: string;
}

export interface AdminListingReportDetailDto {
  summary: AdminListingReportSummaryDto;
  listingTitleAtReport: string;
  details: string | null;
  infoRequest: string | null;
  outcome: ListingReportOutcome | null;
  resolutionNote: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  firstReviewedAt: string | null;
  reopenCount: number;
  reviewDueAt: string;
  listing: AdminListingSnapshotDto | null;
  reporter: AdminReporterDto;
  openReportsOnListing: number;
  distinctOpenReportersOnListing: number;
  relatedReports: AdminRelatedReportDto[];
  timeline: AdminListingReportEventDto[];
}

export interface ListingReportFilter {
  search?: string;
  status?: ListingReportStatus | '';
  open?: boolean;
  reason?: ListingReportReason | '';
  priority?: ListingReportPriority | '';
  assignedAdminId?: string | '';
  unassigned?: boolean;
  propertyId?: string;
  from?: string;
  to?: string;
  overdue?: boolean;
  sort?: 'Newest' | 'Oldest' | 'Priority' | 'RecentlyUpdated';
  page?: number;
  pageSize?: number;
}

export interface AdminAssigneeDto {
  id: string;
  name: string;
}

export function isReportOpen(status: ListingReportStatus): boolean {
  return OPEN_REPORT_STATUSES.includes(status);
}
