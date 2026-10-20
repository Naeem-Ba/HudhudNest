import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { GovernorateDirectory } from '../../core/api/governorate-directory.service';
import { ProviderApplicationsService } from '../../core/api/provider-applications.service';
import { ServiceProviderService } from '../../core/api/service-provider.service';
import { AuthService } from '../../core/auth/auth.service';
import {
  ServiceProviderApplicantType,
  ServiceProviderApplicationDto,
  ServiceProviderApplicationPayload,
  isApplicationOpen,
  publicEvents
} from '../../core/models/provider-onboarding.model';
import { SERVICE_CATEGORIES, ServiceCategory, ServiceProviderDto } from '../../core/models/service.model';
import { ChoiceChipOption, ChoiceChipsComponent } from '../../shared/ui/choice-chips.component';
import { ConfirmModalComponent } from '../../shared/ui/confirm-modal.component';
import { ToastService } from '../../shared/services/toast.service';

type FormMode = 'submit' | 'respond';

interface Draft {
  applicantType: ServiceProviderApplicantType;
  displayName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  categories: ServiceCategory[];
  governorateIds: number[];
  experience: string;
  companyName: string;
  licenseNumber: string;
  termsAccepted: boolean;
  message: string;
}

const emptyDraft = (): Draft => ({
  applicantType: 'Individual', displayName: '', contactName: '', contactEmail: '', contactPhone: '',
  categories: [], governorateIds: [], experience: '', companyName: '', licenseNumber: '',
  termsAccepted: false, message: ''
});

/**
 * "انضم كمزوّد خدمة" — the real join path. Replaces the old banner that sent a free-text contact
 * message nobody could approve. Anonymous visitors see what joining involves and are sent to sign
 * in (and come back here); signed-in users submit the application, follow its status and answer
 * the admin's info requests in the same page. The server returns only the caller's own
 * applications, so nothing here can reach someone else's.
 */
@Component({
  selector: 'app-service-provider-join-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule, ChoiceChipsComponent, ConfirmModalComponent],
  templateUrl: './service-provider-join.page.html',
  styleUrls: ['./service-provider-join.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceProviderJoinPage implements OnInit {
  private readonly api = inject(ProviderApplicationsService);
  private readonly providers = inject(ServiceProviderService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly governorates = inject(GovernorateDirectory);

  readonly isLoggedIn = toSignal(this.auth.isLoggedIn$, { initialValue: false });

  readonly applications = signal<ServiceProviderApplicationDto[]>([]);
  readonly provider = signal<ServiceProviderDto | null>(null);
  readonly loading = signal(false);
  readonly loadFailed = signal(false);
  readonly busy = signal(false);
  readonly submitted = signal(false);
  readonly formOpen = signal(false);
  readonly confirmWithdraw = signal(false);
  readonly mode = signal<FormMode>('submit');
  readonly draft = signal<Draft>(emptyDraft());

  readonly returnUrl = '/services/join';

  readonly latest = computed(() => {
    const items = [...this.applications()];
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items[0] ?? null;
  });

  readonly history = computed(() => {
    const latest = this.latest();
    return this.applications().filter(a => a.id !== latest?.id);
  });

  /** The form shows for a first application, after a closed one, or while answering an info request. */
  readonly formVisible = computed(() => {
    if (!this.isLoggedIn()) return false;
    if (this.loading() || this.loadFailed()) return false;
    const latest = this.latest();
    if (!latest) return true;
    return this.formOpen();
  });

  readonly canApplyAgain = computed(() => {
    const latest = this.latest();
    if (!latest) return false;
    if (latest.status === 'Rejected' || latest.status === 'Withdrawn') return true;
    return latest.status === 'Approved' && this.provider()?.status === 'Revoked';
  });

  readonly categoryOptions = computed<ChoiceChipOption<ServiceCategory>[]>(() =>
    SERVICE_CATEGORIES.map(category => ({
      value: category,
      label: this.translate.instant(`SERVICES.CATEGORY.${category}`)
    })));

  readonly governorateOptions = computed<ChoiceChipOption<number>[]>(() =>
    this.governorates.items().map(g => ({ value: g.id, label: this.governorates.label(g) })));

  readonly errors = signal<Record<string, string>>({});
  readonly timeline = computed(() => publicEvents(this.latest()?.timeline ?? []));

  readonly isOpen = isApplicationOpen;

  ngOnInit(): void {
    this.governorates.ensureLoaded();
    this.auth.isLoggedIn$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(loggedIn => {
      if (loggedIn) this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.api.getMine().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: items => {
        this.applications.set(items);
        this.loading.set(false);
        const latest = this.latest();
        if (latest?.status === 'Approved') this.loadProvider();
      },
      error: () => { this.loading.set(false); this.loadFailed.set(true); }
    });
  }

  private loadProvider(): void {
    this.providers.getMine().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: provider => this.provider.set(provider),
      error: () => this.provider.set(null)
    });
  }

  startApplyAgain(): void {
    this.prefillFrom(this.latest());
    this.mode.set('submit');
    this.formOpen.set(true);
  }

  startRespond(): void {
    this.prefillFrom(this.latest());
    this.mode.set('respond');
    this.formOpen.set(true);
  }

  cancelForm(): void {
    this.formOpen.set(false);
    this.errors.set({});
  }

  patch(change: Partial<Draft>): void {
    this.draft.update(current => ({ ...current, ...change }));
  }

  private prefillFrom(application: ServiceProviderApplicationDto | null): void {
    if (!application) { this.draft.set(emptyDraft()); return; }
    this.draft.set({
      applicantType: application.applicantType,
      displayName: application.displayName,
      contactName: application.contactName,
      contactEmail: application.contactEmail ?? '',
      contactPhone: application.contactPhone ?? '',
      categories: [...application.requestedCategories],
      governorateIds: [...application.requestedGovernorateIds],
      experience: application.experience,
      companyName: application.companyName ?? '',
      licenseNumber: application.licenseNumber ?? '',
      termsAccepted: false,
      message: ''
    });
  }

  /** Client-side mirror of the server rules, for a fast and friendly check; the server stays the authority. */
  validate(): Record<string, string> {
    const d = this.draft();
    const e: Record<string, string> = {};
    if (!d.displayName.trim()) e['displayName'] = 'PROVIDER_JOIN.ERR.DISPLAY_NAME';
    if (!d.contactName.trim()) e['contactName'] = 'PROVIDER_JOIN.ERR.CONTACT_NAME';
    if (!d.contactEmail.trim() && !d.contactPhone.trim()) e['contact'] = 'PROVIDER_JOIN.ERR.CONTACT';
    if (d.categories.length === 0) e['categories'] = 'PROVIDER_JOIN.ERR.CATEGORIES';
    if (d.governorateIds.length === 0) e['governorates'] = 'PROVIDER_JOIN.ERR.GOVERNORATES';
    if (!d.experience.trim()) e['experience'] = 'PROVIDER_JOIN.ERR.EXPERIENCE';
    if (d.applicantType === 'Company' && !d.companyName.trim()) e['companyName'] = 'PROVIDER_JOIN.ERR.COMPANY_NAME';
    if (this.mode() === 'submit' && !d.termsAccepted) e['terms'] = 'PROVIDER_JOIN.ERR.TERMS';
    if (this.mode() === 'respond' && !d.message.trim()) e['message'] = 'PROVIDER_JOIN.ERR.MESSAGE';
    return e;
  }

  private payload(): ServiceProviderApplicationPayload {
    const d = this.draft();
    return {
      applicantType: d.applicantType,
      displayName: d.displayName.trim(),
      contactName: d.contactName.trim(),
      contactEmail: d.contactEmail.trim() || null,
      contactPhone: d.contactPhone.trim() || null,
      categories: d.categories,
      governorateIds: d.governorateIds,
      experience: d.experience.trim(),
      companyName: d.applicantType === 'Company' ? d.companyName.trim() || null : null,
      licenseNumber: d.licenseNumber.trim() || null
    };
  }

  submit(): void {
    const errors = this.validate();
    this.errors.set(errors);
    if (Object.keys(errors).length > 0 || this.busy()) return;

    this.busy.set(true);
    const latest = this.latest();
    const request$ = this.mode() === 'respond' && latest
      ? this.api.respond(latest.id, { ...this.payload(), message: this.draft().message.trim() })
      : this.api.submit({ ...this.payload(), termsAccepted: this.draft().termsAccepted });

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: saved => {
        this.applications.update(items => [saved, ...items.filter(i => i.id !== saved.id)]);
        this.busy.set(false);
        this.formOpen.set(false);
        this.submitted.set(true);
        this.toast.show(this.translate.instant(
          this.mode() === 'respond' ? 'PROVIDER_JOIN.RESPONDED' : 'PROVIDER_JOIN.SUBMITTED'), 'success');
      },
      // The API error interceptor already shows the server's reason (duplicate, validation, rate limit).
      error: () => this.busy.set(false)
    });
  }

  withdraw(): void {
    const latest = this.latest();
    this.confirmWithdraw.set(false);
    if (!latest || this.busy()) return;
    this.busy.set(true);
    this.api.withdraw(latest.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: saved => {
        this.applications.update(items => items.map(i => i.id === saved.id ? saved : i));
        this.busy.set(false);
        this.toast.show(this.translate.instant('PROVIDER_JOIN.WITHDRAWN'), 'success');
      },
      error: () => this.busy.set(false)
    });
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
