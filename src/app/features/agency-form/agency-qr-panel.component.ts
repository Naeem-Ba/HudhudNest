// src/app/features/agency-form/agency-qr-panel.component.ts
//
// رمز QR الثابت للمكتب في «مكتبي العقاري» (للمالك فقط؛ الخادم يتحقق). الرابط قصير ولا يتغير مع الاسم أو
// الرابط (slug)، فما طُبع يبقى صالحًا. التنزيل: SVG متجهي للطباعة بأي حجم، وPNG بعرض 2048 بكسل بإطار وهوية.
import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { Agency } from '../../core/models/agency.model';
import { LanguageService } from '../../core/services/language.service';
import { PropertyShareUrlService } from '../../core/sharing/property-share-url.service';
import { ToastService } from '../../shared/services/toast.service';
import { QrMatrix, buildQrMatrix, drawQrPoster, qrSvgDocument } from '../../shared/utils/qr-code';

@Component({
  selector: 'app-agency-qr-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  styleUrl: './agency-panels.scss',
  template: `
    <section class="panel" data-testid="qr-panel">
      <div class="panel__header">
        <h2 class="panel__title">{{ 'OFFICE_QR.TITLE' | translate }}</h2>
        <p class="panel__desc">{{ 'OFFICE_QR.DESC' | translate }}</p>
      </div>
      <div class="panel__body qr-panel">
        <p class="muted" *ngIf="loading()">{{ 'COMMON.LOADING' | translate }}</p>
        <p class="qr-panel__error" role="alert" *ngIf="failed()">{{ 'OFFICE_QR.LOAD_ERROR' | translate }}</p>

        <ng-container *ngIf="matrix() as m">
          <svg class="qr-panel__code" [attr.viewBox]="'0 0 ' + m.size + ' ' + m.size" role="img"
               [attr.aria-label]="'OFFICE_QR.ALT' | translate: { name: agency.name }" data-testid="qr-svg">
            <rect [attr.width]="m.size" [attr.height]="m.size" fill="white" />
            <path fill="black" shape-rendering="crispEdges" [attr.d]="m.path" />
          </svg>
          <div class="qr-panel__info">
            <code class="qr-panel__url" dir="ltr" data-testid="qr-url">{{ url() }}</code>
            <p class="muted">{{ 'OFFICE_QR.PERMANENT' | translate }}</p>
            <div class="qr-panel__actions">
              <button type="button" class="btn btn--primary btn--sm" (click)="downloadPng()" data-testid="qr-png">
                {{ 'OFFICE_QR.DOWNLOAD_PNG' | translate }}
              </button>
              <button type="button" class="btn btn--outline btn--sm" (click)="downloadSvg()" data-testid="qr-svg-download">
                {{ 'OFFICE_QR.DOWNLOAD_SVG' | translate }}
              </button>
              <button type="button" class="btn btn--ghost btn--sm" (click)="copy()">{{ 'OFFICE_QR.COPY' | translate }}</button>
            </div>
            <p class="muted">{{ 'OFFICE_QR.PRINT_TIP' | translate }}</p>
          </div>
        </ng-container>
      </div>
    </section>
  `,
  styles: [`
    .qr-panel { display: flex; flex-wrap: wrap; gap: 1.25rem; align-items: flex-start; }
    .qr-panel__code { width: 180px; height: 180px; flex: 0 0 180px; border: 1px solid var(--border); border-radius: var(--r-md); }
    .qr-panel__info { flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; gap: .5rem; }
    .qr-panel__url { font-size: .9rem; overflow-wrap: anywhere; color: var(--text-strong); }
    .qr-panel__actions { display: flex; flex-wrap: wrap; gap: .5rem; }
    .qr-panel__error { color: var(--danger-text); margin: 0; }
  `]
})
export class AgencyQrPanelComponent implements OnInit {
  private readonly api = inject(AgenciesApiService);
  private readonly shareUrls = inject(PropertyShareUrlService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) agency!: Agency;

  readonly code = signal<string | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly url = computed(() => this.shareUrls.getOfficeQrUrl(this.code()) ?? '');
  readonly matrix = computed<QrMatrix | null>(() => (this.url() ? buildQrMatrix(this.url()) : null));

  ngOnInit(): void {
    this.api.getQrCode(this.agency.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        this.loading.set(false);
        this.code.set(r.code);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      }
    });
  }

  downloadSvg(): void {
    const m = this.matrix();
    if (!m) return;
    this.save(new Blob([qrSvgDocument(m, this.agency.name)], { type: 'image/svg+xml' }), 'svg');
  }

  downloadPng(): void {
    const m = this.matrix();
    if (!m || typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    const styles = getComputedStyle(document.documentElement);
    drawQrPoster(canvas, m, {
      title: this.agency.name,
      subtitle: this.url().replace(/^https?:\/\//, ''),
      frameColor: styles.getPropertyValue('--gold').trim() || 'black',
      textColor: 'black',
      rtl: this.language.getCurrent() === 'ar'
    });
    canvas.toBlob(blob => blob && this.save(blob, 'png'), 'image/png');
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.toast.success(this.translate.instant('OFFICE_STATS.LINK_COPIED'));
    } catch {
      this.toast.error(this.translate.instant('OFFICE_QR.COPY_FAILED'));
    }
  }

  /** File name from the stable slug and code, never from the (possibly Arabic) office name. */
  fileName(ext: string): string {
    return `hudhudnest-office-${this.agency.slug}-${this.code()}.${ext}`.replace(/[^\w.-]+/g, '-');
  }

  private save(blob: Blob, ext: string): void {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = this.fileName(ext);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
}
