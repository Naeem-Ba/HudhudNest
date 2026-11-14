// Domain models for the Short-Stay Accommodation subsystem (Airbnb/Booking.com-style
// bookable listings), distinct from the regular sale/rent Property model. Field names/casing
// mirror the backend's actual runtime JSON (camelCase — see HudhudNestApi.Application/ShortStay/DTOs),
// matching the convention already used by visit.model.ts/property.model.ts in this app.
//
// MVP scope (see project decisions): booking targets a single AccommodationUnit at a time.
// The domain supports multi-room-type/multi-unit "hotel" listings end-to-end, but the guest
// booking UI in this phase only ever books the first/only unit of a listing — full room-type
// selection UX is deferred to a later pass.

export type LocationVisibility = 'Exact' | 'Approximate';
export type BookingMode = 'Instant' | 'Request';
export type PaymentMethod = 'PayOnArrival' | 'PhoneConfirmation' | 'ChatConfirmation' | 'OnlinePayment';

export type BookingStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'DepositPaid'
  | 'Confirmed'
  | 'CheckedIn'
  | 'CheckedOut'
  | 'Completed'
  | 'Cancelled'
  | 'Expired'
  | 'NoShow';

export interface AccommodationTypeDto {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  icon: string | null;
  sortOrder: number;
}

/** Same currencies the sale/rent property form offers; the backend validates the full ISO allowlist. */
export const SHORT_STAY_CURRENCIES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'SYP', label: 'ل.س — الليرة السورية' },
  { code: 'USD', label: '$ — الدولار الأمريكي' },
  { code: 'EUR', label: '€ — اليورو' }
];

export interface AccommodationUnitDto {
  id: string;
  label: string;
  isActive: boolean;
}

export interface PricingRuleDto {
  id: string;
  ruleType: 'Base' | 'Weekday' | 'Weekend' | 'Seasonal' | 'Holiday' | 'CustomDate';
  dayOfWeek: number | null;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  pricePerNight: number;
}

export interface MinimumStayRuleDto {
  id: string;
  minimumNights: number;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
}

export interface RoomTypeDto {
  id: string;
  name: string;
  basePricePerNight: number;
  capacity: number | null;
  isActive: boolean;
  units: AccommodationUnitDto[];
  pricingRules: PricingRuleDto[];
  minimumStayRules: MinimumStayRuleDto[];
}

export interface ShortStayListingSummary {
  id: string;
  title: string;
  accommodationTypeCode: string;
  accommodationTypeNameAr: string;
  capacity: number;
  bedrooms: number;
  bathrooms: number;
  fromPricePerNight: number | null;
  /** ISO 4217 code `fromPricePerNight` (and every other price on the listing) is quoted in. */
  currencyCode: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  isPublished: boolean;
  /** True while an administrator has taken the listing down; the owner cannot publish it again. */
  isTakenDown?: boolean;
  mainPhotoUrl: string | null;
  averageRating: number | null;
  reviewCount: number;
  /** Counted detail-page views from the server; absent from an older API. */
  viewCount?: number;
}

export interface ShortStayListing {
  id: string;
  ownerId: string;
  propertyId: string | null;
  accommodationTypeId: number;
  accommodationTypeCode: string;
  /** ISO 4217 code; fixed at creation. All prices on this listing are per night in this currency. */
  currencyCode: string;
  title: string;
  description: string;
  capacity: number;
  bedrooms: number;
  bathrooms: number;
  checkInTime: string; // "HH:mm:ss"
  checkOutTime: string;
  selfCheckInEnabled: boolean;
  instantBookingEnabled: boolean;
  requestBookingEnabled: boolean;
  // Already redacted server-side when locationVisibility === 'Approximate' and the caller
  // isn't authorized to see the exact point — never re-derive/round these on the client.
  latitude: number | null;
  longitude: number | null;
  governorateId: number | null;
  districtId: number | null;
  neighborhoodId: number | null;
  city: string | null;
  locationVisibility: LocationVisibility;
  poolType: 'Private' | 'Shared' | null;
  poolLocation: 'Indoor' | 'Outdoor' | null;
  poolIsSeasonal: boolean | null;
  poolIsHeated: boolean | null;
  cleaningFee: number;
  extraGuestFee: number;
  extraBedFee: number;
  allowsSmoking: boolean;
  allowsParties: boolean;
  allowsPets: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  customRulesText: string | null;
  cancellationFreeCancellationDays: number;
  cancellationDepositRefundable: boolean;
  cancellationCustomTermsText: string | null;
  // Security audit finding (2026-09-18): the backend used to omit this from the GET response
  // entirely, so the edit form had no way to read it back and echo it unchanged on save --
  // see UpdateShortStayListingCommandHandler's doc comment on the same finding.
  depositPercentage: number | null;
  isPublished: boolean;
  publishedAt: string | null;
  /** Counted detail-page views from the server; absent from an older API. */
  viewCount?: number;
  /** Set by an administrator's take-down (QA Phase 9); the reason is shown to the owner. */
  isTakenDown?: boolean;
  takenDownReason?: string | null;
  roomTypes: RoomTypeDto[];
  photoUrls: string[];
  amenityIds: string[];
}

export interface ShortStayListingSearchFilter {
  /** The city/governorate as text (a place typed in the place box); matched in the listing's city and the governorate's names. */
  city?: string;
  /** Free text: ONE matching word in the title, description or city, or a place name in any language, is enough. */
  searchTerm?: string;
  accommodationTypeId?: number;
  /** A catalog place of any level; the server finds every listing inside it. */
  locationId?: number;
  checkIn?: string; // "yyyy-MM-dd"
  checkOut?: string;
  /** People who sleep there; compared with the capacity of the room that is booked. */
  guests?: number;
  minBedrooms?: number;
  instantBooking?: boolean;
  /** Every one of these amenities must be offered. */
  amenityIds?: string[];
  minPrice?: number;
  maxPrice?: number;
  /** The currency the price range is written in; listings priced in other currencies are converted by the server. */
  currencyCode?: string;
  /** "price" (nightly price in one currency) or omitted for the newest first. */
  sortBy?: 'price';
  sortDescending?: boolean;
  page?: number;
  pageSize?: number;
}

export interface NightlyPriceDto {
  date: string;
  price: number;
  appliedRuleType: string;
}

export interface PricingBreakdown {
  nights: NightlyPriceDto[];
  nightsSubtotal: number;
  cleaningFee: number;
  extraGuestFee: number;
  extraBedFee: number;
  totalAmount: number;
  minimumNightsRequired: number;
}

export interface UnitAvailabilityRange {
  checkIn: string;
  checkOut: string;
  status: 'Reserved' | 'CheckedIn' | 'Pending' | 'Blocked';
}

export interface BookingDto {
  id: string;
  unitId: string;
  shortStayListingId: string;
  listingTitle: string;
  currencyCode: string;
  guestId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
  mode: BookingMode;
  paymentMethod: PaymentMethod;
  totalAmount: number;
  depositAmount: number;
  remainingAmount: number;
  status: BookingStatus;
  hostNote: string | null;
  cancellationReason: string | null;
  createdAt: string;
  respondedAt: string | null;
  cancelledAt: string | null;
  /** When an unconfirmed (Pending/Approved/DepositPaid) booking lapses; null once confirmed or finished. */
  confirmationDeadline?: string | null;
  /** Guest side only: true once a Completed stay has been reviewed. Absent on host requests. */
  reviewed?: boolean | null;
}

export interface CreateBookingRequest {
  unitId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
  paymentMethod: PaymentMethod;
  houseRulesAccepted: boolean;
}

export interface CreateShortStayListingRequest {
  accommodationTypeId: number;
  title: string;
  description: string;
  capacity: number;
  bedrooms: number;
  bathrooms: number;
  checkInTime: string; // "HH:mm"
  checkOutTime: string;
  /** Null until the host pins the listing; the API never stores a fake 0,0. */
  latitude: number | null;
  longitude: number | null;
  governorateId?: number | null;
  districtId?: number | null;
  neighborhoodId?: number | null;
  locationVisibility?: LocationVisibility;
  defaultBasePricePerNight: number;
  currencyCode: string;
  propertyId?: string | null;
}

export interface UpdateShortStayListingRequest {
  title: string;
  description: string;
  capacity: number;
  bedrooms: number;
  bathrooms: number;
  checkInTime: string; // "HH:mm"
  checkOutTime: string;
  selfCheckInEnabled: boolean;
  instantBookingEnabled: boolean;
  requestBookingEnabled: boolean;
  latitude: number | null;
  longitude: number | null;
  governorateId: number | null;
  districtId: number | null;
  neighborhoodId: number | null;
  city: string | null;
  locationVisibility: LocationVisibility;
  poolType: 'Private' | 'Shared' | null;
  poolLocation: 'Indoor' | 'Outdoor' | null;
  poolIsSeasonal: boolean | null;
  poolIsHeated: boolean | null;
  cleaningFee: number;
  extraGuestFee: number;
  extraBedFee: number;
  allowsSmoking: boolean;
  allowsParties: boolean;
  allowsPets: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  customRulesText: string | null;
  cancellationFreeCancellationDays: number;
  cancellationDepositRefundable: boolean;
  cancellationCustomTermsText: string | null;
  depositPercentage: number | null;
}

export interface AddRoomTypeRequest {
  name: string;
  basePricePerNight: number;
  capacity: number | null;
}

export interface AddAccommodationUnitRequest {
  label: string;
}

/** Human-readable labels for the booking state machine — used consistently across guest and
 * host booking lists so the same status always reads the same way. */
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  Pending: 'SHORTSTAY.BOOKINGS.STATUS.PENDING',
  Approved: 'SHORTSTAY.BOOKINGS.STATUS.APPROVED',
  Rejected: 'SHORTSTAY.BOOKINGS.STATUS.REJECTED',
  DepositPaid: 'SHORTSTAY.BOOKINGS.STATUS.DEPOSIT_PAID',
  Confirmed: 'SHORTSTAY.BOOKINGS.STATUS.CONFIRMED',
  CheckedIn: 'SHORTSTAY.BOOKINGS.STATUS.CHECKED_IN',
  CheckedOut: 'SHORTSTAY.BOOKINGS.STATUS.CHECKED_OUT',
  Completed: 'SHORTSTAY.BOOKINGS.STATUS.COMPLETED',
  Cancelled: 'SHORTSTAY.BOOKINGS.STATUS.CANCELLED',
  Expired: 'SHORTSTAY.BOOKINGS.STATUS.EXPIRED',
  NoShow: 'SHORTSTAY.BOOKINGS.STATUS.NO_SHOW'
};

// ── الحجز الفوري (قرار المالك 2026-10-18) ─────────────────────────────
/** An instant booking must start within this many days from today (the API enforces it). */
export const INSTANT_BOOKING_MAX_ADVANCE_DAYS = 30;
/** ...and cover at most this many nights. */
export const INSTANT_BOOKING_MAX_NIGHTS = 30;

// ── تأكيد الحجز خلال مهلة ────────────────────────────────────────────
/** Statuses in which a booking still waits for confirmation and therefore carries a deadline. */
const AWAITING_CONFIRMATION: readonly BookingStatus[] = ['Pending', 'Approved', 'DepositPaid'];

/** The deadline to show for a booking ("يجب التأكيد قبل ..."), or null when none applies. */
export function confirmationDeadlineOf(booking: Pick<BookingDto, 'status' | 'confirmationDeadline'>): string | null {
  if (!AWAITING_CONFIRMATION.includes(booking.status)) return null;
  return booking.confirmationDeadline || null;
}

// ── التقييمات ─────────────────────────────────────────────────────────
export const SHORT_STAY_REVIEW_COMMENT_MAX_LENGTH = 1000;

/** The "قيّم إقامتك" button shows only for the guest's Completed stays that are not reviewed yet. */
export function canReviewBooking(booking: Pick<BookingDto, 'status' | 'reviewed'>): boolean {
  return booking.status === 'Completed' && booking.reviewed === false;
}

export interface CreateShortStayReviewRequest {
  bookingId: string;
  rating: number;
  comment?: string | null;
}

/** An i18n key describing why the review cannot be sent, or null when it can. */
export function validateShortStayReview(rating: number, comment: string | null | undefined): string | null {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 'REVIEW.RATING_RANGE';
  if ((comment ?? '').length > SHORT_STAY_REVIEW_COMMENT_MAX_LENGTH) return 'REVIEW.COMMENT_TOO_LONG';
  return null;
}

export interface ShortStayReviewDto {
  id: string;
  bookingId: string;
  reviewerId: string;
  shortStayListingId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface ShortStayReviewItem {
  id: string;
  reviewerId: string;
  reviewerName: string;
  reviewerImageUrl: string | null;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface ShortStayReviewSummary {
  averageRating: number;
  totalCount: number;
  reviews: ShortStayReviewItem[];
}

// ── إتاحة الوحدة التي يتحكم بها المضيف ─────────────────────────────────
/** A period the host marked as not available. `from` is inclusive, `to` is exclusive (the morning it is free again). */
export interface UnitBlockDto {
  id: string;
  unitId: string;
  from: string; // "yyyy-MM-dd"
  to: string;
}

export interface AddUnitBlockRequest {
  from: string; // "yyyy-MM-dd"
  to: string;
}

/**
 * An i18n key describing why a blocked period cannot be sent, or null when it can. `today` is "yyyy-MM-dd".
 * The API checks the same rules (422) and the overlap with bookings (409); this only spares the round trip.
 */
export function validateUnitBlockRange(from: string, to: string, today: string): string | null {
  if (!from || !to) return 'SHORTSTAY.AVAILABILITY.ERR_DATES_REQUIRED';
  if (from < today) return 'SHORTSTAY.AVAILABILITY.ERR_PAST';
  if (to <= from) return 'SHORTSTAY.AVAILABILITY.ERR_ORDER';
  return null;
}

// ── إيقاف الإدارة ─────────────────────────────────────────────────────
/** Publishing is refused (409) for a listing an administrator took down, so the action is not offered. */
export function canPublishShortStay(listing: { isPublished: boolean; isTakenDown?: boolean }): boolean {
  return !listing.isPublished && !listing.isTakenDown;
}

export interface AdminShortStayListing {
  id: string;
  title: string;
  city: string | null;
  ownerId: string;
  accommodationTypeNameAr: string;
  isPublished: boolean;
  isTakenDown: boolean;
  takenDownAt: string | null;
  takenDownReason: string | null;
  createdAt: string;
}

export interface AdminShortStayFilter {
  search?: string;
  /** true = only taken-down listings; omit for all. */
  takenDown?: boolean;
  page?: number;
  pageSize?: number;
}

export const ADMIN_SHORT_STAY_REASON_MAX_LENGTH = 500;
