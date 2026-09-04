import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';

import { InvestmentApiService } from '../../../core/api/investment-api.service';
import { InvestmentProjectFilter, InvestmentProjectSummary } from '../../../core/models/investment.model';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { SkeletonCardGridComponent } from '../../../shared/ui/skeleton-card-grid.component';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-investment-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    TranslateModule,
    EmptyStateComponent,
    SkeletonCardGridComponent,
    ImageFallbackDirective
  ],
  templateUrl: './investment-list.page.html',
  styleUrls: ['./investment-list.page.scss']
})
export class InvestmentListPage implements OnInit {
  private readonly api = inject(InvestmentApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly projects = signal<InvestmentProjectSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly currentPage = signal(1);
  readonly pageSize = signal(12);
  readonly totalCount = signal(0);
  readonly totalPages = computed(() => Math.ceil(this.totalCount() / this.pageSize()) || 1);
  readonly hasNext = computed(() => this.currentPage() < this.totalPages());
  readonly hasPrevious = computed(() => this.currentPage() > 1);

  readonly fallbackImage = '/images/no-image.svg';

  search = '';
  projectType = '';
  riskLevel = '';
  minExpectedReturn: number | null = null;
  maxTermMonths: number | null = null;

  ngOnInit(): void {
    this.loadProjects();
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadProjects();
  }

  resetFilters(): void {
    this.search = '';
    this.projectType = '';
    this.riskLevel = '';
    this.minExpectedReturn = null;
    this.maxTermMonths = null;
    this.applyFilters();
  }

  private currentFilter(): InvestmentProjectFilter {
    return {
      search: this.search.trim() || undefined,
      projectType: (this.projectType || undefined) as InvestmentProjectFilter['projectType'],
      riskLevel: (this.riskLevel || undefined) as InvestmentProjectFilter['riskLevel'],
      minExpectedReturn: this.minExpectedReturn ?? undefined,
      maxTermMonths: this.maxTermMonths ?? undefined,
      page: this.currentPage(),
      pageSize: this.pageSize()
    };
  }

  loadProjects(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .getProjects(this.currentFilter())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.projects.set(result.items);
          this.totalCount.set(result.totalCount);
          this.currentPage.set(result.page);
          this.pageSize.set(result.pageSize);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('INVESTMENTS.LIST.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  goToPage(page: number): void {
    const safePage = Math.max(1, Math.min(Number(page) || 1, this.totalPages()));
    this.currentPage.set(safePage);
    this.loadProjects();
  }

  nextPage(): void { if (this.hasNext()) this.goToPage(this.currentPage() + 1); }
  prevPage(): void { if (this.hasPrevious()) this.goToPage(this.currentPage() - 1); }

  goToDetails(id: string): void {
    this.router.navigate(['/investments', id]);
  }

  trackById(_: number, project: InvestmentProjectSummary): string {
    return project.id;
  }

  formatAmount(value: number, currency: string): string {
    try {
      return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
    } catch {
      return `${value.toLocaleString('en')} ${currency}`;
    }
  }
}
