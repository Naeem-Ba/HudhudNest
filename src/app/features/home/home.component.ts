// =====================================================================
// ✅ FIX — home.component.ts
//
// الإصلاح: إضافة takeUntilDestroyed لإلغاء الـ Subscription
//          تلقائياً عند إزالة Component من الشاشة
//
// المسار: src/app/home/home.component.ts
// =====================================================================

import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { PropertyApiService } from '../../core/api/property-api.service';
import { Property } from '../../core/models/property.model';
import { EnumTranslatePipe } from '../../pipes/enum-translate.pipe';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, CommonModule, TranslateModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  // ✅ inject() الحديث بدلاً من constructor
  private readonly PropertyApiService = inject(PropertyApiService);

  // ✅ DestroyRef يُخبر takeUntilDestroyed متى يُلغي الـ subscription
  private readonly destroyRef = inject(DestroyRef);

  Property: Property[] = [];

  ngOnInit(): void {
    this.PropertyApiService.getProperties()
      .pipe(
        takeUntilDestroyed(this.destroyRef)  // ✅ يُلغى تلقائياً عند إزالة الـ Component
      )
      .subscribe({
        next: data => {
          this.Property = [...data]
            .sort((a, b) => this.dateValue(b.createdAt) - this.dateValue(a.createdAt))
            .slice(0, 6);
        },
        error: err => console.error('Error fetching latest properties', err)
      });
  }

  private dateValue(value?: string): number {
    if (!value) {
      return 0;
    }

    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }
}