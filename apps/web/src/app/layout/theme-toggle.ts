import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ThemeService, THEME_PREFERENCES } from '../core/theme/theme.service';
import { Dropdown, type DropdownItem } from '../shared/ui/dropdown/dropdown';

/** Translate function handed down by `*transloco`. */
type Translate = (key: string) => string;

/**
 * Chooses the colour theme.
 *
 * Three options rather than a two-state switch, because "follow the system" is
 * a different answer from "light": it keeps following when the operating
 * system changes at sunset, and it is the only one a user who has already set
 * a preference at the OS level should have to think about.
 *
 * It holds no state. `ThemeService` owns the preference and the persistence;
 * this decides what the control looks like.
 */
@Component({
  selector: 'app-theme-toggle',
  imports: [Dropdown, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      <app-dropdown [items]="options(t)" [menuLabel]="t('theme.label')" (selected)="apply($event)">
        <!-- The glyph is decorative; the accessible name is the hidden text,
             so the control is announced as "Colour theme" rather than as a
             character no screen reader can pronounce. -->
        <span class="theme__glyph" [attr.data-theme]="theme.resolved()" aria-hidden="true"></span>
        <span class="visually-hidden">{{ t('theme.label') }}</span>
      </app-dropdown>
    </ng-container>
  `,
  styles: `
    .theme__glyph[data-theme='light']::before {
      content: '\\2600';
    }

    .theme__glyph[data-theme='dark']::before {
      content: '\\263D';
    }
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);

  /**
   * Built from the translate function rather than from `TranslocoService`, so
   * the labels cannot be read before the language chunk has loaded. The array
   * identity changes on each check; `app-dropdown` tracks by `id`, so nothing
   * re-renders because of it.
   */
  protected options(t: Translate): readonly DropdownItem[] {
    return THEME_PREFERENCES.map((preference) => ({
      id: preference,
      label: t(`theme.options.${preference}`),
      selected: this.theme.preference() === preference,
    }));
  }

  protected apply(id: string): void {
    // The dropdown emits a plain string, so the value is narrowed rather than
    // asserted: a cast here would be a lie the compiler agrees to.
    const preference = THEME_PREFERENCES.find((candidate) => candidate === id);
    if (preference) {
      this.theme.set(preference);
    }
  }
}
