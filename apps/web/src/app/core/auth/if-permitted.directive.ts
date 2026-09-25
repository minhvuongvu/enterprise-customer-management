import { Directive, effect, inject, input, TemplateRef, ViewContainerRef } from '@angular/core';
import type { Permission } from '@ecm/contracts';
import { SessionService } from './session.service';

/**
 * UI authorization: renders its content only for a user who holds the
 * permission.
 *
 *     <app-button *appIfPermitted="'CUSTOMER_DELETE'" ...>Delete</app-button>
 *
 * ## Hidden, not disabled
 *
 * An action the user can never perform is removed rather than shown greyed
 * out. A disabled button with no explanation reads as "broken" or "try again
 * later"; disabled is for conditions that change while the user watches - a
 * form still saving, nothing selected yet.
 *
 * ## Why a directive
 *
 * The same check guards the create button on the list, edit and delete on the
 * detail page and three bulk actions; a directive states it the same way in
 * each, and reacts when the session changes, because it reads a signal.
 *
 * **UX, not security.** Removing a button removes nothing from the API. The
 * server refuses the request whether or not the button was on screen, and the
 * feature's store refuses it before it is sent (action authorization).
 */
@Directive({ selector: '[appIfPermitted]' })
export class IfPermitted {
  readonly appIfPermitted = input.required<Permission>();

  private readonly session = inject(SessionService);
  private readonly template = inject<TemplateRef<unknown>>(TemplateRef);
  private readonly container = inject(ViewContainerRef);
  private rendered = false;

  constructor() {
    effect(() => {
      const allowed = this.session.hasPermission(this.appIfPermitted());
      if (allowed && !this.rendered) {
        this.container.createEmbeddedView(this.template);
        this.rendered = true;
      } else if (!allowed && this.rendered) {
        this.container.clear();
        this.rendered = false;
      }
    });
  }
}
