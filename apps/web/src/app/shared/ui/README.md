# shared/ui

Domain-agnostic presentation components: Button, Input, Dialog, Table primitives
and so on.

**Empty on purpose in Phase 0.** The design system is Phase 1's deliverable, and
a shared component invented before two features need it is how a shared folder
turns into a junk drawer.

Rules for anything added here:

- No business vocabulary. A component in this folder must not know what a
  customer is.
- No data access, no router navigation, no feature state. Inputs in, outputs
  out.
- Accessibility is part of the component, not a later pass: keyboard operation,
  focus visibility, labelling and disabled semantics ship with it.
- Built on Angular CDK where CDK solves the hard part (focus trap, overlay
  positioning, virtual scroll). Composition stays hand-written.
- A component moves here only when a second feature actually needs it. Until
  then it lives next to the feature that owns it.
