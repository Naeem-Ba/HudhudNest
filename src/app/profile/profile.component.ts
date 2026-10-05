// Profile page: handles user data, password changes, data export and account deletion.
// ✅ Avatar upload is now live — POST /users/me/avatar (UsersController.UploadAvatar).
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ProfileService, UserProfile } from '../core/api/profile.service';
import { AuthService } from '../core/auth/auth.service';
import { RouterLink } from '@angular/router';
import { PhoneAuthApiService } from '../core/auth/phone-auth-api.service';
import { UrlService } from '../core/services/url.service';
import { ToastService } from '../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../shared/ui/loading-spinner.component';
import { ImageFallbackDirective } from '../shared/directives/image-fallback.directive';
import { ConfirmModalComponent } from '../shared/ui/confirm-modal.component';
import { AVATAR_COMPRESSION, compressImageForUpload } from '../shared/utils/image-compression';
import { AppUpdateNativeGateway } from '../core/api/app-update-native.gateway';
import { NativeFileExportGateway } from '../core/native/native-file-export.gateway';
import { formatDeletionDate } from '../shared/utils/deletion-date';

@Component({
  selector: 'app-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    RouterLink,
    LoadingSpinnerComponent,
    ImageFallbackDirective,
    ConfirmModalComponent
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly authService    = inject(AuthService);
  private readonly phoneAuth      = inject(PhoneAuthApiService);
  private readonly translate      = inject(TranslateService);
  private readonly urlService     = inject(UrlService);
  private readonly toast          = inject(ToastService);
  private readonly route          = inject(ActivatedRoute);
  private readonly native         = inject(AppUpdateNativeGateway);
  private readonly nativeFiles    = inject(NativeFileExportGateway);

  user          = signal<UserProfile | null>(null);
  isLoading     = signal(true);
  isSaving      = signal(false);
  isUploading   = signal(false);
  errorMsg      = signal('');
  avatarPreview = signal<string | null>(null);
  showPasswordForm = signal(false);

  // ✅ إضافة: تدفق "بريد إلكتروني ثانوي" — email/add + email/verify
  // (PhoneAuthController كان يوفّر هذين المسارين بلا أي استهلاك من الواجهة).
  showEmailForm  = signal(false);
  isSendingEmail = signal(false);
  emailLinkSent  = signal(false);
  secondaryEmail = '';
  emailSubmitted = false;

  // ✅ تفعيل: نقطة رفع الصورة الآن جاهزة بالباك اند (POST /users/me/avatar
  // عبر UsersController.UploadAvatar + UploadUserAvatarCommandHandler
  // المخزَّنة عبر Cloudinary — نفس بنية تخزين صور العقارات).
  avatarUploadAvailable = true;

  submitted         = false;
  passwordSubmitted = false;

  readonly fallbackAvatar = '/images/default-avatar.svg';
  readonly allowedTypes   = ['image/png', 'image/jpeg', 'image/jpg'];
  readonly maxFileSizeMB  = 2;

  passwordData = { currentPassword: '', newPassword: '', confirmPassword: '' };

  /** Set when listing-eligibility.guard.ts redirected here with
   * ?reason=confirm-required — the visitor tried to add a property before confirming
   * an email or phone number. */
  showConfirmRequiredBanner = signal(false);

  // ── Account deletion (Phase 5) ──────────────────────────────────────────
  // Two-step flow inside the shared ConfirmModalComponent: 'warning' explains what is
  // deleted/retained (no server call yet), 'confirm' collects re-authentication + the
  // typed keyword and actually calls DELETE /api/Users/me. Never a single-click action —
  // see DELETE_ACCOUNT_KEYWORD below. The server only SCHEDULES the deletion (30-day
  // window); while UserProfile.DeletionScheduledFor is set the Danger Zone shows the date
  // and a cancel button instead of the delete button.
  showDeleteModal = signal(false);
  deleteStep = signal<'warning' | 'confirm'>('warning');
  isDeletingAccount = signal(false);
  deleteError = signal('');
  deletePassword = '';
  deleteConfirmText = '';
  deleteSubmitted = false;

  /** Literal keyword the user must type — kept in Latin script regardless of UI language
   * (same convention as GitHub's "type the repository name to confirm"), so the check
   * never depends on translating/comparing localized text. */
  readonly deleteConfirmKeyword = 'DELETE';

  isCancellingDeletion = signal(false);

  // ── Data export (GET /api/Users/me/export) ─────────────────────────────
  isExporting = signal(false);

  /** The native WebView cannot download a blob: URL, so the native app saves the export
   * through the share sheet instead (NativeFileExportGateway). */
  private readonly isNativeApp = this.native.isNativePlatform();

  ngOnInit(): void {
    this.fetchProfile();

    this.showConfirmRequiredBanner.set(
      this.route.snapshot.queryParamMap.get('reason') === 'confirm-required'
    );
  }

  fetchProfile(): void {
    this.isLoading.set(true);
    this.errorMsg.set('');

    this.profileService.getMe().subscribe({
      next: data => {
        this.user.set(data);
        this.avatarPreview.set(this.urlService.build(data.ImageUrl) || this.fallbackAvatar);
        this.isLoading.set(false);
      },
      error: () => {
        const message = this.translate.instant('PROFILE.FETCH_ERROR');
        this.errorMsg.set(message);
        this.toast.error(message);
        this.isLoading.set(false);
      }
    });
  }

  onSaveProfile(form: NgForm): void {
    this.submitted = true;
    form.control.markAllAsTouched();

    const user = this.user();
    if (!user) return;

    if (form.invalid) {
      this.toast.error(this.translate.instant('VALIDATION.FIX_FIELDS'));
      return;
    }

    this.isSaving.set(true);

    this.profileService.updateProfile(user).subscribe({
      next: updated => {
        this.user.set(updated);
        this.syncAuthStateFromProfile(updated);
        this.isSaving.set(false);
        this.submitted = false;
        this.toast.success(this.translate.instant('PROFILE.MESSAGES.SAVE_SUCCESS'));
      },
      error: () => {
        this.isSaving.set(false);
        this.toast.error(this.translate.instant('PROFILE.MESSAGES.SAVE_ERROR'));
      }
    });
  }

  /**
   */
  async onFileSelected(event: Event): Promise<void> {
    if (!this.avatarUploadAvailable) {
      const translatedMessage = this.translate.instant('PROFILE.MESSAGES.AVATAR_COMING_SOON');
      const fallbackMessage = 'وظيفة رفع الصورة قيد التطوير وستكون متاحة قريبًا.';
      this.toast.warning(translatedMessage || fallbackMessage);
      const input = event.target as HTMLInputElement;
      input.value = '';
      return;
    }

    const picked = (event.target as HTMLInputElement).files?.[0];
    if (!picked) return;

    if (!this.allowedTypes.includes(picked.type)) {
      this.toast.error(this.translate.instant('PROFILE.MESSAGES.INVALID_IMAGE_TYPE'));
      return;
    }

    // A selfie straight from the camera is usually 3-8 MB; the API accepts 2 MB. Shrink instead of refusing.
    this.isUploading.set(true);
    let file: File;
    try {
      file = await compressImageForUpload(picked, AVATAR_COMPRESSION);
    } finally {
      this.isUploading.set(false);
    }

    // The server's cap is 2,000,000 bytes (UploadUserAvatarCommandHandler.MaxAvatarSize).
    if (file.size > this.maxFileSizeMB * 1_000_000) {
      this.toast.error(this.translate.instant('PROFILE.MESSAGES.IMAGE_TOO_LARGE'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => this.avatarPreview.set(reader.result as string);
    reader.readAsDataURL(file);

    this.isUploading.set(true);

    this.profileService.uploadAvatar(file).subscribe({
      next: res => {
        const updated = { ...this.user()!, ImageUrl: res.imageUrl };
        this.user.set(updated);
        this.avatarPreview.set(
          this.urlService.buildWithCacheBuster(res.imageUrl) || this.fallbackAvatar
        );
        this.syncAuthStateFromProfile(updated);
        this.isUploading.set(false);
        this.toast.success(this.translate.instant('PROFILE.MESSAGES.AVATAR_SUCCESS'));
      },
      error: err => {
        this.isUploading.set(false);
        // ✅ نُعيد المعاينة لآخر صورة محفوظة فعليًا بدل الفارغة، والباك اند
        // يُعيد رسالة عربية واضحة داخل body.message لأخطاء التحقق (نوع/حجم
        // الصورة) — نعرضها كما هي بدل رسالة عامة، مع fallback مترجم.
        const savedImageUrl = this.user()?.ImageUrl;
        this.avatarPreview.set(
          (savedImageUrl && this.urlService.build(savedImageUrl)) || this.fallbackAvatar
        );
        const backendMessage = err?.error?.message as string | undefined;
        this.toast.error(backendMessage || this.translate.instant('PROFILE.MESSAGES.SAVE_ERROR'));
      }
    });
  }

  onChangePassword(): void {
    this.passwordSubmitted = true;
    const { currentPassword, newPassword, confirmPassword } = this.passwordData;

    if (!currentPassword || !newPassword || !confirmPassword) {
      this.toast.error(this.translate.instant('PROFILE.MESSAGES.FILL_ALL_FIELDS'));
      return;
    }

    if (newPassword.length < 8) {
      this.toast.error(this.translate.instant('AUTH.ERRORS.PASSWORD_MIN'));
      return;
    }

    if (newPassword !== confirmPassword) {
      this.toast.error(this.translate.instant('PROFILE.MESSAGES.PASS_MISMATCH'));
      return;
    }

    this.isSaving.set(true);

    this.profileService.changePassword({ currentPassword, newPassword }).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.success(this.translate.instant('PROFILE.MESSAGES.PASS_SUCCESS'));
        this.resetPasswordForm();
      },
      error: () => {
        this.isSaving.set(false);
        this.toast.error(this.translate.instant('PROFILE.MESSAGES.PASS_ERROR'));
      }
    });
  }

  /**
   * ✅ إضافة: يرسل بريد التفعيل عبر POST /auth/email/add. لا يُخزَّن البريد
   * كمُفعَّل مباشرة — الباك اند يُرسل رابط تفعيل والمستخدم يجب أن ينقره
   * (يفتح صفحة auth/verify-email) قبل أن يظهر EmailConfirmed = true هنا.
   * لذا بعد النجاح نكتفي برسالة "تحقق من بريدك" ولا نُحدِّث user() محليًا —
   * القيمة الحقيقية تصل فقط عبر fetchProfile() اللاحق (مثلاً بعد التفعيل
   * وإعادة فتح الصفحة)، تفاديًا لعرض بريد "مُضاف" وهو فعليًا غير مؤكَّد.
   */
  addSecondaryEmail(): void {
    this.emailSubmitted = true;
    const email = this.secondaryEmail.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.toast.error(this.translate.instant('VALIDATION.REQUIRED'));
      return;
    }

    this.isSendingEmail.set(true);

    this.phoneAuth.addEmail(email).subscribe({
      next: () => {
        this.isSendingEmail.set(false);
        this.emailLinkSent.set(true);
        this.toast.success(this.translate.instant('PROFILE.EMAIL_SECTION.LINK_SENT'));
      },
      error: error => {
        this.isSendingEmail.set(false);
        this.toast.error(this.mapAddEmailError(error));
      }
    });
  }

  cancelSecondaryEmail(): void {
    this.showEmailForm.set(false);
    this.emailLinkSent.set(false);
    this.emailSubmitted = false;
    this.secondaryEmail = '';
  }

  private mapAddEmailError(error: unknown): string {
    const code = (error as { error?: { code?: string; Code?: string } })?.error?.code
      ?? (error as { error?: { code?: string; Code?: string } })?.error?.Code;

    switch (code) {
      case 'EMAIL_ALREADY_SET':
        return this.translate.instant('PROFILE.EMAIL_SECTION.ERRORS.ALREADY_SET');
      case 'EMAIL_TAKEN':
        return this.translate.instant('PROFILE.EMAIL_SECTION.ERRORS.TAKEN');
      default:
        return this.translate.instant('PROFILE.EMAIL_SECTION.ERRORS.GENERIC');
    }
  }

  /** Opens the deletion modal on its first ("what will happen") step — never the naive
   * confirm() this replaced. Danger Zone button in the template is the only entry point. */
  openDeleteModal(): void {
    this.deleteStep.set('warning');
    this.deleteError.set('');
    this.deletePassword = '';
    this.deleteConfirmText = '';
    this.deleteSubmitted = false;
    this.showDeleteModal.set(true);
  }

  cancelDeleteModal(): void {
    if (this.isDeletingAccount()) return; // never dismissible mid-request
    this.showDeleteModal.set(false);
  }

  /** Step 1 -> Step 2. Nothing is sent to the server yet — this only reveals the
   * re-authentication + typed-confirmation step. */
  proceedToDeleteConfirmStep(): void {
    this.deleteStep.set('confirm');
  }

  backToDeleteWarningStep(): void {
    this.deleteStep.set('warning');
  }

  /** True once the typed keyword matches and (for a password-based account) a password
   * was entered — gates the modal's confirm button, but the server re-validates both
   * independently regardless of what the client thinks it checked. */
  canConfirmAccountDeletion(): boolean {
    const keywordMatches =
      this.deleteConfirmText.trim().toUpperCase() === this.deleteConfirmKeyword;
    const passwordOk = !this.user()?.HasPassword || !!this.deletePassword;
    return keywordMatches && passwordOk;
  }

  confirmDeleteAccount(): void {
    this.deleteSubmitted = true;
    this.deleteError.set('');

    if (!this.canConfirmAccountDeletion()) {
      this.deleteError.set(
        this.deleteConfirmText.trim().toUpperCase() !== this.deleteConfirmKeyword
          ? this.translate.instant('PROFILE.DELETE_MODAL.ERRORS.CONFIRM_TEXT_MISMATCH')
          : this.translate.instant('PROFILE.DELETE_MODAL.ERRORS.CURRENT_PASSWORD_REQUIRED')
      );
      return;
    }

    this.isDeletingAccount.set(true);

    this.profileService.deleteAccount(this.deletePassword || undefined).subscribe({
      next: ({ scheduledFor }) => {
        this.isDeletingAccount.set(false);
        this.showDeleteModal.set(false);

        // Nothing is deleted yet: the account stays usable until scheduledFor, so the user
        // stays signed in and sees the pending state (with its cancel button) right here.
        this.user.update(current =>
          current ? { ...current, DeletionScheduledFor: scheduledFor } : current
        );
        this.profileService.refresh().subscribe({
          next: data => this.user.set(data),
          error: () => undefined
        });

        this.toast.success(
          this.translate.instant('PROFILE.MESSAGES.DELETE_SCHEDULED', {
            date: this.formatDeletionDate(scheduledFor)
          })
        );
      },
      error: err => {
        this.isDeletingAccount.set(false);
        this.deleteError.set(this.mapDeleteAccountError(err));
      }
    });
  }

  /** POST /api/Users/me/deletion/cancel — one click, no password, by design (see
   * CancelAccountDeletionCommandHandler): backing out must never be harder than starting. */
  cancelAccountDeletion(): void {
    if (this.isCancellingDeletion()) return;
    this.isCancellingDeletion.set(true);

    this.profileService.cancelAccountDeletion().subscribe({
      next: data => {
        this.user.set(data);
        this.isCancellingDeletion.set(false);
        this.toast.success(this.translate.instant('PROFILE.DELETION_PENDING.CANCEL_SUCCESS'));
      },
      error: () => {
        this.isCancellingDeletion.set(false);
        this.toast.error(this.translate.instant('PROFILE.DELETION_PENDING.CANCEL_ERROR'));
      }
    });
  }

  formatDeletionDate(value: string | null | undefined): string {
    return formatDeletionDate(value, this.translate.currentLang);
  }

  /** Fetches GET /api/Users/me/export and saves it as a JSON file: a browser download on
   * the web, the system share sheet ("Save to Files", Drive…) in the native app. */
  exportMyData(): void {
    if (this.isExporting()) return;
    this.isExporting.set(true);

    this.profileService.exportMyData().subscribe({
      next: data => {
        const fileName = `hudhudnest-account-export-${this.todayStamp()}.json`;
        const json = JSON.stringify(data, null, 2);

        if (!this.isNativeApp) {
          this.isExporting.set(false);
          this.saveJsonFile(json, fileName);
          this.toast.success(this.translate.instant('PROFILE.DATA_EXPORT.SUCCESS'));
          return;
        }

        this.nativeFiles
          .shareTextFile(fileName, json, this.translate.instant('PROFILE.DATA_EXPORT.TITLE'))
          .then(
            // The share sheet itself is the feedback; closing it is not an error.
            () => this.isExporting.set(false),
            () => {
              this.isExporting.set(false);
              this.toast.error(this.translate.instant('PROFILE.DATA_EXPORT.ERROR'));
            }
          );
      },
      error: err => {
        this.isExporting.set(false);
        this.toast.error(
          this.translate.instant(
            err?.status === 429 ? 'PROFILE.DATA_EXPORT.RATE_LIMITED' : 'PROFILE.DATA_EXPORT.ERROR'
          )
        );
      }
    });
  }

  private saveJsonFile(json: string, fileName: string): void {
    const blob = new Blob([json], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked on the next tick: some browsers start the download asynchronously.
    setTimeout(() => URL.revokeObjectURL(url));
  }

  private todayStamp(): string {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }

  /** Maps the stable error codes DeleteUserCommandHandler returns (see its Fail(...) calls)
   * to a localized message. Falls back to a generic message for anything unrecognized —
   * never shows a raw exception/stack trace to the user (§26/§40 of the spec). */
  private mapDeleteAccountError(error: unknown): string {
    const errors = (error as { error?: { errors?: string[] } })?.error?.errors ?? [];

    if (errors.includes('CURRENT_PASSWORD_REQUIRED')) {
      return this.translate.instant('PROFILE.DELETE_MODAL.ERRORS.CURRENT_PASSWORD_REQUIRED');
    }
    if (errors.includes('INVALID_CURRENT_PASSWORD')) {
      return this.translate.instant('PROFILE.DELETE_MODAL.ERRORS.INVALID_CURRENT_PASSWORD');
    }
    if (errors.includes('ACCOUNT_LOCKED')) {
      return this.translate.instant('PROFILE.DELETE_MODAL.ERRORS.ACCOUNT_LOCKED');
    }

    return this.translate.instant('PROFILE.DELETE_MODAL.ERRORS.GENERIC');
  }

  patchUserField(field: keyof UserProfile, value: UserProfile[keyof UserProfile]): void {
    const current = this.user();
    if (!current) return;
    this.user.set({ ...current, [field]: value });
  }

  passwordMismatch(): boolean {
    return (
      !!this.passwordData.confirmPassword &&
      this.passwordData.newPassword !== this.passwordData.confirmPassword
    );
  }

  /**
   * Keeps AuthService independent from Profile DTO shape.
   * The profile endpoint returns UserProfile, while AuthService owns AuthenticatedUser.
   */
  private syncAuthStateFromProfile(profile: UserProfile): void {
    const id = profile.id ?? profile.Id ?? '';
    const displayName =
      profile.DisplayName?.trim() ||
      [profile.Vorname, profile.Name].filter(Boolean).join(' ').trim() ||
      profile.Email ||
      '';

    this.authService.updateCurrentUser({
      id,
      Id: id,
      email: profile.Email ?? '',
      Email: profile.Email ?? '',
      displayName,
      DisplayName: displayName,
      ImageUrl: profile.ImageUrl ?? null,
      imageUrl: profile.ImageUrl ?? null
    });
  }
  private resetPasswordForm(): void {
    this.passwordData     = { currentPassword: '', newPassword: '', confirmPassword: '' };
    this.passwordSubmitted = false;
    this.showPasswordForm.set(false);
  }
}
