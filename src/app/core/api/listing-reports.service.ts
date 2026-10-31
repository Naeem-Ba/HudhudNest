// src/app/core/api/listing-reports.service.ts
//
// The reporter's side of listing reports. Signed-in only; every call is for the caller's own reports
// (the server answers 404 for anyone else's id). The listing owner has no endpoint.
//   GET  /api/listing-reports/reasons
//   POST /api/listing-reports                       ← submit (201 created, 200 replay of the same clientRequestId)
//   GET  /api/listing-reports/me?page&pageSize
//   GET  /api/listing-reports/me/open?propertyId
//   GET  /api/listing-reports/me/{id}
//   POST /api/listing-reports/me/{id}/respond       ← answer an admin's question

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { BackendApiService } from './backend-api.service';
import {
  ListingReportReasonDto,
  MyListingReportDto,
  MyOpenReportStatusDto,
  ReportPage,
  SubmitListingReportPayload
} from '../models/listing-report.model';

@Injectable({ providedIn: 'root' })
export class ListingReportsService {
  private readonly endpoint = '/listing-reports';

  constructor(private readonly api: BackendApiService) {}

  reasons(): Observable<ListingReportReasonDto[]> {
    return this.api.get<ListingReportReasonDto[]>(`${this.endpoint}/reasons`);
  }

  submit(payload: SubmitListingReportPayload): Observable<MyListingReportDto> {
    return this.api.post<MyListingReportDto>(this.endpoint, payload);
  }

  mine(page = 1, pageSize = 20): Observable<ReportPage<MyListingReportDto>> {
    return this.api.get<ReportPage<MyListingReportDto>>(`${this.endpoint}/me`, { page, pageSize });
  }

  openFor(propertyId: string): Observable<MyOpenReportStatusDto> {
    return this.api.get<MyOpenReportStatusDto>(`${this.endpoint}/me/open`, { propertyId });
  }

  get(id: string): Observable<MyListingReportDto> {
    return this.api.get<MyListingReportDto>(`${this.endpoint}/me/${id}`);
  }

  respond(id: string, message: string): Observable<MyListingReportDto> {
    return this.api.post<MyListingReportDto>(`${this.endpoint}/me/${id}/respond`, { message });
  }
}
