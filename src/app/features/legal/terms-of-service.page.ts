// شروط الاستخدام — الحقل الاختياري "Link zu den Nutzungsbedingungen" في شاشة
// موافقة Google OAuth (BUG-17). مسودة أولى وصفية، انظر التعليق في
// privacy-policy.page.ts لنفس التحفظ بشأن المراجعة القانونية.

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-terms-of-service',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterModule],
  template: `
    <section class="legal">
      <div class="legal__card">
        <h1>شروط الاستخدام — عقاراتك (aqar-tech)</h1>
        <p class="legal__updated">آخر تحديث: 31 أغسطس 2026</p>

        <h2>1. قبول الشروط</h2>
        <p>باستخدامك تطبيق أو موقع "عقاراتك"، فإنك توافق على هذه الشروط. إن لم توافق، يرجى عدم استخدام الخدمة.</p>

        <h2>2. وصف الخدمة</h2>
        <p>منصة لعرض ونشر الإعلانات العقارية (بيع، إيجار، إقامة قصيرة الأمد) والتواصل بين المستخدمين بشأنها.</p>

        <h2>3. حسابك</h2>
        <ul>
          <li>أنت مسؤول عن دقة البيانات التي تدخلها وعن سرية بيانات دخولك.</li>
          <li>يجب أن يكون عمرك 18 عامًا فأكثر لإنشاء حساب.</li>
        </ul>

        <h2>4. المحتوى الذي تنشره</h2>
        <ul>
          <li>أنت المسؤول الوحيد عن دقة ومشروعية أي إعلان أو صورة تنشرها.</li>
          <li>نحتفظ بحق إزالة أي محتوى مخالف أو مضلل دون إشعار مسبق.</li>
        </ul>

        <h2>5. الاشتراكات والدفع</h2>
        <p>بعض الميزات (كالإعلانات المميزة أو خطط الوكالات) قد تتطلب اشتراكًا مدفوعًا. تُعرض الأسعار وشروط التجديد بوضوح قبل الدفع.</p>

        <h2>6. إخلاء المسؤولية</h2>
        <p>المنصة وسيط لعرض الإعلانات فقط، ولسنا طرفًا في أي اتفاق بيع أو إيجار يتم بين المستخدمين، ولا نضمن دقة الإعلانات المنشورة من الغير.</p>

        <h2>7. إنهاء الحساب</h2>
        <p>يمكننا تعليق أو إنهاء أي حساب يخالف هذه الشروط، ويمكنك حذف حسابك في أي وقت.</p>

        <h2>8. التواصل معنا</h2>
        <p>لأي استفسار: <a href="mailto:naeem.bazzazeh@gmail.com">naeem.bazzazeh@gmail.com</a></p>

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

    .legal__card ul {
      padding-inline-start: var(--space-6);
      margin: 0 0 var(--space-2);
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
export class TermsOfServicePage {}
