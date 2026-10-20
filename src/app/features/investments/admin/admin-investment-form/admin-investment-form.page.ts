// =============================================================
// src/app/features/investments/admin/admin-investment-form/admin-investment-form.page.ts
//
// Admin Investment Portal — create a new project (Phase 2 §7). Deliberately minimal: this
// mirrors the backend's own CreateInvestmentProjectCommand, which only accepts
// property/title/description/type/currency (Draft status). Every other field (target amount,
// financials, risk, schedule…) is filled in afterwards on the detail page's edit form — the
// backend enforces this same two-step shape (Create then Update), so the frontend does too
// rather than inventing a single giant form the API cannot accept in one call.
//
// The property picker is a manual id + "look up" step against the existing public
// GET /api/properties/{id} endpoint: no admin-wide "search any property by title" endpoint
// exists yet (Phase 2 audit finding — see docs/investment/PHASE-2-IMPLEMENTATION-REPORT.md).
// =============================================================

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminInvestmentApiService } from '../../../../core/api/admin-investment-api.service';
import { PropertyApiService } from '../../../../core/api/property-api.service';
import { InvestmentProjectType } from '../../../../core/models/investment.model';
import { ToastService } from '../../../../shared/services/toast.service';
import { FormErrorComponent } from '../../../../shared/ui/form-error.component';

const PROJECT_TYPES: InvestmentProjectType[] = [
  'Residential', 'Commercial', 'Mixed', 'Industrial', 'Land', 'Renovation', 'NewConstruction'
];

@Component({
  selector: 'app-admin-investment-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, TranslateModule, FormErrorComponent],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>{{ 'ADMIN_INVESTMENTS.FORM.CREATE_TITLE' | translate }}</h1>
        <p>{{ 'ADMIN_INVESTMENTS.FORM.CREATE_SUBTITLE' | translate }}</p>
      </header>

      <form class="form" [formGroup]="form" (ngSubmit)="submit()">
        <div class="field">
          <label for="propertyId">{{ 'ADMIN_INVESTMENTS.FORM.PROPERTY_ID' | translate }}</label>
          <div class="property-lookup">
            <input id="propertyId" type="text" formControlName="propertyId" (blur)="lookupProperty()" />
            <button type="button" class="btn btn--outline" [disabled]="lookingUp()" (click)="lookupProperty()">
              {{ lookingUp() ? ('COMMON.LOADING' | translate) : ('ADMIN_INVESTMENTS.FORM.LOOKUP' | translate) }}
            </button>
          </div>
          <app-form-error [control]="form.controls.propertyId" [submitted]="submitted()"></app-form-error>
          <p class="property-preview" *ngIf="propertyPreview()">
            ✅ {{ propertyPreview()!.title }} — {{ propertyPreview()!.city }}
          </p>
          <p class="property-preview property-preview--error" *ngIf="propertyLookupError()">
            {{ 'ADMIN_INVESTMENTS.FORM.PROPERTY_NOT_FOUND' | translate }}
          </p>
        </div>

        <div class="field">
          <label for="title">{{ 'ADMIN_INVESTMENTS.FORM.TITLE_FIELD' | translate }}</label>
          <input id="title" type="text" formControlName="title" maxlength="200" />
          <app-form-error [control]="form.controls.title" [submitted]="submitted()"></app-form-error>
        </div>

        <div class="field">
          <label for="description">{{ 'ADMIN_INVESTMENTS.FORM.DESCRIPTION' | translate }}</label>
          <textarea id="description" rows="5" formControlName="description" maxlength="8000"></textarea>
          <app-form-error [control]="form.controls.description" [submitted]="submitted()"></app-form-error>
        </div>

        <div class="field-row">
          <div class="field">
            <label for="projectType">{{ 'ADMIN_INVESTMENTS.FORM.PROJECT_TYPE' | translate }}</label>
            <select id="projectType" formControlName="projectType">
              <option *ngFor="let type of projectTypes" [value]="type">
                {{ ('INVESTMENTS.PROJECT_TYPE.' + type.toUpperCase()) | translate }}
              </option>
            </select>
          </div>

          <div class="field">
            <label for="currency">{{ 'ADMIN_INVESTMENTS.FORM.CURRENCY' | translate }}</label>
            <input id="currency" type="text" formControlName="currency" maxlength="3" />
            <app-form-error [control]="form.controls.currency" [submitted]="submitted()"></app-form-error>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn--outline" (click)="cancel()">
            {{ 'COMMON.CANCEL' | translate }}
          </button>
          <button type="submit" class="btn btn--primary" [disabled]="saving()">
            {{ saving() ? ('COMMON.SAVING' | translate) : ('ADMIN_INVESTMENTS.FORM.CREATE_SUBMIT' | translate) }}
          </button>
        </div>
      </form>
    </section>
  `,
  styles: [`
    .page { padding: clamp(1rem, 3vw, 2rem); max-width: 720px; margin: 0 auto; }
    .page-header h1 { margin:0 0 .3rem; color:var(--navy); font-family:var(--font-display); font-size:clamp(1.4rem,2.4vw,1.8rem); }
    .page-header p { margin:0 0 1.5rem; color:var(--gray-500); }

    .form { display:flex; flex-direction:column; gap:1.1rem; }
    .field { display:flex; flex-direction:column; gap:.35rem; }
    .field-row { display:flex; gap:1rem; }
    .field-row .field { flex: 1; }

    label { font-size:.85rem; font-weight:600; color:var(--gray-700); }
    input, select, textarea {
      /* 16px (لا .9rem) — أقل من 16px يُشغّل تكبير iOS Safari التلقائي عند التركيز،
         مؤكَّد حيّاً على نموذج إنشاء مشروع استثماري بمحاكي هاتف 360px. */
      border:1px solid var(--border); border-radius:var(--r-md); padding:.6rem .8rem;
      font-size:16px; background:var(--surface); font-family: inherit;
    }
    textarea { resize: vertical; }

    .property-lookup { display:flex; gap:.5rem; }
    .property-lookup input { flex: 1; }
    .property-preview { margin:.2rem 0 0; font-size:.85rem; color: var(--success, #16a34a); }
    .property-preview--error { color: var(--danger); }

    .form-actions { display:flex; justify-content:flex-end; gap:.75rem; margin-top:.5rem; }
    .btn { border-radius:var(--r-sm); padding:.55rem 1.1rem; font-size:.9rem; cursor:pointer; border:1px solid transparent; font-weight:600; }
    .btn--outline { background:var(--surface); border-color:var(--border); color:var(--navy); }
    .btn--primary { background: var(--primary); color: var(--on-primary); }
    .btn:disabled { opacity:.6; cursor:not-allowed; }
  `]
})
export class AdminInvestmentFormPage {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AdminInvestmentApiService);
  private readonly propertiesApi = inject(PropertyApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  readonly projectTypes = PROJECT_TYPES;
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly lookingUp = signal(false);
  readonly propertyPreview = signal<{ title: string; city: string } | null>(null);
  readonly propertyLookupError = signal(false);

  readonly form = this.fb.nonNullable.group({
    propertyId: ['', [Validators.required]],
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', [Validators.required, Validators.maxLength(8000)]],
    projectType: ['Residential' as InvestmentProjectType, [Validators.required]],
    currency: ['USD', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]]
  });

  lookupProperty(): void {
    const propertyId = this.form.controls.propertyId.value.trim();
    this.propertyPreview.set(null);
    this.propertyLookupError.set(false);

    if (!propertyId) {
      return;
    }

    this.lookingUp.set(true);
    this.propertiesApi.getProperty(propertyId).subscribe({
      next: property => {
        this.propertyPreview.set({ title: property.title, city: property.city });
        this.lookingUp.set(false);
      },
      error: () => {
        this.propertyLookupError.set(true);
        this.lookingUp.set(false);
      }
    });
  }

  submit(): void {
    this.submitted.set(true);

    if (this.form.invalid) {
      return;
    }

    this.saving.set(true);
    const value = this.form.getRawValue();

    this.api
      .createProject({
        propertyId: value.propertyId.trim(),
        title: value.title.trim(),
        description: value.description.trim(),
        projectType: value.projectType,
        currency: value.currency.toUpperCase()
      })
      .subscribe({
        next: result => {
          this.toast.success(this.translate.instant('ADMIN_INVESTMENTS.FORM.CREATE_SUCCESS'));
          this.saving.set(false);
          this.router.navigate(['/admin/investments', result.id]);
        },
        error: err => {
          this.toast.error(err?.error?.message || this.translate.instant('ADMIN_INVESTMENTS.FORM.CREATE_ERROR'));
          this.saving.set(false);
        }
      });
  }

  cancel(): void {
    this.router.navigate(['/admin/investments']);
  }
}
