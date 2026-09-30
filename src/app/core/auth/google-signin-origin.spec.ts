import { isGoogleSignInUnsupportedOrigin } from './google-signin-origin';

describe('isGoogleSignInUnsupportedOrigin', () => {
  it('flags Netlify deploy-preview hosts, which can never be registered with Google', () => {
    expect(isGoogleSignInUnsupportedOrigin('deploy-preview-102--hudhudnest.netlify.app')).toBeTrue();
    expect(isGoogleSignInUnsupportedOrigin('Deploy-Preview-7--hudhudnest.netlify.app')).toBeTrue();
  });

  it('leaves stable, registrable origins alone', () => {
    expect(isGoogleSignInUnsupportedOrigin('hudhudnest.com')).toBeFalse();
    expect(isGoogleSignInUnsupportedOrigin('www.hudhudnest.com')).toBeFalse();
    expect(isGoogleSignInUnsupportedOrigin('staging--hudhudnest.netlify.app')).toBeFalse();
    expect(isGoogleSignInUnsupportedOrigin('hudhudnest.netlify.app')).toBeFalse();
    expect(isGoogleSignInUnsupportedOrigin('localhost')).toBeFalse();
  });

  it('does not match look-alike hosts', () => {
    expect(isGoogleSignInUnsupportedOrigin('deploy-preview-1--x.netlify.app.evil.com')).toBeFalse();
    expect(isGoogleSignInUnsupportedOrigin('evil-deploy-preview-1--x.netlify.app')).toBeFalse();
  });

  it('tolerates missing hostnames', () => {
    expect(isGoogleSignInUnsupportedOrigin(undefined)).toBeFalse();
    expect(isGoogleSignInUnsupportedOrigin('')).toBeFalse();
  });
});
