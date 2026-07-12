import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';

import { PropertyApiService } from '../../core/api/property-api.service';
import type { Property } from '../../core/models/property.model';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { UrlService } from '../../core/services/url.service';

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
  private readonly urlService = inject(UrlService);

  private readonly propertyImageWidths = [320, 480, 640, 800] as const;

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

  propertyImageUrl(property: Property, width = 640): string {
    const source = this.propertyImageSource(property);

    return (
      this.urlService.buildResponsiveUrl(source, width) ??
      '/images/no-image.svg'
    );
  }

  propertyImageSrcSet(property: Property): string | null {
    return this.urlService.buildResponsiveSrcSet(
      this.propertyImageSource(property),
      this.propertyImageWidths
    );
  }

  private propertyImageSource(property: Property): string | undefined {
    return property.images?.[0]?.url || property.mainImageUrl;
  }

  private dateValue(value?: string): number {
    if (!value) {
      return 0;
    }

    const time = new Date(value).getTime();

    return Number.isFinite(time) ? time : 0;
  }
}