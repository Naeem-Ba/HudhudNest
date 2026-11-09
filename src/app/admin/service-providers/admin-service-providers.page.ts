import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';

import { AdminServiceProvidersService } from '../../core/api/admin-service-providers.service';
import { GovernorateDirectory } from '../../core/api/governorate-directory.service';
import {
  APPLICATION_STATUSES,
  AdminApplicationSummaryDto,
  AdminProviderSummaryDto,
  PROVIDER_STATUSES,
  ServiceProviderApplicationStatus
} from '../../core/models/provider-onboarding.model';
import { SERVICE_CATEGORIES, ServiceCategory, ServiceProviderStatus } from '../../core/models/service.model';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

type Tab = 'applications' | 'providers';

/**
 * "إدارة مزوّدي الخدمات" — one admin section with two queues: join applications (what needs a
 * decision) and approved providers (who is live, suspended or revoked). The filters are sent to
 * the server and the lists are paged there, so the page stays light however many rows exist.
 */
@Component({
  selector: 'app-admin-service-providers-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe,CommonModule, FormsModule, RouterLink, TranslateModule, LoadingSpinnerComponent, EmptyStateComponent],
  templateUrl: './admin-service-providers.page.html',
  styleUrls: ['./admin-service-providers.page.scss']
})
export class AdminServiceProvidersPage implements OnInit {
  private readonly api = inject(AdminServiceProvidersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly governorates = inject(GovernorateDirectory);

  readonly pageSize = 20;
  readonly categories = SERVICE_CATEGORIES;
  readonly applicationStatuses = APPLICATION_STATUSES;
  readonly providerStatuses = PROVIDER_STATUSES;

  readonly tab = signal<Tab>('applications');
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly pendingCount = signal(0);

  readonly applications = signal<AdminApplicationSummaryDto[]>([]);
  readonly providers = signal<AdminProviderSummaryDto[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);

  search = '';
  status: ServiceProviderApplicationStatus | ServiceProviderStatus | '' = '';
  category: ServiceCategory | '' = '';
  governorateId: number | null = null;

  private readonly search$ = new Subject<string>();
  private requestSeq = 0;

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));
  readonly statusOptions = computed(() =>
    this.tab() === 'applications' ? this.applicationStatuses : this.providerStatuses);

  ngOnInit(): void {
    this.governorates.ensureLoaded();
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { this.page.set(1); this.load(); });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const tab: Tab = params.get('tab') === 'providers' ? 'providers' : 'applications';
      this.tab.set(tab);
      this.status = tab === 'applications' ? ((params.get('status') as ServiceProviderApplicationStatus) ?? '') : '';
      this.page.set(1);
      this.load();
    });
    this.loadPendingCount();
  }

  selectTab(tab: Tab): void {
    if (tab === this.tab()) return;
    this.search = '';
    this.category = '';
    this.governorateId = null;
    void this.router.navigate([], { queryParams: { tab } });
  }

  onSearchChange(value: string): void { this.search$.next(value); }

  applyFilters(): void { this.page.set(1); this.load(); }

  goToPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
    this.load();
  }

  load(): void {
    const seq = ++this.requestSeq;
    this.loading.set(true);
    this.failed.set(false);
    const base = {
      search: this.search, category: this.category, governorateId: this.governorateId,
      page: this.page(), pageSize: this.pageSize
    };
    const onError = (): void => {
      if (seq !== this.requestSeq) return;
      this.loading.set(false);
      this.failed.set(true);
    };

    if (this.tab() === 'applications') {
      this.api.searchApplications({ ...base, status: this.status as ServiceProviderApplicationStatus | '' })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: result => {
            // A slow answer for filters the admin already changed must not overwrite the newer list.
            if (seq !== this.requestSeq) return;
            this.applications.set(result.items);
            this.total.set(result.total);
            this.loading.set(false);
          },
          error: onError
        });
    } else {
      this.api.searchProviders({ ...base, status: this.status as ServiceProviderStatus | '' })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: result => {
            if (seq !== this.requestSeq) return;
            this.providers.set(result.items);
            this.total.set(result.total);
            this.loading.set(false);
          },
          error: onError
        });
    }
  }

  private loadPendingCount(): void {
    this.api.pendingCount().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: count => this.pendingCount.set(count),
      error: () => this.pendingCount.set(0)
    });
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
