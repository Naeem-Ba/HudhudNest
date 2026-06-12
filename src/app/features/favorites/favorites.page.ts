import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FavoritesApiService } from '../../core/services/favorites-api.service';

@Component({
  selector: 'app-favorites-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="page" dir="rtl">
      <h1>&#1575;&#1604;&#1605;&#1601;&#1590;&#1604;&#1577;</h1>

      <p class="error" *ngIf="error()">{{ error() }}</p>
      <p class="loading" *ngIf="loading()">&#1580;&#1575;&#1585;&#1613; &#1575;&#1604;&#1578;&#1581;&#1605;&#1610;&#1604;...</p>

      <div class="empty" *ngIf="!loading() && favorites().length === 0 && !error()">
        &#1604;&#1575; &#1578;&#1608;&#1580;&#1583; &#1593;&#1606;&#1575;&#1589;&#1585; &#1601;&#1610; &#1575;&#1604;&#1605;&#1601;&#1590;&#1604;&#1577;.
      </div>

      <article class="card" *ngFor="let favorite of favorites()">
        <h2>{{ getTitle(favorite) }}</h2>
        <p>{{ getSubtitle(favorite) }}</p>
      </article>
    </section>
  `,
  styles: [`
    .page{padding:2rem}
    .card,.empty,.loading,.error{background:#fff;padding:1rem;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.06);margin-bottom:1rem}
    .error{color:#b00020}
  `]
})
export class FavoritesPage {
  private readonly favoritesApi = inject(FavoritesApiService);

  readonly favorites = signal<any[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() {
    this.load();
  }

  getTitle(item: any): string {
    return String(item?.title ?? item?.Title ?? item?.property?.title ?? item?.Property?.Title ?? '\u0639\u0642\u0627\u0631');
  }

  getSubtitle(item: any): string {
    return String(item?.city ?? item?.City ?? item?.property?.city ?? item?.Property?.City ?? '-');
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');

    this.favoritesApi.getFavorites().subscribe({
      next: items => {
        this.favorites.set(items as any[]);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0644\u0639\u0631\u0636 \u0627\u0644\u0645\u0641\u0636\u0644\u0629.');
        this.loading.set(false);
      }
    });
  }
}
