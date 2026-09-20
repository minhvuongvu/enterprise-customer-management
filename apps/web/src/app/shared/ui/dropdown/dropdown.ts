import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * One entry in a dropdown. `label` is already translated; `id` is what comes
 * back on `selected`, so it is a stable key and never a label.
 */
export interface DropdownItem {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly tone?: 'default' | 'danger';
  /** Marks the item the current state corresponds to, e.g. the active theme. */
  readonly selected?: boolean;
}

/**
 * A menu of actions hanging off a trigger.
 *
 * Built on CDK's menu primitives, which is the point of the "CDK for the hard
 * part" rule in the shared-UI README. What CDK contributes here is not the
 * popup - that is twenty lines - but the behaviour a hand-written menu almost
 * never gets completely right: `aria-haspopup` and `aria-expanded` kept in
 * sync, arrow-key navigation with wrap-around, type-ahead, Escape closing the
 * menu *and* returning focus to the trigger, closing on outside click, and
 * repositioning when the menu would fall off the viewport.
 *
 * Items are an input rather than projected content, so the component can own
 * `cdkMenuItem` itself. A caller therefore never imports anything from CDK,
 * which is what keeps the dependency replaceable.
 */
@Component({
  selector: 'app-dropdown',
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="dropdown__trigger" [cdkMenuTriggerFor]="menu">
      <ng-content />
    </button>

    <ng-template #menu>
      <div cdkMenu class="dropdown__menu" [attr.aria-label]="menuLabel() || null">
        @for (item of items(); track item.id) {
          <button
            type="button"
            cdkMenuItem
            class="dropdown__item"
            [attr.data-tone]="item.tone ?? 'default'"
            [disabled]="item.disabled ?? false"
            [attr.aria-current]="item.selected ? 'true' : null"
            (cdkMenuItemTriggered)="selected.emit(item.id)"
          >
            {{ item.label }}
          </button>
        }
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .dropdown__trigger {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border: var(--border-width) solid transparent;
      border-radius: var(--radius-md);
      background-color: transparent;
      color: var(--text-primary);
      cursor: pointer;
    }

    .dropdown__trigger:hover {
      background-color: var(--surface-hover);
    }

    /* The menu is rendered into the CDK overlay container, outside this
       component's element - but Angular stamps the emulated-encapsulation
       attribute onto template nodes wherever they end up, so these scoped
       rules still apply. */
    .dropdown__menu {
      display: flex;
      flex-direction: column;
      min-width: 12rem;
      padding: var(--space-1);
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-md);
      background-color: var(--surface-overlay);
      box-shadow: var(--shadow-md);
    }

    .dropdown__item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding: var(--space-2) var(--space-3);
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-primary);
      font-size: var(--text-md);
      text-align: start;
      white-space: nowrap;
      cursor: pointer;
    }

    .dropdown__item:hover:not(:disabled),
    .dropdown__item:focus-visible {
      background-color: var(--surface-hover);
    }

    .dropdown__item:disabled {
      color: var(--text-muted);
      cursor: not-allowed;
    }

    .dropdown__item[data-tone='danger'] {
      color: var(--danger-text);
    }

    /* The selected entry is marked for sighted users too; aria-current
       alone reaches only assistive technology. */
    .dropdown__item[aria-current='true']::after {
      content: '¹3';
    }
  `,
})
export class Dropdown {
  readonly items = input.required<readonly DropdownItem[]>();
  /** Accessible name for the menu itself, when the trigger's is not enough. */
  readonly menuLabel = input('');

  readonly selected = output<string>();
}
