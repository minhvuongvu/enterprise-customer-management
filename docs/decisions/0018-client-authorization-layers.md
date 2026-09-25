# ADR-0018 — Authorization in the client: route, UI and action, all permission-based, none of them security

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 3

## Problem

The context document (3.2) requires authorization to be visible at four
levels: route access, UI visibility, action availability and API enforcement.
The last one already exists - the mock API checks the role's permission on
every request, and its tests prove it with no UI involved. Phase 3 has to add
the first three to the client without ever implying that they protect anything.

Three questions have to be answered: what the client checks against, where
each check lives, and what the user sees when a check fails.

## Options considered

### What to check: roles or permissions

- **Roles** (`user.role === 'ADMIN'`): short, and wrong as soon as a fourth role
  exists - every check has to be found and edited.
- **Permissions** (`hasPermission('CUSTOMER_DELETE')`): what the code actually
  means. Adding a role is a change to the matrix in `@ecm/contracts`, and no
  call site moves.

### Where the permissions come from

- **Compute them from the role** with `permissionsForRole()` - it is in the
  shared contracts, so the client could.
- **Read them from the session response**, where the server put them.

### What a denied control looks like

- **Disabled**: visible, inert.
- **Hidden**: absent.

## Decision

Permissions, **read from the server's response and never computed by the
client**. A client that derived its own permissions would be deciding what it
is allowed to do.

Three client-side layers, each one explicit:

| Layer  | Mechanism                                                 | On denial                                              |
| ------ | --------------------------------------------------------- | ------------------------------------------------------ |
| Route  | `requirePermission(p)` functional guard, stated per route | render `/forbidden`, address bar keeps the refused URL |
| UI     | `*appIfPermitted="p"` structural directive                | the control is not rendered                            |
| Action | `CustomerStore` refuses the write before sending it       | an `authorization` `AppError`, no request              |
| API    | `requirePermission` middleware on the mock server         | `403 FORBIDDEN` - **the only one that is security**    |

Route rules: reading (`CUSTOMER_READ`) is required once on the customers
section's parent route; `/customers/new` also requires `CUSTOMER_CREATE`, and
`/customers/:id/edit` requires `CUSTOMER_UPDATE`. `authGuard` stays on the
shell - it answers "is anyone signed in", not "may they do this".

Denied actions are **hidden, not disabled**. Disabled means "not now" - a form
still saving, nothing selected. An action the user can never take is removed;
a greyed-out button with no explanation reads as a malfunction. The header shows
the user's role so a manager who sees no delete button can tell why.

The forbidden page uses `RedirectCommand` with `browserUrl`, so it is
rendered while the address bar shows the URL that was refused.
`skipLocationChange` was tried first and is wrong for this: on an in-app
navigation it leaves the _previous_ page's URL in the address bar above
content that says something else. The unit test caught it.

## Reason

The action layer looks redundant next to the UI layer, and the difference is
the reason it exists. A hidden button is one route to an action. A bulk bar, a
keyboard shortcut or a future menu entry are others. A check in the store is
the one place every route passes, so a new control cannot forget it.

None of the three is a security boundary, and each is documented as such where
it is defined. Someone who edits the bundle gets past all three and meets the
API's 403 - which `e2e/auth.spec.ts` asserts by calling the API directly as a
manager.

## Consequences

- Every new write needs a permission named in three places - the route (if it
  has one), the control, the store method - and the server. The route config
  test in `app.routes.spec.ts` asserts the write routes carry a guard.
- `IfPermitted` reads a signal, so a session that changes - a sign-out, a
  refresh that returns different permissions - updates the UI without a
  reload.
- A viewer has no row checkboxes: selection exists only to feed bulk actions.

## Revisit when

- permissions depend on the _record_ (for example "may edit customers in my
  region") - the client then cannot decide from the session alone, and the UI
  layer has to ask the server or accept being wrong more often;
- a denied action needs explaining in place, which would bring back a
  disabled-with-reason state for that one control.
