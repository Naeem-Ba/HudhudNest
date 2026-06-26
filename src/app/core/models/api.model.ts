export interface ApiPagedResult<T> {
  items?: T[];
  Items?: T[];
  data?: T[];
  Data?: T[];
  results?: T[];
  Results?: T[];
  reviews?: T[];
  Reviews?: T[];
  totalCount?: number;
  TotalCount?: number;
  page?: number;
  Page?: number;
  pageSize?: number;
  PageSize?: number;
  totalPages?: number;
  TotalPages?: number;
  hasNext?: boolean;
  HasNext?: boolean;
  hasPrevious?: boolean;
  HasPrevious?: boolean;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export function unwrapItems<T>(response: T[] | ApiPagedResult<T> | null | undefined): T[] {
  if (!response) return [];
  if (Array.isArray(response)) return response;

  return response.items
    ?? response.Items
    ?? response.data
    ?? response.Data
    ?? response.results
    ?? response.Results
    ?? response.reviews
    ?? response.Reviews
    ?? [];
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normalizePagedResult<TInput, TOutput = TInput>(
  response: TInput[] | ApiPagedResult<TInput> | null | undefined,
  mapItem: (item: TInput) => TOutput = item => item as unknown as TOutput,
  fallbackPage = 1,
  fallbackPageSize = 20
): PagedResult<TOutput> {
  const items = unwrapItems(response).map(mapItem);

  if (!response || Array.isArray(response)) {
    const page = toPositiveInteger(fallbackPage, 1);
    const pageSize = toPositiveInteger(fallbackPageSize, items.length || 20);
    const totalCount = items.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return {
      items,
      totalCount,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1
    };
  }

  const page = toPositiveInteger(response.page ?? response.Page, fallbackPage || 1);
  const pageSize = toPositiveInteger(response.pageSize ?? response.PageSize, fallbackPageSize || 20);
  const totalCount = toNonNegativeInteger(
    response.totalCount ?? response.TotalCount,
    items.length
  );
  const totalPages = toNonNegativeInteger(
    response.totalPages ?? response.TotalPages,
    pageSize <= 0 ? 1 : Math.max(1, Math.ceil(totalCount / pageSize))
  );

  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages,
    hasNext: Boolean(response.hasNext ?? response.HasNext ?? page < totalPages),
    hasPrevious: Boolean(response.hasPrevious ?? response.HasPrevious ?? page > 1)
  };
}
