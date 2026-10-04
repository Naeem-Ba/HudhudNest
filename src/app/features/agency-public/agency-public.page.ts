// src/app/features/agency-public/agency-public.page.ts
//
// الصفحة العامة للمكتب العقاري بالرابط القصير /agencies/{slug} (/F-AGY-05/): الشعار،
// الوصف، بيانات التواصل، الفريق، وإعلانات المكتب المنشورة (GET /api/Properties?agencyId=…
// — فلتر عرض عام، PropertyFilterDto.AgencyId بالباك اند).
//
// رقم الترخيص لا يُعرض هنا عمدًا: AgencyDto.LicenseNumber يقول صراحةً إنه لم يُتحقق منه
// أبدًا، وعرضه على صفحة عامة يقرأه الزائر كاعتماد رسمي.
//
// نفس نمط الملف الواحد المستخدم في user-profile.page.ts.
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { catchError, of, switchMap, tap } from 'rxjs';

import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import { Agency } from '../../core/models/agency.model';
import { Property } from '../../core/models/property.model';
import { PageMetaService } from '../../core/services/page-meta.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';

const LISTINGS_PAGE_SIZE = 12;

@Component({
  selector: 'app-agency-public-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, TranslateModule, EmptyStateComponent, ImageFallbackDirective],
  template: `
    <section class="container agency-page" *ngIf="!loading(); else loadingTpl">
      <app-empty-state
        *ngIf="notFound()"
        icon="🏢"
        [title]="'AGENCY_PUBLIC.NOT_FOUND' | translate"
        [message]="'AGENCY_PUBLIC.NOT_FOUND_DESC' | translate"
      ></app-empty-state>

      <ng-container *ngIf="agency() as a">
        <header class="agency-header">
          <img *ngIf="a.logoUrl; else noLogo" class="agency-header__logo" [src]="a.logoUrl" [alt]="a.name" />
          <ng-template #noLogo><div class="agency-header__logo agency-header__logo--empty" aria-hidden="true">🏢</div></ng-template>
          <div class="agency-header__info">
            <h1>{{ a.name }}</h1>
            <p class="agency-header__meta" *ngIf="a.city">📍 {{ a.city }}</p>
            <p class="agency-header__meta">
              {{ 'AGENCY_PUBLIC.MEMBERS_COUNT' | translate: { count: a.memberCount } }}
            </p>
          </div>
        </header>

        <p class="agency-description" *ngIf="a.description">{{ a.description }}</p>

        <div class="agency-contact" *ngIf="a.contactPhone || a.contactEmail">
          <a *ngIf="a.contactPhone" class="btn btn--outline btn--sm" [href]="'tel:' + a.contactPhone" dir="ltr">📞 {{ a.contactPhone }}</a>
          <a *ngIf="a.contactEmail" class="btn btn--outline btn--sm" [href]="'mailto:' + a.contactEmail">✉️ {{ a.contactEmail }}</a>
        </div>

        <h2 class="section-title">{{ 'AGENCY_PUBLIC.TEAM' | translate }}</h2>
        <ul class="team">
          <li *ngFor="let m of a.members">
            <a class="team__member" [routerLink]="['/users', m.userId]">
              <img [src]="m.profileImageUrl || '/images/default-avatar.svg'" appImageFallback="/images/default-avatar.svg" alt="" />
              <span>{{ m.displayName }}</span>
            </a>
          </li>
        </ul>

        <h2 class="section-title">{{ 'AGENCY_PUBLIC.LISTINGS' | translate }}</h2>
        <p class="muted" *ngIf="listingsLoading()">{{ 'COMMON.LOADING' | translate }}</p>
        <p class="muted" *ngIf="!listingsLoading() && listings().length === 0">{{ 'AGENCY_PUBLIC.NO_LISTINGS' | translate }}</p>
        <div class="listing-grid" *ngIf="listings().length > 0">
          <a class="listing-card" *ngFor="let listing of listings()" [routerLink]="['/properties', listing.id]">
            <img
              class="listing-card__image"
              [src]="listing.mainImageUrl || listing.images?.[0]?.url || '/images/property-placeholder.svg'"
              appImageFallback="/images/property-placeholder.svg"
              alt=""
            />
            <div class="listing-card__body">
              <p class="listing-card__title">{{ listing.title }}</p>
              <p class="listing-card__city">{{ listing.city }}</p>
              <p class="listing-card__price">{{ listingPrice(listing) }}</p>
            </div>
          </a>
        </div>
        <button *ngIf="hasMore()" type="button" class="btn btn--outline btn--sm more-link"
          [disabled]="listingsLoading()" (click)="loadMore()">
          {{ 'AGENCY_PUBLIC.LOAD_MORE' | translate }}
        </button>
      </ng-container>
    </section>

    <ng-template #loadingTpl>
      <section class="container agency-page"><p class="muted">{{ 'COMMON.LOADING' | translate }}</p></section>
    </ng-template>
  `,
  styles: [`
    .agency-page { padding-block: 2rem; max-width: 960px; }
    .agency-header { display: flex; align-items: center; gap: 1.25rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
    .agency-header__logo { width: 96px; height: 96px; border-radius: var(--r-lg); border: 1px solid var(--border); object-fit: contain; background: var(--surface); }
    .agency-header__logo--empty { display: flex; align-items: center; justify-content: center; font-size: 2.5rem; }
    .agency-header__info { min-width: 0; }
    .agency-header h1 { margin: 0 0 .25rem; font-size: clamp(1.3rem, 2.5vw, 1.75rem); font-weight: 800; color: var(--gray-900); overflow-wrap: anywhere; }
    .agency-header__meta { margin: 0; font-size: .85rem; color: var(--gray-500); }
    .agency-description { white-space: pre-line; line-height: 1.8; color: var(--gray-700); margin: 0 0 1rem; }
    .agency-contact { display: flex; gap: .6rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
    .section-title { font-size: 1.05rem; font-weight: 700; color: var(--gray-900); margin: 1.5rem 0 .75rem; }
    .team { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: .75rem; }
    .team__member { display: flex; align-items: center; gap: .5rem; padding: .4rem .8rem .4rem .4rem; border: 1px solid var(--border); border-radius: 999px; text-decoration: none; color: var(--gray-800); background: var(--surface); }
    .team__member img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
    .muted { color: var(--gray-500); }
    .listing-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
    .listing-card { display: block; border-radius: 10px; overflow: hidden; box-shadow: var(--shadow-xs); border: 1px solid var(--border); text-decoration: none; color: inherit; background: var(--surface); }
    .listing-card__image { width: 100%; height: 120px; object-fit: cover; display: block; }
    .listing-card__body { padding: .6rem; }
    .listing-card__title { margin: 0; font-size: .9rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--gray-800); }
    .listing-card__city { margin: .15rem 0; font-size: .78rem; color: var(--gray-500); }
    .listing-card__price { margin: 0; font-size: .85rem; font-weight: 600; color: var(--primary); }
    .more-link { margin-top: 1rem; }
  `]
})
export class AgencyPublicPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly agenciesApi = inject(AgenciesApiService);
  private readonly propertyApi = inject(PropertyApiService);
  private readonly pageMeta = inject(PageMetaService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly agency = signal<Agency | null>(null);
  readonly listings = signal<Property[]>([]);
  readonly listingsLoading = signal(false);
  readonly hasMore = signal(false);
  private listingsPage = 1;

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.pageMeta.clear());

    this.route.paramMap
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.notFound.set(false);
          this.agency.set(null);
          this.listings.set([]);
          this.hasMore.set(false);
        }),
        // catchError داخل switchMap: 404 لمكتب لا يُنهي الاشتراك، فيعمل الانتقال
        // إلى slug آخر بعده.
        switchMap(params =>
          this.agenciesApi.getBySlug(params.get('slug') ?? '').pipe(catchError(() => of(null)))
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(agency => {
          if (!agency) {
            this.notFound.set(true);
            this.loading.set(false);
            this.pageMeta.markNotFound();
            return;
          }

          this.agency.set(agency);
          this.loading.set(false);
          this.pageMeta.applyDynamic({
            title: agency.name,
            description: agency.description,
            path: `/agencies/${agency.slug}`,
            image: agency.logoUrl
          });
          this.loadListings(agency.id, 1);
      });
  }

  loadMore(): void {
    const agency = this.agency();
    if (agency) this.loadListings(agency.id, this.listingsPage + 1);
  }

  private loadListings(agencyId: string, page: number): void {
    this.listingsLoading.set(true);
    this.propertyApi
      .getPropertiesPaged({ agencyId, page, pageSize: LISTINGS_PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.listingsPage = page;
          this.listings.update(current => (page === 1 ? result.items : [...current, ...result.items]));
          this.hasMore.set(result.hasNext);
          this.listingsLoading.set(false);
        },
        error: () => this.listingsLoading.set(false)
      });
  }

  listingPrice(listing: Property): string {
    const currency = listing.currencyCode ?? '';
    const price = listing.purchasePrice ?? listing.coldRent ?? listing.warmRent;
    return price ? `${price} ${currency}`.trim() : '';
  }
}
