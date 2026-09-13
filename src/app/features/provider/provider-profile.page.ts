// src/app/features/provider/provider-profile.page.ts
//
// لوحة تحكم مزوّد الخدمة — تعديل ملف مزوّد الخدمة العام (الاسم المعروض، نبذة، معلومات
// تواصل) عبر PUT /ServiceProviders/me. مستوى التوثيق (VerificationLevel) للعرض فقط —
// الإدارة وحدها من يضبطه (ServiceProvidersController.SetVerification)، لا زر تعديل له هنا.

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ServiceProviderService } from '../../core/api/service-provider.service';
import { ServiceProviderDto } from '../../core/models/service.model';
import { ToastService } from '../../shared/services/toast.service';

@Component({
  selector: 'app-provider-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule],
  templateUrl: './provider-profile.page.html',
  styleUrls: ['./provider-profile.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProviderProfilePage implements OnInit {
  private readonly providerApi = inject(ServiceProviderService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly provider = signal<ServiceProviderDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly saving = signal(false);

  readonly displayName = signal('');
  readonly bio = signal('');
  readonly contactEmail = signal('');
  readonly contactPhone = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.providerApi.getMine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: provider => {
          this.provider.set(provider);
          if (provider) {
            this.displayName.set(provider.displayName);
            this.bio.set(provider.bio ?? '');
            this.contactEmail.set(provider.contactEmail ?? '');
            this.contactPhone.set(provider.contactPhone ?? '');
          }
          this.loading.set(false);
        },
        error: () => {
          this.error.set('PROVIDER.PROFILE.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  save(): void {
    if (!this.displayName().trim()) {
      return;
    }

    this.saving.set(true);
    this.providerApi.updateMine({
      displayName: this.displayName(),
      bio: this.bio().trim() || null,
      contactEmail: this.contactEmail().trim() || null,
      contactPhone: this.contactPhone().trim() || null
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.provider.set(updated);
          this.saving.set(false);
          this.toast.show(this.translate.instant('PROVIDER.PROFILE.SAVE_SUCCESS'), 'success');
        },
        error: () => {
          this.saving.set(false);
          this.toast.show(this.translate.instant('PROVIDER.PROFILE.SAVE_ERROR'), 'error');
        }
      });
  }
}
