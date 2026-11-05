import {
  BookingDto,
  canPublishShortStay,
  canReviewBooking,
  confirmationDeadlineOf,
  validateShortStayReview,
  validateUnitBlockRange,
  SHORT_STAY_REVIEW_COMMENT_MAX_LENGTH
} from './short-stay.model';

type Deadline = Pick<BookingDto, 'status' | 'confirmationDeadline'>;

describe('short-stay model rules (QA phase 9)', () => {
  describe('confirmationDeadlineOf', () => {
    it('shows the deadline only while the booking waits for confirmation', () => {
      const deadline = '2026-11-01T10:00:00Z';
      for (const status of ['Pending', 'Approved', 'DepositPaid'] as const) {
        expect(confirmationDeadlineOf({ status, confirmationDeadline: deadline } as Deadline)).toBe(deadline);
      }
      for (const status of ['Confirmed', 'CheckedIn', 'Completed', 'Cancelled', 'Expired', 'Rejected'] as const) {
        expect(confirmationDeadlineOf({ status, confirmationDeadline: deadline } as Deadline)).toBeNull();
      }
    });

    it('returns null when the API sent no deadline', () => {
      expect(confirmationDeadlineOf({ status: 'Pending', confirmationDeadline: null } as Deadline)).toBeNull();
    });
  });

  describe('canReviewBooking', () => {
    it('is offered only for completed stays that were not reviewed', () => {
      expect(canReviewBooking({ status: 'Completed', reviewed: false })).toBeTrue();
      expect(canReviewBooking({ status: 'Completed', reviewed: true })).toBeFalse();
      expect(canReviewBooking({ status: 'Confirmed', reviewed: false })).toBeFalse();
      expect(canReviewBooking({ status: 'CheckedIn', reviewed: false })).toBeFalse();
    });
  });

  describe('validateShortStayReview', () => {
    it('accepts 1-5 whole stars', () => {
      for (const n of [1, 2, 3, 4, 5]) expect(validateShortStayReview(n, null)).toBeNull();
    });

    it('rejects no stars, fractions and out-of-range values', () => {
      for (const n of [0, 6, 2.5, -1, NaN]) expect(validateShortStayReview(n, null)).toBe('REVIEW.RATING_RANGE');
    });

    it('limits the comment to the API maximum', () => {
      expect(validateShortStayReview(5, 'x'.repeat(SHORT_STAY_REVIEW_COMMENT_MAX_LENGTH))).toBeNull();
      expect(validateShortStayReview(5, 'x'.repeat(SHORT_STAY_REVIEW_COMMENT_MAX_LENGTH + 1))).toBe('REVIEW.COMMENT_TOO_LONG');
    });
  });

  describe('validateUnitBlockRange', () => {
    const today = '2026-11-01';

    it('requires both dates', () => {
      expect(validateUnitBlockRange('', '2026-11-05', today)).toBe('SHORTSTAY.AVAILABILITY.ERR_DATES_REQUIRED');
      expect(validateUnitBlockRange('2026-11-03', '', today)).toBe('SHORTSTAY.AVAILABILITY.ERR_DATES_REQUIRED');
    });

    it('refuses a start in the past and an end that is not after the start', () => {
      expect(validateUnitBlockRange('2026-10-31', '2026-11-05', today)).toBe('SHORTSTAY.AVAILABILITY.ERR_PAST');
      expect(validateUnitBlockRange('2026-11-05', '2026-11-05', today)).toBe('SHORTSTAY.AVAILABILITY.ERR_ORDER');
      expect(validateUnitBlockRange('2026-11-05', '2026-11-04', today)).toBe('SHORTSTAY.AVAILABILITY.ERR_ORDER');
    });

    it('accepts a block that starts today', () => {
      expect(validateUnitBlockRange('2026-11-01', '2026-11-02', today)).toBeNull();
    });
  });

  describe('canPublishShortStay', () => {
    it('hides publishing for a listing an administrator took down', () => {
      expect(canPublishShortStay({ isPublished: false, isTakenDown: false })).toBeTrue();
      expect(canPublishShortStay({ isPublished: false })).toBeTrue();
      expect(canPublishShortStay({ isPublished: false, isTakenDown: true })).toBeFalse();
      expect(canPublishShortStay({ isPublished: true, isTakenDown: false })).toBeFalse();
    });
  });
});
