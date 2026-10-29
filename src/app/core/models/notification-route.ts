import { NotificationItem } from './notification.model';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Types that are addressed to the SERVICE PROVIDER side of a request (everything else goes to the requester). */
const PROVIDER_SIDE_TYPES = new Set(['ServiceRequestSubmitted', 'ServiceReviewAdded', 'ServiceInquiryReceived']);

/**
 * The in-app route a notification opens, or null when it has none. Ids are only used to build a path
 * (and only when they look like ids); the target page decides, with the signed-in account, whether this
 * person may see it -- a notification never grants access.
 */
export function routeForNotification(item: Pick<NotificationItem, 'type' | 'target' | 'propertyId' | 'relatedEntityId'>): string[] | null {
  const kind = item.target?.kind;
  const entityId = validId(item.target?.id ?? item.relatedEntityId);
  const propertyId = validId(item.target?.propertyId ?? item.propertyId);

  switch (kind) {
    case 'messages':
      return propertyId ? ['/messages', propertyId] : ['/messages'];
    case 'property':
      return propertyId ? ['/properties', propertyId] : null;
    case 'my-listings':
      return ['/my-listings'];
    case 'visit':
      return ['/visits'];
    case 'short-stay-booking':
      return ['/short-stay/bookings'];
    case 'service-request':
      if (item.type && PROVIDER_SIDE_TYPES.has(item.type)) {
        return entityId ? ['/provider/requests', entityId] : ['/provider/requests'];
      }
      return ['/my-services'];
    case 'provider-application':
      return ['/services/join'];
    case 'admin-listing-report':
      return entityId ? ['/admin/listing-reports', entityId] : ['/admin/listing-reports'];
    case 'admin-investment':
      return entityId ? ['/admin/investments', entityId] : ['/admin/investments'];
    case 'my-listing-report':
      return ['/my-reports'];
    case 'agency-invitation':
    case 'agency':
      return ['/my-agency'];
    case 'valuation':
      return ['/valuation'];
    case 'profile':
      return entityId ? ['/users', entityId] : null;
    case 'phone-verify':
      return ['/profile/phone-reverify'];
    case 'notifications':
      return ['/notifications'];
    default:
      return null;
  }
}

function validId(value: string | null | undefined): string | null {
  return value && GUID.test(value) ? value : null;
}
