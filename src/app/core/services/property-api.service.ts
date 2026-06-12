import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import { Property, PropertyFilterDto } from '../models/property.model';

@Injectable({ providedIn: 'root' })
export class PropertyApiService {
  constructor(private readonly api: BackendApiService) {}

  getProperties(filter: PropertyFilterDto = {}): Observable<Property[]> {
    return this.api.get<Property[] | ApiPagedResult<Property>>('/properties', filter as Record<string, string | number | boolean | null | undefined>).pipe(
      map(response => unwrapItems(response))
    );
  }

  getProperty(id: string): Observable<Property> {
    return this.api.get<Property>(`/properties/${id}`);
  }
}
