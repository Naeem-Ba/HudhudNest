import {
  ServiceRequestDto,
  ServiceRequestStatus,
  canCloseRequest,
  canConfirmRequest,
  canExchangeMessages,
  canReview,
  validateCreateServiceRequest,
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

describe('service model: conversation stage', () => {
  it('lets the customer confirm only an inquiry they have written to, and only their own', () => {
    expect(canConfirmRequest(request({ status: 'Inquiry', messageCount: 1 }), 'u1')).toBeTrue();
    expect(canConfirmRequest(request({ status: 'Inquiry', messageCount: 0 }), 'u1')).toBeFalse();
    expect(canConfirmRequest(request({ status: 'Inquiry' }), 'u1')).toBeFalse();
    expect(canConfirmRequest(request({ status: 'Inquiry', messageCount: 2 }), 'u2')).toBeFalse();
    expect(canConfirmRequest(request({ status: 'Inquiry', messageCount: 2 }), null)).toBeFalse();
    expect(canConfirmRequest(request({ status: 'UnderReview', messageCount: 2 }), 'u1')).toBeFalse();
  });

  it('lets the two sides talk until the request is delivered or closed', () => {
    const open: ServiceRequestStatus[] = ['Inquiry', 'UnderReview', 'Accepted', 'Scheduled', 'InProgress'];
    const closed: ServiceRequestStatus[] = ['Completed', 'NotCompleted', 'Reviewed', 'Rejected', 'Cancelled', 'Expired'];

    open.forEach(status => expect(canExchangeMessages(status)).withContext(status).toBeTrue());
    closed.forEach(status => expect(canExchangeMessages(status)).withContext(status).toBeFalse());
  });

  it('asks the provider to reply to an inquiry and gives an expired request no further step', () => {
    expect(nextProviderAction('Inquiry')).toBe('Reply');
    expect(nextProviderAction('Expired')).toBe('None');
  });

  it('requires a message whenever an intent is sent, and still accepts the legacy payload without one', () => {
    const base = { propertyId: 'p1', serviceOfferingId: 'o1' };

    expect(validateCreateServiceRequest({ ...base, intent: 'Inquire' })).toBe('SERVICE_REQUEST.MESSAGE_REQUIRED');
    expect(validateCreateServiceRequest({ ...base, intent: 'Request', requesterNote: '   ' })).toBe('SERVICE_REQUEST.MESSAGE_REQUIRED');
    expect(validateCreateServiceRequest({ ...base, intent: 'Request', requesterNote: 'Price?' })).toBeNull();
    expect(validateCreateServiceRequest(base)).toBeNull();
    expect(validateCreateServiceRequest({ ...base, intent: 'Inquire', requesterNote: 'x'.repeat(1001) })).toBe('SERVICE_REQUEST.NOTE_TOO_LONG');
  });
});
