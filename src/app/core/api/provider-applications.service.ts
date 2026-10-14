// src/app/core/api/provider-applications.service.ts
//
// The applicant's side of "join as a service provider". Replaces the old route of sending a
// free-text contact message. Every call is for the signed-in user's own application; the server
// answers 404 for anyone else's id.
//   POST /api/ServiceProviderApplications                 ← submit
//   GET  /api/ServiceProviderApplications/me               ← my applications, newest first
//   PUT  /api/ServiceProviderApplications/{id}/respond     ← answer an info request (NeedsInfo only)
//   POST /api/ServiceProviderApplications/{id}/withdraw

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { BackendApiService } from './backend-api.service';
import {
  RespondServiceProviderApplicationPayload,
  ServiceProviderApplicationDto,
  SubmitServiceProviderApplicationPayload
} from '../models/provider-onboarding.model';

@Injectable({ providedIn: 'root' })
export class ProviderApplicationsService {
  private readonly endpoint = '/ServiceProviderApplications';

  constructor(private readonly api: BackendApiService) {}

  submit(payload: SubmitServiceProviderApplicationPayload): Observable<ServiceProviderApplicationDto> {
    return this.api.post<ServiceProviderApplicationDto>(this.endpoint, payload);
  }

  getMine(): Observable<ServiceProviderApplicationDto[]> {
    return this.api.get<ServiceProviderApplicationDto[]>(`${this.endpoint}/me`);
  }

  respond(id: string, payload: RespondServiceProviderApplicationPayload): Observable<ServiceProviderApplicationDto> {
    return this.api.put<ServiceProviderApplicationDto>(`${this.endpoint}/${id}/respond`, payload);
  }

  withdraw(id: string): Observable<ServiceProviderApplicationDto> {
    return this.api.post<ServiceProviderApplicationDto>(`${this.endpoint}/${id}/withdraw`);
  }
}
