// =============================================================
// src/app/core/api/place-proposal.service.ts
//
// Forms that only know the older ids (governorate / district) - search requests, valuation, price estimate,
// agencies - cannot store a district or neighborhood name the person typed because it is not in the list.
// Such a name is not thrown away: for a signed-in person it becomes a place proposal for the administrators
// (the catalog's normal review queue), and the form carries on with the part it does know. Never blocks a form.
// =============================================================

import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { GeoLocation } from '../models/geo-location.model';
import { LocationsApiService } from './locations-api.service';

export interface PlaceProposalRequest {
  /** The older governorate id the form works with. */
  governorateId: number;
  /** The older district id, when one was chosen (the place is then proposed inside it). */
  districtId?: number | null;
  type: 'District' | 'Neighborhood';
  name: string;
}

@Injectable({ providedIn: 'root' })
export class PlaceProposalService {
  private readonly locations = inject(LocationsApiService);
  private readonly auth = inject(AuthService);

  /** The review queue needs to know who proposed: only a signed-in person can propose. */
  canPropose(): boolean {
    return !!this.auth.getAccessToken();
  }

  /** Proposes the place; emits false (never an error) when it could not be sent. */
  propose(request: PlaceProposalRequest): Observable<boolean> {
    const name = request.name.trim();
    if (!name || !this.canPropose()) return of(false);

    return this.locations.getTopLevel().pipe(
      switchMap(governorates => {
        const governorate = governorates.find(g => g.legacy?.governorateId === request.governorateId);
        if (!governorate) return of<number | null>(null);
        if (request.type === 'District' || !request.districtId) return of<number | null>(governorate.id);
        return this.locations.getDescendants(governorate.id, 'District').pipe(
          map((districts: GeoLocation[]) =>
            districts.find(d => d.legacy?.districtId === request.districtId)?.id ?? governorate.id)
        );
      }),
      switchMap(parentLocationId =>
        parentLocationId === null
          ? of(false)
          : this.locations.submitRequest({ type: request.type, parentLocationId, name }).pipe(map(() => true))
      ),
      catchError(() => of(false))
    );
  }
}
