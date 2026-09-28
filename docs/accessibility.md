# Accessibility

What the application does for people who use a keyboard, a screen reader, a phone,
magnification, or a preference for less motion - how that was checked in Phase 6, what
the audit found, what was fixed, and what is still open.

Accessibility is designed into each component (see `shared/ui/README.md`, rule 5), so
most of this document is about **verification**: the guarantees, and the tests that
hold them.

---

## 1. How it is checked

| Check                  | Where                                          | Covers                                                                                         |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Automated audit (axe)  | `e2e/accessibility.spec.ts`                    | every route, light and dark; open dialog, menu, notification panel, form errors, mobile drawer |
| Keyboard-only journeys | `e2e/keyboard.spec.ts`                         | sign-in, skip link, navigation, menus, sort, pagination, selection, dialog trap, form, toasts  |
| Layout at three widths | `e2e/responsive.spec.ts`, `e2e/layout.spec.ts` | no sideways scroll; drawer; cards; scroll lock                                                 |
| Component contracts    | `*.spec.ts` next to each component             | labels, `aria-describedby`, `aria-invalid`, roles, checked states                              |
| Style rules            | `lint/styles.ts`                               | the focus outline is never removed; logical directions (RTL readiness)                         |
| Template rules         | `apps/web/eslint.config.js`                    | angular-eslint's accessibility rule set; no hardcoded text in templates or attributes          |

**The axe gate.** Every WCAG 2.2 A/AA rule plus axe's best-practice rules run on every
route. `critical` and `serious` violations fail the build. `moderate` and `minor` are
attached to the test report and listed in section 4 - each is fixed or explained, never
silently accepted. axe finds perhaps a third of real problems; the keyboard suite and the
manual notes below are the rest.

**Result at `phase-6-complete`**: 64 audited states, **zero critical or serious**
violations, one moderate finding (section 4).

---

## 2. Findings and fixes

What the Phase 6 audit and keyboard pass found. Every one of these was a real defect in
the Phase 5 build.

| #   | Found by         | Problem                                                                                                 | Fix                                                                                                                         |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | axe, dark theme  | The danger button was red-400 behind white text: **2.6:1** (AA needs 4.5:1)                             | `--danger-solid` token, unchanged across themes, for filled danger surfaces; also used by the unread badge                  |
| 2   | keyboard pass    | After a navigation focus stayed on the pressed link, or fell to `<body>`; nothing was announced         | Focus moves to the new page's `<h1>` on a path change (ADR-0037)                                                            |
| 3   | keyboard pass    | Changing page or sort destroyed the focused control behind a skeleton; focus fell to `<body>`           | The list page returns focus to the control's counterpart once those results render (ADR-0037)                               |
| 4   | keyboard pass    | A failed save left focus on the button at the bottom of the form                                        | Focus moves to the first invalid field; its error is read through `aria-describedby`                                        |
| 5   | component review | Theme menu marked the chosen option with `aria-current` - not a menu item state                         | `app-dropdown` `kind="choice"` renders `menuitemradio` with `aria-checked`: "Dark, radio, checked, 2 of 3"                  |
| 6   | component review | `app-select` had no error state: a server rejection of gender or status was invisible                   | `error` and `required` inputs with the same wiring as `app-text-input` (`aria-invalid`, `aria-describedby`, `role="alert"`) |
| 7   | debt row 23      | Toasts vanished after 5 s even while being read or focused (WCAG 2.2.1)                                 | Pointer over or focus inside the toast region holds every timer; each resumes with its remaining time, never less than 2 s  |
| 8   | debt row 9       | The page scrolled behind an open dialog and behind the mobile drawer                                    | `lockScrollWhile()` (CDK block strategy) for both                                                                           |
| 9   | responsive check | `.visually-hidden` text inside a table cell escaped the scroll region; the phone page scrolled sideways | `app-table`'s region is the containing block (`position: relative`)                                                         |
| 10  | responsive check | On a phone the header held nine controls and scrolled the page sideways                                 | Language, theme, user and sign-out move into the drawer's labelled "Account and preferences" region                         |
| 11  | i18n review      | The language switcher's option names had no `lang`: "Tiếng Việt" read with an English voice             | `DropdownItem.lang`; each option carries its own language                                                                   |
| 12  | i18n review      | `<html dir>` was never set                                                                              | Written from the language definition with `lang` (all `ltr` today)                                                          |

## 3. The guarantees, by area

**Semantics and headings.** One `<h1>` per page, from `app-page-header`; sections under it
are `<h2>` (`app-lab-section`, `app-empty-state`, form sections). Landmarks: `banner`,
`navigation` ("Primary", "Breadcrumb", "Pages"), `main`, and named regions for results,
filters and the drawer's account section. The rendering specimens are public pages
outside the shell and have their own `<main>`.

**Labels and form errors.** Every control has a real `<label for>`. Hints and errors are
wired through `aria-describedby` - only to elements that exist, because a reference to a
missing id silences some screen readers entirely. An invalid field has
`aria-invalid="true"`; its message has `role="alert"`, so it is announced when it appears.
Required fields are `required` in the DOM and carry a decorative asterisk
(`aria-hidden`). Server rejections are shown in the same words as client ones (ADR-0035).

**Keyboard.** Everything is reachable by Tab, in DOM order, with a visible focus ring
(`:focus-visible`, never removed - `lint/styles.ts` enforces it). The skip link is the
first stop. Menus use CDK: arrow keys, type-ahead, Escape, focus returned to the trigger.
Dialogs and the mobile drawer trap focus, close on Escape, and give focus back. Focus
moves on navigation and after a failed save, and is restored when a re-render destroys
the focused control (ADR-0037).

**Dialogs.** `role="dialog"`, `aria-modal="true"`, labelled by their heading; focus
trapped by CDK; the page behind does not scroll. Dismissing by clicking outside is a real
button placed _after_ the dialog, so it is the last Tab stop, not the first.

**Tables.** Real `<table>` with a caption, `scope="col"` headers, `aria-sort` on the
sortable header and a `<button>` inside it. Wide tables scroll inside a focusable,
labelled region. On a phone the list is a `<ul>` of cards instead (ADR-0034) - a list,
announced as one, with every value labelled by a `<dt>`.

**Pagination.** A `<nav>` named "Pages"; the current page has `aria-current="page"`;
every button has an explicit name ("Go to page 4"); page numbers are locale-formatted.

**Notifications and status.** Two live regions exist before anything is put in them -
`polite` for news and confirmations, `assertive` for failures. Loading states are a
`role="status"` sentence plus `aria-busy` on the region; decorative spinners and
skeletons are hidden from assistive technology. The bell's accessible name carries the
unread count.

**Contrast.** Every text token clears 4.5:1 against the surface it is used on, in both
themes; the axe run over every route in both themes is the check. Filled surfaces that
carry white text (`--accent`, `--danger-solid`) do not lighten in the dark theme.

**Reduced motion.** Every duration comes from a token, and `prefers-reduced-motion`
collapses all transitions and animations to 0.01 ms in one rule (not `none`, so
`transitionend` still fires). Tested both ways in `accessibility.spec.ts`.

**Touch targets.** Header and toolbar buttons are at least 36 px; on a phone the card
checkboxes are 20 px with the whole row as spacing, and filter and sort controls are
44 px tall. axe's `target-size` (WCAG 2.2 AA) passes on every route.

**Language.** `<html lang>` follows the active language, so a screen reader picks the
right voice; foreign-language text (the language names) carries its own `lang`.

## 4. Remaining issues

Documented, not hidden. Each has a reason and an owner.

| Issue                                                                                     | Impact        | Why it is still open                                                                                                                                                    | Owner    |
| ----------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| axe `region`: the CDK overlay container (open menus, tooltips) sits outside any landmark  | moderate      | CDK appends it to `<body>`. The popup is owned by its trigger (`aria-haspopup`/`aria-expanded`) and exists only while open; moving it needs a custom `OverlayContainer` | accepted |
| `aria-modal` is the only thing hiding the page behind a dialog from a screen reader       | none measured | Supported by current NVDA, JAWS, VoiceOver and TalkBack; `inert` on the rest of the shell would be belt-and-braces, and needs a coordination service                    | Phase 8  |
| Native `<input type="date">` uses the _browser's_ language and date order, not the page's | usability     | No web API sets it. The value (ISO) is right in every locale; only its presentation differs                                                                             | accepted |
| `beforeunload` shows the browser's own "Leave site?" dialog, in the browser's language    | usability     | Browsers ignore custom text there by design (anti-phishing); the in-app leave dialog _is_ translated                                                                    | accepted |
| No manual screen-reader test with a real reader was recorded in this phase                | unknown       | The environment has no screen reader. The semantics are asserted by role and name in the E2E suite, which is what a reader consumes                                     | Phase 8  |
| Firefox and WebKit have not been run                                                      | unknown       | `E2E_BROWSERS=all` configures them; the sandbox could not download them (debt row 28)                                                                                   | Phase 7  |
| The drawer's scroll lock and the dialog's are two independent locks                       | none today    | They never overlap (a confirmation cannot be asked while the drawer is open); if they did, CDK's block strategy would restore the first unlock's state early            | accepted |
| Colour is not the only signal, but the status badge tone is decorative                    | none          | The badge's text says the status; its colour is redundant by design                                                                                                     | -        |

## 5. When adding UI

1. Use the `shared/ui` component if one exists; its accessibility is already tested.
2. A new interactive pattern gets a line in `keyboard.spec.ts`; a new route gets a line in
   `accessibility.spec.ts`'s route list.
3. Never set `outline: none`; never use a `<div>` with a click handler (lint rejects it).
4. A control that can be destroyed by what it triggers must say where focus goes next.
