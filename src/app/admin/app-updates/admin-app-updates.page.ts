// =============================================================
// src/app/admin/app-updates/admin-app-updates.page.ts
//
// إدارة إصدارات التطبيق (App Update Management — Phase 3): قائمة الإصدارات لكل منصة،
// إنشاء/تعديل، تفعيل/تعطيل، وحذف ناعم. عبر AdminAppUpdatesService (Admin فقط على
// الخادم). صفحة عربية بالكامل — بلا i18n مقصودًا (أداة إدارية داخلية، كصفحة التسويق).
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  AdminAppUpdatesService,
  AppReleaseDto,
  AppReleasePlatform,
  CreateAppReleaseValue,
  UpdateAppReleaseValue,
} from '../../core/api/admin-app-updates.service';
import { ToastService } from '../../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ConfirmModalComponent } from '../../shared/ui/confirm-modal.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

const PLATFORM_LABELS: Record<AppReleasePlatform, string> = {
  Android: 'أندرويد',
  IOS: 'iOS',
  Web: 'ويب',
};

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** مقارنة رقمية (major.minor.patch)، أبداً كسلسلة نصية — "1.10.0" يجب أن يأتي بعد
 * "1.9.9" رغم أن '1' &lt; '9' أبجدياً. نفس القاعدة المطبَّقة في AppVersion على الباك-إند. */
export function compareVersions(a: string, b: string): number {
  const [aMajor = 0, aMinor = 0, aPatch = 0] = a.split('.').map(Number);
  const [bMajor = 0, bMinor = 0, bPatch = 0] = b.split('.').map(Number);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

export function versionFormatValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  return VERSION_PATTERN.test(value) ? null : { versionFormat: true };
}

export function storeUrlValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : { storeUrl: true };
  } catch {
    return { storeUrl: true };
  }
}

/** يطابق تحقق الخادم: MinimumSupportedVersion لا يمكن أن يكون أحدث من Version — لكن
 * فقط عندما تكون الصيغتان صحيحتين أصلاً، وإلا فرسالة صيغة الإصدار تكفي وحدها. */
export function minimumNotAboveVersionValidator(group: AbstractControl): ValidationErrors | null {
  const version = String(group.get('version')?.value ?? '').trim();
  const minimum = String(group.get('minimumSupportedVersion')?.value ?? '').trim();

  if (!VERSION_PATTERN.test(version) || !VERSION_PATTERN.test(minimum)) return null;

  return compareVersions(minimum, version) <= 0 ? null : { minimumAboveVersion: true };
}

@Component({
  selector: 'app-admin-app-updates',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ConfirmModalComponent,
  ],
  templateUrl: './admin-app-updates.page.html',
  styleUrls: ['./admin-app-updates.page.scss'],
})
export class AdminAppUpdatesPage implements OnInit {
  private readonly api = inject(AdminAppUpdatesService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly platforms: AppReleasePlatform[] = ['Android', 'IOS', 'Web'];

  readonly releases = signal<AppReleaseDto[]>([]);
  readonly loading = signal(true);
  readonly page = signal(1);
  readonly totalPages = signal(1);
  private readonly pageSize = 20;

  platformFilter: AppReleasePlatform | '' = '';
  enabledFilter: '' | 'true' | 'false' = '';

  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);

  readonly actionInFlightId = signal<string | null>(null);
  readonly enablingRelease = signal<AppReleaseDto | null>(null);
  readonly deletingRelease = signal<AppReleaseDto | null>(null);

  readonly form = this.fb.nonNullable.group(
    {
      platform: 'Android' as AppReleasePlatform,
      version: ['', [Validators.required, versionFormatValidator]],
      minimumSupportedVersion: ['', [Validators.required, versionFormatValidator]],
      storeUrl: ['', storeUrlValidator],
      releaseNotesAr: ['', Validators.maxLength(4000)],
      releaseNotesEn: ['', Validators.maxLength(4000)],
      releaseNotesDe: ['', Validators.maxLength(4000)],
      releaseDate: [this.toDateInputValue(new Date()), Validators.required],
      isEnabled: false,
    },
    { validators: minimumNotAboveVersionValidator }
  );

  ngOnInit(): void {
    this.load();
  }

  platformLabel(platform: AppReleasePlatform): string {
    return PLATFORM_LABELS[platform] ?? platform;
  }

  load(): void {
    this.loading.set(true);
    this.api
      .getReleases({
        platform: this.platformFilter || undefined,
        isEnabled: this.enabledFilter === '' ? undefined : this.enabledFilter === 'true',
        page: this.page(),
        pageSize: this.pageSize,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.releases.set(result.items);
          this.totalPages.set(result.totalPages);
          this.loading.set(false);
        },
        error: () => {
          this.toast.error('تعذّر تحميل قائمة الإصدارات.');
          this.loading.set(false);
        },
      });
  }

  applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.load();
  }

  openCreateForm(): void {
    this.editingId.set(null);
    this.form.reset({
      platform: 'Android',
      version: '',
      minimumSupportedVersion: '',
      storeUrl: '',
      releaseNotesAr: '',
      releaseNotesEn: '',
      releaseNotesDe: '',
      releaseDate: this.toDateInputValue(new Date()),
      isEnabled: false,
    });
    this.form.controls.platform.enable();
    this.showForm.set(true);
  }

  openEditForm(release: AppReleaseDto): void {
    this.editingId.set(release.id);
    this.form.reset({
      platform: release.platform,
      version: release.version,
      minimumSupportedVersion: release.minimumSupportedVersion,
      storeUrl: release.storeUrl ?? '',
      releaseNotesAr: release.releaseNotesAr ?? '',
      releaseNotesEn: release.releaseNotesEn ?? '',
      releaseNotesDe: release.releaseNotesDe ?? '',
      releaseDate: this.toDateInputValue(new Date(release.releaseDate)),
      isEnabled: release.isEnabled,
    });
    // Platform غير قابل للتعديل على الخادم — تغييره يعني إنشاء سجل جديد لمنصة أخرى.
    this.form.controls.platform.disable();
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const raw = this.form.getRawValue();
    this.saving.set(true);
    const editingId = this.editingId();

    if (editingId) {
      const value: UpdateAppReleaseValue = {
        version: raw.version.trim(),
        minimumSupportedVersion: raw.minimumSupportedVersion.trim(),
        storeUrl: raw.storeUrl?.trim() || null,
        releaseNotesAr: raw.releaseNotesAr?.trim() || null,
        releaseNotesEn: raw.releaseNotesEn?.trim() || null,
        releaseNotesDe: raw.releaseNotesDe?.trim() || null,
        releaseDate: new Date(raw.releaseDate).toISOString(),
      };

      this.api.updateRelease(editingId, value)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.toast.success('تم تحديث الإصدار بنجاح.');
            this.saving.set(false);
            this.closeForm();
            this.load();
          },
          error: err => {
            this.toast.error(err?.error?.message || 'تعذّر حفظ التعديلات. تحقق من البيانات وحاول مجددًا.');
            this.saving.set(false);
          },
        });
      return;
    }

    const value: CreateAppReleaseValue = {
      platform: raw.platform,
      version: raw.version.trim(),
      minimumSupportedVersion: raw.minimumSupportedVersion.trim(),
      storeUrl: raw.storeUrl?.trim() || null,
      releaseNotesAr: raw.releaseNotesAr?.trim() || null,
      releaseNotesEn: raw.releaseNotesEn?.trim() || null,
      releaseNotesDe: raw.releaseNotesDe?.trim() || null,
      releaseDate: new Date(raw.releaseDate).toISOString(),
      isEnabled: raw.isEnabled,
    };

    this.api.createRelease(value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('تم إنشاء الإصدار بنجاح.');
          this.saving.set(false);
          this.closeForm();
          this.load();
        },
        error: err => {
          this.toast.error(err?.error?.message || 'تعذّر إنشاء الإصدار. تحقق من البيانات وحاول مجددًا.');
          this.saving.set(false);
        },
      });
  }

  // ── تفعيل (يتطلب تأكيداً: أي إصدار مُفعَّل قد يجعل مستخدمين حاليين تحت الحد
  //    الأدنى المطلوب مجبَرين على التحديث فوراً) ──────────────────────────

  requestEnable(release: AppReleaseDto): void {
    this.enablingRelease.set(release);
  }

  cancelEnable(): void {
    this.enablingRelease.set(null);
  }

  confirmEnable(): void {
    const release = this.enablingRelease();
    if (!release) return;

    this.actionInFlightId.set(release.id);
    this.api.enableRelease(release.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.releases.update(items =>
            items.map(r => (r.id === release.id ? { ...r, isEnabled: true } : r))
          );
          this.toast.success('تم تفعيل الإصدار.');
          this.actionInFlightId.set(null);
          this.enablingRelease.set(null);
        },
        error: err => {
          this.toast.error(err?.error?.message || 'تعذّر تفعيل الإصدار.');
          this.actionInFlightId.set(null);
          this.enablingRelease.set(null);
        },
      });
  }

  // ── تعطيل: لا يحتاج تأكيداً — الاتجاه الآمن دائماً (يخفي الإصدار فقط، لا يحذفه) ──

  disable(release: AppReleaseDto): void {
    this.actionInFlightId.set(release.id);
    this.api.disableRelease(release.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.releases.update(items =>
            items.map(r => (r.id === release.id ? { ...r, isEnabled: false } : r))
          );
          this.toast.success('تم تعطيل الإصدار.');
          this.actionInFlightId.set(null);
        },
        error: () => {
          this.toast.error('تعذّر تعطيل الإصدار.');
          this.actionInFlightId.set(null);
        },
      });
  }

  // ── حذف (ناعم) ──────────────────────────────────────────────────────

  requestDelete(release: AppReleaseDto): void {
    this.deletingRelease.set(release);
  }

  cancelDelete(): void {
    this.deletingRelease.set(null);
  }

  confirmDelete(): void {
    const release = this.deletingRelease();
    if (!release) return;

    this.actionInFlightId.set(release.id);
    this.api.deleteRelease(release.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('تم حذف الإصدار.');
          this.actionInFlightId.set(null);
          this.deletingRelease.set(null);
          this.load();
        },
        error: () => {
          this.toast.error('تعذّر حذف الإصدار.');
          this.actionInFlightId.set(null);
          this.deletingRelease.set(null);
        },
      });
  }

  private toDateInputValue(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
}
