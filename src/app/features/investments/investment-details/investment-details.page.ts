import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { InvestmentApiService } from '../../../core/api/investment-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import {
  InvestmentCalculatorResult,
  InvestmentDocument,
  InvestmentFinancialSummary,
  InvestmentInterestStatus,
  InvestmentProjectDetails,
  InvestmentRisk,
  InvestmentUpdateItem
} from '../../../core/models/investment.model';
import { LoadingSpinnerComponent } from '../../../shared/ui/loading-spinner.component';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-investment-details',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, LoadingSpinnerComponent, ImageFallbackDirective],
  templateUrl: './investment-details.page.html',
  styleUrls: ['./investment-details.page.scss']
})
export class InvestmentDetailsPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(InvestmentApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly fallbackImage = '/images/no-image.svg';

  readonly project = signal<InvestmentProjectDetails | null>(null);
  readonly financials = signal<InvestmentFinancialSummary | null>(null);
  readonly risk = signal<InvestmentRisk | null>(null);
  readonly documents = signal<InvestmentDocument[]>([]);
  readonly updates = signal<InvestmentUpdateItem[]>([]);

  readonly loading = signal(true);
  readonly error = signal('');

  readonly isWatchlisted = signal(false);
  readonly watchlistBusy = signal(false);
  readonly interestStatus = signal<InvestmentInterestStatus | null>(null);
  readonly interestBusy = signal(false);

  calculatorAmount: number | null = null;
  calculatorTermMonths: number | null = null;
  readonly calculatorResult = signal<InvestmentCalculatorResult | null>(null);
  readonly calculatorLoading = signal(false);
  readonly calculatorError = signal('');

  private projectId = '';

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.projectId) {
      this.error.set('INVESTMENTS.DETAILS.NOT_FOUND');
      this.loading.set(false);
      return;
    }
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');

    forkJoin({
      project: this.api.getProjectById(this.projectId),
      financials: this.api.getFinancials(this.projectId),
      risk: this.api.getRisk(this.projectId),
      documents: this.api.getDocuments(this.projectId),
      updates: this.api.getUpdates(this.projectId)
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.project.set(result.project);
          this.financials.set(result.financials);
          this.risk.set(result.risk);
          this.documents.set(result.documents);
          this.updates.set(result.updates);
          this.calculatorAmount = result.project.minimumInvestment;
          this.calculatorTermMonths = result.project.investmentTermMonths;
          this.loading.set(false);
          this.loadUserState();
        },
        error: () => {
          this.error.set('INVESTMENTS.DETAILS.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  private loadUserState(): void {
    if (!this.auth.getAccessToken()) return;

    this.api.getMyWatchlist().subscribe({
      next: items => this.isWatchlisted.set(items.some(item => item.investmentProjectId === this.projectId)),
      error: () => undefined
    });

    this.api.getInterestStatus(this.projectId).subscribe({
      next: status => this.interestStatus.set(status),
      error: () => undefined
    });
  }

  get isInterested(): boolean {
    return this.interestStatus() === 'Active';
  }

  toggleWatchlist(): void {
    if (!this.auth.getAccessToken()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    this.watchlistBusy.set(true);
    const action = this.isWatchlisted()
      ? this.api.removeFromWatchlist(this.projectId)
      : this.api.addToWatchlist(this.projectId);

    action.subscribe({
      next: () => {
        this.isWatchlisted.update(v => !v);
        this.watchlistBusy.set(false);
        this.toast.show(
          this.translate.instant(
            this.isWatchlisted() ? 'INVESTMENTS.DETAILS.WATCHLIST_ADDED' : 'INVESTMENTS.DETAILS.WATCHLIST_REMOVED'
          ),
          'success'
        );
      },
      error: () => {
        this.watchlistBusy.set(false);
        this.toast.show(this.translate.instant('INVESTMENTS.DETAILS.WATCHLIST_ERROR'), 'error');
      }
    });
  }

  expressInterest(): void {
    if (!this.auth.getAccessToken()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    this.interestBusy.set(true);
    this.api.expressInterest(this.projectId).subscribe({
      next: () => {
        this.interestStatus.set('Active');
        this.interestBusy.set(false);
        this.toast.show(this.translate.instant('INVESTMENTS.DETAILS.INTEREST_REGISTERED'), 'success');
      },
      error: () => {
        this.interestBusy.set(false);
        this.toast.show(this.translate.instant('INVESTMENTS.DETAILS.INTEREST_ERROR'), 'error');
      }
    });
  }

  withdrawInterest(): void {
    this.interestBusy.set(true);
    this.api.withdrawInterest(this.projectId).subscribe({
      next: () => {
        this.interestStatus.set('Withdrawn');
        this.interestBusy.set(false);
        this.toast.show(this.translate.instant('INVESTMENTS.DETAILS.INTEREST_WITHDRAWN'), 'success');
      },
      error: () => {
        this.interestBusy.set(false);
        this.toast.show(this.translate.instant('INVESTMENTS.DETAILS.INTEREST_ERROR'), 'error');
      }
    });
  }

  runCalculator(): void {
    if (!this.calculatorAmount || this.calculatorAmount <= 0) return;

    this.calculatorLoading.set(true);
    this.calculatorError.set('');

    this.api.calculate(this.projectId, this.calculatorAmount, this.calculatorTermMonths).subscribe({
      next: result => {
        this.calculatorResult.set(result);
        this.calculatorLoading.set(false);
      },
      error: () => {
        this.calculatorError.set('INVESTMENTS.CALCULATOR.ERROR');
        this.calculatorLoading.set(false);
      }
    });
  }

  formatAmount(value: number, currency: string): string {
    try {
      return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
    } catch {
      return `${value.toLocaleString('en')} ${currency}`;
    }
  }

  trackDocumentById(_: number, document: InvestmentDocument): string {
    return document.id;
  }

  trackUpdateById(_: number, update: InvestmentUpdateItem): string {
    return update.id;
  }
}
