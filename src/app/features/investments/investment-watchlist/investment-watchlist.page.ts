import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { InvestmentApiService } from '../../../core/api/investment-api.service';
import { InvestmentWatchlistItem } from '../../../core/models/investment.model';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { LoadingSpinnerComponent } from '../../../shared/ui/loading-spinner.component';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { uiNumberLocale } from '../../../core/i18n/ui-language';

@Component({
  selector: 'app-investment-watchlist',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, TranslateModule, EmptyStateComponent, LoadingSpinnerComponent, ImageFallbackDirective],
  templateUrl: './investment-watchlist.page.html',
  styleUrls: ['./investment-watchlist.page.scss']
})
export class InvestmentWatchlistPage {
  private readonly api = inject(InvestmentApiService);
  private readonly router = inject(Router);

  readonly fallbackImage = '/images/no-image.svg';
  readonly items = signal<InvestmentWatchlistItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly removingId = signal<string | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api.getMyWatchlist().subscribe({
      next: items => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('INVESTMENTS.WATCHLIST.LOAD_ERROR');
        this.loading.set(false);
      }
    });
  }

  remove(item: InvestmentWatchlistItem, event: Event): void {
    event.stopPropagation();
    this.removingId.set(item.investmentProjectId);

    this.api.removeFromWatchlist(item.investmentProjectId).subscribe({
      next: () => {
        this.items.update(list => list.filter(i => i.investmentProjectId !== item.investmentProjectId));
        this.removingId.set(null);
      },
      error: () => this.removingId.set(null)
    });
  }

  goToDetails(id: string): void {
    this.router.navigate(['/investments', id]);
  }

  trackById(_: number, item: InvestmentWatchlistItem): string {
    return item.investmentProjectId;
  }

  formatAmount(value: number, currency: string): string {
    try {
      return new Intl.NumberFormat(uiNumberLocale(), { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
    } catch {
      return `${value.toLocaleString('en')} ${currency}`;
    }
  }
}
