import { Directive, ElementRef, HostListener, Input } from '@angular/core';

@Directive({
  selector: 'img[appImageFallback]',
  standalone: true
})
export class ImageFallbackDirective {
  @Input('appImageFallback') fallbackSrc = '/images/no-image.svg';
  private fallbackApplied = false;

  constructor(private readonly elementRef: ElementRef<HTMLImageElement>) {}

  @HostListener('error')
  onError(): void {
    const image = this.elementRef.nativeElement;

    if (this.fallbackApplied || image.src.endsWith(this.fallbackSrc)) {
      return;
    }

    this.fallbackApplied = true;
    image.src = this.fallbackSrc;
    image.classList.add('image-fallback-applied');
  }
}
