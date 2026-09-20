# shared/ui

Domain-agnostic presentation components. Inputs in, outputs out.

## What is here

| Component / directive | Selector          | Notes                                         |
| --------------------- | ----------------- | --------------------------------------------- |
| Button                | `app-button`      | Renders an `<a>` instead when given a `link`  |
| TextInput             | `app-text-input`  | `ControlValueAccessor`                        |
| Select                | `app-select`      | `ControlValueAccessor`, native `<select>`     |
| Badge                 | `app-badge`       | Tones named by meaning, not by colour         |
| Spinner               | `app-spinner`     | Decorative; the caller announces the wait     |
| Skeleton              | `app-skeleton`    | Decorative                                    |
| EmptyState            | `app-empty-state` | Renders an `<h2>`; it is a region, not a page |
| ErrorState            | `app-error-state` | Takes a message, never an error object        |
| Dialog                | `app-dialog`      | CDK focus trap, Escape, focus restore         |
| Dropdown              | `app-dropdown`    | CDK menu: roving focus, type-ahead, Escape    |
| Tooltip               | `[appTooltip]`    | CDK overlay; `aria-describedby`               |
| Pagination            | `app-pagination`  | 1-based pages; emits, never navigates         |
| Table                 | `app-table`       | Scroll region for a projected `<table>`       |

Each one is imported directly from its own folder. There is no barrel: a single
`index.ts` re-exporting thirteen components would pull all of them into every
lazy chunk that uses one.

## Rules

1. **No business vocabulary.** A component here must not know what a customer
   is. If it needs to, it belongs next to the feature that owns it.
2. **No data access and no feature state.** Nothing here injects an API client
   or a store.
3. **No component decides where to navigate.** Rendering a destination the
   caller passed in is fine and is why `app-button` accepts `link` — the caller
   still chooses the route. A hardcoded route inside this folder is not.
4. **Copy belongs to the caller.** Labels arrive already translated, as inputs.
   The exceptions are strings that belong to the mechanism rather than to the
   message — "Close the dialog", "Go to page 4" — which live under the `ui.*`
   translation namespace.
5. **Accessibility ships with the component, not after it.** Keyboard
   operation, a visible focus indicator, correct labelling and honest disabled
   semantics are part of the first version.
6. **Built on Angular CDK where CDK solves the hard part** — focus trap,
   overlay positioning, roving focus. Composition stays hand-written, so the
   structure is still visible and still teachable.
7. **A component moves here when a second caller actually needs it.** Until
   then it lives next to the feature that owns it. Moving it later is a rename;
   un-sharing it is not.

## Two conventions worth knowing

**Decorative glyphs are drawn from CSS**, never written as text in a template —
a chevron or a checkmark in the markup is a text node, and every text node in
this repository has to come from the translation layer.

**Styles use only semantic tokens** (`--surface-raised`, `--text-muted`), never
the palette and never a literal colour. That is what makes the dark theme one
attribute rather than a second stylesheet; see ADR-0010.
