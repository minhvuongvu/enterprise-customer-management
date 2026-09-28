import { CdkMenu, CdkMenuItem, CdkMenuItemRadio, CdkMenuTrigger } from '@angular/cdk/menu';
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
  /**
   * The language the label is written in, when it differs from the page's -
   * a language switcher's "Tiếng Việt" on an English page. Screen readers
   * switch voice on it.
   */
  readonly lang?: string;
  /**
   * In a `choice` menu, marks the option currently in effect - the active
   * theme, the active language. Ignored in an `actions` menu.
   */
  readonly selected?: boolean;
}

/**
 * What the menu is for, which decides the role of its items.
 *
 *  - `actions` - each item does something (`menuitem`);
 *  - `choice`  - the items are mutually exclusive options and one of them is
 *                in effect (`menuitemradio` with `aria-checked`).
 *
 * A screen reader announces the second as "Dark, radio, checked, 2 of 3" -
 * which is the whole state of the control. Phase 1 marked the chosen item
 * with `aria-current`, which is not a supported state for a menu item and
 * was read out inconsistently or not at all.
 */
export type DropdownKind = 'actions' | 'choice';

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
  imports: [CdkMenu, CdkMenuItem, CdkMenuItemRadio, CdkMenuTrigger],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="dropdown__trigger" [cdkMenuTriggerFor]="menu">
      <ng-content />
    </button>

    <ng-template #menu>
      <div cdkMenu class="dropdown__menu" [attr.aria-label]="menuLabel() || null">
        @for (item of items(); track item.id) {
          @if (kind() === 'choice') {
            <button
              type="button"
              cdkMenuItemRadio
              class="dropdown__item"
              [cdkMenuItemChecked]="item.selected ?? false"
              [attr.lang]="item.lang ?? null"
              [disabled]="item.disabled ?? false"
              (cdkMenuItemTriggered)="itemSelected.emit(item.id)"
            >
              {{ item.label }}
            </button>
          } @else {
            <button
              type="button"
              cdkMenuItem
              class="dropdown__item"
              [attr.data-tone]="item.tone ?? 'default'"
              [attr.lang]="item.lang ?? null"
              [disabled]="item.disabled ?? false"
              (cdkMenuItemTriggered)="itemSelected.emit(item.id)"
            >
              {{ item.label }}
            </button>
          }
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

    /* The checked option is marked for sighted users too; aria-checked
       alone reaches only assistive technology. */
    .dropdown__item[aria-checked='true']::after {
      content: '¹3';
    }
  `,
})
export class Dropdown {
  readonly items = input.required<readonly DropdownItem[]>();
  /** Accessible name for the menu itself, when the trigger's is not enough. */
  readonly menuLabel = input('');
  readonly kind = input<DropdownKind>('actions');

  /**
   * The id of the item the user activated. Named for the event, not the
   * state: `selected` read like a property and collided with
   * `DropdownItem.selected`, which means something else.
   */
  readonly itemSelected = output<string>();
}
