import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileService, UserProfile } from '../services/profile.service';
import { AuthService } from '../services/auth.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  // استخدام التبعيات الحديثة inject بدل Constructor
  private profileService = inject(ProfileService);
  private authService = inject(AuthService);
  private translate = inject(TranslateService);

  // الحالة (State) الخاصة بالمكون
  user = signal<UserProfile | null>(null);
  isLoading = signal(true);
  errorMsg = signal('');
  avatarPreview = signal<string | null>(null);
  showPasswordForm = signal(false)
  
  // إعدادات الملفات
  readonly baseUrl = 'https://localhost:7136';
  readonly allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
  readonly maxFileSizeMB = 2;
  passwordData = { currentPassword: '', newPassword: '', confirmPassword: '' };

  ngOnInit(): void {
    this.fetchProfile();
  }

  /** تحميل بيانات الملف الشخصي من السيرفر */
  fetchProfile(): void {
    this.isLoading.set(false);
    this.profileService.getMe().subscribe({
      next: (data) => {
        this.user.set({ ...data });
        this.updateAvatarPreview(data.ImageUrl);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Fetch Error:', err);
        this.errorMsg.set(this.translate.instant('PROFILE.FETCH_ERROR'));
        this.isLoading.set(false);
      }
    });
  }

  /** تحديث رابط الصورة المعروضة */
  private updateAvatarPreview(path: string | undefined): void {
    if (path) {
      // التأكد من عدم تكرار السلاش بين الـ BaseUrl والمسار
      const fullPath = path.startsWith('/') ? `${this.baseUrl}${path}` : `${this.baseUrl}/${path}`;
      this.avatarPreview.set(fullPath);
    } else {
      this.avatarPreview.set(null);
    }
  }

  /** حفظ التعديلات النصية */
    onSaveProfile(): void {
      const userData = this.user();
      if (!userData) return;

     // التحقق: إذا كان وكيلاً، يجب أن يكون الهاتف والرقم الضريبي غير فارغين
    if (userData.IsAgent) {
     const isPhoneEmpty = !userData.Phone || !userData.Phone.trim();
     const isTaxEmpty = !userData.TaxNumber || !userData.TaxNumber.trim();

     if (isPhoneEmpty || isTaxEmpty) {
        // ستظهر هذه الرسالة إذا كان أحدهما أو كلاهما فارغاً
        alert(this.translate.instant('PROFILE.MESSAGES.AGENT_VALIDATION'));
       return;
     }
    }
    // إذا اجتاز التحقق، يتم الإرسال للسيرفر
    this.profileService.updateProfile(userData).subscribe({
      next: (updated) => {
        this.user.set(updated);
        this.authService.updateCurrentUser(updated);
        alert(this.translate.instant('PROFILE.MESSAGES.SAVE_SUCCESS'));
      },
      error: () => alert(this.translate.instant('PROFILE.MESSAGES.SAVE_ERROR'))
    });
  }

  /** معالجة رفع الصورة الشخصية */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    // التحقق من الصلاحية (النوع والحجم)
    if (!this.allowedTypes.includes(file.type)) {
      alert('الرجاء اختيار صورة بصيغة JPG أو PNG');
      return;
    }

    // استبدال المعاينة فوراً قبل الرفع لتحسين تجربة المستخدم (UX)
  const reader = new FileReader();
  reader.onload = () => {
    this.avatarPreview.set(reader.result as string);
  };
  reader.readAsDataURL(file);

    if (file.size / 1024 / 1024 > this.maxFileSizeMB) {
      alert(this.translate.instant('PROFILE.MESSAGES.SAVE_ERROR'));
      return;
    }

    // الرفع للسيرفر (سيقوم السيرفر باستبدال الملف القديم بنفس الاسم)
  this.profileService.uploadAvatar(file).subscribe({
    next: (res) => {
      if (this.user()) {
        const updatedUser = { ...this.user()!, ImageUrl: res.imageUrl };
        this.user.set(updatedUser);
        
        // إضافة Timestamp للرابط لإجبار المتصفح على تحديث الصورة حتى لو لم يتغير الاسم
        // هذا يمنع مشكلة الـ Caching
        const cacheBuster = `?t=${new Date().getTime()}`;
        this.avatarPreview.set(`${this.baseUrl}${res.imageUrl}${cacheBuster}`);
        
        this.authService.updateCurrentUser(updatedUser);
      }
    },
    error: () => {
      alert(this.translate.instant('PROFILE.MESSAGES.SAVE_ERROR'));
      this.updateAvatarPreview(this.user()?.ImageUrl); // استعادة المعاينة الأصلية عند الخطأ
    }
  });
}

  /** حذف الحساب */
  onDeleteAccount(): void {
    if (confirm(this.translate.instant('PROFILE.MESSAGES.DELETE_CONFIRM'))) {
      this.profileService.deleteAccount().subscribe({
        next: () => {
          alert(this.translate.instant('PROFILE.MESSAGES.DELETE_SUCCESS'));
          // هنا يفضل التوجيه لصفحة تسجيل الدخول أو الرئيسية
        },
        error: () => alert(this.translate.instant('PROFILE.MESSAGES.DELETE_ERROR'))
      });
    }
  }

  /** وظيفة تغيير كلمة المرور */
  onChangePassword(): void {
  const { currentPassword, newPassword, confirmPassword } = this.passwordData;

  // 1. التحققات المحلية (Frontend Validation)
  if (!currentPassword || !newPassword || !confirmPassword) {
    this.showAlert('PROFILE.MESSAGES.FILL_ALL_FIELDS');
    return;
  }

  if (newPassword !== confirmPassword) {
    this.showAlert('PROFILE.MESSAGES.PASS_MISMATCH');
    return;
  }

  if (newPassword.length < 6) {
    this.showAlert('PROFILE.MESSAGES.PASS_LENGTH');
    return;
  }

  // 2. تجهيز البيانات (إرسال المفيد فقط)
  const payload = {
    currentPassword: currentPassword,
    newPassword: newPassword
  };

  // 3. إرسال الطلب
  this.profileService.changePassword(payload).subscribe({
    next: () => {
      this.showAlert('PROFILE.MESSAGES.PASS_SUCCESS');
      this.resetPasswordForm();
    },
    error: (err) => {
      console.error('Password Change Error:', err);
      // التحقق إذا كان الخطأ من السيرفر (مثلاً كلمة المرور الحالية خاطئة)
      this.showAlert('PROFILE.MESSAGES.PASS_ERROR');
    }
  });
}

/** دالة مساعدة لضمان جلب الترجمة بشكل صحيح */
private showAlert(key: string): void {
  this.translate.get(key).subscribe((translation: string) => {
    alert(translation);
  });
}

resetPasswordForm() {
  this.passwordData = { currentPassword: '', newPassword: '', confirmPassword: '' };
  this.showPasswordForm.set(false);
}
}