// صفحة عامة لحذف الحساب — Phase 5 (Account Deletion). مطلوبة لمتطلبات Google Play
// وApple App Store: أي تطبيق يسمح بإنشاء حساب يجب أن يوفّر مساراً واضحاً لحذفه، بما
// فيه مسار خارجي عبر الويب لا يتطلب تثبيت التطبيق (راجع
// docs/ACCOUNT-DELETION-PRODUCTION-READINESS.md §12 في مستودع الـ backend).
//
// هذه الصفحة عامة (بلا AuthGuard) ولا تنفّذ الحذف بنفسها — الحذف الفعلي يبقى محصوراً
// بالمسار المصادَق عليه DELETE /api/Users/me (UsersController.DeleteAccount)، الذي
// يشتق هوية المستخدم من التوكن فقط، لا مما يُرسله الزائر هنا. هذه الصفحة فقط:
//   1. تشرح ما الذي سيُحذف/يُحتفظ به، بنفس صياغة نافذة التأكيد داخل /profile، وأن
//      الحذف يُجدوَل بعد 30 يومًا قابلة للإلغاء (RequestDeleteUserCommandHandler) لا فوراً.
//   2. توجّه المستخدم القادر على تسجيل الدخول إلى /profile لتنفيذ الحذف فعلياً.
//   3. توفّر طريقة تواصل بديلة لمن لا يستطيع تسجيل الدخول (نسي كلمة المرور بلا بريد
//      مسجَّل، أو أي حالة استثنائية) — طلب حذف يدوي عبر البريد.
//
// QA Phase 5 (P5-D02): the page used to be Arabic only, but the Play and App Store reviewers read
// English. The text now exists in ar/en/de (account-deletion.content.ts) and follows the app
// language, like the privacy policy and terms; the three buttons at the top switch the page's
// language without touching the app's, so a reviewer who lands in the wrong one can fix it.

import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { LangCode, LanguageService } from '../../core/services/language.service';
import { PageMetaService } from '../../core/services/page-meta.service';
import { ACCOUNT_DELETION_CONTENT } from './account-deletion.content';
import { LegalTextSegment, parseLegalText } from './legal-document.model';

interface InlineSegment {
  bold: boolean;
  parts: LegalTextSegment[];
}

const LANGUAGE_BUTTONS: ReadonlyArray<{ code: LangCode; label: string }> = [
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'tr', label: 'Türkçe' }
];

/** Splits "a **b** [c](/d)" into plain/bold runs, each parsed for links (never injected as HTML). */
export function parseInline(input: string): InlineSegment[] {
  return input
    .split('**')
    .map((chunk, index) => ({ bold: index % 2 === 1, parts: parseLegalText(chunk) }))
    .filter(segment => segment.parts.length > 0);
}

@Component({
  selector: 'app-account-deletion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterModule, NgTemplateOutlet],
  template: `
    <ng-template #runs let-list>
      @for (part of list; track $index) {
        @if (part.kind === 'route') {
          <a [routerLink]="part.href">{{ part.text }}</a>
        } @else if (part.kind === 'mail') {
          <a [href]="part.href">{{ part.text }}</a>
        } @else {
          {{ part.text }}
        }
      }
    </ng-template>

    <ng-template #rich let-text>
      @for (seg of inline(text); track $index) {
        @if (seg.bold) {
          <strong><ng-container *ngTemplateOutlet="runs; context: { $implicit: seg.parts }" /></strong>
        } @else {
          <ng-container *ngTemplateOutlet="runs; context: { $implicit: seg.parts }" />
        }
      }
    </ng-template>

    <section class="legal" [attr.dir]="dir()" [attr.lang]="lang()">
      <div class="legal__card">
        <div class="legal__langs" role="group" aria-label="Language / اللغة / Sprache" dir="ltr">
          @for (option of languageButtons; track option.code) {
            <button
              type="button"
              class="legal__lang"
              [attr.lang]="option.code"
              [attr.aria-pressed]="option.code === lang()"
              (click)="choose(option.code)">
              {{ option.label }}
            </button>
          }
        </div>

        <h1>{{ content().title }}</h1>
        <p class="legal__updated">{{ content().updated }}</p>

        <p><ng-container *ngTemplateOutlet="rich; context: { $implicit: content().intro }" /></p>

        @for (section of content().sections; track $index) {
          <h2>{{ $index + 1 }}. {{ section.heading }}</h2>
          @for (block of section.blocks; track $index) {
            @if ('p' in block) {
              <p><ng-container *ngTemplateOutlet="rich; context: { $implicit: block.p }" /></p>
            } @else if ('ul' in block) {
              <ul>
                @for (item of block.ul; track $index) {
                  <li><ng-container *ngTemplateOutlet="rich; context: { $implicit: item }" /></li>
                }
              </ul>
            } @else {
              <ol>
                @for (item of block.ol; track $index) {
                  <li><ng-container *ngTemplateOutlet="rich; context: { $implicit: item }" /></li>
                }
              </ol>
            }
          }
        }

        <a class="legal__back" routerLink="/home">{{ content().back }}</a>
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
      color: var(--primary-text);
      font-weight: 600;
    }

    .legal__langs {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: 0 0 var(--space-4);
    }

    .legal__lang {
      border: 1px solid var(--border);
      border-radius: var(--r-md, 8px);
      background: transparent;
      color: var(--primary-text);
      font: inherit;
      font-size: var(--text-sm);
      font-weight: 600;
      padding: 0.25rem 0.75rem;
      cursor: pointer;
    }

    .legal__lang[aria-pressed='true'] {
      background: var(--primary);
      border-color: var(--primary);
      color: var(--on-primary);
    }

    .legal__lang:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }

    .legal__back {
      display: inline-block;
      margin-top: var(--space-8);
      color: var(--primary-text);
      font-weight: 600;
      text-decoration: none;
    }
  `]
})
export class AccountDeletionPage {
  private readonly languages = inject(LanguageService);
  private readonly pageMeta = inject(PageMetaService);

  readonly languageButtons = LANGUAGE_BUTTONS;
  readonly inline = parseInline;

  private readonly appLang = toSignal(this.languages.currentLang$, { initialValue: this.languages.getCurrent() });
  /** The reader's own choice on this page; null means follow the app language. */
  private readonly chosen = signal<LangCode | null>(null);

  readonly lang = computed<LangCode>(() => this.chosen() ?? this.appLang());
  readonly dir = computed(() => (this.lang() === 'ar' ? 'rtl' : 'ltr'));
  readonly content = computed(() => ACCOUNT_DELETION_CONTENT[this.lang()]);

  constructor() {
    // Metadata follows the text on screen, not the app language, so a reviewer who switches the
    // page to English also gets an English title and description.
    effect(() => {
      const content = this.content();
      this.pageMeta.applyDynamic({
        title: content.metaTitle,
        description: content.metaDescription,
        path: '/account-deletion'
      });
    });
    inject(DestroyRef).onDestroy(() => this.pageMeta.clear());
  }

  choose(lang: LangCode): void {
    this.chosen.set(lang);
  }
}
