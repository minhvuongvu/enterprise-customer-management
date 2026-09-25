import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * One experiment on a lab page: a heading, one sentence on what it shows, and
 * the experiment itself.
 *
 * Every Phase 5 lab is a column of these, so they share one look - and one
 * heading level, `<h2>` under the page's `<h1>`, which is what keeps the
 * outline of nine lab pages consistent without anyone checking. The long
 * explanation of each technique (problem, alternative, trade-offs, when not
 * to use it) is in `docs/`, not here: a lab page is for doing, and prose in
 * a translation file is prose nobody reviews.
 */
@Component({
  selector: 'app-lab-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-section" [attr.aria-labelledby]="headingId()">
      <h2 [id]="headingId()">{{ heading() }}</h2>
      @if (description()) {
        <p class="lab-section__description">{{ description() }}</p>
      }
      <ng-content />
    </section>
  `,
  styles: `
    .lab-section {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      margin-block-start: var(--space-5);
      padding: var(--space-4);
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-lg);
      background-color: var(--surface-raised);
    }

    h2 {
      font-size: var(--text-lg);
    }

    .lab-section__description {
      max-width: 70ch;
      color: var(--text-secondary);
    }
  `,
})
export class LabSection {
  /** Unique on the page; ties the section's landmark name to its heading. */
  readonly sectionId = input.required<string>();
  readonly heading = input.required<string>();
  readonly description = input<string>('');

  protected headingId(): string {
    return `lab-${this.sectionId()}-heading`;
  }
}
