import { normalizeApiEnvironment } from './environment-badge.component';

describe('normalizeApiEnvironment', () => {
  it('maps the backend environment names onto the app environment names', () => {
    expect(normalizeApiEnvironment('Production')).toBe('production');
    expect(normalizeApiEnvironment('Staging')).toBe('staging');
    expect(normalizeApiEnvironment('Development')).toBe('local');
  });

  it('returns null for unknown or missing values so no false mismatch is shown', () => {
    expect(normalizeApiEnvironment('Testing')).toBeNull();
    expect(normalizeApiEnvironment(undefined)).toBeNull();
  });
});
