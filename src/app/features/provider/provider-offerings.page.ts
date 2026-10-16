// src/app/features/provider/provider-offerings.page.ts
//
// "خدماتي" للمزوّد: ينشئ عروضه ويعدّلها ويفعّلها ضمن الفئات التي اعتمدتها الإدارة فقط. العرض
// المفعّل وحده يظهر للعملاء، ولا يظهر أي عرض إن كان المزوّد موقوفاً أو ملغى اعتماده. الخادم هو
// المرجع في كل ذلك (403 على فئة غير معتمدة)، وما هنا يمنع الخطأ قبل إرساله فقط.
// السعر غير موجود عمداً: المزوّد يعرض سعره عند قبول الطلب (QuotedPrice) لأن لا قائمة عملات
// معرَّفة للعروض بعد.

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { GovernorateDirectory } from '../../core/api/governorate-directory.service';
import { ServiceOfferingService } from '../../core/api/service-offering.service';
import { ServiceProviderService } from '../../core/api/service-provider.service';
import { ServiceCategory, ServiceOfferingDto, ServiceProviderDto } from '../../core/models/service.model';
import { ToastService } from '../../shared/services/toast.service';

interface OfferingDraft {
  id: string | null;
  category: ServiceCategory | '';
  title: string;
  description: string;
  estimatedDurationDays: number | null;
  isActive: boolean;
}

const emptyDraft = (): OfferingDraft => ({
  id: null, category: '', title: '', description: '', estimatedDurationDays: null, isActive: true
});

@Component({
  selector: 'app-provider-offerings-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule],
  templateUrl: './provider-offerings.page.html',
  styleUrls: ['./provider-offerings.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProviderOfferingsPage implements OnInit {
  private readonly offeringsApi = inject(ServiceOfferingService);
  private readonly providerApi = inject(ServiceProviderService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  readonly governorates = inject(GovernorateDirectory);

  readonly provider = signal<ServiceProviderDto | null>(null);
  readonly offerings = signal<ServiceOfferingDto[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly saving = signal(false);
  readonly editing = signal(false);
  readonly draft = signal<OfferingDraft>(emptyDraft());
  readonly titleError = signal(false);

  readonly approved = computed<ServiceCategory[]>(() => this.provider()?.approvedCategories ?? []);
  readonly canManage = computed(() => (this.provider()?.status ?? 'Active') === 'Active');

  ngOnInit(): void {
    this.governorates.ensureLoaded();
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.providerApi.getMine().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: provider => {
        this.provider.set(provider);
        this.offeringsApi.getMine().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: items => { this.offerings.set(items); this.loading.set(false); },
          error: () => { this.failed.set(true); this.loading.set(false); }
        });
      },
      error: () => { this.failed.set(true); this.loading.set(false); }
    });
  }

  isApproved(category: ServiceCategory): boolean { return this.approved().includes(category); }

  startCreate(): void {
    const first = this.approved()[0] ?? '';
    this.draft.set({ ...emptyDraft(), category: first });
    this.titleError.set(false);
    this.editing.set(true);
  }

  startEdit(offering: ServiceOfferingDto): void {
    this.draft.set({
      id: offering.id,
      category: offering.category,
      title: offering.title,
      description: offering.description ?? '',
      estimatedDurationDays: offering.estimatedDurationDays ?? null,
      isActive: offering.isActive
    });
    this.titleError.set(false);
    this.editing.set(true);
  }

  cancelEdit(): void { this.editing.set(false); }

  patch(change: Partial<OfferingDraft>): void { this.draft.update(current => ({ ...current, ...change })); }

  save(): void {
    const d = this.draft();
    if (!d.title.trim() || !d.category) { this.titleError.set(!d.title.trim()); return; }
    if (this.saving()) return;
    this.saving.set(true);

    // The form has no price fields; an edit must carry the stored price over, not blank it.
    const original = d.id ? this.offerings().find(o => o.id === d.id) : undefined;
    const base = {
      title: d.title,
      description: d.description,
      basePrice: original?.basePrice,
      currencyId: original?.currencyId,
      estimatedDurationDays: d.estimatedDurationDays
    };
    const request$ = d.id
      ? this.offeringsApi.update(d.id, { ...base, isActive: d.isActive })
      : this.offeringsApi.create({ ...base, category: d.category });

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: saved => {
        this.offerings.update(items => d.id ? items.map(i => i.id === saved.id ? saved : i) : [saved, ...items]);
        this.saving.set(false);
        this.editing.set(false);
        this.toast.show(this.translate.instant('PROVIDER.OFFERINGS.SAVED'), 'success');
      },
      // The error interceptor already shows the server's reason (unapproved category, suspended provider).
      error: () => this.saving.set(false)
    });
  }

  toggleActive(offering: ServiceOfferingDto): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.offeringsApi.update(offering.id, {
      title: offering.title,
      description: offering.description,
      basePrice: offering.basePrice,
      currencyId: offering.currencyId,
      estimatedDurationDays: offering.estimatedDurationDays,
      isActive: !offering.isActive
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: saved => {
        this.offerings.update(items => items.map(i => i.id === saved.id ? saved : i));
        this.saving.set(false);
      },
      error: () => this.saving.set(false)
    });
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
