// =============================================================
// src/app/admin/social-distribution/admin-social-distribution.page.ts
//
// إدارة النشر التلقائي على وسائل التواصل الاجتماعي (SocialDistribution bounded context):
// القنوات، الحسابات (بما فيها ربط/فصل بيانات الاعتماد الفعلية)، ملخص لوحة التحكم، قائمة
// المنشورات، قواعد التوزيع (إنشاء/تعديل/تفعيل/تعطيل/أرشفة)، وDead Letters (حلّ/إعادة إدراج).
// توليد الأصول عمداً خارج هذه الصفحة حتى يُطلَب. صفحة عربية بالكامل بلا i18n، كبقية صفحات الإدارة.
// =============================================================

import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  AdminSocialDistributionService,
  DistributionRuleDto,
  SocialAccountDto,
  SocialAccountStatus,
  SocialAccountType,
  SocialChannelDto,
  SocialChannelStatus,
  SocialDashboardSummaryDto,
  SocialListingType,
  SocialPlatform,
  SocialPublicationDeadLetterDto,
  SocialPublicationDto,
  SocialPublicationStatus,
  SocialPublisherInfoDto,
} from '../../core/api/admin-social-distribution.service';
import { LookupsApiService, PropertyTypeLookup, StructuredLocationLookup } from '../../core/api/lookups-api.service';
import { PagedResult } from '../../core/models/api.model';
import { ToastService } from '../../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ConfirmModalComponent } from '../../shared/ui/confirm-modal.component';

type AdminTab = 'dashboard' | 'channels' | 'accounts' | 'publications' | 'rules' | 'deadLetters';
type DeadLetterView = 'unresolved' | 'resolved' | 'all';

const PLATFORMS: SocialPlatform[] = ['Facebook', 'Instagram', 'Telegram', 'TikTok', 'YouTube', 'LinkedIn'];
const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  Facebook: 'فيسبوك',
  Instagram: 'إنستغرام',
  Telegram: 'تيليغرام',
  TikTok: 'تيك توك',
  YouTube: 'يوتيوب',
  LinkedIn: 'لينكد إن',
};

const ACCOUNT_TYPES: SocialAccountType[] = ['Page', 'Profile', 'Channel', 'BusinessAccount', 'Group', 'Organization', 'Other'];
const ACCOUNT_TYPE_LABELS: Record<SocialAccountType, string> = {
  Page: 'صفحة',
  Profile: 'حساب شخصي',
  Channel: 'قناة',
  BusinessAccount: 'حساب أعمال',
  Group: 'مجموعة',
  Organization: 'منظمة',
  Other: 'أخرى',
};

const ACCOUNT_STATUS_LABELS: Record<SocialAccountStatus, string> = {
  PendingAuthorization: 'بانتظار الربط',
  Active: 'مُفعَّل',
  Inactive: 'معطَّل',
  Disconnected: 'غير مربوط',
  Suspended: 'موقوف من المنصة',
  Expired: 'منتهي الصلاحية',
};

const CHANNEL_STATUS_LABELS: Record<SocialChannelStatus, string> = {
  Active: 'مُفعَّلة',
  Inactive: 'معطَّلة',
  Deprecated: 'متوقفة نهائياً',
};

const LISTING_TYPE_LABELS: Record<SocialListingType, string> = {
  ForRent: 'إيجار',
  ForSale: 'بيع',
  ForRentAndSale: 'بيع أو إيجار',
};

/** تلميحات عربية لأكثر رموز الخطأ تكراراً — الرمز الخام يبقى ظاهراً دائماً بجانبها. */
const ERROR_CODE_HINTS: Record<string, string> = {
  InvalidCredentials: 'رمز الاعتماد مرفوض — أعد ربط الحساب برمز جديد',
  PermissionDenied: 'لا صلاحية على القناة/الصفحة — تحقق من صلاحيات البوت أو التطبيق',
  RateLimited: 'تجاوز حد المعدّل لدى المنصة',
  InvalidContent: 'المنصة رفضت محتوى المنشور',
  PlatformNotConfigured: 'المنصة غير مُعدّة على الخادم (لا رمز اعتماد عام)',
  AmbiguousOutcome: 'نتيجة غير مؤكدة بعد انقطاع العامل — تحقق من المنصة يدوياً قبل إعادة الإدراج',
  PropertyNotPublic: 'العقار لم يعد منشوراً للعامة',
};

const PUBLICATION_STATUS_LABELS: Record<SocialPublicationStatus, string> = {
  Draft: 'مسودة',
  Queued: 'في الطابور',
  Publishing: 'قيد النشر',
  Published: 'مَنشور',
  Failed: 'فشل',
  Retrying: 'إعادة محاولة',
  Cancelled: 'مُلغى',
};

@Component({
  selector: 'app-admin-social-distribution',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, LoadingSpinnerComponent, EmptyStateComponent, ConfirmModalComponent],
  templateUrl: './admin-social-distribution.page.html',
  styleUrl: './admin-social-distribution.page.scss',
})
export class AdminSocialDistributionPage implements OnInit {
  private readonly api = inject(AdminSocialDistributionService);
  private readonly lookups = inject(LookupsApiService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly platforms = PLATFORMS;
  readonly accountTypes = ACCOUNT_TYPES;
  readonly accountStatuses: SocialAccountStatus[] = ['PendingAuthorization', 'Active', 'Inactive', 'Disconnected', 'Suspended', 'Expired'];

  readonly activeTab = signal<AdminTab>('dashboard');
  readonly listingTypes: SocialListingType[] = ['ForRent', 'ForSale', 'ForRentAndSale'];

  /** المنصات وهل لها ناشر حقيقي فعلاً — فارغة حتى تُحمَّل (عندها لا نحجب أي منصة). */
  readonly publishers = signal<SocialPublisherInfoDto[]>([]);

  readonly governorates = signal<StructuredLocationLookup[]>([]);

  // ── Dashboard ──────────────────────────────────────────────
  readonly summary = signal<SocialDashboardSummaryDto | null>(null);
  readonly summaryLoading = signal(false);

  // ── Channels ───────────────────────────────────────────────
  readonly channels = signal<SocialChannelDto[]>([]);
  readonly channelsLoading = signal(false);
  readonly showChannelForm = signal(false);
  readonly savingChannel = signal(false);
  readonly channelActionInFlightId = signal<string | null>(null);
  readonly channelForm = this.fb.nonNullable.group({
    platform: ['Facebook' as SocialPlatform, Validators.required],
    name: ['', Validators.required],
    configurationVersion: [''],
  });

  // ── Accounts ───────────────────────────────────────────────
  readonly accounts = signal<PagedResult<SocialAccountDto>>(emptyPage());
  readonly accountsLoading = signal(false);
  platformFilter: SocialPlatform | '' = '';
  governorateFilter: number | '' = '';
  statusFilter: SocialAccountStatus | '' = '';
  readonly showAccountForm = signal(false);
  readonly savingAccount = signal(false);
  readonly accountActionInFlightId = signal<string | null>(null);
  readonly accountForm = this.fb.nonNullable.group({
    socialChannelId: ['', Validators.required],
    displayName: ['', Validators.required],
    externalAccountId: ['', Validators.required],
    accountType: ['Page' as SocialAccountType, Validators.required],
    governorateId: [''],
  });

  readonly connectingAccount = signal<SocialAccountDto | null>(null);
  readonly connecting = signal(false);
  connectTokenValue = '';

  readonly disconnectingAccount = signal<SocialAccountDto | null>(null);
  readonly disconnecting = signal(false);

  // ── Publications ───────────────────────────────────────────
  readonly publications = signal<PagedResult<SocialPublicationDto>>(emptyPage());
  readonly publicationsLoading = signal(false);
  publicationPlatformFilter: SocialPlatform | '' = '';
  publicationStatusFilter: SocialPublicationStatus | '' = '';
  readonly publicationStatuses: SocialPublicationStatus[] = ['Draft', 'Queued', 'Publishing', 'Published', 'Failed', 'Retrying', 'Cancelled'];

  // ── Rules ──────────────────────────────────────────────────
  readonly propertyTypes = signal<PropertyTypeLookup[]>([]);
  readonly rules = signal<PagedResult<DistributionRuleDto>>(emptyPage());
  readonly rulesLoading = signal(false);
  /** حسابات تصلح كهدف لقاعدة (كل الحسابات، حتى 100) — منفصلة عن قائمة الحسابات المُرقَّمة. */
  readonly ruleTargetAccounts = signal<SocialAccountDto[]>([]);
  ruleActiveFilter: '' | 'true' | 'false' = '';
  ruleIncludeArchived = false;
  readonly showRuleForm = signal(false);
  readonly editingRule = signal<DistributionRuleDto | null>(null);
  readonly savingRule = signal(false);
  readonly ruleActionInFlightId = signal<string | null>(null);
  readonly archivingRule = signal<DistributionRuleDto | null>(null);
  readonly archiving = signal(false);
  readonly ruleForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    socialAccountId: ['', Validators.required],
    provinceId: [''],
    propertyTypeId: [''],
    transactionType: [''],
    priority: [10, [Validators.required, Validators.min(0)]],
    startAt: [''],
    endAt: [''],
  });

  // ── Dead letters ───────────────────────────────────────────
  readonly deadLetters = signal<PagedResult<SocialPublicationDeadLetterDto>>(emptyPage());
  readonly deadLettersLoading = signal(false);
  deadLetterView: DeadLetterView = 'unresolved';
  readonly deadLetterActionInFlightId = signal<string | null>(null);
  readonly resolvingDeadLetter = signal<SocialPublicationDeadLetterDto | null>(null);
  readonly resolving = signal(false);
  resolveNote = '';
  resolveRequeue = false;

  ngOnInit(): void {
    this.lookups.getGovernorates().subscribe(list => this.governorates.set(list));
    this.api.getPublishers().subscribe({
      next: list => this.publishers.set(list),
      // لا نحجب شيئاً إن تعذّر التحميل — الخادم يرفض أصلاً ما لا يصلح.
      error: () => this.publishers.set([]),
    });
    this.selectTab('dashboard');
  }

  selectTab(tab: AdminTab): void {
    this.activeTab.set(tab);
    if (tab === 'dashboard' && !this.summary()) this.loadSummary();
    if (tab === 'channels' && this.channels().length === 0) this.loadChannels();
    if (tab === 'accounts' && this.accounts().items.length === 0) this.loadAccounts();
    if (tab === 'publications' && this.publications().items.length === 0) this.loadPublications();
    if (tab === 'rules') this.enterRulesTab();
    if (tab === 'deadLetters' && this.deadLetters().items.length === 0) this.loadDeadLetters();
  }

  /** false فقط حين نعرف يقيناً أن الناشر المسجَّل Placeholder — قبل التحميل (أو عند فشله) كل المنصات متاحة. */
  isPlatformLive(platform: SocialPlatform): boolean {
    const list = this.publishers();
    if (list.length === 0) return true;
    return list.find(p => p.platform === platform)?.isLive ?? false;
  }

  deadLetterErrorHint(code: string): string {
    return ERROR_CODE_HINTS[code] ?? '';
  }

  listingTypeLabel(type: SocialListingType | null): string {
    return type ? (LISTING_TYPE_LABELS[type] ?? type) : 'كل الأنواع';
  }

  propertyTypeName(id: number | null): string {
    if (id === null) return 'كل الأنواع';
    const match = this.propertyTypes().find(t => t.id === id);
    return match ? match.nameAr : `#${id}`;
  }

  accountName(id: string): string {
    return this.ruleTargetAccounts().find(a => a.id === id)?.displayName ?? id;
  }

  platformLabel(platform: SocialPlatform): string {
    return PLATFORM_LABELS[platform] ?? platform;
  }

  accountTypeLabel(type: string): string {
    return ACCOUNT_TYPE_LABELS[type as SocialAccountType] ?? type;
  }

  accountStatusLabel(status: SocialAccountStatus): string {
    return ACCOUNT_STATUS_LABELS[status] ?? status;
  }

  channelStatusLabel(status: SocialChannelStatus): string {
    return CHANNEL_STATUS_LABELS[status] ?? status;
  }

  publicationStatusLabel(status: SocialPublicationStatus): string {
    return PUBLICATION_STATUS_LABELS[status] ?? status;
  }

  governorateName(id: number | null): string {
    if (id === null) return 'كل المحافظات';
    const match = this.governorates().find(g => g.id === id);
    return match ? match.nameAr : `#${id}`;
  }

  channelName(id: string): string {
    return this.channels().find(c => c.id === id)?.name ?? id;
  }

  // ── Dashboard ──────────────────────────────────────────────

  loadSummary(): void {
    this.summaryLoading.set(true);
    this.api.getDashboardSummary().subscribe({
      next: summary => {
        this.summary.set(summary);
        this.summaryLoading.set(false);
      },
      error: () => {
        this.summaryLoading.set(false);
        this.toast.show('تعذّر تحميل ملخص لوحة التحكم.', 'error');
      },
    });
  }

  // ── Channels ───────────────────────────────────────────────

  loadChannels(): void {
    this.channelsLoading.set(true);
    this.api.getChannels().subscribe({
      next: channels => {
        this.channels.set(channels);
        this.channelsLoading.set(false);
      },
      error: () => {
        this.channelsLoading.set(false);
        this.toast.show('تعذّر تحميل القنوات.', 'error');
      },
    });
  }

  openCreateChannelForm(): void {
    const firstLive = this.platforms.find(p => this.isPlatformLive(p)) ?? 'Facebook';
    this.channelForm.reset({ platform: firstLive, name: '', configurationVersion: '' });
    this.showChannelForm.set(true);
  }

  closeChannelForm(): void {
    this.showChannelForm.set(false);
  }

  saveChannel(): void {
    if (this.channelForm.invalid) {
      this.channelForm.markAllAsTouched();
      return;
    }

    const value = this.channelForm.getRawValue();
    this.savingChannel.set(true);
    this.api
      .createChannel({
        platform: value.platform,
        name: value.name.trim(),
        configurationVersion: value.configurationVersion.trim() || null,
      })
      .subscribe({
        next: channel => {
          this.channels.update(list => [channel, ...list]);
          this.savingChannel.set(false);
          this.showChannelForm.set(false);
          this.toast.show('تم إنشاء القناة.', 'success');
        },
        error: err => {
          this.savingChannel.set(false);
          this.toast.show(err?.error?.message || 'تعذّر إنشاء القناة.', 'error');
        },
      });
  }

  toggleChannel(channel: SocialChannelDto): void {
    this.channelActionInFlightId.set(channel.id);
    const call = channel.status === 'Active' ? this.api.deactivateChannel(channel.id) : this.api.activateChannel(channel.id);

    call.subscribe({
      next: updated => {
        this.channels.update(list => list.map(c => (c.id === updated.id ? updated : c)));
        this.channelActionInFlightId.set(null);
      },
      error: err => {
        this.channelActionInFlightId.set(null);
        this.toast.show(err?.error?.message || 'تعذّر تغيير حالة القناة.', 'error');
      },
    });
  }

  // ── Accounts ───────────────────────────────────────────────

  loadAccounts(page = 1): void {
    this.accountsLoading.set(true);
    this.api
      .getAccounts({
        platform: this.platformFilter || undefined,
        governorateId: this.governorateFilter === '' ? undefined : Number(this.governorateFilter),
        status: this.statusFilter || undefined,
        page,
      })
      .subscribe({
        next: result => {
          this.accounts.set(result);
          this.accountsLoading.set(false);
        },
        error: () => {
          this.accountsLoading.set(false);
          this.toast.show('تعذّر تحميل الحسابات.', 'error');
        },
      });
  }

  applyAccountFilters(): void {
    this.loadAccounts(1);
  }

  goToAccountsPage(page: number): void {
    this.loadAccounts(page);
  }

  openCreateAccountForm(): void {
    const firstChannel = this.channels()[0];
    if (!firstChannel) {
      this.toast.show('أنشئ قناة أولاً قبل إضافة حساب.', 'warning');
      return;
    }
    this.accountForm.reset({
      socialChannelId: firstChannel.id,
      displayName: '',
      externalAccountId: '',
      accountType: 'Page',
      governorateId: '',
    });
    this.showAccountForm.set(true);
  }

  closeAccountForm(): void {
    this.showAccountForm.set(false);
  }

  saveAccount(): void {
    if (this.accountForm.invalid) {
      this.accountForm.markAllAsTouched();
      return;
    }

    const value = this.accountForm.getRawValue();
    this.savingAccount.set(true);
    this.api
      .createAccount({
        socialChannelId: value.socialChannelId,
        displayName: value.displayName.trim(),
        externalAccountId: value.externalAccountId.trim(),
        accountType: value.accountType,
        governorateId: value.governorateId === '' ? null : Number(value.governorateId),
      })
      .subscribe({
        next: () => {
          this.savingAccount.set(false);
          this.showAccountForm.set(false);
          this.toast.show('تم إنشاء الحساب.', 'success');
          this.loadAccounts(this.accounts().page);
        },
        error: err => {
          this.savingAccount.set(false);
          this.toast.show(err?.error?.message || 'تعذّر إنشاء الحساب.', 'error');
        },
      });
  }

  requestConnect(account: SocialAccountDto): void {
    this.connectTokenValue = '';
    this.connectingAccount.set(account);
  }

  cancelConnect(): void {
    this.connectingAccount.set(null);
    this.connectTokenValue = '';
  }

  confirmConnect(): void {
    const account = this.connectingAccount();
    const token = this.connectTokenValue.trim();
    if (!account || !token) return;

    this.connecting.set(true);
    this.api.connectAccount(account.id, token).subscribe({
      next: updated => {
        this.accounts.update(page => ({ ...page, items: page.items.map(a => (a.id === updated.id ? updated : a)) }));
        this.connecting.set(false);
        this.connectingAccount.set(null);
        this.connectTokenValue = '';
        this.toast.show('تم ربط بيانات الاعتماد.', 'success');
      },
      error: err => {
        this.connecting.set(false);
        this.toast.show(err?.error?.message || 'تعذّر ربط بيانات الاعتماد.', 'error');
      },
    });
  }

  requestDisconnect(account: SocialAccountDto): void {
    this.disconnectingAccount.set(account);
  }

  cancelDisconnect(): void {
    this.disconnectingAccount.set(null);
  }

  confirmDisconnect(): void {
    const account = this.disconnectingAccount();
    if (!account) return;

    this.disconnecting.set(true);
    this.api.disconnectAccount(account.id).subscribe({
      next: updated => {
        this.accounts.update(page => ({ ...page, items: page.items.map(a => (a.id === updated.id ? updated : a)) }));
        this.disconnecting.set(false);
        this.disconnectingAccount.set(null);
        this.toast.show('تم فصل الحساب.', 'success');
      },
      error: err => {
        this.disconnecting.set(false);
        this.toast.show(err?.error?.message || 'تعذّر فصل الحساب.', 'error');
      },
    });
  }

  // ── Publications ───────────────────────────────────────────

  loadPublications(page = 1): void {
    this.publicationsLoading.set(true);
    this.api
      .getPublications({
        platform: this.publicationPlatformFilter || undefined,
        status: this.publicationStatusFilter || undefined,
        page,
      })
      .subscribe({
        next: result => {
          this.publications.set(result);
          this.publicationsLoading.set(false);
        },
        error: () => {
          this.publicationsLoading.set(false);
          this.toast.show('تعذّر تحميل المنشورات.', 'error');
        },
      });
  }

  applyPublicationFilters(): void {
    this.loadPublications(1);
  }

  goToPublicationsPage(page: number): void {
    this.loadPublications(page);
  }

  // ── Rules ──────────────────────────────────────────────────

  private enterRulesTab(): void {
    if (this.propertyTypes().length === 0) {
      this.lookups.getPropertyTypeCatalog().subscribe({ next: list => this.propertyTypes.set(list), error: () => undefined });
    }
    if (this.ruleTargetAccounts().length === 0) {
      this.api.getAccounts({ pageSize: 100 }).subscribe({ next: page => this.ruleTargetAccounts.set(page.items), error: () => undefined });
    }
    if (this.rules().items.length === 0) this.loadRules();
  }

  loadRules(page = 1): void {
    this.rulesLoading.set(true);
    this.api
      .getRules({
        isActive: this.ruleActiveFilter === '' ? undefined : this.ruleActiveFilter === 'true',
        includeArchived: this.ruleIncludeArchived || undefined,
        page,
      })
      .subscribe({
        next: result => {
          this.rules.set(result);
          this.rulesLoading.set(false);
        },
        error: () => {
          this.rulesLoading.set(false);
          this.toast.show('تعذّر تحميل قواعد التوزيع.', 'error');
        },
      });
  }

  applyRuleFilters(): void {
    this.loadRules(1);
  }

  goToRulesPage(page: number): void {
    this.loadRules(page);
  }

  openCreateRuleForm(): void {
    if (this.ruleTargetAccounts().length === 0) {
      this.toast.show('أنشئ حساباً أولاً — القاعدة تستهدف حساباً محدداً.', 'warning');
      return;
    }
    this.editingRule.set(null);
    this.ruleForm.reset({
      name: '',
      description: '',
      socialAccountId: this.ruleTargetAccounts()[0].id,
      provinceId: '',
      propertyTypeId: '',
      transactionType: '',
      priority: 10,
      startAt: '',
      endAt: '',
    });
    this.ruleForm.controls.socialAccountId.enable();
    this.showRuleForm.set(true);
  }

  openEditRuleForm(rule: DistributionRuleDto): void {
    this.editingRule.set(rule);
    this.ruleForm.reset({
      name: rule.name,
      description: rule.description ?? '',
      socialAccountId: rule.socialAccountId,
      provinceId: rule.provinceId === null ? '' : String(rule.provinceId),
      propertyTypeId: rule.propertyTypeId === null ? '' : String(rule.propertyTypeId),
      transactionType: rule.transactionType ?? '',
      priority: rule.priority,
      startAt: toLocalInput(rule.startAt),
      endAt: toLocalInput(rule.endAt),
    });
    // الحساب المستهدف لا يتغيّر بعد الإنشاء (UpdateDistributionRuleRequest بلا socialAccountId).
    this.ruleForm.controls.socialAccountId.disable();
    this.showRuleForm.set(true);
  }

  closeRuleForm(): void {
    this.showRuleForm.set(false);
    this.editingRule.set(null);
  }

  saveRule(): void {
    if (this.ruleForm.invalid) {
      this.ruleForm.markAllAsTouched();
      return;
    }

    const value = this.ruleForm.getRawValue();
    const editing = this.editingRule();
    const body = {
      name: value.name.trim(),
      description: value.description.trim() || null,
      provinceId: value.provinceId === '' ? null : Number(value.provinceId),
      propertyTypeId: value.propertyTypeId === '' ? null : Number(value.propertyTypeId),
      transactionType: (value.transactionType || null) as SocialListingType | null,
      priority: Number(value.priority),
      startAt: toIsoOrNull(value.startAt),
      endAt: toIsoOrNull(value.endAt),
    };

    this.savingRule.set(true);
    const call = editing
      ? this.api.updateRule(editing.id, body)
      : this.api.createRule({ ...body, socialAccountId: value.socialAccountId });

    call.subscribe({
      next: () => {
        this.savingRule.set(false);
        this.showRuleForm.set(false);
        this.editingRule.set(null);
        this.toast.show(editing ? 'تم تعديل القاعدة.' : 'تم إنشاء القاعدة.', 'success');
        this.loadRules(this.rules().page);
      },
      error: err => {
        this.savingRule.set(false);
        this.toast.show(err?.error?.message || 'تعذّر حفظ القاعدة.', 'error');
      },
    });
  }

  toggleRule(rule: DistributionRuleDto): void {
    this.ruleActionInFlightId.set(rule.id);
    const call = rule.isActive ? this.api.deactivateRule(rule.id) : this.api.activateRule(rule.id);

    call.subscribe({
      next: updated => {
        this.rules.update(page => ({ ...page, items: page.items.map(r => (r.id === updated.id ? updated : r)) }));
        this.ruleActionInFlightId.set(null);
      },
      error: err => {
        this.ruleActionInFlightId.set(null);
        this.toast.show(err?.error?.message || 'تعذّر تغيير حالة القاعدة.', 'error');
      },
    });
  }

  requestArchive(rule: DistributionRuleDto): void {
    this.archivingRule.set(rule);
  }

  cancelArchive(): void {
    this.archivingRule.set(null);
  }

  confirmArchive(): void {
    const rule = this.archivingRule();
    if (!rule) return;

    this.archiving.set(true);
    this.api.archiveRule(rule.id).subscribe({
      next: () => {
        this.archiving.set(false);
        this.archivingRule.set(null);
        this.toast.show('تمت أرشفة القاعدة.', 'success');
        this.loadRules(this.rules().page);
      },
      error: err => {
        this.archiving.set(false);
        this.toast.show(err?.error?.message || 'تعذّرت أرشفة القاعدة.', 'error');
      },
    });
  }

  // ── Dead letters ───────────────────────────────────────────

  loadDeadLetters(page = 1): void {
    this.deadLettersLoading.set(true);
    this.api
      .getDeadLetters({
        resolved: this.deadLetterView === 'all' ? undefined : this.deadLetterView === 'resolved',
        page,
      })
      .subscribe({
        next: result => {
          this.deadLetters.set(result);
          this.deadLettersLoading.set(false);
        },
        error: () => {
          this.deadLettersLoading.set(false);
          this.toast.show('تعذّر تحميل Dead Letters.', 'error');
        },
      });
  }

  applyDeadLetterView(): void {
    this.loadDeadLetters(1);
  }

  goToDeadLettersPage(page: number): void {
    this.loadDeadLetters(page);
  }

  requeueDeadLetter(letter: SocialPublicationDeadLetterDto): void {
    this.deadLetterActionInFlightId.set(letter.id);
    this.api.requeueDeadLetter(letter.id).subscribe({
      next: () => this.afterDeadLetterChange('أُعيد إدراج المنشور في الطابور.'),
      error: err => {
        this.deadLetterActionInFlightId.set(null);
        this.toast.show(err?.error?.message || 'تعذّرت إعادة الإدراج.', 'error');
      },
    });
  }

  requestResolve(letter: SocialPublicationDeadLetterDto): void {
    this.resolveNote = '';
    this.resolveRequeue = false;
    this.resolvingDeadLetter.set(letter);
  }

  cancelResolve(): void {
    this.resolvingDeadLetter.set(null);
    this.resolveNote = '';
    this.resolveRequeue = false;
  }

  confirmResolve(): void {
    const letter = this.resolvingDeadLetter();
    if (!letter) return;

    this.resolving.set(true);
    this.api.resolveDeadLetter(letter.id, this.resolveNote.trim() || null, this.resolveRequeue).subscribe({
      next: () => {
        this.resolving.set(false);
        this.resolvingDeadLetter.set(null);
        this.afterDeadLetterChange('تم تسجيل الحل.');
      },
      error: err => {
        this.resolving.set(false);
        this.toast.show(err?.error?.message || 'تعذّر تسجيل الحل.', 'error');
      },
    });
  }

  /** بعد أي تغيير: أعد تحميل القائمة، وأفرغ ملخص اللوحة ليُحمَّل من جديد (عدّاد Dead Letters غير المحلولة). */
  private afterDeadLetterChange(message: string): void {
    this.deadLetterActionInFlightId.set(null);
    this.summary.set(null);
    this.toast.show(message, 'success');
    this.loadDeadLetters(this.deadLetters().page);
  }
}

/** قيمة input من نوع datetime-local → ISO (UTC)، أو null إن كانت فارغة. */
function toIsoOrNull(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

/** ISO من الخادم → قيمة تصلح لـdatetime-local (بالتوقيت المحلي). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyPage<T>(): PagedResult<T> {
  return { items: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 1, hasNext: false, hasPrevious: false };
}
