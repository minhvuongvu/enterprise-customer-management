import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { NAVIGATOR } from '../../core/platform/platform.tokens';
import { Button } from '../../shared/ui/button/button';

export type GeolocationOutcome =
  | {
      readonly kind: 'position';
      readonly latitude: number;
      readonly longitude: number;
      readonly accuracy: number;
    }
  | { readonly kind: 'denied' | 'unavailable' | 'timeout' | 'unsupported' };

/** Long enough for a phone to get a fix; short enough not to look broken. */
export const GEOLOCATION_TIMEOUT_MS = 10_000;

/**
 * Maps a `GeolocationPositionError` code to what the page tells the user.
 * The codes are the API's own constants: 1 denied, 2 unavailable, 3 timeout.
 */
export function geolocationFailure(code: number): GeolocationOutcome {
  return { kind: code === 1 ? 'denied' : code === 3 ? 'timeout' : 'unavailable' };
}

/**
 * One position, on request, never stored and never sent anywhere.
 *
 * `getCurrentPosition` prompts the first time; a refusal is final for the
 * page (only the user can undo it in the browser's settings), which is why
 * the permissions demo exists alongside - it tells a page whether asking
 * would prompt, succeed, or is already refused. The API is callback-based
 * and wrapped in a promise here only to write the flow top to bottom.
 */
@Component({
  selector: 'app-geolocation-demo',
  imports: [Button, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="demo" *transloco="let t; prefix: 'pages.labs.browserApis.geolocation'">
      <app-button data-testid="geolocation-locate" [loading]="locating()" (click)="locate()">
        {{ t('locate') }}
      </app-button>
      @if (outcome(); as result) {
        <p role="status" data-testid="geolocation-outcome">
          @if (result.kind === 'position') {
            {{
              t('position', {
                latitude: result.latitude.toFixed(4),
                longitude: result.longitude.toFixed(4),
                accuracy: result.accuracy.toFixed(0),
              })
            }}
          } @else {
            {{ t('failure.' + result.kind) }}
          }
        </p>
      }
    </div>
  `,
  styles: `
    .demo {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }
  `,
})
export class GeolocationDemo {
  private readonly geolocation = inject(NAVIGATOR)?.geolocation ?? null;

  protected readonly locating = signal(false);
  protected readonly outcome = signal<GeolocationOutcome | null>(null);

  protected async locate(): Promise<void> {
    const geolocation = this.geolocation;
    if (!geolocation) {
      this.outcome.set({ kind: 'unsupported' });
      return;
    }
    this.locating.set(true);
    this.outcome.set(
      await new Promise<GeolocationOutcome>((resolve) =>
        geolocation.getCurrentPosition(
          (position) =>
            resolve({
              kind: 'position',
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            }),
          (error) => resolve(geolocationFailure(error.code)),
          { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 60_000 },
        ),
      ),
    );
    this.locating.set(false);
  }
}
