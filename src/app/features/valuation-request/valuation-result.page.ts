// src/app/features/valuation-request/valuation-result.page.ts
//
// The customer's own valuation request, opened from "follow the answers" or from a notification: which offices were
// asked, the price opinion of each office that answered (public office name, one price in one currency, its note),
// and why the request closed. Manual refresh, like the app's other async-status views; no polling.
//
// Signed-in only: offices are asked only for an account, and the API refuses another account's request.

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';

import { ValuationApiService } from '../../core/api/valuation-api.service';
import { ValuationInquiryStatusDto } from '../../core/models/valuation.model';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { formatListingPrice } from '../../shared/utils/listing-price';
import { PageMetaService } from '../../core/services/page-meta.service';

@Component({
  selector: 'app-valuation-result-page',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, LocalizedDatePipe],
  templateUrl: './valuation-result.page.html',
  styleUrls: ['./valuation-request.page.scss', './valuation-result.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ValuationResultPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly valuationApi = inject(ValuationApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pageMeta = inject(PageMetaService);

  readonly loading = signal(true);
  readonly error = signal<'not-found' | 'failed' | null>(null);
  readonly status = signal<ValuationInquiryStatusDto | null>(null);

  private inquiryId = '';

  ngOnInit(): void {
    // A private screen: never indexed.
    this.pageMeta.noindex(this.destroyRef);
    this.inquiryId = this.route.snapshot.paramMap.get('id') ?? '';
    this.load();
  }

  load(): void {
    if (!this.inquiryId) {
      this.loading.set(false);
      this.error.set('not-found');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.valuationApi.getStatus(this.inquiryId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: status => {
        this.status.set(status);
        this.loading.set(false);
      },
      error: (err: { status?: number }) => {
        this.loading.set(false);
        this.error.set(err?.status === 404 || err?.status === 403 ? 'not-found' : 'failed');
      }
    });
  }

  /** An answer recorded before offices were asked for a currency shows the bare number, never a guessed currency. */
  price(value: number, currency: string | null): string {
    return currency ? formatListingPrice(value, currency) : value.toLocaleString();
  }

  isOpen(status: ValuationInquiryStatusDto): boolean {
    return status.status === 'AwaitingOfficeResponses' || status.status === 'Pending' || status.status === 'MatchedFromListings';
  }
}
