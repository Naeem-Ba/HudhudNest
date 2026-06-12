export interface ApiPagedResult<T> {
  items?: T[];
  Items?: T[];
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

export function unwrapItems<T>(response: T[] | ApiPagedResult<T> | null | undefined): T[] {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  return response.items ?? response.Items ?? [];
}
