import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminServiceProvidersService } from '../../core/api/admin-service-providers.service';
import { GovernorateDirectory } from '../../core/api/governorate-directory.service';
import { AdminProviderDetailDto, VERIFICATION_LEVELS } from '../../core/models/provider-onboarding.model';
import { SERVICE_CATEGORIES, ServiceCategory, ServiceProviderVerificationLevel } from '../../core/models/service.model';
import { ToastService } from '../../shared/services/toast.service';
import { ChoiceChipOption, ChoiceChipsComponent } from '../../shared/ui/choice-chips.component';
import { ConfirmModalComponent } from '../../shared/ui/confirm-modal.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';

type StatusAction = 'suspend' | 'reactivate' | 'revoke';

/**
 * An approved provider after the decision: edit the profile, widen or narrow the approved
 * categories and coverage, suspend / reactivate / revoke with a recorded reason, set the
 * verification level, and read the full history. Provider status is independent of the
 * application status; nothing here deletes a request or an application.
 */
@Component({
  selector: 'app-admin-service-provider-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule, ChoiceChipsComponent, ConfirmModalComponent, LoadingSpinnerComponent],
  templateUrl: './admin-service-provider-detail.page.html',
  styleUrls: ['./admin-service-provider-detail.page.scss']
})
export class AdminServiceProviderDetailPage implements OnInit {
  private readonly api = inject(AdminServiceProvidersService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  readonly governorates = inject(GovernorateDirectory);

  readonly verificationLevels = VERIFICATION_LEVELS;
  readonly detail = signal<AdminProviderDetailDto | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly busy = signal(false);
  readonly pendingAction = signal<StatusAction | null>(null);

  displayName = '';
  bio = '';
  contactEmail = '';
  contactPhone = '';
  verification: ServiceProviderVerificationLevel = 'None';
  statusReason = '';
  readonly categories = signal<ServiceCategory[]>([]);
  readonly coverage = signal<number[]>([]);

  readonly provider = computed(() => this.detail()?.provider ?? null);
  readonly status = computed(() => this.provider()?.status ?? 'Active');

  readonly categoryOptions: ChoiceChipOption<ServiceCategory>[] = [];
  readonly governorateOptions = computed<ChoiceChipOption<number>[]>(() =>
    this.governorates.items().map(g => ({ value: g.id, label: this.governorates.label(g) })));

  readonly removedCategories = computed(() => {
    const approved = this.provider()?.approvedCategories ?? [];
    return approved.filter(c => !this.categories().includes(c));
  });

  readonly scopeValid = computed(() => this.categories().length > 0 && this.coverage().length > 0);
  readonly reasonRequired = computed(() => this.pendingAction() !== 'reactivate');

  ngOnInit(): void {
    this.governorates.ensureLoaded();
    this.categoryOptions.push(...SERVICE_CATEGORIES.map(c => ({
      value: c, label: this.translate.instant(`SERVICES.CATEGORY.${c}`)
    })));
    this.load();
  }

  load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.failed.set(true); this.loading.set(false); return; }
    this.loading.set(true);
    this.failed.set(false);
    this.api.getProvider(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: detail => { this.setDetail(detail); this.loading.set(false); },
      error: () => { this.failed.set(true); this.loading.set(false); }
    });
  }

  private setDetail(detail: AdminProviderDetailDto): void {
    const p = detail.provider;
    this.detail.set(detail);
    this.displayName = p.displayName;
    this.bio = p.bio ?? '';
    this.contactEmail = p.contactEmail ?? '';
    this.contactPhone = p.contactPhone ?? '';
    this.verification = p.verificationLevel;
    this.categories.set([...(p.approvedCategories ?? [])]);
    this.coverage.set([...(p.coverageGovernorateIds ?? [])]);
  }

  saveProfile(): void {
    const p = this.provider();
    if (!p || this.busy() || !this.displayName.trim() || !this.scopeValid()) return;
    this.busy.set(true);
    this.api.updateProvider(p.id, {
      displayName: this.displayName.trim(),
      bio: this.bio.trim() || null,
      contactEmail: this.contactEmail.trim() || null,
      contactPhone: this.contactPhone.trim() || null,
      approvedCategories: this.categories(),
      coverageGovernorateIds: this.coverage()
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: detail => { this.setDetail(detail); this.busy.set(false); this.toast.show(this.translate.instant('ADMIN_PROVIDERS.DONE_SAVED'), 'success'); },
      error: () => this.busy.set(false)
    });
  }

  saveVerification(): void {
    const p = this.provider();
    if (!p || this.busy() || this.verification === p.verificationLevel) return;
    this.busy.set(true);
    this.api.setVerification(p.id, this.verification).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.busy.set(false); this.toast.show(this.translate.instant('ADMIN_PROVIDERS.DONE_SAVED'), 'success'); this.load(); },
      error: () => this.busy.set(false)
    });
  }

  askStatusChange(action: StatusAction): void {
    this.statusReason = '';
    this.pendingAction.set(action);
  }

  cancelStatusChange(): void { this.pendingAction.set(null); }

  confirmStatusChange(): void {
    const p = this.provider();
    const action = this.pendingAction();
    if (!p || !action || this.busy()) return;
    const reason = this.statusReason.trim();
    if (this.reasonRequired() && !reason) return;

    this.busy.set(true);
    const call = action === 'suspend' ? this.api.suspend(p.id, reason)
      : action === 'revoke' ? this.api.revoke(p.id, reason)
      : this.api.reactivate(p.id, reason || null);

    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: detail => {
        this.setDetail(detail);
        this.busy.set(false);
        this.pendingAction.set(null);
        this.toast.show(this.translate.instant(`ADMIN_PROVIDERS.DONE_${action.toUpperCase()}`), 'success');
      },
      error: () => { this.busy.set(false); this.pendingAction.set(null); }
    });
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
