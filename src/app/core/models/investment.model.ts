// Investment Discovery Portal — Phase 1 (backend: HudhudNestApi.Controllers.InvestmentsController /
// AdminInvestmentsController). Discovery/analysis + Expression of Interest only — nothing here
// ever represents a real investment, payment, or commitment.

export type InvestmentProjectType =
  | 'Residential'
  | 'Commercial'
  | 'Mixed'
  | 'Industrial'
  | 'Land'
  | 'Renovation'
  | 'NewConstruction';

export type InvestmentProjectStatus =
  | 'Draft'
  | 'UnderReview'
  | 'Approved'
  | 'Scheduled'
  | 'Published'
  | 'Closed'
  | 'Rejected'
  | 'Suspended';

export type InvestmentRiskLevel = 'Low' | 'Medium' | 'High' | 'VeryHigh';

export type InvestmentDocumentType =
  | 'ProjectPlan'
  | 'FinancialStatement'
  | 'Valuation'
  | 'LegalDocument'
  | 'Permit'
  | 'Prospectus'
  | 'Other';

export type InvestmentUpdateType =
  | 'General'
  | 'ConstructionStarted'
  | 'RenovationProgress'
  | 'Milestone'
  | 'FinancialUpdate';

export type InvestmentInterestStatus = 'Active' | 'Withdrawn' | 'Contacted';

export interface InvestmentProjectSummary {
  id: string;
  title: string;
  shortDescription: string | null;
  projectType: InvestmentProjectType;
  status: InvestmentProjectStatus;
  propertyCity: string;
  propertyCountryCode: string | null;
  propertyMainImageUrl: string | null;
  targetAmount: number;
  raisedAmount: number;
  minimumInvestment: number;
  maximumInvestment: number | null;
  currency: string;
  investmentTermMonths: number;
  expectedReturnMin: number;
  expectedReturnMax: number;
  riskLevel: InvestmentRiskLevel | null;
  publishedAt: string | null;
  remainingAmount: number;
  fundingProgressPercent: number;
}

export interface InvestmentProjectDetails {
  id: string;
  propertyId: string;
  title: string;
  shortDescription: string | null;
  description: string;
  projectType: InvestmentProjectType;
  status: InvestmentProjectStatus;
  propertyTitle: string;
  propertyCity: string;
  propertyCountryCode: string | null;
  propertyLatitude: number | null;
  propertyLongitude: number | null;
  propertyMainImageUrl: string | null;
  targetAmount: number;
  raisedAmount: number;
  minimumInvestment: number;
  maximumInvestment: number | null;
  currency: string;
  investmentTermMonths: number;
  expectedReturnMin: number;
  expectedReturnMax: number;
  riskLevel: InvestmentRiskLevel | null;
  startDate: string | null;
  endDate: string | null;
  publishedAt: string | null;
  remainingAmount: number;
  fundingProgressPercent: number;
}

export interface InvestmentFinancialSummary {
  investmentProjectId: string;
  propertyEstimatedValue: number | null;
  purchasePrice: number;
  renovationCost: number;
  constructionCost: number;
  taxes: number;
  notaryCost: number;
  brokerCost: number;
  financingCost: number;
  operatingCost: number;
  contingencyReserve: number;
  totalProjectCost: number;
  expectedRevenue: number;
  expectedProfit: number;
}

export interface InvestmentRisk {
  investmentProjectId: string;
  riskLevel: InvestmentRiskLevel;
  marketRisk: InvestmentRiskLevel;
  liquidityRisk: InvestmentRiskLevel;
  projectRisk: InvestmentRiskLevel;
  financingRisk: InvestmentRiskLevel;
  developerRisk: InvestmentRiskLevel;
  riskScore: number;
  riskSummary: string;
}

export interface InvestmentDocument {
  id: string;
  documentType: InvestmentDocumentType;
  fileName: string;
  version: number;
  publishedAt: string | null;
  url: string;
}

export interface InvestmentUpdateItem {
  id: string;
  title: string;
  content: string;
  updateType: InvestmentUpdateType;
  publishedAt: string;
}

export interface InvestmentInterest {
  id: string;
  investmentProjectId: string;
  projectTitle: string;
  status: InvestmentInterestStatus;
  createdAt: string;
}

export interface InvestmentWatchlistItem {
  investmentProjectId: string;
  createdAt: string;
  project: InvestmentProjectSummary;
}

export interface InvestmentProjectFilter {
  search?: string;
  projectType?: InvestmentProjectType;
  riskLevel?: InvestmentRiskLevel;
  minTermMonths?: number;
  maxTermMonths?: number;
  minTargetAmount?: number;
  maxTargetAmount?: number;
  minExpectedReturn?: number;
  city?: string;
  page?: number;
  pageSize?: number;
}

export interface InvestmentCalculatorScenario {
  initialAmount: number;
  estimatedReturnAmount: number;
  estimatedTotal: number;
  annualizedReturnPercent: number;
}

export interface InvestmentCalculatorResult {
  investmentProjectId: string;
  amount: number;
  termMonths: number;
  currency: string;
  conservative: InvestmentCalculatorScenario;
  base: InvestmentCalculatorScenario;
  optimistic: InvestmentCalculatorScenario;
  disclaimer: string;
}

// ── Admin (Phase 2) — backend: HudhudNestApi.Controllers.AdminInvestmentsController,
// [Authorize(Roles = "Admin")] on every action. ─────────────────────────────────

/** Every state a project can be in — the public list/detail only ever return Published. */
export interface AdminInvestmentProjectListItem {
  id: string;
  title: string;
  status: InvestmentProjectStatus;
  projectType: InvestmentProjectType;
  ownerUserId: string;
  targetAmount: number;
  raisedAmount: number;
  createdAt: string;
  publishedAt: string | null;
}

export interface AdminInvestmentProjectFilter {
  search?: string;
  status?: InvestmentProjectStatus;
  projectType?: InvestmentProjectType;
  page?: number;
  pageSize?: number;
}

/** Same shape as the public InvestmentProjectDetails — admin's GetProjectReview returns it
 * regardless of Status (the public endpoint 404s on anything but Published). */
export type AdminInvestmentProjectDetails = InvestmentProjectDetails;

export interface InvestmentProjectPublishReadiness {
  hasTitleAndDescription: boolean;
  hasFinancials: boolean;
  hasRiskAssessment: boolean;
  hasRequiredDocuments: boolean;
  isReady: boolean;
}

export interface InvestmentProjectReview {
  project: AdminInvestmentProjectDetails;
  rejectionReason: string | null;
  financials: InvestmentFinancialSummary | null;
  risk: InvestmentRisk | null;
  publicDocumentCount: number;
  readiness: InvestmentProjectPublishReadiness;
}

export interface AdminInvestmentDocument extends InvestmentDocument {
  isPublic: boolean;
}

/** Explicit workflow actions on InvestmentProject — never a raw status assignment. Matches the
 * backend's own state machine one-for-one (HudhudNestApi.Domain.Investments.Entities.InvestmentProject). */
export type InvestmentWorkflowAction =
  | 'submit-review'
  | 'approve'
  | 'reject'
  | 'schedule'
  | 'publish'
  | 'suspend'
  | 'close';

export interface CreateInvestmentProjectRequest {
  propertyId: string;
  title: string;
  description: string;
  projectType: InvestmentProjectType;
  currency: string;
}

export interface UpdateInvestmentProjectRequest {
  title: string;
  shortDescription: string | null;
  description: string;
  projectType: InvestmentProjectType;
  targetAmount: number;
  minimumInvestment: number;
  maximumInvestment: number | null;
  currency: string;
  investmentTermMonths: number;
  expectedReturnMin: number;
  expectedReturnMax: number;
  startDate: string | null;
  endDate: string | null;
  raisedAmount: number;
}

export interface SetInvestmentFinancialsRequest {
  purchasePrice: number;
  renovationCost: number;
  constructionCost: number;
  taxes: number;
  notaryCost: number;
  brokerCost: number;
  financingCost: number;
  operatingCost: number;
  contingencyReserve: number;
  expectedRevenue: number;
  expectedProfit: number;
}

export interface SetInvestmentRiskRequest {
  riskLevel: InvestmentRiskLevel;
  marketRisk: InvestmentRiskLevel;
  liquidityRisk: InvestmentRiskLevel;
  projectRisk: InvestmentRiskLevel;
  financingRisk: InvestmentRiskLevel;
  developerRisk: InvestmentRiskLevel;
  riskScore: number;
  riskSummary: string;
}

export interface AddInvestmentUpdateRequest {
  title: string;
  content: string;
  updateType: InvestmentUpdateType;
}
