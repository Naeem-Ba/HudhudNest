import { Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { BackendApiService, QueryValue } from '../api/backend-api.service';
import { ApiPagedResult, normalizePagedResult, PagedResult, unwrapItems } from '../models/api.model';
import { Property, PropertyFilterDto } from '../models/property.model';
import { apiToCamelCase } from '../adapters/api-naming.adapter';

@Injectable({ providedIn: 'root' })
export class PropertyApiService {
  constructor(private readonly api: BackendApiService) {}

  getProperties(filter: PropertyFilterDto = {}): Observable<Property[]> {
    return this.getPropertiesPaged(filter).pipe(map(result => result.items));
  }

  getPropertiesPaged(filter: PropertyFilterDto = {}): Observable<PagedResult<Property>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;

    return this.api
      .get<Property[] | ApiPagedResult<Property>>(
        '/properties',
        this.toQuery(filter)
      )
      .pipe(
        map(response => normalizePagedResult(
          response,
          item => this.toProperty(item),
          page,
          pageSize
        ))
      );
  }

  /**
   * Loads only the authenticated user's own listings.
   * This avoids the unsafe frontend fallback of requesting all properties and
   * filtering them by ownerId on the client.
   */
  getMyProperties(): Observable<Property[]> {
    return this.getPropertyCollection('/properties/mine').pipe(
      catchError(error => {
        if (error?.status === 404) {
          return this.getPropertyCollection('/properties/my');
        }

        return throwError(() => error);
      })
    );
  }

  getProperty(id: string): Observable<Property> {
    return this.api
      .get<unknown>(`/properties/${id}`)
      .pipe(map(item => this.toProperty(item)));
  }

  deleteProperty(id: string): Observable<void> {
    return this.api.delete<void>(`/properties/${id}`);
  }

  createProperty(payload: unknown): Observable<unknown> {
    return this.api.post<unknown>('/properties', payload);
  }

  updateProperty(id: string, payload: unknown): Observable<unknown> {
    return this.api.put<unknown>(`/properties/${id}`, payload);
  }

  uploadImages(propertyId: string, formData: FormData): Observable<unknown[]> {
    return this.api.postFormData<unknown[]>(
      `/properties/${propertyId}/images`,
      formData
    );
  }

  private getPropertyCollection(path: string): Observable<Property[]> {
    return this.api
      .get<Property[] | ApiPagedResult<Property>>(path)
      .pipe(map(response => unwrapItems(response).map(item => this.toProperty(item))));
  }

  private toQuery(filter: PropertyFilterDto): Record<string, QueryValue> {
    const query: Record<string, QueryValue> = {};

    Object.entries(filter).forEach(([key, value]) => {
      if (key === 'isPublished') {
        return;
      }

      if (Array.isArray(value)) {
        if (value.length > 0) {
          query[key] = value.map(String);
        }
        return;
      }

      if (value !== undefined && value !== null && value !== '') {
        query[key] = value as QueryValue;
      }
    });

    return query;
  }

  private toProperty(item: unknown): Property {
    const property = apiToCamelCase<Record<string, unknown>>(item);
    const images = this.normalizeImages(property);

    return {
      ...(property as Partial<Property>),
      id: String(property['id'] ?? ''),
      title: String(property['title'] ?? ''),
      city: String(property['city'] ?? ''),
      images,
      imageUrls: this.toStringArray(property['imageUrls'])
    } as Property;
  }

  private normalizeImages(property: Record<string, unknown>): Property['images'] {
    const rawImages = property['images'];
    const images = Array.isArray(rawImages) ? rawImages : [];

    const normalized: NonNullable<Property['images']> = images
      .map(image => apiToCamelCase<Record<string, unknown>>(image))
      .map(image => ({
        id: image['id'] === undefined || image['id'] === null ? undefined : String(image['id']),
        url: String(image['url'] ?? ''),
        isMain: Boolean(image['isMain']),
        altText: image['altText'] === undefined || image['altText'] === null ? undefined : String(image['altText']),
        sortOrder: typeof image['sortOrder'] === 'number' ? image['sortOrder'] : undefined
      }))
      .filter(image => !!image.url);

    if (normalized.some(image => image.sortOrder !== undefined)) {
      normalized.sort((left, right) =>
        (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER)
      );
    }

    const mainImageUrl = property['mainImageUrl'];
    if (typeof mainImageUrl === 'string' && mainImageUrl.trim()
      && !normalized.some(image => image.url === mainImageUrl)) {
      normalized.unshift({ url: mainImageUrl, isMain: true });
    }

    this.toStringArray(property['imageUrls']).forEach(url => {
      if (!normalized.some(image => image.url === url)) {
        normalized.push({ url, isMain: false });
      }
    });

    return normalized;
  }

  private toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  }
}
