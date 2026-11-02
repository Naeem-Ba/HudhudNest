import { routeForNotification } from './notification-route';
import { toNotificationItem } from './notification.model';

const PROPERTY = '3f2b8c1e-9d4a-4c55-8f0a-1b2c3d4e5f60';
const ENTITY = '11111111-2222-4333-8444-555555555555';

describe('routeForNotification', () => {
  it('opens the property thread for a message', () => {
    expect(routeForNotification({ type: 'NewMessage', target: { kind: 'messages', propertyId: PROPERTY } })).toEqual(['/messages', PROPERTY]);
  });

  it('opens the property page for property events', () => {
    expect(routeForNotification({ type: 'SavedSearchMatch', target: { kind: 'property', propertyId: PROPERTY } })).toEqual(['/properties', PROPERTY]);
    expect(routeForNotification({ type: 'ListingDemandMatch', target: { kind: 'listing-demand', propertyId: PROPERTY } })).toEqual(['/search-requests/for-listing', PROPERTY]);
    expect(routeForNotification({ type: 'ListingDemandMatch', target: { kind: 'listing-demand', propertyId: '../x' } })).toEqual(['/search-requests/board']);
    expect(routeForNotification({ type: 'SavedSearchDigest', target: { kind: 'saved-searches', id: ENTITY } })).toEqual(['/saved-searches']);
    expect(routeForNotification({ type: 'ReferralQualified', target: { kind: 'referrals', id: ENTITY } })).toEqual(['/referrals']);
  });

  it('sends provider-side service events to the provider request and requester events to my services', () => {
    expect(routeForNotification({ type: 'ServiceRequestSubmitted', target: { kind: 'service-request', id: ENTITY } })).toEqual(['/provider/requests', ENTITY]);
    expect(routeForNotification({ type: 'ServiceRequestAccepted', target: { kind: 'service-request', id: ENTITY } })).toEqual(['/my-services']);
  });

  it('maps visits, bookings, listings, agency, valuation and phone verification', () => {
    expect(routeForNotification({ target: { kind: 'visit', id: ENTITY } })).toEqual(['/visits']);
    expect(routeForNotification({ target: { kind: 'short-stay-booking', id: ENTITY } })).toEqual(['/short-stay/bookings']);
    expect(routeForNotification({ target: { kind: 'my-listings' } })).toEqual(['/my-listings']);
    expect(routeForNotification({ target: { kind: 'agency-invitation', id: ENTITY } })).toEqual(['/my-agency']);
    expect(routeForNotification({ target: { kind: 'valuation', id: ENTITY } })).toEqual(['/valuation']);
    expect(routeForNotification({ target: { kind: 'phone-verify' } })).toEqual(['/profile/phone-reverify']);
  });

  it('returns null for an unknown kind or a missing target (older API)', () => {
    expect(routeForNotification({ target: { kind: 'something-new' } })).toBeNull();
    expect(routeForNotification({ type: 'NewMessage', target: null })).toBeNull();
  });

  it('ignores ids that are not GUIDs, so a crafted payload cannot steer navigation', () => {
    expect(routeForNotification({ target: { kind: 'property', propertyId: '../../admin' } })).toBeNull();
    expect(routeForNotification({ target: { kind: 'profile', id: 'x/y' } })).toBeNull();
  });
});

describe('toNotificationItem (target, category, priority)', () => {
  it('reads PascalCase fields from the API', () => {
    const item = toNotificationItem({
      Id: 'a', Type: 'NewMessage', Message: 'm', Category: 'messages', Priority: 2,
      Target: { Kind: 'messages', Id: null, PropertyId: PROPERTY }, IsRead: false, CreatedAt: '2026-10-17T00:00:00Z'
    });
    expect(item.category).toBe('messages');
    expect(item.priority).toBe('High');
    expect(item.target).toEqual({ kind: 'messages', id: null, propertyId: PROPERTY });
  });

  it('tolerates an older API without these fields', () => {
    const item = toNotificationItem({ id: 'a', type: 'NewMessage', message: 'm', isRead: false });
    expect(item.category).toBeUndefined();
    expect(item.priority).toBeUndefined();
    expect(item.target).toBeNull();
  });
});

describe('routeForNotification (listing reports)', () => {
  it('sends admins to the report and reporters to their own list', () => {
    expect(routeForNotification({ type: 'ListingReportSubmitted', target: { kind: 'admin-listing-report', id: ENTITY, propertyId: null }, propertyId: null, relatedEntityId: ENTITY }))
      .toEqual(['/admin/listing-reports', ENTITY]);
    expect(routeForNotification({ type: 'ListingReportInfoRequested', target: { kind: 'my-listing-report', id: ENTITY, propertyId: null }, propertyId: null, relatedEntityId: ENTITY }))
      .toEqual(['/my-reports', ENTITY]);
  });

  it('never puts a malformed id into the path', () => {
    expect(routeForNotification({ type: 'ListingReportSubmitted', target: { kind: 'admin-listing-report', id: '../x', propertyId: null }, propertyId: null, relatedEntityId: '../x' }))
      .toEqual(['/admin/listing-reports']);
  });
});

describe('routeForNotification (investment interest)', () => {
  it('sends admins to the project that received the interest', () => {
    expect(routeForNotification({ type: 'InvestmentInterestReceived', target: { kind: 'admin-investment', id: ENTITY, propertyId: null }, propertyId: null, relatedEntityId: ENTITY }))
      .toEqual(['/admin/investments', ENTITY]);
  });

  it('falls back to the project list when the id is not an id', () => {
    expect(routeForNotification({ type: 'InvestmentInterestReceived', target: { kind: 'admin-investment', id: '../x', propertyId: null }, propertyId: null, relatedEntityId: '../x' }))
      .toEqual(['/admin/investments']);
  });
});

describe('routeForNotification (plans and contact)', () => {
  it('plan and fee notices open the pricing page; a contact alert opens the admin message', () => {
    expect(routeForNotification({ type: 'PlanRequestApproved', target: { kind: 'pricing', id: null, propertyId: null }, propertyId: null, relatedEntityId: null }))
      .toEqual(['/pricing']);
    expect(routeForNotification({ type: 'ContactMessageReceived', target: { kind: 'admin-contact', id: ENTITY, propertyId: null }, propertyId: null, relatedEntityId: ENTITY }))
      .toEqual(['/admin/messages', ENTITY]);
    expect(routeForNotification({ type: 'ContactMessageReceived', target: { kind: 'admin-contact', id: '../x', propertyId: null }, propertyId: null, relatedEntityId: '../x' }))
      .toEqual(['/admin/messages']);
  });
});
