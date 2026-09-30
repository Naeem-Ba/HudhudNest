import { Injectable } from '@angular/core';

export type OverlayBackHandler = () => boolean;

/**
 * Coordinates temporary UI layers with native back navigation.
 * The most recently registered open overlay gets the first chance to consume Back.
 */
@Injectable({ providedIn: 'root' })
export class OverlayBackHandlerService {
  private readonly handlers: OverlayBackHandler[] = [];

  register(handler: OverlayBackHandler): () => void {
    this.handlers.push(handler);

    return () => {
      const index = this.handlers.lastIndexOf(handler);
      if (index >= 0) {
        this.handlers.splice(index, 1);
      }
    };
  }

  closeTopOverlay(): boolean {
    for (let index = this.handlers.length - 1; index >= 0; index -= 1) {
      // A handler may unregister itself or another one while Back is handled.
      if (this.handlers[index]?.()) {
        return true;
      }
    }

    return false;
  }
}
