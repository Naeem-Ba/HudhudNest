// Display helpers shared by the payment pages. Display only: nothing here computes a price.

import { PaymentOrderStatus } from '../../core/models/payments.model';

/** Money in the reader's locale. Falls back to "12.50 USD" if the runtime does not know the currency. */
export function formatMoney(amount: number | null | undefined, currency: string | null | undefined, locale: string): string {
  const value = Number(amount ?? 0);
  const code = (currency ?? '').trim().toUpperCase();
  if (!code) return String(value);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${code}`;
  }
}

export function intlLocale(lang: string | undefined): string {
  switch (lang) {
    case 'de': return 'de-DE';
    case 'ar': return 'ar-SY-u-nu-latn';
    default: return 'en-US';
  }
}

export type StatusTone = 'ok' | 'bad' | 'warn' | 'info' | '';

export function orderTone(status: string): StatusTone {
  switch (status as PaymentOrderStatus) {
    case 'Succeeded': return 'ok';
    case 'Failed': case 'Disputed': return 'bad';
    case 'Cancelled': case 'Expired': return '';
    case 'Pending': case 'Processing': case 'Created': case 'RefundPending': return 'warn';
    case 'PartiallyRefunded': case 'Refunded': return 'info';
    default: return '';
  }
}

/** A fresh idempotency key: the same key is reused for retries of the SAME purchase attempt. */
export function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}
