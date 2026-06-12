import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { PropertyApiService } from '../../../core/services/property-api.service';
import { Property } from '../../../core/models/property.model';

@Component({
  selector: 'app-property-list-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="properties-page" dir="rtl">
      <header class="page-header">
        <h1>&#1575;&#1604;&#1593;&#1602;&#1575;&#1585;&#1575;&#1578; &#1575;&#1604;&#1580;&#1583;&#1610;&#1583;&#1577;</h1>
        <p>&#1606;&#1592;&#1575;&#1605; &#1575;&#1604;&#1593;&#1602;&#1575;&#1585;&#1575;&#1578; &#1575;&#1604;&#1580;&#1583;&#1610;&#1583; &#1575;&#1604;&#1605;&#1585;&#1578;&#1576;&#1591; &#1576;&#1575;&#1604;&#1600; Backend.</p>
      </header>

      <p class="error" *ngIf="error()">{{ error() }}</p>

      <div class="loading" *ngIf="loading()">
        &#1580;&#1575;&#1585;&#1613; &#1578;&#1581;&#1605;&#1610;&#1604; &#1575;&#1604;&#1593;&#1602;&#1575;&#1585;&#1575;&#1578;...
      </div>

      <div class="empty" *ngIf="!loading() && properties().length === 0 && !error()">
        &#1604;&#1575; &#1578;&#1608;&#1580;&#1583; &#1593;&#1602;&#1575;&#1585;&#1575;&#1578; &#1581;&#1575;&#1604;&#1610;&#1611;&#1575;.
      </div>

      <div class="grid" *ngIf="!loading() && properties().length > 0">
        <article class="card" *ngFor="let property of properties()">
          <h2>{{ getTitle(property) }}</h2>
          <p>{{ getCity(property) }}</p>
          <strong>{{ getPrice(property) }}</strong>
        </article>
      </div>
    </section>
  `,
  styles: [`
    .properties-page {
      padding: 2rem;
    }

    .page-header {
      margin-bottom: 1.5rem;
    }

    .page-header h1 {
      margin: 0 0 .5rem;
    }

    .empty,
    .loading,
    .error {
      background: #fff;
      padding: 1rem;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,.06);
    }

    .error {
      color: #b00020;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 1rem;
    }

    .card {
      background: #fff;
      padding: 1rem;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,.06);
    }
  `]
})
export class PropertyListPage {
  private readonly propertyApi = inject(PropertyApiService);

  readonly properties = signal<Property[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() {
    this.loadProperties();
  }

  getTitle(property: Property): string {
    const value = (property as any).title ?? (property as any).Title;
    return value ? String(value) : '\u0639\u0642\u0627\u0631';
  }

  getCity(property: Property): string {
    const value = (property as any).city ?? (property as any).City;
    return value ? String(value) : '-';
  }

  getPrice(property: Property): string {
    const value = (property as any).price ?? (property as any).Price ?? 0;
    return String(value);
  }

  private loadProperties(): void {
    this.loading.set(true);
    this.error.set('');

    this.propertyApi.getProperties().subscribe({
      next: properties => {
        this.properties.set(properties);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0639\u0642\u0627\u0631\u0627\u062A.');
        this.loading.set(false);
      }
    });
  }
}
