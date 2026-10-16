// src/app/core/models/provider-onboarding.model.ts
//
// Service-provider onboarding: the join application (what an applicant submits and follows) and
// the admin views over applications and approved providers. Mirrors
// HudhudNestApi.Application.Services.ProviderOnboarding DTOs. Application status and provider
// status are two separate machines: an application is Approved once; the provider it creates is
// then Active / Suspended / Revoked independently.

import { ServiceCategory, ServiceOfferingDto, ServiceProviderDto, ServiceProviderStatus, ServiceProviderVerificationLevel } from './service.model';

export type ServiceProviderApplicationStatus = 'Pending' | 'NeedsInfo' | 'Approved' | 'Rejected' | 'Withdrawn';

export type ServiceProviderApplicantType = 'Individual' | 'Company';

export type ServiceProviderEventType =
  | 'ApplicationSubmitted'
  | 'InfoRequested'
  | 'ApplicantResponded'
  | 'Note'
  | 'ApplicationApproved'
  | 'ApplicationRejected'
  | 'ApplicationWithdrawn'
  | 'ProviderCreated'
  | 'ProviderLinked'
  | 'ProviderUpdated'
  | 'ProviderSuspended'
  | 'ProviderReactivated'
  | 'ProviderRevoked'
  | 'VerificationChanged';

export const APPLICATION_STATUSES: readonly ServiceProviderApplicationStatus[] =
  ['Pending', 'NeedsInfo', 'Approved', 'Rejected', 'Withdrawn'];

export const PROVIDER_STATUSES: readonly ServiceProviderStatus[] = ['Active', 'Suspended', 'Revoked'];

export const VERIFICATION_LEVELS: readonly ServiceProviderVerificationLevel[] =
  ['None', 'AccountVerified', 'IdentityVerified', 'BusinessVerified', 'ServiceVerified'];

export interface ServiceProviderEventDto {
  id: string;
  type: ServiceProviderEventType;
  note?: string | null;
  isInternal: boolean;
  actorUserId?: string | null;
  applicationId?: string | null;
  createdAt: string;
}

/** The applicant's own view: no internal notes, no admin identities. */
export interface ServiceProviderApplicationDto {
  id: string;
  referenceNumber: string;
  applicantType: ServiceProviderApplicantType;
  displayName: string;
  contactName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  requestedCategories: ServiceCategory[];
  requestedGovernorateIds: number[];
  experience: string;
  companyName?: string | null;
  licenseNumber?: string | null;
  status: ServiceProviderApplicationStatus;
  infoRequest?: string | null;
  decisionReason?: string | null;
  serviceProviderId?: string | null;
  createdAt: string;
  updatedAt: string;
  timeline: ServiceProviderEventDto[];
}

/** What the applicant may set; status, applicant id and provider link are never sent. */
export interface ServiceProviderApplicationPayload {
  applicantType: ServiceProviderApplicantType;
  displayName: string;
  contactName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  categories: ServiceCategory[];
  governorateIds: number[];
  experience: string;
  companyName?: string | null;
  licenseNumber?: string | null;
}

export interface SubmitServiceProviderApplicationPayload extends ServiceProviderApplicationPayload {
  termsAccepted: boolean;
}

export interface RespondServiceProviderApplicationPayload extends ServiceProviderApplicationPayload {
  message: string;
}

export interface AdminApplicationSummaryDto {
  id: string;
  referenceNumber: string;
  applicantUserId: string;
  applicantType: ServiceProviderApplicantType;
  displayName: string;
  contactName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  requestedCategories: ServiceCategory[];
  requestedGovernorateIds: number[];
  status: ServiceProviderApplicationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminApplicationDetailDto {
  summary: AdminApplicationSummaryDto;
  experience: string;
  companyName?: string | null;
  licenseNumber?: string | null;
  infoRequest?: string | null;
  decisionReason?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  termsAcceptedAt: string;
  serviceProviderId?: string | null;
  applicantAccountName: string;
  applicantAccountActive: boolean;
  existingProviderId?: string | null;
  existingProviderStatus?: ServiceProviderStatus | null;
  timeline: ServiceProviderEventDto[];
}

export interface AdminProviderSummaryDto {
  id: string;
  userId: string;
  displayName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  status: ServiceProviderStatus;
  verificationLevel: ServiceProviderVerificationLevel;
  approvedCategories: ServiceCategory[];
  coverageGovernorateIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminProviderDetailDto {
  provider: ServiceProviderDto;
  openRequestCount: number;
  offerings: ServiceOfferingDto[];
  applications: AdminApplicationSummaryDto[];
  timeline: ServiceProviderEventDto[];
}

export interface ServicePage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ServiceCategoryAvailabilityDto {
  category: ServiceCategory;
  offeringCount: number;
}

export interface ApproveApplicationPayload {
  approvedCategories: ServiceCategory[];
  approvedGovernorateIds: number[];
  displayName?: string | null;
  verificationLevel?: ServiceProviderVerificationLevel | null;
  note?: string | null;
}

export interface UpdateProviderByAdminPayload {
  displayName: string;
  bio?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  approvedCategories: ServiceCategory[];
  coverageGovernorateIds: number[];
}

export interface ApplicationFilter {
  search?: string;
  status?: ServiceProviderApplicationStatus | '';
  category?: ServiceCategory | '';
  governorateId?: number | null;
  page?: number;
  pageSize?: number;
}

export interface ProviderFilter {
  search?: string;
  status?: ServiceProviderStatus | '';
  category?: ServiceCategory | '';
  governorateId?: number | null;
  page?: number;
  pageSize?: number;
}

/** Statuses in which the applicant can no longer change the application. */
export function isApplicationOpen(status: ServiceProviderApplicationStatus): boolean {
  return status === 'Pending' || status === 'NeedsInfo';
}

/** Applicant-visible timeline events; the server already drops internal notes, this is a second guard. */
export function publicEvents(events: ServiceProviderEventDto[]): ServiceProviderEventDto[] {
  return events.filter(event => !event.isInternal);
}
