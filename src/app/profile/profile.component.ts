import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileService, UserProfile } from '../services/profile.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  // استخدام التبعيات الحديثة inject بدل Constructor
  private profileService = inject(ProfileService);
  private authService = inject(AuthService);

  // الحالة (State) الخاصة بالمكون
  user = signal<UserProfile | null>(null);
  isLoading = signal(true);
  errorMsg = signal('');
  avatarPreview = signal<string | null>(null);
  
  // إعدادات الملفات
  readonly baseUrl = 'https://localhost:7136';
  readonly allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
  readonly maxFileSizeMB = 2;

  ngOnInit(): void {
    this.fetchProfile();
  }

  /** تحميل بيانات الملف الشخصي من السيرفر */
  fetchProfile(): void {
    this.isLoading.set(true);
    this.profileService.getMe().subscribe({
      next: (data) => {
        this.user.set({ ...data });
        this.updateAvatarPreview(data.ImageUrl);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Fetch Error:', err);
        this.errorMsg.set('تعذر تحميل البيانات، يرجى التحقق من الجلسة.');
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

    // شرط جديد: إذا كان وكيلاً، يجب إدخال رقم الهاتف
  if (userData.IsAgent && (!userData.Phone || userData.Phone.trim() === '')) {
    alert('⚠️ عذراً، يجب إدخال رقم الهاتف لتفعيل حساب الوكيل العقاري.');
    return;
  }

    this.profileService.updateProfile(userData).subscribe({
      next: (updated) => {
        this.user.set(updated);
        this.authService.updateCurrentUser(updated);
        alert('✅ تم تحديث بياناتك بنجاح');
      },
      error: () => alert('❌ فشل حفظ التعديلات')
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
      alert(`حجم الصورة يجب أن لا يتجاوز ${this.maxFileSizeMB} ميجابايت`);
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
      alert('❌ فشل رفع الصورة، تم استعادة الصورة السابقة.');
      this.updateAvatarPreview(this.user()?.ImageUrl); // استعادة المعاينة الأصلية عند الخطأ
    }
  });
}

  /** حذف الحساب */
  onDeleteAccount(): void {
    if (confirm('⚠️ تحذير: سيتم حذف حسابك نهائياً. هل أنت متأكد؟')) {
      this.profileService.deleteAccount().subscribe({
        next: () => {
          alert('تم حذف الحساب. وداعاً!');
          // هنا يفضل التوجيه لصفحة تسجيل الدخول أو الرئيسية
        },
        error: () => alert('فشل حذف الحساب حالياً')
      });
    }
  }

  showPasswordForm = signal(false); // للتحكم في ظهور واجهة تغيير كلمة المرور
  passwordData = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
  };

  /** وظيفة تغيير كلمة المرور */
  onChangePassword(): void {
    const { currentPassword, newPassword, confirmPassword } = this.passwordData;

    // 1. تحققات أولية
    if (!currentPassword || !newPassword || !confirmPassword) {
      alert('الرجاء تعبئة جميع حقول كلمة المرور');
      return;
    }

    if (newPassword !== confirmPassword) {
      alert('كلمة المرور الجديدة غير متطابقة مع التأكيد');
      return;
    }

    if (newPassword.length < 6) {
      alert('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    // 2. إرسال الطلب (نفترض وجود دالة changePassword في ProfileService)
//    this.profileService.changePassword(this.passwordData).subscribe({
 //     next: () => {
 //       alert('✅ تم تغيير كلمة المرور بنجاح');
 //       this.resetPasswordForm();
 //     },
 //     error: (err) => {
 //       console.error(err);
 //       alert('❌ فشل تغيير كلمة المرور. تأكد من كلمة المرور الحالية.');
//      }
//    });
  }

  resetPasswordForm() {
    this.passwordData = { currentPassword: '', newPassword: '', confirmPassword: '' };
    this.showPasswordForm.set(false);
  }
}