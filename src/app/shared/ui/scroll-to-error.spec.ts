import { findControlFor, findFirstError, focusFirstError, revealElement } from './scroll-to-error';

describe('scroll-to-error', () => {
  let host: HTMLElement;

  function build(html: string): HTMLElement {
    host.innerHTML = html;
    return host;
  }

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    window.scrollTo(0, 0);
  });

  it('finds nothing when the form has no error', () => {
    build('<form><div class="form-group"><input id="a"></div></form>');
    expect(findFirstError(host)).toBeNull();
    expect(focusFirstError(host)).toBeNull();
  });

  it('a field error wins over the form-level alert, and the first field in document order wins', () => {
    build(`
      <div class="auth-alert--error">form level</div>
      <div class="form-group"><input id="first"><div class="field-error" id="e1">one</div></div>
      <div class="form-group"><input id="second"><div class="field-error" id="e2">two</div></div>`);

    expect(findFirstError(host)?.id).toBe('e1');
  });

  it('falls back to the form-level alert when no field has an error', () => {
    build('<div class="auth-alert--error" id="alert">network</div><input>');
    expect(findFirstError(host)?.id).toBe('alert');
  });

  it('ignores errors that are not displayed', () => {
    build('<div class="form-group"><input><div class="field-error" id="hidden" style="display:none">x</div></div>');
    expect(findFirstError(host)).toBeNull();
  });

  it('finds the input of an error inside the same form-group', () => {
    build('<div class="form-group"><input id="email"><div class="field-error" id="e">x</div></div>');
    expect(findControlFor(host.querySelector<HTMLElement>('#e')!)?.id).toBe('email');
  });

  it('finds the input of an <app-form-error> that sits next to it', () => {
    build('<label>l</label><input id="pw"><app-form-error><p class="form-error" id="e">x</p></app-form-error>');
    expect(findControlFor(host.querySelector<HTMLElement>('#e')!)?.id).toBe('pw');
  });

  it('focuses the field of the first error without jumping the page, and reveals the message', () => {
    build(`
      <div style="height:2000px"></div>
      <div class="form-group"><input id="target"><div class="field-error" id="err">x</div></div>`);

    const revealed = focusFirstError(host, { smooth: false });

    expect(revealed?.id).toBe('err');
    expect(document.activeElement?.id).toBe('target');
  });

  it('scrolls to an error far below the fold, and does nothing for one already visible', () => {
    build(`
      <div class="far" style="height:3000px"></div>
      <div id="far-error" class="field-error">far</div>
      <div style="height:1500px"></div>`);

    const far = host.querySelector<HTMLElement>('#far-error')!;
    expect(revealElement(far, null, { smooth: false })).toBeTrue();

    // The element is now inside the visible area: a second call must not move anything.
    return new Promise<void>(resolve => setTimeout(() => {
      expect(revealElement(far, null, { smooth: false })).toBeFalse();
      resolve();
    }, 50));
  });
});
