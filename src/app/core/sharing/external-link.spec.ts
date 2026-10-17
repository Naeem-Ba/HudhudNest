import { openExternalLink } from './external-link';

describe('openExternalLink', () => {
  it('opens the link through a noopener anchor click and never reads window.open', async () => {
    const openSpy = spyOn(window, 'open');
    let clicked: HTMLAnchorElement | null = null;
    spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) {
      clicked = this;
    });

    await openExternalLink('https://wa.me/?text=hi');

    expect(openSpy).not.toHaveBeenCalled();
    expect(clicked).not.toBeNull();
    expect(clicked!.href).toBe('https://wa.me/?text=hi');
    expect(clicked!.target).toBe('_blank');
    expect(clicked!.rel).toBe('noopener noreferrer');
  });

  it('leaves no anchor behind in the document', async () => {
    spyOn(HTMLAnchorElement.prototype, 'click').and.stub();
    const before = document.querySelectorAll('a[rel="noopener noreferrer"]').length;
    await openExternalLink('https://t.me/share/url?url=x');
    expect(document.querySelectorAll('a[rel="noopener noreferrer"]').length).toBe(before);
  });
});

describe('openExternalLink for mailto links', () => {
  it('uses a same-window anchor, no new tab', async () => {
    let clicked: HTMLAnchorElement | null = null;
    spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) {
      clicked = this;
    });

    await openExternalLink('mailto:?subject=a&body=b');

    expect(clicked).not.toBeNull();
    expect(clicked!.getAttribute('href')).toBe('mailto:?subject=a&body=b');
    expect(clicked!.getAttribute('target')).toBeNull();
  });
});
