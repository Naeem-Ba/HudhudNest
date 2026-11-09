import { PageMetaService } from '../../core/services/page-meta.service';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { AreaPriceRow, PriceEstimate, PriceEstimateApiService, PriceKind } from '../../core/api/price-estimate-api.service';
import { LookupsApiService, PropertyTypeLookup, StructuredLocationLookup, pickLocalizedName } from '../../core/api/lookups-api.service';
import { currentUiLanguage } from '../../core/i18n/ui-language';
import { formatListingPrice } from '../../shared/utils/listing-price';

/**
 * Public "what do similar listings ask?" page (growth engine P6). Shows a range from live asking prices with
 * the number of listings, the level it came from and a confidence label, or says plainly that there is not
 * enough data. It never shows a single "value" and never claims to be a valuation.
 */
@Component({
  selector: 'app-price-estimate',
  standalone: true,
  imports: [FormsModule, RouterModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="pe-page">
      <header class="pe-page__header">
        <h1>{{ 'PRICE_ESTIMATE.TITLE' | translate }}</h1>
        <p class="pe-page__lead">{{ 'PRICE_ESTIMATE.LEAD' | translate }}</p>
      </header>

      <form class="pe-form card" (ngSubmit)="submit()" novalidate data-testid="pe-form">
        <fieldset class="pe-form__row">
          <legend>{{ 'PRICE_ESTIMATE.KIND' | translate }}</legend>
          <label><input type="radio" name="kind" value="Sale" [(ngModel)]="kind"> {{ 'PRICE_ESTIMATE.KIND_SALE' | translate }}</label>
          <label><input type="radio" name="kind" value="Rent" [(ngModel)]="kind"> {{ 'PRICE_ESTIMATE.KIND_RENT' | translate }}</label>
        </fieldset>
        <div class="pe-form__grid">
          <label>{{ 'PRICE_ESTIMATE.GOVERNORATE' | translate }} *
            <select name="governorateId" [(ngModel)]="governorateId" (ngModelChange)="onGovernorate($event)" required>
              <option [ngValue]="0" disabled>—</option>
              @for (g of governorates(); track g.id) { <option [ngValue]="g.id">{{ name(g) }}</option> }
            </select>
          </label>
          <label>{{ 'PRICE_ESTIMATE.DISTRICT' | translate }}
            <select name="districtId" [(ngModel)]="districtId" [disabled]="!districts().length">
              <option [ngValue]="null">{{ 'PRICE_ESTIMATE.ANY' | translate }}</option>
              @for (d of districts(); track d.id) { <option [ngValue]="d.id">{{ name(d) }}</option> }
            </select>
          </label>
          <label>{{ 'PRICE_ESTIMATE.PROPERTY_TYPE' | translate }}
            <select name="propertyTypeId" [(ngModel)]="propertyTypeId">
              <option [ngValue]="null">{{ 'PRICE_ESTIMATE.ANY' | translate }}</option>
              @for (t of propertyTypes(); track t.id) { <option [ngValue]="t.id">{{ name(t) }}</option> }
            </select>
          </label>
          <label>{{ 'PRICE_ESTIMATE.AREA' | translate }} *
            <input type="number" inputmode="decimal" min="1" name="area" [(ngModel)]="area" required>
          </label>
          <label>{{ 'PRICE_ESTIMATE.CURRENCY' | translate }}
            <select name="currency" [(ngModel)]="currency">
              <option value="USD">USD</option><option value="EUR">EUR</option><option value="SYP">SYP</option>
            </select>
          </label>
        </div>
        <div>
          <button type="submit" class="btn btn-primary" [disabled]="loading() || !governorateId || !(area > 0)" data-testid="pe-submit">
            {{ 'PRICE_ESTIMATE.SUBMIT' | translate }}
          </button>
        </div>
      </form>

      @if (failed()) {
        <p class="pe-error" role="alert">{{ 'PRICE_ESTIMATE.ERROR' | translate }}</p>
      }

      @if (result(); as r) {
        <section class="pe-result card" aria-live="polite" data-testid="pe-result">
          @if (r.available) {
            <h2>{{ (r.kind === 'Rent' ? 'PRICE_ESTIMATE.RESULT_RENT' : 'PRICE_ESTIMATE.RESULT_SALE') | translate }}</h2>
            <p class="pe-range" dir="ltr" data-testid="pe-range">{{ money(r.low, r.currencyCode) }} – {{ money(r.high, r.currencyCode) }}</p>
            <p>{{ 'PRICE_ESTIMATE.MIDDLE' | translate: { value: money(r.mid, r.currencyCode) } }}</p>
            <p class="pe-persqm" dir="ltr">{{ money(r.lowPerSqm, r.currencyCode) }} – {{ money(r.highPerSqm, r.currencyCode) }} / m²</p>
            <ul class="pe-facts">
              <li data-testid="pe-sample">{{ 'PRICE_ESTIMATE.SAMPLE' | translate: { count: r.sampleCount } }}</li>
              <li>{{ ('PRICE_ESTIMATE.BASIS.' + r.basis) | translate }}</li>
              <li>
                <span class="pe-confidence pe-confidence--{{ (r.confidence || 'Low').toLowerCase() }}">{{ ('PRICE_ESTIMATE.CONFIDENCE.' + r.confidence) | translate }}</span>
              </li>
              <li>{{ 'PRICE_ESTIMATE.DATES' | translate: { from: date(r.oldestListingAt), to: date(r.newestListingAt), at: date(r.dataComputedAt) } }}</li>
            </ul>
          } @else {
            <h2>{{ 'PRICE_ESTIMATE.NO_RESULT' | translate }}</h2>
            <p data-testid="pe-reason">{{ ('PRICE_ESTIMATE.REASON.' + r.reason) | translate }}</p>
          }
          <p class="pe-disclaimer">{{ 'PRICE_ESTIMATE.DISCLAIMER' | translate }}</p>
          <a [routerLink]="['/valuation']" class="btn btn-link">{{ 'PRICE_ESTIMATE.VALUATION_LINK' | translate }}</a>
        </section>
      }

      @if (areaRows().length) {
        <section class="pe-areas card" data-testid="pe-areas">
          <h2>{{ 'PRICE_ESTIMATE.AREAS_TITLE' | translate }}</h2>
          <div class="pe-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{{ 'PRICE_ESTIMATE.AREA_NAME' | translate }}</th>
                  <th scope="col">{{ 'PRICE_ESTIMATE.MEDIAN_SQM' | translate }}</th>
                  <th scope="col">{{ 'PRICE_ESTIMATE.MIDDLE_HALF' | translate }}</th>
                  <th scope="col">{{ 'PRICE_ESTIMATE.LISTINGS' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                @for (row of areaRows(); track $index) {
                  <tr>
                    <td>{{ rowName(row) }}</td>
                    <td dir="ltr">{{ money(row.medianPerSqm, row.currencyCode) }}</td>
                    <td dir="ltr">{{ money(row.p25PerSqm, row.currencyCode) }} – {{ money(row.p75PerSqm, row.currencyCode) }}</td>
                    <td>{{ row.sampleCount }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <p class="pe-method">{{ 'PRICE_ESTIMATE.METHOD' | translate }}</p>
    </main>
  `,
  styleUrls: ['./price-estimate.page.scss']
})
export class PriceEstimatePage implements OnInit {
  private readonly api = inject(PriceEstimateApiService);
  private readonly lookups = inject(LookupsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pageMeta = inject(PageMetaService);

  readonly governorates = signal<StructuredLocationLookup[]>([]);
  readonly districts = signal<StructuredLocationLookup[]>([]);
  readonly propertyTypes = signal<PropertyTypeLookup[]>([]);
  readonly result = signal<PriceEstimate | null>(null);
  readonly areaRows = signal<AreaPriceRow[]>([]);
  readonly loading = signal(false);
  readonly failed = signal(false);

  kind: PriceKind = 'Sale';
  governorateId = 0;
  districtId: number | null = null;
  propertyTypeId: number | null = null;
  area = 0;
  currency = 'USD';

  ngOnInit(): void {
    this.pageMeta.applyTranslated('SEO.PRICE_ESTIMATE', '/price-estimate', this.destroyRef);
    this.lookups.getGovernorates().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: g => this.governorates.set(g ?? []), error: () => undefined });
    this.lookups.getPropertyTypeCatalog().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: t => this.propertyTypes.set(t ?? []), error: () => undefined });
  }

  name(item: { nameAr: string; nameEn: string }): string {
    return pickLocalizedName(item, currentUiLanguage() ?? 'ar');
  }

  onGovernorate(id: number): void {
    this.districtId = null;
    this.districts.set([]);
    if (!id) return;
    this.lookups.getDistricts(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: d => this.districts.set(d ?? []), error: () => undefined });
  }

  submit(): void {
    if (!this.governorateId || !(this.area > 0)) return;
    this.loading.set(true);
    this.failed.set(false);
    this.api.estimate({
      kind: this.kind, governorateId: this.governorateId, districtId: this.districtId,
      propertyTypeId: this.propertyTypeId, area: this.area, currency: this.currency
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => { this.result.set(r); this.loading.set(false); },
      error: () => { this.result.set(null); this.failed.set(true); this.loading.set(false); }
    });
    this.api.areas(this.governorateId, this.kind, this.currency).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: rows => this.areaRows.set((rows ?? []).filter(r => r.propertyTypeId === null)),
      error: () => this.areaRows.set([])
    });
  }

  rowName(row: AreaPriceRow): string {
    if (row.districtId === null) {
      const g = this.governorates().find(x => x.id === row.governorateId);
      return g ? this.name(g) : '';
    }
    const d = this.districts().find(x => x.id === row.districtId);
    return d ? this.name(d) : `#${row.districtId}`;
  }

  money(value: number | null, currency: string): string {
    return formatListingPrice(value, currency);
  }

  date(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
}
