import { resolveLoginIdentifier } from './login-identifier';

describe('resolveLoginIdentifier', () => {
  it('✅ دخول بالبريد ⇒ البريد فقط حتى لو كان للحساب رقم هاتف', () => {
    expect(resolveLoginIdentifier('email', 'user@example.com', '+4915112345678'))
      .toEqual({ kind: 'email', value: 'user@example.com' });
  });

  it('✅ دخول بالهاتف ⇒ الرقم فقط حتى لو أُضيف بريد ثانوي للحساب', () => {
    expect(resolveLoginIdentifier('phone', 'user@example.com', '+4915112345678'))
      .toEqual({ kind: 'phone', value: '+4915112345678' });
  });

  it('✅ طريقة غير معروفة + حساب هاتف فقط (بلا بريد) ⇒ الرقم', () => {
    expect(resolveLoginIdentifier(null, '', '+4915112345678'))
      .toEqual({ kind: 'phone', value: '+4915112345678' });
  });

  it('✅ طريقة غير معروفة + حساب فيه بريد ⇒ البريد', () => {
    expect(resolveLoginIdentifier(null, 'user@example.com', '+4915112345678'))
      .toEqual({ kind: 'email', value: 'user@example.com' });
  });

  it('✅ الطريقة المحفوظة تتراجع للقيمة الموجودة بدل عرض نص فارغ', () => {
    expect(resolveLoginIdentifier('phone', 'user@example.com', ''))
      .toEqual({ kind: 'email', value: 'user@example.com' });
    expect(resolveLoginIdentifier('email', '', '+4915112345678'))
      .toEqual({ kind: 'phone', value: '+4915112345678' });
  });

  it('✅ لا بريد ولا هاتف (الملف لم يُحمَّل بعد) ⇒ null — لا شيء يُعرض بدل "?"', () => {
    expect(resolveLoginIdentifier('phone', null, undefined)).toBeNull();
    expect(resolveLoginIdentifier(null, '  ', '')).toBeNull();
  });
});
