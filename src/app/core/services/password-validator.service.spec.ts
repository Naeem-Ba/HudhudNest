import { PasswordValidatorService } from './password-validator.service';

describe('PasswordValidatorService', () => {
  const svc = new PasswordValidatorService();

  it('counts as special only the characters the server counts (PasswordPolicy.SpecialCharacters)', () => {
    expect(svc.validate('Abcdefg1!').requirements.hasSpecialChar).toBeTrue();
    expect(svc.validate('Abcdefg1"').requirements.hasSpecialChar).toBeFalse();
  });

  it('uses the shared minimum length', () => {
    expect(svc.validate('Ab1!xyz').requirements.minLength).toBeFalse();
    expect(svc.validate('Ab1!xyzw').requirements.minLength).toBeTrue();
  });
});
