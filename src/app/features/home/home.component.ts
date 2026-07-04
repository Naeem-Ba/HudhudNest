import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';

import { PropertyApiService } from '../../core/api/property-api.service';
import type { Property } from '../../core/models/property.model';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslateModule,
    ImageFallbackDirective
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  private readonly propertyApiService = inject(PropertyApiService);
  private readonly destroyRef = inject(DestroyRef);

  properties: Property[] = [];

  ngOnInit(): void {
    this.propertyApiService
      .getProperties()
      .pipe(
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: data => {
          this.properties = [...data]
            .sort(
              (a, b) =>
                this.dateValue(b.createdAt) -
                this.dateValue(a.createdAt)
            )
            .slice(0, 6);
        },
        error: err => {
          console.error(
            'Error fetching latest properties',
            err
          );

          this.properties = [];
        }
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