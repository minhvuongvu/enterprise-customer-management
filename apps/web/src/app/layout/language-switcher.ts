import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { LanguageService } from '../core/i18n/language.service';
import { Dropdown, type DropdownItem } from '../shared/ui/dropdown/dropdown';

/** Translate function handed down by `*transloco`. */
type Translate = (key: string) => string;

/**
 * Chooses the interface language, at runtime, without a reload.
 *
 * Every option is written in its own language - "English", "Tiếng Việt" - and
 * carries its own `lang` attribute. Someone who cannot read the current
 * language must still be able to find theirs, and a screen reader needs the
 * attribute to pronounce "Tiếng Việt" with a Vietnamese voice rather than
 * spelling it out in an English one.
 *
 * The trigger shows the active language's code next to a glyph, and its
 * accessible name is "Language EN": the visible text is part of the name, so
 * a voice-control user can say what they see (WCAG 2.5.3).
 *
 * Like the theme toggle, it holds no state: `LanguageService` owns the choice,
 * its persistence and the loading of the new language.
 */
@Component({
  selector: 'app-language-switcher',
  imports: [Dropdown, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      <app-dropdown
        kind="choice"
        [items]="options(t)"
        [menuLabel]="t('language.label')"
        (itemSelected)="use($event)"
        data-testid="language-switcher"
      >
        <span class="visually-hidden">{{ t('language.label') }}</span>
        <span class="language__glyph" aria-hidden="true"></span>
        <span class="language__code">{{ code() }}</span>
      </app-dropdown>
      @if (language.switching()) {
        <span class="visually-hidden" role="status">{{ t('language.switching') }}</span>
      }
    </ng-container>
  `,
  styles: `
    .language__glyph::before {
      content: '\\1F310';
    }

    .language__code {
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
      letter-spacing: 0.02em;
    }
  `,
})
export class LanguageSwitcher {
  protected readonly language = inject(LanguageService);

  /** `EN`, `VI`: a language code, which is an identifier rather than copy. */
  protected readonly code = computed(() => this.language.active().toUpperCase());

  protected options(t: Translate): readonly DropdownItem[] {
    return this.language.supported.map((definition) => ({
      id: definition.code,
      label: t(`language.names.${definition.code}`),
      lang: definition.code,
      selected: this.language.active() === definition.code,
    }));
  }

  protected use(code: string): void {
    void this.language.use(code);
  }
}
