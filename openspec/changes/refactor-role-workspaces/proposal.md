## Why

The single frontend component mixes authentication, group management, diner workflows, cook workflows, and all styling. The cook flow is difficult to follow and does not present all of today’s meals as one operational workspace.

## What Changes

- Split diner and cook workspaces into role-specific React components with shared API, date, meal, and UI utilities.
- Rebuild the cook workspace as today’s preparation board, followed by the day’s complete menu, grocery/action items, and leave controls.
- Replace preparation status selects with accessible prepared/not-prepared toggle controls and provide recipe-link buttons.
- Keep all existing authorization, attendance, feedback, membership, menu, and preparation behavior intact while deleting superseded UI code.
- Split component-scoped CSS into role and shared stylesheet modules.

## Non-goals

- Changing membership, attendance, or menu business rules.
- Adding third-party state-management or component libraries.

## Verification

- Add characterization tests for preparation status, recipe links, action items, and leave validation.
- Run type checks, lint, formatting, backend tests, and production builds after each migration step.
