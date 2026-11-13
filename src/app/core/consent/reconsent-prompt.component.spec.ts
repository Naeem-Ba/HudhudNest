import { ConsentRecord } from '../api/consent-api.service';
import { PRIVACY_POLICY_VERSION, TERMS_OF_SERVICE_VERSION } from '../models/consent-versions';
import { outdatedDocuments } from './reconsent-prompt.component';

describe('outdatedDocuments (re-consent after a material change)', () => {
  const record = (policyType: ConsentRecord['policyType'], policyVersion: string, isActive = true): ConsentRecord => ({
    id: policyType + policyVersion,
    policyType,
    policyVersion,
    consentedAtUtc: '2026-11-01T00:00:00Z',
    source: 'Web',
    withdrawnAtUtc: null,
    isActive
  });

  it('asks for both documents when only older versions were accepted', () => {
    expect(outdatedDocuments([record('TermsOfService', '2026-11-08'), record('PrivacyPolicy', '2026-11-08')])).toEqual([
      'TermsOfService',
      'PrivacyPolicy'
    ]);
  });

  it('asks for nothing when the current versions are actively recorded', () => {
    expect(outdatedDocuments([record('TermsOfService', TERMS_OF_SERVICE_VERSION), record('PrivacyPolicy', PRIVACY_POLICY_VERSION)])).toEqual([]);
  });

  it('a withdrawn current record does not count', () => {
    expect(outdatedDocuments([record('TermsOfService', TERMS_OF_SERVICE_VERSION, false), record('PrivacyPolicy', PRIVACY_POLICY_VERSION)])).toEqual([
      'TermsOfService'
    ]);
  });
});
