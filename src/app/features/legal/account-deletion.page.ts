// صفحة عامة لحذف الحساب — Phase 5 (Account Deletion). مطلوبة لمتطلبات Google Play
// وApple App Store: أي تطبيق يسمح بإنشاء حساب يجب أن يوفّر مساراً واضحاً لحذفه، بما
// فيه مسار خارجي عبر الويب لا يتطلب تثبيت التطبيق (راجع
// docs/ACCOUNT-DELETION-PRODUCTION-READINESS.md §12 في مستودع الـ backend).
//
// هذه الصفحة عامة (بلا AuthGuard) ولا تنفّذ الحذف بنفسها — الحذف الفعلي يبقى محصوراً
// بالمسار المصادَق عليه DELETE /api/Users/me (UsersController.DeleteAccount)، الذي
// يشتق هوية المستخدم من التوكن فقط، لا مما يُرسله الزائر هنا. هذه الصفحة فقط:
//   1. تشرح ما الذي سيُحذف/يُحتفظ به، بنفس صياغة نافذة التأكيد داخل /profile.
//   2. توجّه المستخدم القادر على تسجيل الدخول إلى /profile لتنفيذ الحذف فعلياً.
//   3. توفّر طريقة تواصل بديلة لمن لا يستطيع تسجيل الدخول (نسي كلمة المرور بلا بريد
//      مسجَّل، أو أي حالة استثنائية) — طلب حذف يدوي عبر البريد.
//
// Static content, not routed through ngx-translate — نفس منهجية privacy-policy.page.ts
// وterms-of-service.page.ts (نص قانوني/إفصاحي واحد كنسخة مرجعية، لا يُدمَج آلياً في
// مفاتيح i18n الواجهة).

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-account-deletion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterModule],
  template: `
    <section class="legal">
      <div class="legal__card">
        <h1>حذف الحساب — هدهد نيست (HudhudNest)</h1>
        <p class="legal__updated">آخر تحديث: 5 سبتمبر 2026</p>

        <p>
          يمكنك حذف حسابك في "عقاراتك" نهائياً في أي وقت، من داخل التطبيق (Android
          وiOS) أو من نسخة الويب — بدون الحاجة لتثبيت التطبيق لبدء الطلب إذا كنت
          تفضّل التواصل معنا مباشرة (انظر القسم الأخير أدناه).
        </p>

        <h2>1. كيف تحذف حسابك (داخل التطبيق أو الويب)</h2>
        <ol>
          <li>سجّل الدخول إلى حسابك.</li>
          <li>
            افتح <strong>الملف الشخصي</strong> ←
            <strong>منطقة الخطر (Danger Zone)</strong> أسفل الصفحة ←
            اضغط <strong>"حذف الحساب نهائياً"</strong>.
          </li>
          <li>اقرأ التحذير الذي يوضّح ما سيُحذف وما سيبقى محفوظاً، ثم اضغط "متابعة".</li>
          <li>
            أدخل كلمة المرور الحالية (إن كان حسابك يستخدم كلمة مرور — لا يُطلب هذا
            من حسابات الدخول عبر جوجل/آبل فقط)، ثم اكتب
            <strong>DELETE</strong> في الحقل المخصّص للتأكيد النهائي.
          </li>
          <li>
            بمجرد الضغط على زر الحذف، يُحذف حسابك من الخادم فوراً وتُسجَّل خروجك من
            جميع أجهزتك تلقائياً. <strong>لا يمكن التراجع عن هذا الإجراء.</strong>
          </li>
        </ol>

        <h2>2. ما الذي يُحذف فوراً؟</h2>
        <ul>
          <li>اسمك، صورتك الشخصية، نبذتك التعريفية، ومعلومات التواصل الخاصة بك.</li>
          <li>
            بريدك الإلكتروني ورقم هاتفك المسجَّلان بالحساب، وأي ربط بحساب جوجل/آبل —
            لن يعود بإمكانك تسجيل الدخول إلى هذا الحساب بها مجدداً.
          </li>
          <li>جميع جلسات الدخول النشطة على كل أجهزتك.</li>
        </ul>

        <h2>3. ما الذي يبقى محفوظاً (دون بياناتك الشخصية)؟</h2>
        <ul>
          <li>
            الإعلانات العقارية والرسائل والتقييمات التي نشرتها سابقاً تبقى ظاهرة
            للمستخدمين الآخرين — لكن باسم <strong>"مستخدم محذوف"</strong> بدل اسمك
            الحقيقي، وليس باسمك أو بياناتك الشخصية.
          </li>
          <li>
            سجلات أمنية داخلية محدودة (لمنع إساءة الاستخدام ومتابعة حوادث أمنية)، لا
            تحتوي أي من بياناتك الشخصية بعد إتمام الحذف.
          </li>
          <li>
            <strong>ملاحظة:</strong> حذف الحساب لا يحذف عقاراتك المنشورة تلقائياً ولا
            يُلغي نشرها — إن رغبت بذلك، قم به أولاً من صفحة "إعلاناتي" قبل حذف الحساب.
          </li>
        </ul>

        <h2>4. المصادقة المطلوبة</h2>
        <p>
          حذف الحساب عملية حساسة ونهائية، لذا نطلب تسجيل الدخول أولاً، ثم كلمة
          المرور الحالية مجدداً كخطوة تأكيد إضافية (لحسابات البريد/كلمة المرور فقط)،
          إضافة إلى كتابة كلمة تأكيد صريحة قبل تنفيذ الحذف.
        </p>

        <h2>5. لا تستطيع تسجيل الدخول؟</h2>
        <p>
          إن كنت لا تستطيع الوصول إلى حسابك (فقدان الوصول لكلمة المرور أو رقم الهاتف
          مثلاً) وترغب بطلب حذف حسابك وبياناتك، راسلنا من البريد الإلكتروني المسجَّل
          في حسابك على
          <a href="mailto:naeem.bazzazeh@gmail.com?subject=%D8%B7%D9%84%D8%A8%20%D8%AD%D8%B0%D9%81%20%D8%AD%D8%B3%D8%A7%D8%A8">naeem.bazzazeh@gmail.com</a>
          موضّحاً طلبك، وسنتحقق من هويتك قبل تنفيذ الحذف يدوياً.
        </p>

        <h2>6. سياسة الخصوصية</h2>
        <p>
          لمزيد من التفاصيل حول البيانات التي نجمعها ومدة الاحتفاظ بها، راجع
          <a routerLink="/privacy-policy">سياسة الخصوصية</a>.
        </p>

        <a class="legal__back" routerLink="/home">العودة إلى الرئيسية</a>
      </div>
    </section>
  `,
  styles: [`
    .legal {
      min-height: 60vh;
      display: flex;
      justify-content: center;
      padding: clamp(1rem, 3vw, 2.5rem);
    }

    .legal__card {
      width: min(760px, 100%);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      box-shadow: var(--shadow-sm);
      padding: var(--space-8) var(--space-6);
      line-height: 1.9;
    }

    .legal__card h1 {
      font-family: var(--font-display);
      font-size: clamp(1.3rem, 3vw, 1.75rem);
      font-weight: 800;
      color: var(--gray-900);
      margin: 0 0 var(--space-2);
    }

    .legal__updated {
      color: var(--gray-500);
      font-size: var(--text-sm);
      margin: 0 0 var(--space-6);
    }

    .legal__card h2 {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--gray-900);
      margin: var(--space-6) 0 var(--space-2);
    }

    .legal__card p,
    .legal__card li {
      color: var(--gray-600);
      font-size: var(--text-sm);
    }

    .legal__card ul,
    .legal__card ol {
      padding-inline-start: var(--space-6);
      margin: 0 0 var(--space-2);
    }

    .legal__card a {
      color: var(--primary);
      font-weight: 600;
    }

    .legal__back {
      display: inline-block;
      margin-top: var(--space-8);
      color: var(--primary);
      font-weight: 600;
      text-decoration: none;
    }
  `]
})
export class AccountDeletionPage {}
