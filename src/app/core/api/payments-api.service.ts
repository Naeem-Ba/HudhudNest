// Customer side of the payment system (/api/payments/*). Thin transport only: prices, taxes, totals and the final state of an
// order all come from the server. There is deliberately no method that "marks an order paid".

import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import {
  CreateOrderRequest, PagedResult, PaymentCatalog, PaymentInvoice, PaymentOrder, PaymentQuote, PaymentRefund,
  PaymentSubscription, QuoteRequest, SubscriptionChangeResult
} from '../models/payments.model';

@Injectable({ providedIn: 'root' })
export class PaymentsApiService {
  private readonly api = inject(BackendApiService);
  private readonly base = '/payments';

  catalog(currency?: string, country?: string): Observable<PaymentCatalog> {
    return this.api.get<PaymentCatalog>(`${this.base}/catalog`, { currency, country });
  }

  quote(request: QuoteRequest): Observable<PaymentQuote> {
    return this.api.post<PaymentQuote>(`${this.base}/quote`, request);
  }

  createOrder(request: CreateOrderRequest): Observable<PaymentOrder> {
    return this.api.post<PaymentOrder>(`${this.base}/orders`, request);
  }

  myOrders(page = 1, pageSize = 20): Observable<PagedResult<PaymentOrder>> {
    return this.api.get<PagedResult<PaymentOrder>>(`${this.base}/orders`, { page, pageSize });
  }

  order(id: string): Observable<PaymentOrder> {
    return this.api.get<PaymentOrder>(`${this.base}/orders/${id}`);
  }

  cancelOrder(id: string): Observable<PaymentOrder> {
    return this.api.post<PaymentOrder>(`${this.base}/orders/${id}/cancel`);
  }

  requestRefund(id: string, reason: string): Observable<PaymentRefund> {
    return this.api.post<PaymentRefund>(`${this.base}/orders/${id}/refund-request`, { reason });
  }

  myRefunds(): Observable<PaymentRefund[]> {
    return this.api.get<PaymentRefund[]>(`${this.base}/refunds`);
  }

  myInvoices(): Observable<PaymentInvoice[]> {
    return this.api.get<PaymentInvoice[]>(`${this.base}/invoices`);
  }

  invoice(id: string): Observable<PaymentInvoice> {
    return this.api.get<PaymentInvoice>(`${this.base}/invoices/${id}`);
  }

  /** 204 (no subscription) arrives as null. */
  mySubscription(): Observable<PaymentSubscription | null> {
    return this.api.get<PaymentSubscription | null>(`${this.base}/subscription`);
  }

  cancelSubscription(): Observable<PaymentSubscription> {
    return this.api.post<PaymentSubscription>(`${this.base}/subscription/cancel`);
  }

  resumeSubscription(): Observable<PaymentSubscription> {
    return this.api.post<PaymentSubscription>(`${this.base}/subscription/resume`);
  }

  changeSubscription(planTier: string): Observable<SubscriptionChangeResult> {
    return this.api.post<SubscriptionChangeResult>(`${this.base}/subscription/change`, { planTier });
  }

  /** Development / staging only. The server answers 404 in Production. */
  sandboxSimulate(orderId: string, outcome: 'succeeded' | 'failed' | 'cancelled'): Observable<unknown> {
    return this.api.post<unknown>(`${this.base}/sandbox/orders/${orderId}/simulate`, { outcome });
  }
}
