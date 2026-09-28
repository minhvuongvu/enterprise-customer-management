# Design system

The tokens, components and rules that make every page look and behave alike - and the
Phase 6 audit of them: what was consistent, what was not, and what changed.

The components live in `apps/web/src/app/shared/ui/` (their rules are in its README);
the tokens in `apps/web/src/styles/_tokens.scss` (ADR-0010).

---

## 1. Tokens

Two layers, and components may use only the second:

| Layer     | Examples                                                                         | Used by             |
| --------- | -------------------------------------------------------------------------------- | ------------------- |
| Primitive | `--palette-blue-600`, `--palette-red-400`                                        | `_tokens.scss` only |
| Semantic  | `--surface-raised`, `--text-muted`, `--accent`, `--danger-text`                  | every component     |
| Scale     | `--space-1…8` (4 px steps), `--text-xs…2xl`, `--radius-*`, `--motion-*`, `--z-*` | every component     |

**Colour roles** come in families, and each member has one job:

| Member            | Job                                                    | Example                     |
| ----------------- | ------------------------------------------------------ | --------------------------- |
| `--{tone}`        | a border or indicator (toast edge, invalid field, dot) | `--danger`                  |
| `--{tone}-subtle` | a tinted background                                    | badge, stale warning        |
| `--{tone}-text`   | text on the page or on the subtle background           | error message               |
| `--{tone}-solid`  | a filled surface carrying `--text-on-accent`           | danger button, unread count |
| `--accent`        | the solid for the primary tone                         | primary button              |

`--danger-solid` is new in Phase 6: the audit found the danger button filled with
`--danger` - fine in light, **2.6:1** in dark, because `--danger` lightens for dark
backgrounds and white text on it does not survive. Solids do not lighten in the dark
theme; indicators and text do.

**Enforced by `npm run lint`** (`lint/styles.ts`, ADR-0036): no literal colour and no
palette token outside `_tokens.scss`; no physical direction (`margin-left`, `left:`,
`text-align: right`); no `outline: none`. Debt row 10 - "enforced by review and a grep" -
is paid.

## 2. Components

| Component                            | States it has                                                                                                             | Phase 6 changes                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `app-button`                         | variant × size; hover; focus ring; **disabled**; **loading** (`aria-busy`, spinner); full width; renders `<a>` for `link` | danger uses `--danger-solid`                                                                                    |
| `app-text-input`                     | label, required, hint, **error** (`aria-invalid`, `aria-describedby`, `role=alert`), **disabled**                         | -                                                                                                               |
| `app-select`                         | the same contract as `app-text-input`                                                                                     | **gained `error` and `required`** - it had neither                                                              |
| `app-dropdown`                       | open/closed, keyboard, **disabled** items, danger items; `actions` or `choice`                                            | **`kind`** (`menuitemradio` + `aria-checked` for choices), **`itemSelected`** (was `selected`), item **`lang`** |
| `app-dialog`                         | open; focus trap; Escape; focus restore; bottom sheet on a phone                                                          | **locks page scroll**; output **`dismissed`** (was `closed`)                                                    |
| `app-table`                          | scroll region, labelled and focusable; sticky header                                                                      | **contains its content** (min-width, containing block)                                                          |
| `app-pagination`                     | current page, first/last disabled, windowed                                                                               | numbers **locale-formatted**                                                                                    |
| `app-badge`                          | tones by meaning: neutral, info, success, warning, danger                                                                 | -                                                                                                               |
| `app-empty-state`, `app-error-state` | heading + description + projected action / retry                                                                          | -                                                                                                               |
| `app-skeleton`, `app-spinner`        | decorative; the caller announces the wait                                                                                 | -                                                                                                               |
| `[appTooltip]`                       | CDK overlay, `aria-describedby`, disabled                                                                                 | -                                                                                                               |

`lockScrollWhile()` (`shared/ui/scroll-lock.ts`) is new: the dialog and the mobile drawer
both use it, which is its reason to be shared.

### State consistency

The audit checked each state across every component that has it:

- **Focus**: one global `:focus-visible` ring; no component removes it (now linted).
- **Disabled**: the native attribute everywhere (removes from the tab order, announced
  as unavailable); `cursor: not-allowed`; muted text. Buttons also dim.
- **Error**: `aria-invalid` + `--danger` border + a `--danger-text` message wired by
  `aria-describedby` - identical in the two field components since Phase 6.
- **Loading**: in place (`aria-busy`, a spinner in the button, a dimmed region) when
  there is something to show; a skeleton only when there is nothing yet.
- **Spacing**: fields `--space-1` between label, control and message; groups
  `--space-3`/`--space-4`; sections `--space-5`.
- **Typography**: labels `--text-sm` medium, hints and errors `--text-sm`, body
  `--text-md`, page title `--text-2xl`.

## 3. Component API review

What was checked for each input and output: naming, types, defaults, event semantics,
accessibility, composability.

| Finding                                                                                                                                                                            | Change                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `app-dropdown`'s `selected` output collided with `DropdownItem.selected`, a different meaning                                                                                      | Renamed `itemSelected` - the event, not a state                              |
| `app-dialog`'s `closed` read as "has closed"; it is the user asking to close                                                                                                       | Renamed `dismissed`, documented as a request the caller answers              |
| A menu of choices and a menu of actions had the same roles                                                                                                                         | `kind: 'actions' \| 'choice'`, explicit rather than inferred from `selected` |
| `app-select` and `app-text-input` disagreed on errors                                                                                                                              | One contract: `error` (translated string) and `required`                     |
| Labels are already-translated strings everywhere; ids are stable keys, never labels                                                                                                | Kept - it is what keeps `shared/ui` free of copy and business words          |
| Enum inputs (`variant`, `tone`, `size`, `kind`) are string unions with safe defaults                                                                                               | Kept                                                                         |
| Content is projected where callers need structure (`pageActions`, dialog body/actions), inputs where the component must own markup (`DropdownItem[]`, so it can own `cdkMenuItem`) | Kept - the split is deliberate                                               |

**Not merged, on purpose.** `DropdownItem` and `SelectOption` look alike (`id`/`value`,
`label`, `disabled`) and are not the same thing: one is an action or a choice in a
popup menu, the other an option of a form value. A shared type would couple a menu's
evolution (tone, `lang`, checked state) to a form control's. `app-empty-state` and
`app-error-state` are likewise separate: one is a normal outcome, the other a failure
with a retry. And the customer card list is a feature component, not a generic
"responsive table": its layout is decided by what a customer is.

## 4. Responsive behaviour

Three layouts, named by width not device (ADR-0011): phone below 48 rem, tablet to
64 rem, desktop above. `rem`, so a larger base font size counts as a narrower screen.

- **CSS decides presentation**: grids collapse to one column (forms, detail facts),
  dialogs become bottom sheets, action rows stack, page actions go full width.
- **TypeScript decides structure**, where the phone needs a different component
  (ADR-0034): table → cards, action buttons → primary + menu, filters → search +
  disclosure, header controls → drawer. `LayoutBreakpoints.mode()` is the switch.
- **No page scrolls sideways** at 375, 820 or 1280 px - tested on nine routes
  (`e2e/responsive.spec.ts`). Wide tables scroll inside their own labelled region.

## 5. Remaining gaps

| Gap                                                                            | Why                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| No checkbox component: native checkboxes, styled only by size where it matters | Native checkboxes are accessible as they are; a styled one needs a reason |
| No visual regression tests                                                     | Phase 7 (docs/testing-strategy.md)                                        |
| The detail page keeps five full-width buttons on a phone rather than a menu    | Each is a primary task on that page; measured as usable, not crowded      |
| Directional glyphs drawn in CSS (chevrons) would not mirror under `dir="rtl"`  | No RTL language ships; listed in docs/i18n.md                             |
| The i18n lint rule's allow-list grew to 18 (`app-dropdown[kind]`)              | Debt row 16                                                               |
