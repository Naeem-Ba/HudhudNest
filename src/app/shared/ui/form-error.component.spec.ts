import { FormControl, Validators } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';

import { FormErrorComponent } from './form-error.component';

describe('FormErrorComponent (QA Phase 16, D01)', () => {
  // instant() echoes "KEY|n=value" so the test sees which translation key was asked for.
  const translate = {
    instant: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}|${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')}` : key
  };

  beforeEach(() => TestBed.configureTestingModule({ providers: [{ provide: TranslateService, useValue: translate }] }));

  function build(control: FormControl, messages: Record<string, string> = {}): FormErrorComponent {
    const component = TestBed.runInInjectionContext(() => new FormErrorComponent());
    component.control = control;
    component.messages = messages;
    return component;
  }

  it('asks for a translated text and never contains a hard-coded Arabic fallback', () => {
    const control = new FormControl('', Validators.required);

    expect(build(control).getMessage()).toBe('VALIDATION.REQUIRED');
    expect(build(new FormControl('x', Validators.minLength(3))).getMessage()).toBe('VALIDATION.MIN_LENGTH|n=3');
    expect(build(new FormControl('abcd', Validators.maxLength(2))).getMessage()).toBe('VALIDATION.MAX_LENGTH|n=2');
    expect(build(new FormControl(1, Validators.min(5))).getMessage()).toBe('VALIDATION.MIN_VALUE|n=5');
    expect(build(new FormControl(9, Validators.max(5))).getMessage()).toBe('VALIDATION.MAX_VALUE|n=5');
    expect(build(new FormControl('a', Validators.pattern(/^\d+$/))).getMessage()).toBe('VALIDATION.PATTERN');
    expect(build(new FormControl('a', Validators.email)).getMessage()).toBe('VALIDATION.EMAIL');
  });

  it('prefers the message the page passed for that error', () => {
    const control = new FormControl('', Validators.required);

    expect(build(control, { required: 'Enter your email' }).getMessage()).toBe('Enter your email');
  });

  it('falls back to the generic invalid text for an unknown error', () => {
    const control = new FormControl('x');
    control.setErrors({ custom: true });

    expect(build(control).getMessage()).toBe('VALIDATION.INVALID');
  });
});
