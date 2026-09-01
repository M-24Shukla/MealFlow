## 1. Characterize current behavior

- [x] 1.1 Add tests for the two-state preparation update, recipe-link availability, action-item completion, and leave date validation.
- [x] 1.2 Run baseline backend/frontend verification.

## 2. Shared frontend foundation

- [x] 2.1 Extract API client, date/meal helpers, and shared domain types.
- [x] 2.2 Extract common daily menu and action-item UI primitives.
- [x] 2.3 Split shared, diner, cook, and administration CSS.

## 3. Role workspaces

- [x] 3.1 Extract the diner workspace without changing attendance or feedback behavior.
- [x] 3.2 Extract the cook workspace with today’s all-meal preparation view, recipe controls, grocery/actions, and leave range controls.
- [x] 3.3 Remove obsolete App component state, handlers, styles, and imports.

## 4. Verification

- [x] 4.1 Verify each extraction incrementally with builds, lint, formatting, and tests.
- [x] 4.2 Verify no stale status selector, IN_PROGRESS UI, or unused code remains.
