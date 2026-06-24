import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService, QueryValue } from './backend-api.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import { Property, PropertyFilterDto } from '../models/property.model';
import { apiToCamelCase } from '../adapters/api-naming.adapter';

@Injectable({ providedIn: 'root' })
export class PropertyApiService {
  constructor(private readonly api: BackendApiService) {}

  getProperties(filter: PropertyFilterDto = {}): Observable<Property[]> {
    return this.api
      .get<Property[] | ApiPagedResult<Property>>('/properties', filter as Record<string, QueryValue>)
      .pipe(map(response => unwrapItems(response).map(item => this.toProperty(item))));
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
        altText: image['altText'] === undefined || image['altText'] === null ? undefined : String(image['altText'])
      }))
      .filter(image => !!image.url);

    const mainImageUrl = property['mainImageUrl'];
    if (typeof mainImageUrl === 'string' && mainImageUrl.trim()) {
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
