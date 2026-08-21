// Profile page: handles user data, password changes and account deletion.
// ✅ Avatar upload is now live — POST /users/me/avatar (UsersController.UploadAvatar).
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ProfileService, UserProfile } from '../core/api/profile.service';
import { AuthService } from '../core/auth/auth.service';
import { PhoneAuthApiService } from '../core/auth/phone-auth-api.service';
import { UrlService } from '../core/services/url.service';
import { ToastService } from '../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../shared/ui/loading-spinner.component';
import { ImageFallbackDirective } from '../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    LoadingSpinnerComponent,
    ImageFallbackDirective
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
  private readonly router         = inject(Router);

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

  ngOnInit(): void {
    this.fetchProfile();
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

    if (form.invalid || this.hasAgentValidationError(user)) {
      this.toast.error(this.translate.instant('PROFILE.MESSAGES.AGENT_VALIDATION'));
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
  onFileSelected(event: Event): void {
    if (!this.avatarUploadAvailable) {
      const translatedMessage = this.translate.instant('PROFILE.MESSAGES.AVATAR_COMING_SOON');
      const fallbackMessage = 'وظيفة رفع الصورة قيد التطوير وستكون متاحة قريبًا.';
      this.toast.warning(translatedMessage || fallbackMessage);
      const input = event.target as HTMLInputElement;
      input.value = '';
      return;
    }

    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (!this.allowedTypes.includes(file.type)) {
      this.toast.error(this.translate.instant('PROFILE.MESSAGES.INVALID_IMAGE_TYPE'));
      return;
    }

    if (file.size / 1024 / 1024 > this.maxFileSizeMB) {
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

  /**
   */
  onDeleteAccount(): void {
    if (!confirm(this.translate.instant('PROFILE.MESSAGES.DELETE_CONFIRM'))) return;

    this.profileService.deleteAccount().subscribe({
      next: () => {
        this.authService.logoutLocal();

        this.toast.success(this.translate.instant('PROFILE.MESSAGES.DELETE_SUCCESS'));

        this.router.navigateByUrl('/auth/login');
      },
      error: () => {
        this.toast.error(this.translate.instant('PROFILE.MESSAGES.DELETE_ERROR'));
      }
    });
  }

  patchUserField(field: keyof UserProfile, value: UserProfile[keyof UserProfile]): void {
    const current = this.user();
    if (!current) return;
    this.user.set({ ...current, [field]: value });
  }

  hasAgentValidationError(user: UserProfile | null): boolean {
    return !!user?.IsAgent && (!user.Phone?.trim() || !user.TaxNumber?.trim());
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
