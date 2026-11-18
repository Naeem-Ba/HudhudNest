// Hudhud AI (Stage 0): the contract of /api/ai. Every card and table value comes from the server's public listing
// record; the client only formats and shows them, as plain text.

export interface AiUnderstoodFilter {
  listingType?: 'ForRent' | 'ForSale' | null;
  propertyTypeCode?: string | null;
  propertyTypeId?: number | null;
  locationId?: number | null;
  placeLabel?: string | null;
  placeText?: string | null;
  minRooms?: number | null;
  maxRooms?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  currencyCode?: string | null;
  currencyGuessed?: boolean;
  minArea?: number | null;
  maxArea?: number | null;
  floorFrom?: number | null;
  floorTo?: number | null;
  floorMode?: 'Highest' | 'Lowest' | null;
  hasElevator?: boolean | null;
  hasBalcony?: boolean | null;
  hasParkingSpace?: boolean | null;
  keywords?: string | null;
  sortBy?: string | null;
  sortDescending?: boolean | null;
}

export interface AiAgencyBadge {
  name: string;
  slug: string | null;
  isVerified: boolean;
}

export interface AiPropertyCard {
  id: string;
  title: string;
  listingType: string;
  price: number | null;
  priceKind: 'Purchase' | 'ColdRent' | 'WarmRent' | null;
  currencyCode: string;
  rooms: number | null;
  area: number | null;
  areaUnit: string;
  floor: number | null;
  placeLabel: string | null;
  mainImageUrl: string | null;
  isFeatured: boolean;
  agency: AiAgencyBadge | null;
}

export interface AiComparisonRow {
  key: string;
  values: (string | null)[];
  comparable: boolean;
  note: 'CURRENCY_DIFFERS' | 'UNITS_DIFFER' | 'NOT_COMPUTABLE' | null;
}

export interface AiComparison {
  listings: AiPropertyCard[];
  rows: AiComparisonRow[];
}

export interface AiSearchResults {
  totalCount: number;
  searchUrl: string;
  searchUrlComplete: boolean;
  cards: AiPropertyCard[];
}

export interface AiUsage {
  remainingToday: number | null;
  remainingThisMonth: number | null;
  resetsAtUtc: string;
}

export type AiReplyKind = 'results' | 'no-results' | 'clarify' | 'help' | 'out-of-scope' | 'comparison';

export interface AiChatResponse {
  conversationId: string | null;
  messageId: string | null;
  kind: AiReplyKind;
  language: string;
  text: string;
  understoodFilter: AiUnderstoodFilter | null;
  results: AiSearchResults | null;
  comparison: AiComparison | null;
  suggestions: string[];
  usage: AiUsage | null;
}

export interface AiStatus {
  enabled: boolean;
  guestsEnabled: boolean;
  modelAvailable: boolean;
  maxMessageCharacters: number;
}

export interface AiConversationSummary {
  id: string;
  title: string | null;
  language: string;
  messageCount: number;
  lastMessageAt: string;
  expiresAt: string;
}

export interface AiStoredMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  rating: number | null;
  understoodFilter: AiUnderstoodFilter | null;
  cards: AiPropertyCard[];
}

export interface AiConversationDetail {
  conversation: AiConversationSummary;
  messages: AiStoredMessage[];
}

export interface AiSendPayload {
  text: string;
  language: string;
  clientMessageId?: string;
  compareIds?: string[];
  previousFilter?: AiUnderstoodFilter | null;
}

/** Stable codes of the API's refusals; the client shows them in the reader's language. */
export type AiErrorCode =
  | 'AI_DISABLED'
  | 'AI_SIGN_IN_REQUIRED'
  | 'AI_QUOTA_DAILY'
  | 'AI_QUOTA_MONTHLY'
  | 'AI_NOT_FOUND'
  | 'AI_INVALID'
  | 'AI_RATE_LIMITED'
  | 'AI_OFFLINE'
  | 'AI_FAILED';
