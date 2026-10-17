import {
  ServiceRequestDto,
  ServiceRequestStatus,
  canCloseRequest,
  canReview,
  nextProviderAction,
  needsRequesterFeedback
} from './service.model';

function request(overrides: Partial<ServiceRequestDto> = {}): ServiceRequestDto {
  return {
    id: 'r1', requestNumber: 'SR-1', propertyId: 'p1', propertyTitle: 'Flat', requesterId: 'u1', requesterName: 'Me',
    serviceProviderId: 's1', serviceProviderDisplayName: 'Clean Co', serviceOfferingId: 'o1', serviceOfferingTitle: 'Deep clean',
    category: 'Cleaning', status: 'Completed', createdAt: '2026-10-10T09:00:00Z', ...overrides
  };
}

describe('service model: outcome helpers', () => {
  it('asks the customer once, after the provider closed the request either way', () => {
    expect(needsRequesterFeedback(request({ status: 'Completed' }), 'u1')).toBeTrue();
    expect(needsRequesterFeedback(request({ status: 'NotCompleted' }), 'u1')).toBeTrue();
  });

  it('does not ask again, an open request, someone else, or a signed-out visitor', () => {
    expect(needsRequesterFeedback(request({ requesterAnswer: 'Confirmed' }), 'u1')).toBeFalse();
    expect(needsRequesterFeedback(request({ status: 'Accepted' }), 'u1')).toBeFalse();
    expect(needsRequesterFeedback(request({ status: 'Rejected' }), 'u1')).toBeFalse();
    expect(needsRequesterFeedback(request(), 'u2')).toBeFalse();
    expect(needsRequesterFeedback(request(), null)).toBeFalse();
  });

  it('lets the provider close from Accepted, Scheduled and InProgress only', () => {
    const closable: ServiceRequestStatus[] = ['Accepted', 'Scheduled', 'InProgress'];
    const notClosable: ServiceRequestStatus[] = ['UnderReview', 'Completed', 'NotCompleted', 'Reviewed', 'Rejected', 'Cancelled'];

    closable.forEach(status => expect(canCloseRequest(status)).withContext(status).toBeTrue());
    notClosable.forEach(status => expect(canCloseRequest(status)).withContext(status).toBeFalse());
  });

  it('leaves a not-completed request without any further provider step or review', () => {
    expect(nextProviderAction('NotCompleted')).toBe('None');
    expect(canReview(request({ status: 'NotCompleted' }), 'u1')).toBeFalse();
  });
});
