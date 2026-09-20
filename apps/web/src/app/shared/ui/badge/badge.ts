import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Tones are named by meaning, not by colour.
 *
 * `tone="danger"` survives a redesign that makes destructive things orange;
 * `tone="red"` does not, and neither does a caller that wrote the colour in.
 */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/**
 * A short status label.
 *
 * Colour alone never carries the meaning - the text is always present - because
 * roughly one in twelve men cannot distinguish the red tone from the green one.
 */
@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-tone]': 'tone()' },
  template: `<ng-content />`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-pill);
      background-color: var(--surface-sunken);
      color: var(--text-secondary);
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
      line-height: var(--leading-tight);
      white-space: nowrap;
    }

    :host([data-tone='info']) {
      background-color: var(--accent-subtle);
      color: var(--accent-text);
    }
    :host([data-tone='success']) {
      background-color: var(--success-subtle);
      color: var(--success-text);
    }
    :host([data-tone='warning']) {
      background-color: var(--warning-subtle);
      color: var(--warning-text);
    }
    :host([data-tone='danger']) {
      background-color: var(--danger-subtle);
      color: var(--danger-text);
    }
  `,
})
export class Badge {
  readonly tone = input<BadgeTone>('neutral');
}
