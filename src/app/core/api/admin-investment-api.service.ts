// Admin Investment Portal (Phase 2) — wraps HudhudNestApi.Controllers.AdminInvestmentsController.
// Every endpoint here requires the Admin role on the server ([Authorize(Roles = "Admin")]); the
// AdminGuard on these routes is a UX convenience only — the backend remains the real boundary.
//
//   GET    /api/admin/investments/projects                                    ← list, filtered
//   GET    /api/admin/investments/projects/{id}                               ← full review
//   POST   /api/admin/investments/projects                                    ← create (Draft)
//   PUT    /api/admin/investments/projects/{id}                               ← edit content/params
//   POST   /api/admin/investments/projects/{id}/submit-review                 ← workflow
//   POST   /api/admin/investments/projects/{id}/approve                       ← workflow
//   POST   /api/admin/investments/projects/{id}/reject           { reason }   ← workflow
//   POST   /api/admin/investments/projects/{id}/schedule  { scheduledPublishAt } ← workflow
//   POST   /api/admin/investments/projects/{id}/publish                       ← workflow
//   POST   /api/admin/investments/projects/{id}/suspend                       ← workflow
//   POST   /api/admin/investments/projects/{id}/close                         ← workflow
//   PUT    /api/admin/investments/projects/{id}/financials                    ← financials
//   PUT    /api/admin/investments/projects/{id}/risk                          ← risk
//   GET    /api/admin/investments/projects/{id}/documents                     ← all docs (incl. private)
//   POST   /api/admin/investments/projects/{id}/documents         (multipart) ← upload
//   PUT    /api/admin/investments/projects/{id}/documents/{docId}/visibility  ← publish/unpublish
//   DELETE /api/admin/investments/projects/{id}/documents/{docId}             ← remove
//   POST   /api/admin/investments/projects/{id}/updates                      ← add update
//
// No "resume" action exists here: the backend's InvestmentProject state machine has no
// Suspended -> Published transition (only -> Closed). See docs/investment/PHASE-2-IMPLEMENTATION-REPORT.md.

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService, QueryValue } from './backend-api.service';
import { ApiPagedResult, normalizePagedResult, PagedResult } from '../models/api.model';
import {
  AddInvestmentUpdateRequest,
  AdminInvestmentDocument,
  AdminInvestmentProjectFilter,
  AdminInvestmentProjectListItem,
  CreateInvestmentProjectRequest,
  InvestmentDocumentType,
  InvestmentProjectReview,
  SetInvestmentFinancialsRequest,
  SetInvestmentRiskRequest,
  UpdateInvestmentProjectRequest
} from '../models/investment.model';

@Injectable({ providedIn: 'root' })
export class AdminInvestmentApiService {
  private readonly endpoint = '/admin/investments';

  constructor(private readonly api: BackendApiService) {}

  // ── Projects ──────────────────────────────────────────────────

  getProjects(filter: AdminInvestmentProjectFilter = {}): Observable<PagedResult<AdminInvestmentProjectListItem>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const query: Record<string, QueryValue> = {
      search: filter.search,
      status: filter.status,
      projectType: filter.projectType,
      page,
      pageSize
    };

    return this.api
      .get<AdminInvestmentProjectListItem[] | ApiPagedResult<AdminInvestmentProjectListItem>>(`${this.endpoint}/projects`, query)
      .pipe(map(response => normalizePagedResult(response, item => item, page, pageSize)));
  }

  getProjectReview(id: string): Observable<InvestmentProjectReview> {
    return this.api.get<InvestmentProjectReview>(`${this.endpoint}/projects/${id}`);
  }

  createProject(request: CreateInvestmentProjectRequest): Observable<{ id: string }> {
    return this.api.post<{ id: string }>(`${this.endpoint}/projects`, request);
  }

  updateProject(id: string, request: UpdateInvestmentProjectRequest): Observable<void> {
    return this.api.put<void>(`${this.endpoint}/projects/${id}`, request);
  }

  // ── Workflow — one explicit call per transition, never a status PUT ─

  submitForReview(id: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/projects/${id}/submit-review`);
  }

  approve(id: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/projects/${id}/approve`);
  }

  reject(id: string, reason: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/projects/${id}/reject`, { reason });
  }

  schedule(id: string, scheduledPublishAt: string | null): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/projects/${id}/schedule`, { scheduledPublishAt });
  }

  publish(id: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/projects/${id}/publish`);
  }

  suspend(id: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/projects/${id}/suspend`);
  }

  close(id: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/projects/${id}/close`);
  }

  // ── Financials / Risk ─────────────────────────────────────────

  setFinancials(id: string, request: SetInvestmentFinancialsRequest): Observable<void> {
    return this.api.put<void>(`${this.endpoint}/projects/${id}/financials`, request);
  }

  setRisk(id: string, request: SetInvestmentRiskRequest): Observable<void> {
    return this.api.put<void>(`${this.endpoint}/projects/${id}/risk`, request);
  }

  // ── Documents ─────────────────────────────────────────────────

  getAllDocuments(id: string): Observable<AdminInvestmentDocument[]> {
    return this.api.get<AdminInvestmentDocument[]>(`${this.endpoint}/projects/${id}/documents`);
  }

  uploadDocument(
    id: string,
    file: File,
    documentType: InvestmentDocumentType,
    isPublic: boolean
  ): Observable<{ id: string }> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('documentType', documentType);
    formData.append('isPublic', String(isPublic));

    return this.api.upload<{ id: string }>(`${this.endpoint}/projects/${id}/documents`, formData);
  }

  setDocumentVisibility(id: string, documentId: string, isPublic: boolean): Observable<void> {
    return this.api.put<void>(`${this.endpoint}/projects/${id}/documents/${documentId}/visibility`, { isPublic });
  }

  removeDocument(id: string, documentId: string): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/projects/${id}/documents/${documentId}`);
  }

  // ── Updates ───────────────────────────────────────────────────

  addUpdate(id: string, request: AddInvestmentUpdateRequest): Observable<{ id: string }> {
    return this.api.post<{ id: string }>(`${this.endpoint}/projects/${id}/updates`, request);
  }
}
