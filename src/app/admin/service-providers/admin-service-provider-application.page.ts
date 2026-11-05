import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminServiceProvidersService } from '../../core/api/admin-service-providers.service';
import { GovernorateDirectory } from '../../core/api/governorate-directory.service';
import {
  AdminApplicationDetailDto,
  VERIFICATION_LEVELS,
  isApplicationOpen
} from '../../core/models/provider-onboarding.model';
import { ServiceCategory, ServiceProviderVerificationLevel } from '../../core/models/service.model';
import { ToastService } from '../../shared/services/toast.service';
import { ChoiceChipOption, ChoiceChipsComponent } from '../../shared/ui/choice-chips.component';
import { ConfirmModalComponent } from '../../shared/ui/confirm-modal.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

type ActionMode = 'note' | 'info' | 'approve' | 'reject' | null;

/**
 * One join application: everything the applicant submitted, what the admin can do with it
 * (note, ask for information, approve with a scope, reject with a reason) and the full decision
 * history. Approving is a single server call that creates or links the provider, sets the approved
 * categories and areas, audits and notifies — this page only collects the scope.
 */
@Component({
  selector: 'app-admin-service-provider-application-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe,CommonModule, FormsModule, RouterLink, TranslateModule, ChoiceChipsComponent, ConfirmModalComponent, LoadingSpinnerComponent],
  templateUrl: './admin-service-provider-application.page.html',
  styleUrls: ['./admin-service-provider-application.page.scss']
})
export class AdminServiceProviderApplicationPage implements OnInit {
  private readonly api = inject(AdminServiceProvidersService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  readonly governorates = inject(GovernorateDirectory);

  readonly verificationLevels = VERIFICATION_LEVELS;
  readonly detail = signal<AdminApplicationDetailDto | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly busy = signal(false);
  readonly mode = signal<ActionMode>(null);
  readonly confirming = signal(false);

  // Form state for the action panel.
  noteText = '';
  noteVisible = false;
  infoText = '';
  rejectReason = '';
  approveName = '';
  approveVerification: ServiceProviderVerificationLevel = 'None';
  approveNote = '';
  readonly approveCategories = signal<ServiceCategory[]>([]);
  readonly approveGovernorates = signal<number[]>([]);

  readonly summary = computed(() => this.detail()?.summary ?? null);
  readonly isOpen = computed(() => {
    const s = this.summary();
    return !!s && isApplicationOpen(s.status);
  });

  /** The admin may only approve what was asked for, so the chips are the requested sets. */
  readonly categoryOptions = computed<ChoiceChipOption<ServiceCategory>[]>(() =>
    (this.summary()?.requestedCategories ?? []).map(c => ({
      value: c, label: this.translate.instant(`SERVICES.CATEGORY.${c}`)
    })));

  readonly governorateOptions = computed<ChoiceChipOption<number>[]>(() =>
    (this.summary()?.requestedGovernorateIds ?? []).map(id => ({ value: id, label: this.governorates.name(id) })));

  readonly canApprove = computed(() => {
    const d = this.detail();
    if (!d || !this.isOpen()) return false;
    if (!d.applicantAccountActive) return false;
    // An Active provider already exists for this account: the server refuses a second profile.
    return d.existingProviderStatus !== 'Active';
  });

  readonly approveValid = computed(() => this.approveCategories().length > 0 && this.approveGovernorates().length > 0);

  ngOnInit(): void {
    this.governorates.ensureLoaded();
    this.load();
  }

  load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.failed.set(true); this.loading.set(false); return; }
    this.loading.set(true);
    this.failed.set(false);
    this.api.getApplication(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: detail => { this.setDetail(detail); this.loading.set(false); },
      error: () => { this.failed.set(true); this.loading.set(false); }
    });
  }

  private setDetail(detail: AdminApplicationDetailDto): void {
    this.detail.set(detail);
    this.approveName = detail.summary.displayName;
    this.approveCategories.set([...detail.summary.requestedCategories]);
    this.approveGovernorates.set([...detail.summary.requestedGovernorateIds]);
  }

  open(mode: ActionMode): void { this.mode.set(this.mode() === mode ? null : mode); }

  private run(call: () => ReturnType<AdminServiceProvidersService['getApplication']>, successKey: string, reset: () => void): void {
    if (this.busy()) return;
    this.busy.set(true);
    call().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: detail => {
        this.setDetail(detail);
        reset();
        this.busy.set(false);
        this.confirming.set(false);
        this.mode.set(null);
        this.toast.show(this.translate.instant(successKey), 'success');
      },
      // The error interceptor shows the server's reason (stale state, scope outside the request, ...).
      error: () => { this.busy.set(false); this.confirming.set(false); }
    });
  }

  saveNote(): void {
    const id = this.summary()?.id;
    if (!id || !this.noteText.trim()) return;
    this.run(() => this.api.addNote(id, this.noteText.trim(), this.noteVisible), 'ADMIN_PROVIDERS.DONE_NOTE',
      () => { this.noteText = ''; this.noteVisible = false; });
  }

  sendInfoRequest(): void {
    const id = this.summary()?.id;
    if (!id || !this.infoText.trim()) return;
    this.run(() => this.api.requestInfo(id, this.infoText.trim()), 'ADMIN_PROVIDERS.DONE_INFO', () => { this.infoText = ''; });
  }

  approve(): void {
    const id = this.summary()?.id;
    if (!id || !this.approveValid()) return;
    this.run(() => this.api.approve(id, {
      approvedCategories: this.approveCategories(),
      approvedGovernorateIds: this.approveGovernorates(),
      displayName: this.approveName.trim() || null,
      verificationLevel: this.approveVerification,
      note: this.approveNote.trim() || null
    }), 'ADMIN_PROVIDERS.DONE_APPROVED', () => { this.approveNote = ''; });
  }

  reject(): void {
    const id = this.summary()?.id;
    if (!id || !this.rejectReason.trim()) return;
    this.run(() => this.api.reject(id, this.rejectReason.trim()), 'ADMIN_PROVIDERS.DONE_REJECTED', () => { this.rejectReason = ''; });
  }

  confirmAction(): void {
    if (this.mode() === 'approve') this.approve();
    else if (this.mode() === 'reject') this.reject();
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
