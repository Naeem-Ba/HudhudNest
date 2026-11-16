// src/app/features/offices-directory/offices-directory.page.ts
//
// دليل المكاتب العقارية العام (/offices): بحث بالاسم، فلاتر المكان (محافظة ← منطقة ← حي، بلا مدينة كما في
// بحث الإعلانات منذ 2026-11-13)، نوع العقار، نوع الصفقة، الموثّقة فقط، التقييم الأدنى، والترتيب. حالة الفلاتر
// في الرابط (قابلة للمشاركة والرجوع). الأماكن المعروضة هي التي فيها مكاتب مدرجة فعلًا (GET
// /api/agencies/directory/facets)، والأسماء من نفس قوائم المواقع المستعملة في بحث الإعلانات.
//
// الخادم يقرر من يُدرج (مكتب فعّال وخطة مالكه سارية أو ضمن المهلة)؛ هذه الصفحة لا تفلتر شيئًا بنفسها.
//
// «القريبة مني» (P2): موقع الزائر يُطلب بضغطة زر، يُقرَّب إلى 3 منازل (نحو 100 م) ويبقى في الذاكرة فقط، فلا يدخل
// الرابط ولا السجلات. الخادم يحسب المسافة إلى أقرب فرع له إحداثيات؛ مكتب بلا فرع على الخريطة لا يظهر فيها.
// عرض الخريطة (?view=map) يجلب فروع المكاتب داخل حدود الخريطة، ويطبّق فلتر «الموثّقة فقط» وحده.
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';

import { AgenciesApiService } from '../../core/api/agencies-api.service';
import {
  LookupsApiService,
  PropertyTypeLookup,
  StructuredLocationLookup,
  pickLocalizedName
} from '../../core/api/lookups-api.service';
import {
  AgencyDirectoryDeal,
  AgencyDirectoryFacets,
  AgencyDirectoryFilter,
  AgencyDirectoryItem,
  AgencyDirectorySort,
  AgencyMapResult
} from '../../core/models/agency.model';
import { LanguageService } from '../../core/services/language.service';
import { PageMetaService } from '../../core/services/page-meta.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { SkeletonCardGridComponent } from '../../shared/ui/skeleton-card-grid.component';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { OfficeMapBounds, OfficeMapPoint, OfficesMapComponent } from '../../shared/ui/offices-map.component';

export const OFFICES_PAGE_SIZE = 12;

const DEALS: readonly AgencyDirectoryDeal[] = ['Sale', 'Rent', 'ShortStay', 'Investment'];
const SORTS: readonly AgencyDirectorySort[] = ['MostListings', 'TopRated', 'Newest'];
const RATINGS: readonly number[] = [4, 3];
export const NEAR_RADII_KM: readonly number[] = [5, 10, 25, 50];
const DEFAULT_RADIUS_KM = 10;
/** يطابق حد الخادم لعرض صندوق الخريطة (GetAgencyMapQueryValidator). */
const MAP_MAX_SPAN_DEGREES = 12;

export type OfficesView = 'list' | 'map';

/** ثلاثة منازل عشرية (نحو 100 م): يكفي لترتيب المكاتب ولا يحمل موقع الزائر الدقيق. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** صندوق الخريطة مقصوصًا حول مركزه إلى ما يقبله الخادم؛ عند التصغير الشديد تُعرض المنطقة الوسطى فقط. */
export function clampMapBounds(b: OfficeMapBounds): OfficeMapBounds {
  const clampSpan = (min: number, max: number, lo: number, hi: number): [number, number] => {
    if (max - min <= MAP_MAX_SPAN_DEGREES) return [min, max];
    const mid = (min + max) / 2;
    return [Math.max(lo, mid - MAP_MAX_SPAN_DEGREES / 2), Math.min(hi, mid + MAP_MAX_SPAN_DEGREES / 2)];
  };
  const [minLat, maxLat] = clampSpan(b.minLat, b.maxLat, -90, 90);
  const [minLng, maxLng] = clampSpan(b.minLng, b.maxLng, -180, 180);
  return { minLat, minLng, maxLat, maxLng };
}

interface PlaceOption {
  id: number;
  name: string;
  count: number;
}

function positiveInt(value: string | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Reads the directory filter from the URL. The URL is user-editable, so anything out of range is dropped. */
export function filterFromParams(params: ParamMap): AgencyDirectoryFilter {
  const deal = params.get('deal') as AgencyDirectoryDeal | null;
  const sort = params.get('sort') as AgencyDirectorySort | null;
  const rating = Number(params.get('minRating'));
  return {
    search: (params.get('q') ?? '').trim().slice(0, 100) || null,
    governorateId: positiveInt(params.get('governorateId')),
    districtId: positiveInt(params.get('districtId')),
    neighborhoodId: positiveInt(params.get('neighborhoodId')),
    propertyTypeId: positiveInt(params.get('propertyTypeId')),
    deal: deal && DEALS.includes(deal) ? deal : null,
    verifiedOnly: params.get('verified') === '1',
    minRating: RATINGS.includes(rating) ? rating : null,
    sort: sort && SORTS.includes(sort) ? sort : 'MostListings',
    page: Math.min(1000, positiveInt(params.get('page')) ?? 1),
    pageSize: OFFICES_PAGE_SIZE
  };
}

@Component({
  selector: 'app-offices-directory-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule, RouterLink, TranslateModule, EmptyStateComponent, SkeletonCardGridComponent,
    ImageFallbackDirective, OfficesMapComponent
  ],
  templateUrl: './offices-directory.page.html',
  styleUrls: ['./offices-directory.page.scss']
})
export class OfficesDirectoryPage implements OnInit {
  private readonly api = inject(AgenciesApiService);
  private readonly lookups = inject(LookupsApiService);
  private readonly lang = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly pageMeta = inject(PageMetaService);
  private readonly destroyRef = inject(DestroyRef);

  readonly deals = DEALS;
  readonly sorts = SORTS;
  readonly ratings = RATINGS;
  readonly radii = NEAR_RADII_KM;

  @ViewChild(OfficesMapComponent) private officesMap?: OfficesMapComponent;

  readonly filter = signal<AgencyDirectoryFilter>({ sort: 'MostListings', page: 1, pageSize: OFFICES_PAGE_SIZE });
  readonly items = signal<AgencyDirectoryItem[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly filtersOpen = signal(false);

  /** موقع الزائر مقرّبًا — في الذاكرة فقط. */
  readonly near = signal<{ latitude: number; longitude: number } | null>(null);
  readonly radiusKm = signal(DEFAULT_RADIUS_KM);
  readonly geoLoading = signal(false);
  /** مفتاح ترجمة لخطأ تحديد الموقع، أو null. */
  readonly geoError = signal<string | null>(null);

  readonly view = signal<OfficesView>('list');
  readonly mapResult = signal<AgencyMapResult | null>(null);
  readonly mapFailed = signal(false);
  private readonly mapBounds$ = new Subject<OfficeMapBounds>();
  private readonly reload$ = new Subject<void>();

  readonly facets = signal<AgencyDirectoryFacets | null>(null);
  private readonly governorateNames = signal<StructuredLocationLookup[]>([]);
  private readonly districtNames = signal<StructuredLocationLookup[]>([]);
  private readonly neighborhoodNames = signal<StructuredLocationLookup[]>([]);
  readonly propertyTypes = signal<PropertyTypeLookup[]>([]);
  private readonly currentLang = signal(this.lang.getCurrent());

  /** «الأقرب» يظهر في قائمة الترتيب فقط حين يُعرف موقع الزائر. */
  readonly sortOptions = computed<readonly AgencyDirectorySort[]>(() => this.near() ? ['Nearest', ...SORTS] : SORTS);
  readonly currentSort = computed<AgencyDirectorySort>(() => this.near() ? 'Nearest' : (this.filter().sort ?? 'MostListings'));

  readonly mapPoints = computed<OfficeMapPoint[]>(() => (this.mapResult()?.markers ?? []).map(m => ({
    id: m.branchId,
    latitude: m.latitude,
    longitude: m.longitude,
    label: m.name,
    detail: m.branchName,
    verified: m.isVerified,
    link: ['/offices', m.slug]
  })));

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / OFFICES_PAGE_SIZE)));
  readonly activeFilterCount = computed(() => {
    const f = this.filter();
    return [f.governorateId, f.propertyTypeId, f.deal, f.verifiedOnly || null, f.minRating].filter(v => v).length;
  });

  /** Only places that hold listed offices, named in the visitor's language, busiest first. */
  readonly governorateOptions = computed(() => this.toOptions(this.facets()?.governorates, this.governorateNames()));
  readonly districtOptions = computed(() => this.toOptions(this.facets()?.districts, this.districtNames()));
  readonly neighborhoodOptions = computed(() => this.toOptions(this.facets()?.neighborhoods, this.neighborhoodNames()));

  searchText = '';
  private readonly search$ = new Subject<string>();

  ngOnInit(): void {
    this.pageMeta.applyTranslated('SEO.OFFICES', '/offices', this.destroyRef);

    this.lang.currentLang$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(l => this.currentLang.set(l));
    this.lookups.getGovernorates().pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
      .subscribe(list => this.governorateNames.set(list));
    this.lookups.getPropertyTypeCatalog().pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
      .subscribe(list => this.propertyTypes.set(list));

    this.search$.pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(q => this.navigate({ search: q || null, page: 1 }));

    this.reload$
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap(() => this.api.searchDirectory(this.requestFilter()).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(page => {
        this.loading.set(false);
        if (!page) {
          this.failed.set(true);
          this.items.set([]);
          this.total.set(0);
          return;
        }
        this.items.set(page.items ?? []);
        this.total.set(page.totalCount ?? 0);
      });

    this.mapBounds$
      .pipe(
        debounceTime(300),
        switchMap(b => this.api.getDirectoryMap(clampMapBounds(b), !!this.filter().verifiedOnly).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(result => {
        this.mapFailed.set(!result);
        if (result) this.mapResult.set(result);
      });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const next = filterFromParams(params);
      const previous = this.filter();
      this.filter.set(next);
      this.searchText = next.search ?? '';
      const view: OfficesView = params.get('view') === 'map' ? 'map' : 'list';
      const verifiedChanged = previous.verifiedOnly !== next.verifiedOnly;
      this.view.set(view);
      this.loadPlaces(previous, next);
      if (view === 'list') this.reload$.next();
      else if (verifiedChanged && this.lastBounds) this.mapBounds$.next(this.lastBounds);
    });
  }

  /** الطلب الفعلي: فلتر الرابط، ومعه موقع الزائر إن طلب «القريبة مني». */
  requestFilter(): AgencyDirectoryFilter {
    const f = this.filter();
    const point = this.near();
    if (!point) return f;
    return { ...f, sort: 'Nearest', latitude: point.latitude, longitude: point.longitude, radiusKm: this.radiusKm() };
  }

  /** يطلب موقع الزائر مرة واحدة؛ بعدها تغيير المسافة لا يعيد طلب الإذن. */
  findNearMe(): void {
    this.geoError.set(null);
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this.geoError.set('OFFICES.NEAR.UNSUPPORTED');
      return;
    }
    this.geoLoading.set(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        this.geoLoading.set(false);
        this.useLocation(position.coords.latitude, position.coords.longitude);
      },
      () => {
        this.geoLoading.set(false);
        this.geoError.set('OFFICES.NEAR.DENIED');
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 }
    );
  }

  /** عام للاختبارات: يعتمد موقعًا (مقرّبًا) ويعيد البحث من الصفحة الأولى. */
  useLocation(latitude: number, longitude: number): void {
    const point = { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) };
    this.near.set(point);
    if (this.view() === 'map') {
      this.officesMap?.centerOn(point.latitude, point.longitude);
      return;
    }
    this.restartFromFirstPage();
  }

  setRadius(km: number): void {
    if (!NEAR_RADII_KM.includes(km)) return;
    this.radiusKm.set(km);
    if (this.near()) this.restartFromFirstPage();
  }

  clearNearMe(): void {
    this.near.set(null);
    this.geoError.set(null);
    if (this.view() === 'list') this.restartFromFirstPage();
  }

  setView(view: OfficesView): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: view === 'map' ? 'map' : null, page: null },
      queryParamsHandling: 'merge'
    });
  }

  private lastBounds: OfficeMapBounds | null = null;

  onMapBounds(bounds: OfficeMapBounds): void {
    this.lastBounds = bounds;
    this.mapBounds$.next(bounds);
  }

  /** «على بعد 1.2 كم» أو «على بعد 350 م». */
  distanceKey(meters: number): { key: string; value: string } {
    if (meters < 1000) return { key: 'OFFICES.NEAR.DISTANCE_M', value: String(Math.max(0, Math.round(meters / 10) * 10)) };
    const km = meters / 1000;
    return { key: 'OFFICES.NEAR.DISTANCE_KM', value: km < 10 ? km.toFixed(1) : String(Math.round(km)) };
  }

  private restartFromFirstPage(): void {
    if ((this.filter().page ?? 1) > 1) {
      this.navigate({ page: 1 });
      return;
    }
    this.reload$.next();
  }

  onSearchInput(value: string): void {
    this.search$.next(value.trim());
  }

  setGovernorate(id: number | null): void {
    this.navigate({ governorateId: id, districtId: null, neighborhoodId: null, page: 1 });
  }

  setDistrict(id: number | null): void {
    this.navigate({ districtId: id, neighborhoodId: null, page: 1 });
  }

  setNeighborhood(id: number | null): void {
    this.navigate({ neighborhoodId: id, page: 1 });
  }

  setPropertyType(id: number | null): void {
    this.navigate({ propertyTypeId: id, page: 1 });
  }

  setDeal(deal: AgencyDirectoryDeal | null): void {
    this.navigate({ deal, page: 1 });
  }

  setVerifiedOnly(value: boolean): void {
    this.navigate({ verifiedOnly: value, page: 1 });
  }

  setMinRating(value: number | null): void {
    this.navigate({ minRating: value, page: 1 });
  }

  setSort(sort: AgencyDirectorySort): void {
    if (sort === 'Nearest') return;
    if (this.near()) {
      // Picking another order leaves "near me": the list goes back to the whole directory in that order.
      this.near.set(null);
      if (sort === this.filter().sort) {
        this.restartFromFirstPage();
        return;
      }
    }
    this.navigate({ sort, page: 1 });
  }

  goToPage(page: number): void {
    this.navigate({ page: Math.min(Math.max(1, page), this.totalPages()) });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  clearFilters(): void {
    this.searchText = '';
    this.navigate({
      search: null, governorateId: null, districtId: null, neighborhoodId: null,
      propertyTypeId: null, deal: null, verifiedOnly: false, minRating: null, page: 1
    });
  }

  retry(): void {
    this.reload$.next();
  }

  toggleFilters(): void {
    this.filtersOpen.update(open => !open);
  }

  /** The office's place: the most precise structured level we can name, else its free-text city. */
  placeOf(item: AgencyDirectoryItem): string | null {
    const gov = this.governorateNames().find(g => g.id === item.governorateId);
    const district = this.districtNames().find(d => d.id === item.districtId);
    const parts = [district, gov].filter((p): p is StructuredLocationLookup => !!p).map(p => this.name(p));
    return parts.length ? parts.join(this.currentLang() === 'ar' ? '، ' : ', ') : (item.city || null);
  }

  /** tel: link for the contact button; digits and a leading + only. */
  telHref(phone: string): string {
    return `tel:${phone.replace(/[^\d+]/g, '')}`;
  }

  propertyTypeName(pt: PropertyTypeLookup): string {
    return pickLocalizedName(pt, this.currentLang());
  }

  trackById(_: number, item: { id: string | number }): string | number {
    return item.id;
  }

  private name(item: StructuredLocationLookup): string {
    return pickLocalizedName(item, this.currentLang());
  }

  private toOptions(
    facets: { id: number; count: number }[] | undefined,
    names: StructuredLocationLookup[]
  ): PlaceOption[] {
    if (!facets) return [];
    return facets
      .map(f => {
        const place = names.find(n => n.id === f.id);
        return place ? { id: f.id, name: this.name(place), count: f.count } : null;
      })
      .filter((o): o is PlaceOption => !!o);
  }

  /** Facets and the name lists of the chosen levels, reloaded only when the chosen place changes. */
  private loadPlaces(previous: AgencyDirectoryFilter, next: AgencyDirectoryFilter): void {
    const first = this.facets() === null;
    if (!first && previous.governorateId === next.governorateId && previous.districtId === next.districtId) return;

    this.api.getDirectoryFacets(next.governorateId, next.districtId)
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe(f => this.facets.set(f ?? { governorates: [], districts: [], neighborhoods: [], totalCount: 0 }));

    if (next.governorateId && (first || previous.governorateId !== next.governorateId)) {
      this.lookups.getDistricts(next.governorateId).pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
        .subscribe(list => this.districtNames.set(list));
    } else if (!next.governorateId) {
      this.districtNames.set([]);
    }

    if (next.districtId && (first || previous.districtId !== next.districtId)) {
      this.lookups.getNeighborhoods(next.districtId).pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
        .subscribe(list => this.neighborhoodNames.set(list));
    } else if (!next.districtId) {
      this.neighborhoodNames.set([]);
    }
  }

  private navigate(change: Partial<AgencyDirectoryFilter>): void {
    const f = { ...this.filter(), ...change };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: f.search || null,
        governorateId: f.governorateId || null,
        districtId: f.districtId || null,
        neighborhoodId: f.neighborhoodId || null,
        propertyTypeId: f.propertyTypeId || null,
        deal: f.deal || null,
        verified: f.verifiedOnly ? 1 : null,
        minRating: f.minRating || null,
        sort: f.sort && f.sort !== 'MostListings' ? f.sort : null,
        page: f.page && f.page > 1 ? f.page : null,
        view: this.view() === 'map' ? 'map' : null
      }
    });
  }
}
