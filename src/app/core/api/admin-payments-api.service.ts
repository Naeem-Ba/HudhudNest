// Back office of the payment system (/api/admin/payments/*). No method exists to mark an order paid: the only way an order
// becomes paid is a provider-verified webhook or a provider status query.

import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import {
  AdminOrderDetail, AdminOrderFilter, AdminOrderRow, AdminProvider, AdminRefundRow, AdminSubscriptionRow, AdminWebhookRow,
  PagedResult, PaymentDashboard, PaymentRefund, PaymentReport, ReconciliationResult, UpdateProviderRequest
} from '../models/payments.model';

@Injectable({ providedIn: 'root' })
export class AdminPaymentsApiService {
  private readonly api = inject(BackendApiService);
  private readonly base = '/admin/payments';

  dashboard(from?: string, to?: string): Observable<PaymentDashboard> {
    return this.api.get<PaymentDashboard>(`${this.base}/dashboard`, { from, to });
  }

  orders(filter: AdminOrderFilter): Observable<PagedResult<AdminOrderRow>> {
    return this.api.get<PagedResult<AdminOrderRow>>(`${this.base}/orders`, { ...filter });
  }

  order(id: string): Observable<AdminOrderDetail> {
    return this.api.get<AdminOrderDetail>(`${this.base}/orders/${id}`);
  }

  subscriptions(status?: string, page = 1): Observable<PagedResult<AdminSubscriptionRow>> {
    return this.api.get<PagedResult<AdminSubscriptionRow>>(`${this.base}/subscriptions`, { status, page });
  }

  refunds(status?: string, page = 1): Observable<PagedResult<AdminRefundRow>> {
    return this.api.get<PagedResult<AdminRefundRow>>(`${this.base}/refunds`, { status, page });
  }

  webhooks(status?: string, page = 1): Observable<PagedResult<AdminWebhookRow>> {
    return this.api.get<PagedResult<AdminWebhookRow>>(`${this.base}/webhooks`, { status, page });
  }

  report(groupBy: string, from?: string, to?: string): Observable<PaymentReport> {
    return this.api.get<PaymentReport>(`${this.base}/reports`, { groupBy, from, to });
  }

  providers(): Observable<AdminProvider[]> {
    return this.api.get<AdminProvider[]>(`${this.base}/providers`);
  }

  updateProvider(code: string, request: UpdateProviderRequest): Observable<AdminProvider> {
    return this.api.put<AdminProvider>(`${this.base}/providers/${encodeURIComponent(code)}`, request);
  }

  addNote(orderId: string, note: string): Observable<unknown> {
    return this.api.post<unknown>(`${this.base}/orders/${orderId}/notes`, { note });
  }

  resync(orderId: string): Observable<unknown> {
    return this.api.post<unknown>(`${this.base}/orders/${orderId}/resync`);
  }

  reconcile(): Observable<ReconciliationResult> {
    return this.api.post<ReconciliationResult>(`${this.base}/reconcile`);
  }

  reprocessWebhook(eventId: string): Observable<unknown> {
    return this.api.post<unknown>(`${this.base}/webhooks/${eventId}/reprocess`);
  }

  createRefund(orderId: string, amount: number | null, reason: string): Observable<PaymentRefund> {
    return this.api.post<PaymentRefund>(`${this.base}/orders/${orderId}/refunds`, { amount, reason });
  }

  approveRefund(refundId: string, note: string | null): Observable<PaymentRefund> {
    return this.api.post<PaymentRefund>(`${this.base}/refunds/${refundId}/approve`, { note });
  }

  rejectRefund(refundId: string, note: string | null): Observable<PaymentRefund> {
    return this.api.post<PaymentRefund>(`${this.base}/refunds/${refundId}/reject`, { note });
  }

  retryRefund(refundId: string): Observable<PaymentRefund> {
    return this.api.post<PaymentRefund>(`${this.base}/refunds/${refundId}/retry`);
  }
}
