// =============================================================
// src/app/features/investments/admin/admin-investment-detail/admin-investment-detail.page.ts
//
// Admin Investment Portal — the full project administration screen (Phase 2 §6). One scrolling
// page with clearly separated sections (matches this app's own admin-user-detail.page.ts
// convention rather than a routed-tab system): Overview/edit, Workflow, Financials, Risk,
// Documents, Updates. The backend remains authoritative for every transition — this page never
// assumes an action succeeded before the HTTP response confirms it, and every irreversible
// action (Reject/Suspend/Close) goes through a confirmation dialog naming the current state,
// the action, and its consequence (Phase 2 §13).
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminInvestmentApiService } from '../../../../core/api/admin-investment-api.service';
import { apiErrorText } from '../../../../core/api/api-error-text';
import {
  AdminInvestmentDocument,
  AdminInvestmentInterest,
  InvestmentDocumentType,
  InvestmentProjectReview,
  InvestmentProjectStatus,
  InvestmentProjectType,
  InvestmentRiskLevel,
  InvestmentUpdateItem,
  InvestmentUpdateType,
  InvestmentWorkflowAction
} from '../../../../core/models/investment.model';
import { ToastService } from '../../../../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/ui/loading-spinner.component';
import { FormErrorComponent } from '../../../../shared/ui/form-error.component';
import { ConfirmModalComponent } from '../../../../shared/ui/confirm-modal.component';
import { LocalizedDatePipe } from '../../../../shared/pipes/localized-date.pipe';
import { LocalizedNumberPipe } from '../../../../shared/pipes/localized-number.pipe';

const PROJECT_TYPES: InvestmentProjectType[] = [
  'Residential', 'Commercial', 'Mixed', 'Industrial', 'Land', 'Renovation', 'NewConstruction'
];
const RISK_LEVELS: InvestmentRiskLevel[] = ['Low', 'Medium', 'High', 'VeryHigh'];
const DOCUMENT_TYPES: InvestmentDocumentType[] = [
  'ProjectPlan', 'FinancialStatement', 'Valuation', 'LegalDocument', 'Permit', 'Prospectus', 'Other'
];
const UPDATE_TYPES: InvestmentUpdateType[] = [
  'General', 'ConstructionStarted', 'RenovationProgress', 'Milestone', 'FinancialUpdate'
];

/** Only the actions valid from the current status — the UI never offers an illegal transition,
 * though the backend enforces this independently regardless (Phase 2 §12/§21). */
const VALID_ACTIONS: Record<InvestmentProjectStatus, InvestmentWorkflowAction[]> = {
  Draft: ['submit-review'],
  UnderReview: ['approve', 'reject'],
  Approved: ['schedule'],
  Scheduled: ['publish'],
  Published: ['suspend', 'close'],
  Suspended: ['resume', 'close'],
  Closed: [],
  Rejected: ['submit-review']
};

/** Statuses where the raised amount can no longer be edited with the overview form (the API only edits Draft/Rejected)
 * but staff still keep the informational figure current (P10-D12). */
const PROGRESS_STATUSES: InvestmentProjectStatus[] = ['Approved', 'Scheduled', 'Published', 'Suspended'];

interface PendingWorkflowAction {
  action: InvestmentWorkflowAction;
  danger: boolean;
}

@Component({
  selector: 'app-admin-investment-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe, LocalizedNumberPipe,
    CommonModule, RouterModule, ReactiveFormsModule, FormsModule, TranslateModule,
    LoadingSpinnerComponent, FormErrorComponent, ConfirmModalComponent
  ],
  templateUrl: './admin-investment-detail.page.html',
  styleUrls: ['./admin-investment-detail.page.scss']
})
export class AdminInvestmentDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AdminInvestmentApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly projectId = this.route.snapshot.paramMap.get('id')!;

  readonly loading = signal(true);
  readonly review = signal<InvestmentProjectReview | null>(null);
  readonly documents = signal<AdminInvestmentDocument[]>([]);
  readonly updates = signal<InvestmentUpdateItem[]>([]);
  readonly interests = signal<AdminInvestmentInterest[]>([]);
  readonly interestsError = signal(false);
  readonly savingProgress = signal(false);
  progressRaisedAmount = 0;

  readonly projectTypes = PROJECT_TYPES;
  readonly riskLevels = RISK_LEVELS;
  readonly documentTypes = DOCUMENT_TYPES;
  readonly updateTypes = UPDATE_TYPES;

  readonly currentStatus = computed<InvestmentProjectStatus>(() => this.review()?.project.status ?? 'Draft');
  readonly availableActions = computed<InvestmentWorkflowAction[]>(() => VALID_ACTIONS[this.currentStatus()] ?? []);
  readonly canEditProgress = computed(() => PROGRESS_STATUSES.includes(this.currentStatus()));

  readonly overviewSubmitted = signal(false);
  readonly savingOverview = signal(false);
  readonly financialsSubmitted = signal(false);
  readonly savingFinancials = signal(false);
  readonly riskSubmitted = signal(false);
  readonly savingRisk = signal(false);
  readonly updateSubmitted = signal(false);
  readonly savingUpdate = signal(false);
  readonly uploadingDocument = signal(false);
  readonly togglingDocumentId = signal<string | null>(null);
  readonly deletingDocumentId = signal<string | null>(null);

  readonly pendingAction = signal<PendingWorkflowAction | null>(null);
  readonly workflowBusy = signal(false);
  rejectReason = '';
  scheduledPublishAt = '';

  selectedFile: File | null = null;
  selectedDocumentType: InvestmentDocumentType = 'ProjectPlan';
  documentIsPublic = false;

  /** Mirror of the API's plausible start-date window (P10-D09): 5 years back, 10 years ahead. */
  readonly startDateMin = AdminInvestmentDetailPage.isoDateFromToday(-5);
  readonly startDateMax = AdminInvestmentDetailPage.isoDateFromToday(10);

  private static isoDateFromToday(years: number): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() + years);
    return d.toISOString().slice(0, 10);
  }

  readonly overviewForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    shortDescription: ['', [Validators.maxLength(300)]],
    description: ['', [Validators.required, Validators.maxLength(8000)]],
    projectType: ['Residential' as InvestmentProjectType, [Validators.required]],
    targetAmount: [0, [Validators.required, Validators.min(0.01)]],
    minimumInvestment: [0, [Validators.required, Validators.min(0.01)]],
    maximumInvestment: [null as number | null],
    currency: ['USD', [Validators.required]],
    investmentTermMonths: [12, [Validators.required, Validators.min(1)]],
    expectedReturnMin: [0, [Validators.required, Validators.min(0)]],
    expectedReturnMax: [0, [Validators.required, Validators.min(0)]],
    startDate: [null as string | null],
    endDate: [null as string | null],
    raisedAmount: [0, [Validators.required, Validators.min(0)]]
  });

  readonly financialsForm = this.fb.nonNullable.group({
    purchasePrice: [0, [Validators.required, Validators.min(0)]],
    renovationCost: [0, [Validators.required, Validators.min(0)]],
    constructionCost: [0, [Validators.required, Validators.min(0)]],
    taxes: [0, [Validators.required, Validators.min(0)]],
    notaryCost: [0, [Validators.required, Validators.min(0)]],
    brokerCost: [0, [Validators.required, Validators.min(0)]],
    financingCost: [0, [Validators.required, Validators.min(0)]],
    operatingCost: [0, [Validators.required, Validators.min(0)]],
    contingencyReserve: [0, [Validators.required, Validators.min(0)]],
    expectedRevenue: [0, [Validators.required, Validators.min(0)]],
    expectedProfit: [0, [Validators.required, Validators.min(0)]]
  });

  readonly totalProjectCost = computed(() => {
    const v = this.financialsFormValue();
    return v.purchasePrice + v.renovationCost + v.constructionCost + v.taxes + v.notaryCost +
      v.brokerCost + v.financingCost + v.operatingCost + v.contingencyReserve;
  });
  private readonly financialsFormValue = signal(this.financialsForm.getRawValue());

  readonly riskForm = this.fb.nonNullable.group({
    riskLevel: ['Medium' as InvestmentRiskLevel, [Validators.required]],
    marketRisk: ['Medium' as InvestmentRiskLevel, [Validators.required]],
    liquidityRisk: ['Medium' as InvestmentRiskLevel, [Validators.required]],
    projectRisk: ['Medium' as InvestmentRiskLevel, [Validators.required]],
    financingRisk: ['Medium' as InvestmentRiskLevel, [Validators.required]],
    developerRisk: ['Medium' as InvestmentRiskLevel, [Validators.required]],
    riskScore: [50, [Validators.required, Validators.min(0), Validators.max(100)]],
    riskSummary: ['', [Validators.required, Validators.maxLength(2000)]]
  });

  readonly updateForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    content: ['', [Validators.required, Validators.maxLength(4000)]],
    updateType: ['General' as InvestmentUpdateType, [Validators.required]]
  });

  ngOnInit(): void {
    this.financialsForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.financialsFormValue.set(this.financialsForm.getRawValue()));

    this.loadAll();
  }

  loadAll(): void {
    this.loading.set(true);

    this.api.getProjectReview(this.projectId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: review => {
        this.review.set(review);
        this.hydrateOverviewForm(review);
        this.progressRaisedAmount = review.project.raisedAmount;
        if (review.financials) this.financialsForm.patchValue(review.financials);
        if (review.risk) this.riskForm.patchValue(review.risk);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error(this.translate.instant('ADMIN_INVESTMENTS.DETAIL.LOAD_ERROR'));
        this.loading.set(false);
      }
    });

    this.reloadDocuments();
    this.reloadInterests();
  }

  private reloadInterests(): void {
    this.api.getInterests(this.projectId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => {
        this.interests.set(list);
        this.interestsError.set(false);
      },
      error: () => this.interestsError.set(true)
    });
  }

  private hydrateOverviewForm(review: InvestmentProjectReview): void {
    const p = review.project;
    this.overviewForm.patchValue({
      title: p.title,
      shortDescription: p.shortDescription ?? '',
      description: p.description,
      projectType: p.projectType,
      targetAmount: p.targetAmount,
      minimumInvestment: p.minimumInvestment,
      maximumInvestment: p.maximumInvestment,
      currency: p.currency,
      investmentTermMonths: p.investmentTermMonths,
      expectedReturnMin: p.expectedReturnMin,
      expectedReturnMax: p.expectedReturnMax,
      startDate: p.startDate,
      endDate: p.endDate,
      raisedAmount: p.raisedAmount
    });
  }

  private reloadDocuments(): void {
    this.api.getAllDocuments(this.projectId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: docs => this.documents.set(docs),
      error: () => {}
    });
  }

  // ── Overview / edit ───────────────────────────────────────────

  saveOverview(): void {
    this.overviewSubmitted.set(true);
    if (this.overviewForm.invalid) return;

    this.savingOverview.set(true);
    this.api.updateProject(this.projectId, this.overviewForm.getRawValue()).subscribe({
      next: () => {
        this.toast.success(this.translate.instant('ADMIN_INVESTMENTS.DETAIL.SAVED'));
        this.savingOverview.set(false);
        this.loadAll();
      },
      error: err => {
        this.toast.error(apiErrorText(err) || this.translate.instant('ADMIN_INVESTMENTS.DETAIL.SAVE_ERROR'));
        this.savingOverview.set(false);
      }
    });
  }

  // ── Workflow ──────────────────────────────────────────────────

  requestAction(action: InvestmentWorkflowAction): void {
    const danger = action === 'reject' || action === 'suspend' || action === 'close';
    this.rejectReason = '';
    this.scheduledPublishAt = '';
    this.pendingAction.set({ action, danger });
  }

  cancelAction(): void {
    this.pendingAction.set(null);
  }

  confirmAction(): void {
    const pending = this.pendingAction();
    if (!pending) return;

    this.workflowBusy.set(true);
    const done = () => {
      this.workflowBusy.set(false);
      this.pendingAction.set(null);
      this.loadAll();
    };
    const fail = (err: unknown) => {
      this.workflowBusy.set(false);
      this.toast.error(apiErrorText(err) || this.translate.instant('ADMIN_INVESTMENTS.DETAIL.WORKFLOW_ERROR'));
    };

    switch (pending.action) {
      case 'submit-review':
        this.api.submitForReview(this.projectId).subscribe({ next: done, error: fail });
        break;
      case 'approve':
        this.api.approve(this.projectId).subscribe({ next: done, error: fail });
        break;
      case 'reject':
        this.api.reject(this.projectId, this.rejectReason.trim()).subscribe({ next: done, error: fail });
        break;
      case 'schedule':
        // datetime-local has no zone: send the instant in UTC so the server publishes at the time the admin meant.
        this.api.schedule(this.projectId, this.scheduledPublishAt ? new Date(this.scheduledPublishAt).toISOString() : null)
          .subscribe({ next: done, error: fail });
        break;
      case 'publish':
        this.api.publish(this.projectId).subscribe({ next: done, error: fail });
        break;
      case 'suspend':
        this.api.suspend(this.projectId).subscribe({ next: done, error: fail });
        break;
      case 'resume':
        this.api.resume(this.projectId).subscribe({ next: done, error: fail });
        break;
      case 'close':
        this.api.close(this.projectId).subscribe({ next: done, error: fail });
        break;
    }
  }

  actionLabelKey(action: InvestmentWorkflowAction): string {
    return `ADMIN_INVESTMENTS.WORKFLOW.ACTION_${action.toUpperCase().replace('-', '_')}`;
  }

  // ── Progress (after the editing stage) ────────────────────────

  saveProgress(): void {
    const value = Number(this.progressRaisedAmount);
    if (!Number.isFinite(value) || value < 0) {
      this.toast.error(this.translate.instant('ADMIN_INVESTMENTS.DETAIL.PROGRESS_ERROR'));
      return;
    }

    this.savingProgress.set(true);
    this.api.updateProgress(this.projectId, value).subscribe({
      next: () => {
        this.toast.success(this.translate.instant('ADMIN_INVESTMENTS.DETAIL.PROGRESS_SAVED'));
        this.savingProgress.set(false);
        this.loadAll();
      },
      error: err => {
        this.toast.error(apiErrorText(err) || this.translate.instant('ADMIN_INVESTMENTS.DETAIL.PROGRESS_ERROR'));
        this.savingProgress.set(false);
      }
    });
  }

  interestStatusKey(status: AdminInvestmentInterest['status']): string {
    return `ADMIN_INVESTMENTS.DETAIL.INTEREST_STATUS_${status.toUpperCase()}`;
  }

  trackByInterestId(_: number, item: AdminInvestmentInterest): string {
    return item.id;
  }

  // ── Financials ────────────────────────────────────────────────

  saveFinancials(): void {
    this.financialsSubmitted.set(true);
    if (this.financialsForm.invalid) return;

    this.savingFinancials.set(true);
    this.api.setFinancials(this.projectId, this.financialsForm.getRawValue()).subscribe({
      next: () => {
        this.toast.success(this.translate.instant('ADMIN_INVESTMENTS.DETAIL.SAVED'));
        this.savingFinancials.set(false);
        this.loadAll();
      },
      error: err => {
        this.toast.error(apiErrorText(err) || this.translate.instant('ADMIN_INVESTMENTS.DETAIL.SAVE_ERROR'));
        this.savingFinancials.set(false);
      }
    });
  }

  // ── Risk ──────────────────────────────────────────────────────

  saveRisk(): void {
    this.riskSubmitted.set(true);
    if (this.riskForm.invalid) return;

    this.savingRisk.set(true);
    this.api.setRisk(this.projectId, this.riskForm.getRawValue()).subscribe({
      next: () => {
        this.toast.success(this.translate.instant('ADMIN_INVESTMENTS.DETAIL.SAVED'));
        this.savingRisk.set(false);
        this.loadAll();
      },
      error: err => {
        this.toast.error(apiErrorText(err) || this.translate.instant('ADMIN_INVESTMENTS.DETAIL.SAVE_ERROR'));
        this.savingRisk.set(false);
      }
    });
  }

  // ── Documents ─────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
  }

  uploadDocument(): void {
    if (!this.selectedFile) return;

    this.uploadingDocument.set(true);
    this.api.uploadDocument(this.projectId, this.selectedFile, this.selectedDocumentType, this.documentIsPublic).subscribe({
      next: () => {
        this.toast.success(this.translate.instant('ADMIN_INVESTMENTS.DETAIL.DOCUMENT_UPLOADED'));
        this.uploadingDocument.set(false);
        this.selectedFile = null;
        this.reloadDocuments();
      },
      error: err => {
        this.toast.error(apiErrorText(err) || this.translate.instant('ADMIN_INVESTMENTS.DETAIL.UPLOAD_ERROR'));
        this.uploadingDocument.set(false);
      }
    });
  }

  toggleDocumentVisibility(doc: AdminInvestmentDocument): void {
    this.togglingDocumentId.set(doc.id);
    this.api.setDocumentVisibility(this.projectId, doc.id, !doc.isPublic).subscribe({
      next: () => {
        this.togglingDocumentId.set(null);
        this.reloadDocuments();
      },
      error: err => {
        this.toast.error(apiErrorText(err) || this.translate.instant('ADMIN_INVESTMENTS.DETAIL.VISIBILITY_ERROR'));
        this.togglingDocumentId.set(null);
      }
    });
  }

  deleteDocument(doc: AdminInvestmentDocument): void {
    const confirmed = confirm(this.translate.instant('ADMIN_INVESTMENTS.DETAIL.CONFIRM_DELETE_DOCUMENT', { name: doc.fileName }));
    if (!confirmed) return;

    this.deletingDocumentId.set(doc.id);
    this.api.removeDocument(this.projectId, doc.id).subscribe({
      next: () => {
        this.deletingDocumentId.set(null);
        this.reloadDocuments();
      },
      error: err => {
        this.toast.error(apiErrorText(err) || this.translate.instant('ADMIN_INVESTMENTS.DETAIL.DELETE_ERROR'));
        this.deletingDocumentId.set(null);
      }
    });
  }

  // ── Updates ───────────────────────────────────────────────────

  addUpdate(): void {
    this.updateSubmitted.set(true);
    if (this.updateForm.invalid) return;

    this.savingUpdate.set(true);
    this.api.addUpdate(this.projectId, this.updateForm.getRawValue()).subscribe({
      next: () => {
        this.toast.success(this.translate.instant('ADMIN_INVESTMENTS.DETAIL.UPDATE_ADDED'));
        this.savingUpdate.set(false);
        this.updateForm.reset({ title: '', content: '', updateType: 'General' });
        this.updateSubmitted.set(false);
      },
      error: err => {
        this.toast.error(apiErrorText(err) || this.translate.instant('ADMIN_INVESTMENTS.DETAIL.SAVE_ERROR'));
        this.savingUpdate.set(false);
      }
    });
  }

  trackByDocId(_: number, doc: AdminInvestmentDocument): string {
    return doc.id;
  }
}
