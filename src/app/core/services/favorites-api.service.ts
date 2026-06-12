import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import { Favorite } from '../models/favorite.model';

@Injectable({ providedIn: 'root' })
export class FavoritesApiService {
  constructor(private readonly api: BackendApiService) {}

  getFavorites(): Observable<Favorite[]> {
    return this.api.get<Favorite[] | ApiPagedResult<Favorite>>('/favorites').pipe(map(response => unwrapItems(response)));
  }

  add(propertyId: string): Observable<unknown> {
    return this.api.post(`/favorites/${propertyId}`);
  }

  remove(propertyId: string): Observable<unknown> {
    return this.api.delete(`/favorites/${propertyId}`);
  }
}
