// =============================================================
// src/app/admin/geo/geo-admin.page.ts
//
// Administration of HudhudNest's own geographic catalog (API: /api/admin/locations/*).
// Five tabs: place requests (the review queue), places (browse and edit the hierarchy), policy (the
// street auto-approval rules), import (dry-run, commit, rollback) and the change log.
// Every change is logged by the server together with the reason typed here.
// The older page /admin/location-suggestions keeps serving the legacy district/neighborhood queue.
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { NgIf, NgFor, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';

import { LocationsApiService } from '../../core/api/locations-api.service';
import {
  GeoAdminLocation, GeoChange, GeoImportResult, GeoLocationType, GeoPolicy, GeoRequest, geoBreadcrumb, geoName
} from '../../core/models/geo-location.model';
import { ToastService } from '../../shared/services/toast.service';

type Tab = 'requests' | 'places' | 'policy' | 'import' | 'changes';

const NEXT_LEVEL: Partial<Record<GeoLocationType, GeoLocationType>> = {
  Country: 'Governorate', Governorate: 'City', City: 'District', District: 'Neighborhood', Neighborhood: 'Street'
};

@Component({
  selector: 'app-admin-geo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf, NgFor, DatePipe, DecimalPipe, FormsModule, TranslateModule],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>{{ 'ADMIN_GEO.TITLE' | translate }}</h1>
        <p>{{ 'ADMIN_GEO.SUBTITLE' | translate }}</p>
      </header>

      <div class="tabs" role="tablist">
        <button *ngFor="let t of tabs" type="button" role="tab" class="tab" [class.tab--on]="tab() === t"
                [attr.aria-selected]="tab() === t" (click)="openTab(t)">
          {{ 'ADMIN_GEO.TAB_' + t.toUpperCase() | translate }}
        </button>
      </div>

      <!-- ───────────── requests ───────────── -->
      <div *ngIf="tab() === 'requests'" class="panel">
        <div class="filters">
          <label>{{ 'ADMIN_GEO.STATUS' | translate }}
            <select [ngModel]="reqStatus()" (ngModelChange)="reqStatus.set($event); loadRequests()">
              <option value="">{{ 'ADMIN_GEO.ALL' | translate }}</option>
              <option *ngFor="let s of statuses" [value]="s">{{ 'ADMIN_GEO.STATUS_' + s.toUpperCase() | translate }}</option>
            </select>
          </label>
          <label>{{ 'ADMIN_GEO.TYPE' | translate }}
            <select [ngModel]="reqType()" (ngModelChange)="reqType.set($event); loadRequests()">
              <option value="">{{ 'ADMIN_GEO.ALL' | translate }}</option>
              <option *ngFor="let t of requestTypes" [value]="t">{{ 'ADMIN_GEO.TYPE_' + t.toUpperCase() | translate }}</option>
            </select>
          </label>
        </div>

        <p *ngIf="loading()" role="status">{{ 'COMMON.LOADING' | translate }}</p>
        <p *ngIf="!loading() && requests().length === 0" class="muted">{{ 'ADMIN_GEO.NO_REQUESTS' | translate }}</p>

        <ul class="list" *ngIf="requests().length > 0">
          <li *ngFor="let r of requests(); trackBy: trackReq" class="item" [class.item--on]="selectedRequest()?.id === r.id">
            <button type="button" class="item__main" (click)="pickRequest(r)">
              <strong>{{ r.proposedName }}</strong>
              <span class="chip">{{ 'ADMIN_GEO.TYPE_' + r.type.toUpperCase() | translate }}</span>
              <span class="chip chip--status">{{ 'ADMIN_GEO.STATUS_' + r.status.toUpperCase() | translate }}</span>
              <span class="muted">{{ crumb(r.parentPath) }}</span>
            </button>
          </li>
        </ul>

        <div class="detail" *ngIf="selectedRequest() as r">
          <h2>{{ r.proposedName }}</h2>
          <dl class="facts">
            <div><dt>{{ 'ADMIN_GEO.PARENT' | translate }}</dt><dd>{{ crumb(r.parentPath) }}</dd></div>
            <div><dt>{{ 'ADMIN_GEO.SOURCE' | translate }}</dt><dd>{{ r.source }}<span *ngIf="r.autoApproved"> · {{ 'ADMIN_GEO.AUTO' | translate }}</span></dd></div>
            <div *ngIf="r.confidenceScore !== null"><dt>{{ 'ADMIN_GEO.CONFIDENCE' | translate }}</dt><dd>{{ r.confidenceScore | number: '1.0-2' }}</dd></div>
            <div *ngIf="r.decisionReason"><dt>{{ 'ADMIN_GEO.DECISION_REASON' | translate }}</dt><dd>{{ r.decisionCode }} — {{ r.decisionReason }}</dd></div>
            <div *ngIf="r.latitude !== null"><dt>{{ 'ADMIN_GEO.COORDINATES' | translate }}</dt><dd dir="ltr">{{ r.latitude }}, {{ r.longitude }}</dd></div>
            <div><dt>{{ 'ADMIN_GEO.SUBMITTED_BY' | translate }}</dt><dd>{{ r.submittedByName || r.submittedByUserId }} · {{ r.createdAt | date: 'medium' }}</dd></div>
          </dl>

          <ng-container *ngIf="r.status === 'Pending' || r.status === 'NeedsCorrection'">
            <div class="grid3">
              <label>{{ 'ADMIN_GEO.NAME_AR' | translate }}<input type="text" [(ngModel)]="reviewNameAr" dir="rtl" /></label>
              <label>{{ 'ADMIN_GEO.NAME_EN' | translate }}<input type="text" [(ngModel)]="reviewNameEn" dir="ltr" /></label>
              <label>{{ 'ADMIN_GEO.NAME_DE' | translate }}<input type="text" [(ngModel)]="reviewNameDe" dir="ltr" /></label>
            </div>
            <label>{{ 'ADMIN_GEO.NOTES' | translate }}<textarea rows="2" [(ngModel)]="reviewNotes" maxlength="500"></textarea></label>
            <label>{{ 'ADMIN_GEO.DUPLICATE_OF' | translate }}
              <input type="number" min="1" [(ngModel)]="duplicateOfId" dir="ltr" class="narrow" />
            </label>
            <div class="actions">
              <button type="button" class="btn btn--primary" [disabled]="busy()" (click)="approveRequest(r)">{{ 'ADMIN_GEO.APPROVE' | translate }}</button>
              <button type="button" class="btn" [disabled]="busy()" (click)="needsCorrection(r)">{{ 'ADMIN_GEO.NEEDS_CORRECTION' | translate }}</button>
              <button type="button" class="btn" [disabled]="busy()" (click)="markDuplicate(r)">{{ 'ADMIN_GEO.MARK_DUPLICATE' | translate }}</button>
              <button type="button" class="btn btn--danger" [disabled]="busy()" (click)="rejectRequest(r)">{{ 'ADMIN_GEO.REJECT' | translate }}</button>
            </div>
          </ng-container>
          <p *ngIf="r.reviewNotes" class="muted">{{ 'ADMIN_GEO.NOTES' | translate }}: {{ r.reviewNotes }}</p>
        </div>
      </div>

      <!-- ───────────── places ───────────── -->
      <div *ngIf="tab() === 'places'" class="panel">
        <nav class="crumbs" aria-label="breadcrumb">
          <button type="button" class="link" (click)="browseRoot()">{{ 'ADMIN_GEO.ROOT' | translate }}</button>
          <ng-container *ngFor="let p of trail(); let i = index">
            › <button type="button" class="link" (click)="browseTo(i)">{{ name(p) }}</button>
          </ng-container>
        </nav>

        <div class="filters">
          <label>{{ 'ADMIN_GEO.SEARCH' | translate }}
            <input type="search" [(ngModel)]="placeQuery" (keyup.enter)="loadPlaces()" />
          </label>
          <label class="check"><input type="checkbox" [(ngModel)]="includeArchived" (change)="loadPlaces()" /> {{ 'ADMIN_GEO.INCLUDE_ARCHIVED' | translate }}</label>
          <button type="button" class="btn" (click)="loadPlaces()">{{ 'ADMIN_GEO.SEARCH' | translate }}</button>
        </div>

        <p *ngIf="loading()" role="status">{{ 'COMMON.LOADING' | translate }}</p>
        <p *ngIf="!loading() && places().length === 0" class="muted">{{ 'ADMIN_GEO.NO_PLACES' | translate }}</p>

        <ul class="list" *ngIf="places().length > 0">
          <li *ngFor="let p of places(); trackBy: trackPlace" class="item" [class.item--on]="selectedPlace()?.id === p.id" [class.item--off]="p.isArchived || !p.isActive">
            <button type="button" class="item__main" (click)="pickPlace(p)">
              <strong>{{ name(p) }}</strong>
              <span class="chip">{{ 'ADMIN_GEO.TYPE_' + p.type.toUpperCase() | translate }}</span>
              <span class="chip chip--status" *ngIf="p.approvalStatus !== 'Approved'">{{ p.approvalStatus }}</span>
              <span class="chip chip--status" *ngIf="p.isArchived">{{ 'ADMIN_GEO.ARCHIVED' | translate }}</span>
              <span class="chip chip--status" *ngIf="!p.isArchived && !p.isActive">{{ 'ADMIN_GEO.INACTIVE' | translate }}</span>
              <span class="muted">{{ p.childCount }} / {{ p.listingCount }}</span>
            </button>
            <button type="button" class="btn btn--small" *ngIf="p.childCount > 0 || nextLevel(p)" (click)="openPlace(p)">{{ 'ADMIN_GEO.OPEN' | translate }}</button>
          </li>
        </ul>
        <p class="muted small" *ngIf="places().length > 0">{{ 'ADMIN_GEO.COUNTS_HINT' | translate }}</p>

        <div class="detail" *ngIf="selectedPlace() as p">
          <h2>{{ name(p) }} <span class="muted small" dir="ltr">#{{ p.id }}</span></h2>
          <p class="muted">{{ crumb(p.path) }} · {{ p.source }} · {{ p.verificationStatus }}<span *ngIf="p.autoApproved"> · {{ 'ADMIN_GEO.AUTO' | translate }}</span></p>

          <div class="grid3">
            <label>{{ 'ADMIN_GEO.NAME_AR' | translate }}<input type="text" [(ngModel)]="editNameAr" dir="rtl" /></label>
            <label>{{ 'ADMIN_GEO.NAME_EN' | translate }}<input type="text" [(ngModel)]="editNameEn" dir="ltr" /></label>
            <label>{{ 'ADMIN_GEO.NAME_DE' | translate }}<input type="text" [(ngModel)]="editNameDe" dir="ltr" /></label>
          </div>
          <div class="grid3">
            <label>{{ 'ADMIN_GEO.LATITUDE' | translate }}<input type="number" step="any" [(ngModel)]="editLat" dir="ltr" /></label>
            <label>{{ 'ADMIN_GEO.LONGITUDE' | translate }}<input type="number" step="any" [(ngModel)]="editLng" dir="ltr" /></label>
            <label>{{ 'ADMIN_GEO.VERIFICATION' | translate }}
              <select [(ngModel)]="editVerification">
                <option *ngFor="let v of verifications" [value]="v">{{ v }}</option>
              </select>
            </label>
          </div>
          <label>{{ 'ADMIN_GEO.REASON' | translate }}<input type="text" [(ngModel)]="reason" maxlength="300" /></label>
          <div class="actions">
            <button type="button" class="btn btn--primary" [disabled]="busy()" (click)="savePlace(p)">{{ 'COMMON.SAVE' | translate }}</button>
            <button type="button" class="btn" [disabled]="busy()" (click)="toggleActive(p)">{{ (p.isActive ? 'ADMIN_GEO.DEACTIVATE' : 'ADMIN_GEO.ACTIVATE') | translate }}</button>
            <button type="button" class="btn btn--danger" [disabled]="busy()" (click)="toggleArchived(p)">{{ (p.isArchived ? 'ADMIN_GEO.RESTORE' : 'ADMIN_GEO.ARCHIVE') | translate }}</button>
          </div>

          <h3>{{ 'ADMIN_GEO.ALIASES' | translate }}</h3>
          <ul class="aliases">
            <li *ngFor="let a of p.aliases">{{ a }} <button type="button" class="link" [attr.aria-label]="'ADMIN_GEO.REMOVE_ALIAS' | translate" (click)="removeAlias(p, a)">✕</button></li>
          </ul>
          <div class="inline">
            <input type="text" [(ngModel)]="newAlias" [attr.aria-label]="'ADMIN_GEO.ALIASES' | translate" maxlength="150" />
            <button type="button" class="btn" [disabled]="busy() || !newAlias.trim()" (click)="addAlias(p)">{{ 'ADMIN_GEO.ADD_ALIAS' | translate }}</button>
          </div>

          <h3>{{ 'ADMIN_GEO.MERGE' | translate }}</h3>
          <p class="muted small">{{ 'ADMIN_GEO.MERGE_HINT' | translate }}</p>
          <div class="inline">
            <input type="number" min="1" [(ngModel)]="mergeTargetId" dir="ltr" class="narrow" [attr.aria-label]="'ADMIN_GEO.MERGE_TARGET' | translate" />
            <button type="button" class="btn btn--danger" [disabled]="busy() || !mergeTargetId" (click)="merge(p)">{{ 'ADMIN_GEO.MERGE_ACTION' | translate }}</button>
          </div>

          <ng-container *ngIf="nextLevel(p) as child">
            <h3>{{ 'ADMIN_GEO.ADD_CHILD' | translate: { type: ('ADMIN_GEO.TYPE_' + child.toUpperCase() | translate) } }}</h3>
            <div class="grid3">
              <label>{{ 'ADMIN_GEO.NAME_AR' | translate }}<input type="text" [(ngModel)]="childNameAr" dir="rtl" /></label>
              <label>{{ 'ADMIN_GEO.NAME_EN' | translate }}<input type="text" [(ngModel)]="childNameEn" dir="ltr" /></label>
              <label>{{ 'ADMIN_GEO.NAME_DE' | translate }}<input type="text" [(ngModel)]="childNameDe" dir="ltr" /></label>
            </div>
            <button type="button" class="btn btn--primary" [disabled]="busy() || !childNameAr.trim() || !childNameEn.trim()" (click)="createChild(p, child)">{{ 'ADMIN_GEO.CREATE' | translate }}</button>
          </ng-container>

          <button type="button" class="link" (click)="showChangesFor(p)">{{ 'ADMIN_GEO.SHOW_CHANGES' | translate }}</button>
        </div>
      </div>

      <!-- ───────────── policy ───────────── -->
      <div *ngIf="tab() === 'policy'" class="panel">
        <p class="muted">{{ 'ADMIN_GEO.POLICY_HINT' | translate }}</p>
        <ng-container *ngIf="policy() as pol">
          <label class="check"><input type="checkbox" [(ngModel)]="pol.streetAutoApprovalEnabled" /> {{ 'ADMIN_GEO.POLICY_AUTO' | translate }}</label>
          <label class="check"><input type="checkbox" [(ngModel)]="pol.externalLookupEnabled" /> {{ 'ADMIN_GEO.POLICY_EXTERNAL' | translate }}</label>
          <div class="grid3">
            <label>{{ 'ADMIN_GEO.POLICY_MIN_SCORE' | translate }}<input type="number" step="0.01" min="0" max="1" [(ngModel)]="pol.streetAutoApprovalMinScore" dir="ltr" /></label>
            <label>{{ 'ADMIN_GEO.POLICY_DUPLICATE' | translate }}<input type="number" step="0.01" min="0" max="1" [(ngModel)]="pol.fuzzyDuplicateThreshold" dir="ltr" /></label>
            <label>{{ 'ADMIN_GEO.POLICY_MAX_PER_DAY' | translate }}<input type="number" step="1" min="0" [(ngModel)]="pol.maxAutoApprovalsPerUserPerDay" dir="ltr" /></label>
          </div>
          <p class="muted small">{{ 'ADMIN_GEO.POLICY_ONLY_STREETS' | translate }}</p>
          <button type="button" class="btn btn--primary" [disabled]="busy()" (click)="savePolicy(pol)">{{ 'COMMON.SAVE' | translate }}</button>
        </ng-container>
      </div>

      <!-- ───────────── import ───────────── -->
      <div *ngIf="tab() === 'import'" class="panel">
        <p class="muted">{{ 'ADMIN_GEO.IMPORT_HINT' | translate }}</p>
        <div class="grid3">
          <label>{{ 'ADMIN_GEO.IMPORT_NAME' | translate }}<input type="text" [(ngModel)]="importName" /></label>
          <label>{{ 'ADMIN_GEO.IMPORT_SOURCE' | translate }}<input type="text" [(ngModel)]="importSource" /></label>
          <label>{{ 'ADMIN_GEO.IMPORT_LICENSE' | translate }}<input type="text" [(ngModel)]="importLicense" /></label>
        </div>
        <label>{{ 'ADMIN_GEO.IMPORT_ROWS' | translate }}
          <textarea rows="8" [(ngModel)]="importJson" dir="ltr" spellcheck="false" placeholder='[{"key":"d1","type":"District","parentLocationId":12,"nameAr":"…","nameEn":"…"}]'></textarea>
        </label>
        <div class="actions">
          <button type="button" class="btn" [disabled]="busy()" (click)="runImport(true)">{{ 'ADMIN_GEO.IMPORT_DRY_RUN' | translate }}</button>
          <button type="button" class="btn btn--primary" [disabled]="busy()" (click)="runImport(false)">{{ 'ADMIN_GEO.IMPORT_STAGE' | translate }}</button>
        </div>
        <div class="detail" *ngIf="importResult() as res">
          <p><strong>{{ res.rowsStaged }}</strong> / {{ res.rowsTotal }} · {{ 'ADMIN_GEO.IMPORT_SKIPPED' | translate }}: {{ res.rowsSkipped }}
            <span *ngIf="res.dryRun" class="chip">{{ 'ADMIN_GEO.IMPORT_DRY_RUN' | translate }}</span></p>
          <ul class="issues"><li *ngFor="let i of res.issues">{{ i.key }} — {{ i.code }}: {{ i.message }}</li></ul>
          <div class="actions" *ngIf="res.batchId">
            <button type="button" class="btn btn--primary" [disabled]="busy()" (click)="commitImport(res.batchId)">{{ 'ADMIN_GEO.IMPORT_COMMIT' | translate }}</button>
            <button type="button" class="btn btn--danger" [disabled]="busy()" (click)="rollbackImport(res.batchId)">{{ 'ADMIN_GEO.IMPORT_ROLLBACK' | translate }}</button>
          </div>
        </div>
      </div>

      <!-- ───────────── changes ───────────── -->
      <div *ngIf="tab() === 'changes'" class="panel">
        <p class="muted" *ngIf="changesFor() as f">{{ 'ADMIN_GEO.CHANGES_OF' | translate: { name: name(f) } }}
          <button type="button" class="link" (click)="showChangesFor(null)">{{ 'ADMIN_GEO.ALL' | translate }}</button></p>
        <p *ngIf="loading()" role="status">{{ 'COMMON.LOADING' | translate }}</p>
        <p *ngIf="!loading() && changes().length === 0" class="muted">{{ 'ADMIN_GEO.NO_CHANGES' | translate }}</p>
        <ul class="list">
          <li *ngFor="let c of changes()" class="item">
            <span class="item__main"><strong>{{ c.action }}</strong> <span class="muted" dir="ltr">#{{ c.locationId }}</span>
              <span class="muted">{{ c.at | date: 'medium' }}</span>
              <span *ngIf="c.reason">— {{ c.reason }}</span></span>
          </li>
        </ul>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: clamp(1rem, 3vw, 2rem); max-width: 1100px; margin: 0 auto; }
    .page-header h1 { margin: 0 0 .3rem; color: var(--text-strong); font-family: var(--font-display); font-size: clamp(1.5rem, 2.6vw, 2rem); }
    .page-header p { margin: 0 0 1rem; color: var(--gray-500); }
    .tabs { display: flex; gap: .25rem; flex-wrap: wrap; border-bottom: 1px solid var(--border); margin-bottom: 1rem; }
    .tab { background: none; border: 0; border-bottom: 3px solid transparent; padding: .6rem .9rem; cursor: pointer; font-weight: 600; color: var(--text-muted); }
    .tab--on { color: var(--text-strong); border-bottom-color: var(--primary); }
    .panel { display: flex; flex-direction: column; gap: .75rem; }
    .filters { display: flex; gap: .75rem; flex-wrap: wrap; align-items: flex-end; }
    label { display: flex; flex-direction: column; gap: .25rem; font-size: var(--text-sm); color: var(--gray-500); font-weight: 600; }
    label.check { flex-direction: row; align-items: center; gap: .5rem; }
    input[type=text], input[type=number], input[type=search], select, textarea {
      font-size: 16px; padding: .45rem .6rem; border: 1px solid var(--border); border-radius: var(--r-sm);
      background: var(--surface); color: var(--text-strong); min-width: 0;
    }
    .narrow { max-width: 10rem; }
    .grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .4rem; }
    .item { display: flex; gap: .5rem; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); padding: .4rem .6rem; }
    .item--on { border-color: var(--primary); }
    .item--off { opacity: .65; }
    .item__main { flex: 1; display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; background: none; border: 0; text-align: start; cursor: pointer; color: inherit; padding: .25rem; }
    .chip { background: var(--gold-soft); color: var(--text-strong); border-radius: var(--r-pill); padding: .1rem .55rem; font-size: var(--text-xs); font-weight: 600; }
    .chip--status { background: var(--surface-2, var(--gold-soft)); }
    .muted { color: var(--text-muted); }
    .small { font-size: var(--text-xs); }
    .detail { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); padding: 1rem; display: flex; flex-direction: column; gap: .6rem; }
    .detail h2, .detail h3 { margin: .25rem 0 0; color: var(--text-strong); }
    .detail h2 { font-size: 1.2rem; } .detail h3 { font-size: 1rem; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: .5rem 1rem; margin: 0; }
    .facts dt { font-size: var(--text-xs); color: var(--gray-500); font-weight: 600; }
    .facts dd { margin: 0; }
    .actions, .inline { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
    .btn { border-radius: var(--r-sm); padding: .45rem .8rem; font-size: var(--text-sm); cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--text-strong); }
    .btn--small { padding: .25rem .6rem; }
    .btn--primary { background: var(--primary); color: var(--on-primary); border-color: transparent; }
    .btn--danger { background: var(--danger-soft); color: var(--danger-text); border-color: rgba(220, 38, 38, .2); }
    .btn:disabled { opacity: .6; cursor: not-allowed; }
    .link { background: none; border: 0; color: var(--primary-text); cursor: pointer; font-weight: 600; padding: 0 .15rem; }
    .crumbs { display: flex; flex-wrap: wrap; gap: .25rem; align-items: center; }
    .aliases { list-style: none; margin: 0; padding: 0; display: flex; gap: .4rem; flex-wrap: wrap; }
    .aliases li { background: var(--gold-soft); border-radius: var(--r-pill); padding: .1rem .6rem; }
    .issues { margin: 0; padding-inline-start: 1.1rem; color: var(--danger-text); }
    @media (max-width: 720px) { .grid3 { grid-template-columns: 1fr; } }
  `]
})
export class AdminGeoPage implements OnInit {
  private readonly api = inject(LocationsApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tabs: Tab[] = ['requests', 'places', 'policy', 'import', 'changes'];
  readonly statuses = ['Pending', 'NeedsCorrection', 'Approved', 'Rejected', 'Duplicate'];
  readonly requestTypes: GeoLocationType[] = ['City', 'District', 'Neighborhood', 'Street'];
  readonly verifications = ['Unverified', 'Verified', 'Rejected'];

  readonly tab = signal<Tab>('requests');
  readonly loading = signal(false);
  readonly busy = signal(false);

  // requests
  readonly requests = signal<GeoRequest[]>([]);
  readonly reqStatus = signal('Pending');
  readonly reqType = signal('');
  readonly selectedRequest = signal<GeoRequest | null>(null);
  reviewNameAr = ''; reviewNameEn = ''; reviewNameDe = ''; reviewNotes = '';
  duplicateOfId: number | null = null;

  // places
  readonly places = signal<GeoAdminLocation[]>([]);
  readonly trail = signal<GeoAdminLocation[]>([]);
  readonly selectedPlace = signal<GeoAdminLocation | null>(null);
  placeQuery = ''; includeArchived = false;
  editNameAr = ''; editNameEn = ''; editNameDe = ''; editVerification = 'Unverified';
  editLat: number | null = null; editLng: number | null = null;
  reason = ''; newAlias = ''; mergeTargetId: number | null = null;
  childNameAr = ''; childNameEn = ''; childNameDe = '';

  // policy / import / changes
  readonly policy = signal<GeoPolicy | null>(null);
  readonly importResult = signal<GeoImportResult | null>(null);
  importName = ''; importSource = ''; importLicense = ''; importJson = '';
  readonly changes = signal<GeoChange[]>([]);
  readonly changesFor = signal<GeoAdminLocation | null>(null);

  private get lang(): string { return this.translate.currentLang || this.translate.defaultLang || 'ar'; }

  ngOnInit(): void { this.loadRequests(); }

  name(item: { nameAr: string; nameEn: string; nameDe?: string | null }): string { return geoName(item, this.lang); }
  crumb(path: GeoRequest['parentPath']): string { return geoBreadcrumb(path, this.lang); }
  nextLevel(p: GeoAdminLocation): GeoLocationType | null { return NEXT_LEVEL[p.type] ?? null; }
  trackReq(_: number, r: GeoRequest): string { return r.id; }
  trackPlace(_: number, p: GeoAdminLocation): number { return p.id; }

  openTab(t: Tab): void {
    this.tab.set(t);
    if (t === 'requests') this.loadRequests();
    if (t === 'places' && this.places().length === 0) this.loadPlaces();
    if (t === 'policy' && !this.policy()) this.loadPolicy();
    if (t === 'changes') this.loadChanges();
  }

  // ── requests ──────────────────────────────────────────────────────────────────────────────────

  loadRequests(): void {
    this.loading.set(true);
    this.run(this.api.adminRequests(this.reqStatus() || null, this.reqType() || null), res => {
      this.requests.set(res.items);
      const current = this.selectedRequest();
      if (current && !res.items.some(r => r.id === current.id)) this.selectedRequest.set(null);
      this.loading.set(false);
    }, () => this.loading.set(false));
  }

  pickRequest(r: GeoRequest): void {
    this.selectedRequest.set(r);
    this.reviewNameAr = r.proposedNameAr ?? r.proposedName;
    this.reviewNameEn = r.proposedNameEn ?? '';
    this.reviewNameDe = r.proposedNameDe ?? '';
    this.reviewNotes = '';
    this.duplicateOfId = r.duplicateOfLocationId;
  }

  approveRequest(r: GeoRequest): void {
    this.decide(this.api.approveRequest(r.id, {
      notes: this.reviewNotes || undefined, nameAr: this.reviewNameAr || undefined,
      nameEn: this.reviewNameEn || undefined, nameDe: this.reviewNameDe || undefined
    }), 'ADMIN_GEO.APPROVED');
  }
  rejectRequest(r: GeoRequest): void { this.decide(this.api.rejectRequest(r.id, this.reviewNotes || undefined), 'ADMIN_GEO.REJECTED'); }
  needsCorrection(r: GeoRequest): void { this.decide(this.api.needsCorrection(r.id, this.reviewNotes || undefined), 'ADMIN_GEO.CORRECTION_ASKED'); }
  markDuplicate(r: GeoRequest): void { this.decide(this.api.markDuplicate(r.id, this.duplicateOfId, this.reviewNotes || undefined), 'ADMIN_GEO.MARKED_DUPLICATE'); }

  private decide(call: Observable<unknown>, doneKey: string): void {
    this.busy.set(true);
    this.run(call, () => {
      this.toast.success(this.translate.instant(doneKey));
      this.busy.set(false);
      this.selectedRequest.set(null);
      this.loadRequests();
    }, () => this.busy.set(false));
  }

  // ── places ────────────────────────────────────────────────────────────────────────────────────

  loadPlaces(): void {
    this.loading.set(true);
    const parent = this.trail().at(-1) ?? null;
    this.run(this.api.adminList({
      parentId: parent?.id ?? null, type: parent ? null : 'Governorate', q: this.placeQuery, includeArchived: this.includeArchived
    }), res => { this.places.set(res.items); this.loading.set(false); }, () => this.loading.set(false));
  }

  browseRoot(): void { this.trail.set([]); this.selectedPlace.set(null); this.loadPlaces(); }
  browseTo(index: number): void { this.trail.update(t => t.slice(0, index + 1)); this.selectedPlace.set(null); this.loadPlaces(); }
  openPlace(p: GeoAdminLocation): void { this.trail.update(t => [...t, p]); this.pickPlace(p); this.placeQuery = ''; this.loadPlaces(); }

  pickPlace(p: GeoAdminLocation): void {
    this.selectedPlace.set(p);
    this.editNameAr = p.nameAr; this.editNameEn = p.nameEn; this.editNameDe = p.nameDe ?? '';
    this.editLat = p.latitude; this.editLng = p.longitude; this.editVerification = p.verificationStatus;
    this.reason = ''; this.newAlias = ''; this.mergeTargetId = null;
    this.childNameAr = ''; this.childNameEn = ''; this.childNameDe = '';
  }

  savePlace(p: GeoAdminLocation): void {
    const hasCoords = this.editLat !== null && this.editLng !== null;
    this.mutatePlace(this.api.adminUpdate(p.id, {
      nameAr: this.editNameAr.trim(), nameEn: this.editNameEn.trim(), nameDe: this.editNameDe.trim() || null,
      latitude: hasCoords ? this.editLat : null, longitude: hasCoords ? this.editLng : null,
      clearCoordinates: !hasCoords, verificationStatus: this.editVerification, reason: this.reason || null
    }));
  }
  toggleActive(p: GeoAdminLocation): void { this.mutatePlace(this.api.setActive(p.id, !p.isActive, this.reason || undefined)); }
  toggleArchived(p: GeoAdminLocation): void { this.mutatePlace(this.api.setArchived(p.id, !p.isArchived, this.reason || undefined)); }
  addAlias(p: GeoAdminLocation): void { this.mutatePlace(this.api.addAlias(p.id, this.newAlias.trim())); }
  removeAlias(p: GeoAdminLocation, alias: string): void { this.mutatePlace(this.api.removeAlias(p.id, alias)); }

  createChild(parent: GeoAdminLocation, type: GeoLocationType): void {
    this.busy.set(true);
    this.run(this.api.adminCreate({
      type, parentLocationId: parent.id, nameAr: this.childNameAr.trim(), nameEn: this.childNameEn.trim(),
      nameDe: this.childNameDe.trim() || null, reason: this.reason || null
    }), () => {
      this.toast.success(this.translate.instant('ADMIN_GEO.SAVED'));
      this.busy.set(false);
      this.childNameAr = this.childNameEn = this.childNameDe = '';
      this.loadPlaces();
    }, () => this.busy.set(false));
  }

  merge(source: GeoAdminLocation): void {
    if (!this.mergeTargetId) return;
    if (!confirm(this.translate.instant('ADMIN_GEO.MERGE_CONFIRM', { source: this.name(source), target: this.mergeTargetId }))) return;
    this.busy.set(true);
    this.run(this.api.merge(source.id, this.mergeTargetId, this.reason || undefined), res => {
      this.toast.success(this.translate.instant('ADMIN_GEO.MERGED', { children: res.childrenMoved, listings: res.listingsMoved }));
      this.busy.set(false);
      this.selectedPlace.set(null);
      this.loadPlaces();
    }, () => this.busy.set(false));
  }

  private mutatePlace(call: Observable<GeoAdminLocation>): void {
    this.busy.set(true);
    this.run(call, updated => {
      this.toast.success(this.translate.instant('ADMIN_GEO.SAVED'));
      this.busy.set(false);
      this.places.update(list => list.map(p => (p.id === updated.id ? updated : p)));
      this.pickPlace(updated);
    }, () => this.busy.set(false));
  }

  // ── policy ────────────────────────────────────────────────────────────────────────────────────

  loadPolicy(): void {
    this.run(this.api.getPolicy(), p => this.policy.set({ ...p }));
  }

  savePolicy(policy: GeoPolicy): void {
    this.busy.set(true);
    this.run(this.api.updatePolicy(policy), saved => {
      this.policy.set({ ...saved });
      this.toast.success(this.translate.instant('ADMIN_GEO.SAVED'));
      this.busy.set(false);
    }, () => this.busy.set(false));
  }

  // ── import ────────────────────────────────────────────────────────────────────────────────────

  runImport(dryRun: boolean): void {
    let rows;
    try {
      rows = JSON.parse(this.importJson);
      if (!Array.isArray(rows)) throw new Error('not an array');
    } catch {
      this.toast.error(this.translate.instant('ADMIN_GEO.IMPORT_BAD_JSON'));
      return;
    }
    this.busy.set(true);
    this.run(this.api.importRows({
      name: this.importName.trim(), source: this.importSource.trim(), license: this.importLicense.trim(), dryRun, rows
    }), res => { this.importResult.set(res); this.busy.set(false); }, () => this.busy.set(false));
  }

  commitImport(batchId: string): void {
    this.busy.set(true);
    this.run(this.api.commitImport(batchId), res => {
      this.toast.success(this.translate.instant('ADMIN_GEO.IMPORT_COMMITTED', { count: res.committed }));
      this.importResult.set(null);
      this.busy.set(false);
    }, () => this.busy.set(false));
  }

  rollbackImport(batchId: string): void {
    if (!confirm(this.translate.instant('ADMIN_GEO.IMPORT_ROLLBACK_CONFIRM'))) return;
    this.busy.set(true);
    this.run(this.api.rollbackImport(batchId), res => {
      this.toast.success(this.translate.instant('ADMIN_GEO.IMPORT_ROLLED_BACK', { count: res.rolledBack }));
      this.importResult.set(null);
      this.busy.set(false);
    }, () => this.busy.set(false));
  }

  // ── changes ───────────────────────────────────────────────────────────────────────────────────

  showChangesFor(place: GeoAdminLocation | null): void {
    this.changesFor.set(place);
    this.tab.set('changes');
    this.loadChanges();
  }

  loadChanges(): void {
    this.loading.set(true);
    this.run(this.api.changes(this.changesFor()?.id ?? null), list => { this.changes.set(list); this.loading.set(false); }, () => this.loading.set(false));
  }

  // ── plumbing ──────────────────────────────────────────────────────────────────────────────────

  /** Subscribes; failures show the server's message through the global error toast, `onError` only resets local state. */
  private run<T>(source: Observable<T>, next: (value: T) => void, onError?: () => void): void {
    source.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next, error: () => onError?.() });
  }
}
