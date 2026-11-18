// src/app/features/valuation-office/valuation-office-inbox.page.ts
//
// An agency's valuation inbox: requests from customers near the office, waiting for its price opinion within 24h
// (GET /api/ValuationOfficeInvitations/mine). Any member of the office may answer, once, with one price in one market
// currency and an optional note (POST .../respond). The customer's contact details appear only after the customer
// chose to share them with this office.
//
// The office is asked because it knows the area, not because it has listings there: matching never looks at how many
// listings an office has (see OfficeMatchingService on the API).

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ValuationApiService } from '../../core/api/valuation-api.service';
import { ValuationOfficeInvitation } from '../../core/models/valuation.model';
import {
  LookupsApiService,
  PropertyTypeLookup,
  StructuredLocationLookup,
  pickLocalizedName
} from '../../core/api/lookups-api.service';
import { LanguageService } from '../../core/services/language.service';
import { PreferencesService } from '../../core/services/preferences.service';
import { MARKET_CURRENCY_CODES, isMarketCurrency } from '../../core/pricing/market-currencies';
import { ToastService } from '../../shared/services/toast.service';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { LocalizedNumberPipe } from '../../shared/pipes/localized-number.pipe';
import { formatListingPrice } from '../../shared/utils/listing-price';
import { PageMetaService } from '../../core/services/page-meta.service';

/** What the office is typing for one request. */
interface Draft {
  price: number | null;
  currency: string;
  notes: string;
}

@Component({
  selector: 'app-valuation-office-inbox-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule, LocalizedDatePipe, LocalizedNumberPipe],
  templateUrl: './valuation-office-inbox.page.html',
  styleUrls: ['../valuation-request/valuation-request.page.scss', './valuation-office-inbox.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ValuationOfficeInboxPage implements OnInit {
  private readonly valuationApi = inject(ValuationApiService);
  private readonly lookups = inject(LookupsApiService);
  private readonly language = inject(LanguageService);
  private readonly preferences = inject(PreferencesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pageMeta = inject(PageMetaService);

  /** Above this the number is a typo, not a price (the API refuses it too). */
  static readonly MAX_PRICE = 1_000_000_000_000;

  readonly currencies = MARKET_CURRENCY_CODES;
  readonly loading = signal(true);
  readonly error = signal<'no-agency' | 'failed' | null>(null);
  readonly invitations = signal<ValuationOfficeInvitation[]>([]);
  readonly submitting = signal<string | null>(null);

  private readonly governorates = signal<Map<number, StructuredLocationLookup>>(new Map());
  private readonly districts = signal<Map<number, StructuredLocationLookup>>(new Map());
  private readonly neighborhoods = signal<Map<number, StructuredLocationLookup>>(new Map());
  private readonly propertyTypes = signal<Map<number, PropertyTypeLookup>>(new Map());

  readonly drafts = new Map<string, Draft>();

  ngOnInit(): void {
    // A private screen: never indexed.
    this.pageMeta.noindex(this.destroyRef);
    this.lookups.getGovernorates().pipe(catchError(() => of([] as StructuredLocationLookup[])), takeUntilDestroyed(this.destroyRef))
      .subscribe((items: StructuredLocationLookup[]) => this.governorates.set(new Map(items.map(i => [i.id, i] as const))));
    this.lookups.getPropertyTypeCatalog().pipe(catchError(() => of([] as PropertyTypeLookup[])), takeUntilDestroyed(this.destroyRef))
      .subscribe((items: PropertyTypeLookup[]) => this.propertyTypes.set(new Map(items.map(i => [i.id, i] as const))));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.valuationApi.getMyOfficeInvitations().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: items => {
        this.invitations.set(items);
        this.loading.set(false);
        this.loadPlaceNames(items);
      },
      error: (err: { status?: number }) => {
        this.loading.set(false);
        this.error.set(err?.status === 404 ? 'no-agency' : 'failed');
      }
    });
  }

  draft(item: ValuationOfficeInvitation): Draft {
    let d = this.drafts.get(item.invitationId);
    if (!d) {
      const preferred = this.preferences.currency;
      d = { price: null, currency: preferred && isMarketCurrency(preferred) ? preferred : 'USD', notes: '' };
      this.drafts.set(item.invitationId, d);
    }
    return d;
  }

  canSubmit(item: ValuationOfficeInvitation): boolean {
    const d = this.draft(item);
    return d.price != null && d.price > 0 && d.price <= ValuationOfficeInboxPage.MAX_PRICE
      && isMarketCurrency(d.currency) && d.notes.length <= 2000 && this.submitting() === null;
  }

  submit(item: ValuationOfficeInvitation): void {
    if (!this.canSubmit(item)) return;
    const d = this.draft(item);

    this.submitting.set(item.invitationId);
    this.valuationApi.respond(item.invitationId, { estimatedPrice: d.price!, currencyCode: d.currency, notes: d.notes })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(null);
          this.drafts.delete(item.invitationId);
          this.toast.show(this.translate.instant('VALUATION.OFFICE_INBOX.SENT'), 'success');
          this.load();
        },
        error: (err: { status?: number }) => {
          this.submitting.set(null);
          // 409: already answered, or the 24h window closed while the form was open.
          const key = err?.status === 409 ? 'VALUATION.OFFICE_INBOX.CLOSED' : 'VALUATION.OFFICE_INBOX.SEND_ERROR';
          this.toast.show(this.translate.instant(key), 'error');
          if (err?.status === 409) this.load();
        }
      });
  }

  place(item: ValuationOfficeInvitation): string {
    const lang = this.language.getCurrent();
    return [
      this.neighborhoods().get(item.neighborhoodId ?? -1),
      this.districts().get(item.districtId ?? -1),
      this.governorates().get(item.governorateId)
    ].filter((p): p is StructuredLocationLookup => !!p).map(p => pickLocalizedName(p, lang)).join(lang === 'ar' ? '، ' : ', ');
  }

  propertyType(item: ValuationOfficeInvitation): string {
    const type = this.propertyTypes().get(item.propertyTypeId ?? -1);
    return type ? pickLocalizedName(type, this.language.getCurrent()) : '';
  }

  money(value: number | null, currency: string | null): string {
    if (value == null) return '';
    return currency ? formatListingPrice(value, currency) : value.toLocaleString();
  }

  trackById(_: number, item: ValuationOfficeInvitation): string {
    return item.invitationId;
  }

  /** District and neighborhood names are only fetched for the areas that actually appear in the inbox. */
  private loadPlaceNames(items: ValuationOfficeInvitation[]): void {
    const governorateIds = [...new Set(items.filter(i => i.districtId).map(i => i.governorateId))];
    const districtIds = [...new Set(items.filter(i => i.neighborhoodId && i.districtId).map(i => i.districtId!))];

    if (governorateIds.length) {
      forkJoin(governorateIds.map(id => this.lookups.getDistricts(id).pipe(catchError(() => of([] as StructuredLocationLookup[])))))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(lists => this.districts.set(new Map(lists.flat().map(d => [d.id, d] as const))));
    }
    if (districtIds.length) {
      forkJoin(districtIds.map(id => this.lookups.getNeighborhoods(id).pipe(catchError(() => of([] as StructuredLocationLookup[])))))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(lists => this.neighborhoods.set(new Map(lists.flat().map(n => [n.id, n] as const))));
    }
  }
}
