// Domain models for the Short-Stay Accommodation subsystem (Airbnb/Booking.com-style
// bookable listings), distinct from the regular sale/rent Property model. Field names/casing
// mirror the backend's actual runtime JSON (camelCase — see PropertyApi.Application/ShortStay/DTOs),
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
  mainPhotoUrl: string | null;
  averageRating: number | null;
  reviewCount: number;
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
  roomTypes: RoomTypeDto[];
  photoUrls: string[];
  amenityIds: string[];
}

export interface ShortStayListingSearchFilter {
  city?: string;
  accommodationTypeId?: number;
  checkIn?: string; // "yyyy-MM-dd"
  checkOut?: string;
  guests?: number;
  minPrice?: number;
  maxPrice?: number;
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
