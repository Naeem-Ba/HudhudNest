// src/app/features/agency-form/agency-form.page.ts
//
// أول صفحة استهلاك لـ AgenciesController بالفرونت‌إند بأكمله — لم يكن هناك أي
// نموذج Create/Edit Agency من قبل (انظر تقرير الفحص). صفحة واحدة تخدم الحالتين
// معًا: GET /api/agencies/me عند التحميل يقرر إن كان المستخدم يملك مكتبًا
// (Edit) أو لا (Create) — بالضبط نفس فكرة "مكتب واحد لكل مستخدم" في الباك اند
// (Agency.OwnerUserId فريد، AgencyRepository.GetByOwnerAsync).
//
// المرحلة 1 (إغلاق الفجوة الجغرافية): حقول Governorate → District →
// Neighborhood تُعاد فيها استخدام نفس البنية التحتية المستخدمة في
// property-form.page.ts بالضبط — LookupsApiService (GET /api/lookups/
// governorates|districts|neighborhoods) ونفس منطق cascading (اختيار محافظة
// يحمّل مناطقها ويصفّر الاختيار الأدق، وهكذا). لا LocationComboComponent هنا
// عمدًا: ذاك المكوّن يضيف حقل نص احتياطي (DistrictText/NeighborhoodText) لا
// مقابل له في Agency أصلاً — Agency تحتاج فقط اختيارًا من القائمة، فـ <select>
// عادي هو إعادة الاستخدام الصحيح لنفس الخدمة والمنطق دون اختراع حقول نصية لا
// طلب لها.
//
// /UI-06/: الصفحة نفسها صارت مركز إدارة المكتب — صندوق الدعوات لمن لا مكتب له
// (AgencyInvitationsComponent)، ولوحة الفريق/الشعار/النقل/التعطيل تحت النموذج
// (AgencyTeamPanelComponent). العضو غير المالك لا يرى نموذج التعديل (الخادم كان
// سيرفضه بـ 403 على أي حال)، بل اللوحة وحدها مع زر المغادرة.
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
  Injector
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { agencyGrace } from '../../core/api/agency-grace';
import {
  LookupsApiService,
  StructuredLocationLookup,
  pickLocalizedName
} from '../../core/api/lookups-api.service';
import { Agency, CreateAgencyRequest, UpdateAgencyRequest } from '../../core/models/agency.model';
import { LanguageService, LangCode } from '../../core/services/language.service';
import { formatStepNumber } from '../../shared/utils/step-number';
import { ToastService } from '../../shared/services/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AgencyEligibility, ProfileService, agencyEligibility } from '../../core/api/profile.service';
import { knownErrorCodeKey } from '../../core/interceptors/api-error.interceptor';
import { RouterLink } from '@angular/router';
import { AgencyTeamPanelComponent } from './agency-team-panel.component';
import { AgencyInvitationsComponent } from './agency-invitations.component';
import { ComboBoxComponent, ComboOption } from '../../shared/ui/combo-box.component';
import { PlaceProposalService } from '../../core/api/place-proposal.service';

/** نفس قائمة رموز الدول المدعومة في CreatePropertyCommandValidator (الباك اند). */
const SUPPORTED_COUNTRY_CODES = ['SY', 'DE', 'US', 'GB', 'FR', 'AE', 'SA', 'TR', 'EG', 'JO', 'LB'];

@Component({
  selector: 'app-agency-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslateModule, ComboBoxComponent, AgencyTeamPanelComponent, AgencyInvitationsComponent],
  templateUrl: './agency-form.page.html',
  styleUrl: './agency-form.page.scss'
})
export class AgencyFormPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly agenciesApi = inject(AgenciesApiService);
  private readonly lookupsApi = inject(LookupsApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly lang = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly authApi = inject(AuthApiService);
  private readonly profileService = inject(ProfileService);

  readonly countryCodes = SUPPORTED_COUNTRY_CODES;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly isEditMode = signal(false);
  private existingAgencyId: string | null = null;

  readonly agency = signal<Agency | null>(null);
  /** Owner's plan ended less than 30 days ago: show the renew-or-lose-it warning. */
  readonly grace = computed(() => agencyGrace(this.agency()));
  readonly currentUserId = toSignal(
    this.auth.currentUser$.pipe(map(user => user?.id || user?.Id || null)),
    { initialValue: this.auth.getCurrentUserId() }
  );
  /** نموذج التعديل للمالك فقط؛ نموذج الإنشاء لمن لا مكتب له. */
  readonly canEditProfile = computed(() => {
    const agency = this.agency();
    return !agency || agency.ownerUserId === this.currentUserId();
  });

  /**
   * What the account still lacks before it may register an office. Drawn from the shared
   * profile; null while it loads (the form is held back rather than flashed). The API
   * enforces the same two rules — this only explains them early and links to the fix.
   */
  readonly eligibility = signal<AgencyEligibility | null>(null);
  /** The create form is shown only to an eligible account; an existing owner edits freely. */
  readonly canCreate = computed(() => this.eligibility() === 'ok');

  readonly governorates = signal<StructuredLocationLookup[]>([]);
  readonly districts = signal<StructuredLocationLookup[]>([]);
  readonly neighborhoods = signal<StructuredLocationLookup[]>([]);

  /** Resolved on first use: only a typed place needs it, and the page renders without the catalog otherwise. */
  private readonly injector = inject(Injector);
  private get placeProposals(): PlaceProposalService {
    return this.injector.get(PlaceProposalService);
  }
  private readonly langSignal = signal<LangCode>(this.lang.getCurrent());
  readonly districtOptions = computed<ComboOption[]>(() =>
    this.districts().map(d => ({ value: d.id, label: pickLocalizedName(d, this.langSignal()) })));
  readonly neighborhoodOptions = computed<ComboOption[]>(() =>
    this.neighborhoods().map(n => ({ value: n.id, label: pickLocalizedName(n, this.langSignal()) })));
  /**
   * A district / neighborhood typed because it is not in the lists. The office record only holds ids, so the name is
   * proposed to the administrators and the office keeps the nearest known area.
   */
  districtText = '';
  neighborhoodText = '';

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    // Slug قابل للتعديل عند الإنشاء فقط — غير قابل للتغيير بعده (انظر
    // UpdateAgencyRequest بالباك اند: لا حقل slug فيه إطلاقًا).
    slug: ['', [Validators.required, Validators.maxLength(120)]],
    countryCode: ['SY', Validators.required],
    description: [null as string | null, Validators.maxLength(2000)],
    contactEmail: [null as string | null, Validators.email],
    contactPhone: [null as string | null, Validators.maxLength(50)],
    city: [null as string | null, Validators.maxLength(120)],
    licenseNumber: [null as string | null, Validators.maxLength(120)],
    // الموقع الجغرافي المنظَّم — المرحلة 1، كلها اختيارية.
    governorateId: [null as number | null],
    districtId: [null as number | null],
    neighborhoodId: [null as number | null]
  });

  ngOnInit(): void {
    this.lang.currentLang$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(l => this.langSignal.set(l));
    this.loadGovernorates();
    this.bindCascadingLocationChanges();
    this.loadEligibility();
    this.loadExistingAgency();
  }

  private loadEligibility(): void {
    this.profileService
      .getMe()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: profile => this.eligibility.set(agencyEligibility(profile)),
        // لا نحجب المستخدم بسبب فشل جلب الملف: الخادم هو الحَكَم عند الإرسال.
        error: () => this.eligibility.set('ok')
      });
  }

  get langCode(): LangCode {
    return this.lang.getCurrent();
  }

  stepNumber(n: number): string {
    return formatStepNumber(n, this.langCode);
  }

  localizedName(opt: StructuredLocationLookup): string {
    return pickLocalizedName(opt, this.langCode);
  }

  /** يعيد قراءة المكتب من الخادم بعد أي إجراء من لوحة الفريق أو صندوق الدعوات. */
  reloadAgency(): void {
    this.agenciesApi
      .getMine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: agency => (agency ? this.applyExistingAgency(agency) : this.resetToCreateMode())
      });
  }

  onLeftAgency(): void {
    this.resetToCreateMode();
  }

  /**
   * الأدوار (AgencyOwner/AgencyAgent) تُمنح وتُسحب في الخادم عند الإنشاء والقبول
   * ونقل الملكية والمغادرة، لكنها مضمّنة في رمز الوصول الحالي. بلا تجديد، أول
   * طلب يتطلب الدور الجديد (PUT بعد الإنشاء مثلًا) يُرفض بـ 403 حتى ينتهي الرمز.
   * محاولة واحدة بلا ضجيج: إن فشلت تبقى الجلسة كما هي.
   */
  refreshSession(then?: () => void): void {
    this.authApi
      .refreshToken()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: tokens => {
          this.auth.login(tokens);
          then?.();
        },
        error: () => then?.()
      });
  }

  private resetToCreateMode(): void {
    this.agency.set(null);
    this.isEditMode.set(false);
    this.existingAgencyId = null;
    this.form.controls.slug.enable();
    this.form.reset({ countryCode: 'SY' }, { emitEvent: false });
    this.districts.set([]);
    this.neighborhoods.set([]);
  }

  private loadExistingAgency(): void {
    this.agenciesApi
      .getMine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: agency => {
          if (agency) {
            this.applyExistingAgency(agency);
          }
          this.loading.set(false);
        },
        error: () => {
          // لا مكتب أو خطأ مؤقت — نُبقي النموذج في وضع "إنشاء" بدل حجب الصفحة.
          this.loading.set(false);
        }
      });
  }

  private applyExistingAgency(agency: Agency): void {
    this.agency.set(agency);
    this.isEditMode.set(true);
    this.existingAgencyId = agency.id;

    // Slug غير قابل للتعديل بعد الإنشاء — يُعطَّل بدل أن يُحذَف من النموذج،
    // ليبقى معروضًا للمستخدم كمرجع (رابط صفحته العامة /agencies/{slug}).
    this.form.controls.slug.disable();

    this.form.patchValue({
      name: agency.name,
      slug: agency.slug,
      countryCode: agency.countryCode,
      description: agency.description ?? null,
      contactEmail: agency.contactEmail ?? null,
      contactPhone: agency.contactPhone ?? null,
      city: agency.city ?? null,
      licenseNumber: agency.licenseNumber ?? null,
      governorateId: agency.governorateId ?? null,
      districtId: agency.districtId ?? null,
      neighborhoodId: agency.neighborhoodId ?? null
    });

    // نفس نمط property-form.page.ts عند التعديل: نحمّل قوائم Districts/
    // Neighborhoods الخاصة بالموقع المحفوظ صراحةً، بدل الاعتماد فقط على
    // اشتراكات valueChanges (التي patchValue أعلاه لا تُطلقها لأنها ستُصفّر
    // districtId/neighborhoodId بالخطأ — انظر bindCascadingLocationChanges).
    if (agency.governorateId) {
      this.lookupsApi
        .getDistricts(agency.governorateId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: items => this.districts.set(items), error: () => this.districts.set([]) });
    }

    if (agency.districtId) {
      this.lookupsApi
        .getNeighborhoods(agency.districtId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: items => this.neighborhoods.set(items), error: () => this.neighborhoods.set([]) });
    }
  }

  private loadGovernorates(): void {
    this.lookupsApi
      .getGovernorates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => this.governorates.set(items),
        error: () => this.governorates.set([])
      });
  }

  /**
   * نفس تسلسل property-form.page.ts بالضبط: تغيير المحافظة يصفّر
   * District/Neighborhood ويحمّل مناطق المحافظة الجديدة؛ تغيير المنطقة يصفّر
   * Neighborhood ويحمّل أحياء المنطقة الجديدة. Neighborhood يبقى اختياريًا
   * دومًا (لا Validators.required عليه).
   */
  private bindCascadingLocationChanges(): void {
    this.form.controls.governorateId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(governorateId => {
        this.districts.set([]);
        this.neighborhoods.set([]);
        this.districtText = '';
        this.neighborhoodText = '';
        this.form.patchValue({ districtId: null, neighborhoodId: null }, { emitEvent: false });

        if (governorateId) {
          this.loadDistricts(governorateId);
        }
      });

    this.form.controls.districtId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(districtId => {
        this.neighborhoods.set([]);
        this.form.patchValue({ neighborhoodId: null }, { emitEvent: false });

        if (districtId) {
          this.loadNeighborhoods(districtId);
        }
      });
  }

  private loadDistricts(governorateId: number): void {
    this.lookupsApi
      .getDistricts(governorateId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => this.districts.set(items),
        error: () => this.districts.set([])
      });
  }

  private loadNeighborhoods(districtId: number): void {
    this.lookupsApi
      .getNeighborhoods(districtId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => this.neighborhoods.set(items),
        error: () => this.neighborhoods.set([])
      });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const f = this.form.getRawValue();

    const request$ = this.isEditMode() && this.existingAgencyId
      ? this.agenciesApi.update(this.existingAgencyId, this.toUpdateRequest(f))
      : this.agenciesApi.create(this.toCreateRequest(f));

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: agency => {
        this.proposeTypedPlaces(f.governorateId, f.districtId);
        const wasEditMode = this.isEditMode();
        this.toast.success(this.translate.instant(
          wasEditMode ? 'AGENCY_FORM.UPDATE_SUCCESS' : 'AGENCY_FORM.CREATE_SUCCESS'
        ));
        if (wasEditMode) {
          this.saving.set(false);
          this.applyExistingAgency(agency);
          return;
        }
        // الإنشاء منح الدور AgencyOwner وغيّر SecurityStamp، فيرفض الخادم رمز الوصول
        // الحالي فورًا. نجدّد الرمز أولًا ثم نعرض لوحة المكتب، لأن عرضها يطلب قائمة
        // الدعوات مباشرة، ولو سبق التجديد لرُفض بـ 401. يبقى زر الحفظ معطّلًا حتى
        // ذلك الحين كي لا يُرسل النموذج، وهو ما زال في وضع الإنشاء، مرة ثانية.
        this.refreshSession(() => {
          this.saving.set(false);
          this.applyExistingAgency(agency);
        });
      },
      error: err => {
        this.saving.set(false);
        // ApiErrorInterceptor already toasts a refusal that has its own translated text
        // (AGENCY_* codes); a second toast here would only repeat it.
        if (!knownErrorCodeKey(err)) {
          this.toast.error(err?.error?.message || this.translate.instant('AGENCY_FORM.SAVE_ERROR'));
        }
      }
    });
  }

  onDistrictTyped(text: string | null): void {
    this.districtText = text ?? '';
  }

  onNeighborhoodTyped(text: string | null): void {
    this.neighborhoodText = text ?? '';
  }

  get canProposePlaces(): boolean {
    return this.placeProposals.canPropose();
  }

  private proposeTypedPlaces(governorateId: number | null, districtId: number | null): void {
    const district = this.districtText.trim();
    const neighborhood = this.neighborhoodText.trim();
    if (!governorateId) return;
    if (district) {
      this.placeProposals.propose({ governorateId, type: 'District', name: district }).subscribe();
    }
    if (neighborhood) {
      this.placeProposals.propose({ governorateId, districtId, type: 'Neighborhood', name: neighborhood }).subscribe();
    }
    this.districtText = '';
    this.neighborhoodText = '';
  }

  private toCreateRequest(f: ReturnType<typeof this.form.getRawValue>): CreateAgencyRequest {
    return {
      name: f.name.trim(),
      slug: f.slug.trim(),
      countryCode: f.countryCode,
      description: f.description?.trim() || null,
      contactEmail: f.contactEmail?.trim() || null,
      contactPhone: f.contactPhone?.trim() || null,
      city: f.city?.trim() || null,
      licenseNumber: f.licenseNumber?.trim() || null,
      governorateId: f.governorateId ?? null,
      districtId: f.districtId ?? null,
      neighborhoodId: f.neighborhoodId ?? null
    };
  }

  private toUpdateRequest(f: ReturnType<typeof this.form.getRawValue>): UpdateAgencyRequest {
    return {
      name: f.name.trim(),
      description: f.description?.trim() || null,
      contactEmail: f.contactEmail?.trim() || null,
      contactPhone: f.contactPhone?.trim() || null,
      city: f.city?.trim() || null,
      // استبدال كامل — يجب إرسال الموقع الحالي كاملاً (انظر UpdateAgencyRequest
      // وdoc comment الباك اند)، وإلا يُمسح أي حقل مُغفَل هنا.
      governorateId: f.governorateId ?? null,
      districtId: f.districtId ?? null,
      neighborhoodId: f.neighborhoodId ?? null
    };
  }
}
