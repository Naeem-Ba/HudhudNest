// src/app/features/office-qr/office-qr-redirect.page.ts
//
// /o/{code}: the link inside an office's printed QR code. Resolves the permanent code to the office (the server
// records the scan there), then replaces this URL with /offices/{slug}, so Back does not land on the redirect
// again. The office page learns it was a QR visit from the navigation state, not from the URL.
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';

import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { OFFICE_VISIT_SOURCE_STATE } from '../../core/models/agency.model';

@Component({
  selector: 'app-office-qr-redirect-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslateModule],
  template: `
    <section class="container qr-redirect">
      @if (failed()) {
        <h1>{{ 'OFFICE_QR.NOT_FOUND_TITLE' | translate }}</h1>
        <p>{{ 'OFFICE_QR.NOT_FOUND_TEXT' | translate }}</p>
        <a class="btn btn--primary" routerLink="/offices">{{ 'OFFICE_QR.BROWSE' | translate }}</a>
      } @else {
        <p role="status">{{ 'OFFICE_QR.OPENING' | translate }}</p>
      }
    </section>
  `,
  styles: [`
    .qr-redirect { padding-block: 3rem; text-align: center; display: flex; flex-direction: column; align-items: center; gap: .75rem; }
    h1 { margin: 0; font-size: 1.3rem; color: var(--gray-900); }
    p { margin: 0; color: var(--gray-500); }
  `]
})
export class OfficeQrRedirectPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(AgenciesApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly failed = signal(false);

  ngOnInit(): void {
    const code = (this.route.snapshot.paramMap.get('code') ?? '').trim();
    if (!/^[a-zA-Z0-9]{8}$/.test(code)) {
      this.failed.set(true);
      return;
    }
    this.api.resolveQrCode(code).pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef)).subscribe(result => {
      if (!result?.slug) {
        this.failed.set(true);
        return;
      }
      this.router.navigate(['/offices', result.slug], { replaceUrl: true, state: { [OFFICE_VISIT_SOURCE_STATE]: 'Qr' } });
    });
  }
}
